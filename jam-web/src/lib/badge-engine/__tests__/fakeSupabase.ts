/**
 * 메모리 표를 읽는 Supabase 클라이언트 모조 — 기간 필터(`gte`/`lte`)까지 실제로 적용한다 (티켓 20261019_1445)
 *
 * 지표 읽기 함수와 미션 판정 시험이 «어떤 행을 세는가»를 고정하려면 필터를 무시하는 모조로는 부족하다.
 * 이 모조는 `eq`·`in`·`is(col,null)`·`not(col,'is',null)`·`gte`·`lte`를 행에 적용하고, `select(..., {head:true})`는 개수만 돌려준다.
 * `maybeSingle()`·`single()`을 부르면 첫 행(없으면 null)만 돌려준다.
 * 시각 비교는 문자열이 아니라 `Date.parse`다(`...Z`와 `...+00:00` 표기가 달라도 같은 시각).
 * 시험 파일이 아니라 도우미라 `.test.` 이름을 쓰지 않는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type FakeRow = Record<string, unknown>

export interface FakeDbOptions {
  /** 표 이름 → 오류 메시지. 들어 있으면 그 표를 읽는 쿼리는 오류를 돌려준다 */
  errors?: Record<string, string>
  /** 필터(`eq` 등)를 적용하지 않고 모든 행을 돌려줄 표 이름 — 시험 대상이 아닌 조회를 단순화한다 */
  passthroughTables?: string[]
  /** `rpc(fn, args)` 응답 */
  rpc?: (fn: string, args: unknown) => unknown
}

export interface FakeDb {
  tables: Record<string, FakeRow[]>
  /** 읽은 표 이름(조회 순서대로, 중복 포함) */
  queried: string[]
  client: SupabaseClient
}

const isNil = (value: unknown): boolean => value === null || value === undefined

function toMs(value: unknown): number {
  return typeof value === 'string' ? Date.parse(value) : Number.NaN
}

export function makeFakeDb(tables: Record<string, FakeRow[]> = {}, options: FakeDbOptions = {}): FakeDb {
  const queried: string[] = []

  const from = (table: string) => {
    const filters: ((row: FakeRow) => boolean)[] = []
    let head = false
    let single = false
    let range: [number, number] | null = null
    const builder: Record<string, unknown> = {}
    const add = (filter: (row: FakeRow) => boolean) => {
      filters.push(filter)
      return builder
    }

    builder.select = (_cols: string, opts?: { head?: boolean }) => {
      head = Boolean(opts?.head)
      return builder
    }
    builder.eq = (col: string, value: unknown) => add((row) => row[col] === value)
    builder.in = (col: string, values: unknown[]) => add((row) => values.includes(row[col]))
    builder.is = (col: string, value: unknown) =>
      add((row) => (value === null ? isNil(row[col]) : row[col] === value))
    builder.maybeSingle = () => {
      single = true
      return builder
    }
    builder.single = builder.maybeSingle
    builder.not = (col: string, op: string, value: unknown) =>
      op === 'is' && value === null ? add((row) => !isNil(row[col])) : builder
    builder.gte = (col: string, value: string) =>
      add((row) => !Number.isNaN(toMs(row[col])) && toMs(row[col]) >= Date.parse(value))
    builder.lte = (col: string, value: string) =>
      add((row) => !Number.isNaN(toMs(row[col])) && toMs(row[col]) <= Date.parse(value))
    builder.order = () => builder
    builder.or = () => builder
    builder.update = () => builder
    builder.insert = () => builder
    builder.range = (fromIndex: number, toIndex: number) => {
      range = [fromIndex, toIndex]
      return builder
    }

    builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      queried.push(table)
      const errorMessage = options.errors?.[table]
      if (errorMessage) {
        return Promise.resolve({ data: null, count: null, error: { message: errorMessage } }).then(resolve, reject)
      }
      let rows = tables[table] ?? []
      if (!options.passthroughTables?.includes(table)) rows = rows.filter((row) => filters.every((f) => f(row)))
      if (range) rows = rows.slice(range[0], range[1] + 1)
      const result = head
        ? { data: null, count: rows.length, error: null }
        : single
          ? { data: rows[0] ?? null, error: null }
          : { data: rows, error: null }
      return Promise.resolve(result).then(resolve, reject)
    }
    return builder
  }

  const rpc = async (fn: string, args: unknown) => ({ data: options.rpc ? options.rpc(fn, args) : null, error: null })

  return { tables, queried, client: { from, rpc } as unknown as SupabaseClient }
}
