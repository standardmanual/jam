/**
 * 어드민 메인 주간 캘린더의 홈피드 카드 편성 배분(티켓 20260924_0906) — 카드 목록과 주의
 * 월요일을 받아 요일별로 「단기 카드 목록 · 활성 장기 카드 수 · 미편성 여부」를 만드는 순수
 * 함수만 담는다(DB·네트워크 접근 없음).
 *
 * 하루에 걸치는 카드 판정은 `/admin/today` 목록과 같다: `kstDayBoundsIso(날짜)`의
 * `startIso`·`endIso`로 `starts_at <= endIso` 그리고 `ends_at >= startIso`(2026-09-24 결정).
 *
 * 카드 표시 기준(2026-09-24 사용자 결정):
 * - 기간(`ends_at - starts_at`)이 `SHORT_CARD_MAX_DAYS`일 이하면 단기 카드 — 한 장씩 표시한다.
 * - 그보다 길면 장기 카드 — "장기 카드 N장"으로 묶고, N은 활성 카드만 센다. 비활성 장기 카드는 따로 세어
 *   「장기 카드 N장 · 비활성 M장」으로 알린다(티켓 20260924_1151을 20261006_1536 ③-a가 흡수). 그날 걸치는 카드 수 불변식:
 *   단기(활성+비활성) + 활성 장기 + 비활성 장기 = `/admin/today?date=` 목록 수.
 * - 활성 단기 카드가 하나도 없는 날은 미편성이다. 비활성 단기 카드는 흐리게 표시하되
 *   미편성 판정에는 넣지 않는다(비활성만 있어도 활성 단기 카드가 없으면 미편성).
 */
import { kstDayBoundsIso, shiftDateStr } from './today-calendar'
import type { TodayCardRow } from '@/types/database'

/** 단기·장기 경계(일). 이 값 이하 기간이면 단기 카드다. */
export const SHORT_CARD_MAX_DAYS = 7

/** weeklyCards()에 필요한 컬럼만 추린 입력 타입(전체 컬럼 조회 방지) */
export type WeeklyCardInput = Pick<
  TodayCardRow,
  'id' | 'title' | 'content_type_id' | 'template_type' | 'starts_at' | 'ends_at' | 'is_active' | 'sort_order'
>

export interface WeeklyCardDay {
  /** 'YYYY-MM-DD' */
  date: string
  /** 그 날짜에 걸치는 단기 카드(활성+비활성). `/admin/today`와 같은 정렬(sort_order 오름차순 → starts_at 내림차순) */
  shortCards: WeeklyCardInput[]
  /** 그 날짜에 걸치는 활성 장기 카드 수 */
  longActiveCount: number
  /** 그 날짜에 걸치는 비활성 장기 카드 수(티켓 20261006_1536). 0이면 표시를 바꾸지 않는다. */
  longInactiveCount: number
  /** 활성 단기 카드가 하나도 없으면 true */
  unprogrammed: boolean
}

/** 기간(ends_at - starts_at)이 SHORT_CARD_MAX_DAYS일 이하면 단기 카드다(경계값 포함) */
function isShortCard(card: WeeklyCardInput): boolean {
  const durationMs = new Date(card.ends_at).getTime() - new Date(card.starts_at).getTime()
  const durationDays = durationMs / (24 * 60 * 60 * 1000)
  return durationDays <= SHORT_CARD_MAX_DAYS
}

/** `/admin/today`와 같은 하루 겹침 판정: starts_at <= endIso && ends_at >= startIso */
function overlapsDay(card: WeeklyCardInput, startIso: string, endIso: string): boolean {
  const dayStart = new Date(startIso).getTime()
  const dayEnd = new Date(endIso).getTime()
  const cardStart = new Date(card.starts_at).getTime()
  const cardEnd = new Date(card.ends_at).getTime()
  return cardStart <= dayEnd && cardEnd >= dayStart
}

/** `/admin/today`와 같은 정렬: sort_order 오름차순 → starts_at 내림차순 */
function sortShortCards(cards: WeeklyCardInput[]): WeeklyCardInput[] {
  return [...cards].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()
  })
}

/** 카드 목록과 주의 월요일('YYYY-MM-DD')을 받아 요일 7개(월~일) 배분 결과를 반환한다 */
export function weeklyCards(cards: WeeklyCardInput[], weekStart: string): WeeklyCardDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = shiftDateStr(weekStart, i)
    const { startIso, endIso } = kstDayBoundsIso(date)
    const overlapping = cards.filter((c) => overlapsDay(c, startIso, endIso))
    const shortCards = sortShortCards(overlapping.filter(isShortCard))
    const longActiveCount = overlapping.filter((c) => !isShortCard(c) && c.is_active).length
    const longInactiveCount = overlapping.filter((c) => !isShortCard(c) && !c.is_active).length
    const unprogrammed = !shortCards.some((c) => c.is_active)
    return { date, shortCards, longActiveCount, longInactiveCount, unprogrammed }
  })
}
