import { SUBMISSION_CONFIG } from '../../config/submission';
import { SubmissionRepo } from '../repo/submissionRepo';
import { SubmissionFailure } from './failure';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 投稿の件数の上限（requirements 3.8）。
 * - 保存中の総数（全セッション）が上限以上なら、新規の投稿を一時停止する（503・storage_paused）。
 * - セッションの 1 日の件数（UTC 0 時で数え直す）が上限以上なら 429（daily_limit_reached）。
 * 1 日の始まりは UTC 0 時で、JST では 9 時に当たる。行の時刻は JST の文字列のため、比べる値も JST の文字列にする。
 */
export class SubmissionQuota {
  constructor(
    private readonly repo: SubmissionRepo,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** 今日（UTC の日付）の始まりを、JST の文字列（+09:00）で返す。 */
  static utcDayStartJst(now: Date): string {
    const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const jst = new Date(utcMidnight + JST_OFFSET_MS);
    const pad = (value: number): string => String(value).padStart(2, '0');
    const date = `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}`;
    const time = `${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}:${pad(jst.getUTCSeconds())}`;
    return `${date}T${time}+09:00`;
  }

  /** 挿入の SQL に渡す、上限の値と 1 日の始まり。 */
  limits(): { readonly sinceJst: string; readonly maxTotal: number; readonly maxPerSession: number } {
    return {
      sinceJst: SubmissionQuota.utcDayStartJst(this.clock()),
      maxTotal: SUBMISSION_CONFIG.maxSavedSubmissions,
      maxPerSession: SUBMISSION_CONFIG.dailySubmissionsPerSession,
    };
  }

  /** 挿入が上限で止まった後に、どの上限かを調べて、返す失敗を作る。 */
  async denial(): Promise<SubmissionFailure> {
    if ((await this.repo.countAll()) >= SUBMISSION_CONFIG.maxSavedSubmissions) {
      return new SubmissionFailure('storage_paused', 503);
    }
    return new SubmissionFailure('daily_limit_reached', 429);
  }

  /** 新規の投稿を受け付けてよいかを早めに確かめる（最終の判定は、挿入の SQL 文の条件で行う）。上限に達していれば、対応する失敗を投げる。 */
  async assertAccepting(sessionHash: string): Promise<void> {
    if ((await this.repo.countAll()) >= SUBMISSION_CONFIG.maxSavedSubmissions) {
      throw new SubmissionFailure('storage_paused', 503);
    }
    const since = SubmissionQuota.utcDayStartJst(this.clock());
    if ((await this.repo.countSessionSince(sessionHash, since)) >= SUBMISSION_CONFIG.dailySubmissionsPerSession) {
      throw new SubmissionFailure('daily_limit_reached', 429);
    }
  }
}
