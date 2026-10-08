/**
 * 운영 신호 조회 (티켓 20261001_1155)
 *
 * 서비스 클라이언트는 메모리 안의 가짜 DB로 바꾼다(실 DB에 접속하지 않는다). 지키는 것:
 * - **select 계열만 부르고 insert·update·upsert·delete를 부르지 않는다**
 * - 카드 행을 그대로 `resolveShape`에 넘겨 옛 카드의 모양을 채운다(커버 없이 배지가 걸린 옛 large_thumbnail은 square)
 * - 1000행을 넘어도 끝까지 받는다
 * - 제출 원본(`raw`)은 끝나지 않은 묶음의 것만 따로 받는다
 * - 행동 건수는 행을 가져오지 않고(`head`) 센다
 * - 원천 하나가 실패하면 그 원천에 기대는 신호만 `load_failed`다
 * - 「획득 경로가 막힌 컬렉션」은 얻을 길 계산 입력(`itemPaths/load`는 가짜)으로 진행 중인 컬렉션만 세고, 읽지 못하면 이 신호만 `load_failed`다(티켓 20261008_1301)
 * - 「예약됨」·「게재중」 컬렉션 항목이 만든 컬렉션의 아이템 배지 수를 `badges`에서 읽는다(티켓 20261004_2242). 대상이 없으면 조회하지 않고, 읽지 못하면 「비어 있는 컨텐츠」가 `load_failed`다
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  type Result = { data: unknown; count?: number | null; error: { message: string } | null }

  const state = {
    tables: {} as Record<string, Row[]>,
    /** 테이블 전체가 실패하게 한다. */
    errors: {} as Record<string, string>,
    /** 선택한 열 목록으로 실패 여부를 정한다(예: 제출 원본을 받는 요청만 실패). */
    errorWhen: null as null | ((table: string, columns: string) => string | null),
    calls: [] as string[],
    selects: [] as Array<{ table: string; columns: string; head: boolean; filters: string[] }>,
  }

  function time(value: unknown): number | null {
    if (typeof value !== 'string') return null
    const ms = Date.parse(value)
    return Number.isNaN(ms) ? null : ms
  }

  function compare(a: unknown, b: unknown): number | null {
    const ta = time(a)
    const tb = time(b)
    if (ta !== null && tb !== null) return ta - tb
    if (typeof a === 'number' && typeof b === 'number') return a - b
    if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0
    return null
  }

  class Query implements PromiseLike<Result> {
    private filters: Array<(row: Row) => boolean> = []
    private filterNotes: string[] = []
    private orders: Array<{ col: string; asc: boolean }> = []
    private window: [number, number] | null = null
    private columns = ''
    private head = false

    constructor(private table: string) {}

    private note(method: string) {
      state.calls.push(`${this.table}.${method}`)
    }

    select(columns: string, opts?: { count?: string; head?: boolean }) {
      this.note('select')
      this.columns = columns
      this.head = opts?.head === true
      return this
    }
    private addFilter(label: string, test: (row: Row) => boolean) {
      this.filterNotes.push(label)
      this.filters.push(test)
      return this
    }
    eq(col: string, val: unknown) {
      this.note('eq')
      return this.addFilter(`eq:${col}:${val}`, (row) => row[col] === val)
    }
    gte(col: string, val: unknown) {
      this.note('gte')
      return this.addFilter(`gte:${col}:${val}`, (row) => {
        const c = compare(row[col], val)
        return c !== null && c >= 0
      })
    }
    lte(col: string, val: unknown) {
      this.note('lte')
      return this.addFilter(`lte:${col}:${val}`, (row) => {
        const c = compare(row[col], val)
        return c !== null && c <= 0
      })
    }
    lt(col: string, val: unknown) {
      this.note('lt')
      return this.addFilter(`lt:${col}:${val}`, (row) => {
        const c = compare(row[col], val)
        return c !== null && c < 0
      })
    }
    is(col: string, val: unknown) {
      this.note('is')
      return this.addFilter(`is:${col}:${val}`, (row) => (row[col] ?? null) === val)
    }
    in(col: string, values: unknown[]) {
      this.note('in')
      return this.addFilter(`in:${col}:${values.join(',')}`, (row) => values.includes(row[col]))
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
    // 쓰기 메서드: 부르면 기록한다(읽기 전용 시험이 쓰기를 부르는 순간 잡는다)
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
      state.selects.push({ table: this.table, columns: this.columns, head: this.head, filters: this.filterNotes })
      const message = state.errors[this.table] ?? state.errorWhen?.(this.table, this.columns) ?? null
      if (message) return { data: null, count: null, error: { message } }
      let rows = (state.tables[this.table] ?? []).filter((row) => this.filters.every((f) => f(row)))
      if (this.head) return { data: null, count: rows.length, error: null }
      for (const { col, asc } of [...this.orders].reverse()) {
        rows = [...rows].sort((a, b) => {
          const c = compare(a[col], b[col]) ?? 0
          return asc ? c : -c
        })
      }
      if (this.window) rows = rows.slice(this.window[0], this.window[1] + 1)
      return { data: rows, count: null, error: null }
    }
  }

  /** 얻을 길 계산 입력(`loadItemPathInputs`)을 대신하는 가짜. 기본은 빈 입력이다. */
  const paths = {
    inputs: { collections: [], items: [], recipes: [], missions: [] } as {
      collections: unknown[]
      items: unknown[]
      recipes: unknown[]
      missions: unknown[]
    },
    error: null as string | null,
    calls: 0,
  }

  return { state, Query, paths }
})

vi.mock('@/lib/admin/itemPaths/load', () => ({
  loadItemPathInputs: async () => {
    h.paths.calls += 1
    if (h.paths.error) throw new Error(h.paths.error)
    return h.paths.inputs
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: (table: string) => new h.Query(table) }),
}))

import {
  DAY_COMPOSITIONS_MAX_DAYS,
  DAY_COMPOSITIONS_PERIOD_INVALID_MESSAGE,
  DAY_COMPOSITIONS_PERIOD_ORDER_MESSAGE,
  DAY_COMPOSITIONS_PERIOD_TOO_LONG_MESSAGE,
  DayCompositionPeriodError,
  loadDayCompositions,
  loadOpsSignals,
} from '../load'
import { NOW, cardOriginal, dayEnd, dayStart, kst } from './fixtures'

const WRITE_CALL = /\.(insert|update|upsert|delete)$/
const OLD = Date.parse('2026-01-01T00:00:00+09:00')

function cardRow(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    title: `카드 ${id}`,
    starts_at: dayStart('2026-10-01'),
    ends_at: dayEnd('2026-10-01'),
    is_active: true,
    sort_order: 0,
    shape: null,
    template_type: 'badge_spotlight',
    layout_type: 'large_thumbnail',
    cover_image_url: 'https://example.com/cover.png',
    badge_ids: [],
    exposure_tags: ['all'],
    ...over,
  }
}

function bundleRow(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    week: null,
    is_sample: false,
    received_at: kst('2026-10-01', '08:00'),
    format_errors: [],
    raw: { excluded_items: [] },
    ...over,
  }
}

function itemRow(id: string, bundleId: string, over: Record<string, unknown> = {}) {
  return {
    id,
    bundle_id: bundleId,
    position: 0,
    item_key: id,
    kind: 'drop_schedule',
    pattern_no: null,
    starts_at: null,
    ends_at: null,
    status: 'arrived',
    original: {},
    edited: null,
    format_errors: [],
    updated_at: kst('2026-10-01', '09:00'),
    created_resource: null,
    ...over,
  }
}

/** 최근 7일 안(NOW 기준)의 시각을 만든다. */
const recent = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 24 * 3600_000).toISOString()

function rowsWith(count: number, make: (n: number) => Record<string, unknown>): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, n) => make(n))
}

function signal(result: Awaited<ReturnType<typeof loadOpsSignals>>, key: string) {
  const found = result.signals.find((entry) => entry.key === key)
  if (!found) throw new Error(`신호 ${key}가 없다`)
  return found
}

beforeEach(() => {
  h.state.tables = {
    today_cards: [],
    missions: [],
    ops_bundles: [],
    ops_bundle_items: [],
    user_combine_success_logs: [],
    user_combine_fail_logs: [],
    poi_drops: [],
    user_mission_completions: [],
    user_item_book_completions: [],
    badges: [],
  }
  h.state.errors = {}
  h.state.errorWhen = null
  h.state.calls = []
  h.state.selects = []
  h.paths.inputs = { collections: [], items: [], recipes: [], missions: [] }
  h.paths.error = null
  h.paths.calls = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('loadOpsSignals — 읽기만 한다', () => {
  it('select 계열만 부르고 쓰기 메서드를 부르지 않는다', async () => {
    h.state.tables.today_cards = [cardRow('c1')]
    h.state.tables.ops_bundles = [bundleRow('b1')]
    h.state.tables.ops_bundle_items = [itemRow('i1', 'b1')]
    await loadOpsSignals({ now: NOW })
    expect(h.state.calls.length).toBeGreaterThan(0)
    expect(h.state.calls.filter((call) => WRITE_CALL.test(call))).toEqual([])
  })

  it('13종을 catalog 순서로 돌려주고 읽지 못한 원천이 없으면 sourceErrors가 비어 있다', async () => {
    const result = await loadOpsSignals({ now: NOW })
    expect(result.signals).toHaveLength(13)
    expect(result.sourceErrors).toEqual({})
    expect(result.includeSample).toBe(false)
  })
})

describe('loadDayCompositions — 기간을 받는 날짜 구성(티켓 20261006_1339)', () => {
  const CARD_ID = '3f1b2c9e-0d6a-4b7e-9a51-2c8d7e6f5a40'

  it('select 계열만 부르고 제출 원본(raw)은 받지 않는다', async () => {
    h.state.tables.today_cards = [cardRow('c1')]
    h.state.tables.ops_bundles = [bundleRow('b1')]
    h.state.tables.ops_bundle_items = [itemRow('i1', 'b1', { status: 'arrived' })]
    await loadDayCompositions({ from: '2026-10-01', to: '2026-10-03' })
    expect(h.state.calls.length).toBeGreaterThan(0)
    expect(h.state.calls.filter((call) => WRITE_CALL.test(call))).toEqual([])
    expect(h.state.selects.filter((entry) => entry.columns.includes('raw'))).toEqual([])
  })

  it('기간의 날짜마다 구성 한 건을 날짜 순으로 돌려준다(양 끝 포함)', async () => {
    const result = await loadDayCompositions({ from: '2026-10-01', to: '2026-10-04' })
    expect(result.compositions.map((day) => day.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(result.sourceErrors).toEqual({})
    expect(result.bundles).toEqual([])
  })

  it('기간에 걸치는 카드·미션만 읽고, 걸치지 않는 것은 읽지 않는다', async () => {
    h.state.tables.today_cards = [
      cardRow('in', { starts_at: dayStart('2026-10-02'), ends_at: dayEnd('2026-10-02') }),
      cardRow('before', { starts_at: dayStart('2026-09-20'), ends_at: dayEnd('2026-09-20') }),
      cardRow('after', { starts_at: dayStart('2026-11-20'), ends_at: dayEnd('2026-11-20') }),
    ]
    h.state.tables.missions = [
      { id: 'm-in', title: '진행 중', starts_at: dayStart('2026-09-30'), ends_at: null },
      { id: 'm-over', title: '끝남', starts_at: dayStart('2026-09-01'), ends_at: dayEnd('2026-09-10') },
    ]
    const result = await loadDayCompositions({ from: '2026-10-01', to: '2026-10-03' })
    const ids = result.compositions.flatMap((day) => day.cards.map((card) => card.id))
    expect(ids).toEqual(['in'])
    expect(result.compositions.flatMap((day) => day.missions.map((mission) => mission.id))).toEqual(['m-in', 'm-in', 'm-in'])
  })

  it('실제 카드와 그 운영 항목(created_resource)은 한 칸으로 합쳐서 한 번만 센다', async () => {
    h.state.tables.today_cards = [cardRow(CARD_ID, { title: '실제 제목' })]
    h.state.tables.ops_bundles = [bundleRow('b1')]
    h.state.tables.ops_bundle_items = [
      itemRow('i1', 'b1', {
        kind: 'home_feed_card',
        status: 'live',
        starts_at: dayStart('2026-10-01'),
        ends_at: dayEnd('2026-10-01'),
        original: cardOriginal(),
        created_resource: { today_card_id: CARD_ID },
      }),
    ]
    const result = await loadDayCompositions({ from: '2026-10-01', to: '2026-10-01' })
    const cards = result.compositions[0].cards
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ source: 'bundle', id: 'i1', resourceId: CARD_ID, bundleId: 'b1', title: '실제 제목', status: 'live' })
  })

  it('시험 묶음은 기본으로 읽지 않고, 포함하면 읽어 표식을 붙인다', async () => {
    h.state.tables.ops_bundles = [bundleRow('real'), bundleRow('sample', { is_sample: true })]
    h.state.tables.ops_bundle_items = [
      itemRow('i1', 'real', { kind: 'home_feed_card', starts_at: dayStart('2026-10-01'), ends_at: dayEnd('2026-10-01'), original: cardOriginal() }),
      itemRow('i2', 'sample', { kind: 'home_feed_card', starts_at: dayStart('2026-10-01'), ends_at: dayEnd('2026-10-01'), original: cardOriginal(), created_resource: { sample: true } }),
    ]
    const without = await loadDayCompositions({ from: '2026-10-01', to: '2026-10-01' })
    expect(without.compositions[0].cards.map((card) => card.id)).toEqual(['i1'])
    const withSample = await loadDayCompositions({ from: '2026-10-01', to: '2026-10-01', includeSample: true })
    expect(withSample.compositions[0].cards.map((card) => [card.id, card.isSample]).sort()).toEqual([
      ['i1', false],
      ['i2', true],
    ])
  })

  it('기간이 틀리면 DB를 읽기 전에 던진다(형식·없는 날짜·순서·상한)', async () => {
    const attempts: Array<[{ from: string; to: string }, string]> = [
      [{ from: '2026-10', to: '2026-10-03' }, DAY_COMPOSITIONS_PERIOD_INVALID_MESSAGE],
      [{ from: '2026-10-01', to: '내일' }, DAY_COMPOSITIONS_PERIOD_INVALID_MESSAGE],
      [{ from: '2026-02-30', to: '2026-03-02' }, DAY_COMPOSITIONS_PERIOD_INVALID_MESSAGE],
      [{ from: '2026-10-05', to: '2026-10-01' }, DAY_COMPOSITIONS_PERIOD_ORDER_MESSAGE],
      [{ from: '2026-10-01', to: '2027-01-01' }, DAY_COMPOSITIONS_PERIOD_TOO_LONG_MESSAGE],
    ]
    for (const [period, message] of attempts) {
      const error = await loadDayCompositions(period).catch((caught: unknown) => caught)
      expect(error, JSON.stringify(period)).toBeInstanceOf(DayCompositionPeriodError)
      expect((error as Error).message).toBe(message)
    }
    expect(h.state.calls).toEqual([])
  })

  it('상한은 양 끝을 포함해 92일이다', async () => {
    expect(DAY_COMPOSITIONS_MAX_DAYS).toBe(92)
    const ok = await loadDayCompositions({ from: '2026-10-01', to: '2026-12-31' }) // 92일
    expect(ok.compositions).toHaveLength(92)
    await expect(loadDayCompositions({ from: '2026-10-01', to: '2027-01-01' })).rejects.toBeInstanceOf(DayCompositionPeriodError) // 93일
  })

  it('원천 하나를 읽지 못해도 던지지 않고 sourceErrors에 담는다(없다고 단정하지 않는다)', async () => {
    h.state.errors = { today_cards: '카드 오류' }
    const cardsFailed = await loadDayCompositions({ from: '2026-10-01', to: '2026-10-02' })
    expect(cardsFailed.sourceErrors).toEqual({ cards: '카드 오류' })
    expect(cardsFailed.compositions).toHaveLength(2)
    expect(cardsFailed.bundles).toEqual([])

    h.state.errors = { ops_bundles: '묶음 오류' }
    const bundlesFailed = await loadDayCompositions({ from: '2026-10-01', to: '2026-10-02' })
    expect(bundlesFailed.sourceErrors).toEqual({ bundles: '묶음 오류' })
    expect(bundlesFailed.bundles).toBeNull()

    h.state.errors = { missions: '미션 오류' }
    const missionsFailed = await loadDayCompositions({ from: '2026-10-01', to: '2026-10-02' })
    expect(missionsFailed.sourceErrors).toEqual({ missions: '미션 오류' })
  })

  it('1000행을 넘는 항목도 끝까지 받는다', async () => {
    h.state.tables.ops_bundles = [bundleRow('b1')]
    h.state.tables.ops_bundle_items = rowsWith(1_150, (n) =>
      itemRow(`i${String(n).padStart(4, '0')}`, 'b1', {
        kind: 'drop_schedule',
        status: 'scheduled',
        starts_at: dayStart('2026-10-01'),
        ends_at: dayEnd('2026-10-01'),
        position: n,
      })
    )
    const result = await loadDayCompositions({ from: '2026-10-01', to: '2026-10-01' })
    expect(result.compositions[0].bundleItems).toHaveLength(1_150)
  })
})

describe('loadOpsSignals — 카드와 resolveShape', () => {
  async function shapesOf(rows: Array<Record<string, unknown>>): Promise<Record<string, string>> {
    h.state.tables.today_cards = rows
    const result = await loadOpsSignals({ now: NOW })
    const day = result.compositions.find((entry) => entry.date === '2026-10-01')
    return Object.fromEntries((day?.cards ?? []).map((card) => [card.id, card.shape]))
  }

  it('카드 행을 그대로 resolveShape에 넘겨 옛 카드의 모양을 채운다', async () => {
    const shapes = await shapesOf([
      // 모양이 저장된 카드는 그 값 그대로
      cardRow('stored', { shape: 'poster' }),
      // 커버가 없고 배지가 걸린 옛 large_thumbnail은 첫 배지 그림이 커버로 올라가던 카드라 square
      cardRow('badge-promoted', { cover_image_url: null, badge_ids: ['b-1'] }),
      // 커버가 있는 옛 large_thumbnail은 hero
      cardRow('legacy-hero'),
      // 기사는 레이아웃과 상관없이 hero
      cardRow('article', { template_type: 'editorial_article', layout_type: 'shortcut', cover_image_url: null }),
      // 배너는 커버가 있으면 poster, 없으면 brief
      cardRow('banner', { layout_type: 'banner' }),
      cardRow('banner-no-cover', { layout_type: 'banner', cover_image_url: null }),
      // 배지목록·순위·바로가기
      cardRow('gallery', { layout_type: 'badge_gallery' }),
      cardRow('shortcut', { layout_type: 'shortcut' }),
    ])
    expect(shapes).toEqual({
      stored: 'poster',
      'badge-promoted': 'square',
      'legacy-hero': 'hero',
      article: 'hero',
      banner: 'poster',
      'banner-no-cover': 'brief',
      gallery: 'list',
      shortcut: 'brief',
    })
  })

  it('옛 카드는 이미지가 없어도 「이미지가 빈 항목」이 아니고 모양이 저장된 카드는 커버가 없으면 그렇다(A8)', async () => {
    h.state.tables.today_cards = [
      cardRow('legacy-no-cover', { cover_image_url: null }),
      cardRow('stored-no-cover', { shape: 'hero', cover_image_url: null }),
    ]
    const result = await loadOpsSignals({ now: NOW })
    const cards = result.compositions.find((entry) => entry.date === '2026-10-01')?.cards ?? []
    expect(cards.find((card) => card.id === 'legacy-no-cover')?.imageMissing).toBe(false)
    expect(cards.find((card) => card.id === 'stored-no-cover')?.imageMissing).toBe(true)
  })

  it('활성 카드만, 검사 범위(앞 6일~다음 주 일요일)에 걸치는 카드만 읽는다', async () => {
    h.state.tables.today_cards = [
      cardRow('in-range'),
      cardRow('inactive', { is_active: false }),
      cardRow('ended-before', { starts_at: dayStart('2026-09-20'), ends_at: dayEnd('2026-09-24') }),
    ]
    const result = await loadOpsSignals({ now: NOW })
    const ids = result.compositions.flatMap((day) => day.cards.map((card) => card.id))
    expect(new Set(ids)).toEqual(new Set(['in-range']))

    // 범위: 오늘(10/1)의 앞 6일 0시(9/25 KST)부터 이번 주 월요일(9/28)에서 13일 뒤인 다음 주 일요일(10/11)의 마지막까지
    const select = h.state.selects.find((entry) => entry.table === 'today_cards')
    expect(select?.filters).toEqual([
      'eq:is_active:true',
      'lte:starts_at:2026-10-11T14:59:59.999Z',
      'gte:ends_at:2026-09-24T15:00:00.000Z',
    ])
  })

  it('1000행을 넘는 카드도 끝까지 받는다', async () => {
    h.state.tables.today_cards = rowsWith(1_250, (n) => cardRow(`c${String(n).padStart(4, '0')}`, { exposure_tags: ['x'] }))
    const result = await loadOpsSignals({ now: NOW })
    const day = result.compositions.find((entry) => entry.date === '2026-10-01')
    expect(day?.cards).toHaveLength(1_250)
    expect(h.state.calls.filter((call) => call === 'today_cards.range')).toHaveLength(2)
  })
})

describe('loadOpsSignals — 운영 묶음', () => {
  it('묶음 목록은 제출 원본을 가져오지 않고, 원본은 끝나지 않은 묶음의 것만 따로 받는다', async () => {
    h.state.tables.ops_bundles = [bundleRow('open'), bundleRow('closed')]
    h.state.tables.ops_bundle_items = [
      itemRow('i1', 'open', { status: 'arrived' }),
      itemRow('i2', 'closed', { status: 'ended' }),
    ]
    await loadOpsSignals({ now: NOW })
    const bundleSelects = h.state.selects.filter((entry) => entry.table === 'ops_bundles')
    const list = bundleSelects.filter((entry) => !entry.columns.includes('raw'))
    const raw = bundleSelects.filter((entry) => entry.columns.includes('raw'))
    expect(list.length).toBeGreaterThan(0)
    expect(raw).toHaveLength(1)
    expect(raw[0].filters).toEqual(['in:id:open'])
  })

  it('끝나지 않은 묶음의 뺀 항목은 읽은 원본에서 신호로 올라온다', async () => {
    h.state.tables.ops_bundles = [
      bundleRow('open', { raw: { excluded_items: [{ reason: '밸런스 점검에서 중단이 나왔어요.', stage: 'balance_check' }] } }),
    ]
    h.state.tables.ops_bundle_items = [itemRow('i1', 'open', { status: 'reviewing' })]
    const result = await loadOpsSignals({ now: NOW })
    const excluded = signal(result, 'excluded_items')
    expect(excluded.state).toBe('raised')
    expect(excluded.results[0].message).toContain('밸런스 점검에서 에이전트가 항목을 뺐어요')
    expect(excluded.results[0].bundleId).toBe('open')
  })

  it('원본이 열두 묶음이어도 열 개씩 나눠 받는다', async () => {
    h.state.tables.ops_bundles = rowsWith(12, (n) => bundleRow(`b${n}`))
    h.state.tables.ops_bundle_items = rowsWith(12, (n) => itemRow(`i${n}`, `b${n}`, { status: 'arrived' }))
    await loadOpsSignals({ now: NOW })
    const raw = h.state.selects.filter((entry) => entry.table === 'ops_bundles' && entry.columns.includes('raw'))
    expect(raw).toHaveLength(2)
  })

  it('시험 묶음은 기본으로 읽지 않고, 포함하면 읽어 표식을 붙인다', async () => {
    h.state.tables.ops_bundles = [bundleRow('real'), bundleRow('sample', { is_sample: true })]
    h.state.tables.ops_bundle_items = [
      itemRow('i1', 'real', { status: 'failed' }),
      itemRow('i2', 'sample', { status: 'failed' }),
    ]
    const without = await loadOpsSignals({ now: NOW })
    expect(signal(without, 'execution_failed').results.map((entry) => entry.bundleId)).toEqual(['real'])

    const withSample = await loadOpsSignals({ now: NOW, includeSample: true })
    const failed = signal(withSample, 'execution_failed').results
    expect(failed.map((entry) => [entry.bundleId, entry.isSample]).sort()).toEqual([
      ['real', false],
      ['sample', true],
    ])
  })

  it('1000행을 넘는 항목도 끝까지 받는다', async () => {
    h.state.tables.ops_bundles = [bundleRow('b1')]
    h.state.tables.ops_bundle_items = rowsWith(1_150, (n) => itemRow(`i${String(n).padStart(4, '0')}`, 'b1', { status: 'failed', position: n }))
    const result = await loadOpsSignals({ now: NOW })
    expect(signal(result, 'execution_failed').results).toHaveLength(1_150)
  })

  it('운영 묶음 홈피드 카드는 제출 원본의 칸(모양·노출 대상)을 읽어 날짜 구성에 들어간다', async () => {
    h.state.tables.ops_bundles = [bundleRow('b1')]
    h.state.tables.ops_bundle_items = [
      itemRow('i1', 'b1', {
        kind: 'home_feed_card',
        starts_at: dayStart('2026-10-02'),
        ends_at: dayEnd('2026-10-02'),
        original: cardOriginal({ shape: 'poster' }),
      }),
    ]
    const result = await loadOpsSignals({ now: NOW })
    const card = result.compositions.find((entry) => entry.date === '2026-10-02')?.cards[0]
    expect(card).toMatchObject({ source: 'bundle', id: 'i1', shape: 'poster', exposureTags: ['all'] })
  })
})

describe('loadOpsSignals — 행동 건수', () => {
  it('행을 가져오지 않고(head) 최근 7일과 직전 4주를 센다', async () => {
    await loadOpsSignals({ now: NOW })
    const actionTables = [
      'user_combine_success_logs',
      'user_combine_fail_logs',
      'poi_drops',
      'user_mission_completions',
      'user_item_book_completions',
    ]
    for (const table of actionTables) {
      const selects = h.state.selects.filter((entry) => entry.table === table)
      expect(selects.length, table).toBeGreaterThan(0)
      expect(selects.every((entry) => entry.head), table).toBe(true)
    }
  })

  it('유저 드랍은 유저가 놓은 것만, 믹스 시도는 성공과 실패를 더해서 센다', async () => {
    h.state.tables.poi_drops = [
      ...rowsWith(15, (n) => ({ id: `u${n}`, source: 'user', dropped_at: recent(1), picked_up_at: null })),
      ...rowsWith(40, (n) => ({ id: `s${n}`, source: 'system', dropped_at: recent(1), picked_up_at: null })),
    ]
    h.state.tables.user_combine_success_logs = rowsWith(2, (n) => ({ id: `ok${n}`, attempted_at: recent(2) }))
    h.state.tables.user_combine_fail_logs = rowsWith(3, (n) => ({ id: `fail${n}`, attempted_at: recent(2) }))
    const result = await loadOpsSignals({ now: NOW })
    const spike = signal(result, 'action_spike')
    expect(spike.state).toBe('raised')
    const messages = spike.results.map((entry) => entry.message)
    // 유저 드랍 15건(최소 15건에 닿음), 믹스 시도는 2+3=5건(최소 5건에 닿음). 시스템 드랍 40건은 세지 않는다.
    expect(messages).toContain('유저 드랍: 최근 7일 15건이에요. 직전 4주에는 한 건도 없었어요.')
    expect(messages).toContain('믹스 시도: 최근 7일 5건이에요. 직전 4주에는 한 건도 없었어요.')
    expect(messages.some((message) => message.startsWith('픽업'))).toBe(false)
  })

  it('직전 4주 합계를 주평균으로 바꿔 배수와 맞댄다(픽업 최근 30건, 직전 4주 60건 = 주 15건의 2배)', async () => {
    h.state.tables.poi_drops = [
      ...rowsWith(30, (n) => ({ id: `r${n}`, source: 'user', dropped_at: recent(30), picked_up_at: recent(3) })),
      ...rowsWith(60, (n) => ({ id: `b${n}`, source: 'user', dropped_at: recent(40), picked_up_at: recent(10 + (n % 20)) })),
    ]
    const result = await loadOpsSignals({ now: NOW })
    const messages = signal(result, 'action_spike').results.map((entry) => entry.message)
    expect(messages).toContain('픽업: 최근 7일 30건으로, 직전 4주 평균(주 15건)의 2배예요.')
  })

  it('7일과 35일 밖의 건수는 세지 않는다', async () => {
    h.state.tables.user_mission_completions = [
      ...rowsWith(5, (n) => ({ id: `old${n}`, completed_at: new Date(OLD).toISOString() })),
      ...rowsWith(1, (n) => ({ id: `edge${n}`, completed_at: recent(34) })),
    ]
    const result = await loadOpsSignals({ now: NOW })
    expect(signal(result, 'action_spike').state).toBe('clear')
  })
})

describe('loadOpsSignals — 원천 하나가 실패하면 그 원천에 기대는 신호만 load_failed다', () => {
  const states = (result: Awaited<ReturnType<typeof loadOpsSignals>>) =>
    Object.fromEntries(result.signals.map((entry) => [entry.key, entry.state === 'unchecked' ? entry.uncheckedReason : entry.state]))

  beforeEach(() => {
    h.state.tables.today_cards = [cardRow('c1', { exposure_tags: ['all'] })]
    h.state.tables.ops_bundles = [bundleRow('b1')]
    h.state.tables.ops_bundle_items = [itemRow('i1', 'b1', { status: 'failed' })]
  })

  it('묶음 조회가 실패하면 상태 신호 6종과 날짜 구성 신호 4종이 load_failed이고 나머지는 계산한다', async () => {
    h.state.errors.ops_bundles = '연결 끊김'
    const result = await loadOpsSignals({ now: NOW })
    expect(result.sourceErrors.bundles).toBe('연결 끊김')
    const byKey = states(result)
    for (const key of [
      'execution_failed',
      'missed_schedule',
      'routine_failed',
      'format_error',
      'approval_deadline',
      'excluded_items',
      'empty_content',
      'no_new_content',
      'overlap',
      'monotony',
    ]) {
      expect(byKey[key], key).toBe('load_failed')
    }
    expect(byKey.action_spike).toBe('clear')
    expect(byKey.balance_warning).toBe('not_built')
    expect(byKey.blocked_collection).toBe('clear')
  })

  it('카드 조회가 실패하면 날짜 구성 신호 4종만 load_failed이고 상태 신호는 계산한다', async () => {
    h.state.errors.today_cards = '시간 초과'
    const result = await loadOpsSignals({ now: NOW })
    expect(result.sourceErrors.cards).toBe('시간 초과')
    const byKey = states(result)
    for (const key of ['empty_content', 'no_new_content', 'overlap', 'monotony']) expect(byKey[key], key).toBe('load_failed')
    expect(byKey.execution_failed).toBe('raised')
    expect(byKey.format_error).toBe('clear')
  })

  it('행동 건수 조회가 하나라도 실패하면 행동 횟수 급증만 load_failed이다', async () => {
    h.state.errors.user_item_book_completions = '권한 없음'
    const result = await loadOpsSignals({ now: NOW })
    expect(result.sourceErrors.actions).toBe('권한 없음')
    const byKey = states(result)
    expect(byKey.action_spike).toBe('load_failed')
    expect(byKey.execution_failed).toBe('raised')
    expect(byKey.empty_content).not.toBe('load_failed')
  })

  it('미션 조회가 실패해도 어떤 신호도 load_failed가 되지 않는다', async () => {
    h.state.errors.missions = '실패'
    const result = await loadOpsSignals({ now: NOW })
    expect(result.sourceErrors.missions).toBe('실패')
    expect(result.signals.some((entry) => entry.uncheckedReason === 'load_failed')).toBe(false)
  })

  it('제출 원본만 읽지 못하면 그 묶음의 뺀 항목 목록을 읽지 못했다고 알리고 나머지 신호는 그대로다', async () => {
    h.state.tables.ops_bundle_items = [itemRow('i1', 'b1', { status: 'arrived' })]
    h.state.errorWhen = (table, columns) => (table === 'ops_bundles' && columns.includes('raw') ? '원본 읽기 실패' : null)
    const result = await loadOpsSignals({ now: NOW })
    expect(result.sourceErrors).toEqual({ bundle_raw: '원본 읽기 실패' })
    const excluded = signal(result, 'excluded_items')
    expect(excluded.state).toBe('raised')
    expect(excluded.results[0].message).toContain('뺀 항목 목록을 읽지 못했어요')
    expect(signal(result, 'format_error').state).toBe('clear')
  })

  it('실패한 원천은 서버 로그에 남긴다', async () => {
    h.state.errors.today_cards = '시간 초과'
    await loadOpsSignals({ now: NOW })
    expect(console.error).toHaveBeenCalled()
  })
})

describe('loadOpsSignals — 아이템이 없는 컬렉션 (티켓 20261004_2242)', () => {
  const BOOK = '5b0c7e92-1d34-4f6a-8a5e-2c9d1e7f4b60'
  const OTHER_BOOK = '7a1c0d3e-9b2f-4c5d-8e6a-1f2b3c4d5e6f'
  const WRITE = /\.(insert|update|upsert|delete)$/
  const bookItem = (id: string, bookId: string | null, over: Record<string, unknown> = {}) =>
    itemRow(id, 'b1', {
      kind: 'collection_launch',
      status: 'scheduled',
      starts_at: kst('2026-10-05', '09:00'),
      original: { copy: { name: `컬렉션 ${id}` } },
      created_resource: bookId ? { item_book_id: bookId } : null,
      ...over,
    })
  const itemBadge = (id: string, bookId: string, over: Record<string, unknown> = {}) => ({ id, type: 'item', deleted_at: null, item_book_id: bookId, ...over })
  const emptyMessages = (result: Awaited<ReturnType<typeof loadOpsSignals>>) =>
    signal(result, 'empty_content').results.map((entry) => entry.message).filter((message) => message.includes('아이템이 없어요'))
  const badgeSelects = () => h.state.selects.filter((entry) => entry.table === 'badges')

  beforeEach(() => {
    h.state.tables.ops_bundles = [bundleRow('b1')]
  })

  it('항목의 created_resource 칸을 함께 읽는다', async () => {
    h.state.tables.ops_bundle_items = [bookItem('i1', BOOK)]
    await loadOpsSignals({ now: NOW })
    const select = h.state.selects.find((entry) => entry.table === 'ops_bundle_items')
    expect(select?.columns).toContain('created_resource')
  })

  it('예약됨 컬렉션 항목의 컬렉션에 아이템 배지가 없으면 신호가 뜨고, 있으면 안 뜬다', async () => {
    h.state.tables.ops_bundle_items = [bookItem('empty', BOOK), bookItem('filled', OTHER_BOOK)]
    h.state.tables.badges = [itemBadge('b-1', OTHER_BOOK)]
    const result = await loadOpsSignals({ now: NOW })
    expect(emptyMessages(result)).toEqual([
      '10/5(월) 09:00에 공개할 컬렉션 런칭 「컬렉션 empty」에 아이템이 없어요. 공개 전에 기존 어드민에서 아이템 배지를 채워 주세요.',
    ])
    expect(result.sourceErrors).toEqual({})
  })

  it('게재중 컬렉션 항목도 본다', async () => {
    h.state.tables.ops_bundle_items = [bookItem('live', BOOK, { status: 'live' })]
    const result = await loadOpsSignals({ now: NOW })
    expect(emptyMessages(result)).toEqual(['게재 중인 컬렉션 런칭 「컬렉션 live」에 아이템이 없어요.'])
  })

  it('badges는 item 종류이고 삭제되지 않은 배지만, 대상 컬렉션 ID 목록으로 읽는다. 삭제됐거나 item이 아닌 배지는 세지 않는다', async () => {
    h.state.tables.ops_bundle_items = [bookItem('i1', BOOK), bookItem('i2', OTHER_BOOK)]
    h.state.tables.badges = [
      itemBadge('deleted', BOOK, { deleted_at: '2026-09-01T00:00:00+00:00' }),
      itemBadge('activity', BOOK, { type: 'activity' }),
      itemBadge('other-book-badge', OTHER_BOOK),
    ]
    const result = await loadOpsSignals({ now: NOW })
    const selects = badgeSelects()
    expect(selects).toHaveLength(1)
    expect(selects[0].columns).toBe('id, item_book_id')
    expect(selects[0].filters).toEqual(['eq:type:item', 'is:deleted_at:null', `in:item_book_id:${BOOK},${OTHER_BOOK}`])
    // BOOK에는 삭제된 배지와 item이 아닌 배지뿐이라 비어 있다
    expect(emptyMessages(result)).toHaveLength(1)
    expect(emptyMessages(result)[0]).toContain('컬렉션 i1')
  })

  it('컬렉션 ID는 소문자로 견준다', async () => {
    h.state.tables.ops_bundle_items = [bookItem('upper', BOOK.toUpperCase())]
    h.state.tables.badges = [itemBadge('b-1', BOOK)]
    const result = await loadOpsSignals({ now: NOW })
    expect(emptyMessages(result)).toEqual([])
    expect(badgeSelects()[0].filters).toContain(`in:item_book_id:${BOOK}`)
  })

  it('대상이 없으면 badges를 조회하지 않는다(컬렉션 항목 없음·준비중·승인됨·만든 컬렉션 없음)', async () => {
    h.state.tables.ops_bundle_items = [
      itemRow('card', 'b1'),
      bookItem('preparing', BOOK, { status: 'preparing' }),
      bookItem('approved', BOOK, { status: 'approved' }),
      bookItem('no-resource', null),
      bookItem('sample', null, { created_resource: { sample: true } }),
    ]
    const result = await loadOpsSignals({ now: NOW })
    expect(badgeSelects()).toEqual([])
    expect(h.state.calls.filter((call) => call.startsWith('badges.'))).toEqual([])
    expect(emptyMessages(result)).toEqual([])
    expect(result.sourceErrors).toEqual({})
  })

  it('같은 컬렉션은 한 번만 조회 목록에 싣는다', async () => {
    h.state.tables.ops_bundle_items = [bookItem('a', BOOK), bookItem('b', BOOK, { status: 'live' })]
    await loadOpsSignals({ now: NOW })
    expect(badgeSelects()[0].filters.at(-1)).toBe(`in:item_book_id:${BOOK}`)
  })

  it('컬렉션이 200개를 넘으면 나눠서 읽고 모두 합쳐 센다', async () => {
    const ids = Array.from({ length: 250 }, (_, n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`)
    h.state.tables.ops_bundle_items = ids.map((id, n) => bookItem(`i${n}`, id))
    // 마지막 컬렉션만 아이템이 없다(두 번째 조각에 들어 있다)
    h.state.tables.badges = ids.slice(0, -1).map((id, n) => itemBadge(`b${n}`, id))
    const result = await loadOpsSignals({ now: NOW })
    expect(badgeSelects()).toHaveLength(2)
    expect(emptyMessages(result)).toHaveLength(1)
    expect(emptyMessages(result)[0]).toContain('컬렉션 i249')
  })

  it('읽기만 한다', async () => {
    h.state.tables.ops_bundle_items = [bookItem('i1', BOOK)]
    await loadOpsSignals({ now: NOW })
    expect(h.state.calls.filter((call) => WRITE.test(call))).toEqual([])
  })

  it('badges 조회가 실패하면 「비어 있는 컨텐츠」만 확인하지 못했어요이고 나머지 신호는 그대로다. 사유는 sourceErrors에만 있다', async () => {
    h.state.tables.ops_bundle_items = [bookItem('i1', BOOK), itemRow('failed', 'b1', { status: 'failed' })]
    h.state.errors.badges = '연결 끊김'
    const result = await loadOpsSignals({ now: NOW })
    expect(result.sourceErrors).toEqual({ collection_items: '연결 끊김' })
    const empty = signal(result, 'empty_content')
    expect(empty.state).toBe('unchecked')
    expect(empty.uncheckedReason).toBe('load_failed')
    expect(empty.results).toEqual([])
    expect(signal(result, 'execution_failed').state).toBe('raised')
    expect(signal(result, 'no_new_content').uncheckedReason).toBeNull()
    expect(console.error).toHaveBeenCalled()
  })

  it('묶음을 읽지 못하면 badges는 조회하지 않고 sourceErrors에는 묶음 사유만 있다', async () => {
    h.state.errors.ops_bundles = '시간 초과'
    const result = await loadOpsSignals({ now: NOW })
    expect(badgeSelects()).toEqual([])
    expect(result.sourceErrors).toEqual({ bundles: '시간 초과' })
    expect(signal(result, 'empty_content').uncheckedReason).toBe('load_failed')
  })
})

describe('loadOpsSignals — 획득 경로가 막힌 컬렉션 (티켓 20261008_1301)', () => {
  const OPEN_BOOK = 'a0000000-0000-4000-8000-000000000001'
  const ENDED_BOOK = 'a0000000-0000-4000-8000-000000000002'
  const EXCLUDED_BOOK = 'a0000000-0000-4000-8000-000000000003'
  const PAST = '2026-01-01T00:00:00+09:00'
  const FUTURE = '2027-01-01T00:00:00+09:00'
  const book = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    is_active: true,
    valid_from: PAST,
    valid_until: null,
    drop_excluded: false,
    ...over,
  })
  const item = (id: string, bookId: string, over: Record<string, unknown> = {}) => ({
    id,
    item_book_id: bookId,
    deleted_at: null,
    drop_excluded: false,
    valid_from: null,
    valid_until: null,
    ...over,
  })
  /** 아이템 유효기간이 지나 드랍 길이 닫힌 아이템(레시피·미션도 없어 막힘). */
  const blockedItem = (id: string, bookId: string) => item(id, bookId, { valid_until: PAST })
  const nameSelects = () => h.state.selects.filter((entry) => entry.table === 'item_books')

  beforeEach(() => {
    h.state.tables.item_books = [
      { id: OPEN_BOOK, name: '진행 중 컬렉션' },
      { id: ENDED_BOOK, name: '끝난 컬렉션' },
      { id: EXCLUDED_BOOK, name: '드랍 제외 컬렉션' },
    ]
  })

  it('진행 중인 컬렉션의 막힌 아이템은 컬렉션마다 한 건으로 센다', async () => {
    h.paths.inputs = {
      collections: [book(OPEN_BOOK, { valid_until: FUTURE })],
      items: [blockedItem('i1', OPEN_BOOK), blockedItem('i2', OPEN_BOOK), item('i3', OPEN_BOOK)],
      recipes: [],
      missions: [],
    }
    const result = await loadOpsSignals({ now: NOW })
    const outcome = signal(result, 'blocked_collection')
    expect(outcome.state).toBe('raised')
    expect(outcome.results.map((entry) => entry.message)).toEqual([
      '컬렉션 「진행 중 컬렉션」의 아이템 2개는 지금 얻을 길이 없어요(전체 3개).',
    ])
    expect(result.sourceErrors).toEqual({})
  })

  it('기간이 끝난 컬렉션과 드랍 제외 아이템은 세지 않고, 막힌 것이 없으면 이름도 읽지 않는다', async () => {
    h.paths.inputs = {
      collections: [book(ENDED_BOOK, { valid_until: PAST }), book(EXCLUDED_BOOK)],
      items: [item('e1', ENDED_BOOK), item('e2', ENDED_BOOK), item('x1', EXCLUDED_BOOK, { drop_excluded: true })],
      recipes: [],
      missions: [],
    }
    const result = await loadOpsSignals({ now: NOW })
    expect(signal(result, 'blocked_collection').state).toBe('clear')
    expect(nameSelects()).toEqual([])
  })

  it('막힌 컬렉션이 있을 때만 그 컬렉션의 이름을 한 번 읽는다', async () => {
    h.paths.inputs = {
      collections: [book(OPEN_BOOK), book(ENDED_BOOK, { valid_until: PAST })],
      items: [blockedItem('i1', OPEN_BOOK), item('e1', ENDED_BOOK)],
      recipes: [],
      missions: [],
    }
    await loadOpsSignals({ now: NOW })
    const selects = nameSelects()
    expect(selects).toHaveLength(1)
    expect(selects[0].columns).toBe('id, name')
    expect(selects[0].filters).toEqual([`in:id:${OPEN_BOOK}`])
  })

  it('얻을 길 읽기가 실패하면 이 신호만 load_failed이고 sourceErrors.item_paths가 채워진다', async () => {
    h.paths.error = '표 읽기 실패'
    h.state.tables.ops_bundles = [bundleRow('b1')]
    h.state.tables.ops_bundle_items = [itemRow('i1', 'b1', { status: 'failed' })]
    const result = await loadOpsSignals({ now: NOW })
    expect(result.sourceErrors).toEqual({ item_paths: '표 읽기 실패' })
    const outcome = signal(result, 'blocked_collection')
    expect(outcome.state).toBe('unchecked')
    expect(outcome.uncheckedReason).toBe('load_failed')
    expect(signal(result, 'execution_failed').state).toBe('raised')
    expect(signal(result, 'action_spike').state).toBe('clear')
  })

  it('이름 읽기가 실패해도 이 신호만 load_failed다', async () => {
    h.paths.inputs = { collections: [book(OPEN_BOOK)], items: [blockedItem('i1', OPEN_BOOK)], recipes: [], missions: [] }
    h.state.errors.item_books = '이름 읽기 실패'
    const result = await loadOpsSignals({ now: NOW })
    expect(result.sourceErrors).toEqual({ item_paths: '이름 읽기 실패' })
    expect(signal(result, 'blocked_collection').uncheckedReason).toBe('load_failed')
  })

  it('얻을 길 읽기에서도 쓰기 메서드를 부르지 않는다', async () => {
    h.paths.inputs = { collections: [book(OPEN_BOOK)], items: [blockedItem('i1', OPEN_BOOK)], recipes: [], missions: [] }
    await loadOpsSignals({ now: NOW })
    expect(h.paths.calls).toBe(1)
    expect(h.state.calls.filter((call) => WRITE_CALL.test(call))).toEqual([])
  })
})

describe('loadOpsSignals — S7에서 바꾼 기준값(ops_rules 신호 행, 티켓 20260930_1459 조각 C)', () => {
  const ruleRow = (key: string, value: unknown) => ({ rule_key: key, rule_group: 'signal', value })
  const DAY_MS = 24 * 3600_000

  beforeEach(() => {
    h.state.tables.ops_bundles = [bundleRow('b1')]
    // 공개 시각이 지금(10/1 12:00)에서 60시간 뒤인 도착 항목: 기본값 48시간으로는 안 뜨고 72시간으로 바꾸면 뜬다
    h.state.tables.ops_bundle_items = [itemRow('i1', 'b1', { status: 'arrived', starts_at: kst('2026-10-04', '00:00') })]
  })

  it('신호 행만 읽는다(rule_group = signal 필터)', async () => {
    await loadOpsSignals({ now: NOW })
    const select = h.state.selects.find((entry) => entry.table === 'ops_rules')
    expect(select?.filters).toEqual(['eq:rule_group:signal'])
    expect(select?.columns).toBe('rule_key, value')
  })

  it('행이 없으면 기본값으로 계산한다(DB에 기본값 행이 없다)', async () => {
    const result = await loadOpsSignals({ now: NOW })
    expect(signal(result, 'approval_deadline').state).toBe('clear')
  })

  it('바꾼 기준값이 신호 계산에 쓰인다(승인 마감 48 → 72시간)', async () => {
    h.state.tables.ops_rules = [ruleRow('approvalDeadlineHours', { value: 72 })]
    const result = await loadOpsSignals({ now: NOW })
    const approval = signal(result, 'approval_deadline')
    expect(approval.state).toBe('raised')
    expect(approval.results[0].message).toContain('72시간도 남지 않았는데')
  })

  it('읽기 전용 시각(routineCheckStartsAt)은 1504가 채운 값을 그대로 읽어 루틴 실패 점검이 시작된다', async () => {
    const before = await loadOpsSignals({ now: NOW })
    expect(signal(before, 'routine_failed')).toMatchObject({ state: 'unchecked', uncheckedReason: 'not_started' })
    h.state.tables.ops_rules = [ruleRow('routineCheckStartsAt', { value: '2026-09-28T00:00:00+09:00' })]
    const after = await loadOpsSignals({ now: NOW })
    expect(signal(after, 'routine_failed').state).toBe('raised')
  })

  it('모양이 틀리거나 범위를 벗어난 행은 그 키만 버리고 기본값을 쓴다(다른 키는 읽는다)', async () => {
    h.state.tables.ops_rules = [
      ruleRow('approvalDeadlineHours', { value: 0 }), // 범위 밖
      ruleRow('missedScheduleMinutes', { value: 'abc' }), // 모양 틀림
      ruleRow('minLiveCards', { value: 2 }), // 정상
      ruleRow('notAThreshold', { value: 9 }), // 모르는 키
    ]
    const result = await loadOpsSignals({ now: NOW })
    expect(signal(result, 'approval_deadline').state).toBe('clear') // 기본값 48시간
    expect(result.sourceErrors).toEqual({})
  })

  it('덮어쓰기 읽기가 실패하면 기본값으로 계산하고 서버 로그만 남긴다(다른 원천 오류로 세지 않는다)', async () => {
    h.state.errors.ops_rules = '권한 없음'
    h.state.tables.ops_rules = [ruleRow('approvalDeadlineHours', { value: 72 })]
    const result = await loadOpsSignals({ now: NOW })
    expect(signal(result, 'approval_deadline').state).toBe('clear')
    expect(result.sourceErrors).toEqual({})
    expect(console.error).toHaveBeenCalled()
  })

  it('쓰기 메서드를 부르지 않는다', async () => {
    h.state.tables.ops_rules = [ruleRow('approvalDeadlineHours', { value: 72 })]
    await loadOpsSignals({ now: NOW })
    expect(h.state.calls.filter((call) => WRITE_CALL.test(call))).toEqual([])
  })

  it('monotonyWindowDays를 바꾸면 카드를 읽는 범위가 따라 바뀐다(기본 7일 → 10일)', async () => {
    h.state.tables.ops_rules = [ruleRow('monotonyWindowDays', { value: 10 })]
    await loadOpsSignals({ now: NOW })
    const select = h.state.selects.find((entry) => entry.table === 'today_cards')
    // 오늘(10/1)의 앞 9일 0시(9/22 KST = 9/21 15:00Z)부터. 기본값이면 앞 6일 0시(9/24 15:00Z)다.
    expect(select?.filters).toContain('gte:ends_at:2026-09-21T15:00:00.000Z')
  })

  it('actionSpikeBaselineWeeks를 바꾸면 직전 기간을 읽는 범위와 주평균이 따라 바뀐다(4주 → 8주)', async () => {
    h.state.tables.ops_rules = [ruleRow('actionSpikeBaselineWeeks', { value: 8 })]
    // 최근 7일 30건, 그 앞 5~8주 사이 120건(주 15건)
    h.state.tables.poi_drops = [
      ...rowsWith(30, (n) => ({ id: `r${n}`, source: 'user', dropped_at: recent(60), picked_up_at: recent(3) })),
      ...rowsWith(120, (n) => ({ id: `b${n}`, source: 'user', dropped_at: recent(60), picked_up_at: recent(40 + (n % 14)) })),
    ]
    const result = await loadOpsSignals({ now: NOW })
    const baselineStartIso = new Date(NOW.getTime() - (7 + 8 * 7) * DAY_MS).toISOString()
    const pickupSelects = h.state.selects.filter((entry) => entry.table === 'poi_drops' && entry.head)
    expect(pickupSelects.some((entry) => entry.filters.includes(`gte:picked_up_at:${baselineStartIso}`))).toBe(true)
    expect(signal(result, 'action_spike').results.map((entry) => entry.message)).toContain(
      '픽업: 최근 7일 30건으로, 직전 8주 평균(주 15건)의 2배예요.'
    )
  })
})
