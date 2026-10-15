import type { AppEnv } from '../core/types';
import { COMMON_STRINGS } from './strings/common';

/** APP_ENV として受け付ける値。 */
export const APP_ENV_VALUES: readonly AppEnv[] = ['development', 'production'];

/**
 * APP_ENV の値を判定する。値が無い・不正なときは例外を投げる（フォールバックしない）。
 */
export function resolveAppEnv(raw: string | undefined): AppEnv {
  const matched = APP_ENV_VALUES.find((value) => value === raw);
  if (matched === undefined) {
    throw new Error(COMMON_STRINGS.errorInvalidAppEnv);
  }
  return matched;
}
