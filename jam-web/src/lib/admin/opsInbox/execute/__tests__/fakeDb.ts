/**
 * 예약 등록 실행 테스트용 메모리 DB (티켓 20261002_1123). `opsInbox/__tests__/decide.test.ts`의 가짜 Supabase 질의와 같은 모양이다
 * (실 DB에 접속하지 않는다). 쓰기 직전에 부르는 `beforeRun`으로 동시 실행을 흉내 내고, `failIf`로 원하는 쓰기만 실패시킨다.
 * 카드 핸들러(티켓 20261002_1255)가 쓰는 질의도 받는다: `is`·`limit`, 참조 세기의 `select(칼럼, { count, head })`, 기본 테이블 `today_cards` 등.
 * 취소(티켓 20261002_1256)가 쓰는 `gt`(두 값이 날짜 문자열이면 시각으로 비교한다)와 `delete().select()`의 지운 행 돌려주기도 받는다.
 * 상태 맞추기(티켓 20261002_1813)가 쓰는 `order`(칸 값이 같거나 없으면 내림차순은 나중에 넣은 행이 먼저)도 받는다.
 * 미션 핸들러(티켓 20261002_1944)가 쓰는 미션 참조 표(`user_mission_*`·`mission_rank_snapshots`·`point_transactions`)와 `poi`가 기본 테이블에 있다.
 */
import type { ExecuteServiceClient } from '../handlers'

export type Row = Record<string, unknown>
type Result = { data?: unknown; error: { message: string } | null; count?: number | null }

export interface FakeCall {
  table: string
  op: 'select' | 'insert' | 'update' | 'delete'
  payload?: unknown
  filters: Array<[string, unknown]>
}

/** DB 오류 원문 자리. 응답·결정 기록·슬랙 어디에도 나오면 안 된다. */
export const DB_SECRET = 'boom secret detail relation "ops_bundle_items" violates'

function sortRows(rows: Row[], { col, ascending }: { col: string; ascending: boolean }): Row[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const x = a.row[col] as string | number | undefined
      const y = b.row[col] as string | number | undefined
      const cmp = x === undefined || y === undefined || x === y ? 0 : x < y ? -1 : 1
      const signed = ascending ? cmp : -cmp
      return signed !== 0 ? signed : ascending ? a.index - b.index : b.index - a.index
    })
    .map(({ row }) => row)
}

class FakeQuery implements PromiseLike<Result> {
  private mode: FakeCall['op'] = 'select'
  private payload: Row | Row[] = {}
  private filters: Array<[string, (row: Row) => boolean]> = []
  private log: Array<[string, unknown]> = []
  private returning = false
  private head = false
  private limitTo: number | null = null
  private orderBy: { col: string; ascending: boolean } | null = null

  constructor(
    private db: FakeDb,
    private table: string
  ) {}

  select(_columns?: string, options?: { count?: 'exact'; head?: boolean }) {
    if (this.mode !== 'select') this.returning = true
    if (options?.head) this.head = true
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
  /** `gt(col, val)`: 칸이 val보다 큰 행. 날짜 문자열끼리는 시각으로 비교한다. 로그에는 칸 이름 뒤에 ` >`를 붙여 `eq`와 가른다. */
  gt(col: string, val: string | number) {
    this.filters.push([
      col,
      (row) => {
        const cell = row[col]
        if (typeof cell === 'string' && typeof val === 'string') return Date.parse(cell) > Date.parse(val)
        return typeof cell === 'number' && typeof val === 'number' && cell > val
      },
    ])
    this.log.push([`${col} >`, val])
    return this
  }
  /** `is(col, null)`: 칸이 비었거나 없는 행. */
  is(col: string, val: null) {
    this.filters.push([col, (row) => (row[col] ?? null) === val])
    this.log.push([col, val])
    return this
  }
  limit(count: number) {
    this.limitTo = count
    return this
  }
  /** `order(col, { ascending })`: 칸 값으로 줄 세운다. 값이 같거나 없으면 넣은 순서를 따른다(내림차순은 거꾸로: 가장 나중에 넣은 행이 먼저). */
  order(col: string, options?: { ascending?: boolean }) {
    this.orderBy = { col, ascending: options?.ascending ?? true }
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
        const defaults: Row = this.table === 'ops_decisions' ? { item_id: null, batch_id: null, diff: null, reason: null, slack_result: null } : {}
        const row: Row = { id: `id-${++this.db.seq}`, ...defaults, ...item }
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
      return { data: this.returning ? [...gone].map((row) => ({ id: row.id })) : null, error: null }
    }
    const matched = matches()
    const hit = this.orderBy ? sortRows(matched, this.orderBy) : matched
    // 참조 세기(`select(칼럼, { count: 'exact', head: true })`)는 행 없이 건수만 돌려준다.
    if (this.head) return { data: null, count: hit.length, error: null }
    return { data: (this.limitTo === null ? hit : hit.slice(0, this.limitTo)).map((row) => ({ ...row })), error: null }
  }
}

export class FakeDb {
  tables: Record<string, Row[]> = {
    ops_bundles: [],
    ops_bundle_items: [],
    ops_decisions: [],
    today_cards: [],
    today_card_events: [],
    missions: [],
    item_books: [],
    badges: [],
    ranking_modes: [],
    // 미션 핸들러(티켓 20261002_1944)가 읽는 표: 되돌림 전 참조 확인(`MISSION_UNDO_REFERENCE_TABLES`)과 조건 지점 존재 확인.
    user_mission_completions: [],
    user_mission_participations: [],
    mission_rank_snapshots: [],
    point_transactions: [],
    poi: [],
  }
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
