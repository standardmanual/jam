/**
 * 일정표 타임라인의 계산 (티켓 20261006_1538 ③-c, 상위 20260930_1502 「채원 S1·S4 사전 판정」 S4 타임라인·카리나 가정 4·9, 순수 함수 — DB 접근 없음).
 *
 * 6주 창(`periodOf('timeline', date)`, 월요일 기준 4주 격자에 고정)을 열(칸) 42개로 나누고, 줄마다 기간이 있는 것을 막대로 만든다.
 * 줄은 맨 위 **신호**(일별 최고 수준 칩 → 날짜 서랍)와 **미션·드랍 일정·컬렉션 런칭** 세 줄이다. 반환값은 일반 객체라 서버 컴포넌트에서 클라이언트 컴포넌트로 그대로 넘길 수 있다.
 *
 * ## 막대의 출처와 합치기
 * - **운영 항목**(받은 기획함): 종류가 미션·드랍 일정·컬렉션 런칭인 항목. 반려·취소 항목은 타임라인에 없고(멈춘 것), **실패 항목은 「실패」 색으로 남는다**(가정 4).
 *   기간은 항목의 시작·종료 시각이고, 종료가 없거나 시작보다 이르면 하루짜리다(날짜 구성 `bundleItemPeriod`와 같다).
 * - **실제 자원**(운영 항목과 합치지 않은 것): 기간 미션, 취소되지 않은 드랍 일정, 시작일이 있는 컬렉션. 운영 항목이 `created_resource`로 가리키는 것(`execute/handlers.ts`의
 *   `RESOURCE_KEY_BY_KIND`: `mission_id`·`ambient_drop_schedule_id`·`item_book_id`)은 중복으로 그리지 않고 운영 항목 막대 하나로 합친다. 합친 막대의 제목·기간은 실제 자원 값이다
 *   (날짜 구성이 합친 미션을 그리는 규칙과 같다). 합치는 항목은 날짜 구성과 같이 반려·취소·실패가 아닌 것만이다 — 멈춘 항목은 실제 자원을 숨기지 않는다.
 *   실제 자원 막대의 상태는 값에서 계산한 것이다: 미션·컬렉션은 기간(예정·진행·종료), 드랍 일정은 예약 상태(`ambientDropScheduleState`).
 *   상시 미션(종료 없음)은 막대로 그리지 않는다(주간처럼 개수 줄이 맡는다). 종료가 없는 컬렉션은 창 끝까지 열린 막대다.
 * - 컬렉션 막대 앞에는 **준비 구간**(점선, `[시작 − 리드일, 시작)`)이 붙고 노출 구간은 실선이다. 리드일은 R4 `launch_lead_days_min`(꺼졌거나 못 읽으면 28일)이다.
 *   시작이 창 앞이면 준비 구간은 없다. 시작이 창 밖(뒤)인 컬렉션은 막대도 준비 구간도 그리지 않는다(눌러서 열 막대가 없는 점선만 남지 않게).
 *
 * ## 막대 모양
 * 색은 `ITEM_STATUS_TONES`(승인 전 neutral 점선·예약됨 secondary·게재중 primary·종료 muted·실패 destructive 테두리). 막대마다 `aria-label`(종류·기간·상태)이 있고,
 * 같은 줄에서 겹치는 막대는 가로줄(레인)로 나눈다. 하루짜리도 한 칸 폭이라 아이콘이 보인다.
 */
import type { BalanceRules } from '@/lib/admin/opsInbox/balance/rules'
import { RESOURCE_KEY_BY_KIND } from '@/lib/admin/opsInbox/execute/handlers'
import { kindLabel, kstDateKey, OPS_ITEM_STATUS_LABELS } from '@/lib/admin/opsInbox/labels'
import { OPS_ITEM_STATUSES, type OpsItemStatus } from '@/lib/admin/opsInbox/constants'
import { ambientDropScheduleState } from '@/lib/ambient-drop/scheduleSpec'
import { DAY_SIGNAL_UNREAD_TEXT, DAY_ITEMS_PARTIAL_TEXT, type ScheduleSourceErrors } from '@/lib/admin/opsSchedule/drawerView'
import type { DaySignals } from '@/lib/admin/opsSchedule/signalDays'
import type { ScheduleDay } from '@/lib/admin/opsSchedule/weekView'
import { OPS_SIGNAL_LEVEL_LABELS, type OpsSignalLevel } from '@/lib/admin/opsSignals/catalog'
import { describeBundleItem, isCountedItemStatus, parseTime, type SignalBundleInput } from '@/lib/admin/opsSignals/composition'
import { shiftDateStr } from '@/lib/admin/today-calendar'
import type { WeeklyMissionInput } from '@/lib/admin/weeklyMissions'
import type { AmbientDropScheduleStatus } from '@/types/database'

/** 컬렉션 준비 구간의 기본 길이(일). R4가 꺼졌거나 못 읽을 때 쓴다. */
export const TIMELINE_DEFAULT_LEAD_DAYS = 28

export const TIMELINE_ROW_KEYS = ['mission', 'drop_schedule', 'collection_launch'] as const
export type TimelineRowKey = (typeof TIMELINE_ROW_KEYS)[number]

export const TIMELINE_ROW_LABELS: Record<TimelineRowKey, string> = {
  mission: '미션',
  drop_schedule: '드랍 일정',
  collection_launch: '컬렉션 런칭',
}

export const TIMELINE_SIGNAL_ROW_LABEL = '신호'
export const TIMELINE_SIGNAL_NONE_TEXT = '뜬 신호가 없어요'
export const TIMELINE_SIGNAL_UNCHECKED_TEXT = '이 기간은 신호를 확인하는 기간이 아니에요'
export const TIMELINE_ROW_EMPTY_TEXT = '이 기간에는 올라온 항목이 없어요'
export const TIMELINE_TODAY_LABEL = '오늘'

/** 항목 종류 → 줄. 이 3종만 타임라인에 막대로 올라온다(카드·배지·레시피는 칸으로 본다). */
const ROW_BY_KIND: Readonly<Record<string, TimelineRowKey>> = {
  mission: 'mission',
  drop_schedule: 'drop_schedule',
  collection_launch: 'collection_launch',
}

const KNOWN_STATUSES: ReadonlySet<string> = new Set(OPS_ITEM_STATUSES)
/** 타임라인에 올리지 않는 상태: 반려·취소(멈춘 것). 실패는 남긴다(가정 4). */
const HIDDEN_STATUSES: ReadonlySet<string> = new Set(['rejected', 'cancelled'])
/** 승인 전 상태: 점선 테두리로 그린다(채원 판정 「승인 전 neutral 점선」). */
const PRE_APPROVAL_STATUSES: ReadonlySet<string> = new Set(['arrived', 'reviewing', 'approved', 'preparing'])

/** 실제 드랍 일정 한 줄(`ambient_drop_schedules`에서 읽은 열). 상태는 읽은 글자 그대로이고 해석은 `ambientDropScheduleState`가 한다. */
export interface TimelineDropRow {
  id: string
  scheduled_at: string
  status: string
  claimed_at: string | null
  canceled_at: string | null
  title: string | null
}

/** 실제 컬렉션 한 줄(`item_books`에서 읽은 열). */
export interface TimelineBookRow {
  id: string
  name: string
  valid_from: string | null
  valid_until: string | null
  is_active: boolean
}

export interface TimelineBar {
  /** React key. */
  id: string
  rowKey: TimelineRowKey
  origin: 'ops' | 'legacy'
  /** 항목 서랍 키(운영 항목 ID). 실제 자원 막대는 null이고 `href`로 간다. */
  drawerKey: string | null
  /** 실제 자원 막대가 가는 관리 화면. 운영 항목 막대는 null이다. */
  href: string | null
  title: string
  /** 상태 칩·막대 색. 실제 자원은 값에서 계산한 상태다. */
  status: OpsItemStatus
  isSample: boolean
  /** 비활성 컬렉션(흐리게). */
  dim: boolean
  /** 노출 구간의 첫 날과 끝 날(KST). 끝이 null이면 끝없이 열린 구간이다. */
  startDate: string
  endDate: string | null
  /** 창 안에서 그리는 열(1부터, 양 끝 포함). */
  startCol: number
  endCol: number
  /** 창 앞·뒤로 잘렸는가(잘린 쪽 모서리를 평평하게 그린다). */
  clippedStart: boolean
  clippedEnd: boolean
  /** 승인 전이라 점선인가. */
  dashed: boolean
  /** 컬렉션 준비 구간. 시작이 창 앞이거나 리드일이 0이면 null이다. */
  prep: { startCol: number; endCol: number; startDate: string } | null
  /** 같은 줄 안의 가로줄(0부터). */
  lane: number
  ariaLabel: string
}

export interface TimelineRow {
  key: TimelineRowKey
  label: string
  bars: TimelineBar[]
  laneCount: number
}

export interface TimelineTick {
  /** 그 주의 첫 열. */
  col: number
  /** 「10/5」. */
  label: string
}

export interface TimelineSignalCell {
  date: string
  col: number
  level: OpsSignalLevel
  count: number
  ariaLabel: string
}

export interface ScheduleTimeline {
  start: string
  end: string
  columnCount: number
  /** 주 눈금(주마다 하나). */
  ticks: TimelineTick[]
  /** 오늘이 창 안에 있으면 그 열이다. */
  todayCol: number | null
  signalCells: TimelineSignalCell[]
  /** 신호 줄에 칩이 하나도 없을 때의 안내 글(칩이 있으면 null). */
  signalNotice: string | null
  rows: TimelineRow[]
  /** 날짜 서랍·옛 미션 요약이 읽는 칸(`buildSchedulePeriod`). 타임라인 줄에는 그리지 않는다. */
  days: ScheduleDay[]
  leadDays: number
  /** 막대·칸 항목·장기 카드의 합. 0이고 읽지 못한 재료가 없을 때만 「이 기간에는 올라온 항목이 없어요」를 보인다. */
  contentCount: number
}

export interface BuildTimelineInput {
  /** 창의 첫 날(월요일)과 마지막 날. */
  start: string
  end: string
  today: string
  now: Date
  includeSample: boolean
  /** 읽은 묶음과 항목(모든 상태). 못 읽었으면 null이다. */
  bundles: readonly SignalBundleInput[] | null
  /** 읽은 실제 미션. 못 읽었으면 null이다. 종료가 없는 미션은 막대로 그리지 않는다. */
  missions: readonly WeeklyMissionInput[] | null
  dropSchedules: readonly TimelineDropRow[] | null
  itemBooks: readonly TimelineBookRow[] | null
  /** 컬렉션 준비 구간 길이(일). */
  leadDays: number
  days: readonly ScheduleDay[]
}

/**
 * 컬렉션 준비 구간의 길이(일): R4 `launch_lead_days_min`이 켜져 있고 값을 읽을 수 있으면 그 `minDays`, 꺼졌거나 값이 틀렸거나 규칙 행이 없으면 28일이다.
 * 소수는 내림한다(날짜 계산은 하루 단위다).
 */
export function leadDaysOf(rules: BalanceRules | null): number {
  const entry = rules?.launch_lead_days_min
  return entry && entry.enabled && entry.readable ? Math.floor(entry.value.minDays) : TIMELINE_DEFAULT_LEAD_DAYS
}

// ── 날짜 계산 ────────────────────────────────────────────────────────────────────────────────────

function dayOffset(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** 「10월 5일」. */
function monthDay(date: string): string {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`
}

/** 막대 기간 글자: 「10월 5일」·「10월 5일부터 10월 12일까지」·「10월 5일부터」(끝없음). 해가 다르면 해를 붙인다. */
export function formatBarPeriod(startDate: string, endDate: string | null): string {
  const label = (date: string, withYear: boolean) => (withYear ? `${date.slice(0, 4)}년 ${monthDay(date)}` : monthDay(date))
  if (endDate === null) return `${monthDay(startDate)}부터`
  if (endDate === startDate) return monthDay(startDate)
  const crossYear = startDate.slice(0, 4) !== endDate.slice(0, 4)
  return `${label(startDate, crossYear)}부터 ${label(endDate, crossYear)}까지`
}

/** 막대의 화면 읽기 글: 종류·제목·기간·상태(·시험·준비 구간). */
export function barAriaLabel(bar: Pick<TimelineBar, 'rowKey' | 'title' | 'startDate' | 'endDate' | 'status' | 'isSample' | 'prep'>): string {
  const parts = [
    `${kindLabel(bar.rowKey)} 「${bar.title}」`,
    formatBarPeriod(bar.startDate, bar.endDate),
    `상태 ${OPS_ITEM_STATUS_LABELS[bar.status]}`,
  ]
  if (bar.prep) parts.push(`준비는 ${monthDay(bar.prep.startDate)}부터`)
  if (bar.isSample) parts.push('시험 묶음')
  return parts.join(', ')
}

// ── 막대 후보 ────────────────────────────────────────────────────────────────────────────────────

/** 위치를 정하기 전의 막대. 기간만 날짜(KST)로 정해져 있다. */
interface BarCandidate {
  id: string
  rowKey: TimelineRowKey
  origin: 'ops' | 'legacy'
  drawerKey: string | null
  href: string | null
  title: string
  status: OpsItemStatus
  isSample: boolean
  dim: boolean
  startDate: string
  /** null이면 끝없이 열린 구간이다. */
  endDate: string | null
}

interface RealResource {
  title: string
  startsAt: string | null
  endsAt: string | null
}

function createdResourceId(createdResource: unknown, key: string): string | null {
  if (createdResource === null || typeof createdResource !== 'object' || Array.isArray(createdResource)) return null
  const value = (createdResource as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim().toLowerCase() : null
}

/** 운영 항목의 기간(KST 날짜). 시작을 읽을 수 없으면 null이다. 끝이 없거나 읽을 수 없거나 시작보다 이르면 하루짜리다(`composition.ts`의 `bundleItemPeriod`와 같다). */
function opsPeriod(startsAt: string | null, endsAt: string | null): { startDate: string; endDate: string } | null {
  const startMs = parseTime(startsAt)
  const startDate = kstDateKey(startsAt)
  if (startMs === null || startDate === null) return null
  const endMs = parseTime(endsAt)
  const endDate = kstDateKey(endsAt)
  return endMs === null || endDate === null || endMs < startMs ? { startDate, endDate: startDate } : { startDate, endDate }
}

/** 미션·컬렉션의 상태: 시작 전이면 예약됨, 기간 안이면 게재중, 끝났으면 종료. */
function statusByDates(today: string, startDate: string, endDate: string | null): OpsItemStatus {
  if (today < startDate) return 'scheduled'
  if (endDate !== null && today > endDate) return 'ended'
  return 'live'
}

/** 드랍 일정의 예약 상태 → 막대 상태. 취소는 호출부가 뺀다. */
const DROP_STATE_STATUS: Readonly<Record<string, OpsItemStatus>> = {
  scheduled: 'scheduled',
  running: 'live',
  stalled: 'failed',
  done: 'ended',
  skipped: 'ended',
  failed: 'failed',
  missed: 'failed',
}

function opsCandidates(input: BuildTimelineInput, real: Record<TimelineRowKey, Map<string, RealResource>>) {
  const merged: Record<TimelineRowKey, Set<string>> = { mission: new Set(), drop_schedule: new Set(), collection_launch: new Set() }
  const candidates: BarCandidate[] = []
  for (const bundle of input.bundles ?? []) {
    if (bundle.isSample && !input.includeSample) continue
    for (const item of bundle.items) {
      const rowKey = item.kind === null ? undefined : ROW_BY_KIND[item.kind]
      if (rowKey === undefined || !KNOWN_STATUSES.has(item.status) || HIDDEN_STATUSES.has(item.status)) continue
      const resourceKey = RESOURCE_KEY_BY_KIND[item.kind as keyof typeof RESOURCE_KEY_BY_KIND]
      const resourceId = createdResourceId(item.createdResource, resourceKey)
      // 합치는 것은 센 항목(반려·취소·실패가 아닌 것)뿐이다. 실패한 항목은 실제 자원을 숨기지 않는다.
      const mergedResource = resourceId !== null && isCountedItemStatus(item.status) ? real[rowKey].get(resourceId) : undefined
      if (resourceId !== null && isCountedItemStatus(item.status)) merged[rowKey].add(resourceId)

      const title = mergedResource?.title ?? describeBundleItem(item)
      let startDate: string
      let endDate: string | null
      // 합친 실제 자원의 시작을 읽을 수 없으면(시작일이 없는 컬렉션 등) 항목 자신의 기간으로 그린다.
      const realStart = mergedResource ? kstDateKey(mergedResource.startsAt) : null
      if (mergedResource && realStart !== null) {
        startDate = realStart
        // 합친 실제 미션·컬렉션은 종료가 없으면 끝없이 열려 있다. 합친 드랍 일정은 하루짜리다.
        endDate = rowKey === 'drop_schedule' ? realStart : kstDateKey(mergedResource.endsAt)
        if (endDate !== null && endDate < startDate) endDate = startDate
      } else {
        const period = opsPeriod(item.startsAt, item.endsAt)
        if (period === null) continue
        startDate = period.startDate
        endDate = period.endDate
      }
      candidates.push({
        id: `ops-${item.id}`,
        rowKey,
        origin: 'ops',
        drawerKey: item.id,
        href: null,
        title,
        status: item.status as OpsItemStatus,
        isSample: bundle.isSample,
        dim: false,
        startDate,
        endDate,
      })
    }
  }
  return { candidates, merged }
}

function legacyCandidates(input: BuildTimelineInput, merged: Record<TimelineRowKey, Set<string>>): BarCandidate[] {
  const candidates: BarCandidate[] = []
  const base = { origin: 'legacy' as const, drawerKey: null, isSample: false }

  for (const mission of input.missions ?? []) {
    if (mission.ends_at === null || merged.mission.has(mission.id.toLowerCase())) continue
    const startDate = kstDateKey(mission.starts_at)
    const rawEnd = kstDateKey(mission.ends_at)
    if (startDate === null || rawEnd === null) continue
    const endDate = rawEnd < startDate ? startDate : rawEnd
    candidates.push({
      ...base,
      id: `mission-${mission.id}`,
      rowKey: 'mission',
      href: `/admin/missions/${mission.id}`,
      title: mission.title,
      status: statusByDates(input.today, startDate, endDate),
      dim: false,
      startDate,
      endDate,
    })
  }

  for (const row of input.dropSchedules ?? []) {
    if (row.canceled_at !== null || row.status === 'canceled' || merged.drop_schedule.has(row.id.toLowerCase())) continue
    const startDate = kstDateKey(row.scheduled_at)
    const status = DROP_STATE_STATUS[ambientDropScheduleState({ ...row, status: row.status as AmbientDropScheduleStatus }, input.now)]
    if (startDate === null || status === undefined) continue
    candidates.push({
      ...base,
      id: `drop-${row.id}`,
      rowKey: 'drop_schedule',
      href: '/admin/ambient-drop',
      title: row.title?.trim() || '드랍 일정',
      status,
      dim: false,
      startDate,
      endDate: startDate,
    })
  }

  for (const book of input.itemBooks ?? []) {
    if (merged.collection_launch.has(book.id.toLowerCase())) continue
    const startDate = kstDateKey(book.valid_from)
    if (startDate === null) continue
    const rawEnd = kstDateKey(book.valid_until)
    const endDate = rawEnd === null ? null : rawEnd < startDate ? startDate : rawEnd
    candidates.push({
      ...base,
      id: `book-${book.id}`,
      rowKey: 'collection_launch',
      href: `/admin/itembooks/${book.id}`,
      title: book.name,
      status: statusByDates(input.today, startDate, endDate),
      dim: !book.is_active,
      startDate,
      endDate,
    })
  }
  return candidates
}

/** 후보를 창에 맞춰 열 위치로 바꾼다. 노출 구간이 창 밖이면 null이다. 레인은 나중에 정한다(0). */
function placeCandidate(candidate: BarCandidate, input: BuildTimelineInput, columnCount: number): TimelineBar | null {
  const { start, end, leadDays } = input
  const { startDate, endDate } = candidate
  if (startDate > end || (endDate !== null && endDate < start)) return null

  const clippedStart = startDate < start
  const clippedEnd = endDate === null || endDate > end
  const startCol = clippedStart ? 1 : dayOffset(start, startDate) + 1
  const endCol = endDate === null || endDate > end ? columnCount : dayOffset(start, endDate) + 1

  let prep: TimelineBar['prep'] = null
  if (candidate.rowKey === 'collection_launch' && leadDays > 0 && !clippedStart && startCol > 1) {
    const prepStartDate = shiftDateStr(startDate, -leadDays)
    prep = { startCol: Math.max(1, dayOffset(start, prepStartDate) + 1), endCol: startCol - 1, startDate: prepStartDate }
  }

  const bar: TimelineBar = {
    id: candidate.id,
    rowKey: candidate.rowKey,
    origin: candidate.origin,
    drawerKey: candidate.drawerKey,
    href: candidate.href,
    title: candidate.title,
    status: candidate.status,
    isSample: candidate.isSample,
    dim: candidate.dim,
    startDate,
    endDate,
    startCol,
    endCol,
    clippedStart,
    clippedEnd,
    dashed: PRE_APPROVAL_STATUSES.has(candidate.status),
    prep,
    lane: 0,
    ariaLabel: '',
  }
  bar.ariaLabel = barAriaLabel(bar)
  return bar
}

/** 겹치는 막대를 가로줄로 나눈다(먼저 시작하는 막대부터 가장 위의 빈 줄에 둔다). 준비 구간도 자리를 차지한다. */
function assignLanes(bars: TimelineBar[]): number {
  const occupiedStart = (bar: TimelineBar) => bar.prep?.startCol ?? bar.startCol
  const ordered = [...bars].sort((a, b) => occupiedStart(a) - occupiedStart(b) || a.startCol - b.startCol || (a.id < b.id ? -1 : 1))
  const laneEnds: number[] = []
  for (const bar of ordered) {
    let lane = laneEnds.findIndex((laneEnd) => laneEnd < occupiedStart(bar))
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = bar.endCol
    bar.lane = lane
  }
  return Math.max(1, laneEnds.length)
}

// ── 신호 줄 ──────────────────────────────────────────────────────────────────────────────────────

function signalCells(days: readonly ScheduleDay[], start: string): TimelineSignalCell[] {
  const cells: TimelineSignalCell[] = []
  for (const day of days) {
    const signals: DaySignals | null = day.signals
    if (signals === null || signals.topLevel === null) continue
    cells.push({
      date: day.date,
      col: dayOffset(start, day.date) + 1,
      level: signals.topLevel,
      count: signals.count,
      ariaLabel: `${monthDay(day.date)} 신호 ${OPS_SIGNAL_LEVEL_LABELS[signals.topLevel]} ${signals.count}건, 눌러서 날짜 서랍 열기`,
    })
  }
  return cells
}

/** 신호 줄에 칩이 없을 때의 안내. 못 읽었으면 신호가 없다는 뜻이 아니라고 알리고, 확인 기간 밖이면 「뜬 신호가 없어요」라고 하지 않는다. */
function signalRowNotice(days: readonly ScheduleDay[]): string {
  if (days.every((day) => day.signals === null)) return DAY_SIGNAL_UNREAD_TEXT
  if (!days.some((day) => day.signals?.checked)) return TIMELINE_SIGNAL_UNCHECKED_TEXT
  return TIMELINE_SIGNAL_NONE_TEXT
}

// ── 조립 ─────────────────────────────────────────────────────────────────────────────────────────

export function buildTimeline(input: BuildTimelineInput): ScheduleTimeline {
  const columnCount = dayOffset(input.start, input.end) + 1

  // 실제 자원을 ID로 찾는 표(운영 항목이 `created_resource`로 가리키는 것의 제목·기간을 읽는다).
  const real: Record<TimelineRowKey, Map<string, RealResource>> = {
    mission: new Map((input.missions ?? []).map((mission) => [mission.id.toLowerCase(), { title: mission.title, startsAt: mission.starts_at, endsAt: mission.ends_at }])),
    drop_schedule: new Map(
      (input.dropSchedules ?? []).map((row) => [row.id.toLowerCase(), { title: row.title?.trim() || '드랍 일정', startsAt: row.scheduled_at, endsAt: null }])
    ),
    collection_launch: new Map(
      (input.itemBooks ?? []).map((book) => [book.id.toLowerCase(), { title: book.name, startsAt: book.valid_from, endsAt: book.valid_until }])
    ),
  }

  const ops = opsCandidates(input, real)
  const candidates = [...ops.candidates, ...legacyCandidates(input, ops.merged)]
  const placed = candidates.map((candidate) => placeCandidate(candidate, input, columnCount)).filter((bar): bar is TimelineBar => bar !== null)

  const rows: TimelineRow[] = TIMELINE_ROW_KEYS.map((key) => {
    const bars = placed.filter((bar) => bar.rowKey === key)
    const laneCount = bars.length > 0 ? assignLanes(bars) : 0
    // 읽는 순서는 시작이 빠른 막대부터(레인 배정과 같은 순서)다.
    bars.sort((a, b) => a.startCol - b.startCol || a.lane - b.lane || (a.id < b.id ? -1 : 1))
    return { key, label: TIMELINE_ROW_LABELS[key], bars, laneCount }
  })

  const cells = signalCells(input.days, input.start)
  const ticks: TimelineTick[] = []
  for (let col = 1; col <= columnCount; col += 7) {
    const date = shiftDateStr(input.start, col - 1)
    ticks.push({ col, label: `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}` })
  }
  const dayContent = input.days.reduce((sum, day) => sum + day.items.length + day.longActiveCount + day.longInactiveCount, 0)

  return {
    start: input.start,
    end: input.end,
    columnCount,
    ticks,
    todayCol: input.today >= input.start && input.today <= input.end ? dayOffset(input.start, input.today) + 1 : null,
    signalCells: cells,
    signalNotice: cells.length > 0 ? null : signalRowNotice(input.days),
    rows,
    days: [...input.days],
    leadDays: input.leadDays,
    contentCount: placed.length + dayContent,
  }
}

// ── 줄의 빈 글자 ─────────────────────────────────────────────────────────────────────────────────

/** 줄마다 막대를 만드는 데 쓴 재료. 하나라도 못 읽었으면 막대가 없는 것이 「없다」는 뜻이 아니다. */
const ROW_SOURCES: Readonly<Record<TimelineRowKey, readonly (keyof ScheduleSourceErrors)[]>> = {
  mission: ['bundles', 'missions'],
  drop_schedule: ['bundles', 'dropSchedules'],
  collection_launch: ['bundles', 'itemBooks'],
}

/** 막대가 없는 줄에 보일 글. 막대가 있으면 null이다. 못 읽은 재료가 있으면 「올라온 항목이 없어요」 대신 빠져 있을 수 있다고 알린다. */
export function timelineRowNotice(row: Pick<TimelineRow, 'key' | 'bars'>, sourceErrors: ScheduleSourceErrors): string | null {
  if (row.bars.length > 0) return null
  return ROW_SOURCES[row.key].some((source) => sourceErrors[source]) ? DAY_ITEMS_PARTIAL_TEXT : TIMELINE_ROW_EMPTY_TEXT
}
