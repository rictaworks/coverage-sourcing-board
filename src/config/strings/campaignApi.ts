import { RULE_DEFAULTS } from '../defaults';

const BYTES_PER_MB = 1024 * 1024;
const PIXELS_PER_MAN = 10_000;

/** 受入条件の上限の文言。数値は RULE_DEFAULTS（requirements 3.0 の既定値）から作り、二重管理しません。 */
const RULE_LIMIT_MESSAGE =
  `受入条件の最大のファイルサイズまたは最大の画素数が、上限（${RULE_DEFAULTS.maxInputBytes / BYTES_PER_MB} MB・` +
  `${(RULE_DEFAULTS.maxInputPixels / PIXELS_PER_MAN).toLocaleString('en-US')}万画素）を超えています。`;

/**
 * キャンペーンの API の文言（日本語のみ）。
 * 契約（src/core/api/contract.ts）の既存のコードにない、キャンペーンの 404 と区分値の重複の文言をここに置く。
 * 入力の違反の文言は、src/config/strings/campaign.ts（CAMPAIGN_ERROR_MESSAGES）から引く。
 */
export const CAMPAIGN_API_ERROR_MESSAGES = {
  campaign_not_found: 'キャンペーンが見つかりません。テンプレートを読み込んでから、もう一度お試しください。',
  area_duplicate: 'この区分値は、すでに登録されています。表記だけが違う値も重複とみなします。',
  area_limit_exceeded: '区分値の件数が上限に達しています。これ以上は追加できません。',
  rule_limit_exceeded: RULE_LIMIT_MESSAGE,
  name_too_long: 'キャンペーンの名称が長すぎます。文字数を減らして、もう一度お試しください。',
  required_out_of_range: '必要数は 1 以上 999 以下の整数で指定してください。',
} as const;

export type CampaignApiErrorCode = keyof typeof CAMPAIGN_API_ERROR_MESSAGES;

/** 開発者向けの例外の文言（応答には含めず、ログに残す）。 */
export const CAMPAIGN_API_DEV_MESSAGES = {
  errorTemplateMissing: 'システム用のテンプレートの行が D1 にありません（scripts/seed-template-local.mjs または日次の投入を確認してください）。',
  errorCellMissing: 'キャンペーンの組み立てで、マスの対応が見つかりませんでした。',
  errorRuleMissing: '受入条件の行が、キャンペーンに対応していません。',
} as const;
