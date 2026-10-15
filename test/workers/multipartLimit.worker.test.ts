import { describe, expect, it } from 'vitest';
import { MultipartReader } from '../../src/worker/submission/multipart';
import { SubmissionFailure } from '../../src/worker/submission/failure';

/** 本文を読んだかどうかを記録する要求を作る（Content-Length を指定できる）。 */
function requestWith(contentLength: string | null, probe: { pulled: boolean }): Request {
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        probe.pulled = true;
        controller.enqueue(new Uint8Array(4));
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  const headers = new Headers({ 'content-type': 'multipart/form-data; boundary=x' });
  if (contentLength !== null) {
    headers.set('content-length', contentLength);
  }
  return new Request('https://example.test/api/submissions', { method: 'POST', headers, body: stream, duplex: 'half' } as RequestInit);
}

describe('multipart の読み込み：Content-Length による先読みの拒否', () => {
  it('Content-Length が上限を超えていれば、本文を読まずに 413 にします', async () => {
    const probe = { pulled: false };
    const reader = new MultipartReader(100);
    const error = await reader.read(requestWith('101', probe)).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SubmissionFailure);
    expect((error as SubmissionFailure).status).toBe(413);
    expect((error as SubmissionFailure).code).toBe('payload_too_large');
    expect(probe.pulled).toBe(false);
  });

  it('Content-Length が数でないときは、400（invalid_request）にします', async () => {
    const probe = { pulled: false };
    const error = await new MultipartReader(100).read(requestWith('abc', probe)).catch((caught: unknown) => caught);
    expect((error as SubmissionFailure).status).toBe(400);
    expect(probe.pulled).toBe(false);
  });
});
