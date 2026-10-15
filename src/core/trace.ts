import { COMMON_STRINGS } from '../config/strings/common';
import { TRACE_FIELD_NAMES, TRACE_NAMES, type TraceFieldName, type TraceName } from '../config/trace';
import type { AppEnv } from './types';

/** トレースの詳しさ。summary は両環境で出し、detail は development だけで出す。 */
export type TraceLevel = 'summary' | 'detail';

/**
 * トレースの値。文字列を受け付けないことで、IP・Cookie・説明文などを誤って出力しにくくする。
 */
export type TraceValue = number | boolean | null;

/** フィールドは、許可リストにある名前だけを持てる。 */
export type TraceFields = Readonly<Partial<Record<TraceFieldName, TraceValue>>>;

/** 1 行の JSON として出力する。ts は JST（+09:00）。 */
export interface TraceLine {
  readonly ts: string;
  readonly level: TraceLevel;
  readonly name: TraceName;
  readonly fields: TraceFields;
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** デバッグのトレースを出す。出力先（sink）と時計は外から渡し、テストで確かめられるようにする。 */
export class DebugTracer {
  constructor(
    private readonly appEnv: AppEnv,
    private readonly sink: (line: string) => void,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  summary(name: TraceName, fields: TraceFields = {}): void {
    this.emit('summary', name, fields);
  }

  detail(name: TraceName, fields: TraceFields = {}): void {
    if (this.appEnv !== 'development') {
      return;
    }
    this.emit('detail', name, fields);
  }

  private emit(level: TraceLevel, name: TraceName, fields: TraceFields): void {
    this.assertAllowed(name, fields);
    const line: TraceLine = { ts: this.formatJst(this.clock()), level, name, fields };
    this.sink(JSON.stringify(line));
  }

  /** 型を迂回した呼び出し（JavaScript など）も拒否する。例外の文言に、拒否した値は含めない。 */
  private assertAllowed(name: string, fields: Readonly<Record<string, unknown>>): void {
    if (!(TRACE_NAMES as readonly string[]).includes(name)) {
      throw new Error(COMMON_STRINGS.errorInvalidTraceName);
    }
    for (const key of Object.keys(fields)) {
      if (!(TRACE_FIELD_NAMES as readonly string[]).includes(key)) {
        throw new Error(COMMON_STRINGS.errorInvalidTraceField);
      }
    }
  }

  private formatJst(date: Date): string {
    const shifted = new Date(date.getTime() + JST_OFFSET_MS);
    return `${shifted.toISOString().slice(0, 23)}+09:00`;
  }
}
