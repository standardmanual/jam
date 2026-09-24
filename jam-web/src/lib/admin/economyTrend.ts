/**
 * 어드민 메인 배지 경제 흐름 그래프(티켓 20260924_0911) — 일별 배지 발급량과 일별 앰비언트 드랍량.
 * 순수 함수(`trendDates`·`bucketDailyCounts`·`summarizeTrend`)와 조회 함수(`fetchBadgeIssuanceDaily`·
 * `fetchAmbientDropDaily`)를 함께 담는다. 조회만 하며 경제 수치는 바꾸지 않는다.
 *
 * - 배지 발급량: `user_activity_badges.earned_at`(최초 발급 시각) — 주간 KPI(`kpiWeekly.ts`)와 같은 정의
 * - 앰비언트 드랍량: `poi_drops.dropped_at` 중 `source = 'system'`(`mint_and_place_ambient_drop`이 기록)
 * - 날짜 묶음은 KST 달력 날짜 기준이다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import { shiftDateStr, todayKstDateString } from './today-calendar'

export const TREND_LONG_DAYS = 30
export const TREND_SHORT_DAYS = 7

/** 오늘을 포함해 최근 `days`일의 KST 날짜 배열(오래된 날 → 오늘) */
export function trendDates(days: number, todayKst: string): string[] {
  const length = Math.max(0, Math.floor(days))
  return Array.from({ length }, (_, i) => shiftDateStr(todayKst, i - (length - 1)))
}

/** ISO 시각 목록을 KST 날짜별 개수로 센다. `dates`에 없는 날짜(범위 밖)는 무시한다. */
export function bucketDailyCounts(timestamps: string[], dates: string[]): number[] {
  const indexByDate = new Map(dates.map((d, i) => [d, i]))
  const counts = dates.map(() => 0)
  for (const ts of timestamps) {
    const parsed = new Date(ts)
    if (Number.isNaN(parsed.getTime())) continue
    const idx = indexByDate.get(todayKstDateString(parsed))
    if (idx !== undefined) counts[idx] += 1
  }
  return counts
}

export interface TrendSummary {
  total: number
  /** 일 평균(소수 첫째 자리까지 반올림). 날짜가 없으면 0 */
  average: number
  /** 그래프 눈금의 최댓값(그래프마다 따로 잡는다). 모두 0이면 0 */
  max: number
}

export function summarizeTrend(counts: number[]): TrendSummary {
  const total = counts.reduce((sum, n) => sum + n, 0)
  const average = counts.length === 0 ? 0 : Math.round((total / counts.length) * 10) / 10
  return { total, average, max: counts.reduce((m, n) => Math.max(m, n), 0) }
}

// PostgREST 기본 행 상한(1,000)과 맞춘다 — 상한에서 조용히 잘리지 않게 페이지를 넘겨 읽는다.
const PAGE_SIZE = 1000

/** 기간(`startIso` 이상 `endIso` 이하) 안의 배지 발급 시각(`user_activity_badges.earned_at`) 목록 */
export async function fetchBadgeIssuanceDaily(startIso: string, endIso: string): Promise<string[]> {
  const supabase = createServiceClient()
  const stamps: string[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('user_activity_badges')
      .select('earned_at')
      .gte('earned_at', startIso)
      .lte('earned_at', endIso)
      .order('earned_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    for (const row of data ?? []) stamps.push(row.earned_at)
    if (!data || data.length < PAGE_SIZE) break
  }
  return stamps
}

/** 기간(`startIso` 이상 `endIso` 이하) 안의 앰비언트 드랍 시각(`poi_drops.dropped_at`, `source = 'system'`) 목록 */
export async function fetchAmbientDropDaily(startIso: string, endIso: string): Promise<string[]> {
  const supabase = createServiceClient()
  const stamps: string[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('poi_drops')
      .select('dropped_at')
      .eq('source', 'system')
      .gte('dropped_at', startIso)
      .lte('dropped_at', endIso)
      .order('dropped_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    for (const row of data ?? []) stamps.push(row.dropped_at)
    if (!data || data.length < PAGE_SIZE) break
  }
  return stamps
}
