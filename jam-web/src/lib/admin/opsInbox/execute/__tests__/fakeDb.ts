/**
 * 예약 등록 실행 테스트용 메모리 DB (티켓 20261002_1123). `opsInbox/__tests__/decide.test.ts`의 가짜 Supabase 질의와 같은 모양이다
 * (실 DB에 접속하지 않는다). 쓰기 직전에 부르는 `beforeRun`으로 동시 실행을 흉내 내고, `failIf`로 원하는 쓰기만 실패시킨다.
 */
import type { ExecuteServiceClient } from '../handlers'

export type Row = Record<string, unknown>
type Result = { data?: unknown; error: { message: string } | null }

export interface FakeCall {
  table: string
  op: 'select' | 'insert' | 'update' | 'delete'
  payload?: unknown
  filters: Array<[string, unknown]>
}

/** DB 오류 원문 자리. 응답·결정 기록·슬랙 어디에도 나오면 안 된다. */
export const DB_SECRET = 'boom secret detail relation "ops_bundle_items" violates'

class FakeQuery implements PromiseLike<Result> {
  private mode: FakeCall['op'] = 'select'
  private payload: Row | Row[] = {}
  private filters: Array<[string, (row: Row) => boolean]> = []
  private log: Array<[string, unknown]> = []
  private returning = false

  constructor(
    private db: FakeDb,
    private table: string
  ) {}

  select() {
    if (this.mode !== 'select') this.returning = true
    return this
  }
  insert(payload: Row | Row[]) {
    this.mode = 'insert'
    this.payload = payload
    return this
  }
  update(payload: Row) {
    this.mode = 'update'
    this.payload = payload
    return this
  }
  delete() {
    this.mode = 'delete'
    return this
  }
  eq(col: string, val: unknown) {
    this.filters.push([col, (row) => row[col] === val])
    this.log.push([col, val])
    return this
  }
  in(col: string, vals: unknown[]) {
    this.filters.push([col, (row) => vals.includes(row[col])])
    this.log.push([col, vals])
    return this
  }
  async single() {
    const result = this.run()
    const rows = Array.isArray(result.data) ? result.data : []
    return { data: rows[0] ?? null, error: result.error }
  }
  async maybeSingle() {
    return this.single()
  }
  then<T1 = Result, T2 = never>(
    onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected)
  }

  private run(): Result {
    const call: FakeCall = {
      table: this.table,
      op: this.mode,
      payload: this.mode === 'insert' || this.mode === 'update' ? this.payload : undefined,
      filters: this.log,
    }
    this.db.beforeRun?.(call)
    this.db.calls.push(call)
    if (this.db.failIf?.(call)) return { data: null, error: { message: DB_SECRET } }

    const rows = this.db.tables[this.table]
    const matches = () => rows.filter((row) => this.filters.every(([, test]) => test(row)))

    if (this.mode === 'insert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload]
      const inserted = list.map((item) => {
        const row: Row = {
          id: `id-${++this.db.seq}`,
          item_id: null,
          batch_id: null,
          diff: null,
          reason: null,
          slack_result: null,
          ...item,
        }
        rows.push(row)
        return row
      })
      return { data: this.returning ? inserted.map((row) => ({ id: row.id })) : null, error: null }
    }
    if (this.mode === 'update') {
      const hit = matches()
      for (const row of hit) Object.assign(row, this.payload)
      return { data: this.returning ? hit.map((row) => ({ id: row.id })) : null, error: null }
    }
    if (this.mode === 'delete') {
      const gone = new Set(matches())
      this.db.tables[this.table] = rows.filter((row) => !gone.has(row))
      return { data: null, error: null }
    }
    return { data: matches().map((row) => ({ ...row })), error: null }
  }
}

export class FakeDb {
  tables: Record<string, Row[]> = { ops_bundles: [], ops_bundle_items: [], ops_decisions: [] }
  calls: FakeCall[] = []
  seq = 0
  /** 쓰기·읽기 직전에 부른다. 다른 곳에서 같은 행을 먼저 바꾼 상황을 흉내 낼 때 쓴다. */
  beforeRun?: (call: FakeCall) => void
  /** true를 돌려주는 호출은 DB 오류로 실패한다. */
  failIf?: (call: FakeCall) => boolean

  from(table: string) {
    return new FakeQuery(this, table)
  }

  /** `executeBundle` 등이 받는 서비스 클라이언트 자리에 넘기는 값. */
  get service(): ExecuteServiceClient {
    return this as unknown as ExecuteServiceClient
  }

  item(id: string): Row {
    return this.tables.ops_bundle_items.find((row) => row.id === id) as Row
  }

  decisions(action?: string): Row[] {
    return this.tables.ops_decisions.filter((row) => (action ? row.action === action : true))
  }

  /** 항목 테이블에 쓴 호출(insert·update·delete)만. */
  itemWrites(): FakeCall[] {
    return this.calls.filter((call) => call.table === 'ops_bundle_items' && call.op !== 'select')
  }
}
