/**
 * 投稿と判定結果の画面（D4、Issue #17）の文字列（日本語のみ）。仮置きです（requirements 4.2）。
 * 数値の上限は src/config/limits.ts（LIMITS）が正です。ここには文言だけを置きます。
 */

/** 投稿の画面の見出しと案内。 */
export const SUBMIT_STRINGS = {
  lead: '写真を選び、市町村と撮影月を入力してから、一次判定をします。不合格の項目があるときは送信できません。',
  photoHeading: '1. 写真',
  formHeading: '2. 投稿の情報',
  resultHeading: '判定結果',
  areaLabel: '市町村（区分）',
  areaPlaceholder: '選んでください',
  areaHelp: 'キャンペーンの区分から選びます。',
  monthLabel: '撮影月',
  monthPlaceholder: '選んでください',
  monthHelp: 'この月から季節を判定します。',
  seasonNote: (season: string): string => `季節：${season}`,
  requiredMark: '（必須）',
  spotNameLabel: '地点名（任意）',
  spotNameHelp: '20 字以内で入力してください。同じ市町村と季節で同じ地点名があると、確認になります。',
  captionLabel: '一行説明（任意）',
  captionHelp: '60 字以内で入力してください。',
  remaining: (count: number): string => `残り ${count} 字`,
  declarationHeading: '申告と同意',
  declaredNotAiLabel: 'AI で生成した画像ではありません',
  declaredNotReusedLabel: '他のサイトで使っていません',
  consentLabel: '写真の掲載と利用に同意します',
  judgeButton: '一次判定をする',
  sendButton: '送信する',
  sending: '送信しています。しばらくお待ちください。',
  rechoosePhoto: '写真を選び直す',
  resubmitNotice: 'この投稿は、差し戻された投稿の再投稿として送信します。',
  fixLine: (fix: string): string => `修正方法：${fix}`,
  serverReasonsHeading: '送信時の判定（サーバー）',
  uncertainSuffix: (text: string): string => `（${text}）`,
  verdictPass: '合格',
  verdictReview: '要確認',
  verdictFail: '不合格',
  summaryFail: '不合格の項目があるため、送信できません。修正方法を確認して、写真や入力を直してから、もう一度判定してください。',
  summaryReview: '不合格の項目はありません。送信できます。要確認の項目は、確認者が確かめます。',
  summaryPass: 'すべての項目が合格です。送信できます。',
  acceptedHeading: '投稿を受け付けました',
  acceptedBody: '確認待ちになりました。確認が終わるまで、投稿の状況は確認待ちのままです。',
  acceptedIdLine: (id: string): string => `受付番号：${id}`,
  reviewItemsHeading: '要確認の項目',
  reviewItemsNone: '要確認の項目はありません。',
  prefillFailed: '元の投稿の情報を読み込めませんでした。市町村と撮影月を入力してください。',
  resubmitMonthNote: '撮影月は、元の投稿の情報に含まれないため、もう一度選んでください。',
  acceptedAgain: '続けて投稿する',
  subjectHeading: '被写体の推定（補助）',
  subjectNote: '被写体の推定は補助です。判定の根拠にはしません。',
  subjectKindPrefix: '推定：',
  campaignNotFoundHeading: 'キャンペーンがありません',
  campaignNotFoundBody: 'キャンペーン設定の画面で、テンプレートを読み込んでから、もう一度開いてください。',
  campaignLinkLabel: 'キャンペーン設定へ',
  campaignLinkHref: '/campaign',
  loadFailed: 'キャンペーンの情報を読み込めませんでした。通信の状態を確かめて、もう一度お試しください。',
  sendFailed: '送信できませんでした。通信の状態を確かめて、もう一度お試しください。',
  honeypotLabel: 'Web サイト（入力しないでください）',
  formErrorHeading: '入力内容を直してください。',
  monthOption: (month: number): string => `${month} 月`,
} as const;

/** 内部の不整合を示す開発者向けの文言（画面には出しません。例外のメッセージに使います）。 */
export const SUBMIT_DEV_ERRORS = {
  browserCheckMissing: '一次判定の結果に、次の項目がありません: ',
  capitalMissing: '県庁所在地の座標が、県の一覧と対応していません。',
  cellCoverageMissing: '充足の応答に、キャンペーンのマスが見つかりません。',
} as const;

/** 入力欄の誤りの文言（欄のそばと、まとめの欄に出します）。 */
export const SUBMIT_FORM_ERRORS = {
  area: '市町村を選んでください。',
  month: '撮影月を選んでください。',
  spotName: (max: number): string => `地点名は ${max} 字以内で入力してください。`,
  caption: (max: number): string => `説明文は ${max} 字以内で入力してください。`,
  controlChars: '改行などは入力できません。1 行で入力してください。',
  declaration: '「AI で生成した画像ではありません」と「他のサイトで使っていません」の両方にチェックしてください。',
  consent: '同意にチェックしてください。',
  noImage: '先に写真を選び、枠を確定してください。',
  noPeriod: 'この撮影月の季節は、キャンペーンの期間に含まれません。別の撮影月を選んでください。',
  noCell: 'この市町村と季節の組み合わせは、募集の対象ではありません。別の市町村か撮影月を選んでください。',
  cellClosed: 'この市町村と季節の募集は終了しました。別の市町村か撮影月を選んでください。',
} as const;



/** 投稿の画面が読む query の名前（D5 の `/submit?resubmit=<投稿の ID>` と揃えます）。 */
export const SUBMIT_QUERY_KEYS = {
  resubmit: 'resubmit',
} as const;
