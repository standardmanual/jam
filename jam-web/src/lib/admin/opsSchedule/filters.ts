/**
 * 일정표 거르기의 판정 (티켓 20261006_1539 ③-d, 상위 20260930_1502 「채원 S1·S4 사전 판정」 S4·카리나 가정 5·6, 순수 함수 — DB 접근 없음).
 *
 * 주소의 `kind`·`tribe`·`pattern`(`ScheduleParams`)으로 주간·월간 칸과 타임라인 막대를 거른다. 같은 종류의 값끼리는 하나라도 맞으면 남고(OR), 종류가 다른 거르기끼리는 모두 맞아야 남는다(AND).
 *
 * - **종류**: 항목 종류(`kind`)가 고른 것 중 하나일 때. 옛 카드는 「홈피드 카드」, 옛 미션·미션 막대는 「미션」, 타임라인 막대는 줄(`rowKey`)이 종류와 같다.
 * - **트라이브·패턴**: 운영 항목의 트라이브·패턴 번호만 안다. 옛 카드·미션(운영 항목이 없는 실제 자원)은 트라이브·패턴이 없어 이 거르기를 켜면 빠진다 — 그래서 안내 문장이 뜬다(`filtersExcludeLegacy`).
 * - **자동 실행**: 거르기가 하나라도 켜지면 숨긴다(가정 6). **장기 카드 줄**은 종류 거르기가 없거나 「홈피드 카드」가 들어 있고, 트라이브·패턴 거르기가 없을 때만 남는다.
 * - **신호**는 거르지 않는다. 신호 칩·날짜 서랍의 신호는 그날 전체 기준이다.
 */
import { OPS_HOME_FEED_CARD_KIND } from '@/lib/admin/opsInbox/constants'
import { assignLanes, type ScheduleTimeline } from '@/lib/admin/opsSchedule/timeline'
import type { ScheduleDay, ScheduleItem, ScheduleMissionBar, ScheduleWeek } from '@/lib/admin/opsSchedule/weekView'

/** 거르기 조건. `ScheduleParams`의 같은 이름 필드와 같다. 비어 있으면 그 거르기는 꺼진 것이다. */
export interface ScheduleFilters {
  kinds: readonly string[]
  tribes: readonly string[]
  patterns: readonly string[]
}

/**
 * 거르기를 바꾼 뒤의 쿼리 문자열(`?` 없이, 비어 있을 수 있다). `kind`·`tribe`·`pattern`만 새로 쓰고 다른 키(`view`·`date`·`sample`·서랍)와 그 순서는 그대로 둔다.
 * 거르기 키는 늘 끝에 붙는다(같은 값은 늘 같은 글자라 새로고침·비교가 안정적이다).
 */
export function filterQuery(search: string, next: ScheduleFilters): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  params.delete('kind')
  params.delete('tribe')
  params.delete('pattern')
  for (const kind of next.kinds) params.append('kind', kind)
  for (const tribe of next.tribes) params.append('tribe', tribe)
  for (const pattern of next.patterns) params.append('pattern', pattern)
  return params.toString()
}

/** 거르기가 하나라도 켜져 있는가. */
export function hasScheduleFilters(filters: ScheduleFilters): boolean {
  return filters.kinds.length > 0 || filters.tribes.length > 0 || filters.patterns.length > 0
}

/** 트라이브·패턴 거르기가 켜져 있어 옛 카드·미션(트라이브·패턴이 없는 실제 자원)이 빠지는가. 참이면 안내 문장을 보인다. */
export function filtersExcludeLegacy(filters: ScheduleFilters): boolean {
  return filters.tribes.length > 0 || filters.patterns.length > 0
}

interface Filterable {
  kind: string
  /** 운영 항목이면 true, 옛 카드·미션 같은 실제 자원이면 false. */
  isOps: boolean
  tribeId?: string | null
  patternNo?: string | null
}

function matches(target: Filterable, filters: ScheduleFilters): boolean {
  if (filters.kinds.length > 0 && !filters.kinds.includes(target.kind)) return false
  if (filters.tribes.length > 0 && !(target.isOps && target.tribeId && filters.tribes.includes(target.tribeId.toLowerCase()))) return false
  if (filters.patterns.length > 0 && !(target.isOps && target.patternNo && filters.patterns.includes(target.patternNo.toUpperCase()))) return false
  return true
}

function itemMatches(item: ScheduleItem, filters: ScheduleFilters): boolean {
  return matches({ kind: item.kind, isOps: item.origin === 'ops', tribeId: item.tribeId, patternNo: item.patternNo }, filters)
}

function barMatches(bar: ScheduleMissionBar, filters: ScheduleFilters): boolean {
  return matches({ kind: 'mission', isOps: bar.status !== null, tribeId: bar.tribeId, patternNo: bar.patternNo }, filters)
}

/** 장기 카드 줄을 남기는가(가정 6). */
function keepsLongCards(filters: ScheduleFilters): boolean {
  if (filtersExcludeLegacy(filters)) return false
  return filters.kinds.length === 0 || filters.kinds.includes(OPS_HOME_FEED_CARD_KIND)
}

/** 칸 하나를 거른다. 신호·대표 카드는 그대로다. */
function filterDay<T extends ScheduleDay>(day: T, filters: ScheduleFilters): T {
  const keepLong = keepsLongCards(filters)
  return {
    ...day,
    items: day.items.filter((item) => itemMatches(item, filters)),
    longActiveCount: keepLong ? day.longActiveCount : 0,
    longInactiveCount: keepLong ? day.longInactiveCount : 0,
    automation: [],
  }
}

function dayContent(days: readonly ScheduleDay[]): number {
  return days.reduce((sum, day) => sum + day.items.length + day.longActiveCount + day.longInactiveCount, 0)
}

/** 칸 목록을 거른다. 거르기가 꺼져 있으면 그대로 돌려준다. */
export function filterScheduleDays<T extends ScheduleDay>(days: readonly T[], filters: ScheduleFilters): T[] {
  return hasScheduleFilters(filters) ? days.map((day) => filterDay(day, filters)) : [...days]
}

/** 주간 보기를 거른다. 거르기가 꺼져 있으면 그대로 돌려준다. */
export function filterScheduleWeek(week: ScheduleWeek, filters: ScheduleFilters): ScheduleWeek {
  if (!hasScheduleFilters(filters)) return week
  const days = week.days.map((day) => filterDay(day, filters))
  const missionBars = week.missionBars.filter((bar) => barMatches(bar, filters))
  return { ...week, days, missionBars, contentCount: dayContent(days) + missionBars.length }
}

/** 월간 보기를 거른다. 거르기가 꺼져 있으면 그대로 돌려준다. */
export function filterScheduleMonth<T extends { days: readonly ScheduleDay[]; contentCount: number }>(month: T, filters: ScheduleFilters): T {
  if (!hasScheduleFilters(filters)) return month
  const days = month.days.map((day) => filterDay(day, filters))
  return { ...month, days, contentCount: dayContent(days) }
}

/** 타임라인을 거른다. 막대는 줄(종류)·트라이브·패턴으로, 칸은 주간과 같은 규칙으로 거른다. 신호 칩은 그대로다. 거르기가 꺼져 있으면 그대로 돌려준다. */
export function filterScheduleTimeline(timeline: ScheduleTimeline, filters: ScheduleFilters): ScheduleTimeline {
  if (!hasScheduleFilters(filters)) return timeline
  const days = timeline.days.map((day) => filterDay(day, filters))
  let barCount = 0
  const rows = timeline.rows.map((row) => {
    const bars = row.bars
      .filter((bar) => matches({ kind: bar.rowKey, isOps: bar.origin === 'ops', tribeId: bar.tribeId, patternNo: bar.patternNo }, filters))
      .map((bar) => ({ ...bar }))
    barCount += bars.length
    return { ...row, bars, laneCount: bars.length > 0 ? assignLanes(bars) : 0 }
  })
  return { ...timeline, days, rows, contentCount: barCount + dayContent(days) }
}
