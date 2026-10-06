/**
 * 일정표 주간 보기 조회 (티켓 20261006_1536 ③-a)
 *
 * 서비스 클라이언트·날짜 구성·신호·노출 수 읽기는 모두 가짜로 바꾼다(실 DB에 접속하지 않는다). 지키는 것:
 * - **select 계열만 부르고 insert·update·upsert·delete를 부르지 않는다**
 * - 카드는 비활성까지 읽고(`is_active` 조건이 없다) 보는 주 범위만, 미션은 `gate_axis`와 함께 읽는다
 * - 출처마다 격리: 카드·미션·날짜 구성·신호·노출 수 중 하나가 실패해도 나머지는 그대로 그리고 실패는 `sourceErrors`에 남는다
 * - 카드를 못 읽으면 「없다」가 아니라 읽지 못한 것이다(주간 보기에 실제 카드·장기 카드 줄이 비고 운영 항목은 그대로)
 * - 노출·열람 수는 오늘 이전(포함)에 시작하는 주에서만 읽는다
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const state = {
    tables: {} as Record<string, Row[]>,
    errors: {} as Record<string, string>,
    calls: [] as string[],
    selects: [] as Array<{ table: string; columns: string; filters: string[] }>,
    compositions: null as null | (() => unknown),
    signals: null as null | (() => unknown),
    metrics: null as null | (() => unknown),
    firstEvent: null as null | (() => unknown),
    metricCalls: [] as Array<{ ids: string[]; startIso: string; endIso: string }>,
  }

  class Query implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
    private filters: string[] = []
    private columns = ''
    private window: [number, number] | null = null
    constructor(private table: string) {}
    private note(method: string) {
      state.calls.push(`${this.table}.${method}`)
    }
    select(columns: string) {
      this.note('select')
      this.columns = columns
      state.selects.push({ table: this.table, columns, filters: this.filters })
      return this
    }
    private filter(label: string) {
      this.filters.push(label)
      return this
    }
    lte(col: string, val: unknown) {
      this.note('lte')
      return this.filter(`lte:${col}:${val}`)
    }
    gte(col: string, val: unknown) {
      this.note('gte')
      return this.filter(`gte:${col}:${val}`)
    }
    eq(col: string, val: unknown) {
      this.note('eq')
      return this.filter(`eq:${col}:${val}`)
    }
    or(expr: string) {
      this.note('or')
      return this.filter(`or:${expr}`)
    }
    order() {
      this.note('order')
      return this
    }
    range(from: number, to: number) {
      this.note('range')
      this.window = [from, to]
      return this
    }
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
    then<T1 = { data: unknown; error: { message: string } | null }, T2 = never>(
      onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
    ): PromiseLike<T1 | T2> {
      const message = state.errors[this.table]
      const rows = state.tables[this.table] ?? []
      const data = this.window ? rows.slice(this.window[0], this.window[1] + 1) : rows
      const result = message ? { data: null, error: { message } } : { data, error: null }
      return Promise.resolve(result).then(onfulfilled, onrejected)
    }
  }

  return { state, Query }
})

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: (table: string) => new h.Query(table) }),
}))

vi.mock('@/lib/admin/opsSignals/load', () => ({
  loadDayCompositions: vi.fn(async () => {
    if (!h.state.compositions) throw new Error('구성 시험 값이 없어요')
    return h.state.compositions()
  }),
  loadOpsSignals: vi.fn(async () => {
    if (!h.state.signals) throw new Error('신호 시험 값이 없어요')
    return h.state.signals()
  }),
}))

vi.mock('@/lib/admin/weeklyCardMetrics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin/weeklyCardMetrics')>()),
  fetchWeeklyCardMetrics: vi.fn(async (ids: string[], startIso: string, endIso: string) => {
    h.state.metricCalls.push({ ids, startIso, endIso })
    if (!h.state.metrics) throw new Error('노출 수 읽기 실패(시험)')
    return h.state.metrics()
  }),
  fetchFirstEventKstDate: vi.fn(async () => (h.state.firstEvent ? h.state.firstEvent() : '2026-09-01')),
}))

import { loadScheduleWeek } from '@/lib/admin/opsSchedule/load'
import { buildDayCompositions } from '@/lib/admin/opsSignals/composition'
import { makeBundle, makeCard, makeItem, kst } from '@/lib/admin/opsSignals/__tests__/fixtures'
import { shiftDateStr } from '@/lib/admin/today-calendar'

const WEEK_START = '2026-10-05'
const NOW = new Date('2026-10-07T03:00:00.000Z') // 10-07 12:00 KST
const DATES = Array.from({ length: 7 }, (_, index) => shiftDateStr(WEEK_START, index))

function card(id: string, startsAt: string, endsAt: string, isActive = true) {
  return { id, title: `카드 ${id}`, content_type_id: null, template_type: 'editorial_article', starts_at: startsAt, ends_at: endsAt, is_active: isActive, sort_order: 0 }
}

function composed(bundles = [makeBundle([makeItem({ id: 'item-x', startsAt: kst('2026-10-06', '09:00') })])]) {
  return {
    bundles,
    compositions: buildDayCompositions({ cards: [], missions: [], bundles }, DATES),
    sourceErrors: {} as Record<string, string>,
  }
}

function signals() {
  return { signals: [], scanDates: [], compositions: [], includeSample: false, sourceErrors: {} }
}

beforeEach(() => {
  h.state.tables = { today_cards: [], missions: [] }
  h.state.errors = {}
  h.state.calls = []
  h.state.selects = []
  h.state.compositions = () => composed()
  h.state.signals = signals
  h.state.metrics = () => new Map()
  h.state.firstEvent = null
  h.state.metricCalls = []
})

describe('loadScheduleWeek — 읽기', () => {
  it('select 계열만 부르고 쓰기 메서드를 부르지 않는다', async () => {
    h.state.tables.today_cards = [card('c1', kst('2026-10-06', '09:00'), kst('2026-10-06', '21:00'))]
    await loadScheduleWeek({ weekStart: WEEK_START, includeSample: false, now: NOW })
    expect(h.state.calls.length).toBeGreaterThan(0)
    expect(h.state.calls.filter((call) => /\.(insert|update|upsert|delete)$/.test(call))).toEqual([])
  })

  it('카드는 비활성까지 보는 주 범위로 읽는다(is_active 조건이 없다)', async () => {
    await loadScheduleWeek({ weekStart: WEEK_START, includeSample: false, now: NOW })
    const select = h.state.selects.find((entry) => entry.table === 'today_cards')!
    expect(select.columns).toContain('is_active')
    expect(select.filters.some((filter) => filter.startsWith('eq:is_active'))).toBe(false)
    // 월요일 00:00 KST 이후 끝나고 일요일 끝 이전에 시작하는 카드
    expect(select.filters).toContain(`lte:starts_at:${new Date('2026-10-11T14:59:59.999Z').toISOString()}`)
    expect(select.filters).toContain(`gte:ends_at:${new Date('2026-10-04T15:00:00.000Z').toISOString()}`)
  })

  it('미션은 gate_axis와 함께 읽고 상시 미션도 받는다', async () => {
    await loadScheduleWeek({ weekStart: WEEK_START, includeSample: false, now: NOW })
    const select = h.state.selects.find((entry) => entry.table === 'missions')!
    expect(select.columns).toContain('gate_axis')
    expect(select.filters.some((filter) => filter.startsWith('or:ends_at.is.null,ends_at.gte.'))).toBe(true)
  })

  it('비활성 카드와 비활성 장기 카드가 주간 보기에 반영된다', async () => {
    h.state.tables.today_cards = [
      card('off-short', kst('2026-10-06', '09:00'), kst('2026-10-06', '21:00'), false),
      card('off-long', kst('2026-09-01', '00:00'), kst('2026-10-31', '23:00'), false),
      card('on-long', kst('2026-09-01', '00:00'), kst('2026-10-31', '23:00'), true),
    ]
    const { week, sourceErrors } = await loadScheduleWeek({ weekStart: WEEK_START, includeSample: false, now: NOW })
    expect(sourceErrors).toEqual({})
    expect(week.days[1].items.filter((item) => item.origin === 'card').map((item) => [item.drawerKey, item.dim])).toEqual([['card:off-short', true]])
    expect(week.days[1]).toMatchObject({ longActiveCount: 1, longInactiveCount: 1 })
  })

  it('시험 묶음 포함 여부를 날짜 구성과 신호 읽기에 그대로 넘긴다', async () => {
    const { loadDayCompositions, loadOpsSignals } = await import('@/lib/admin/opsSignals/load')
    await loadScheduleWeek({ weekStart: WEEK_START, includeSample: true, now: NOW })
    expect(loadDayCompositions).toHaveBeenLastCalledWith({ from: WEEK_START, to: '2026-10-11', includeSample: true })
    expect(loadOpsSignals).toHaveBeenLastCalledWith(expect.objectContaining({ includeSample: true }))
  })
})

describe('loadScheduleWeek — 출처별 격리', () => {
  it('카드를 못 읽으면 실제 카드·장기 카드 줄이 비고 사유가 남지만 운영 항목은 그대로 나온다', async () => {
    h.state.errors.today_cards = '카드 조회 실패(시험)'
    const { week, sourceErrors } = await loadScheduleWeek({ weekStart: WEEK_START, includeSample: false, now: NOW })
    expect(sourceErrors.cards).toContain('카드 조회 실패(시험)')
    expect(sourceErrors.missions).toBeUndefined()
    expect(week.days[1].items.map((item) => item.drawerKey)).toEqual(['item-x'])
    expect(week.days.every((day) => day.longActiveCount === 0 && day.longInactiveCount === 0)).toBe(true)
  })

  it('미션을 못 읽으면 막대가 없고 상시 미션 수가 null이다', async () => {
    h.state.errors.missions = '미션 조회 실패(시험)'
    const { week, sourceErrors } = await loadScheduleWeek({ weekStart: WEEK_START, includeSample: false, now: NOW })
    expect(sourceErrors.missions).toContain('미션 조회 실패(시험)')
    expect(week.missionBars).toEqual([])
    expect(week.openEndedMissionCount).toBeNull()
  })

  it('날짜 구성이 읽다 실패한 재료도 같은 이름으로 남는다', async () => {
    h.state.compositions = () => ({ ...composed([]), bundles: null, sourceErrors: { bundles: '묶음 조회 실패(시험)', cards: '구성 카드 실패(시험)' } })
    const { sourceErrors } = await loadScheduleWeek({ weekStart: WEEK_START, includeSample: false, now: NOW })
    expect(sourceErrors.bundles).toContain('묶음 조회 실패(시험)')
    expect(sourceErrors.cards).toContain('구성 카드 실패(시험)')
  })

  it('날짜 구성 읽기가 던져도 나머지 재료는 그대로 그린다', async () => {
    h.state.compositions = null
    h.state.tables.today_cards = [card('c1', kst('2026-10-06', '09:00'), kst('2026-10-06', '21:00'))]
    const { week, sourceErrors } = await loadScheduleWeek({ weekStart: WEEK_START, includeSample: false, now: NOW })
    expect(sourceErrors.bundles).toBeDefined()
    expect(week.days[1].items.map((item) => item.drawerKey)).toEqual(['card:c1'])
  })

  it('신호 계산이 던지면 칸 신호가 null이고 사유가 남는다(이상 없음으로 보이지 않는다)', async () => {
    h.state.signals = null
    const { week, sourceErrors } = await loadScheduleWeek({ weekStart: WEEK_START, includeSample: false, now: NOW })
    expect(sourceErrors.signals).toBeDefined()
    expect(week.days.every((day) => day.signals === null)).toBe(true)
  })

  it('신호가 읽혔으면 칸마다 날짜별 신호가 붙는다', async () => {
    h.state.signals = () => ({
      ...signals(),
      scanDates: ['2026-10-07', '2026-10-08'],
      signals: [
        {
          key: 'format_error',
          name: '형식 오류',
          level: 'warn',
          state: 'raised',
          uncheckedReason: null,
          results: [{ message: '문장', date: '2026-10-07', bundleId: null, itemId: null, isSample: false, onsetAt: null }],
        },
      ],
    })
    const { week } = await loadScheduleWeek({ weekStart: WEEK_START, includeSample: false, now: NOW })
    expect(week.days[2].signals).toMatchObject({ checked: true, topLevel: 'warn', count: 1 })
    expect(week.days[0].signals).toMatchObject({ checked: false, count: 0 })
  })
})

describe('loadScheduleWeek — 카드 노출·열람 수', () => {
  it('오늘 이전(포함)에 시작하는 주에서만 단기 카드를 한 번에 읽고 그날 줄을 붙인다', async () => {
    h.state.tables.today_cards = [
      card('short-1', kst('2026-10-06', '09:00'), kst('2026-10-06', '21:00')),
      card('long-1', kst('2026-09-01', '00:00'), kst('2026-10-31', '23:00')),
    ]
    h.state.metrics = () => new Map([['short-1|2026-10-06', { impression: 12, click: 3 }]])
    const { week } = await loadScheduleWeek({ weekStart: WEEK_START, includeSample: false, now: NOW })
    expect(h.state.metricCalls).toHaveLength(1)
    expect(h.state.metricCalls[0].ids).toEqual(['short-1'])
    expect(week.days[1].items.find((item) => item.drawerKey === 'card:short-1')?.note).toBe('노출 12 · 열람 3')
    // 오늘(10-07) 이후 날짜는 줄이 없다
    h.state.tables.today_cards = [card('short-2', kst('2026-10-09', '09:00'), kst('2026-10-09', '21:00'))]
    const later = await loadScheduleWeek({ weekStart: WEEK_START, includeSample: false, now: NOW })
    expect(later.week.days[4].items.find((item) => item.drawerKey === 'card:short-2')?.note).toBeNull()
  })

  it('실제 카드와 합친 운영 카드에도 줄이 붙고, 수를 읽지 않은 장기 카드와 합친 카드는 줄을 비운다(티켓 20261006_1537)', async () => {
    h.state.tables.today_cards = [
      card('short-m', kst('2026-10-06', '09:00'), kst('2026-10-06', '21:00')),
      card('long-m', kst('2026-09-01', '00:00'), kst('2026-10-31', '23:00')),
    ]
    const bundles = [
      makeBundle([
        makeItem({ id: 'ops-short', status: 'scheduled', startsAt: kst('2026-10-06', '09:00'), createdResource: { today_card_id: 'short-m' } }),
        makeItem({ id: 'ops-long', status: 'live', startsAt: kst('2026-09-01', '00:00'), endsAt: kst('2026-10-31', '23:00'), createdResource: { today_card_id: 'long-m' } }),
      ]),
    ]
    const cards = [
      makeCard({ id: 'short-m', startsAt: kst('2026-10-06', '09:00'), endsAt: kst('2026-10-06', '21:00') }),
      makeCard({ id: 'long-m', startsAt: kst('2026-09-01', '00:00'), endsAt: kst('2026-10-31', '23:00') }),
    ]
    h.state.compositions = () => ({ bundles, compositions: buildDayCompositions({ cards, missions: [], bundles }, DATES), sourceErrors: {} })
    h.state.metrics = () => new Map([['short-m|2026-10-06', { impression: 7, click: 2 }]])
    const { week } = await loadScheduleWeek({ weekStart: WEEK_START, includeSample: false, now: NOW })
    expect(h.state.metricCalls[0].ids).toEqual(['short-m'])
    const notes = Object.fromEntries(week.days[1].items.map((item) => [item.drawerKey, item.note]))
    expect(notes).toMatchObject({ 'ops-short': '노출 7 · 열람 2', 'ops-long': null })
  })

  it('미래 주는 읽지 않는다', async () => {
    h.state.tables.today_cards = [card('short-f', kst('2026-10-14', '09:00'), kst('2026-10-14', '21:00'))]
    await loadScheduleWeek({ weekStart: '2026-10-12', includeSample: false, now: NOW })
    expect(h.state.metricCalls).toEqual([])
  })

  it('읽지 못하면 줄만 비고 나머지는 그대로다(사유는 남는다)', async () => {
    h.state.tables.today_cards = [card('short-1', kst('2026-10-06', '09:00'), kst('2026-10-06', '21:00'))]
    h.state.metrics = null
    const { week, sourceErrors } = await loadScheduleWeek({ weekStart: WEEK_START, includeSample: false, now: NOW })
    expect(sourceErrors.metrics).toBeDefined()
    expect(week.days[1].items.map((item) => [item.drawerKey, item.note])).toEqual([['item-x', null], ['card:short-1', null]])
  })
})
