/**
 * 일정표 타임라인 계산 (티켓 20261006_1538 ③-c)
 *
 * 지키는 것:
 * - 틀: 6주 창 42열, 주 눈금 6개, 오늘 열(창 안일 때만), 줄 순서(미션·드랍 일정·컬렉션 런칭), 서버에서 클라이언트로 넘길 수 있는 모양
 * - 막대: 운영 항목의 기간·상태·점선(승인 전)·실패 남김·반려/취소 제외, `aria-label`에 종류·기간·상태, 하루짜리, 창 앞뒤로 잘림
 * - 컬렉션 준비 구간(R4): 시작 앞 [시작 − 리드일, 시작) 점선 칸 + 노출 실선, 꺼졌거나 못 읽으면 28일, 창 앞에서 시작하면 없음, 창 뒤면 준비 구간 점선만(겹칠 때)
 * - 합치기: 운영 항목이 `created_resource`로 가리키는 미션·드랍 일정·컬렉션은 중복 없이 운영 항목 막대 하나(실제 자원의 제목·기간), 멈춘 항목은 합치지 않음
 * - 실제 자원 막대: 상태를 값에서 계산(기간·예약 상태), 취소된 드랍 일정·상시 미션·시작일 없는 컬렉션은 막대가 없다, 끝없는 컬렉션은 창 끝까지
 * - 레인: 겹치는 막대는 가로줄을 나누고 준비 구간도 자리를 차지한다
 * - 신호 줄: 칩 칸·안내(못 읽음 / 확인 기간 밖 / 뜬 것 없음), 줄의 빈 글자는 못 읽은 재료를 「없다」고 하지 않는다
 */
import { describe, expect, it } from 'vitest'
import { buildSchedulePeriod } from '@/lib/admin/opsSchedule/monthView'
import { periodOf } from '@/lib/admin/opsSchedule/params'
import { signalsByDate, type DaySignals } from '@/lib/admin/opsSchedule/signalDays'
import {
  barAriaLabel,
  buildTimeline,
  formatBarPeriod,
  leadDaysOf,
  TIMELINE_DEFAULT_LEAD_DAYS,
  TIMELINE_ROW_EMPTY_TEXT,
  TIMELINE_SIGNAL_NONE_TEXT,
  TIMELINE_SIGNAL_UNCHECKED_TEXT,
  timelineRowNotice,
  type BuildTimelineInput,
  type ScheduleTimeline,
  type TimelineBookRow,
  type TimelineDropRow,
} from '@/lib/admin/opsSchedule/timeline'
import { DAY_ITEMS_PARTIAL_TEXT, DAY_SIGNAL_UNREAD_TEXT } from '@/lib/admin/opsSchedule/drawerView'
import { parseBalanceRules, type OpsRuleRow } from '@/lib/admin/opsInbox/balance/rules'
import { makeSignalResult, type OpsSignalOutcome } from '@/lib/admin/opsSignals/catalog'
import type { SignalBundleInput } from '@/lib/admin/opsSignals/composition'
import type { WeeklyMissionInput } from '@/lib/admin/weeklyMissions'
import { shiftDateStr } from '@/lib/admin/today-calendar'
import { kst, makeBundle, makeItem } from '@/lib/admin/opsSignals/__tests__/fixtures'

const TODAY = '2026-10-07'
const NOW = new Date('2026-10-07T03:00:00.000Z') // 10-07 12:00 KST
const { start: START, end: END } = periodOf('timeline', TODAY)
const MISSION_ID = '3f2a9c1e-0000-4000-8000-0000000000b1'
const DROP_ID = '3f2a9c1e-0000-4000-8000-0000000000d1'
const BOOK_ID = '3f2a9c1e-0000-4000-8000-0000000000e1'

function dateRange(from: string, to: string): string[] {
  const dates: string[] = []
  for (let date = from; date <= to; date = shiftDateStr(date, 1)) dates.push(date)
  return dates
}

const opsItem = (kind: 'mission' | 'drop_schedule' | 'collection_launch', id: string, title: string, startsAt: string, endsAt: string | null, over: Record<string, unknown> = {}) =>
  makeItem({ id, kind, status: 'scheduled', startsAt, endsAt, original: { copy: { title } }, ...over })

function mission(id: string, startsAt: string, endsAt: string | null, title = `미션 ${id}`): WeeklyMissionInput {
  return { id, title, starts_at: startsAt, ends_at: endsAt, gate_axis: null } as WeeklyMissionInput
}

function drop(id: string, scheduledAt: string, status = 'scheduled', over: Partial<TimelineDropRow> = {}): TimelineDropRow {
  return { id, scheduled_at: scheduledAt, status, claimed_at: null, canceled_at: null, title: `드랍 ${id}`, ...over }
}

function book(id: string, validFrom: string | null, validUntil: string | null, over: Partial<TimelineBookRow> = {}): TimelineBookRow {
  return { id, name: `컬렉션 ${id}`, valid_from: validFrom, valid_until: validUntil, is_active: true, ...over }
}

function emptyDays(signals: Record<string, DaySignals> | null = null) {
  return buildSchedulePeriod({ start: START, end: END, today: TODAY, includeSample: false, compositions: [], bundles: [], cards: [], missions: [], signals }).days
}

function build(over: Partial<BuildTimelineInput> = {}): ScheduleTimeline {
  return buildTimeline({
    start: START,
    end: END,
    today: TODAY,
    now: NOW,
    includeSample: false,
    bundles: [],
    missions: [],
    dropSchedules: [],
    itemBooks: [],
    leadDays: TIMELINE_DEFAULT_LEAD_DAYS,
    days: emptyDays(),
    ...over,
  })
}

const rowOf = (timeline: ScheduleTimeline, key: 'mission' | 'drop_schedule' | 'collection_launch') => timeline.rows.find((row) => row.key === key)!
const bundlesOf = (...items: ReturnType<typeof makeItem>[]): SignalBundleInput[] => [makeBundle(items)]

describe('buildTimeline — 틀', () => {
  it('창은 월요일 10/5부터 6주(42일)이고 4주 격자에 고정된 값이다', () => {
    expect(START).toBe('2026-10-05')
    expect(END).toBe('2026-11-15')
    const timeline = build()
    expect(timeline).toMatchObject({ start: START, end: END, columnCount: 42 })
    expect(timeline.days).toHaveLength(42)
  })

  it('주 눈금은 주마다 하나(6개)이고 첫 열과 날짜 글자가 맞다', () => {
    expect(build().ticks).toEqual([
      { col: 1, label: '10/5' },
      { col: 8, label: '10/12' },
      { col: 15, label: '10/19' },
      { col: 22, label: '10/26' },
      { col: 29, label: '11/2' },
      { col: 36, label: '11/9' },
    ])
  })

  it('오늘 세로선의 열은 창 안일 때만 있다', () => {
    expect(build().todayCol).toBe(3) // 10/5가 1열, 10/7이 3열
    expect(build({ today: START }).todayCol).toBe(1)
    expect(build({ today: END }).todayCol).toBe(42)
    expect(build({ today: '2026-10-04' }).todayCol).toBeNull()
    expect(build({ today: '2026-11-16' }).todayCol).toBeNull()
  })

  it('줄은 미션·드랍 일정·컬렉션 런칭 순서이고 아무것도 없으면 막대가 없다', () => {
    const timeline = build()
    expect(timeline.rows.map((row) => [row.key, row.label, row.bars.length, row.laneCount])).toEqual([
      ['mission', '미션', 0, 0],
      ['drop_schedule', '드랍 일정', 0, 0],
      ['collection_launch', '컬렉션 런칭', 0, 0],
    ])
    expect(timeline.contentCount).toBe(0)
  })

  it('서버에서 클라이언트 컴포넌트로 넘길 수 있는 일반 객체다(JSON으로 왕복해도 같다)', () => {
    const timeline = build({
      bundles: bundlesOf(opsItem('mission', 'm1', '가을 미션', kst('2026-10-08', '09:00'), kst('2026-10-14', '09:00'))),
      itemBooks: [book(BOOK_ID, kst('2026-10-20', '09:00'), null)],
    })
    expect(JSON.parse(JSON.stringify(timeline))).toEqual(timeline)
  })
})

describe('buildTimeline — 운영 항목 막대', () => {
  const missionBar = () => rowOf(build({ bundles: bundlesOf(opsItem('mission', 'm1', '가을 미션', kst('2026-10-08', '09:00'), kst('2026-10-14', '18:00'))) }), 'mission').bars[0]

  it('기간은 시작·종료 날짜(KST)의 열이고 항목 서랍 키가 붙는다', () => {
    expect(missionBar()).toMatchObject({
      origin: 'ops',
      drawerKey: 'm1',
      href: null,
      title: '가을 미션',
      status: 'scheduled',
      startDate: '2026-10-08',
      endDate: '2026-10-14',
      startCol: 4,
      endCol: 10,
      clippedStart: false,
      clippedEnd: false,
      lane: 0,
      prep: null,
    })
  })

  it('aria-label에 종류·기간·상태가 있다', () => {
    expect(missionBar().ariaLabel).toBe('미션 「가을 미션」, 10월 8일부터 10월 14일까지, 상태 예약됨')
  })

  it('종료가 없거나 시작보다 이르면 하루짜리다(한 칸 폭)', () => {
    const noEnd = rowOf(build({ bundles: bundlesOf(opsItem('drop_schedule', 'd1', '하루 드랍', kst('2026-10-09', '10:00'), null)) }), 'drop_schedule').bars[0]
    expect(noEnd).toMatchObject({ startCol: 5, endCol: 5, startDate: '2026-10-09', endDate: '2026-10-09' })
    expect(noEnd.ariaLabel).toBe('드랍 일정 「하루 드랍」, 10월 9일, 상태 예약됨')
    const earlier = rowOf(build({ bundles: bundlesOf(opsItem('mission', 'm2', '거꾸로', kst('2026-10-09', '10:00'), kst('2026-10-08', '10:00'))) }), 'mission').bars[0]
    expect(earlier).toMatchObject({ startCol: 5, endCol: 5 })
  })

  it('창 앞에서 시작하거나 뒤에서 끝나면 창 가장자리로 잘리고 잘린 쪽이 표시된다', () => {
    const [bar] = rowOf(build({ bundles: bundlesOf(opsItem('mission', 'm1', '긴 미션', kst('2026-09-20', '09:00'), kst('2026-12-01', '09:00'))) }), 'mission').bars
    expect(bar).toMatchObject({ startCol: 1, endCol: 42, clippedStart: true, clippedEnd: true, startDate: '2026-09-20', endDate: '2026-12-01' })
    // 기간 글자는 잘리기 전 실제 날짜다
    expect(bar.ariaLabel).toContain('9월 20일부터 12월 1일까지')
  })

  it('창 밖의 항목은 막대가 없다', () => {
    const timeline = build({
      bundles: bundlesOf(
        opsItem('mission', 'before', '지난 미션', kst('2026-09-01', '09:00'), kst('2026-10-04', '09:00')),
        opsItem('mission', 'after', '먼 미션', kst('2026-11-16', '09:00'), kst('2026-11-20', '09:00'))
      ),
    })
    expect(rowOf(timeline, 'mission').bars).toEqual([])
  })

  it('승인 전 상태는 점선이고 예약됨·게재중·종료·실패는 실선이다', () => {
    const statuses = ['arrived', 'reviewing', 'approved', 'preparing', 'scheduled', 'live', 'ended', 'failed']
    const items = statuses.map((status, index) => opsItem('mission', `s-${status}`, `상태 ${status}`, kst(shiftDateStr('2026-10-08', index), '09:00'), null, { status }))
    const bars = rowOf(build({ bundles: bundlesOf(...items) }), 'mission').bars
    expect(Object.fromEntries(bars.map((bar) => [bar.status, bar.dashed]))).toEqual({
      arrived: true,
      reviewing: true,
      approved: true,
      preparing: true,
      scheduled: false,
      live: false,
      ended: false,
      failed: false,
    })
  })

  it('실패 항목은 「실패」 상태로 남고(가정 4) 반려·취소 항목은 타임라인에 없다', () => {
    const items = ['failed', 'rejected', 'cancelled'].map((status, index) =>
      opsItem('mission', `x-${status}`, `상태 ${status}`, kst(shiftDateStr('2026-10-08', index), '09:00'), null, { status })
    )
    const bars = rowOf(build({ bundles: bundlesOf(...items) }), 'mission').bars
    expect(bars.map((bar) => [bar.drawerKey, bar.status])).toEqual([['x-failed', 'failed']])
    expect(bars[0].ariaLabel).toContain('상태 실패')
  })

  it('종류가 미션·드랍 일정·컬렉션 런칭이 아닌 항목(카드·배지)은 막대가 아니다', () => {
    const timeline = build({
      bundles: bundlesOf(
        makeItem({ id: 'card-1', kind: 'home_feed_card', startsAt: kst('2026-10-08', '09:00') }),
        makeItem({ id: 'badge-1', kind: 'jam_badge', startsAt: kst('2026-10-08', '09:00') })
      ),
    })
    expect(timeline.rows.every((row) => row.bars.length === 0)).toBe(true)
  })

  it('시작 시각을 읽을 수 없는 항목은 막대가 없다', () => {
    const timeline = build({ bundles: bundlesOf(opsItem('mission', 'm1', '시각 없음', 'not-a-date', null)) })
    expect(rowOf(timeline, 'mission').bars).toEqual([])
  })

  it('시험 묶음은 켰을 때만 보이고 시험 표식이 붙으며 aria-label에도 있다', () => {
    const bundles = [makeBundle([opsItem('mission', 'm1', '시험 미션', kst('2026-10-08', '09:00'), null)], { isSample: true })]
    expect(rowOf(build({ bundles }), 'mission').bars).toEqual([])
    const [bar] = rowOf(build({ bundles, includeSample: true }), 'mission').bars
    expect(bar.isSample).toBe(true)
    expect(bar.ariaLabel).toContain('시험 묶음')
  })

  it('읽지 못한 묶음(null)이면 운영 항목 막대가 없다', () => {
    expect(rowOf(build({ bundles: null }), 'mission').bars).toEqual([])
  })
})

describe('buildTimeline — 컬렉션 준비 구간(R4)', () => {
  const launch = (startsAt: string, endsAt: string | null, leadDays: number, over: Partial<BuildTimelineInput> = {}) =>
    rowOf(build({ bundles: bundlesOf(opsItem('collection_launch', 'c1', '가을 컬렉션', startsAt, endsAt)), leadDays, ...over }), 'collection_launch').bars[0]

  it('노출 구간은 실선 막대이고 시작 앞 [시작 − 리드일, 시작)이 준비 구간 점선 칸이다', () => {
    const bar = launch(kst('2026-10-20', '09:00'), kst('2026-11-03', '09:00'), 7)
    expect(bar).toMatchObject({ startDate: '2026-10-20', endDate: '2026-11-03', startCol: 16, endCol: 30 })
    expect(bar.prep).toEqual({ startCol: 9, endCol: 15, startDate: '2026-10-13' })
    expect(bar.ariaLabel).toBe('컬렉션 런칭 「가을 컬렉션」, 10월 20일부터 11월 3일까지, 상태 예약됨, 준비는 10월 13일부터')
  })

  it('기본 리드일은 28일이다(규칙이 꺼졌거나 못 읽으면): 준비 구간이 창 앞으로 넘치면 창 첫 열까지만 그린다', () => {
    const bar = launch(kst('2026-10-20', '09:00'), null, TIMELINE_DEFAULT_LEAD_DAYS)
    expect(bar.prep).toEqual({ startCol: 1, endCol: 15, startDate: '2026-09-22' })
  })

  it('리드일이 0이면 준비 구간이 없다', () => {
    expect(launch(kst('2026-10-20', '09:00'), null, 0).prep).toBeNull()
  })

  it('시작이 창 안의 첫 열이거나 창 앞이면 준비 구간이 없다(그릴 칸이 없다)', () => {
    expect(launch(kst('2026-10-05', '09:00'), null, 7).prep).toBeNull()
    const earlier = launch(kst('2026-09-30', '09:00'), kst('2026-10-20', '09:00'), 7)
    expect(earlier.prep).toBeNull()
    expect(earlier.clippedStart).toBe(true)
  })

  it('시작이 창 뒤여도 준비 구간이 창과 겹치면 그 부분만 점선 칸으로 그린다(막대는 없다, 티켓 20261006_1539)', () => {
    // 창은 2026-10-05부터 42일(~11-15). 시작 11-20 − 리드 28일 = 10-23부터 준비 → 창 끝까지 겹친다.
    const timeline = build({ bundles: bundlesOf(opsItem('collection_launch', 'c1', '먼 컬렉션', kst('2026-11-20', '09:00'), null)), leadDays: 28 })
    const bars = rowOf(timeline, 'collection_launch').bars
    expect(bars).toHaveLength(1)
    expect(bars[0]).toMatchObject({
      afterWindow: true,
      drawerKey: 'c1',
      startCol: 19,
      endCol: 42,
      prep: { startCol: 19, endCol: 42, startDate: '2026-10-23' },
    })
  })

  it('시작이 창 뒤이고 준비 구간도 창에 닿지 않으면 아무것도 그리지 않는다', () => {
    const timeline = build({ bundles: bundlesOf(opsItem('collection_launch', 'c1', '아주 먼 컬렉션', kst('2026-12-20', '09:00'), null)), leadDays: 28 })
    expect(rowOf(timeline, 'collection_launch').bars).toEqual([])
  })

  it('시작이 창 뒤여도 리드일이 0이면 그릴 준비 구간이 없다', () => {
    const timeline = build({ bundles: bundlesOf(opsItem('collection_launch', 'c1', '먼 컬렉션', kst('2026-11-20', '09:00'), null)), leadDays: 0 })
    expect(rowOf(timeline, 'collection_launch').bars).toEqual([])
  })

  it('준비 구간은 컬렉션 런칭 줄에만 있다(미션·드랍 일정에는 없다)', () => {
    const timeline = build({
      bundles: bundlesOf(opsItem('mission', 'm1', '미션', kst('2026-10-20', '09:00'), null), opsItem('drop_schedule', 'd1', '드랍', kst('2026-10-20', '09:00'), null)),
    })
    expect([...rowOf(timeline, 'mission').bars, ...rowOf(timeline, 'drop_schedule').bars].every((bar) => bar.prep === null)).toBe(true)
  })
})

describe('leadDaysOf — R4 launch_lead_days_min', () => {
  const row = (over: Partial<OpsRuleRow> = {}): OpsRuleRow => ({
    rule_key: 'launch_lead_days_min',
    rule_group: 'balance',
    value: { min_days: 14 },
    level: 'warn',
    enabled: true,
    ...over,
  })

  it('켜져 있고 값을 읽을 수 있으면 그 일수다', () => {
    expect(leadDaysOf(parseBalanceRules([row()]))).toBe(14)
    expect(leadDaysOf(parseBalanceRules([row({ value: { min_days: 0 } })]))).toBe(0)
  })

  it('소수는 내린다', () => {
    expect(leadDaysOf(parseBalanceRules([row({ value: { min_days: 14.9 } })]))).toBe(14)
  })

  it('꺼졌거나 값이 틀렸거나 규칙 행이 없으면 28일이다', () => {
    expect(leadDaysOf(parseBalanceRules([row({ enabled: false })]))).toBe(28)
    expect(leadDaysOf(parseBalanceRules([row({ value: { min_days: 'x' } })]))).toBe(28)
    expect(leadDaysOf(parseBalanceRules([]))).toBe(28)
    expect(leadDaysOf(null)).toBe(28)
    // 다른 규칙만 있고 R4 행이 없다
    expect(leadDaysOf(parseBalanceRules([row({ rule_key: 'open_collections_max', value: { max: 3 } })]))).toBe(28)
  })
})

describe('buildTimeline — 합치기와 실제 자원 막대', () => {
  it('미션: 운영 항목이 mission_id로 가리키는 실제 미션은 운영 항목 막대 하나로 합치고 제목·기간은 실제 미션 값이다', () => {
    const timeline = build({
      bundles: bundlesOf(opsItem('mission', 'm1', '운영 제목', kst('2026-10-08', '09:00'), kst('2026-10-09', '09:00'), { createdResource: { mission_id: MISSION_ID } })),
      missions: [mission(MISSION_ID, kst('2026-10-10', '09:00'), kst('2026-10-16', '09:00'), '실제 제목')],
    })
    const bars = rowOf(timeline, 'mission').bars
    expect(bars).toHaveLength(1)
    expect(bars[0]).toMatchObject({ origin: 'ops', drawerKey: 'm1', title: '실제 제목', startDate: '2026-10-10', endDate: '2026-10-16', status: 'scheduled' })
  })

  it('미션: 멈춘(실패) 운영 항목은 실제 미션을 숨기지 않는다', () => {
    const timeline = build({
      bundles: bundlesOf(opsItem('mission', 'm1', '실패한 항목', kst('2026-10-08', '09:00'), null, { status: 'failed', createdResource: { mission_id: MISSION_ID } })),
      missions: [mission(MISSION_ID, kst('2026-10-10', '09:00'), kst('2026-10-16', '09:00'), '실제 제목')],
    })
    expect(rowOf(timeline, 'mission').bars.map((bar) => [bar.origin, bar.title, bar.status])).toEqual([
      ['ops', '실패한 항목', 'failed'],
      ['legacy', '실제 제목', 'scheduled'],
    ])
  })

  it('미션: 합치지 않은 기간 미션은 실제 자원 막대이고 상태는 기간에서 계산한다(예정·진행·종료)', () => {
    const timeline = build({
      missions: [
        mission('future', kst('2026-10-20', '09:00'), kst('2026-10-25', '09:00')),
        mission('now', kst('2026-10-06', '09:00'), kst('2026-10-12', '09:00')),
      ],
    })
    expect(rowOf(timeline, 'mission').bars.map((bar) => [bar.id, bar.origin, bar.drawerKey, bar.href, bar.status])).toEqual([
      ['mission-now', 'legacy', null, '/admin/missions/now', 'live'],
      ['mission-future', 'legacy', null, '/admin/missions/future', 'scheduled'],
    ])
    const ended = build({ today: '2026-10-30', missions: [mission('old', kst('2026-10-06', '09:00'), kst('2026-10-12', '09:00'))] })
    expect(rowOf(ended, 'mission').bars[0].status).toBe('ended')
  })

  it('미션: 상시 미션(종료 없음)은 막대로 그리지 않는다', () => {
    expect(rowOf(build({ missions: [mission('open', kst('2026-10-06', '09:00'), null)] }), 'mission').bars).toEqual([])
  })

  it('드랍 일정: ambient_drop_schedule_id로 합치면 운영 항목 막대 하나다(실제 예약 시각·제목)', () => {
    const timeline = build({
      bundles: bundlesOf(opsItem('drop_schedule', 'd1', '운영 드랍', kst('2026-10-08', '10:00'), null, { createdResource: { ambient_drop_schedule_id: DROP_ID } })),
      dropSchedules: [drop(DROP_ID, '2026-10-09T01:00:00.000Z', 'scheduled', { title: '실제 드랍' })],
    })
    expect(rowOf(timeline, 'drop_schedule').bars.map((bar) => [bar.origin, bar.title, bar.startDate])).toEqual([['ops', '실제 드랍', '2026-10-09']])
  })

  it('드랍 일정: 합치지 않은 예약은 상태를 예약 상태에서 계산하고 취소된 예약은 없다', () => {
    const timeline = build({
      dropSchedules: [
        drop('a', '2026-10-09T01:00:00.000Z', 'scheduled'),
        drop('b', '2026-10-08T01:00:00.000Z', 'running'),
        drop('c', '2026-10-06T01:00:00.000Z', 'done'),
        drop('d', '2026-10-06T02:00:00.000Z', 'failed'),
        drop('e', '2026-10-06T00:00:00.000Z', 'scheduled'), // 예정 시각에서 3시간이 지나 놓친 예약
        drop('f', '2026-10-09T02:00:00.000Z', 'canceled'),
        drop('g', '2026-10-09T03:00:00.000Z', 'scheduled', { canceled_at: '2026-10-08T00:00:00.000Z' }),
      ],
    })
    const bars = rowOf(timeline, 'drop_schedule').bars
    expect(Object.fromEntries(bars.map((bar) => [bar.id, bar.status]))).toEqual({
      'drop-a': 'scheduled',
      'drop-b': 'live',
      'drop-c': 'ended',
      'drop-d': 'failed',
      'drop-e': 'failed',
    })
    expect(bars.every((bar) => bar.href === '/admin/ambient-drop' && bar.drawerKey === null && bar.startCol === bar.endCol)).toBe(true)
  })

  it('컬렉션: item_book_id로 합치면 운영 항목 막대 하나이고, 합치지 않은 컬렉션은 실제 자원 막대(준비 구간 포함)다', () => {
    const merged = build({
      bundles: bundlesOf(opsItem('collection_launch', 'c1', '운영 컬렉션', kst('2026-10-20', '09:00'), null, { createdResource: { item_book_id: BOOK_ID } })),
      itemBooks: [book(BOOK_ID, kst('2026-10-22', '09:00'), kst('2026-11-05', '09:00'))],
      leadDays: 7,
    })
    expect(rowOf(merged, 'collection_launch').bars.map((bar) => [bar.origin, bar.title, bar.startDate, bar.endDate])).toEqual([['ops', '컬렉션 ' + BOOK_ID, '2026-10-22', '2026-11-05']])

    const legacy = build({ itemBooks: [book('b1', kst('2026-10-22', '09:00'), kst('2026-11-05', '09:00'))], leadDays: 7 })
    const [bar] = rowOf(legacy, 'collection_launch').bars
    expect(bar).toMatchObject({ origin: 'legacy', href: '/admin/itembooks/b1', startCol: 18, endCol: 32, status: 'scheduled', dim: false })
    expect(bar.prep).toEqual({ startCol: 11, endCol: 17, startDate: '2026-10-15' })
  })

  it('컬렉션: 끝이 없으면 창 끝까지 열린 막대, 시작일이 없으면 막대가 없고, 비활성은 흐리게다', () => {
    const timeline = build({
      itemBooks: [book('open', kst('2026-10-10', '09:00'), null), book('none', null, null), book('off', kst('2026-10-12', '09:00'), kst('2026-10-20', '09:00'), { is_active: false })],
      leadDays: 0,
    })
    const bars = rowOf(timeline, 'collection_launch').bars
    expect(bars.map((bar) => bar.id)).toEqual(['book-open', 'book-off'])
    expect(bars[0]).toMatchObject({ startCol: 6, endCol: 42, endDate: null, clippedEnd: true, status: 'scheduled' })
    expect(bars[0].ariaLabel).toContain('10월 10일부터,')
    expect(bars[1]).toMatchObject({ dim: true })
  })

  it('읽지 못한 재료(null)는 그 재료의 막대만 빠진다', () => {
    const timeline = build({
      bundles: bundlesOf(opsItem('mission', 'm1', '운영 미션', kst('2026-10-08', '09:00'), null)),
      missions: null,
      dropSchedules: null,
      itemBooks: null,
    })
    expect(rowOf(timeline, 'mission').bars.map((bar) => bar.drawerKey)).toEqual(['m1'])
    expect(rowOf(timeline, 'drop_schedule').bars).toEqual([])
    expect(rowOf(timeline, 'collection_launch').bars).toEqual([])
  })
})

describe('buildTimeline — 레인(겹치는 막대)', () => {
  it('겹치는 막대는 다른 가로줄에, 겹치지 않으면 같은 줄에 둔다', () => {
    const timeline = build({
      missions: [
        mission('a', kst('2026-10-06', '09:00'), kst('2026-10-12', '09:00')),
        mission('b', kst('2026-10-10', '09:00'), kst('2026-10-16', '09:00')),
        mission('c', kst('2026-10-17', '09:00'), kst('2026-10-20', '09:00')),
      ],
    })
    const row = rowOf(timeline, 'mission')
    expect(Object.fromEntries(row.bars.map((bar) => [bar.id, bar.lane]))).toEqual({ 'mission-a': 0, 'mission-b': 1, 'mission-c': 0 })
    expect(row.laneCount).toBe(2)
  })

  it('같은 날 끝나고 시작하는 막대는 겹친다(끝 열과 시작 열이 같다)', () => {
    const timeline = build({
      missions: [mission('a', kst('2026-10-06', '09:00'), kst('2026-10-10', '09:00')), mission('b', kst('2026-10-10', '09:00'), kst('2026-10-14', '09:00'))],
    })
    expect(rowOf(timeline, 'mission').bars.map((bar) => bar.lane)).toEqual([0, 1])
  })

  it('컬렉션 준비 구간도 자리를 차지한다(준비 구간이 앞 막대와 겹치면 다른 줄)', () => {
    const timeline = build({
      itemBooks: [book('first', kst('2026-10-06', '09:00'), kst('2026-10-12', '09:00')), book('second', kst('2026-10-16', '09:00'), kst('2026-10-20', '09:00'))],
      leadDays: 7,
    })
    const bars = rowOf(timeline, 'collection_launch').bars
    // second의 준비 구간(10/9~10/15)이 first(10/6~10/12)와 겹친다
    expect(Object.fromEntries(bars.map((bar) => [bar.id, bar.lane]))).toEqual({ 'book-first': 0, 'book-second': 1 })
  })
})

describe('buildTimeline — 신호 줄', () => {
  const outcome = (date: string, level: 'stop' | 'warn' | 'info', key: OpsSignalOutcome['key'] = 'execution_failed'): OpsSignalOutcome => ({
    key,
    name: '신호',
    level,
    state: 'raised',
    uncheckedReason: null,
    results: [makeSignalResult('문장', { date })],
  })
  const signalDays = (signals: OpsSignalOutcome[], scanDates: string[]) => emptyDays(signalsByDate(signals, scanDates, dateRange(START, END)))

  it('그날 가장 높은 수준 칩 하나와 건수가 칸(열)에 있고 aria-label이 날짜 서랍을 알린다', () => {
    const days = signalDays([outcome('2026-10-07', 'warn', 'format_error'), outcome('2026-10-07', 'stop'), outcome('2026-10-09', 'info', 'overlap')], ['2026-10-07', '2026-10-08', '2026-10-09'])
    const timeline = build({ days })
    expect(timeline.signalCells).toEqual([
      { date: '2026-10-07', col: 3, level: 'stop', count: 2, ariaLabel: '10월 7일 신호 중단 2건, 눌러서 날짜 서랍 열기' },
      { date: '2026-10-09', col: 5, level: 'info', count: 1, ariaLabel: '10월 9일 신호 참고 1건, 눌러서 날짜 서랍 열기' },
    ])
    expect(timeline.signalNotice).toBeNull()
  })

  it('신호를 읽지 못했으면 신호가 없다는 뜻이 아니라고 알린다', () => {
    expect(build().signalNotice).toBe(DAY_SIGNAL_UNREAD_TEXT)
  })

  it('확인 기간 밖이면 「뜬 신호가 없어요」라고 하지 않고, 기간 안에서 뜬 것이 없을 때만 그렇게 말한다', () => {
    expect(build({ days: signalDays([], []) }).signalNotice).toBe(TIMELINE_SIGNAL_UNCHECKED_TEXT)
    expect(build({ days: signalDays([], ['2026-10-07']) }).signalNotice).toBe(TIMELINE_SIGNAL_NONE_TEXT)
    expect(TIMELINE_SIGNAL_NONE_TEXT).not.toContain('이상 없')
    expect(TIMELINE_SIGNAL_UNCHECKED_TEXT).not.toContain('이상 없')
  })

  it('건수 0 날짜에는 칩이 없다', () => {
    expect(build({ days: signalDays([], ['2026-10-07']) }).signalCells).toEqual([])
  })
})

describe('timelineRowNotice — 막대가 없는 줄의 글', () => {
  const empty = { bars: [] }

  it('막대가 있으면 글이 없다', () => {
    const timeline = build({ missions: [mission('a', kst('2026-10-06', '09:00'), kst('2026-10-12', '09:00'))] })
    expect(timelineRowNotice(rowOf(timeline, 'mission'), {})).toBeNull()
  })

  it('모두 읽었는데 막대가 없으면 「올라온 항목이 없어요」이다', () => {
    for (const key of ['mission', 'drop_schedule', 'collection_launch'] as const) expect(timelineRowNotice({ key, ...empty }, {})).toBe(TIMELINE_ROW_EMPTY_TEXT)
    // 신호·규칙을 못 읽은 것은 막대 줄과 상관없다
    expect(timelineRowNotice({ key: 'mission', ...empty }, { signals: '실패', rules: '실패', metrics: '실패' })).toBe(TIMELINE_ROW_EMPTY_TEXT)
  })

  it('그 줄의 재료를 못 읽었으면 「없다」고 하지 않고 빠져 있을 수 있다고 알린다', () => {
    expect(timelineRowNotice({ key: 'mission', ...empty }, { missions: '실패' })).toBe(DAY_ITEMS_PARTIAL_TEXT)
    expect(timelineRowNotice({ key: 'drop_schedule', ...empty }, { dropSchedules: '실패' })).toBe(DAY_ITEMS_PARTIAL_TEXT)
    expect(timelineRowNotice({ key: 'collection_launch', ...empty }, { itemBooks: '실패' })).toBe(DAY_ITEMS_PARTIAL_TEXT)
    // 운영 묶음은 세 줄 모두의 재료다
    for (const key of ['mission', 'drop_schedule', 'collection_launch'] as const) expect(timelineRowNotice({ key, ...empty }, { bundles: '실패' })).toBe(DAY_ITEMS_PARTIAL_TEXT)
    // 다른 줄의 재료는 상관없다
    expect(timelineRowNotice({ key: 'mission', ...empty }, { itemBooks: '실패', dropSchedules: '실패' })).toBe(TIMELINE_ROW_EMPTY_TEXT)
  })
})

describe('barAriaLabel·formatBarPeriod', () => {
  it('기간 글자: 하루·구간·끝없음, 해가 다르면 해를 쓴다', () => {
    expect(formatBarPeriod('2026-10-08', '2026-10-08')).toBe('10월 8일')
    expect(formatBarPeriod('2026-10-08', '2026-10-14')).toBe('10월 8일부터 10월 14일까지')
    expect(formatBarPeriod('2026-10-08', null)).toBe('10월 8일부터')
    expect(formatBarPeriod('2026-12-28', '2027-01-04')).toBe('2026년 12월 28일부터 2027년 1월 4일까지')
  })

  it('종류·제목·기간·상태가 모두 들어 있다', () => {
    const label = barAriaLabel({ rowKey: 'drop_schedule', title: '가을 드랍', startDate: '2026-10-08', endDate: '2026-10-08', status: 'live', isSample: false, prep: null })
    expect(label).toBe('드랍 일정 「가을 드랍」, 10월 8일, 상태 게재중')
  })
})

describe('buildTimeline — 항목 수', () => {
  it('막대나 칸 항목이 하나라도 있으면 0이 아니다', () => {
    expect(build({ missions: [mission('a', kst('2026-10-06', '09:00'), kst('2026-10-12', '09:00'))] }).contentCount).toBeGreaterThan(0)
  })
})

describe('buildTimeline — 거르기가 읽는 트라이브·패턴 (티켓 20261006_1539)', () => {
  const TRIBE = '3F2A9C1E-0000-4000-8000-00000000000A'

  it('운영 항목 막대에 트라이브(소문자)·패턴 번호가 실리고 옛 자원 막대에는 없다', () => {
    const timeline = build({
      bundles: bundlesOf(opsItem('mission', 'm1', '가을 미션', kst('2026-10-08', '09:00'), kst('2026-10-14', '09:00'), { patternNo: 'P02', original: { copy: { title: '가을 미션' }, tribe_id: TRIBE } })),
      missions: [mission('legacy-m', kst('2026-10-08', '09:00'), kst('2026-10-14', '09:00'))],
    })
    const [opsBar, legacyBar] = [...rowOf(timeline, 'mission').bars].sort((a) => (a.origin === 'ops' ? -1 : 1))
    expect(opsBar).toMatchObject({ origin: 'ops', tribeId: TRIBE.toLowerCase(), patternNo: 'P02' })
    expect(legacyBar.origin).toBe('legacy')
    expect(legacyBar.tribeId).toBeUndefined()
  })
})
