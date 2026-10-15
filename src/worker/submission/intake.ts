import type { WorkerBindings } from '../env';
import { CLASSIFIER_CONFIG } from '../../config/classifier';
import { SUBMISSION_DEV_MESSAGES } from '../../config/strings/submission';
import type { CheckSummary, RejectionReason } from '../../core/api/contract';
import { DuplicateChecker, type SubmissionForDuplicate } from '../../core/validation/duplicateChecker';
import { REASON } from '../../core/validation/reasonCodes';
import { seasonOfMonth } from '../../core/validation/validator';
import type { CheckResult, SubjectHintResult } from '../../core/types';
import { CampaignRepo } from '../repo/campaignRepo';
import { SubmissionRepo, subjectToStoredCheck, toStoredCheck, type NewSubmissionRecord } from '../repo/submissionRepo';
import { subjectHintFactory } from '../ai/subjectHintFactory';
import { SubmissionFailure } from './failure';
import { SubmissionImageGate } from './imageGate';
import { SubmissionMetaParser, type BrowserCheck } from './meta';
import { MultipartReader } from './multipart';
import { SubmissionQuota } from './quota';

/** 投稿の受け付けの応答（保存した投稿の ID・状態・判定結果・被写体の推定（補助））。 */
export interface SubmissionAccepted {
  readonly id: string;
  readonly status: 'pending_review';
  readonly checks: readonly CheckSummary[];
  readonly subject: SubjectHintResult;
}

/** JPEG のバイト列を base64 の data URL にする。大きな配列でも引数の上限に当たらないよう、分けて変換する。 */
function toJpegDataUrl(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let start = 0; start < bytes.length; start += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(start, start + chunkSize));
  }
  return `${CLASSIFIER_CONFIG.thumbDataUrlPrefix}${btoa(binary)}`;
}

/**
 * 投稿の受け取りと検証（requirements 3.2・3.3・3.4・3.8、8 章）。順序は次のとおり。
 * 1 ハニーポット、2 保存中の総数、3 セッションの 1 日の件数、4 meta、5 マスの募集、6 保存用の画像、7 分類用の縮小画像、
 * 8 ブラウザの不合格、9 重複（同一画像・同一地点）。そのあと被写体の推定（失敗しても止めない）と、1 回の batch での保存。
 * 不合格は保存せず、SubmissionFailure を投げる。Worker は画像を再エンコードしない。
 */
export class SubmissionIntake {
  constructor(
    private readonly reader: MultipartReader = new MultipartReader(),
    private readonly parser: SubmissionMetaParser = new SubmissionMetaParser(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async accept(request: Request, env: WorkerBindings, sessionHash: string): Promise<SubmissionAccepted> {
    const form = await this.reader.read(request);
    if (form.honeypotFilled) {
      throw new SubmissionFailure('invalid_request', 400);
    }
    const repo = new SubmissionRepo(env.DB);
    const quota = new SubmissionQuota(repo, this.clock);
    await quota.assertAccepting(sessionHash);
    const meta = this.parser.parse(form.metaJson);

    const cell = await repo.findCellContext(sessionHash, meta.cellId);
    if (cell === null) {
      throw new SubmissionFailure('invalid_request', 400);
    }
    if (cell.accepted >= cell.required) {
      throw new SubmissionFailure('cell_closed', 409);
    }
    if (meta.resubmittedFrom !== null && !(await repo.isResubmittable(sessionHash, meta.resubmittedFrom))) {
      throw new SubmissionFailure('invalid_state', 409);
    }

    const rule = await new CampaignRepo(env.DB).readAcceptRule(sessionHash);
    if (rule === null) {
      throw new Error(SUBMISSION_DEV_MESSAGES.errorRuleMissing);
    }
    const gate = new SubmissionImageGate(rule);
    gate.checkSaved(form.image);
    gate.checkThumb(form.thumb);
    this.rejectIfBrowserFailed(meta.checks);

    const id = crypto.randomUUID();
    const existing = await repo.listForDuplicate(sessionHash, meta.resubmittedFrom);
    const candidate: SubmissionForDuplicate = {
      id,
      sessionId: sessionHash,
      municipality: cell.areaLabel,
      season: seasonOfMonth(meta.shotMonth),
      spotName: meta.spotName,
      phash: meta.phash,
    };
    const duplicates = new DuplicateChecker(rule).check(
      candidate,
      existing.map((row) => ({
        id: row.id,
        sessionId: sessionHash,
        municipality: row.areaLabel,
        season: seasonOfMonth(row.shotMonth),
        spotName: row.spotName,
        phash: row.phash,
      })),
    );
    const duplicateFailures = duplicates.checks.filter((check) => check.verdict === 'fail');
    if (duplicateFailures.length > 0) {
      throw new SubmissionFailure('submission_rejected', 400, this.reasonsOf(duplicateFailures));
    }

    const browserChecks: CheckResult[] = this.withSeasonCheck(meta.checks, meta.shotMonth, cell.periodMonths);
    const checks = [...browserChecks, ...duplicates.checks];
    const record: NewSubmissionRecord = {
      id,
      sessionHash,
      cellId: meta.cellId,
      shotMonth: meta.shotMonth,
      spotName: meta.spotName,
      caption: meta.caption,
      image: form.image,
      phash: meta.phash,
      declaredOriginal: meta.declaredOriginal,
      consent: meta.consent,
      resubmittedFrom: meta.resubmittedFrom,
    };
    // 上限の判定と挿入は 1 つの SQL 文。挿入できたことを確かめてから、AI を呼ぶ（上限に当たった要求は AI を呼ばない）。
    const reserved = await repo.reserveSubmission(record, checks.map(toStoredCheck), quota.limits());
    if (!reserved) {
      throw await quota.denial();
    }
    const subject = await subjectHintFactory(env).suggest(toJpegDataUrl(form.thumb), meta.caption, meta.shotMonth);
    await repo.addCheck(sessionHash, id, subjectToStoredCheck(subject));
    return {
      id,
      status: 'pending_review',
      checks: checks.map((check) => ({ item: check.item, verdict: check.verdict, reasonCode: check.reasonCode })),
      subject,
    };
  }

  /**
   * 撮影月がマスの期間の月に含まれなければ、季節が合わないとして「要確認」にする（不合格ではない）。
   * ブラウザが shoot_month_season を合格にしていた場合だけ置き換える（不合格や別の要確認は変えない）。
   */
  private withSeasonCheck(checks: readonly BrowserCheck[], shotMonth: number, periodMonths: readonly number[]): CheckResult[] {
    const mismatch = !periodMonths.includes(shotMonth);
    return checks.map((check) => {
      if (mismatch && check.item === 'shoot_month_season' && check.verdict === 'pass') {
        return { item: check.item, verdict: 'review', reasonCode: REASON.SHOOT_MONTH_MISMATCH };
      }
      return { item: check.item, verdict: check.verdict, reasonCode: check.reasonCode };
    });
  }

  /** ブラウザの判定に不合格が 1 つでもあれば、理由をつけて拒否する。 */
  private rejectIfBrowserFailed(checks: readonly BrowserCheck[]): void {
    const failed = checks.filter((check) => check.verdict === 'fail');
    if (failed.length > 0) {
      throw new SubmissionFailure('submission_rejected', 400, this.reasonsOf(failed));
    }
  }

  private reasonsOf(checks: readonly { readonly item: RejectionReason['item']; readonly reasonCode: string }[]): RejectionReason[] {
    return checks.map((check) => ({ item: check.item, reasonCode: check.reasonCode }));
  }
}
