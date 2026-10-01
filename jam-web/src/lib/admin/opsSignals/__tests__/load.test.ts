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

  return { state, Query }
})

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: (table: string) => new h.Query(table) }),
}))

import { loadOpsSignals } from '../load'
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
  }
  h.state.errors = {}
  h.state.errorWhen = null
  h.state.calls = []
  h.state.selects = []
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
    expect(byKey.blocked_collection).toBe('not_built')
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
