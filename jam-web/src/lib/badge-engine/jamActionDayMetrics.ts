/**
 * JAM! 행동 지표 계산 — 가입 경과일·최근 30일 활동일·주간 활동일·같은 지점 체크인 일수
 * (서버 사이드 전용, 티켓 20261001_0633, 상위 20260930_1456 ③)
 *
 * `jamActionBadges.ts`가 부르는 «값 계산» 함수 모음이다. `jamActionMetrics.ts`와 같은 규약이다:
 * `(supabase, userId)`를 받아 숫자를 돌려주고 **DB 오류를 던진다**(0으로 바꿔 돌려주면 「센 값이 0」과
 * 「세지 못함」이 구분되지 않는다). 던진 오류는 `evaluateJamActionBadges`가 그 지표만 건너뛰는 것
 * (fail-closed)으로 받는다.
 *
 * ## 「활동한 날」의 정의 (이 티켓 전체가 하나의 정의를 쓴다)
 * **가입한 날(KST) 이후, 아래 ①을 통과한 활동의 시작 날짜(KST) ∪ ②체크인한 날.**
 * 최근 30일 활동일(`signup_recent_active_days`)과 주간 활동일(`weekly_active_days`)이 이 정의를 공유한다.
 *
 *  - R1 가입 이전 기록: 가입한 날(KST) 이전의 활동·체크인은 세지 않는다. 가입한 날 당일은 센다.
 *    (미션·컬렉션은 이 규칙이 아니라 전체 기록을 센다 — `jamActionCompletionMetrics.ts`)
 *  - R2 활동의 범위: ① JAM! 종목(`normalized.jamActivityType`이 있는 활동)만 센다. 걷기는 축1 게이트
 *    (`passesWalkingGate`: 0.5km·10분 이상, 평균 시속 2~8km)를 통과해야 하고, 모든 종목은 차량 속도 필터
 *    (평균 시속 ≤ `abusing_policy.vehicle_speed_filter_kmh`, 비정상 값이면 기본값 60으로 폴백 —
 *    `effectiveVehicleSpeedFilterKmh`, 동기화 `sync.ts`와 같은 규칙)를 통과해야 한다.
 *    `normalized`가 없거나 필요한 필드가 숫자가 아니면 그 활동은 세지 않는다.
 *  - R5 체크인한 날: ②는 체크인을 만든 활동의 날짜(`user_checkin_badge_earns.triggered_by_activity_date`,
 *    KST)로 센다. 이 값이 없는 행은 세지 않는다. 체크인한 날에는 R2 필터를 적용하지 않는다(Q2가 「활동 기록이
 *    있는 날」과 「체크인한 날」을 따로 센다고 정했다). 같은 날 활동과 체크인이 둘 다 있으면 1일이다.
 *
 * `user_daily_sync_counts`(동기화한 날)는 **읽지 않는다.** 동기화만 한 날은 활동한 날이 아니다(Q2) —
 * 읽지 않는 것으로 코드 구조에서 보장한다.
 *
 * ## 값의 정의
 *  - `days_since_signup`: 가입한 날(KST)부터 오늘(KST)까지의 날짜 차. 가입한 날이 0. 가입 시각을 못 읽으면 던진다.
 *  - `signup_recent_active_days`: 오늘(KST)을 포함한 최근 30일(오늘-29일 ~ 오늘) 가운데 활동한 날 수.
 *  - `weekly_active_days`: 월~일(KST) 한 주 안의 활동한 날 수의 **역대 최고 주** 값.
 *  - `same_spot_checkin_days`: 지점(`poi_id`)별 체크인한 서로 다른 날(KST) 수의 최댓값. 합이 아니다.
 *
 * ## 왜 `getMondayKey`를 쓰지 않는가
 * `activityFilters.ts`의 `getMondayKey`는 서버 로컬 시간대로 자정을 만들고(`setHours`·`getDay`) UTC로 날짜를
 * 읽는다(`toISOString`). 서버 시간대가 바뀌면 같은 입력의 주 경계가 달라진다. 이 모듈은 날짜 문자열
 * (`YYYY-MM-DD`, KST)을 `Date.UTC`로만 계산하므로 `process.env.TZ`와 무관하다(`kstWeekStartKey`).
 *
 * ## 날짜 열을 이렇게 고른 이유
 *  - 활동: `strava_activities`에는 현지 시각 열이 없고 `start_date`(timestamptz)만 있다. 이를 KST 날짜로 옮긴다.
 *  - 체크인: `earned_at`(동기화 시각)이 아니라 `triggered_by_activity_date`(활동 날짜)를 쓴다. 라이브 71행 중
 *    45행은 `earned_at`의 KST 날짜가 활동 날짜와 다르다(며칠 뒤에 동기화한 체크인).
 *
 * ## SQL 등가식 (읽기 전용 기준값 — 마이그레이션 203의 검증 주석과 같다)
 * ```
 * su       = users.created_at AT TIME ZONE 'Asia/Seoul' (::date)
 * act_days = strava_activities WHERE (start_date KST 날짜) >= su
 *            AND normalized->>'jamActivityType' IS NOT NULL
 *            AND averageSpeedKmh <= 차량 속도 상한(비정상이면 60)
 *            AND (jamActivityType <> 'walking' OR (distanceKm >= 0.5 AND movingTimeSec/60 >= 10 AND averageSpeedKmh BETWEEN 2 AND 8))
 * chk      = user_checkin_badge_earns WHERE triggered_by_activity_date IS NOT NULL AND (KST 날짜) >= su
 * days     = act_days ∪ chk              -- (user_id, 날짜) 중복 제거
 * days_since_signup         = 오늘(KST) - su
 * signup_recent_active_days = count(days WHERE 날짜 > 오늘(KST) - 30)   -- 코드는 미래 날짜를 세지 않는다(오늘까지)
 * weekly_active_days        = max(count(days) GROUP BY date_trunc('week', 날짜))     -- date_trunc('week')는 월요일 시작
 * same_spot_checkin_days    = max(count(DISTINCT 날짜) GROUP BY poi_id) FROM chk
 * ```
 *
 * ## 알려진 한계 — 수동 입력 활동
 * `normalizeActivity`(`sync.ts`)가 Strava의 `manual` 표시를 옮기지 않아 저장된 정보만으로는 손으로 입력한
 * 활동을 가를 수 없다. 이 지표에는 R2 필터(종목·걷기 게이트·차량 속도)만 걸린다. 잔여 위험은 배지 임계값과
 * 포인트를 작게 두어 줄인다.
 *
 * 행이 `MAX_PAGES` 페이지(30,000행)를 넘으면 조회가 오류를 던지고 그 지표만 건너뛴다(`jamActionPaging.ts`).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { effectiveVehicleSpeedFilterKmh, getAbusingPolicy } from '@/lib/abusing/policy'
import { kstDateString } from '@/lib/notifications/kst'
import { getSignupAnchorDate } from '@/lib/strava/activity-history'
import type { NormalizedActivity } from '@/types/strava'
import { passesWalkingGate } from './activityFilters'
import { selectAllPages } from './jamActionPaging'

/** 오류 메시지 접두어 — 로그에서 어느 계산인지 알아보도록 공용 페이징에 넘긴다 */
const TAG = 'jamActionDayMetrics'

/** 최근 활동일을 세는 창 길이(일) — 오늘(KST)을 포함한다 */
export const RECENT_ACTIVE_WINDOW_DAYS = 30

const DAY_MS = 86_400_000

// ── 순수 함수 (DB를 만지지 않는다) ────────────────────────────────────────

/** `YYYY-MM-DD` → UTC 자정 epoch(ms). 시간대와 무관하다 */
function dayKeyToUtcMs(dayKey: string): number {
  const [y, m, d] = dayKey.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function utcMsToDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * 시각 문자열(ISO)을 KST 날짜 키(`YYYY-MM-DD`)로 옮긴다. 값이 없거나 날짜로 읽을 수 없으면 `null`이다.
 *
 * `kstDateString`은 읽을 수 없는 입력을 **현재 시각으로 대체**한다(알림 키가 죽지 않게 하려는 설계).
 * 활동한 날을 세는 데 그렇게 쓰면 깨진 값이 «오늘»로 세어지므로, 여기서 먼저 걸러 `null`로 돌려준다.
 */
export function toKstDayKey(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null
  if (Number.isNaN(Date.parse(value))) return null
  return kstDateString(value)
}

/** 두 KST 날짜 키의 차(일). `toDay`가 나중이면 양수다 */
export function daysBetweenKstDays(fromDay: string, toDay: string): number {
  return Math.round((dayKeyToUtcMs(toDay) - dayKeyToUtcMs(fromDay)) / DAY_MS)
}

/** KST 날짜 키가 속한 주(월~일)의 월요일 키. 서버 시간대와 무관하다 */
export function kstWeekStartKey(dayKey: string): string {
  const ms = dayKeyToUtcMs(dayKey)
  const dow = new Date(ms).getUTCDay() // 0 = 일요일
  const sinceMonday = (dow + 6) % 7
  return utcMsToDayKey(ms - sinceMonday * DAY_MS)
}

/** 활동한 날 집합에서 한 주(월~일)에 든 날 수의 최댓값. 날이 없으면 0 */
export function bestWeekActiveDays(dayKeys: Iterable<string>): number {
  const perWeek = new Map<string, Set<string>>()
  for (const dayKey of dayKeys) {
    const week = kstWeekStartKey(dayKey)
    const days = perWeek.get(week)
    if (days) days.add(dayKey)
    else perWeek.set(week, new Set([dayKey]))
  }
  let best = 0
  for (const days of perWeek.values()) best = Math.max(best, days.size)
  return best
}

/**
 * 오늘(`todayKey`)을 포함한 최근 `windowDays`일(오늘-(windowDays-1)일 ~ 오늘)에 든 활동한 날 수.
 * 오늘보다 뒤 날짜는 세지 않는다.
 */
export function recentActiveDays(
  dayKeys: Iterable<string>,
  todayKey: string,
  windowDays: number = RECENT_ACTIVE_WINDOW_DAYS
): number {
  const inWindow = new Set<string>()
  for (const dayKey of dayKeys) {
    const ago = daysBetweenKstDays(dayKey, todayKey)
    if (ago >= 0 && ago <= windowDays - 1) inWindow.add(dayKey)
  }
  return inWindow.size
}

/** 체크인 한 행 — 지점과 체크인을 만든 활동의 시각(없으면 null) */
export interface CheckinRow {
  poi_id: string
  triggered_by_activity_date: string | null
}

/** 체크인 행을 지점별 «서로 다른 KST 날짜 집합»으로 묶는다. 활동 날짜가 없거나 읽을 수 없는 행은 뺀다(R5) */
function groupCheckinDaysBySpot(rows: readonly CheckinRow[]): Map<string, Set<string>> {
  const bySpot = new Map<string, Set<string>>()
  for (const row of rows) {
    const dayKey = toKstDayKey(row.triggered_by_activity_date)
    if (dayKey === null) continue
    const days = bySpot.get(row.poi_id)
    if (days) days.add(dayKey)
    else bySpot.set(row.poi_id, new Set([dayKey]))
  }
  return bySpot
}

/** 지점별 체크인한 서로 다른 날(KST) 수의 최댓값. 합이 아니다. 체크인이 없으면 0 */
export function maxSpotCheckinDays(rows: readonly CheckinRow[]): number {
  let best = 0
  for (const days of groupCheckinDaysBySpot(rows).values()) best = Math.max(best, days.size)
  return best
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/**
 * 이 활동이 「활동한 날」에 드는가 (R2) — `normalized`(JSON)를 받아 판정한다.
 *
 * JAM! 종목이 있고, 평균 시속이 차량 속도 상한 이하이며, 걷기면 축1 게이트를 통과해야 한다.
 * 판정에 쓰는 필드가 숫자가 아니면 세지 않는다(`normalized`가 없거나 필드가 비어도 같다).
 */
export function isCountableActivity(normalized: unknown, vehicleMaxKmh: number): boolean {
  if (typeof normalized !== 'object' || normalized === null) return false
  const a = normalized as Partial<Record<keyof NormalizedActivity, unknown>>

  const type = a.jamActivityType
  if (typeof type !== 'string' || type === '') return false

  const speed = a.averageSpeedKmh
  if (!isFiniteNumber(speed) || speed > vehicleMaxKmh) return false

  if (type !== 'walking') return true

  const distanceKm = a.distanceKm
  const movingTimeSec = a.movingTimeSec
  if (!isFiniteNumber(distanceKm) || !isFiniteNumber(movingTimeSec)) return false
  // `passesWalkingGate`가 읽는 네 필드만 채운 값이다 — 게이트 기준은 activityFilters.ts 한 곳에 둔다
  return passesWalkingGate({
    jamActivityType: type,
    distanceKm,
    movingTimeSec,
    averageSpeedKmh: speed,
  } as NormalizedActivity)
}

// ── 조회 ──────────────────────────────────────────────────────────────────

/** 가입한 날(KST) 0시의 UTC 시각(ISO) — 「가입한 날 이후」 조회의 하한 */
function kstDayStartIso(dayKey: string): string {
  return new Date(`${dayKey}T00:00:00+09:00`).toISOString()
}

/** 가입 시각(`users.created_at`)에서 가입한 날(KST)을 읽는다. 못 읽으면 던진다(fail-closed) */
async function readSignupDay(supabase: SupabaseClient, userId: string): Promise<string> {
  const createdAt = await getSignupAnchorDate(supabase, userId)
  const signupDay = toKstDayKey(createdAt)
  if (signupDay === null) throw new Error(`[${TAG}] 가입 시각을 읽지 못했다 (userId: ${userId})`)
  return signupDay
}

interface ActivityRow {
  start_date: string
  normalized: unknown
}

/** 가입한 날 이후의 체크인 행 — 활동 날짜가 있는 행만 */
export async function fetchCheckinRows(
  supabase: SupabaseClient,
  userId: string,
  signupDay: string
): Promise<CheckinRow[]> {
  const sinceIso = kstDayStartIso(signupDay)
  return selectAllPages<CheckinRow>(TAG, '체크인 기록', (from, to) =>
    supabase
      .from('user_checkin_badge_earns')
      .select('poi_id, triggered_by_activity_date')
      .eq('user_id', userId)
      .not('triggered_by_activity_date', 'is', null)
      .gte('triggered_by_activity_date', sinceIso)
      .order('id')
      .range(from, to)
  )
}

/**
 * 「활동한 날」 집합(KST 날짜 키) — R2를 통과한 활동의 시작 날짜 ∪ 체크인한 날. 가입한 날 이후만 읽는다.
 * 차량 속도 상한은 `getAbusingPolicy` + `effectiveVehicleSpeedFilterKmh`로 정한다(동기화와 같은 해석).
 */
export async function fetchActivityDayKeys(
  supabase: SupabaseClient,
  userId: string,
  signupDay: string
): Promise<Set<string>> {
  const sinceIso = kstDayStartIso(signupDay)
  const [activityRows, checkinRows, policy] = await Promise.all([
    selectAllPages<ActivityRow>(TAG, '활동 기록', (from, to) =>
      supabase
        .from('strava_activities')
        .select('start_date, normalized')
        .eq('user_id', userId)
        .is('filter_reason', null) // 걸러진 활동은 «활동한 날»에 넣지 않는다(티켓 20261017_1421)
        .gte('start_date', sinceIso)
        .order('id')
        .range(from, to)
    ),
    fetchCheckinRows(supabase, userId, signupDay),
    getAbusingPolicy(supabase),
  ])
  const vehicleMaxKmh = effectiveVehicleSpeedFilterKmh(policy)

  const dayKeys = new Set<string>()
  for (const row of activityRows) {
    if (!isCountableActivity(row.normalized, vehicleMaxKmh)) continue
    const dayKey = toKstDayKey(row.start_date)
    if (dayKey !== null) dayKeys.add(dayKey)
  }
  for (const days of groupCheckinDaysBySpot(checkinRows).values()) {
    for (const dayKey of days) dayKeys.add(dayKey)
  }
  return dayKeys
}

// ── 지표 계산 ─────────────────────────────────────────────────────────────

/** 가입 경과일 — 가입한 날(KST)부터 오늘(KST)까지의 날짜 차. 가입한 날이 0. 가입 시각을 못 읽으면 던진다 */
export async function countDaysSinceSignup(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date()
): Promise<number> {
  const signupDay = await readSignupDay(supabase, userId)
  return daysBetweenKstDays(signupDay, kstDateString(now))
}

/** 최근 30일 활동일 — 오늘(KST)을 포함한 최근 30일 가운데 활동한 날 수(가입 경과일의 보조 키) */
export async function countRecentActiveDays(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date()
): Promise<number> {
  const signupDay = await readSignupDay(supabase, userId)
  const dayKeys = await fetchActivityDayKeys(supabase, userId, signupDay)
  return recentActiveDays(dayKeys, kstDateString(now), RECENT_ACTIVE_WINDOW_DAYS)
}

/** 주간 활동일 — 월~일(KST) 한 주 안의 활동한 날 수의 역대 최고 주 값 */
export async function countWeeklyActiveDays(supabase: SupabaseClient, userId: string): Promise<number> {
  const signupDay = await readSignupDay(supabase, userId)
  const dayKeys = await fetchActivityDayKeys(supabase, userId, signupDay)
  return bestWeekActiveDays(dayKeys)
}

/** 같은 지점 체크인 일수 — 지점별 체크인한 서로 다른 날(KST) 수의 최댓값 */
export async function countSameSpotCheckinDays(supabase: SupabaseClient, userId: string): Promise<number> {
  const signupDay = await readSignupDay(supabase, userId)
  const rows = await fetchCheckinRows(supabase, userId, signupDay)
  return maxSpotCheckinDays(rows)
}
