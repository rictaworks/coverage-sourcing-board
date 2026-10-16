import { SUBMIT_DEV_ERRORS } from '../../../config/strings/submit';

/** ハニーポット欄を指す参照（読み取りに要る部分だけ）。 */
export interface HoneypotRef {
  readonly current: { readonly value: string } | null;
}

/** ハニーポット欄の値を読みます。欄が無い（参照が null）ときは、空として送らず例外にします。 */
export class HoneypotReader {
  read(ref: HoneypotRef): string {
    if (ref.current === null) {
      throw new Error(SUBMIT_DEV_ERRORS.honeypotMissing);
    }
    return ref.current.value;
  }
}
