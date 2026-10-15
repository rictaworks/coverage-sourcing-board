import type { SubjectHint, SubjectKind } from '../../core/types';
import { CLASSIFIER_CONFIG, SUBJECT_KINDS } from '../../config/classifier';
import { SUBJECT_HINT_ERRORS, SUBJECT_HINT_STRINGS } from '../../config/strings/subjectHint';
import { CallLedger, estimateCostUsd } from '../../core/ledger/callLedger';
import { inspectJpeg } from '../../core/jpeg/jpegInspector';
import { DebugTracer } from '../../core/trace';
import type { TraceFields } from '../../core/trace';

/** clef-flash への要求（SPEC/subject-hint.md）。 */
export interface ClefRequest {
  readonly model: string;
  readonly images: readonly string[];
  readonly state: { readonly caption: string; readonly shot_month: number };
  readonly questions: {
    readonly subject: {
      readonly type: 'choice';
      readonly instructions: string;
      readonly criteria: Readonly<Record<SubjectKind, string>>;
    };
  };
}

/** AI の実行の約束。実装は Workers AI のバインディング（WorkersAiClefRunner）。テストでは代役に差し替える。 */
export interface ClefRunner {
  run(model: string, input: ClefRequest): Promise<unknown>;
}

/**
 * 被写体の推定の結果。SubjectHintResult（推定・推定なし）の拡張で、理由と表示の文言を含む。
 * 推定できないときは、理由（上限・失敗）を区別する。投稿は止めない。
 */
export type ClefSubjectHintResult =
  | {
      readonly status: 'estimated';
      readonly kind: SubjectKind;
      readonly confidence: number;
      readonly model: string;
      readonly uncertain: boolean;
      readonly notice: string | null;
    }
  | {
      readonly status: 'none';
      readonly reason: 'limit' | 'failure';
      readonly notice: string;
      readonly resumeNotice: string | null;
    };

export interface ClefSubjectHintOptions {
  readonly runner: ClefRunner;
  readonly ledger: CallLedger;
  readonly tracer: DebugTracer;
  readonly timeoutMs?: number;
}

/** AI のバインディング（env.AI）を、ClefRunner の約束に合わせる。 */
export class WorkersAiClefRunner implements ClefRunner {
  constructor(private readonly ai: Ai) {}

  run(model: string, input: ClefRequest): Promise<unknown> {
    return this.ai.run(model as keyof AiModels, input as never) as Promise<unknown>;
  }
}

/**
 * clef-flash による被写体の推定（requirements 3.5）。補助であり、不合格や要確認の根拠にしません。
 * 呼び出しの前に台帳で件数を予約し、上限に達していれば AI を呼びません。
 * 失敗（例外・タイムアウト・応答の形が違う）は推定なしにします。例外は握りつぶさず、種類の番号だけをトレースに残します。
 */
export class ClefSubjectHint implements SubjectHint {
  private readonly timeoutMs: number;

  constructor(private readonly options: ClefSubjectHintOptions) {
    this.timeoutMs = options.timeoutMs ?? CLASSIFIER_CONFIG.timeoutMs;
  }

  async suggest(imageSmall: string, caption: string, month: number): Promise<ClefSubjectHintResult> {
    try {
      if (!imageSmall.startsWith(CLASSIFIER_CONFIG.thumbDataUrlPrefix)) {
        throw new Error(SUBJECT_HINT_ERRORS.imageNotJpegDataUrl);
      }
      this.assertThumbnailIsCleanJpeg(imageSmall);
      if (Array.from(caption).length > CLASSIFIER_CONFIG.captionMaxChars) {
        throw new RangeError(SUBJECT_HINT_ERRORS.captionTooLong);
      }
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error(SUBJECT_HINT_ERRORS.monthInvalid);
      }
      if (!(await this.options.ledger.reserve(CLASSIFIER_CONFIG.ledgerKind))) {
        this.options.tracer.summary('classifier.skipped');
        return this.noneResult('limit');
      }
      const startedAt = Date.now();
      const request = this.buildRequest(imageSmall, caption, month);
      const raw = await this.withTimeout(this.options.runner.run(CLASSIFIER_CONFIG.runId, request));
      const parsed = this.parseResponse(raw);
      const usd = estimateCostUsd(parsed.inputTokens, CLASSIFIER_CONFIG.inputUsdPerMillionTokens);
      await this.options.ledger.record(CLASSIFIER_CONFIG.ledgerKind, { inputTokens: parsed.inputTokens, usd });
      this.options.tracer.summary('classifier.called', { durationMs: Date.now() - startedAt, estimatedCost: usd });
      return this.estimatedResult(parsed.kind, parsed.confidence);
    } catch (error) {
      this.options.tracer.summary('classifier.skipped', this.errorFields(error));
      return this.noneResult('failure');
    }
  }

  /** 送る前に、縮小画像が EXIF などを含まない JPEG であることを確かめる（CLAUDE.md 8）。違えば例外にする。 */
  private assertThumbnailIsCleanJpeg(imageSmall: string): void {
    const base64 = imageSmall.slice(CLASSIFIER_CONFIG.thumbDataUrlPrefix.length);
    let bytes: Uint8Array;
    try {
      const binary = atob(base64);
      bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    } catch {
      throw new TypeError(SUBJECT_HINT_ERRORS.imageInvalidJpeg);
    }
    if (!inspectJpeg(bytes).ok) {
      throw new TypeError(SUBJECT_HINT_ERRORS.imageInvalidJpeg);
    }
  }

  private buildRequest(imageSmall: string, caption: string, month: number): ClefRequest {
    return {
      model: CLASSIFIER_CONFIG.modelName,
      images: [imageSmall],
      state: { caption, shot_month: month },
      questions: {
        subject: {
          type: 'choice',
          instructions: CLASSIFIER_CONFIG.subjectInstructions,
          criteria: CLASSIFIER_CONFIG.subjectCriteria,
        },
      },
    };
  }

  /** 応答の形を確かめる。想定と違えば例外にする（推定値の代用はしない）。 */
  private parseResponse(raw: unknown): { kind: SubjectKind; confidence: number; inputTokens: number } {
    const root = this.asRecord(raw);
    const answers = this.asRecord(root?.answers);
    const subject = this.asRecord(answers?.subject);
    const usage = this.asRecord(root?.usage);
    const choice = subject?.choice;
    const confidence = subject?.confidence;
    const inputTokens = usage?.input_tokens;
    const isKind = typeof choice === 'string' && (SUBJECT_KINDS as readonly string[]).includes(choice);
    const isConfidence = typeof confidence === 'number' && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1;
    const isTokens = typeof inputTokens === 'number' && Number.isFinite(inputTokens) && inputTokens >= 0;
    if (!isKind || !isConfidence || !isTokens) {
      throw new Error(SUBJECT_HINT_ERRORS.responseShape);
    }
    return { kind: choice as SubjectKind, confidence, inputTokens };
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(SUBJECT_HINT_ERRORS.timeout)), this.timeoutMs);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** 例外の種類の番号だけを返す（0 その他、1 Error、2 TypeError、3 RangeError）。メッセージは返さない。 */
  private errorFields(error: unknown): TraceFields {
    if (error instanceof TypeError) {
      return { errorKind: 2 };
    }
    if (error instanceof RangeError) {
      return { errorKind: 3 };
    }
    return { errorKind: error instanceof Error ? 1 : 0 };
  }

  private estimatedResult(kind: SubjectKind, confidence: number): ClefSubjectHintResult {
    const uncertain = confidence < CLASSIFIER_CONFIG.confidenceMin;
    return {
      status: 'estimated',
      kind,
      confidence,
      model: CLASSIFIER_CONFIG.modelName,
      uncertain,
      notice: uncertain ? SUBJECT_HINT_STRINGS.uncertainMessage : null,
    };
  }

  private noneResult(reason: 'limit' | 'failure'): ClefSubjectHintResult {
    return {
      status: 'none',
      reason,
      notice: SUBJECT_HINT_STRINGS.noneMessage,
      resumeNotice: reason === 'limit' ? SUBJECT_HINT_STRINGS.resumeMessage : null,
    };
  }
}
