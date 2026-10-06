/**
 * 일정표 월간 보기 계산 (티켓 20261006_1538 ③-c)
 *
 * 지키는 것:
 * - 달력 틀: 월요일 시작, 그 달이 걸치는 주 전부(4·5·6주), 보이는 달 밖의 앞뒤 날짜는 `inMonth`가 거짓, 오늘 표시
 * - 칸 항목은 주간과 같은 규칙: 카드는 걸치는 날마다, 카드가 아닌 운영 항목은 시작일 칸에만(여러 주에 걸쳐도 되풀이하지 않고, 시작이 달력 앞이면 첫 칸에 한 번)
 * - 옛 미션(합치지 않은 기간 미션)은 막대가 없는 월간에서 시작일 칸의 항목(`mission:<ID>`)이고, 합친 미션은 운영 항목 하나뿐이다
 * - 크론·루틴·카드 노출 줄이 없다, 반려·취소 항목은 칸에 없다, 시험 묶음은 켰을 때만, 신호는 날짜별로 연결된다
 * - 칸 항목 3개까지 + 「+N개 더」, 달력 행 나누기, 서버에서 클라이언트로 넘길 수 있는 모양(JSON 왕복)
 */
import { describe, expect, it } from 'vitest'
import { buildSchedulePeriod, buildScheduleMonth, monthCellItems, monthWeeks, MONTH_CELL_ITEM_LIMIT } from '@/lib/admin/opsSchedule/monthView'
import { periodOf } from '@/lib/admin/opsSchedule/params'
import { signalsByDate } from '@/lib/admin/opsSchedule/signalDays'
import type { ScheduleItem } from '@/lib/admin/opsSchedule/weekView'
import { buildDayCompositions, type SignalBundleInput, type SignalMissionInput } from '@/lib/admin/opsSignals/composition'
import { makeSignalResult, type OpsSignalOutcome } from '@/lib/admin/opsSignals/catalog'
import type { WeeklyCardInput } from '@/lib/admin/weeklyCards'
import type { WeeklyMissionInput } from '@/lib/admin/weeklyMissions'
import { shiftDateStr } from '@/lib/admin/today-calendar'
import { dayEnd, dayStart, kst, makeBundle, makeCard, makeItem } from '@/lib/admin/opsSignals/__tests__/fixtures'

const TODAY = '2026-10-07'
const MISSION_RESOURCE = '3f2a9c1e-0000-4000-8000-0000000000b1'

function dateRange(start: string, end: string): string[] {
  const dates: string[] = []
  for (let date = start; date <= end; date = shiftDateStr(date, 1)) dates.push(date)
  return dates
}

function missionItem(id: string, title: string, startsAt: string, endsAt: string | null, over: Record<string, unknown> = {}) {
  return makeItem({ id, kind: 'mission', status: 'scheduled', startsAt, endsAt, original: { copy: { title } }, ...over })
}

function cardItem(id: string, title: string, startsAt: string, endsAt: string | null, over: Record<string, unknown> = {}) {
  return makeItem({ id, kind: 'home_feed_card', status: 'scheduled', startsAt, endsAt, original: { shape: 'hero', exposure_tags: ['all'], copy: { title } }, ...over })
}

function realMission(id: string, startsAt: string, endsAt: string | null, title = `미션 ${id}`): { signal: SignalMissionInput; weekly: WeeklyMissionInput } {
  return {
    signal: { id, title, startsAt, endsAt },
    weekly: { id, title, starts_at: startsAt, ends_at: endsAt, gate_axis: null } as WeeklyMissionInput,
  }
}

function realCard(id: string, startsAt: string, endsAt: string, title = `카드 ${id}`): { signal: ReturnType<typeof makeCard>; weekly: WeeklyCardInput } {
  return {
    signal: makeCard({ id, title, startsAt, endsAt }),
    weekly: { id, title, content_type_id: null, template_type: 'editorial_article', starts_at: startsAt, ends_at: endsAt, is_active: true, sort_order: 0 } satisfies WeeklyCardInput,
  }
}

interface Scenario {
  date?: string
  bundles?: SignalBundleInput[]
  missions?: ReturnType<typeof realMission>[]
  cards?: ReturnType<typeof realCard>[]
  includeSample?: boolean
  signals?: OpsSignalOutcome[] | null
  scanDates?: string[]
  cardsUnread?: boolean
}

function build(scenario: Scenario = {}) {
  const date = scenario.date ?? '2026-10-15'
  const { start, end } = periodOf('month', date)
  const bundles = scenario.bundles ?? []
  const missions = scenario.missions ?? []
  const cards = scenario.cards ?? []
  const compositions = buildDayCompositions(
    { cards: cards.map((card) => card.signal), missions: missions.map((mission) => mission.signal), bundles },
    dateRange(start, end)
  )
  return buildScheduleMonth({
    date,
    today: TODAY,
    includeSample: scenario.includeSample ?? false,
    compositions,
    bundles,
    cards: scenario.cardsUnread ? null : cards.map((card) => card.weekly),
    missions: missions.map((mission) => mission.weekly),
    signals: scenario.signals ? signalsByDate(scenario.signals, scenario.scanDates ?? [], dateRange(start, end)) : null,
  })
}

const itemsOn = (month: ReturnType<typeof build>, date: string) => month.days.find((day) => day.date === date)!.items
const allItems = (month: ReturnType<typeof build>) => month.days.flatMap((day) => day.items)
const countByTitle = (items: readonly ScheduleItem[], title: string) => items.filter((item) => item.title === title).length

describe('buildScheduleMonth — 달력 틀', () => {
  it('2026년 10월은 월요일 9/28부터 일요일 11/1까지 5주 35칸이고 보이는 달 밖은 inMonth가 거짓이다', () => {
    const month = build()
    expect(month.month).toBe('2026-10')
    expect(month.start).toBe('2026-09-28')
    expect(month.end).toBe('2026-11-01')
    expect(month.days).toHaveLength(35)
    expect(month.days.map((day) => day.date)).toEqual(dateRange('2026-09-28', '2026-11-01'))
    expect(month.days.filter((day) => !day.inMonth).map((day) => day.date)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-11-01'])
    expect(month.days[0].weekdayLabel).toBe('월')
    expect(month.days.every((day, index) => day.weekdayLabel === ['월', '화', '수', '목', '금', '토', '일'][index % 7])).toBe(true)
  })

  it('4주·6주짜리 달도 7의 배수 칸이다', () => {
    expect(build({ date: '2027-02-10' }).days).toHaveLength(28) // 2027-02-01(월)~02-28(일)
    expect(build({ date: '2026-08-12' }).days).toHaveLength(42) // 7/27(월)~9/6(일)
  })

  it('오늘 칸에만 오늘 표시가 있다', () => {
    const month = build()
    expect(month.days.filter((day) => day.isToday).map((day) => day.date)).toEqual([TODAY])
    expect(build({ date: '2026-12-10' }).days.some((day) => day.isToday)).toBe(false)
  })

  it('아무것도 없으면 항목 수가 0이다', () => {
    const month = build()
    expect(month.contentCount).toBe(0)
    expect(month.days.every((day) => day.items.length === 0)).toBe(true)
  })

  it('크론·예약 루틴은 월간에 없다', () => {
    expect(build().days.every((day) => day.automation.length === 0)).toBe(true)
  })

  it('서버에서 클라이언트 컴포넌트로 넘길 수 있는 일반 객체다(JSON으로 왕복해도 같다)', () => {
    const month = build({ bundles: [makeBundle([missionItem('m1', '가을 미션', kst('2026-10-06', '09:00'), kst('2026-10-20', '09:00'))])] })
    expect(JSON.parse(JSON.stringify(month))).toEqual(month)
  })
})

describe('buildScheduleMonth — 칸 항목', () => {
  it('운영 카드는 걸치는 날마다 칸에 있다', () => {
    const month = build({ bundles: [makeBundle([cardItem('c1', '사흘 카드', dayStart('2026-10-06'), dayEnd('2026-10-08'))])] })
    for (const date of ['2026-10-06', '2026-10-07', '2026-10-08']) expect(itemsOn(month, date).map((item) => item.title), date).toEqual(['사흘 카드'])
    expect(itemsOn(month, '2026-10-05')).toEqual([])
    expect(itemsOn(month, '2026-10-09')).toEqual([])
  })

  it('카드가 아닌 운영 항목은 여러 주에 걸쳐도 시작일 칸에 한 번만 있다(매주 월요일 되풀이 없음)', () => {
    const month = build({ bundles: [makeBundle([missionItem('m1', '긴 미션', kst('2026-10-07', '09:00'), kst('2026-10-28', '09:00'))])] })
    expect(countByTitle(allItems(month), '긴 미션')).toBe(1)
    const [item] = itemsOn(month, '2026-10-07')
    expect(item.title).toBe('긴 미션')
    expect(item.time).toBe('09:00')
    expect(item.drawerKey).toBe('m1')
    expect(item.status).toBe('scheduled')
  })

  it('시작이 달력 앞인 운영 항목은 달력 첫 칸에 한 번 남는다(시각은 비어 있다)', () => {
    const month = build({ bundles: [makeBundle([missionItem('m1', '이어지는 미션', kst('2026-09-20', '09:00'), kst('2026-10-10', '09:00'))])] })
    expect(countByTitle(allItems(month), '이어지는 미션')).toBe(1)
    expect(itemsOn(month, '2026-09-28').map((item) => [item.title, item.time])).toEqual([['이어지는 미션', '']])
  })

  it('시작이 달력 안이면 그 주가 첫 주가 아니어도 시작 시각이 붙은 채 시작일 칸에 있다', () => {
    const month = build({ bundles: [makeBundle([missionItem('m1', '둘째 주 미션', kst('2026-10-13', '08:30'), kst('2026-10-14', '09:00'))])] })
    expect(itemsOn(month, '2026-10-13').map((item) => [item.title, item.time])).toEqual([['둘째 주 미션', '08:30']])
    expect(countByTitle(allItems(month), '둘째 주 미션')).toBe(1)
  })

  it('반려·취소 항목은 칸에 없다', () => {
    const month = build({
      bundles: [
        makeBundle([
          missionItem('m1', '반려된 미션', kst('2026-10-06', '09:00'), kst('2026-10-07', '09:00'), { status: 'rejected' }),
          cardItem('c1', '취소된 카드', dayStart('2026-10-06'), dayEnd('2026-10-06'), { status: 'cancelled' }),
        ]),
      ],
    })
    expect(allItems(month)).toEqual([])
  })

  it('시험 묶음은 켰을 때만 보이고 시험 표식이 붙는다', () => {
    const bundles = [makeBundle([cardItem('c1', '시험 카드', dayStart('2026-10-06'), dayEnd('2026-10-06'))], { isSample: true })]
    expect(allItems(build({ bundles }))).toEqual([])
    const shown = itemsOn(build({ bundles, includeSample: true }), '2026-10-06')
    expect(shown.map((item) => [item.title, item.isSample])).toEqual([['시험 카드', true]])
  })

  it('실제 카드는 걸치는 날마다 있고 장기 카드는 줄 하나(개수)로만 센다', () => {
    const month = build({ cards: [realCard('k1', dayStart('2026-10-06'), dayEnd('2026-10-07'), '이틀 카드')] })
    expect(itemsOn(month, '2026-10-06').map((item) => [item.title, item.drawerKey])).toEqual([['이틀 카드', 'card:k1']])
    expect(itemsOn(month, '2026-10-07').map((item) => item.title)).toEqual(['이틀 카드'])
  })

  it('카드를 읽지 못했으면(null) 실제 카드가 빠질 뿐 운영 항목은 그대로다(없다고 단정하지 않는다)', () => {
    const month = build({
      cards: [realCard('k1', dayStart('2026-10-06'), dayEnd('2026-10-06'))],
      cardsUnread: true,
      bundles: [makeBundle([cardItem('c1', '운영 카드', dayStart('2026-10-08'), dayEnd('2026-10-08'))])],
    })
    expect(itemsOn(month, '2026-10-08').map((item) => item.title)).toEqual(['운영 카드'])
    expect(allItems(month).filter((item) => item.origin === 'card')).toEqual([])
  })
})

describe('buildScheduleMonth — 옛 미션과 합치기', () => {
  it('옛 기간 미션은 시작일 칸의 항목이고 서랍 키는 mission:<ID>다(막대가 없는 월간에서 사라지지 않게)', () => {
    const month = build({ missions: [realMission('r1', kst('2026-10-12', '09:00'), kst('2026-10-30', '09:00'), '옛 미션')] })
    expect(countByTitle(allItems(month), '옛 미션')).toBe(1)
    const [item] = itemsOn(month, '2026-10-12')
    expect(item).toMatchObject({ title: '옛 미션', origin: 'mission', drawerKey: 'mission:r1', kind: 'mission', status: null, href: '/admin/missions/r1' })
  })

  it('시작이 달력 앞인 옛 미션은 첫 칸에 한 번만 있다', () => {
    const month = build({ missions: [realMission('r1', kst('2026-09-01', '09:00'), kst('2026-10-30', '09:00'), '이어지는 옛 미션')] })
    expect(countByTitle(allItems(month), '이어지는 옛 미션')).toBe(1)
    expect(itemsOn(month, '2026-09-28').map((item) => item.drawerKey)).toEqual(['mission:r1'])
  })

  it('상시 미션은 그 주 시작 요일 칸의 「시작」 항목이다', () => {
    const month = build({ missions: [realMission('r2', kst('2026-10-14', '09:00'), null, '상시 미션')] })
    expect(itemsOn(month, '2026-10-14').map((item) => [item.title, item.time, item.drawerKey])).toEqual([['상시 미션', '상시', 'mission:r2']])
    expect(countByTitle(allItems(month), '상시 미션')).toBe(1)
  })

  it('운영 항목과 합친 미션은 운영 항목 하나뿐이다(옛 항목이 따로 생기지 않는다)', () => {
    const month = build({
      missions: [realMission(MISSION_RESOURCE, kst('2026-10-12', '09:00'), kst('2026-10-30', '09:00'), '합친 미션')],
      bundles: [
        makeBundle([
          missionItem('m1', '운영 미션', kst('2026-10-12', '09:00'), kst('2026-10-30', '09:00'), { createdResource: { mission_id: MISSION_RESOURCE } }),
        ]),
      ],
    })
    const merged = allItems(month).filter((item) => item.title === '합친 미션' || item.title === '운영 미션')
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ origin: 'ops', drawerKey: 'm1' })
    expect(allItems(month).some((item) => item.drawerKey === `mission:${MISSION_RESOURCE}`)).toBe(false)
  })
})

describe('buildScheduleMonth — 신호', () => {
  const signal: OpsSignalOutcome = {
    key: 'execution_failed',
    name: '실행 실패',
    level: 'stop',
    state: 'raised',
    uncheckedReason: null,
    results: [makeSignalResult('실행에 실패했어요', { date: '2026-10-07' })],
  }

  it('날짜가 있는 신호는 그 날짜 칸에 연결되고, 신호를 못 읽었으면(null) 칸 신호가 비어 있다', () => {
    const month = build({ signals: [signal], scanDates: ['2026-10-07', '2026-10-08'] })
    expect(month.days.find((day) => day.date === '2026-10-07')!.signals).toMatchObject({ checked: true, topLevel: 'stop', count: 1 })
    expect(month.days.find((day) => day.date === '2026-10-08')!.signals).toMatchObject({ checked: true, topLevel: null, count: 0 })
    expect(month.days.find((day) => day.date === '2026-10-20')!.signals).toMatchObject({ checked: false, topLevel: null })
    expect(build().days.every((day) => day.signals === null)).toBe(true)
  })
})

describe('buildSchedulePeriod — 타임라인 창(6주)도 같은 계산이다', () => {
  it('월요일부터 7의 배수 칸을 만들고 크론은 없다', () => {
    const { start, end } = periodOf('timeline', '2026-10-07')
    const period = buildSchedulePeriod({ start, end, today: TODAY, includeSample: false, compositions: [], bundles: [], cards: [], missions: [], signals: null })
    expect(period.days).toHaveLength(42)
    expect(period.days[0].date).toBe(start)
    expect(period.days[41].date).toBe(end)
    expect(period.contentCount).toBe(0)
  })
})

describe('monthCellItems — 한 줄 3개 + 「+N개 더」', () => {
  const make = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `i${index}` }) as ScheduleItem)

  it('3개까지는 모두 보이고 가려진 수가 0이다', () => {
    expect(MONTH_CELL_ITEM_LIMIT).toBe(3)
    expect(monthCellItems(make(0))).toEqual({ visible: [], hiddenCount: 0 })
    expect(monthCellItems(make(3)).hiddenCount).toBe(0)
    expect(monthCellItems(make(3)).visible).toHaveLength(3)
  })

  it('4개부터는 앞 3개만 보이고 나머지 수가 「+N개 더」다', () => {
    const result = monthCellItems(make(4))
    expect(result.visible.map((item) => item.id)).toEqual(['i0', 'i1', 'i2'])
    expect(result.hiddenCount).toBe(1)
    expect(monthCellItems(make(10)).hiddenCount).toBe(7)
  })
})

describe('monthWeeks — 달력 행', () => {
  it('7칸씩 한 주로 나눈다', () => {
    const weeks = monthWeeks(build().days)
    expect(weeks).toHaveLength(5)
    expect(weeks.every((week) => week.length === 7)).toBe(true)
    expect(weeks[0][0].date).toBe('2026-09-28')
    expect(weeks[4][6].date).toBe('2026-11-01')
  })
})
