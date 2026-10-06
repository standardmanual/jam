/**
 * 일정표 서랍이 그리는 값의 계산 (티켓 20261006_1537 ③-b, 상위 20260930_1502 「채원 S1·S4 사전 판정」 S4 서랍, 카리나 가정 3·5, 순수 함수 — DB·DOM 접근 없음).
 *
 * 서랍 화면(`OpsScheduleDrawer`·`OpsScheduleDayDrawer`)은 클라이언트 컴포넌트라 판정을 여기 빼 두고 테스트로 고정한다. 날짜 서랍은 **이미 읽은 주간 데이터**로 그리고(가정 1),
 * 옛 카드·미션(운영 묶음에 없는 실제 카드·미션) 서랍도 그 데이터에서 요약을 찾는다.
 *
 * - 신호 안내(가정 5): 신호를 못 읽었으면 「신호가 없다는 뜻은 아니에요」, 검사 범위 밖 날짜면 「신호를 확인하는 기간이 아니에요」(「이상 없음」을 말하지 않는다),
 *   범위 안인데 뜬 신호가 없으면 「뜬 신호가 없어요」다. 범위 밖이어도 날짜가 있는 결과는 줄로 남는다(`signalDays.ts`).
 * - 못 읽은 재료가 있으면 「없다」고 단정하지 않는다(대표 카드·항목 목록 모두).
 */
import { splitItemKey } from '@/lib/admin/opsSchedule/drawerParams'
import type { ScheduleSourceErrors } from '@/lib/admin/opsSchedule/load'
import type { DaySignals } from '@/lib/admin/opsSchedule/signalDays'
import type { ScheduleDay, ScheduleWeek } from '@/lib/admin/opsSchedule/weekView'

/** 못 읽은 재료와 사유(주간·월간·타임라인 읽기의 `sourceErrors`). */
export type { ScheduleSourceErrors }

/** 서랍이 찾아보는 데이터: 칸(`days`)과 미션 막대. 주간·월간·타임라인이 모두 이 모양으로 준다(월간·타임라인은 막대가 없다). */
export type ScheduleDrawerSource = Pick<ScheduleWeek, 'days' | 'missionBars'>

export const DAY_SIGNAL_UNREAD_TEXT = '신호를 읽지 못했어요. 신호가 없다는 뜻은 아니에요'
export const DAY_SIGNAL_UNCHECKED_TEXT = '이 날짜는 신호를 확인하는 기간이 아니에요'
export const DAY_SIGNAL_NONE_TEXT = '이 날짜에 뜬 신호가 없어요'
export const DAY_EMPTY_TEXT = '이 날짜에는 올라온 항목이 없어요'
export const DAY_ITEMS_PARTIAL_TEXT = '일부 항목을 읽지 못해 빠져 있을 수 있어요'
export const DAY_REPRESENTATIVE_NONE_TEXT = '대표 카드가 없어요'
export const DAY_REPRESENTATIVE_UNREAD_TEXT = '카드를 읽지 못해 대표 카드를 알 수 없어요'

/** 서랍 머리 글자의 날짜 부분: 「10월 7일(화)」. */
export function formatDayTitle(day: Pick<ScheduleDay, 'dateLabel' | 'weekdayLabel'>): string {
  return `${day.dateLabel}(${day.weekdayLabel})`
}

/** 날짜 서랍 신호 구역의 안내 글. 줄만 보이면 되는 경우(검사 범위 안에서 신호가 떴다)는 null이다. 범위 밖이면 줄이 있어도 안내가 붙는다. */
export function daySignalNotice(signals: DaySignals | null): string | null {
  if (signals === null) return DAY_SIGNAL_UNREAD_TEXT
  if (!signals.checked) return DAY_SIGNAL_UNCHECKED_TEXT
  if (signals.count === 0) return DAY_SIGNAL_NONE_TEXT
  return null
}

/** 날짜 서랍 대표 카드 구역의 안내 글. 대표 카드가 있으면 null이다. 카드·운영 묶음을 못 읽었으면 「없다」고 하지 않는다. */
export function dayRepresentativeNotice(day: Pick<ScheduleDay, 'representative'>, sourceErrors: ScheduleSourceErrors): string | null {
  if (day.representative !== null) return null
  return sourceErrors.cards || sourceErrors.bundles ? DAY_REPRESENTATIVE_UNREAD_TEXT : DAY_REPRESENTATIVE_NONE_TEXT
}

/** 날짜 서랍 항목 목록 위의 안내 글. 카드·미션·운영 항목 중 하나라도 못 읽었으면 빠진 항목이 있을 수 있다고 알린다. */
export function dayItemsNotice(sourceErrors: ScheduleSourceErrors): string | null {
  return sourceErrors.cards || sourceErrors.missions || sourceErrors.bundles ? DAY_ITEMS_PARTIAL_TEXT : null
}

/** 날짜 서랍 항목 구역의 머리 글자·안내·빈 글자(티켓 20261006_1538 ③-c, ③-b에서 넘어온 조건). */
export interface DayItemsSection {
  /** 구역 머리 글자: 「항목 3개」. 항목이 없고 못 읽은 재료가 있으면 개수를 말하지 않는 「항목」이다. */
  title: string
  /** 목록 위에 보일 안내 글(못 읽은 재료가 있을 때). */
  notice: string | null
  /** 항목이 없을 때 보일 글. 못 읽은 재료가 있으면 null이다 — 0개가 「없다」는 뜻이 아니라서 「올라온 항목이 없어요」를 쓰지 않는다. */
  emptyText: string | null
}

/**
 * 항목 구역을 어떻게 보일지 정한다. 항목이 0개일 때 카드·미션·묶음 중 하나라도 못 읽었으면 「이 날짜에는 올라온 항목이 없어요」를 쓰지 않고
 * 「일부 항목을 읽지 못해 빠져 있을 수 있어요」만 보인다(대표 카드 구역·주간 본문과 같은 원칙: 못 읽은 것을 없다고 단정하지 않는다).
 */
export function dayItemsSection(itemCount: number, sourceErrors: ScheduleSourceErrors): DayItemsSection {
  const notice = dayItemsNotice(sourceErrors)
  if (itemCount > 0) return { title: `항목 ${itemCount}개`, notice, emptyText: null }
  return notice === null ? { title: '항목 0개', notice: null, emptyText: DAY_EMPTY_TEXT } : { title: '항목', notice, emptyText: null }
}

/** 옛 카드·미션(운영 묶음에 없는 실제 카드·미션) 서랍의 요약. */
export interface LegacyDrawerEntry {
  origin: 'card' | 'mission'
  id: string
  title: string
  /** 카드는 유형 ID(없으면 「유형 없음」), 미션은 null이다. */
  time: string | null
  /** 카드의 노출·열람 줄. 없으면 null이다. */
  note: string | null
  /** 비활성 카드(칸에서 흐리게 보이는 항목)인가. */
  inactive: boolean
  /** 카드·미션 상세 경로. */
  href: string
}

/** 서랍 키에서 옛 카드·미션 상세 경로를 만든다(주간 데이터에 경로가 없을 때의 대체). */
export function legacyHref(origin: 'card' | 'mission', id: string): string {
  return origin === 'card' ? `/admin/today/${id}` : `/admin/missions/${id}`
}

/**
 * 서랍 키(`card:<ID>`·`mission:<ID>`)로 지금 보는 주의 칸 항목·미션 막대에서 요약을 찾는다. 운영 항목 키이거나 이 주에서 못 찾으면 null이다
 * (호출부가 「찾을 수 없는 항목이에요」를 보인다).
 */
export function legacyEntryOf(week: ScheduleDrawerSource, key: string): LegacyDrawerEntry | null {
  const { origin, id } = splitItemKey(key)
  if (origin === 'ops') return null
  const wanted = key.toLowerCase()

  for (const day of week.days) {
    const item = day.items.find((entry) => entry.origin === origin && entry.drawerKey.toLowerCase() === wanted)
    if (item) {
      return { origin, id, title: item.title, time: origin === 'card' ? item.time : null, note: item.note, inactive: item.dim, href: item.href ?? legacyHref(origin, id) }
    }
  }
  if (origin === 'mission') {
    const bar = week.missionBars.find((entry) => entry.drawerKey.toLowerCase() === wanted)
    if (bar) return { origin, id, title: bar.title, time: null, note: null, inactive: false, href: bar.href ?? legacyHref(origin, id) }
  }
  return null
}

/**
 * 서랍 키 → 운영 항목 상태. 칸 항목과 미션 막대에서 상태가 있는 것(운영 항목)만 모은다. 결정이 끝나 서버 화면을 다시 읽었을 때 이전 값과 비교해
 * 상태가 바뀐 칸에 1.2초 잔상을 남기는 데 쓴다(`useStatusFlash`). 같은 항목이 여러 날 칸에 걸쳐 있어도 키 하나다.
 */
export function statusByDrawerKey(week: ScheduleDrawerSource): Record<string, string> {
  const statuses: Record<string, string> = {}
  for (const day of week.days) {
    for (const item of day.items) if (item.status !== null) statuses[item.drawerKey] = item.status
  }
  for (const bar of week.missionBars) if (bar.status !== null) statuses[bar.drawerKey] = bar.status
  return statuses
}
