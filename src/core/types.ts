/**
 * 共通の型（requirements 6 章・9 章）。外部に依存しない純粋な型だけを置く。
 * 個人情報と秘密値（IP、Cookie の値、画像の中身、説明文の本文、位置情報の値）は、ここで定義する型に含めない。
 */

/** 実行環境。APP_ENV の値（src/config/env.ts が判定する）。 */
export type AppEnv = 'development' | 'production';

/** 判定の結果。pass は合格、fail は不合格、review は要確認、info は補助（根拠にしない）。 */
export type Verdict = 'pass' | 'fail' | 'review' | 'info';

/** 判定項目（requirements 3.3 の表に対応する）。 */
export type CheckItem =
  | 'format'
  | 'orientation_ratio'
  | 'resolution'
  | 'jpeg_quality'
  | 'focus'
  | 'shoot_location'
  | 'shoot_month_season'
  | 'daytime'
  | 'processing'
  | 'declaration'
  | 'duplicate_image'
  | 'duplicate_spot'
  | 'subject_kind';

/** 理由の識別子。具体的な値の一覧は、各判定の Issue で定め、ここでは文字列として扱う。 */
export type ReasonCode = string;

/** 投稿の状態（requirements 6 章）。即時不合格の投稿は保存しない。 */
export type SubmissionStatus = 'checking' | 'pending_review' | 'accepted' | 'returned';

/** 画像の形式。 */
export type ImageFormat = 'jpeg' | 'png';

/** 1 項目の判定結果。confidence と model は補助の分類だけで使う。 */
export interface CheckResult {
  readonly item: CheckItem;
  readonly verdict: Verdict;
  readonly reasonCode: ReasonCode;
  readonly confidence?: number;
  readonly model?: string;
}

/** 採用の条件（requirements 3.0 の既定値を、キャンペーンごとに適用する）。 */
export interface AcceptRule {
  /** 幅 ÷ 高さ（4:3 は 4 / 3）。 */
  readonly ratio: number;
  readonly tolerance: number;
  readonly orientation: 'landscape';
  readonly formats: readonly ImageFormat[];
  readonly minShortPx: number;
  readonly blurMin: number;
  readonly dupDistance: number;
  readonly daytimeRequired: boolean;
  readonly maxInputBytes: number;
  readonly maxPixels: number;
}

/** 画像から求めた特徴量。画素の値そのものは含めない。 */
export interface ImageFeatures {
  readonly width: number;
  readonly height: number;
  readonly format: ImageFormat;
  /** JPEG の量子化テーブルから推定した品質。JPEG 以外は無い。 */
  readonly quality?: number;
  readonly blurScore: number;
  readonly meanLuma: number;
  /** 平均の彩度（0〜1）。 */
  readonly saturation: number;
  /** コントラスト（0〜1）。 */
  readonly contrast: number;
  /** 知覚ハッシュ（16 進数の文字列）。 */
  readonly phash: string;
}

/**
 * EXIF から取り出した要約。値は保存しない前提で、判定の中だけで使う。
 * 位置情報（GPS の座標）と機種情報の値は、この型に含めない。
 */
export interface ExifSummary {
  /** 撮影日時。無い場合は null。 */
  readonly shotAt: Date | null;
  /** 時差（分）。無い場合は null。 */
  readonly offsetMinutes: number | null;
  readonly hasGps: boolean;
  readonly hasDeviceInfo: boolean;
}

/** 被写体の区分（requirements 3.5）。 */
export type SubjectKind = 'landscape' | 'closeup' | 'people' | 'other';

/** 被写体の推定の結果。推定できないときは status が none になる。 */
export type SubjectHintResult =
  | { readonly status: 'estimated'; readonly kind: SubjectKind; readonly confidence: number; readonly model: string }
  | { readonly status: 'none' };

/** 昼間かどうかを判定する。 */
export interface DaytimeJudge {
  isDaytime(date: Date, lat: number, lng: number): boolean;
}

/** 被写体の推定。外部（Workers AI）に依存するため、インターフェースで差し替える。 */
export interface SubjectHint {
  /** imageSmall は 512 px に縮小した JPEG の data URL、month は撮影月（1〜12）。 */
  suggest(imageSmall: string, caption: string, month: number): Promise<SubjectHintResult>;
}
