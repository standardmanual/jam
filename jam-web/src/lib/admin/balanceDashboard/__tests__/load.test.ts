/**
 * loadBalanceDashboard — 지표 6개 읽기와 계산 (티켓 20261022_1136 1회 a)
 *
 * 서비스 클라이언트만 메모리 안의 가짜 테이블로 바꾼다(필터·정렬·`range`·`gte`·`or` 구문을 실제로 처리한다). 지키는 것:
 * 1. 1,000행을 넘는 표는 쪽을 넘겨 끝까지 읽는다. 쪽마다 정렬을 붙인다
 * 2. 날짜가 있는 표(캡슐 열기, 발급 기록)는 지표가 보는 구간의 시작 이후만 읽는다
 * 3. 표 하나를 읽지 못하면 그 표를 쓰는 지표만 오류 카드가 되고 나머지는 계산된다. 공통 표를 읽지 못하면 여섯 개 모두 오류 카드다. 던지지 않는다
 * 4. 오류 문장은 고정 문장이고 DB 오류 원문이나 표 이름을 싣지 않는다. 원인은 서버 로그에 남는다
 * 5. select 목록에 이메일과 관리자 ID 칸이 없다
 * 6. 가입자가 적은 지금 상태(시스템 계정 4, 어드민 2, 일반 2)에서는 지표 여섯 개가 모두 «부족»이고 숫자 값이 없다
 * 7. 공개된 컬렉션만 트라이브 전체 완성의 분모에 든다
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { BALANCE_DASHBOARD_LOAD_FAILED_MESSAGE, loadBalanceDashboard } from '../load'
import type { BalanceMetricKey, MetricPart, MetricResult } from '../types'

type Row = Record<string, unknown>
type Result = { data: Row[] | null; error: { message: string } | null }

interface FakeDb {
  tables: Record<string, Row[]>
  failTables: Set<string>
  /** `select`한 칸 목록 */
  selects: Array<{ table: string; columns: string[] }>
  /** `range`로 읽은 구간 */
  ranges: Array<{ table: string; from: number; to: number }>
  /** `gte`로 건 하한 */
  gtes: Array<{ table: string; column: string; value: string }>
  /** 정렬 없이 읽은 횟수 — 0이어야 한다 */
  unordered: number
}

/** `valid_from.is.null,valid_from.lte.<iso>` 같은 PostgREST `or` 목록을 행 판정 함수로 바꾼다 */
function parseOr(expr: string): (row: Row) => boolean {
  const conditions = expr.split(',').map((part) => {
    const [column, op, ...rest] = part.split('.')
    const value = rest.join('.')
    return (row: Row): boolean => {
      const cell = row[column]
      if (op === 'is') return value === 'null' && cell === null
      if (cell === null || cell === undefined) return false
      const left = new Date(cell as string).getTime()
      const right = new Date(value).getTime()
      return op === 'lte' ? left <= right : op === 'gte' ? left >= right : false
    }
  })
  return (row) => conditions.some((test) => test(row))
}

class Query implements PromiseLike<Result> {
  private filters: Array<(row: Row) => boolean> = []
  private columns: string[] = []
  private orderBy: string[] = []
  private window: { from: number; to: number } | null = null
  constructor(
    private db: FakeDb,
    private table: string
  ) {}
  select(columns: string) {
    this.columns = columns.split(',').map((c) => c.trim())
    this.db.selects.push({ table: this.table, columns: this.columns })
    return this
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value)
    return this
  }
  gte(column: string, value: string) {
    this.db.gtes.push({ table: this.table, column, value })
    this.filters.push((row) => new Date(row[column] as string).getTime() >= new Date(value).getTime())
    return this
  }
  or(expr: string) {
    this.filters.push(parseOr(expr))
    return this
  }
  order(column: string) {
    this.orderBy.push(column)
    return this
  }
  range(from: number, to: number) {
    this.window = { from, to }
    this.db.ranges.push({ table: this.table, from, to })
    return this
  }
  private run(): Result {
    if (this.db.failTables.has(this.table)) {
      return { data: null, error: { message: `secret-db-detail ${this.table} 읽기 실패` } }
    }
    if (this.orderBy.length === 0) this.db.unordered += 1
    let rows = (this.db.tables[this.table] ?? []).filter((row) => this.filters.every((test) => test(row)))
    rows = [...rows].sort((a, b) => {
      for (const column of this.orderBy) {
        const x = String(a[column])
        const y = String(b[column])
        if (x !== y) return x < y ? -1 : 1
      }
      return 0
    })
    if (this.window) rows = rows.slice(this.window.from, this.window.to + 1)
    return { data: rows.map((row) => Object.fromEntries(this.columns.map((c) => [c, row[c]]))), error: null }
  }
  then<R1 = Result, R2 = never>(
    onfulfilled?: ((value: Result) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected)
  }
}

function makeDb(tables: Record<string, Row[]> = {}): FakeDb {
  return { tables, failTables: new Set(), selects: [], ranges: [], gtes: [], unordered: 0 }
}

function load(db: FakeDb) {
  const service = { from: (table: string) => new Query(db, table) }
  return loadBalanceDashboard(service as unknown as Parameters<typeof loadBalanceDashboard>[0], NOW)
}

const DAY = 86_400_000
/** 수요일 12:00 KST */
const NOW = new Date('2026-10-28T03:00:00.000Z')
/** 이번 주 월요일 0시 KST */
const WEEK_END = Date.parse('2026-10-25T15:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()
const LONG_AGO = iso(NOW.getTime() - 400 * DAY)

const SYSTEM_IDS = [1, 2, 3, 4].map((n) => `00000000-0000-0000-0000-00000000000${n}`)

function userRows(ids: string[], over: Row = {}): Row[] {
  return ids.map((id) => ({ id, is_admin: false, tribe_id: 't1', ...over }))
}
function chapterOneRows(ids: string[], at = LONG_AGO): Row[] {
  return ids.map((id) => ({ user_id: id, chapter_no: 1, reached_at: at }))
}
const normalIds = (count: number) => Array.from({ length: count }, (_, i) => `normal-${String(i).padStart(3, '0')}`)

function byKey(metrics: readonly MetricResult[]): Record<string, MetricResult> {
  return Object.fromEntries(metrics.map((metric) => [metric.key, metric]))
}
function partsOf(metric: MetricResult): readonly MetricPart[] {
  if (metric.status !== 'ok') throw new Error(`${metric.key}가 오류예요`)
  return metric.parts
}

const ORDER: BalanceMetricKey[] = [
  'capsule_open',
  'chapter_reach',
  'monthly_items',
  'rarity_feel',
  'collection_complete',
  'inventory_full',
]

afterEach(() => vi.restoreAllMocks())

describe('loadBalanceDashboard — 가입자가 적은 지금 상태', () => {
  it('시스템 계정 4, 어드민 2, 일반 2명이면 여섯 지표가 모두 부족이고 숫자 값이 없다', async () => {
    const normal = normalIds(2)
    const admins = ['admin-1', 'admin-2']
    const everyone = [...SYSTEM_IDS, ...admins, ...normal]
    const db = makeDb({
      users: [...userRows(SYSTEM_IDS), ...userRows(admins, { is_admin: true }), ...userRows(normal)],
      chapter_ups: chapterOneRows(everyone),
      user_suspensions: [],
      capsule_opens: [],
      item_issue_log: [],
      user_item_book_tier_completions: [],
      item_books: [],
      inventory: everyone.map((id, index) => ({ id: `inv-${index}`, user_id: id, max_slots: 10, used_slots: index < 2 ? 10 : 0 })),
    })
    const data = await load(db)

    expect(data.generatedAt).toBe(NOW.toISOString())
    expect(data.metrics.map((metric) => metric.key)).toEqual(ORDER)
    for (const metric of data.metrics) {
      for (const p of partsOf(metric)) expect(p.measurement.status).toBe('insufficient')
    }
    // «0»이나 «100%»가 될 값이 결과 어디에도 없다
    expect(JSON.stringify(data.metrics)).not.toContain('"value"')
  })
})

describe('loadBalanceDashboard — 값을 내는 경우', () => {
  it('대상이 5명이면 캡슐 열기 속도를 내고, 어드민과 시스템 계정은 세지 않는다', async () => {
    const normal = normalIds(5)
    const opens = normal.flatMap((id, index) =>
      Array.from({ length: 8 }, (_, n) => ({ id: `open-${index}-${n}`, user_id: id, opened_at: iso(WEEK_END - DAY) }))
    )
    const db = makeDb({
      users: [...userRows(SYSTEM_IDS), ...userRows(['admin-1'], { is_admin: true }), ...userRows(normal)],
      chapter_ups: chapterOneRows([...SYSTEM_IDS, 'admin-1', ...normal]),
      user_suspensions: [],
      capsule_opens: [
        ...opens,
        // 시스템 계정의 열기는 표본에 들지 않는다
        ...Array.from({ length: 40 }, (_, n) => ({ id: `sys-${n}`, user_id: SYSTEM_IDS[0], opened_at: iso(WEEK_END - DAY) })),
      ],
    })
    const metric = byKey((await load(db)).metrics).capsule_open
    const chapter1 = partsOf(metric).find((p) => p.id === 'chapter:1')?.measurement
    expect(chapter1).toMatchObject({ status: 'ready', sample: 5, value: 2 })
  })

  it('지표 1은 구간 시작 이후, 지표 3·4는 12주 시작 이후만 읽는다', async () => {
    const normal = normalIds(5)
    const db = makeDb({
      users: userRows(normal),
      chapter_ups: chapterOneRows(normal),
      capsule_opens: [
        { id: 'old', user_id: normal[0], opened_at: iso(WEEK_END - 5 * 7 * DAY) },
        { id: 'new', user_id: normal[0], opened_at: iso(WEEK_END - DAY) },
      ],
      item_issue_log: [],
    })
    await load(db)
    expect(db.gtes.filter((g) => g.table === 'capsule_opens')).toEqual([
      { table: 'capsule_opens', column: 'opened_at', value: iso(WEEK_END - 4 * 7 * DAY) },
    ])
    expect(db.gtes.filter((g) => g.table === 'item_issue_log')).toEqual([
      { table: 'item_issue_log', column: 'created_at', value: iso(WEEK_END - 12 * 7 * DAY) },
    ])
  })

  it('공개된 컬렉션만 트라이브 전체 완성의 분모에 든다 (비활성 컬렉션은 완성하지 않아도 된다)', async () => {
    const normal = normalIds(20)
    const db = makeDb({
      users: userRows(normal),
      chapter_ups: chapterOneRows(normal),
      user_item_book_tier_completions: normal.map((id) => ({
        user_id: id,
        item_book_id: 'open-book',
        tier: 'common',
        completed_at: iso(NOW.getTime() - 380 * DAY),
      })),
      item_books: [
        { id: 'open-book', tribe_id: 't1', is_active: true, valid_from: null },
        { id: 'inactive-book', tribe_id: 't1', is_active: false, valid_from: null },
        { id: 'not-launched', tribe_id: 't1', is_active: true, valid_from: iso(NOW.getTime() + DAY) },
      ],
    })
    const metric = byKey((await load(db)).metrics).collection_complete
    const tribe = partsOf(metric).find((p) => p.id === 'tribe')?.measurement
    expect(tribe).toMatchObject({ status: 'ready', value: 1, sample: 20 })
  })
})

describe('loadBalanceDashboard — 1,000행 넘는 쪽 읽기', () => {
  it('캡슐 열기 2,500건을 끝까지 읽고 쪽마다 정렬한다', async () => {
    const normal = normalIds(5)
    const opens = Array.from({ length: 2500 }, (_, index) => ({
      id: `open-${String(index).padStart(5, '0')}`,
      user_id: normal[index % 5],
      opened_at: iso(WEEK_END - DAY),
    }))
    const db = makeDb({ users: userRows(normal), chapter_ups: chapterOneRows(normal), capsule_opens: opens })
    const metric = byKey((await load(db)).metrics).capsule_open

    // 유저마다 500건 ÷ 4주 = 주 125번
    const chapter1 = partsOf(metric).find((p) => p.id === 'chapter:1')?.measurement
    expect(chapter1).toMatchObject({ status: 'ready', value: 125, sample: 5 })
    expect(db.ranges.filter((r) => r.table === 'capsule_opens').map((r) => r.from)).toEqual([0, 1000, 2000])
    expect(db.unordered).toBe(0)
  })
})

describe('loadBalanceDashboard — 읽기 실패', () => {
  const scenario = (): Record<string, Row[]> => {
    const normal = normalIds(20)
    return {
      users: userRows(normal),
      chapter_ups: chapterOneRows(normal),
      user_suspensions: [],
      capsule_opens: [],
      item_issue_log: [],
      user_item_book_tier_completions: [],
      item_books: [{ id: 'b1', tribe_id: 't1', is_active: true, valid_from: null }],
      inventory: normal.map((id, index) => ({ id: `inv-${index}`, user_id: id, max_slots: 10, used_slots: 0 })),
    }
  }

  const cases: Array<[string, BalanceMetricKey[]]> = [
    ['users', ORDER],
    ['chapter_ups', ORDER],
    ['user_suspensions', ORDER],
    ['capsule_opens', ['capsule_open']],
    ['item_issue_log', ['monthly_items', 'rarity_feel']],
    ['user_item_book_tier_completions', ['collection_complete']],
    ['item_books', ['collection_complete']],
    ['inventory', ['inventory_full']],
  ]

  it.each(cases)('%s를 읽지 못하면 %j 지표만 오류 카드가 되고 나머지는 계산된다', async (table, failedKeys) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = makeDb(scenario())
    db.failTables.add(table)
    const data = await load(db)

    expect(data.metrics.map((metric) => metric.key)).toEqual(ORDER)
    for (const metric of data.metrics) {
      if (failedKeys.includes(metric.key)) {
        expect(metric).toEqual({ key: metric.key, status: 'error', message: BALANCE_DASHBOARD_LOAD_FAILED_MESSAGE })
      } else {
        expect(metric.status).toBe('ok')
      }
    }
    expect(log).toHaveBeenCalled()
    // 오류 원문이나 표 이름이 화면용 결과에 실리지 않는다
    expect(JSON.stringify(data)).not.toContain('secret-db-detail')
  })

  it('실패가 없으면 오류 카드가 없다', async () => {
    const data = await load(makeDb(scenario()))
    expect(data.metrics.every((metric) => metric.status === 'ok')).toBe(true)
  })
})

describe('loadBalanceDashboard — 읽는 칸', () => {
  it('select 목록에 이메일과 관리자 ID 칸이 없고 유저 표는 필요한 세 칸만 읽는다', async () => {
    const normal = normalIds(1)
    const db = makeDb({
      users: userRows(normal),
      chapter_ups: chapterOneRows(normal),
      user_suspensions: [{ id: 's1', user_id: normal[0], suspended_at: LONG_AGO, lifted_at: null, suspended_by: 'secret-admin', lifted_by: null }],
    })
    await load(db)
    for (const { columns } of db.selects) {
      expect(columns.some((column) => /(email|_by$)/.test(column))).toBe(false)
    }
    expect(db.selects.find((s) => s.table === 'users')?.columns).toEqual(['id', 'is_admin', 'tribe_id'])
    expect(db.unordered).toBe(0)
  })
})
