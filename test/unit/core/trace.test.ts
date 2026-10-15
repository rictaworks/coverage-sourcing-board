import { describe, expect, it } from 'vitest';
import { DebugTracer } from '../../../src/core/trace';
import { TRACE_FIELD_NAMES, TRACE_NAMES } from '../../../src/config/trace';
import { COMMON_STRINGS } from '../../../src/config/strings/common';

const FIXED_NOW = new Date('2026-10-16T03:00:00Z');

function createTracer(appEnv: 'development' | 'production') {
  const lines: string[] = [];
  const tracer = new DebugTracer(appEnv, (line) => lines.push(line), () => FIXED_NOW);
  return { tracer, lines };
}

describe('DebugTracer（デバッグのトレース）', () => {
  it('development では summary と detail の両方を出します', () => {
    const { tracer, lines } = createTracer('development');
    tracer.summary(TRACE_NAMES[0], { [TRACE_FIELD_NAMES[0]]: 3 });
    tracer.detail(TRACE_NAMES[1], { [TRACE_FIELD_NAMES[1]]: 42.5 });
    expect(lines).toHaveLength(2);
  });

  it('production では detail を出さず、summary だけを出します', () => {
    const { tracer, lines } = createTracer('production');
    tracer.summary(TRACE_NAMES[0], { [TRACE_FIELD_NAMES[0]]: 3 });
    tracer.detail(TRACE_NAMES[1], { [TRACE_FIELD_NAMES[1]]: 42.5 });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).name).toBe(TRACE_NAMES[0]);
  });

  it('時刻は JST（+09:00）で出力します', () => {
    const { tracer, lines } = createTracer('development');
    tracer.summary(TRACE_NAMES[0]);
    expect(JSON.parse(lines[0]).ts).toBe('2026-10-16T12:00:00.000+09:00');
  });

  it('値は数値・真偽値・null・許可リストの名前だけを受け付けます（個人情報や秘密値を渡せない型）', () => {
    const { tracer, lines } = createTracer('development');
    tracer.summary(TRACE_NAMES[0], { [TRACE_FIELD_NAMES[0]]: 1, [TRACE_FIELD_NAMES[1]]: true, [TRACE_FIELD_NAMES[2]]: null });
    // @ts-expect-error 許可リストにない文字列（IP・説明文など）は型と実行時の両方で拒否します
    expect(() => tracer.summary(TRACE_NAMES[0], { [TRACE_FIELD_NAMES[0]]: '203.0.113.1' })).toThrow(COMMON_STRINGS.errorInvalidTraceValue);
    expect(JSON.parse(lines[0]).fields).toEqual({
      [TRACE_FIELD_NAMES[0]]: 1,
      [TRACE_FIELD_NAMES[1]]: true,
      [TRACE_FIELD_NAMES[2]]: null,
    });
  });

  it('name は許可リスト（TRACE_NAMES）にあるものだけを受け付けます。個人情報になりうる任意の文字列は型と実行時の両方で拒否します', () => {
    const { tracer, lines } = createTracer('development');
    // @ts-expect-error 許可リストにない name は型で拒否します
    expect(() => tracer.summary('user:203.0.113.1')).toThrow(COMMON_STRINGS.errorInvalidTraceName);
    // @ts-expect-error detail も同じです
    expect(() => tracer.detail('cookie=abc')).toThrow(COMMON_STRINGS.errorInvalidTraceName);
    expect(lines).toEqual([]);
  });

  it('フィールド名も許可リスト（TRACE_FIELD_NAMES）にあるものだけを受け付けます', () => {
    const { tracer, lines } = createTracer('development');
    // @ts-expect-error 許可リストにないフィールド名は型で拒否します
    expect(() => tracer.summary(TRACE_NAMES[0], { 'ip-203.0.113.1': 1 })).toThrow(COMMON_STRINGS.errorInvalidTraceField);
    expect(lines).toEqual([]);
  });

  it('例外の文言に、拒否した値を含めません', () => {
    const { tracer } = createTracer('development');
    // @ts-expect-error 許可リストにない name
    expect(() => tracer.summary('secret-token-123')).toThrow(/^(?!.*secret-token-123)/);
  });

  it('許可リストは重複せず、空ではありません', () => {
    expect(new Set(TRACE_NAMES).size).toBe(TRACE_NAMES.length);
    expect(new Set(TRACE_FIELD_NAMES).size).toBe(TRACE_FIELD_NAMES.length);
    expect(TRACE_NAMES.length).toBeGreaterThanOrEqual(2);
    expect(TRACE_FIELD_NAMES.length).toBeGreaterThanOrEqual(3);
  });
  it('要求のトレースでは、許可リスト（TRACE_LABELS）にある名前の文字列だけを値にできます', () => {
    const { tracer, lines } = createTracer('production');
    tracer.summary('request.handled', { method: 'GET', route: '/api/review/:id/accept', status: 200, durationMs: 3 });
    expect(JSON.parse(lines[0]).fields).toEqual({ method: 'GET', route: '/api/review/:id/accept', status: 200, durationMs: 3 });
  });

  it('許可リストにない文字列の値（実際の ID・IP など）は、実行時に拒否します', () => {
    const { tracer, lines } = createTracer('production');
    expect(() =>
      // @ts-expect-error 許可リストにない文字列は型で拒否します
      tracer.summary('request.handled', { route: '/api/submissions/abc123/image' }),
    ).toThrow(COMMON_STRINGS.errorInvalidTraceValue);
    expect(lines).toHaveLength(0);
  });
});
