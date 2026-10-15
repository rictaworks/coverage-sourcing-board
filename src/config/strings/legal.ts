/**
 * /legal の本文（仮置き。requirements 4.2 に従い、公開前に事実を確認して確定します）。日本語のみ。
 */
export const LEGAL_STRINGS = {
  title: '利用規約・免責事項｜風景写真の素材調達（デモ）',
  heading: '利用規約・免責事項・連絡先',
  draftNote: 'この文章は仮置きです。公開の前に内容を確定します。',
  sections: [
    {
      heading: 'デモの目的',
      paragraphs: [
        'このデモは、風景写真の素材を条件どおりに集める流れを確かめるためのものです。実際の業務の代わりにはなりません。',
      ],
    },
    {
      heading: 'データの消去',
      paragraphs: [
        'データは毎日 03:00（日本時間）に消去されます。サーバーの再起動により、データがリセットされる場合もあります。',
      ],
    },
    {
      heading: '投稿する写真',
      paragraphs: [
        '投稿する写真は、ご自身が撮影したものだけにしてください。他人が撮影した写真や、権利を確認できない写真は投稿しないでください。',
      ],
    },
    {
      heading: '買取と権利',
      paragraphs: [
        '本デモでは、実際の買取や権利の移転は行いません。「採用（デモ）」は、画面上の表示だけです。',
      ],
    },
    {
      heading: '位置情報と機種情報',
      paragraphs: [
        '位置情報（GPS）と機種情報は保存しません。保存するのは、撮影月と、撮影地の市町村が一致したかの結果だけです。',
      ],
    },
    {
      heading: 'アクセス解析',
      paragraphs: [
        '本サイトでは、Google アナリティクス 4（GA4）を使って利用状況を集計します。その際、Cookie を使うことがあります。',
      ],
    },
    {
      heading: '免責事項',
      paragraphs: [
        '本デモの利用によって生じた損害について、運営者は責任を負いません。',
      ],
    },
  ],
  contactHeading: '連絡先',
  contactLead: 'ご質問やご相談は、次のメールアドレスにお送りください。',
  contactEmail: 'info@rictaworks.jp',
  contactHref: 'mailto:info@rictaworks.jp',
} as const;
