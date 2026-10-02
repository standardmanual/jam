/**
 * 받은 기획함 조회 (티켓 20260930_1817)
 *
 * 서비스 클라이언트는 메모리 안의 가짜 DB로 바꾼다(실 DB에 접속하지 않는다). 지키는 것:
 * - 목록 조건 읽기, 탭별 개수·거르기·정렬·50건 자르기
 * - 1000행을 넘어도 끝까지 받는다
 * - **`listOpsBundles`·`getOpsBundleDetail`은 select 계열만 부르고 insert·update·upsert·delete를 부르지 않는다**
 *   (읽기만으로 상태가 바뀌지 않는다는 완료 조건)
 * - 목록은 제출 원본(`raw`)을 가져오지 않는다
 * - 기획 상세의 예약 등록 요약(`execution`, 티켓 20261002_1648): 승인됨 수·예약할 항목 수·아직 연결하지 않은 종류
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  type Result = { data: unknown; error: { message: string } | null }

  const state = {
    tables: { ops_bundles: [], ops_bundle_items: [], ops_decisions: [], ops_rules: [], item_books: [], badges: [] } as Record<string, Row[]>,
    errors: {} as Record<string, string>,
    /** 부른 메서드 기록: `테이블.메서드` */
    calls: [] as string[],
    /** select에 넘긴 열 목록 기록 */
    selects: [] as Array<{ table: string; columns: string }>,
  }

  class Query implements PromiseLike<Result> {
    private filters: Array<(row: Row) => boolean> = []
    private orders: Array<{ col: string; asc: boolean }> = []
    private window: [number, number] | null = null

    constructor(private table: string) {}

    private note(method: string) {
      state.calls.push(`${this.table}.${method}`)
    }

    select(columns: string) {
      this.note('select')
      state.selects.push({ table: this.table, columns })
      return this
    }
    order(col: string, opts?: { ascending?: boolean }) {
      this.note('order')
      this.orders.push({ col, asc: opts?.ascending !== false })
      return this
    }
    range(from: number, to: number) {
      this.note('range')
      this.window = [from, to]
      return this
    }
    eq(col: string, val: unknown) {
      this.note('eq')
      this.filters.push((row) => row[col] === val)
      return this
    }
    in(col: string, vals: unknown[]) {
      this.note('in')
      this.filters.push((row) => vals.includes(row[col]))
      return this
    }
    async maybeSingle() {
      this.note('maybeSingle')
      const result = this.run()
      return { data: Array.isArray(result.data) ? (result.data[0] ?? null) : null, error: result.error }
    }
    // 쓰기 메서드: 부르면 기록하고, 결과는 오류로 돌려준다(읽기 전용 테스트가 쓰기를 부르는 순간 잡는다)
    insert() {
      this.note('insert')
      return this
    }
    update() {
      this.note('update')
      return this
    }
    upsert() {
      this.note('upsert')
      return this
    }
    delete() {
      this.note('delete')
      return this
    }
    then<T1 = Result, T2 = never>(
      onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
    ): PromiseLike<T1 | T2> {
      return Promise.resolve(this.run()).then(onfulfilled, onrejected)
    }

    private run(): Result {
      const message = state.errors[this.table]
      if (message) return { data: null, error: { message } }
      let rows = state.tables[this.table].filter((row) => this.filters.every((f) => f(row)))
      for (const { col, asc } of [...this.orders].reverse()) {
        rows = [...rows].sort((a, b) => {
          const x = String(a[col])
          const y = String(b[col])
          const cmp = x < y ? -1 : x > y ? 1 : 0
          return asc ? cmp : -cmp
        })
      }
      if (this.window) rows = rows.slice(this.window[0], this.window[1] + 1)
      return { data: rows, error: null }
    }
  }

  return { state, Query }
})

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: (table: string) => new h.Query(table) }),
}))

import { SEED_ROWS } from '../balance/__tests__/fixtures'
import {
  buildOpsBundleList,
  buildOpsExecution,
  getOpsBundleDetail,
  listOpsBundles,
  parseOpsInboxParams,
  type OpsInboxParams,
} from '../query'
import type { ExecuteHandler, ExecuteHandlerRegistry, ExecuteItem } from '../execute/handlers'

const BASE: OpsInboxParams = { tab: 'all', sortKey: 'received_at', sortDesc: true, page: 1 }
const WRITE_CALL = /\.(insert|update|upsert|delete)$/

function bundle(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    week: '2026-W41',
    hypothesis: '가설',
    author: '윤진',
    is_sample: false,
    format_errors: [],
    received_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

function item(bundleId: string, status: string, n = 0) {
  return { id: `${bundleId}-item-${n}-${status}`, bundle_id: bundleId, status }
}

beforeEach(() => {
  h.state.tables = { ops_bundles: [], ops_bundle_items: [], ops_decisions: [], ops_rules: [], item_books: [], badges: [] }
  h.state.errors = {}
  h.state.calls = []
  h.state.selects = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parseOpsInboxParams', () => {
  it('기본값은 전체 탭·받은 시각 최신순·1쪽이다', () => {
    expect(parseOpsInboxParams({})).toEqual(BASE)
  })

  it('탭 4개를 읽고 모르는 값은 전체로 둔다', () => {
    expect(parseOpsInboxParams({ tab: 'decide' }).tab).toBe('decide')
    expect(parseOpsInboxParams({ tab: 'progress' }).tab).toBe('progress')
    expect(parseOpsInboxParams({ tab: 'closed' }).tab).toBe('closed')
    expect(parseOpsInboxParams({ tab: 'hacked' }).tab).toBe('all')
    expect(parseOpsInboxParams({ tab: undefined }).tab).toBe('all')
  })

  it('표 머리 칸 클릭이 쓰는 `키_asc`·`키_desc`를 읽는다', () => {
    expect(parseOpsInboxParams({ sort: 'week_asc' })).toMatchObject({ sortKey: 'week', sortDesc: false })
    expect(parseOpsInboxParams({ sort: 'items_desc' })).toMatchObject({ sortKey: 'items', sortDesc: true })
    expect(parseOpsInboxParams({ sort: 'received_at_asc' })).toMatchObject({ sortKey: 'received_at', sortDesc: false })
  })

  it('설계의 `-키` 표기(앞의 -이 내림차순)도 읽는다', () => {
    expect(parseOpsInboxParams({ sort: '-received_at' })).toMatchObject({ sortKey: 'received_at', sortDesc: true })
    expect(parseOpsInboxParams({ sort: '-week' })).toMatchObject({ sortKey: 'week', sortDesc: true })
    expect(parseOpsInboxParams({ sort: 'items' })).toMatchObject({ sortKey: 'items', sortDesc: false })
  })

  it('목록에 없는 정렬은 기본값으로 돌아간다', () => {
    expect(parseOpsInboxParams({ sort: 'author_asc' })).toMatchObject({ sortKey: 'received_at', sortDesc: true })
    expect(parseOpsInboxParams({ sort: '-;drop table' })).toMatchObject({ sortKey: 'received_at', sortDesc: true })
  })

  it('쪽 번호는 1 이상의 정수이고 이상한 값은 1쪽이다', () => {
    expect(parseOpsInboxParams({ page: '3' }).page).toBe(3)
    expect(parseOpsInboxParams({ page: '0' }).page).toBe(1)
    expect(parseOpsInboxParams({ page: '-4' }).page).toBe(1)
    expect(parseOpsInboxParams({ page: 'abc' }).page).toBe(1)
  })
})

describe('buildOpsBundleList — 탭 개수와 거르기', () => {
  const bundles = [
    bundle('a', { received_at: '2026-10-01T00:00:00Z' }), // 도착
    bundle('b', { received_at: '2026-10-02T00:00:00Z' }), // 검토
    bundle('c', { received_at: '2026-10-03T00:00:00Z' }), // 예약
    bundle('d', { received_at: '2026-10-04T00:00:00Z' }), // 종료
    bundle('e', { received_at: '2026-10-05T00:00:00Z' }), // 반려
    bundle('f', { received_at: '2026-10-06T00:00:00Z' }), // 항목 없음 → 도착
  ]
  const items = [
    item('a', 'arrived'),
    item('b', 'reviewing'),
    item('b', 'approved', 1),
    item('c', 'scheduled'),
    item('d', 'ended'),
    item('e', 'rejected'),
  ]

  it('탭 제목의 숫자(전체·결정할 것·진행 중·끝남·멈춤)를 센다', () => {
    const { counts } = buildOpsBundleList(bundles, items, BASE)
    expect(counts).toEqual({ all: 6, decide: 3, progress: 1, closed: 2 })
  })

  it('탭으로 거른다(개수 숫자는 탭을 바꿔도 그대로다)', () => {
    const decide = buildOpsBundleList(bundles, items, { ...BASE, tab: 'decide' })
    expect(decide.rows.map((r) => r.id)).toEqual(['f', 'b', 'a'])
    expect(decide.total).toBe(3)
    expect(decide.counts.all).toBe(6)

    expect(buildOpsBundleList(bundles, items, { ...BASE, tab: 'progress' }).rows.map((r) => r.id)).toEqual(['c'])
    expect(buildOpsBundleList(bundles, items, { ...BASE, tab: 'closed' }).rows.map((r) => r.id)).toEqual(['e', 'd'])
  })

  it('묶음마다 단계·항목 수·결정 수를 계산해 담는다', () => {
    const { rows } = buildOpsBundleList(bundles, items, BASE)
    const b = rows.find((r) => r.id === 'b')
    expect(b).toMatchObject({ stage: 'review', itemCount: 2, decidedCount: 1, partialFailure: false })
    expect(rows.find((r) => r.id === 'f')).toMatchObject({ stage: 'arrived', itemCount: 0 })
    expect(rows.find((r) => r.id === 'e')).toMatchObject({ stage: 'rejected' })
  })

  it('일부 실패를 담는다', () => {
    const { rows } = buildOpsBundleList([bundle('x')], [item('x', 'scheduled'), item('x', 'failed', 1)], BASE)
    expect(rows[0]).toMatchObject({ stage: 'scheduled', partialFailure: true })
  })

  it('형식 오류 수는 묶음 오류 목록의 길이이고, 모양이 틀린 값은 0이다', () => {
    const list = buildOpsBundleList(
      [
        bundle('x', { format_errors: ['week: 틀려요.', 'hypothesis: 틀려요.', 7] }),
        bundle('y', { format_errors: null }),
        bundle('z', { format_errors: { not: 'array' } }),
      ],
      [],
      BASE
    )
    expect(Object.fromEntries(list.rows.map((r) => [r.id, r.formatErrorCount]))).toEqual({ x: 2, y: 0, z: 0 })
  })

  it('시험 묶음 표시와 주차·에이전트·가설을 그대로 담는다', () => {
    const { rows } = buildOpsBundleList([bundle('s', { is_sample: true, week: null, hypothesis: null })], [], BASE)
    expect(rows[0]).toMatchObject({ isSample: true, week: null, hypothesis: null, author: '윤진' })
  })
})

describe('buildOpsBundleList — 정렬', () => {
  const bundles = [
    bundle('a', { week: '2026-W41', received_at: '2026-10-01T00:00:00Z' }),
    bundle('b', { week: '2026-W43', received_at: '2026-10-03T00:00:00Z' }),
    bundle('c', { week: null, received_at: '2026-10-02T00:00:00Z' }),
    bundle('d', { week: '2026-W42', received_at: '2026-10-04T00:00:00Z' }),
  ]
  const items = [item('a', 'arrived', 0), item('a', 'arrived', 1), item('a', 'arrived', 2), item('b', 'arrived'), item('d', 'arrived', 0), item('d', 'arrived', 1)]
  const ids = (params: Partial<OpsInboxParams>) => buildOpsBundleList(bundles, items, { ...BASE, ...params }).rows.map((r) => r.id)

  it('받은 시각: 기본은 최신순, 오름차순도 된다', () => {
    expect(ids({})).toEqual(['d', 'b', 'c', 'a'])
    expect(ids({ sortDesc: false })).toEqual(['a', 'c', 'b', 'd'])
  })

  it('주차: 값이 없는 묶음은 방향과 무관하게 맨 끝이다', () => {
    expect(ids({ sortKey: 'week', sortDesc: false })).toEqual(['a', 'd', 'b', 'c'])
    expect(ids({ sortKey: 'week', sortDesc: true })).toEqual(['b', 'd', 'a', 'c'])
  })

  it('항목 수: 같으면 받은 시각 최신순이다', () => {
    expect(ids({ sortKey: 'items', sortDesc: true })).toEqual(['a', 'd', 'b', 'c'])
    expect(ids({ sortKey: 'items', sortDesc: false })).toEqual(['c', 'b', 'd', 'a'])
  })

  it('받은 시각까지 같으면 ID 순으로 고정한다', () => {
    const same = [bundle('b2'), bundle('a1'), bundle('c3')]
    expect(buildOpsBundleList(same, [], BASE).rows.map((r) => r.id)).toEqual(['a1', 'b2', 'c3'])
  })
})

describe('buildOpsBundleList — 50건씩 자르기', () => {
  const many = Array.from({ length: 120 }, (_, i) =>
    bundle(`b${String(i).padStart(3, '0')}`, { received_at: new Date(Date.UTC(2026, 9, 1, 0, 0, i)).toISOString() })
  )

  it('1쪽은 50건, 3쪽은 나머지 20건이다', () => {
    const first = buildOpsBundleList(many, [], BASE)
    expect(first.rows).toHaveLength(50)
    expect(first.totalPages).toBe(3)
    expect(first.total).toBe(120)
    expect(first.rows[0].id).toBe('b119') // 최신순

    const third = buildOpsBundleList(many, [], { ...BASE, page: 3 })
    expect(third.rows).toHaveLength(20)
    expect(third.rows[19].id).toBe('b000')
  })

  it('쪽이 마지막 쪽을 넘으면 마지막 쪽으로 맞춘다', () => {
    const list = buildOpsBundleList(many, [], { ...BASE, page: 99 })
    expect(list.page).toBe(3)
    expect(list.rows).toHaveLength(20)
  })

  it('0건이면 1쪽·빈 목록이다', () => {
    expect(buildOpsBundleList([], [], BASE)).toEqual({
      rows: [],
      page: 1,
      totalPages: 1,
      total: 0,
      counts: { all: 0, decide: 0, progress: 0, closed: 0 },
    })
  })
})

describe('listOpsBundles — 조회', () => {
  it('1000행을 넘어도 묶음·항목을 끝까지 받는다', async () => {
    h.state.tables.ops_bundles = Array.from({ length: 1200 }, (_, i) => bundle(`b${String(i).padStart(4, '0')}`))
    h.state.tables.ops_bundle_items = Array.from({ length: 1500 }, (_, i) => ({
      id: `i${String(i).padStart(4, '0')}`,
      bundle_id: `b${String(i % 1200).padStart(4, '0')}`,
      status: 'arrived',
    }))
    const list = await listOpsBundles(BASE)
    expect(list.total).toBe(1200)
    expect(list.counts.all).toBe(1200)
    expect(h.state.calls.filter((c) => c === 'ops_bundles.range')).toHaveLength(2)
    expect(h.state.calls.filter((c) => c === 'ops_bundle_items.range')).toHaveLength(2)
    // 항목 1500개가 모두 세어졌다(300개 묶음은 항목 2개)
    const itemTotal = h.state.tables.ops_bundle_items.length
    expect(itemTotal).toBe(1500)
    const all = await listOpsBundles({ ...BASE, sortKey: 'items', sortDesc: true })
    expect(all.rows[0].itemCount).toBe(2)
  })

  it('select 계열만 부르고 쓰기(insert·update·upsert·delete)는 부르지 않는다', async () => {
    h.state.tables.ops_bundles = [bundle('a'), bundle('b')]
    h.state.tables.ops_bundle_items = [item('a', 'arrived'), item('b', 'reviewing')]
    await listOpsBundles(BASE)
    expect(h.state.calls.length).toBeGreaterThan(0)
    expect(h.state.calls.filter((c) => WRITE_CALL.test(c))).toEqual([])
    expect(h.state.calls.filter((c) => c.endsWith('.select'))).toHaveLength(2)
  })

  it('불러오는 상태가 바뀌지 않는다(도착 항목을 읽어도 도착으로 남는다)', async () => {
    h.state.tables.ops_bundles = [bundle('a')]
    h.state.tables.ops_bundle_items = [item('a', 'arrived')]
    const before = JSON.stringify(h.state.tables)
    await listOpsBundles(BASE)
    await listOpsBundles({ ...BASE, tab: 'decide' })
    expect(JSON.stringify(h.state.tables)).toBe(before)
  })

  it('목록은 제출 원본(raw)을 가져오지 않는다', async () => {
    await listOpsBundles(BASE)
    const columns = h.state.selects.map((s) => s.columns).join(' | ')
    expect(columns).not.toMatch(/\braw\b/)
    expect(columns).not.toMatch(/\boriginal\b/)
  })

  it('조회 오류는 던진다(빈 목록으로 보이지 않게)', async () => {
    h.state.errors.ops_bundles = 'db down'
    await expect(listOpsBundles(BASE)).rejects.toThrow(/조회 실패: db down/)
    h.state.errors = { ops_bundle_items: 'items down' }
    await expect(listOpsBundles(BASE)).rejects.toThrow(/조회 실패: items down/)
  })
})

describe('getOpsBundleDetail', () => {
  const ID = '4ca7d1ad-43b2-41a3-9ed4-f03bc73604ee'

  function seedDetail() {
    h.state.tables.ops_bundles = [
      { ...bundle(ID), bundle_id: 'sample-2026-W41', format_errors: ['week: 틀려요.'], raw: { huge: true } },
      bundle('other-bundle'),
    ]
    h.state.tables.ops_bundle_items = [
      { id: 'i2', bundle_id: ID, position: 2, item_key: 'c', kind: 'mission', pattern_no: null, starts_at: null, ends_at: null, status: 'arrived', original: { a: 1 }, edited: null, format_errors: ['items[2].kind: 틀려요.'], updated_at: '2026-10-01T00:00:00Z' },
      { id: 'i0', bundle_id: ID, position: 0, item_key: 'a', kind: 'home_feed_card', pattern_no: 'P-07', starts_at: '2026-10-05T00:00:00Z', ends_at: null, status: 'reviewing', original: { b: 2 }, edited: null, format_errors: [], updated_at: '2026-10-01T00:00:00Z' },
      { id: 'i1', bundle_id: ID, position: 1, item_key: 'b', kind: 'mission', pattern_no: null, starts_at: null, ends_at: null, status: 'arrived', original: { c: 3 }, edited: null, format_errors: [], updated_at: '2026-10-01T00:00:00Z' },
      { id: 'x0', bundle_id: 'other-bundle', position: 0, item_key: 'z', kind: 'mission', pattern_no: null, starts_at: null, ends_at: null, status: 'arrived', original: {}, edited: null, format_errors: [], updated_at: '2026-10-01T00:00:00Z' },
    ]
    h.state.tables.ops_decisions = [
      { id: 'd1', bundle_id: ID, item_id: null, action: 'submit', actor: 'token:윤진', batch_id: null, diff: null, reason: null, slack_result: { channel: 'report', ok: false, error: 'not_configured' }, created_at: '2026-10-01T00:00:00Z' },
      { id: 'd2', bundle_id: ID, item_id: 'i0', action: 'approve', actor: 'admin-1', batch_id: null, diff: null, reason: null, slack_result: null, created_at: '2026-10-02T00:00:00Z' },
      { id: 'd3', bundle_id: 'other-bundle', item_id: null, action: 'submit', actor: 'x', batch_id: null, diff: null, reason: null, slack_result: null, created_at: '2026-10-03T00:00:00Z' },
    ]
  }

  it('UUID가 아니면 DB를 부르지 않고 null이다', async () => {
    expect(await getOpsBundleDetail('not-a-uuid')).toBeNull()
    expect(await getOpsBundleDetail('')).toBeNull()
    expect(await getOpsBundleDetail("4ca7d1ad-43b2-41a3-9ed4-f03bc73604ee' or '1'='1")).toBeNull()
    expect(h.state.calls).toEqual([])
  })

  it('없는 묶음이면 null이다', async () => {
    seedDetail()
    expect(await getOpsBundleDetail('00000000-0000-4000-8000-000000000000')).toBeNull()
  })

  it('묶음 한 행·항목(position 순)·결정 기록(최신순)을 그 묶음 것만 돌려준다', async () => {
    seedDetail()
    const detail = await getOpsBundleDetail(ID)
    expect(detail).not.toBeNull()
    expect(detail!.bundle).toMatchObject({
      id: ID,
      bundleId: 'sample-2026-W41',
      week: '2026-W41',
      author: '윤진',
      isSample: false,
      formatErrors: ['week: 틀려요.'],
    })
    expect(detail!.items.map((i) => i.id)).toEqual(['i0', 'i1', 'i2'])
    expect(detail!.items[0]).toMatchObject({ kind: 'home_feed_card', patternNo: 'P-07', status: 'reviewing', original: { b: 2 } })
    expect(detail!.items[2].formatErrors).toEqual(['items[2].kind: 틀려요.'])
    expect(detail!.decisions.map((d) => d.id)).toEqual(['d2', 'd1'])
    expect(detail!.decisions[1].slackResult).toEqual({ channel: 'report', ok: false, error: 'not_configured' })
  })

  it('묶음 제출 원본(raw)은 가져오지 않는다', async () => {
    seedDetail()
    await getOpsBundleDetail(ID)
    const bundleSelect = h.state.selects.find((s) => s.table === 'ops_bundles')!
    expect(bundleSelect.columns).not.toMatch(/\braw\b/)
  })

  it('select 계열만 부르고 쓰기(insert·update·upsert·delete)는 부르지 않으며 상태가 바뀌지 않는다', async () => {
    seedDetail()
    const before = JSON.stringify(h.state.tables)
    await getOpsBundleDetail(ID)
    expect(h.state.calls.length).toBeGreaterThan(0)
    expect(h.state.calls.filter((c) => WRITE_CALL.test(c))).toEqual([])
    expect(JSON.stringify(h.state.tables)).toBe(before)
  })

  it('조회 오류는 던진다', async () => {
    seedDetail()
    h.state.errors.ops_decisions = 'decisions down'
    await expect(getOpsBundleDetail(ID)).rejects.toThrow(/조회 실패: decisions down/)
  })
})

describe('getOpsBundleDetail — 밸런스 평가 (티켓 20260930_1459)', () => {
  const ID = '4ca7d1ad-43b2-41a3-9ed4-f03bc73604ee'

  function launchItem(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      bundle_id: ID,
      position: 0,
      item_key: id,
      kind: 'collection_launch',
      pattern_no: null,
      starts_at: '2026-12-12T00:00:00Z',
      ends_at: '2027-03-01T00:00:00Z',
      status: 'reviewing',
      original: { starts_at: '2026-12-12T09:00:00+09:00', ends_at: '2027-03-01T09:00:00+09:00', resource: { reward_points: 5 } },
      edited: null,
      created_resource: null,
      format_errors: [],
      updated_at: '2026-10-01T00:00:00Z',
      ...overrides,
    }
  }

  function seed(items: Array<Record<string, unknown>>, options: { sample?: boolean; books?: number } = {}) {
    h.state.tables.ops_bundles = [{ ...bundle(ID), is_sample: options.sample ?? false, bundle_id: 'b' }]
    h.state.tables.ops_bundle_items = items
    h.state.tables.ops_rules = SEED_ROWS.map((row) => ({ ...row }))
    h.state.tables.item_books = Array.from({ length: options.books ?? 0 }, () => ({ is_active: true, valid_from: null, valid_until: null }))
  }

  it('규칙·서비스 상태로 계산한 평가 결과가 기획 상세와 함께 온다', async () => {
    seed([launchItem('i1')], { books: 30 })
    const detail = await getOpsBundleDetail(ID)
    expect(detail!.items).toHaveLength(1)
    expect(detail!.balance.status).toBe('ok')
    if (detail!.balance.status !== 'ok') return
    const r1 = detail!.balance.warnings.find((w) => w.ruleKey === 'open_collections_max')
    expect(r1).toMatchObject({ itemId: 'i1', measured: 31, limit: 6, level: 'warn', provisional: true })
    expect(detail!.balance.checkedRuleCountByItem.i1).toBe(7)
    expect(detail!.balance.openCollectionsNow).toBe(30)
  })

  it('다른 묶음의 신규 개방도 센다(시험 묶음을 평가하면 시험 묶음끼리는 세지 않는다)', async () => {
    seed([launchItem('i1')], { sample: true })
    h.state.tables.ops_bundles.push({ ...bundle('other-real'), bundle_id: 'real' }, { ...bundle('other-sample'), is_sample: true, bundle_id: 'sample' })
    h.state.tables.ops_bundle_items.push(
      launchItem('x1', { bundle_id: 'other-real', starts_at: '2026-12-13T00:00:00Z', original: {} }),
      launchItem('x2', { bundle_id: 'other-sample', starts_at: '2026-12-13T00:00:00Z', original: {} })
    )
    const detail = await getOpsBundleDetail(ID)
    if (detail!.balance.status !== 'ok') throw new Error('평가가 성공해야 해요')
    const weekly = detail!.balance.warnings.find((w) => w.ruleKey === 'weekly_new_collections_max')
    expect(weekly?.measured).toBe(2) // i1 + 다른 실제 묶음의 x1. 시험 묶음의 x2는 세지 않는다
  })

  it('승인한 항목은 승인 시각이 리드타임 기준이다', async () => {
    seed([launchItem('i1', { status: 'scheduled' })])
    h.state.tables.ops_decisions = [
      { id: 'd1', bundle_id: ID, item_id: 'i1', action: 'approve', actor: 'a', batch_id: null, diff: null, reason: null, slack_result: null, created_at: '2026-10-20T00:00:00Z' },
      { id: 'd0', bundle_id: ID, item_id: 'i1', action: 'approve', actor: 'a', batch_id: null, diff: null, reason: null, slack_result: null, created_at: '2026-01-01T00:00:00Z' },
    ]
    const detail = await getOpsBundleDetail(ID)
    if (detail!.balance.status !== 'ok') throw new Error('평가가 성공해야 해요')
    // 공개 12/12, 가장 최근 승인 10/20 → 53일이라 R4는 통과다
    expect(detail!.balance.warnings.some((w) => w.ruleKey === 'launch_lead_days_min')).toBe(false)
  })

  it('규칙 조회가 실패해도 던지지 않고 failed를 담는다(기획 상세는 그대로 열린다)', async () => {
    seed([launchItem('i1')])
    h.state.errors.ops_rules = 'rules down'
    const detail = await getOpsBundleDetail(ID)
    expect(detail).not.toBeNull()
    expect(detail!.items.map((i) => i.id)).toEqual(['i1'])
    expect(detail!.balance).toEqual({ status: 'failed' })
  })

  it('규칙 테이블이 비어 있어도 failed다', async () => {
    seed([launchItem('i1')])
    h.state.tables.ops_rules = []
    expect((await getOpsBundleDetail(ID))!.balance).toEqual({ status: 'failed' })
  })

  it('규칙 테이블이 아직 없어도(마이그레이션 207 전) 던지지 않고 failed다', async () => {
    seed([launchItem('i1')])
    delete h.state.tables.ops_rules
    expect((await getOpsBundleDetail(ID))!.balance).toEqual({ status: 'failed' })
  })

  it('서비스 상태 하나를 못 읽으면 그 상태를 쓰는 규칙만 점검 못 함이다', async () => {
    seed([launchItem('i1')], { books: 30 })
    h.state.errors.item_books = 'books down'
    const detail = await getOpsBundleDetail(ID)
    if (detail!.balance.status !== 'ok') throw new Error('평가는 이어져야 해요')
    expect(detail!.balance.unreadable.map((u) => u.ruleKey)).toEqual(['open_collections_max'])
    expect(detail!.balance.openCollectionsNow).toBeNull()
    expect(detail!.balance.warnings.some((w) => w.ruleKey === 'weekly_new_collections_max')).toBe(false) // 주 한도는 1개뿐이라 통과
  })

  it('평가도 select 계열만 부르고 상태를 바꾸지 않는다', async () => {
    seed([launchItem('i1')], { books: 3 })
    const before = JSON.stringify(h.state.tables)
    await getOpsBundleDetail(ID)
    expect(h.state.calls.filter((c) => WRITE_CALL.test(c))).toEqual([])
    expect(JSON.stringify(h.state.tables)).toBe(before)
  })
})

describe('getOpsBundleDetail — 예약 등록 요약 (티켓 20261002_1648)', () => {
  const ID = '4ca7d1ad-43b2-41a3-9ed4-f03bc73604ee'
  const FUTURE = '2099-01-01T00:00:00Z'

  function row(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      bundle_id: ID,
      position: Number(id.replace(/\D/g, '')) || 0,
      item_key: id,
      kind: 'home_feed_card',
      pattern_no: null,
      starts_at: FUTURE,
      ends_at: null,
      status: 'approved',
      original: {},
      edited: null,
      created_resource: null,
      format_errors: [],
      updated_at: '2026-10-01T00:00:00Z',
      ...overrides,
    }
  }

  function seed(items: Array<Record<string, unknown>>) {
    h.state.tables.ops_bundles = [{ ...bundle(ID), bundle_id: 'b' }]
    h.state.tables.ops_bundle_items = items
    h.state.tables.ops_rules = SEED_ROWS.map((r) => ({ ...r }))
  }

  it('항목을 읽을 때 created_resource도 읽고, 화면 항목(OpsItemRecord)에는 싣지 않는다', async () => {
    seed([row('a1', { created_resource: { today_card_id: 'x' } })])
    const detail = await getOpsBundleDetail(ID)
    const itemSelect = h.state.selects.find((s) => s.table === 'ops_bundle_items')!
    expect(itemSelect.columns).toMatch(/\bcreated_resource\b/)
    expect(detail!.items[0]).not.toHaveProperty('created_resource')
    expect(detail!.items[0]).not.toHaveProperty('createdResource')
  })

  it('승인됨 수, 예약할 항목 수(지금 연결된 홈피드 카드·미션), 아직 연결하지 않은 종류(묶음 안 첫 등장 순)를 센다', async () => {
    seed([
      row('a1'), // 카드 승인됨, 먼 미래 → 예약할 항목
      row('a2', { kind: 'drop_schedule' }), // 승인됨이지만 핸들러 없음 → 못 하는 항목
      row('a3', { kind: 'collection_launch', status: 'reviewing' }), // 결정 전이라도 아직 연결하지 않은 종류에 든다
      row('a9', { kind: 'mission', status: 'reviewing' }), // 미션은 연결됐다(티켓 20261002_1944) → 안내에 들지 않는다
      row('a4', { kind: 'drop_schedule', status: 'reviewing' }), // 같은 종류는 한 번만
      row('a5', { kind: 'recipe', status: 'rejected' }), // 멈춘 항목은 센 대상이 아니다
      row('a6', { kind: 'jam_badge', status: 'ended' }), // 끝난 항목도 아니다
      row('a7', { kind: 'pattern_proposal', status: 'approved' }), // 예약 등록 대상이 아닌 종류는 연결 대상이 아니다
      row('a8', { kind: null, status: 'reviewing' }), // 종류를 읽을 수 없으면 세지 않는다
    ])
    const detail = await getOpsBundleDetail(ID)
    expect(detail!.execution).toEqual({ approvedCount: 3, readyCount: 1, unconnectedKinds: ['drop_schedule', 'collection_launch'] })
  })

  it('승인됨 항목이 없으면 approvedCount·readyCount가 0이다', async () => {
    seed([row('a1', { status: 'reviewing' })])
    expect((await getOpsBundleDetail(ID))!.execution).toEqual({ approvedCount: 0, readyCount: 0, unconnectedKinds: [] })
  })

  it('공개 시각이 지난 승인 항목은 예약할 항목에 세지 않는다(그래도 승인됨 수에는 든다)', async () => {
    seed([row('a1', { starts_at: '2020-01-01T00:00:00Z' })])
    expect((await getOpsBundleDetail(ID))!.execution).toMatchObject({ approvedCount: 1, readyCount: 0 })
  })

  it('요약을 만들 때도 select 계열만 부르고 상태를 바꾸지 않는다', async () => {
    seed([row('a1'), row('a2', { kind: 'mission' })])
    const before = JSON.stringify(h.state.tables)
    await getOpsBundleDetail(ID)
    expect(h.state.calls.filter((c) => WRITE_CALL.test(c))).toEqual([])
    expect(JSON.stringify(h.state.tables)).toBe(before)
  })
})

describe('buildOpsExecution — 핸들러를 주입해 센다', () => {
  const fakeHandler = {} as ExecuteHandler
  const handlers: ExecuteHandlerRegistry = { mission: fakeHandler }

  function exec(id: string, overrides: Partial<ExecuteItem> = {}): ExecuteItem {
    return {
      id,
      bundle_id: 'b',
      position: Number(id.replace(/\D/g, '')) || 0,
      item_key: id,
      kind: 'mission',
      status: 'approved',
      starts_at: '2099-01-01T00:00:00Z',
      ends_at: null,
      pattern_no: null,
      original: {},
      edited: null,
      created_resource: null,
      format_errors: [],
      updated_at: '2026-10-01T00:00:00Z',
      ...overrides,
    }
  }

  const NOW = new Date('2026-10-02T00:00:00Z')

  it('핸들러가 붙은 종류는 예약할 항목에 세고 안내에서 뺀다', () => {
    const items = [exec('m1'), exec('c1', { kind: 'home_feed_card' }), exec('r1', { kind: 'recipe', status: 'reviewing' })]
    expect(buildOpsExecution(items, NOW, handlers)).toEqual({ approvedCount: 2, readyCount: 1, unconnectedKinds: ['home_feed_card', 'recipe'] })
  })

  it('종류 이름이 `constructor` 같은 객체 기본 속성이어도 연결하지 않은 종류로 세지 않는다', () => {
    const items = [exec('x1', { kind: 'constructor', status: 'reviewing' })]
    expect(buildOpsExecution(items, NOW, {})).toEqual({ approvedCount: 0, readyCount: 0, unconnectedKinds: [] })
  })

  it('사전 점검이 던져도 던지지 않고 예약할 항목 0개·안내 없음으로 돌려준다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const throwing: ExecuteHandlerRegistry = {}
    Object.defineProperty(throwing, 'mission', {
      enumerable: true,
      get() {
        throw new Error('boom')
      },
    })
    expect(buildOpsExecution([exec('m1')], NOW, throwing)).toEqual({ approvedCount: 1, readyCount: 0, unconnectedKinds: [] })
  })
})
