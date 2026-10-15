import { PAGE_NAMES } from './layout';

/** 役割（発注者・投稿者）の値。 */
export const ROLE_VALUES = ['orderer', 'submitter'] as const;
export type Role = (typeof ROLE_VALUES)[number];

/**
 * 役割の保持の設定。役割はブラウザに保存し、この画面の表示の切り替えだけに使う（サーバーの状態には使わない）。
 * 既定の役割は投稿者とします（仮の値。確定は公開前）。
 */
export const TOP_ROLE_CONFIG = {
  storageKey: 'csb-demo-role',
  defaultRole: 'submitter',
} as const satisfies { storageKey: string; defaultRole: Role };

export interface RoleLink {
  readonly href: string;
  readonly label: string;
}

export interface RoleDescription {
  readonly label: string;
  readonly description: string;
  readonly links: readonly RoleLink[];
}

export const TOP_STRINGS = {
  lead: 'このデモでは、エリアと季節を決めて風景写真を集める流れを確かめられます。役割を選ぶと、進める画面が変わります。',
  eraseNotice: 'データは毎日 03:00（日本時間）に消去されます。',
  roleHeading: '役割を選んでください',
  roleNotice: '役割は、この画面の表示を切り替えるためだけに使われます。',
  roleGroupLabel: '役割の切替',
  linksHeading: '進める画面',
  roles: {
    orderer: {
      label: '発注者',
      description: 'マスの充足状況を確認し、投稿された写真を最終確認します。',
      links: [
        { href: '/coverage', label: PAGE_NAMES.coverage },
        { href: '/campaign', label: PAGE_NAMES.campaign },
        { href: '/review', label: PAGE_NAMES.review },
      ],
    },
    submitter: {
      label: '投稿者',
      description: '写真を投稿し、判定の結果と差し戻しの理由を確認します。',
      links: [
        { href: '/coverage', label: PAGE_NAMES.coverage },
        { href: '/submit', label: PAGE_NAMES.submit },
        { href: '/mine', label: PAGE_NAMES.mine },
      ],
    },
  } satisfies Record<Role, RoleDescription>,
} as const;
