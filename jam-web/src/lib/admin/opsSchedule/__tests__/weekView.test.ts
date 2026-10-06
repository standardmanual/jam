/**
 * 일정표 주간 보기 계산 (티켓 20261006_1536 ③-a)
 *
 * 지키는 것: 칸 항목(운영 카드는 걸치는 날마다, 그 밖의 운영 항목은 시작일 칸에만), 실제 카드·미션과 운영 항목의 합치기(비활성 카드 포함, 멈춘 항목은 합치지 않음),
 * 미션 막대(운영 미션에 상태, 옛 막대에서 합친 미션 제외, 상시 미션 수는 전체), 장기 카드 활성·비활성 수, 오늘 표시, 칸 신호 연결, 못 읽은 재료 처리, 시험 묶음,
 * 서버 컴포넌트에서 클라이언트 컴포넌트로 넘길 수 있는 모양(JSON으로 왕복해도 같다).
 */
import { describe, expect, it } from 'vitest'
import { buildScheduleWeek, type BuildScheduleWeekInput, type ScheduleWeek } from '@/lib/admin/opsSchedule/weekView'
import { signalsByDate } from '@/lib/admin/opsSchedule/signalDays'
import { buildDayCompositions, type SignalBundleInput, type SignalMissionInput } from '@/lib/admin/opsSignals/composition'
import type { OpsSignalOutcome } from '@/lib/admin/opsSignals/catalog'
import type { WeeklyCardInput } from '@/lib/admin/weeklyCards'
import type { WeeklyMissionInput } from '@/lib/admin/weeklyMissions'
import { shiftDateStr } from '@/lib/admin/today-calendar'
import { dayEnd, dayStart, kst, makeBundle, makeCard, makeItem } from '@/lib/admin/opsSignals/__tests__/fixtures'

const WEEK_START = '2026-10-05' // 월요일
const TODAY = '2026-10-07'
const DATES = Array.from({ length: 7 }, (_, index) => shiftDateStr(WEEK_START, index))
const NO_AUTOMATION = { cron: [], routines: [] }

/** 실제 카드 한 장을 두 입력 모양(날짜 구성용·주간 목록용)으로 함께 만든다. */
function realCard(id: string, startsAt: string, endsAt: string, over: { isActive?: boolean; title?: string; sortOrder?: number; contentTypeId?: string | null } = {}) {
  const isActive = over.isActive ?? true
  const title = over.title ?? `카드 ${id}`
  const sortOrder = over.sortOrder ?? 0
  return {
    signal: makeCard({ id, title, startsAt, endsAt, isActive, sortOrder }),
    weekly: {
      id,
      title,
      content_type_id: over.contentTypeId ?? null,
      template_type: 'editorial_article',
      starts_at: startsAt,
      ends_at: endsAt,
      is_active: isActive,
      sort_order: sortOrder,
    } satisfies WeeklyCardInput,
  }
}

function realMission(id: string, startsAt: string, endsAt: string | null, title = `미션 ${id}`, gateAxis: string | null = null) {
  return {
    signal: { id, title, startsAt, endsAt } satisfies SignalMissionInput,
    weekly: { id, title, starts_at: startsAt, ends_at: endsAt, gate_axis: gateAxis } as WeeklyMissionInput,
  }
}

interface Scenario {
  cards?: ReturnType<typeof realCard>[]
  missions?: ReturnType<typeof realMission>[]
  bundles?: SignalBundleInput[]
  includeSample?: boolean
  signals?: OpsSignalOutcome[]
  scanDates?: string[]
  overrides?: Partial<BuildScheduleWeekInput>
}

/** 날짜 구성은 실제 구성 함수로 만들어 넘긴다(합치기가 실제로 일어난 모양을 쓴다). */
function build(scenario: Scenario = {}): ScheduleWeek {
  const cards = scenario.cards ?? []
  const missions = scenario.missions ?? []
  const bundles = scenario.bundles ?? []
  const includeSample = scenario.includeSample ?? false
  const compositions = buildDayCompositions(
    { cards: cards.map((card) => card.signal), missions: missions.map((mission) => mission.signal), bundles },
    DATES
  )
  return buildScheduleWeek({
    weekStart: WEEK_START,
    today: TODAY,
    includeSample,
    compositions,
    bundles,
    cards: cards.map((card) => card.weekly),
    missions: missions.map((mission) => mission.weekly),
    signals: scenario.signals ? signalsByDate(scenario.signals, scenario.scanDates ?? [], DATES) : null,
    automation: NO_AUTOMATION,
    ...scenario.overrides,
  })
}

const titles = (week: ScheduleWeek, date: string) => week.days.find((day) => day.date === date)!.items.map((item) => item.title)
const itemsOf = (week: ScheduleWeek, date: string) => week.days.find((day) => day.date === date)!.items

describe('buildScheduleWeek — 틀', () => {
  it('월~일 7칸이고 요일·날짜 글자와 오늘 표시가 맞다', () => {
    const week = build()
    expect(week.days.map((day) => day.date)).toEqual(DATES)
    expect(week.days.map((day) => day.weekdayLabel)).toEqual(['월', '화', '수', '목', '금', '토', '일'])
    expect(week.days[0].dateLabel).toBe('10월 5일')
    expect(week.days.filter((day) => day.isToday).map((day) => day.date)).toEqual([TODAY])
    expect(week.weekStart).toBe(WEEK_START)
    expect(week.weekEnd).toBe('2026-10-11')
  })

  it('보는 주에 오늘이 없으면 오늘 표시가 없다', () => {
    const week = buildScheduleWeek({ ...baseInput(), today: '2026-11-20' })
    expect(week.days.some((day) => day.isToday)).toBe(false)
  })

  it('아무것도 없으면 칸 항목·막대·장기 카드가 없고 항목 수가 0이다', () => {
    const week = build()
    expect(week.contentCount).toBe(0)
    expect(week.missionBars).toEqual([])
    expect(week.days.every((day) => day.items.length === 0 && day.longActiveCount === 0 && day.longInactiveCount === 0)).toBe(true)
    expect(week.openEndedMissionCount).toBe(0)
  })

  it('이 저장소의 크론·루틴 설정을 읽으면 자동 실행이 칸 항목과 따로 들어 있고 항목 수에는 세지 않는다', () => {
    const { automation, ...rest } = baseInput()
    void automation
    const week = buildScheduleWeek(rest)
    expect(week.days.reduce((sum, day) => sum + day.automation.length, 0)).toBeGreaterThan(0)
    expect(week.contentCount).toBe(0)
    expect(week.days.every((day) => day.items.length === 0)).toBe(true)
  })

  it('자동 실행은 시각순이고 크론 「매시간」이 맨 앞이며 꺼진 루틴은 흐리다', () => {
    const week = buildScheduleWeek({
      ...baseInput(),
      automation: {
        cron: [
          { path: '/api/cron/a', label: '아침 크론', weekday: 1, hour: 9, minute: 0, hourly: false },
          { path: '/api/cron/b', label: '매시 크론', weekday: 1, hour: 0, minute: 0, hourly: true },
        ],
        routines: [
          { date: '2026-10-05', time: '08:30', label: '꺼진 루틴', enabled: false },
          { date: '2026-10-06', time: '08:30', label: '다른 날 루틴', enabled: true },
        ],
      },
    })
    const monday = week.days[0].automation
    expect(monday.map((entry) => entry.label)).toEqual(['매시 크론', '꺼진 루틴', '아침 크론'])
    expect(monday.find((entry) => entry.label === '꺼진 루틴')).toMatchObject({ routine: true, dim: true })
    expect(monday.find((entry) => entry.label === '아침 크론')).toMatchObject({ routine: false, dim: false })
    expect(week.days[1].automation.map((entry) => entry.label)).toEqual(['다른 날 루틴'])
  })
})

function baseInput(): BuildScheduleWeekInput {
  return {
    weekStart: WEEK_START,
    today: TODAY,
    includeSample: false,
    compositions: buildDayCompositions({ cards: [], missions: [], bundles: [] }, DATES),
    bundles: [],
    cards: [],
    missions: [],
    signals: null,
    automation: NO_AUTOMATION,
  }
}

describe('buildScheduleWeek — 운영 항목', () => {
  it('운영 카드는 상태·시험·서랍 키·기획 상세 링크를 가진다', () => {
    const item = makeItem({ id: 'item-a', status: 'reviewing', startsAt: kst('2026-10-06', '09:30'), endsAt: kst('2026-10-06', '18:00') })
    const bundle = makeBundle([item], { id: 'bundle-a' })
    const week = build({ bundles: [bundle] })
    expect(itemsOf(week, '2026-10-06')).toEqual([
      expect.objectContaining({
        origin: 'ops',
        drawerKey: 'item-a',
        kind: 'home_feed_card',
        title: '운영 카드',
        time: '09:30',
        status: 'reviewing',
        isSample: false,
        dim: false,
        href: '/admin/ops-inbox/bundle-a?item=item-a',
      }),
    ])
    expect(week.contentCount).toBe(1)
  })

  it('운영 카드는 걸치는 날마다 나오고 시각은 시작한 날에만 있다', () => {
    const item = makeItem({ id: 'item-multi', startsAt: kst('2026-10-06', '09:00'), endsAt: kst('2026-10-08', '21:00') })
    const week = build({ bundles: [makeBundle([item])] })
    const days = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'].map((date) => itemsOf(week, date).map((entry) => entry.time))
    expect(days).toEqual([[], ['09:00'], [''], [''], []])
  })

  it('카드가 아닌 운영 항목은 시작일 칸에만 있다(가정 3)', () => {
    const drop = makeItem({
      id: 'item-drop',
      kind: 'drop_schedule',
      status: 'scheduled',
      startsAt: kst('2026-10-06', '12:00'),
      endsAt: kst('2026-10-09', '12:00'),
      original: { copy: { title: '드랍 일정' } },
    })
    const week = build({ bundles: [makeBundle([drop])] })
    const where = week.days.filter((day) => day.items.some((entry) => entry.drawerKey === 'item-drop')).map((day) => day.date)
    expect(where).toEqual(['2026-10-06'])
    expect(itemsOf(week, '2026-10-06')[0]).toMatchObject({ kind: 'drop_schedule', status: 'scheduled', time: '12:00' })
  })

  it('시작일이 이 주 앞인 항목은 이 주의 첫 칸에 한 번만 있다(진행 중인 항목이 주에서 사라지지 않는다)', () => {
    const launch = makeItem({
      id: 'item-launch',
      kind: 'collection_launch',
      status: 'live',
      startsAt: kst('2026-09-28', '10:00'),
      endsAt: kst('2026-10-20', '10:00'),
      original: { copy: { title: '컬렉션 런칭' } },
    })
    const week = build({ bundles: [makeBundle([launch])] })
    const where = week.days.filter((day) => day.items.some((entry) => entry.drawerKey === 'item-launch')).map((day) => day.date)
    expect(where).toEqual(['2026-10-05'])
    expect(itemsOf(week, '2026-10-05')[0].time).toBe('')
  })

  it('실패·반려·취소 항목은 칸에 없다(가정 4)', () => {
    const items = ['failed', 'rejected', 'cancelled'].map((status) => makeItem({ status, startsAt: kst('2026-10-06', '09:00') }))
    const week = build({ bundles: [makeBundle(items)] })
    expect(week.contentCount).toBe(0)
  })

  it('패턴 제안은 칸에 없다', () => {
    const proposal = makeItem({ kind: 'pattern_proposal', startsAt: kst('2026-10-06', '09:00'), original: {} })
    expect(build({ bundles: [makeBundle([proposal])] }).contentCount).toBe(0)
  })
})

describe('buildScheduleWeek — 실제 카드와 합치기(가정 11)', () => {
  it('활성 카드와 합쳐진 운영 항목은 한 번만 나온다(운영 항목으로)', () => {
    const card = realCard('card-1', kst('2026-10-06', '09:00'), kst('2026-10-06', '21:00'), { title: '실제 제목' })
    const item = makeItem({ id: 'item-1', status: 'scheduled', startsAt: kst('2026-10-06', '09:00'), createdResource: { today_card_id: 'card-1' } })
    const week = build({ cards: [card], bundles: [makeBundle([item])] })
    const day = itemsOf(week, '2026-10-06')
    expect(day).toHaveLength(1)
    expect(day[0]).toMatchObject({ origin: 'ops', drawerKey: 'item-1', title: '실제 제목', status: 'scheduled' })
    expect(week.contentCount).toBe(1)
  })

  it('비활성 카드가 운영 항목에 이어져 있으면 흐린 실제 카드가 따로 나오지 않는다', () => {
    const card = realCard('card-off', kst('2026-10-06', '09:00'), kst('2026-10-06', '21:00'), { isActive: false, title: '꺼진 카드' })
    const item = makeItem({ id: 'item-off', status: 'scheduled', startsAt: kst('2026-10-06', '09:00'), createdResource: { today_card_id: 'card-off' } })
    const week = build({ cards: [card], bundles: [makeBundle([item])] })
    const day = itemsOf(week, '2026-10-06')
    expect(day.map((entry) => entry.origin)).toEqual(['ops'])
    expect(day.some((entry) => entry.dim)).toBe(false)
  })

  it('비활성 장기 카드가 운영 항목에 이어져 있으면 비활성 장기 카드 수에도 세지 않는다', () => {
    const longOff = realCard('card-long-off', dayStart('2026-09-20'), dayEnd('2026-10-30'), { isActive: false })
    const longOther = realCard('card-long-other', dayStart('2026-09-20'), dayEnd('2026-10-30'), { isActive: false })
    const item = makeItem({ id: 'item-long', status: 'live', startsAt: dayStart('2026-09-20'), endsAt: dayEnd('2026-10-30'), createdResource: { today_card_id: 'card-long-off' } })
    const week = build({ cards: [longOff, longOther], bundles: [makeBundle([item])] })
    expect(week.days[0]).toMatchObject({ longActiveCount: 0, longInactiveCount: 1 })
  })

  it('멈춘 항목(반려·취소·실패)은 합치지 않아 실제 카드가 그대로 나온다', () => {
    const card = realCard('card-keep', kst('2026-10-06', '09:00'), kst('2026-10-06', '21:00'))
    for (const status of ['rejected', 'cancelled', 'failed']) {
      const item = makeItem({ status, startsAt: kst('2026-10-06', '09:00'), createdResource: { today_card_id: 'card-keep' } })
      const week = build({ cards: [card], bundles: [makeBundle([item])] })
      expect(itemsOf(week, '2026-10-06').map((entry) => entry.origin), status).toEqual(['card'])
    }
  })

  it('이어지지 않은 실제 카드는 그대로 나온다(유형 ID·흐림·링크·서랍 키)', () => {
    const on = realCard('card-on', kst('2026-10-06', '09:00'), kst('2026-10-06', '21:00'), { contentTypeId: 'T03', sortOrder: 0 })
    const off = realCard('card-dim', kst('2026-10-06', '09:00'), kst('2026-10-06', '21:00'), { isActive: false, sortOrder: 1 })
    const noType = realCard('card-notype', kst('2026-10-07', '09:00'), kst('2026-10-07', '21:00'))
    const week = build({ cards: [on, off, noType] })
    expect(itemsOf(week, '2026-10-06')).toEqual([
      expect.objectContaining({ origin: 'card', drawerKey: 'card:card-on', time: 'T03', status: null, dim: false, href: '/admin/today/card-on?date=2026-10-06' }),
      expect.objectContaining({ origin: 'card', drawerKey: 'card:card-dim', dim: true }),
    ])
    expect(itemsOf(week, '2026-10-07')[0].time).toBe('유형 없음')
  })

  it('카드 노출·열람 줄은 카드·날짜별로 붙는다', () => {
    const card = realCard('card-note', kst('2026-10-06', '09:00'), kst('2026-10-07', '21:00'))
    const week = build({ cards: [card], overrides: { cardNote: (id, date) => `${id}/${date}` } })
    expect(itemsOf(week, '2026-10-06')[0].note).toBe('card-note/2026-10-06')
    expect(itemsOf(week, '2026-10-07')[0].note).toBe('card-note/2026-10-07')
  })

  it('운영 항목 → 카드 순서로 같은 칸에 나온다', () => {
    const card = realCard('card-order', kst('2026-10-06', '09:00'), kst('2026-10-06', '21:00'))
    const item = makeItem({ id: 'item-order', startsAt: kst('2026-10-06', '09:00') })
    const week = build({ cards: [card], bundles: [makeBundle([item])] })
    expect(itemsOf(week, '2026-10-06').map((entry) => entry.origin)).toEqual(['ops', 'card'])
  })
})

describe('buildScheduleWeek — 장기 카드(1151 흡수)', () => {
  it('활성 장기와 비활성 장기를 따로 세고 단기와 합치면 그날 겹치는 카드 수다', () => {
    const short = realCard('short', kst('2026-10-06', '09:00'), kst('2026-10-06', '21:00'))
    const shortOff = realCard('short-off', kst('2026-10-06', '09:00'), kst('2026-10-06', '21:00'), { isActive: false })
    const longOn = realCard('long-on', dayStart('2026-09-01'), dayEnd('2026-10-31'))
    const longOff1 = realCard('long-off-1', dayStart('2026-09-01'), dayEnd('2026-10-31'), { isActive: false })
    const longOff2 = realCard('long-off-2', dayStart('2026-10-06'), dayEnd('2026-11-30'), { isActive: false })
    const week = build({ cards: [short, shortOff, longOn, longOff1, longOff2] })
    const tuesday = week.days[1]
    expect(tuesday.longActiveCount).toBe(1)
    expect(tuesday.longInactiveCount).toBe(2)
    expect(tuesday.items.filter((entry) => entry.origin === 'card')).toHaveLength(2)
    // 그날 `/admin/today?date=`에 나오는 카드 수(겹침 판정)
    expect(tuesday.items.length + tuesday.longActiveCount + tuesday.longInactiveCount).toBe(5)
    // 비활성 장기 카드가 없는 날은 지금과 같다
    expect(week.days[0].longInactiveCount).toBe(1)
    expect(buildScheduleWeek({ ...baseInput(), cards: [longOn.weekly] }).days.every((day) => day.longInactiveCount === 0)).toBe(true)
  })
})

describe('buildScheduleWeek — 미션(가정 3)', () => {
  it('옛 미션은 막대·상시 미션 수·상시 시작 항목이 지금과 같다', () => {
    const period = realMission('m-period', kst('2026-10-06', '00:00'), kst('2026-10-08', '23:00'), '기간 미션', 'gate-axis')
    const openEnded = realMission('m-open', kst('2026-09-01', '00:00'), null, '상시 미션')
    const openStarting = realMission('m-open-new', kst('2026-10-07', '10:00'), null, '새 상시 미션')
    const week = build({ missions: [period, openEnded, openStarting] })
    expect(week.missionBars).toEqual([
      expect.objectContaining({ id: 'mission-m-period', title: '기간 미션', startCol: 1, endCol: 3, startsThisWeek: true, endsThisWeek: true, isGate: true, status: null, drawerKey: 'mission:m-period', href: '/admin/missions/m-period' }),
    ])
    expect(week.openEndedMissionCount).toBe(2)
    expect(itemsOf(week, '2026-10-07')).toEqual([
      expect.objectContaining({ origin: 'mission', drawerKey: 'mission:m-open-new', time: '상시', title: '새 상시 미션', href: '/admin/missions/m-open-new' }),
    ])
  })

  it('운영 미션과 합친 실제 미션은 막대 한 줄로만 나오고 상태가 붙는다', () => {
    const mission = realMission('m-1', kst('2026-10-06', '00:00'), kst('2026-10-09', '23:00'), '합친 미션', 'axis')
    const item = makeItem({
      id: 'item-m1',
      kind: 'mission',
      status: 'scheduled',
      startsAt: kst('2026-10-06', '00:00'),
      endsAt: kst('2026-10-09', '23:00'),
      original: { copy: { title: '운영 쪽 제목' } },
      createdResource: { mission_id: 'm-1' },
    })
    const week = build({ missions: [mission], bundles: [makeBundle([item], { id: 'bundle-m' })] })
    expect(week.missionBars).toEqual([
      expect.objectContaining({ id: 'ops-item-m1', title: '합친 미션', startCol: 1, endCol: 4, status: 'scheduled', isGate: true, drawerKey: 'item-m1', href: '/admin/ops-inbox/bundle-m?item=item-m1' }),
    ])
    // 칸에는 시작일 한 번(운영 항목으로)
    expect(week.days.filter((day) => day.items.some((entry) => entry.title === '합친 미션')).map((day) => day.date)).toEqual(['2026-10-06'])
    expect(week.days.flatMap((day) => day.items).filter((entry) => entry.origin === 'mission')).toEqual([])
  })

  it('합친 상시 미션은 시작 항목이 두 번 나오지 않고 상시 미션 수에는 센다', () => {
    const mission = realMission('m-open', kst('2026-10-06', '10:00'), null, '상시')
    const other = realMission('m-other', kst('2026-09-01', '00:00'), null, '다른 상시')
    const item = makeItem({ id: 'item-open', kind: 'mission', status: 'live', startsAt: kst('2026-10-06', '10:00'), endsAt: null, original: { copy: { title: '상시' } }, createdResource: { mission_id: 'm-open' } })
    const week = build({ missions: [mission, other], bundles: [makeBundle([item])] })
    expect(week.openEndedMissionCount).toBe(2)
    expect(itemsOf(week, '2026-10-06').map((entry) => entry.origin)).toEqual(['ops'])
    expect(week.missionBars).toEqual([])
  })

  it('아직 이어지지 않은 운영 미션도 기간이 있으면 막대이고 주 밖으로 넘치는 쪽은 자른다', () => {
    const item = makeItem({ id: 'item-long-m', kind: 'mission', status: 'reviewing', startsAt: kst('2026-09-30', '09:00'), endsAt: kst('2026-10-07', '23:00'), original: { copy: { title: '긴 미션' } } })
    const week = build({ bundles: [makeBundle([item])] })
    expect(week.missionBars).toEqual([
      expect.objectContaining({ title: '긴 미션', startCol: 0, endCol: 2, startsThisWeek: false, endsThisWeek: true, status: 'reviewing', isGate: false }),
    ])
    const open = makeItem({ id: 'item-over', kind: 'mission', startsAt: kst('2026-10-09', '09:00'), endsAt: kst('2026-10-20', '09:00'), original: { copy: { title: '넘치는 미션' } } })
    const over = build({ bundles: [makeBundle([open])] })
    expect(over.missionBars[0]).toMatchObject({ startCol: 4, endCol: 6, startsThisWeek: true, endsThisWeek: false })
  })

  it('종료가 없는 운영 미션(아직 이어지지 않음)은 막대 없이 시작일 칸에만 있다', () => {
    const item = makeItem({ kind: 'mission', startsAt: kst('2026-10-06', '09:00'), endsAt: null, original: { copy: { title: '하루 미션' } } })
    const week = build({ bundles: [makeBundle([item])] })
    expect(week.missionBars).toEqual([])
    expect(titles(week, '2026-10-06')).toEqual(['하루 미션'])
  })

  it('멈춘 운영 항목이 가리킨 미션은 옛 막대로 그대로 남는다', () => {
    const mission = realMission('m-keep', kst('2026-10-06', '00:00'), kst('2026-10-08', '23:00'), '남는 미션')
    const item = makeItem({ kind: 'mission', status: 'failed', startsAt: kst('2026-10-06', '00:00'), endsAt: kst('2026-10-08', '23:00'), createdResource: { mission_id: 'm-keep' } })
    const week = build({ missions: [mission], bundles: [makeBundle([item])] })
    expect(week.missionBars.map((bar) => bar.id)).toEqual(['mission-m-keep'])
  })
})

describe('buildScheduleWeek — 시험 묶음', () => {
  it('시험을 빼면 시험 항목이 없고, 켜면 시험 칩 표식과 sample=1 링크가 붙는다', () => {
    const item = makeItem({ id: 'item-s', startsAt: kst('2026-10-06', '09:00') })
    const bundle = makeBundle([item], { id: 'bundle-s', isSample: true })
    expect(build({ bundles: [bundle], includeSample: false }).contentCount).toBe(0)
    const on = build({ bundles: [bundle], includeSample: true })
    expect(itemsOf(on, '2026-10-06')[0]).toMatchObject({ isSample: true, href: '/admin/ops-inbox/bundle-s?item=item-s&sample=1' })
  })
})

describe('buildScheduleWeek — 신호', () => {
  const raised = (level: 'stop' | 'warn' | 'info', date: string): OpsSignalOutcome => ({
    key: level === 'stop' ? 'execution_failed' : level === 'warn' ? 'format_error' : 'overlap',
    name: `${level} 신호`,
    level,
    state: 'raised',
    uncheckedReason: null,
    results: [{ message: '문장', date, bundleId: null, itemId: null, isSample: false, onsetAt: null }],
  })

  it('칸마다 그날 신호를 붙이고, 못 읽었으면 null이다', () => {
    const week = build({ signals: [raised('warn', '2026-10-07'), raised('stop', '2026-10-07')], scanDates: ['2026-10-07', '2026-10-08'] })
    expect(week.days[2].signals).toMatchObject({ checked: true, topLevel: 'stop', count: 2 })
    expect(week.days[3].signals).toMatchObject({ checked: true, topLevel: null, count: 0 })
    expect(week.days[0].signals).toMatchObject({ checked: false, topLevel: null, count: 0 })
    expect(build().days.every((day) => day.signals === null)).toBe(true)
  })
})

describe('buildScheduleWeek — 못 읽은 재료', () => {
  it('카드를 못 읽으면 실제 카드·장기 카드 줄이 비고 운영 항목은 그대로 나온다(미편성을 만들지 않는다)', () => {
    const item = makeItem({ id: 'item-c', startsAt: kst('2026-10-06', '09:00') })
    const week = build({ bundles: [makeBundle([item])], overrides: { cards: null } })
    expect(itemsOf(week, '2026-10-06').map((entry) => entry.origin)).toEqual(['ops'])
    expect(week.days.every((day) => day.longActiveCount === 0 && day.longInactiveCount === 0)).toBe(true)
    expect(JSON.stringify(week)).not.toContain('unprogrammed')
  })

  it('미션을 못 읽으면 막대가 없고 상시 미션 수가 null이다(0이라고 단정하지 않는다)', () => {
    const week = build({ overrides: { missions: null } })
    expect(week.missionBars).toEqual([])
    expect(week.openEndedMissionCount).toBeNull()
  })

  it('묶음을 못 읽어도 실제 카드·미션은 그대로 나온다', () => {
    const card = realCard('card-b', kst('2026-10-06', '09:00'), kst('2026-10-06', '21:00'))
    const week = build({ cards: [card], overrides: { bundles: null } })
    expect(itemsOf(week, '2026-10-06').map((entry) => entry.origin)).toEqual(['card'])
  })
})

describe('buildScheduleWeek — 서버에서 클라이언트로 넘기는 모양', () => {
  it('JSON으로 왕복해도 같다(Map·Date·함수가 없다)', () => {
    const card = realCard('card-j', kst('2026-10-06', '09:00'), kst('2026-10-06', '21:00'))
    const mission = realMission('m-j', kst('2026-10-06', '00:00'), kst('2026-10-08', '23:00'))
    const item = makeItem({ id: 'item-j', startsAt: kst('2026-10-07', '09:00') })
    const week = build({ cards: [card], missions: [mission], bundles: [makeBundle([item])], signals: [], scanDates: [] })
    expect(JSON.parse(JSON.stringify(week))).toEqual(week)
  })
})
