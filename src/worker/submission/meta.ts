import { LIMITS } from '../../config/limits';
import { BROWSER_CHECK_ITEMS, BROWSER_VERDICTS, SUBMISSION_CONFIG } from '../../config/submission';
import { REASON } from '../../core/validation/reasonCodes';
import type { CheckItem } from '../../core/types';
import { SubmissionFailure } from './failure';

/** ブラウザが送った 1 件の判定結果。 */
export interface BrowserCheck {
  readonly item: (typeof BROWSER_CHECK_ITEMS)[number];
  readonly verdict: (typeof BROWSER_VERDICTS)[number];
  readonly reasonCode: string;
}

/** 投稿の情報（meta の JSON）を検証した後の値。位置情報と機種情報は含めない。 */
export interface SubmissionMeta {
  readonly cellId: string;
  readonly shotMonth: number;
  /** 地点名（前後の空白を除いた値。空欄は空の文字列）。 */
  readonly spotName: string;
  readonly caption: string;
  readonly phash: string;
  readonly checks: readonly BrowserCheck[];
  /** 申告と同意。検証の後は必ず true（false は declaration_required で拒否する）。 */
  readonly declaredOriginal: boolean;
  readonly consent: boolean;
  /** 再投稿の元の投稿の ID。無ければ null。 */
  readonly resubmittedFrom: string | null;
}

const REASON_CODES: ReadonlySet<string> = new Set(Object.values(REASON));
const BROWSER_ITEMS: ReadonlySet<CheckItem> = new Set<CheckItem>(BROWSER_CHECK_ITEMS);
const BROWSER_VERDICT_SET: ReadonlySet<string> = new Set<string>(BROWSER_VERDICTS);

/**
 * meta（JSON 文字列）の検証。形が違えば invalid_request、申告が満たされなければ declaration_required にする。
 * 地点名・説明文は、文字数（コードポイント数）と制御文字で確かめる。HTML として扱わない（テキストとして保存する）。
 */
export class SubmissionMetaParser {
  parse(raw: string): SubmissionMeta {
    const value = this.parseJson(raw);
    const cellId = this.idField(value.cellId);
    const shotMonth = this.monthField(value.shotMonth);
    const spotName = this.textField(value.spotName, LIMITS.spotNameMaxChars);
    const caption = this.textField(value.caption, LIMITS.captionMaxChars);
    const phash = this.phashField(value.phash);
    const checks = this.checksField(value.checks);
    const resubmittedFrom = this.optionalIdField(value.resubmittedFrom);
    if (value.declaredOriginal !== true || value.consent !== true) {
      if (typeof value.declaredOriginal !== 'boolean' || typeof value.consent !== 'boolean') {
        throw new SubmissionFailure('invalid_request', 400);
      }
      throw new SubmissionFailure('declaration_required', 400);
    }
    return { cellId, shotMonth, spotName, caption, phash, checks, declaredOriginal: true, consent: true, resubmittedFrom };
  }

  private parseJson(raw: string): Record<string, unknown> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new SubmissionFailure('invalid_request', 400);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new SubmissionFailure('invalid_request', 400);
    }
    return parsed as Record<string, unknown>;
  }

  private idField(value: unknown): string {
    if (typeof value !== 'string' || value.length === 0 || value.length > SUBMISSION_CONFIG.idMaxChars) {
      throw new SubmissionFailure('invalid_request', 400);
    }
    return value;
  }

  private optionalIdField(value: unknown): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    return this.idField(value);
  }

  private monthField(value: unknown): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 12) {
      throw new SubmissionFailure('invalid_request', 400);
    }
    return value;
  }

  private textField(value: unknown, maxChars: number): string {
    if (typeof value !== 'string') {
      throw new SubmissionFailure('invalid_request', 400);
    }
    const text = value.trim();
    if (Array.from(text).length > maxChars || SUBMISSION_CONFIG.controlCharPattern.test(text)) {
      throw new SubmissionFailure('invalid_request', 400);
    }
    return text;
  }

  private phashField(value: unknown): string {
    if (typeof value !== 'string' || !SUBMISSION_CONFIG.phashPattern.test(value)) {
      throw new SubmissionFailure('invalid_request', 400);
    }
    return value.toLowerCase();
  }

  private checksField(value: unknown): BrowserCheck[] {
    if (!Array.isArray(value) || value.length === 0 || value.length > SUBMISSION_CONFIG.checksMax) {
      throw new SubmissionFailure('invalid_request', 400);
    }
    const checks = value.map((entry) => this.checkEntry(entry));
    const sent = new Set<string>(checks.map((check) => check.item));
    if (sent.size !== checks.length || BROWSER_CHECK_ITEMS.some((item) => !sent.has(item))) {
      throw new SubmissionFailure('invalid_request', 400);
    }
    return checks;
  }

  private checkEntry(entry: unknown): BrowserCheck {
    if (typeof entry !== 'object' || entry === null) {
      throw new SubmissionFailure('invalid_request', 400);
    }
    const { item, verdict, reasonCode } = entry as Record<string, unknown>;
    if (typeof item !== 'string' || !BROWSER_ITEMS.has(item as CheckItem)) {
      throw new SubmissionFailure('invalid_request', 400);
    }
    if (typeof verdict !== 'string' || !BROWSER_VERDICT_SET.has(verdict)) {
      throw new SubmissionFailure('invalid_request', 400);
    }
    if (typeof reasonCode !== 'string' || !REASON_CODES.has(reasonCode)) {
      throw new SubmissionFailure('invalid_request', 400);
    }
    return {
      item: item as BrowserCheck['item'],
      verdict: verdict as BrowserCheck['verdict'],
      reasonCode,
    };
  }
}
