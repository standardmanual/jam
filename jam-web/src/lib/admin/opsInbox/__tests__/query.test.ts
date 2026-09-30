/**
 * 받은 기획함 조회 (티켓 20260930_1817)
 *
 * 서비스 클라이언트는 메모리 안의 가짜 DB로 바꾼다(실 DB에 접속하지 않는다). 지키는 것:
 * - 목록 조건 읽기, 탭별 개수·거르기·정렬·50건 자르기
 * - 1000행을 넘어도 끝까지 받는다
 * - **`listOpsBundles`·`getOpsBundleDetail`은 select 계열만 부르고 insert·update·upsert·delete를 부르지 않는다**
 *   (읽기만으로 상태가 바뀌지 않는다는 완료 조건)
 * - 목록은 제출 원본(`raw`)을 가져오지 않는다
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  type Result = { data: unknown; error: { message: string } | null }

  const state = {
    tables: { ops_bundles: [], ops_bundle_items: [], ops_decisions: [] } as Record<string, Row[]>,
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

import {
  buildOpsBundleList,
  getOpsBundleDetail,
  listOpsBundles,
  parseOpsInboxParams,
  type OpsInboxParams,
} from '../query'

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
  h.state.tables = { ops_bundles: [], ops_bundle_items: [], ops_decisions: [] }
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
