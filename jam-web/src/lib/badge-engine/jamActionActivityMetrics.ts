/**
 * JAM! 행동 지표 계산 — 활동 기반 새 지표 6종 (서버 사이드 전용, 티켓 20261019_0542 1회, 마이그레이션 246)
 *
 *  - `active_week_streak`(+ 보조 키 `active_week_min_days`): 한 주에 활동한 날이 `minDays` 이상인 주가 이어진 최장 주 수
 *  - `return_streak_weeks`: 7일 이상 쉬었다가 돌아온 뒤, 돌아온 주부터 이어진 연속 활동 주 수의 최댓값
 *  - `full_week_count`: 월~일 7일을 모두 활동한 주의 수
 *  - `full_season_year_count`: 달력 연도(KST) 안에 네 계절 모두에서 활동한 해의 수
 *  - `distinct_activity_type_count`: 인정된 활동의 서로 다른 종목 수
 *
 * `jamActionBadges.ts`가 부르는 «값 계산» 함수 모음이다. `jamActionDayMetrics.ts`와 같은 규약이다: `(supabase, userId)`를 받아 숫자를
 * 돌려주고 **DB 오류를 던진다**(던진 오류는 `evaluateJamActionBadges`가 그 지표만 건너뛴다, fail-closed).
 *
 * ## 「활동」과 「날」·「주」의 정의
 *  - 활동: `strava_activities`에서 **인정된 활동**(`filter_reason IS NULL`, 가입한 날(KST) 0시 이후)이다. 거기에 JAM! 종목이 있고
 *    걷기는 축1 게이트(`passesWalkingGate`)를 통과해야 한다(`jamActionDayMetrics.ts`의 R2와 같은 기준이다. 차량 속도는 입구 필터가
 *    이미 `filter_reason`으로 걸러 두었으므로 여기서 다시 보지 않는다). **체크인만 한 날은 세지 않는다**(`weekly_active_days`와 다른 점).
 *  - 날: 활동 시작 시각(UTC `start_date`)을 한국 시각으로 바꾼 날짜다(`timeBands.ts`의 `kstDateKeyOfStart`). 같은 날 여러 활동은 1일이다.
 *  - 주: 월~일(KST). 날짜 키(`YYYY-MM-DD`)를 `Date.UTC`로만 계산하므로 서버 시간대와 무관하다(`jamActionDayMetrics.ts`의 `kstWeekStartKey`).
 *  - 계절: 봄 3~5월, 여름 6~8월, 가을 9~11월, 겨울 12·1·2월. **한 해는 달력 연도(KST)**라 1·2월과 12월은 모두 겨울이고,
 *    2025년 12월과 2026년 1월은 서로 다른 해에 속한다(사용자 결정 4).
 *  - 복귀: 활동한 날 사이에 활동 없이 지난 날이 7일 이상이면(`RETURN_REST_DAYS`, 코드 상수) 그 뒤 첫 활동일은 «돌아온 날»이다.
 *    쉬는 날 수는 두 활동일의 날짜 차 - 1이다(`return_gap_days`의 `restDays`와 같다). 첫 활동은 돌아온 것이 아니다.
 *    돌아온 날이 속한 주가 1주이고, 그다음 주에도 활동이 있으면 2주, 활동 없는 주를 만나면 거기서 끝난다.
 *
 * 행이 `MAX_PAGES` 페이지(30,000행)를 넘으면 조회가 오류를 던지고 그 지표만 건너뛴다(`jamActionPaging.ts`).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NormalizedActivity } from '@/types/strava'
import { passesWalkingGate } from './activityFilters'
import { daysBetweenKstDays, kstDayStartIso, kstWeekStartKey, readSignupDay } from './jamActionDayMetrics'
import { selectAllPages } from './jamActionPaging'
import { kstDateKeyOfStart } from './timeBands'

const TAG = 'jamActionActivityMetrics'

/** 이 일수 이상 활동 없이 지나면 그다음 활동일이 «돌아온 날»이다(사용자 결정 3) */
export const RETURN_REST_DAYS = 7

/** `active_week_min_days`가 없을 때의 기본값 */
export const DEFAULT_ACTIVE_WEEK_MIN_DAYS = 1

/** 계산에 쓰는 활동 한 건 — KST 날짜와 종목만 남긴다 */
export interface RecognizedActivity {
  dayKey: string
  type: string
}

export type Season = 'spring' | 'summer' | 'fall' | 'winter'

export const SEASONS: readonly Season[] = ['spring', 'summer', 'fall', 'winter']

// ── 순수 함수 (DB를 만지지 않는다) ────────────────────────────────────────

/** 월(1~12)이 속한 계절. 12·1·2월은 겨울이다 */
export function seasonOfMonth(month: number): Season {
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'fall'
  return 'winter'
}

/** KST 날짜 키(`YYYY-MM-DD`)가 속한 계절 */
export function seasonOfDayKey(dayKey: string): Season {
  return seasonOfMonth(Number(dayKey.slice(5, 7)))
}

/** 활동한 날 집합 → 주(월요일 키)별 활동한 날 수 */
function activeDaysPerWeek(dayKeys: Iterable<string>): Map<string, number> {
  const perWeek = new Map<string, Set<string>>()
  for (const dayKey of dayKeys) {
    const week = kstWeekStartKey(dayKey)
    const days = perWeek.get(week)
    if (days) days.add(dayKey)
    else perWeek.set(week, new Set([dayKey]))
  }
  return new Map([...perWeek].map(([week, days]) => [week, days.size]))
}

/** 주(월요일 키) 목록에서 바로 다음 주끼리 이어진 가장 긴 길이. 비어 있으면 0 */
export function longestWeekRun(weekKeys: Iterable<string>): number {
  const sorted = [...new Set(weekKeys)].sort()
  let best = 0
  let run = 0
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && daysBetweenKstDays(sorted[i - 1], sorted[i]) === 7 ? run + 1 : 1
    best = Math.max(best, run)
  }
  return best
}

/** 월요일 키의 다음 주 월요일 키 */
function nextWeekKey(weekKey: string): string {
  const [y, m, d] = weekKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10)
}

/** 한 주에 활동한 날이 `minDays` 이상인 주가 이어진 최장 주 수 */
export function activeWeekStreak(dayKeys: Iterable<string>, minDays: number = DEFAULT_ACTIVE_WEEK_MIN_DAYS): number {
  const filled: string[] = []
  for (const [week, count] of activeDaysPerWeek(dayKeys)) if (count >= minDays) filled.push(week)
  return longestWeekRun(filled)
}

/** 월~일 7일을 모두 활동한 주의 수 */
export function countFullWeeks(dayKeys: Iterable<string>): number {
  let n = 0
  for (const count of activeDaysPerWeek(dayKeys).values()) if (count >= 7) n++
  return n
}

/** 네 계절 모두에서 활동한 달력 연도(KST)의 수 */
export function countFullSeasonYears(dayKeys: Iterable<string>): number {
  const seasonsPerYear = new Map<string, Set<Season>>()
  for (const dayKey of dayKeys) {
    const year = dayKey.slice(0, 4)
    const seasons = seasonsPerYear.get(year)
    if (seasons) seasons.add(seasonOfDayKey(dayKey))
    else seasonsPerYear.set(year, new Set([seasonOfDayKey(dayKey)]))
  }
  let n = 0
  for (const seasons of seasonsPerYear.values()) if (seasons.size === SEASONS.length) n++
  return n
}

/**
 * 돌아온 뒤 이어진 연속 활동 주 수의 최댓값. 돌아온 적이 없으면 0.
 * 돌아온 날이 속한 주가 1주이고, 바로 다음 주들에 활동이 이어지는 만큼 센다.
 */
export function returnStreakWeeks(dayKeys: Iterable<string>, restDays: number = RETURN_REST_DAYS): number {
  const days = [...new Set(dayKeys)].sort()
  if (days.length < 2) return 0
  const activeWeeks = new Set(days.map(kstWeekStartKey))

  let best = 0
  for (let i = 1; i < days.length; i++) {
    if (daysBetweenKstDays(days[i - 1], days[i]) - 1 < restDays) continue
    let week = kstWeekStartKey(days[i])
    let run = 1
    while (activeWeeks.has(nextWeekKey(week))) {
      week = nextWeekKey(week)
      run++
    }
    best = Math.max(best, run)
  }
  return best
}

/** 서로 다른 종목 수 */
export function countDistinctActivityTypes(activities: readonly RecognizedActivity[]): number {
  return new Set(activities.map((a) => a.type)).size
}

/** 활동 목록 → 활동한 날 집합 */
export function dayKeysOf(activities: readonly RecognizedActivity[]): Set<string> {
  return new Set(activities.map((a) => a.dayKey))
}

// ── 조회 ──────────────────────────────────────────────────────────────────

interface ActivityRow {
  start_date: string
  normalized: unknown
}

/**
 * `normalized`(JSON)에서 종목을 읽는다. 종목이 없거나 걷기 게이트를 통과하지 못하면 `null`이다.
 * 게이트가 읽는 필드가 숫자가 아니면 걷기는 세지 않는다.
 */
export function recognizedTypeOf(normalized: unknown): string | null {
  if (typeof normalized !== 'object' || normalized === null) return null
  const a = normalized as Partial<Record<keyof NormalizedActivity, unknown>>
  const type = a.jamActivityType
  if (typeof type !== 'string' || type === '') return null
  if (type !== 'walking') return type

  const { distanceKm, movingTimeSec, averageSpeedKmh } = a
  if (![distanceKm, movingTimeSec, averageSpeedKmh].every((v) => typeof v === 'number' && Number.isFinite(v))) return null
  return passesWalkingGate({ jamActivityType: type, distanceKm, movingTimeSec, averageSpeedKmh } as NormalizedActivity) ? type : null
}

/** 활동 행 → 계산에 쓰는 활동. 날짜를 읽을 수 없거나 종목·게이트가 안 맞는 행은 뺀다 */
export function toRecognizedActivities(rows: readonly ActivityRow[]): RecognizedActivity[] {
  const out: RecognizedActivity[] = []
  for (const row of rows) {
    if (typeof row.start_date !== 'string' || Number.isNaN(Date.parse(row.start_date))) continue
    const type = recognizedTypeOf(row.normalized)
    if (type === null) continue
    out.push({ dayKey: kstDateKeyOfStart(row.start_date), type })
  }
  return out
}

/** 가입한 날(KST) 0시 이후의 인정된 활동. 가입 시각을 못 읽거나 조회가 실패하면 던진다 */
export async function fetchRecognizedActivities(supabase: SupabaseClient, userId: string): Promise<RecognizedActivity[]> {
  const signupDay = await readSignupDay(supabase, userId)
  const sinceIso = kstDayStartIso(signupDay)
  const rows = await selectAllPages<ActivityRow>(TAG, '활동 기록', (from, to) =>
    supabase
      .from('strava_activities')
      .select('start_date, normalized')
      .eq('user_id', userId)
      .is('filter_reason', null) // 걸러진 활동은 세지 않는다(티켓 20261017_1421)
      .gte('start_date', sinceIso)
      .order('id')
      .range(from, to)
  )
  return toRecognizedActivities(rows)
}

// ── 지표 계산 ─────────────────────────────────────────────────────────────

/** 복귀 뒤 이어간 주 — `return_streak_weeks` */
export async function countReturnStreakWeeks(supabase: SupabaseClient, userId: string): Promise<number> {
  return returnStreakWeeks(dayKeysOf(await fetchRecognizedActivities(supabase, userId)))
}

/** 월~일 7일을 모두 채운 주의 수 — `full_week_count` */
export async function countFullWeekCount(supabase: SupabaseClient, userId: string): Promise<number> {
  return countFullWeeks(dayKeysOf(await fetchRecognizedActivities(supabase, userId)))
}

/** 네 계절을 모두 채운 해의 수 — `full_season_year_count` */
export async function countFullSeasonYearCount(supabase: SupabaseClient, userId: string): Promise<number> {
  return countFullSeasonYears(dayKeysOf(await fetchRecognizedActivities(supabase, userId)))
}

/** 해 본 종목 수 — `distinct_activity_type_count` */
export async function countDistinctActivityTypeCount(supabase: SupabaseClient, userId: string): Promise<number> {
  return countDistinctActivityTypes(await fetchRecognizedActivities(supabase, userId))
}
