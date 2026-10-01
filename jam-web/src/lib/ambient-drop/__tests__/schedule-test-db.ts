/**
 * 날짜 예약 테스트 공용 가짜 DB (티켓 20261001_2051)
 *
 * Supabase 쿼리 빌더 중 예약 코드가 쓰는 부분만 흉내 낸다. 조건(`eq`·`in`·`is`·`not`·`lt`·`lte`·`gt`·`gte`·`or`)을
 * 행에 실제로 적용하고, UPDATE는 조건에 맞는 행을 한 번에 바꾼 뒤 바뀐 행을 돌려준다 — 빌더를 `await`하는 순간
 * 동기적으로 실행되므로 조건부 UPDATE의 원자성(`WHERE status='scheduled'` 선점·취소 경합)을 그대로 시험할 수 있다.
 *
 * 쓰는 곳: schedule-store.test.ts · schedule-run.test.ts · cron 라우트 테스트.
 * `@/lib/notifications/batch/shared`는 페이징(`.order().range()`)을 흉내 내지 않고 한 번에 읽는 모킹(`sharedMock`)으로 바꾼다.
 */
import { randomUUID } from 'node:crypto'

export type Row = Record<string, unknown>

export type DbOp = 'select' | 'insert' | 'update' | 'delete'

export interface DbCall {
  table: string
  op: DbOp
  payload?: unknown
}

export interface RpcCall {
  name: string
  args: { p_poi_id: string; p_badge_id: string }
}

export interface FakeDb {
  tables: Record<string, Row[]>
  calls: DbCall[]
  rpcCalls: RpcCall[]
  /** RPC 응답을 바꾼다. 기본은 매번 성공 */
  rpcResult: (call: RpcCall, index: number) => { data: unknown; error: { message: string } | null }
  /** 한 테이블에 대한 쓰기(insert·update·delete) 호출만 */
  writesTo: (table: string) => DbCall[]
  /** 이 테이블에서 조회 오류를 일으킬 때 채운다 */
  failReads: Set<string>
  /** 이 테이블에 대한 쓰기(insert·update·delete)가 오류를 돌려주게 할 때 채운다. 행은 바뀌지 않는다 */
  failWrites: Set<string>
  /** 쿼리가 실행되기 직전에 불린다 — 읽고 쓰는 사이에 다른 요청이 끼어드는 경합을 흉내 낼 때 쓴다 */
  beforeExecute: ((call: DbCall) => void) | null
  client: unknown
}

/** `00000000-0000-4000-8000-0000000000NN` 형식의 테스트용 UUID */
export function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
}

const SCHEDULE_DEFAULTS = (): Row => {
  const at = new Date().toISOString()
  return {
    id: randomUUID(),
    title: null,
    status: 'scheduled',
    poi_ids: [],
    poi_category: null,
    badge_ids: [],
    collection_ids: [],
    per_poi_count: null,
    total_count: null,
    created_by: null,
    created_at: at,
    updated_at: at,
    claimed_at: null,
    finished_at: null,
    canceled_at: null,
    result: null,
  }
}

function toMs(value: unknown): number {
  return new Date(value as string).getTime()
}

function matchesOr(row: Row, expr: string): boolean {
  return expr.split(',').some((part) => {
    const [column, op, ...rest] = part.split('.')
    const value = rest.join('.')
    const cell = row[column] as string | null | undefined
    if (op === 'is') return value === 'null' && (cell === null || cell === undefined)
    if (cell === null || cell === undefined) return false
    if (op === 'lte') return toMs(cell) <= toMs(value)
    if (op === 'gte') return toMs(cell) >= toMs(value)
    throw new Error(`테스트 모킹이 모르는 or 연산자: ${op}`)
  })
}

export function createFakeDb(initial: Record<string, Row[]> = {}): FakeDb {
  const db: FakeDb = {
    tables: Object.fromEntries(Object.entries(initial).map(([t, rows]) => [t, rows.map((r) => ({ ...r }))])),
    calls: [],
    rpcCalls: [],
    rpcResult: (_call, index) => ({
      data: { ok: true, drop_id: `drop-${index + 1}`, inventory_item_id: `inv-${index + 1}` },
      error: null,
    }),
    writesTo: (table) => db.calls.filter((c) => c.table === table && c.op !== 'select'),
    failReads: new Set(),
    failWrites: new Set(),
    beforeExecute: null,
    client: null,
  }

  function makeBuilder(table: string) {
    let op: DbOp = 'select'
    let payload: unknown
    const filters: ((r: Row) => boolean)[] = []
    const orders: { column: string; ascending: boolean }[] = []
    let limitN: number | undefined
    let rangeArgs: [number, number] | undefined
    let single: 'single' | 'maybe' | null = null

    function execute(): { data: unknown; error: { message: string } | null } {
      const rows = (db.tables[table] ??= [])
      const call: DbCall = { table, op, payload }
      db.calls.push(call)
      db.beforeExecute?.(call)

      if (op === 'select' && db.failReads.has(table)) return { data: null, error: { message: `${table} 조회 실패(테스트)` } }
      if (op !== 'select' && db.failWrites.has(table)) return { data: null, error: { message: `${table} 쓰기 실패(테스트)` } }

      let result: Row[]
      if (op === 'insert') {
        const items = (Array.isArray(payload) ? payload : [payload]) as Row[]
        result = items.map((item) => {
          const row = { ...(table === 'ambient_drop_schedules' ? SCHEDULE_DEFAULTS() : {}), ...item }
          rows.push(row)
          return row
        })
      } else if (op === 'update') {
        result = rows.filter((r) => filters.every((f) => f(r)))
        for (const r of result) Object.assign(r, payload as Row)
      } else if (op === 'delete') {
        result = rows.filter((r) => filters.every((f) => f(r)))
        db.tables[table] = rows.filter((r) => !result.includes(r))
      } else {
        result = rows.filter((r) => filters.every((f) => f(r)))
      }

      for (const { column, ascending } of [...orders].reverse()) {
        result = [...result].sort((a, b) => {
          const left = a[column] as string | number
          const right = b[column] as string | number
          const cmp = left < right ? -1 : left > right ? 1 : 0
          return ascending ? cmp : -cmp
        })
      }
      if (rangeArgs) result = result.slice(rangeArgs[0], rangeArgs[1] + 1)
      if (limitN !== undefined) result = result.slice(0, limitN)

      const copies = result.map((r) => ({ ...r }))
      if (single === 'single') {
        return copies.length === 1 ? { data: copies[0], error: null } : { data: null, error: { message: 'single: 행이 1개가 아님' } }
      }
      if (single === 'maybe') return { data: copies[0] ?? null, error: null }
      return { data: copies, error: null }
    }

    const builder = {
      select: () => builder,
      insert(p: unknown) {
        op = 'insert'
        payload = p
        return builder
      },
      update(p: unknown) {
        op = 'update'
        payload = p
        return builder
      },
      delete() {
        op = 'delete'
        return builder
      },
      eq(column: string, value: unknown) {
        filters.push((r) => r[column] === value)
        return builder
      },
      in(column: string, values: unknown[]) {
        filters.push((r) => values.includes(r[column]))
        return builder
      },
      is(column: string, value: null) {
        filters.push((r) => (r[column] ?? null) === value)
        return builder
      },
      not(column: string, operator: string, value: null) {
        if (operator !== 'is') throw new Error(`테스트 모킹이 모르는 not 연산자: ${operator}`)
        filters.push((r) => (r[column] ?? null) !== value)
        return builder
      },
      lt(column: string, value: string) {
        filters.push((r) => r[column] != null && toMs(r[column]) < toMs(value))
        return builder
      },
      lte(column: string, value: string) {
        filters.push((r) => r[column] != null && toMs(r[column]) <= toMs(value))
        return builder
      },
      gt(column: string, value: string) {
        filters.push((r) => r[column] != null && toMs(r[column]) > toMs(value))
        return builder
      },
      gte(column: string, value: string) {
        filters.push((r) => r[column] != null && toMs(r[column]) >= toMs(value))
        return builder
      },
      or(expr: string) {
        filters.push((r) => matchesOr(r, expr))
        return builder
      },
      order(column: string, opts?: { ascending?: boolean }) {
        orders.push({ column, ascending: opts?.ascending ?? true })
        return builder
      },
      limit(n: number) {
        limitN = n
        return builder
      },
      range(from: number, to: number) {
        rangeArgs = [from, to]
        return builder
      },
      maybeSingle() {
        single = 'maybe'
        return builder
      },
      single() {
        single = 'single'
        return builder
      },
      then(resolve: (value: { data: unknown; error: { message: string } | null }) => unknown, reject?: (e: unknown) => unknown) {
        try {
          return Promise.resolve(execute()).then(resolve, reject)
        } catch (err) {
          return Promise.reject(err).then(resolve, reject)
        }
      },
    }
    return builder
  }

  db.client = {
    from: (table: string) => makeBuilder(table),
    rpc: async (name: string, args: RpcCall['args']) => {
      const call = { name, args }
      db.rpcCalls.push(call)
      return db.rpcResult(call, db.rpcCalls.length - 1)
    },
  }
  return db
}

/** `@/lib/notifications/batch/shared` 대용 — 페이징 없이 한 번에 읽고, 조회 오류는 던진다 */
export const sharedMock = {
  fetchAllRows: async <T>(label: string, _orderBy: unknown, query: () => PromiseLike<{ data: T[] | null; error?: { message: string } | null }>) => {
    const { data, error } = await query()
    if (error) throw new Error(`${label} 조회 실패: ${error.message}`)
    return data ?? []
  },
  fetchAllRowsIn: async <T, V>(
    label: string,
    _orderBy: unknown,
    values: readonly V[],
    query: (chunk: V[]) => PromiseLike<{ data: T[] | null; error?: { message: string } | null }>
  ) => {
    const unique = [...new Set(values)]
    const all: T[] = []
    for (let i = 0; i < unique.length; i += 200) {
      const { data, error } = await query(unique.slice(i, i + 200))
      if (error) throw new Error(`${label} 조회 실패: ${error.message}`)
      all.push(...(data ?? []))
    }
    return all
  },
}
