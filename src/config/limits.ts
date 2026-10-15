/**
 * 上限（requirements 3.8 と入力の上限）。数値はここに置く。
 * 「仮の値」は requirements に数値がないため暫定で置いたものです。人が決めて、SPEC/config.md の記録を更新します。
 */
export const LIMITS = {
  /** IP ごと：10 秒に 5 回まで。 */
  rateLimitRequests: 5,
  rateLimitWindowSeconds: 10,
  /** セッションごと：1 日 20 件まで（UTC 0 時に数え直す）。 */
  dailySubmissionsPerSession: 20,
  /** 保存中の投稿の総数（全体）。追加の既定値。 */
  maxSavedSubmissions: 200,
  /** 分類：全体で 1 日 2,000 回まで（UTC 0 時にリセット）。 */
  dailyClassifyCalls: 2000,
  /** 地点名（市町村名を含めて 20 字以内）。 */
  spotNameMaxChars: 20,
  /** 説明文（60 字以内）。 */
  captionMaxChars: 60,
  /** 仮の値（差し戻しの自由記述の上限。requirements に数値がない）。 */
  returnReasonMaxChars: 200,
  /** 仮の値（分類用の縮小画像の最大バイト数。requirements に数値がない）。 */
  classifyImageMaxBytes: 150_000,
} as const;
