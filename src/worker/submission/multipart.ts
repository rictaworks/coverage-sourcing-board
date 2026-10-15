import { SUBMISSION_FORM_FIELDS } from '../../core/api/contract';
import { SUBMISSION_CONFIG } from '../../config/submission';
import { SubmissionFailure } from './failure';

/** 投稿のフォームの中身（SUBMISSION_FORM_FIELDS の 4 つ）。画像は未検査のバイト列。 */
export interface SubmissionForm {
  readonly image: Uint8Array;
  readonly thumb: Uint8Array;
  readonly metaJson: string;
  /** ハニーポット欄に値（空でない値）が入っていれば true。 */
  readonly honeypotFilled: boolean;
}

/**
 * multipart/form-data の要求を読む。Content-Length があれば先に上限と比べて拒否し、そのうえで、ストリームを読みながら上限を確かめる（Content-Length は信用しない）。
 * 上限を超えたら 413、形式が違えば 400（invalid_request）にする。
 */
export class MultipartReader {
  constructor(private readonly maxBytes: number = SUBMISSION_CONFIG.bodyMaxBytes) {}

  async read(request: Request): Promise<SubmissionForm> {
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
      throw new SubmissionFailure('invalid_request', 400);
    }
    this.assertDeclaredLength(request);
    const body = await this.readLimited(request);
    const formData = await this.parse(body, contentType);
    return this.toForm(formData);
  }

  /** Content-Length があれば、本文を読む前に上限と比べる（数でない値は 400）。無くても、読みながらの上限で守る。 */
  private assertDeclaredLength(request: Request): void {
    const declared = request.headers.get('content-length');
    if (declared === null) {
      return;
    }
    if (!/^\d+$/.test(declared)) {
      throw new SubmissionFailure('invalid_request', 400);
    }
    if (Number(declared) > this.maxBytes) {
      throw new SubmissionFailure('payload_too_large', 413);
    }
  }

  private async readLimited(request: Request): Promise<ArrayBuffer> {
    const stream = request.body;
    if (stream === null) {
      throw new SubmissionFailure('invalid_request', 400);
    }
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > this.maxBytes) {
        await reader.cancel();
        throw new SubmissionFailure('payload_too_large', 413);
      }
      chunks.push(value);
    }
    const buffer = new ArrayBuffer(total);
    const bytes = new Uint8Array(buffer);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return buffer;
  }

  private async parse(body: ArrayBuffer, contentType: string): Promise<FormData> {
    try {
      return await new Response(body, { headers: { 'content-type': contentType } }).formData();
    } catch {
      throw new SubmissionFailure('invalid_request', 400);
    }
  }

  private async toForm(formData: FormData): Promise<SubmissionForm> {
    const image = await this.fileBytes(formData.get(SUBMISSION_FORM_FIELDS.image));
    const thumb = await this.fileBytes(formData.get(SUBMISSION_FORM_FIELDS.thumb));
    const meta = formData.get(SUBMISSION_FORM_FIELDS.meta);
    if (typeof meta !== 'string') {
      throw new SubmissionFailure('invalid_request', 400);
    }
    const honeypot = formData.get(SUBMISSION_FORM_FIELDS.honeypot);
    const honeypotFilled = honeypot !== null && (typeof honeypot !== 'string' || honeypot.length > 0);
    return { image, thumb, metaJson: meta, honeypotFilled };
  }

  private async fileBytes(value: FormDataEntryValue | null): Promise<Uint8Array> {
    if (value === null || typeof value === 'string' || value.size === 0) {
      throw new SubmissionFailure('invalid_request', 400);
    }
    return new Uint8Array(await value.arrayBuffer());
  }
}
