/**
 * 어드민 메인 주간 캘린더의 홈피드 카드 반응 표시(티켓 20260924_0908) — 단기 카드마다 그날의
 * 노출·열람 수를 센다. 순수 함수(`bucketCardEvents`·`formatCardMetricsNote`)와 조회 함수
 * (`fetchWeeklyCardMetrics`·`fetchFirstEventKstDate`)를 함께 담는다.
 *
 * 후속 행동(`followup`)은 수집하지 않기로 했으므로(2026-09-24 사용자 결정, 티켓 20260924_0810)
 * 세지도 표시하지도 않는다. 표본 크기 최소 기준도 두지 않는다(PRD content-automation §11).
 * 원천 `today_card_events`에는 유저 식별 컬럼이 없어 집계 수치만 다룬다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import { todayKstDateString } from './today-calendar'

export interface CardEventRow {
  card_id: string
  event: string
  occurred_at: string
}

export interface CardMetricCounts {
  impression: number
  click: number
}

/** 카드 ID와 KST 날짜('YYYY-MM-DD')를 묶은 버킷 키 */
export function cardMetricKey(cardId: string, date: string): string {
  return `${cardId}|${date}`
}

/** `{ card_id, event, occurred_at }` 행을 `카드ID|KST날짜 → { impression, click }`로 센다. `followup`·알 수 없는 이벤트는 무시한다. */
export function bucketCardEvents(rows: CardEventRow[]): Map<string, CardMetricCounts> {
  const buckets = new Map<string, CardMetricCounts>()
  for (const row of rows) {
    if (row.event !== 'impression' && row.event !== 'click') continue
    const key = cardMetricKey(row.card_id, todayKstDateString(new Date(row.occurred_at)))
    const counts = buckets.get(key) ?? { impression: 0, click: 0 }
    counts[row.event] += 1
    buckets.set(key, counts)
  }
  return buckets
}

export interface CardMetricsNoteInput {
  /** 칸의 날짜, 'YYYY-MM-DD' */
  date: string
  /** 오늘(KST), 'YYYY-MM-DD' */
  today: string
  /** 수집 시작일(가장 이른 이벤트의 KST 날짜). 이벤트가 하나도 없으면 null */
  firstEventDate: string | null
  /** 그 카드·그 날짜의 집계. 이벤트가 없으면 undefined */
  counts: CardMetricCounts | undefined
}

/** 표시 문구 규칙을 적용한다. 오늘보다 뒤 날짜는 `null`(표시 없음), 수집 시작일 이전은 `집계 전`. */
export function formatCardMetricsNote({ date, today, firstEventDate, counts }: CardMetricsNoteInput): string | null {
  if (date > today) return null
  if (firstEventDate === null || date < firstEventDate) return '집계 전'
  return `노출 ${counts?.impression ?? 0} · 열람 ${counts?.click ?? 0}`
}

// PostgREST 기본 행 상한(1,000)과 맞춘다 — 상한에서 조용히 잘리지 않게 페이지를 넘겨 읽는다.
const PAGE_SIZE = 1000

/** 카드 ID·기간(`weekStartIso` 이상 `weekEndIso` 이하) 안의 이벤트를 카드×KST날짜별로 센다. */
export async function fetchWeeklyCardMetrics(
  cardIds: string[],
  weekStartIso: string,
  weekEndIso: string
): Promise<Map<string, CardMetricCounts>> {
  if (cardIds.length === 0) return new Map()
  const supabase = createServiceClient()
  const rows: CardEventRow[] = []

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('today_card_events')
      .select('card_id, event, occurred_at')
      .in('card_id', cardIds)
      .gte('occurred_at', weekStartIso)
      .lte('occurred_at', weekEndIso)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw error
    rows.push(...((data ?? []) as CardEventRow[]))
    if (!data || data.length < PAGE_SIZE) break
  }

  return bucketCardEvents(rows)
}

/** 가장 이른 이벤트의 KST 날짜(수집 시작일). 이벤트가 하나도 없으면 null. */
export async function fetchFirstEventKstDate(): Promise<string | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('today_card_events')
    .select('occurred_at')
    .order('occurred_at', { ascending: true })
    .limit(1)
  if (error) throw error
  const first = data?.[0]?.occurred_at
  return first ? todayKstDateString(new Date(first)) : null
}
