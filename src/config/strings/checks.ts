/**
 * 一次判定と重複の判定の文言（日本語のみ）。仮置きです（requirements 4.2）。
 * キーは src/core/validation/reasonCodes.ts の理由のコードと一致させます（テストで確かめます）。
 */

/** 判定の項目名（requirements 3.3 の項目と、重複の判定の項目、補助の項目）。 */
export const CHECK_ITEM_LABELS = {
  format: '形式',
  orientation_ratio: '向き・比率',
  resolution: '解像度・ファイルの大きさ',
  jpeg_quality: 'JPEG の品質',
  focus: 'ピント',
  shoot_location: '撮影地',
  shoot_month_season: '撮影月・季節',
  daytime: '昼間',
  processing: '加工',
  declaration: '申告',
  duplicate_image: '同一画像',
  duplicate_spot: '同一地点',
  subject_kind: '被写体の区分（補助）',
} as const;

/** 理由ごとの文言。message は理由、fix は修正方法です。 */
export const CHECK_REASON_TEXT = {
  passed: {
    message: '問題は見つかりませんでした。',
    fix: '修正の必要はありません。',
  },
  format_unsupported: {
    message: 'JPEG か PNG の画像だけを投稿できます。',
    fix: 'JPEG または PNG の画像を選び直してください。',
  },
  orientation_portrait: {
    message: '縦向きの画像は投稿できません。',
    fix: '横向きで撮影した画像を選んでください。画像は自動で回転しません。',
  },
  ratio_out_of_range: {
    message: '画像の比率が 4:3 から外れています。',
    fix: '4:3 になるように画像の端をトリミングしてから、選び直してください。',
  },
  input_too_large: {
    message: 'ファイルの大きさが上限を超えています。',
    fix: '5 MB 以下の画像を選んでください。',
  },
  pixels_too_many: {
    message: '画像の画素数が上限を超えています。',
    fix: '画素数の少ない画像を選んでください。',
  },
  short_side_too_small: {
    message: '画像の短辺が 800 px 未満です。',
    fix: '短辺が 800 px 以上の画像を選んでください。',
  },
  jpeg_quality_low: {
    message: '画像の圧縮が強く、画質が足りないと判定しました。',
    fix: '圧縮の弱い、元の写真を選んでください。',
  },
  jpeg_quality_borderline: {
    message: '画像の圧縮がやや強く、確認が必要になりました。',
    fix: '元の写真を選んでください。確認の結果によっては、差し戻すことがあります。',
  },
  focus_low: {
    message: '画像のピントが合っていないと判定しました。',
    fix: 'ピントの合った画像を選んでください。',
  },
  focus_borderline: {
    message: 'ピントがやや甘いため、確認が必要になりました。',
    fix: 'ピントの合った元の写真を選んでください。',
  },
  shoot_location_unverified: {
    message: '撮影地は、この画面では照合できません。確認者が確かめます。',
    fix: '撮影地の市町村名を正しく入力してください。',
  },
  shoot_month_missing: {
    message: '撮影月が入力されていません。',
    fix: '撮影した月を選んでください。',
  },
  shoot_month_mismatch: {
    message: '画像に記録された撮影月と、入力された撮影月が違います。',
    fix: '撮影した月を確かめてください。違うときは、正しい月を選び直してください。',
  },
  daytime_out_of_range: {
    message: '撮影時刻が、日の出から日の入りの間ではありません。',
    fix: '昼間に撮影した画像を選んでください。',
  },
  daytime_dark: {
    message: '画像が暗いため、昼間に撮影したかどうかを確かめられません。',
    fix: '昼間に撮影した、明るい画像を選んでください。',
  },
  processing_bias: {
    message: '画像の彩度またはコントラストが、通常の範囲から外れています。',
    fix: '色や明暗を強く加工していない、元の写真を選んでください。',
  },
  declaration_missing: {
    message: '申告が完了していません。',
    fix: '「AI で生成した画像ではない」と「他のサイトで使っていない」の両方にチェックしてください。',
  },
  device_info_missing: {
    message: '画像に機種の情報がないため、確認が必要です。',
    fix: '機種の情報が残っている元の写真を選べる場合は、選び直してください。',
  },
  duplicate_image_reject: {
    message: 'この画像は、同じ投稿で送信済みの画像と同じです。',
    fix: '別の画像を選んでください。',
  },
  duplicate_image_review: {
    message: 'この画像は、同じ投稿で送信済みの画像によく似ています。',
    fix: '別の場面の画像を選ぶか、確認者の確認をお待ちください。',
  },
  duplicate_spot_review: {
    message: '同じ市町村と季節で、同じ地点名の投稿があります。',
    fix: '地点名を見直すか、確認者の確認をお待ちください。',
  },
} as const;

/** 季節の表示名。 */
export const SEASON_LABELS = {
  spring: '春',
  summer: '夏',
  autumn: '秋',
  winter: '冬',
} as const;

/** 入力の誤りの文言（例外のメッセージ）。 */
export const CHECK_ERRORS = {
  invalidMonth: '撮影月は 1 から 12 までの整数で指定してください。',
  invalidWallClock: '撮影日時の値が正しくありません。',
  invalidShotInstant: '撮影日時の瞬間を求められません。',
  invalidDate: '日時の値が正しくありません。',
  invalidLatitude: '緯度は -90 から 90 までの数で指定してください。',
  invalidLongitude: '経度は -180 から 180 までの数で指定してください。',
} as const;
