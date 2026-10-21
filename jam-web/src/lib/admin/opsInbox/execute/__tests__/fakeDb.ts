/**
 * 예약 등록 실행 테스트용 메모리 DB (티켓 20261002_1123). `opsInbox/__tests__/decide.test.ts`의 가짜 Supabase 질의와 같은 모양이다
 * (실 DB에 접속하지 않는다). 쓰기 직전에 부르는 `beforeRun`으로 동시 실행을 흉내 내고, `failIf`로 원하는 쓰기만 실패시킨다.
 * 카드 핸들러(티켓 20261002_1255)가 쓰는 질의도 받는다: `is`·`limit`, 참조 세기의 `select(칼럼, { count, head })`, 기본 테이블 `today_cards` 등.
 * 취소(티켓 20261002_1256)가 쓰는 `gt`(두 값이 날짜 문자열이면 시각으로 비교한다)와 `delete().select()`의 지운 행 돌려주기도 받는다.
 * 상태 맞추기(티켓 20261002_1813)가 쓰는 `order`(칸 값이 같거나 없으면 내림차순은 나중에 넣은 행이 먼저)도 받는다.
 * 미션 핸들러(티켓 20261002_1944)가 쓰는 미션 참조 표(`user_mission_*`·`mission_rank_snapshots`·`point_transactions`)와 `poi`가 기본 테이블에 있다.
 * 레시피 핸들러(티켓 20261002_2221)가 쓰는 `combination_recipes`·`combination_recipe_slots`도 기본 테이블에 있고, 레시피를 지우면 슬롯도 함께 지워진다(DB의 CASCADE).
 * 드랍 예약 핸들러(티켓 20261002_2306)가 쓰는 `ambient_drop_schedules`(넣을 때 `status`를 DB 기본값 `scheduled`로 채운다)·`poi_categories`도 기본 테이블에 있다. 예약 대상 판정(`loadScheduleTargets`)은 `or`·`not` 같은 질의를 써서
 * 이 가짜 DB가 받지 않으므로, 통합 테스트는 그 함수를 mock으로 바꾼다(드랍 저장소의 가짜 DB `ambient-drop/__tests__/schedule-test-db.ts`는 실제 판정을 돌린다).
 * `in`은 PostgREST JSON 경로 칸(`condition_json->recipe_first_success->>recipe_id`)도 읽는다(레시피 참조 확인이 쓴다).
 * JAM! 배지 핸들러(티켓 20261004_1756)가 쓰는 배지 참조 표(`user_activity_badges`·`inventory_items`·`poi_drops`·`user_checkin_badge_earns`·`user_item_book_slots`)가 기본 테이블에 있고,
 * 배열 칸에 값이 들어 있는지 보는 `contains(col, [값])`(배지 참조 확인의 `missions.reward_badge_ids`·`today_cards.badge_ids` 등)도 받는다.
 * 컬렉션 핸들러(티켓 20261004_2039)가 쓰는 트라이브 존재 확인(`tribes`)과 컬렉션 참조 표(`user_item_book_completions`·`user_drop_state`·`ambient_drop_config`)가 기본 테이블에 있다.
 * 컬렉션 참조 확인의 드랍 예약 표는 끝나지 않은 상태만 세려고 `contains` 뒤에 `in('status', […])`를 이어 붙인다(둘 다 받는다).
 * 지금 종료 미리 보기(티켓 20261006_0950)가 쓰는 `range(from, to)`(양 끝 포함)도 받는다: 유저 수 세기(`countRowsByKey`·`fetchAllRows`)가 페이지를 이어 읽는다.
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

/** 칸 값 하나. `a->b->>c` 같은 PostgREST JSON 경로면 JSON 안으로 내려가 읽고, 없으면 `undefined`다. */
function readCell(row: Row, col: string): unknown {
  if (!col.includes('->')) return row[col]
  const [head, ...keys] = col.split(/->>?/)
  let value: unknown = row[head]
  for (const key of keys) {
    if (value === null || typeof value !== 'object') return undefined
    value = (value as Row)[key]
  }
  return value
}

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
  private rangeBy: { from: number; to: number } | null = null
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
    this.filters.push([col, (row) => vals.includes(readCell(row, col))])
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
  /** `contains(col, [값…])`: 배열 칸이 모든 값을 들고 있는 행. 칸이 배열이 아니면 걸리지 않는다. */
  contains(col: string, vals: unknown[]) {
    this.filters.push([col, (row) => Array.isArray(row[col]) && vals.every((value) => (row[col] as unknown[]).includes(value))])
    this.log.push([`${col} @>`, vals])
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
  /** `range(from, to)`: 줄 세운 행 가운데 from번째부터 to번째까지(양 끝 포함, 0부터). */
  range(from: number, to: number) {
    this.rangeBy = { from, to }
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
        const defaults: Row =
          this.table === 'ops_decisions'
            ? { item_id: null, batch_id: null, diff: null, reason: null, slack_result: null }
            : this.table === 'ambient_drop_schedules'
              ? { status: 'scheduled' } // DB 기본값. 만들 때 상태를 넘기지 않는다
              : {}
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
      if (this.table === 'combination_recipes') {
        const goneIds = new Set([...gone].map((row) => row.id))
        this.db.tables.combination_recipe_slots = this.db.tables.combination_recipe_slots.filter((slot) => !goneIds.has(slot.recipe_id))
      }
      return { data: this.returning ? [...gone].map((row) => ({ id: row.id })) : null, error: null }
    }
    const matched = matches()
    const hit = this.orderBy ? sortRows(matched, this.orderBy) : matched
    // 참조 세기(`select(칼럼, { count: 'exact', head: true })`)는 행 없이 건수만 돌려준다.
    if (this.head) return { data: null, count: hit.length, error: null }
    const limited = this.limitTo === null ? hit : hit.slice(0, this.limitTo)
    const paged = this.rangeBy === null ? limited : limited.slice(this.rangeBy.from, this.rangeBy.to + 1)
    return { data: paged.map((row) => ({ ...row })), error: null }
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
    mission_participation_cancellations: [], // 마이그레이션 249(티켓 20261019_1311) — 미션 참조 확인 목록에 들어왔다
    mission_allowed_tribes: [], // 마이그레이션 249(티켓 20261019_1311) — 운영 설정이라 되돌림 확인에서 읽지 않는다(티켓 20261019_1318). 시험이 붙여 놓고 막히지 않음을 본다
    mission_item_rewards: [], // 마이그레이션 250(티켓 20261019_1313) — 미션·배지 참조 확인 목록에 모두 들어왔다
    point_transactions: [],
    poi: [],
    // 레시피 핸들러(티켓 20261002_2221): 레시피와 슬롯. 레시피 참조 확인은 `badges`의 JSON 경로를 읽는다.
    combination_recipes: [],
    combination_recipe_slots: [],
    // 드랍 예약 핸들러(티켓 20261002_2306): 예약 행과 지점 종류 확인.
    ambient_drop_schedules: [],
    poi_categories: [],
    // JAM! 배지 핸들러(티켓 20261004_1756): 되돌림·취소 전 배지 참조 확인(`BADGE_UNDO_REFERENCE_TABLES`)이 읽는 표. 나머지(`poi`·`item_books`·`missions`·`point_transactions` 등)는 위에 있다.
    user_activity_badges: [],
    inventory_items: [],
    poi_drops: [],
    user_checkin_badge_earns: [],
    user_item_book_slots: [],
    item_issue_log: [], // 마이그레이션 227(티켓 20261017_1424) — 배지 참조 확인 목록에 들어왔다
    inventory_item_events: [], // 마이그레이션 235(티켓 20261018_0053) — 배지 참조 확인 목록에 들어왔다
    combine_pending_results: [], // 마이그레이션 236(티켓 20261018_0055) — 배지 참조 확인 목록에 들어왔다
    sync_pending_items: [], // 마이그레이션 229(티켓 20261017_1425) — 배지 참조 확인 목록에 들어왔다
    // 컬렉션 핸들러(티켓 20261004_2039): 트라이브 존재 확인과 되돌림·취소 전 컬렉션 참조 확인(`ITEM_BOOK_UNDO_REFERENCES`)이 읽는 표. 나머지(`badges`·`today_cards`·`user_item_book_slots`·`point_transactions`·`ambient_drop_schedules`)는 위에 있다.
    tribes: [],
    user_item_book_completions: [],
    item_book_tier_rewards: [],
    user_item_book_tier_completions: [],
    user_drop_state: [],
    ambient_drop_config: [],
  }
  calls: FakeCall[] = []
  /** 저장소 정리(티켓 20261006_1801)가 부르는 `storage.from(버킷).remove(경로들)`의 호출 기록만 남기는 스텁. */
  removedFiles: Array<{ bucket: string; paths: string[] }> = []
  storage = {
    from: (bucket: string) => ({
      remove: async (paths: string[]) => {
        this.removedFiles.push({ bucket, paths })
        return { data: [], error: null }
      },
    }),
  }
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
