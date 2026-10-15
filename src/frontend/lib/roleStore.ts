import { ROLE_VALUES, TOP_ROLE_CONFIG, type Role } from '../../config/strings/top';

/** localStorage と同じ読み書きの形。 */
export interface RoleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** ストレージを返す関数。取得そのものが例外を投げる環境があるため、関数で渡して呼び出し側で囲む。 */
export type RoleStorageProvider = () => RoleStorage | undefined;

/** ブラウザの localStorage を返す。拒否された環境では例外を投げる（呼び出し側で囲む）。 */
export function browserLocalStorage(): RoleStorage | undefined {
  return (globalThis as { localStorage?: RoleStorage }).localStorage;
}

/**
 * 役割の保持。ストレージが使えないときは既定の役割を返し、保存は false を返す（例外は外に出さない）。
 * 役割はこの画面の表示の切り替えにだけ使い、サーバーの状態には使わない。
 */
export class RoleStore {
  constructor(private readonly provider: RoleStorageProvider = browserLocalStorage) {}

  read(): Role {
    try {
      const raw = this.provider()?.getItem(TOP_ROLE_CONFIG.storageKey) ?? null;
      return isRole(raw) ? raw : TOP_ROLE_CONFIG.defaultRole;
    } catch {
      return TOP_ROLE_CONFIG.defaultRole;
    }
  }

  write(role: Role): boolean {
    try {
      const storage = this.provider();
      if (storage === undefined) {
        return false;
      }
      storage.setItem(TOP_ROLE_CONFIG.storageKey, role);
      return true;
    } catch {
      return false;
    }
  }
}

function isRole(value: string | null): value is Role {
  return value !== null && (ROLE_VALUES as readonly string[]).includes(value);
}
