/**
 * 일정표 타임라인 조회 (티켓 20261006_1538 ③-c)
 *
 * 서비스 클라이언트·날짜 구성·신호 읽기는 모두 가짜로 바꾼다(실 DB에 접속하지 않는다). 지키는 것:
 * - **select 계열만 부르고 insert·update·upsert·delete를 부르지 않는다**
 * - 6주 창(10/5~11/15) 전체를 읽는다: 날짜 구성·카드·미션, 드랍 일정은 창 안 예약 시각, 컬렉션은 시작일이 창 끝 이전이고 끝이 창 시작 이후(또는 없음)인 것
 * - 컬렉션 준비 기간은 R4(`ops_rules`의 `launch_lead_days_min`)를 따른다: 켜져 있고 읽히면 그 일수, 꺼졌거나 값이 틀렸거나 행이 없으면 28일, 조회가 실패하면 28일 + `rules` 사유
 * - 출처마다 격리: 드랍 일정·컬렉션·규칙 중 하나가 실패해도 나머지는 그대로 그리고 사유는 `sourceErrors`에 남는다
 * - 읽은 실제 드랍 일정·컬렉션이 막대가 된다
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
  }

  class Query implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
    private filters: string[] = []
    private window: [number, number] | null = null
    constructor(private table: string) {}
    private note(method: string) {
      state.calls.push(`${this.table}.${method}`)
    }
    private filter(label: string) {
      this.filters.push(label)
      return this
    }
    select(columns: string) {
      this.note('select')
      state.selects.push({ table: this.table, columns, filters: this.filters })
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

import { loadScheduleTimeline } from '@/lib/admin/opsSchedule/timelineLoad'
import { buildDayCompositions } from '@/lib/admin/opsSignals/composition'
import { makeBundle, makeItem, kst } from '@/lib/admin/opsSignals/__tests__/fixtures'
import { shiftDateStr } from '@/lib/admin/today-calendar'

const TIMELINE_START = '2026-10-05'
const TIMELINE_END = '2026-11-15'
const DATES = Array.from({ length: 42 }, (_, index) => shiftDateStr(TIMELINE_START, index))
const NOW = new Date('2026-10-07T03:00:00.000Z') // 10-07 12:00 KST
const DATE = '2026-10-07'

function composed(bundles = [makeBundle([makeItem({ id: 'item-m', kind: 'mission', status: 'scheduled', startsAt: kst('2026-10-08', '09:00'), endsAt: kst('2026-10-12', '09:00'), original: { copy: { title: '운영 미션' } } })])]) {
  return { bundles, compositions: buildDayCompositions({ cards: [], missions: [], bundles }, DATES), sourceErrors: {} as Record<string, string> }
}

const noSignals = () => ({ signals: [], scanDates: [], compositions: [], includeSample: false, sourceErrors: {} })

const ruleRow = (over: Record<string, unknown> = {}) => ({
  rule_key: 'launch_lead_days_min',
  rule_group: 'balance',
  value: { min_days: 7 },
  level: 'warn',
  enabled: true,
  ...over,
})

beforeEach(() => {
  h.state.tables = { today_cards: [], missions: [], ambient_drop_schedules: [], item_books: [], ops_rules: [] }
  h.state.errors = {}
  h.state.calls = []
  h.state.selects = []
  h.state.compositions = () => composed()
  h.state.signals = noSignals
})

describe('loadScheduleTimeline — 읽기', () => {
  it('select 계열만 부르고 쓰기 메서드를 부르지 않는다', async () => {
    await loadScheduleTimeline({ date: DATE, includeSample: false, now: NOW })
    expect(h.state.calls.length).toBeGreaterThan(0)
    expect(h.state.calls.filter((call) => /\.(insert|update|upsert|delete)$/.test(call))).toEqual([])
  })

  it('6주 창 전체를 읽고 시험 포함 여부를 날짜 구성·신호 읽기에 그대로 넘긴다', async () => {
    const { loadDayCompositions, loadOpsSignals } = await import('@/lib/admin/opsSignals/load')
    const { timeline } = await loadScheduleTimeline({ date: DATE, includeSample: true, now: NOW })
    expect(loadDayCompositions).toHaveBeenLastCalledWith({ from: TIMELINE_START, to: TIMELINE_END, includeSample: true })
    expect(loadOpsSignals).toHaveBeenLastCalledWith(expect.objectContaining({ includeSample: true }))
    expect(timeline).toMatchObject({ start: TIMELINE_START, end: TIMELINE_END, columnCount: 42 })
    expect(timeline.days).toHaveLength(42)
  })

  it('같은 격자 칸 안의 어느 날짜를 기준으로 해도 같은 창이다(날짜를 눌러도 창이 흔들리지 않는다, 가정 9)', async () => {
    const { loadDayCompositions } = await import('@/lib/admin/opsSignals/load')
    for (const date of ['2026-10-05', '2026-10-11', '2026-11-01']) {
      await loadScheduleTimeline({ date, includeSample: false, now: NOW })
      expect(loadDayCompositions).toHaveBeenLastCalledWith({ from: TIMELINE_START, to: TIMELINE_END, includeSample: false })
    }
  })

  it('드랍 일정은 창 안 예약 시각만, 컬렉션은 시작일이 창 끝 이전이고 끝이 없거나 창 시작 이후인 것만 읽는다', async () => {
    await loadScheduleTimeline({ date: DATE, includeSample: false, now: NOW })
    const drops = h.state.selects.find((entry) => entry.table === 'ambient_drop_schedules')!
    expect(drops.columns).toBe('id, scheduled_at, status, claimed_at, canceled_at, title')
    expect(drops.filters).toContain(`gte:scheduled_at:${new Date('2026-10-04T15:00:00.000Z').toISOString()}`)
    expect(drops.filters).toContain(`lte:scheduled_at:${new Date('2026-11-15T14:59:59.999Z').toISOString()}`)
    const books = h.state.selects.find((entry) => entry.table === 'item_books')!
    expect(books.columns).toBe('id, name, valid_from, valid_until, is_active')
    expect(books.filters).toContain(`lte:valid_from:${new Date('2026-11-15T14:59:59.999Z').toISOString()}`)
    expect(books.filters).toContain(`or:valid_until.is.null,valid_until.gte.${new Date('2026-10-04T15:00:00.000Z').toISOString()}`)
    const rules = h.state.selects.find((entry) => entry.table === 'ops_rules')!
    expect(rules.filters).toContain('eq:rule_group:balance')
  })

  it('읽은 운영 항목·실제 드랍 일정·컬렉션이 각자의 줄에 막대가 된다', async () => {
    h.state.tables.ambient_drop_schedules = [
      { id: 'drop-1', scheduled_at: '2026-10-09T01:00:00.000Z', status: 'scheduled', claimed_at: null, canceled_at: null, title: '가을 드랍' },
    ]
    h.state.tables.item_books = [{ id: 'book-1', name: '가을 컬렉션', valid_from: kst('2026-10-20', '09:00'), valid_until: kst('2026-11-03', '09:00'), is_active: true }]
    const { timeline, sourceErrors } = await loadScheduleTimeline({ date: DATE, includeSample: false, now: NOW })
    expect(sourceErrors).toEqual({})
    const rows = Object.fromEntries(timeline.rows.map((row) => [row.key, row.bars.map((bar) => [bar.origin, bar.title])]))
    expect(rows).toEqual({
      mission: [['ops', '운영 미션']],
      drop_schedule: [['legacy', '가을 드랍']],
      collection_launch: [['legacy', '가을 컬렉션']],
    })
  })
})

describe('loadScheduleTimeline — 컬렉션 준비 기간 R4', () => {
  it('규칙이 켜져 있고 값을 읽을 수 있으면 그 일수다', async () => {
    h.state.tables.ops_rules = [ruleRow()]
    const { timeline, sourceErrors } = await loadScheduleTimeline({ date: DATE, includeSample: false, now: NOW })
    expect(timeline.leadDays).toBe(7)
    expect(sourceErrors.rules).toBeUndefined()
  })

  it('꺼졌거나 값이 틀렸거나 규칙 행이 없으면 28일이고 읽기 실패로 알리지 않는다', async () => {
    for (const rows of [[ruleRow({ enabled: false })], [ruleRow({ value: { min_days: 'x' } })], []]) {
      h.state.tables.ops_rules = rows
      const { timeline, sourceErrors } = await loadScheduleTimeline({ date: DATE, includeSample: false, now: NOW })
      expect(timeline.leadDays).toBe(28)
      expect(sourceErrors.rules).toBeUndefined()
    }
  })

  it('규칙 조회가 실패하면 28일로 그리고 사유를 남긴다', async () => {
    h.state.errors.ops_rules = '규칙 조회 실패(시험)'
    const { timeline, sourceErrors } = await loadScheduleTimeline({ date: DATE, includeSample: false, now: NOW })
    expect(timeline.leadDays).toBe(28)
    expect(sourceErrors.rules).toContain('규칙 조회 실패(시험)')
  })

  it('읽은 리드일이 컬렉션 막대의 준비 구간 길이가 된다', async () => {
    h.state.tables.ops_rules = [ruleRow()]
    h.state.tables.item_books = [{ id: 'book-1', name: '가을 컬렉션', valid_from: kst('2026-10-20', '09:00'), valid_until: null, is_active: true }]
    const { timeline } = await loadScheduleTimeline({ date: DATE, includeSample: false, now: NOW })
    const [bar] = timeline.rows.find((row) => row.key === 'collection_launch')!.bars
    expect(bar.prep).toEqual({ startCol: 9, endCol: 15, startDate: '2026-10-13' })
  })
})

describe('loadScheduleTimeline — 출처별 격리', () => {
  it('드랍 일정을 못 읽어도 컬렉션·운영 항목은 그대로 그리고 사유가 남는다', async () => {
    h.state.errors.ambient_drop_schedules = '드랍 일정 조회 실패(시험)'
    h.state.tables.item_books = [{ id: 'book-1', name: '가을 컬렉션', valid_from: kst('2026-10-20', '09:00'), valid_until: null, is_active: true }]
    const { timeline, sourceErrors } = await loadScheduleTimeline({ date: DATE, includeSample: false, now: NOW })
    expect(sourceErrors.dropSchedules).toContain('드랍 일정 조회 실패(시험)')
    expect(sourceErrors.itemBooks).toBeUndefined()
    expect(timeline.rows.find((row) => row.key === 'drop_schedule')!.bars).toEqual([])
    expect(timeline.rows.find((row) => row.key === 'collection_launch')!.bars).toHaveLength(1)
    expect(timeline.rows.find((row) => row.key === 'mission')!.bars).toHaveLength(1)
  })

  it('컬렉션을 못 읽으면 itemBooks 사유가 남는다', async () => {
    h.state.errors.item_books = '컬렉션 조회 실패(시험)'
    const { sourceErrors } = await loadScheduleTimeline({ date: DATE, includeSample: false, now: NOW })
    expect(sourceErrors.itemBooks).toContain('컬렉션 조회 실패(시험)')
  })

  it('날짜 구성이 읽다 실패한 재료도 같은 이름으로 남고, 신호 계산이 던지면 신호 줄 안내가 「못 읽음」이다', async () => {
    h.state.compositions = () => ({ ...composed([]), bundles: null, sourceErrors: { bundles: '묶음 조회 실패(시험)', cards: '구성 카드 실패(시험)' } })
    h.state.signals = null
    const { timeline, sourceErrors } = await loadScheduleTimeline({ date: DATE, includeSample: false, now: NOW })
    expect(sourceErrors.bundles).toContain('묶음 조회 실패(시험)')
    expect(sourceErrors.cards).toContain('구성 카드 실패(시험)')
    expect(sourceErrors.signals).toBeDefined()
    expect(timeline.signalNotice).toContain('신호가 없다는 뜻은 아니에요')
  })

  it('날짜 구성 읽기가 던져도 나머지 재료는 그대로 그린다', async () => {
    h.state.compositions = null
    h.state.tables.item_books = [{ id: 'book-1', name: '가을 컬렉션', valid_from: kst('2026-10-20', '09:00'), valid_until: null, is_active: true }]
    const { timeline, sourceErrors } = await loadScheduleTimeline({ date: DATE, includeSample: false, now: NOW })
    expect(sourceErrors.bundles).toBeDefined()
    expect(timeline.rows.find((row) => row.key === 'collection_launch')!.bars).toHaveLength(1)
  })
})
