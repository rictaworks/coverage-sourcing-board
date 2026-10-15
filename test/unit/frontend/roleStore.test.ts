import { describe, expect, it } from 'vitest';
import { RoleStore, type RoleStorage } from '../../../src/frontend/lib/roleStore';
import { TOP_ROLE_CONFIG } from '../../../src/config/strings/top';

/** メモリ上の偽のストレージ。 */
class MemoryStorage implements RoleStorage {
  private readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

/** 読み書きのたびに例外を投げるストレージ（プライベートモードや拒否された環境を模す）。 */
class ThrowingStorage implements RoleStorage {
  getItem(): string | null {
    throw new Error('denied');
  }
  setItem(): void {
    throw new Error('denied');
  }
}

describe('RoleStore（役割の保持）', () => {
  it('保存がないときは既定の役割を返します', () => {
    const store = new RoleStore(() => new MemoryStorage());
    expect(store.read()).toBe(TOP_ROLE_CONFIG.defaultRole);
  });

  it('書いた役割を読み出せます', () => {
    const storage = new MemoryStorage();
    const store = new RoleStore(() => storage);
    expect(store.write('orderer')).toBe(true);
    expect(store.read()).toBe('orderer');
    expect(new RoleStore(() => storage).read()).toBe('orderer');
  });

  it('保存された値が不正なときは、既定の役割を返します', () => {
    const storage = new MemoryStorage();
    storage.setItem(TOP_ROLE_CONFIG.storageKey, 'administrator');
    expect(new RoleStore(() => storage).read()).toBe(TOP_ROLE_CONFIG.defaultRole);
  });

  it('ストレージが例外を投げても、既定の役割を返し、例外を外に出しません', () => {
    const store = new RoleStore(() => new ThrowingStorage());
    expect(store.read()).toBe(TOP_ROLE_CONFIG.defaultRole);
    expect(store.write('orderer')).toBe(false);
  });

  it('ストレージの取得そのものが例外を投げても、既定の役割を返します', () => {
    const store = new RoleStore(() => {
      throw new Error('SecurityError');
    });
    expect(store.read()).toBe(TOP_ROLE_CONFIG.defaultRole);
    expect(store.write('submitter')).toBe(false);
  });
});
