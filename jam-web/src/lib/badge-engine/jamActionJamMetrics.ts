/**
 * JAM! 행동 지표 계산 — 잼·챕터 3종: 지금까지 모은 잼·한 주에 모은 잼·도달한 챕터
 * (서버 사이드 전용, 티켓 20261018_1815 2회, 운영 로직 10.2절)
 *
 * `jamActionBadges.ts`의 `METRIC_COMPUTERS`가 부르는 «값 계산» 함수 모음이다. `jamActionMetrics.ts`와 같은 규약이다:
 * `(supabase, userId)`를 받아 숫자를 돌려주고 **DB 오류를 던진다**(0으로 바꿔 돌려주면 「센 값이 0」과 「세지 못함」이
 * 구분되지 않는다). 던진 오류는 `evaluateJamActionBadges`가 그 지표만 건너뛰는 것(fail-closed)으로 받는다.
 * 새 SQL 없이 supabase-js 읽기만 쓴다.
 *
 * ## 값의 정의 (티켓 20261018_1815 「사용자 결정」 6·10번, 운영 로직 4.2절 «원장과 기록»)
 *  - 서비스 활동 잼 합산(티켓 20261028_1736 1회, D7·B7): 잼 조건은 «활동 정산 잼 + 서비스 활동 잼»을 함께 센다. 원천 표 `total_earned`·`jam_daily_earned`는 활동 정산만
 *    늘리는 표로 그대로 두고(대량 수령 경보 기준·마이그레이션 220 정의), 서비스 활동 잼(마이그레이션 303)은 별도 일별 표 `jam_service_daily`에만 쌓이므로
 *    여기서 읽어 더한다. 소멸(`capsule_forfeit`)·채움·운영자 조정은 세지 않는다 — `jam_service_daily`는 줄어들지 않는 지급량 합이다(B5).
 *    `jam_service_daily`는 `anon`·`authenticated` 권한이 없어(마이그레이션 300) 이 읽기는 `service_role` 클라이언트로만 된다.
 *  - `jam_total_earned`: 지금까지 **모은** 잼. 원천은 `jam_wallets.total_earned`(마이그레이션 220) + `jam_service_daily.amount` 전체 합이다. 가진 양(`balance`)이 아니다 —
 *    캡슐·잠긴 아이템 배지를 채워 줄어도 모은 양은 줄지 않는다. 지갑 행이 없으면(첫 지급 전) 활동 정산 몫은 0이다.
 *  - `jam_weekly_earned`: 월~일(KST) 한 주에 모은 잼의 **역대 최고 주** 값. 원천은 `jam_daily_earned`와 `jam_service_daily`(날짜(KST)별 모은 양)를 날짜별로 더해 한 주씩 합산한 값이다.
 *    날짜는 활동한 날(KST)이라 늦게 동기화한 활동의 잼이 동기화한 날의 주에 잡히지 않는다. 주 경계는 `weekly_active_days`와 같은
 *    `kstWeekStartKey`(서버 시간대와 무관)를 쓴다.
 *  - `jam_week_count`·`jam_week_streak`(티켓 20261019_0542 2회, 7-3·7-4): 같은 원천(`jam_daily_earned` + `jam_service_daily`)을 월~일(KST) 주로 합산해, 합이
 *    `jam_week_min_earned`(보조 키, 없으면 1) 이상인 주를 «채운 주»로 본다. `jam_week_count`는 채운 주의 수, `jam_week_streak`는 채운 주가
 *    바로 다음 주끼리 이어진 최장 주 수다. 잼을 못 모은 주(행 없음)가 끼면 연속이 끊긴다.
 *  - `chapter_reached`: 도달한 챕터 번호. 원천은 `user_chapters.chapter_no`(마이그레이션 221)다. 행이 없거나 `chapter_no`가 NULL이면(퀘스트 전) 0이다.
 *    판정 시점(티켓 20261019_1316): 챕터가 오르면 오름 처리(`lib/chapter/rise.ts`)가 `runJamActionEvaluation`으로 이 지표만 바로 판정한다. 챕터 점수를 쌓는
 *    호출부(`chapter_add_score`, `lib/chapter/score.ts`)와 챕터를 시작하는 호출부(`chapter_start`, `lib/chapter/start.ts` — 퀘스트 완료 처리가 부른다)가
 *    모두 오름 처리를 부른다. 동기화 안의 잼 정산에서 난 오름은 동기화 끝 판정(`JAM_SYNC_TRIGGERS`)이 이어서 읽으므로 거기서만 바로 판정을 건너뛴다.
 *
 * ## SQL 등가식 (읽기 전용 기준값)
 * ```
 * jam_total_earned  = coalesce((SELECT total_earned FROM jam_wallets WHERE user_id = :u), 0)
 *                     + coalesce((SELECT sum(amount) FROM jam_service_daily WHERE user_id = :u), 0)
 * jam_weekly_earned = coalesce(max(week_sum), 0) FROM (SELECT sum(amount) AS week_sum
 *                                                       FROM (SELECT earned_on AS d, amount FROM jam_daily_earned WHERE user_id = :u
 *                                                             UNION ALL
 *                                                             SELECT kst_date AS d, amount FROM jam_service_daily WHERE user_id = :u) x
 *                                                       GROUP BY date_trunc('week', d)) w   -- date_trunc('week')는 월요일 시작
 * chapter_reached   = coalesce((SELECT chapter_no FROM user_chapters WHERE user_id = :u), 0)
 * ```
 * `jam_daily_earned`·`jam_service_daily`는 각각 유저당 하루 한 행이라 약 82년치(30,000행)가 쌓여야 `MAX_PAGES`를 넘는다 — 넘으면 오류를 던지고 그 지표만 건너뛴다.
 *
 * ## 기간 동안 모은 잼 (티켓 20261019_1445 3-A회, 미션 전용 키 `jam_period_earned`)
 * `readJamEarnedWithin`이 «참가한 뒤, 미션 기간 안»에 모은 잼을 읽는다. 배지 엔진은 이 함수를 부르지 않는다(미션 전용, `lib/missions/dbMetrics.ts`).
 * 활동 정산 잼의 기준 시각은 `jam_transactions.created_at`(정산·동기화 시각)이 **아니다** — 참가 전에 한 활동을 늦게 동기화하면 참가 뒤에 번 잼으로 섞이기 때문이다.
 * 서비스 활동 잼(`service_activity`)은 활동 시작 시각이 없고 일어난 시각에 바로 지급되므로 지급 시각(`created_at`)이 곧 활동 시각이다(티켓 20261028_1736).
 * 정산된 활동의 시작 시각(`strava_activities.start_date`)이 기간 안인 활동의 잼만 센다(운영 로직 13.2절의 «참가한 뒤에 한 활동만 반영»,
 * 활동 선택 `lib/missions/window.ts`와 같은 기준).
 * ```
 * jam_period_earned = coalesce(sum(t.amount), 0)
 *   FROM jam_transactions t
 *   WHERE t.user_id = :u AND t.reason = 'activity_settlement'
 *     AND t.source_activity_id IN (SELECT a.id FROM strava_activities a
 *                                  WHERE a.user_id = :u AND a.filter_reason IS NULL   -- 인정된 활동만(티켓 20261017_1459)
 *                                    AND a.start_date BETWEEN :from AND :to)         -- 하한·상한 포함, 상한 없으면 하한만
 *   + coalesce(sum(t.amount), 0)                                                   -- 서비스 활동 잼(티켓 20261028_1736 1회): 활동 시작 시각이 없어 지급 시각이 곧 활동 시각
 *     FROM jam_transactions t
 *     WHERE t.user_id = :u AND t.reason = 'service_activity' AND t.amount > 0
 *       AND t.created_at BETWEEN :from AND :to                                       -- 하한·상한 포함, 상한 없으면 하한만
 * ```
 * 걸러진 활동은 정산되지 않아 원장에 줄이 없다 — 이 조건은 결과를 바꾸지 않고, 읽는 행 수를 줄이며 «인정된 활동 기준»을 코드에 못 박는다.
 * 채움(`capsule_fill`·`locked_item_badge_fill`, 음수)과 운영자 지급·회수(`admin_grant`·`admin_deduct`)와 소멸(`capsule_forfeit`, 음수)은 `reason`이 달라 합계에 들지 않는다 —
 * 모은 양은 쓴 양으로 줄지 않는다. 정산되지 않은 활동은 원장에 줄이 없어 0이다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { longestWeekRun } from './jamActionActivityMetrics'
import { kstWeekStartKey } from './jamActionDayMetrics'
import { selectAllPages } from './jamActionPaging'
import { applyMetricWindow, type MetricWindow } from './jamActionWindow'

/** 오류 메시지 접두어 — 로그에서 어느 계산인지 알아보도록 공용 페이징에 넘긴다 */
const TAG = 'jamActionJamMetrics'

function throwQueryError(label: string, error: { message?: string }): never {
  throw new Error(`[${TAG}] ${label} 조회 오류: ${error.message ?? '알 수 없는 오류'}`)
}

/** 날짜(KST)별 모은 잼 한 줄 */
export interface DailyEarnedRow {
  /** 활동한 날(KST), `YYYY-MM-DD` */
  earned_on: string
  amount: number
}

/** 월~일(KST) 한 주에 모은 잼의 최댓값. 같은 날 행이 여럿이어도 모두 더한다. 행이 없으면 0 */
export function bestWeekJamEarned(rows: readonly DailyEarnedRow[]): number {
  const perWeek = new Map<string, number>()
  for (const row of rows) {
    if (typeof row.earned_on !== 'string' || !Number.isFinite(row.amount)) continue
    const week = kstWeekStartKey(row.earned_on)
    perWeek.set(week, (perWeek.get(week) ?? 0) + row.amount)
  }
  let best = 0
  for (const sum of perWeek.values()) best = Math.max(best, sum)
  return best
}

/** `jam_week_min_earned`가 없을 때의 기본값 — 잼을 1이라도 모은 주 */
export const DEFAULT_JAM_WEEK_MIN_EARNED = 1

/** 날짜별 모은 잼 → 주(월요일 키)별 합. 같은 날 행이 여럿이어도 모두 더한다 */
function jamEarnedPerWeek(rows: readonly DailyEarnedRow[]): Map<string, number> {
  const perWeek = new Map<string, number>()
  for (const row of rows) {
    if (typeof row.earned_on !== 'string' || !Number.isFinite(row.amount)) continue
    const week = kstWeekStartKey(row.earned_on)
    perWeek.set(week, (perWeek.get(week) ?? 0) + row.amount)
  }
  return perWeek
}

/** 한 주(월~일, KST)에 `minEarned` 이상 모은 주(월요일 키) 목록 */
function filledJamWeeks(rows: readonly DailyEarnedRow[], minEarned: number): string[] {
  const filled: string[] = []
  for (const [week, sum] of jamEarnedPerWeek(rows)) if (sum >= minEarned) filled.push(week)
  return filled
}

/** 한 주에 `minEarned` 이상 잼을 모은 주의 수 — `jam_week_count` */
export function countJamWeeks(rows: readonly DailyEarnedRow[], minEarned: number = DEFAULT_JAM_WEEK_MIN_EARNED): number {
  return filledJamWeeks(rows, minEarned).length
}

/** 한 주에 `minEarned` 이상 잼을 모은 주가 이어진 최장 주 수 — `jam_week_streak` */
export function jamWeekStreak(rows: readonly DailyEarnedRow[], minEarned: number = DEFAULT_JAM_WEEK_MIN_EARNED): number {
  return longestWeekRun(filledJamWeeks(rows, minEarned))
}

/** 서비스 활동 잼의 날짜(KST)별 합 한 줄 — `jam_service_daily`(마이그레이션 300, 303) */
interface ServiceDailyRow {
  kst_date: string
  amount: number | string
}

/** 서비스 활동 잼의 날짜별 합 전부 — 한 유저당 하루 한 행. `service_role` 전용 표다(`anon`·`authenticated` 권한 없음, 마이그레이션 300) */
async function fetchServiceDailyRows(supabase: SupabaseClient, userId: string): Promise<ServiceDailyRow[]> {
  return selectAllPages<ServiceDailyRow>(TAG, '날짜별 서비스 활동 잼', (from, to) =>
    supabase.from('jam_service_daily').select('kst_date, amount').eq('user_id', userId).order('kst_date').range(from, to)
  )
}

/**
 * 날짜(KST)별 모은 잼 전부 — 활동 정산 잼(`jam_daily_earned`)과 서비스 활동 잼(`jam_service_daily`)을 날짜별로 더한 행.
 * 같은 날짜가 두 표에 있으면 한 행으로 합친다. 날짜 오름차순. 두 표 중 하나라도 읽지 못하면 던진다(한쪽만 센 값으로 임계를 판정하지 않는다).
 */
export async function fetchDailyEarnedRows(supabase: SupabaseClient, userId: string): Promise<DailyEarnedRow[]> {
  const settled = await selectAllPages<DailyEarnedRow>(TAG, '날짜별 모은 잼', (from, to) =>
    supabase
      .from('jam_daily_earned')
      .select('earned_on, amount')
      .eq('user_id', userId)
      .order('earned_on')
      .range(from, to)
  )
  const service = await fetchServiceDailyRows(supabase, userId)

  const perDay = new Map<string, number>()
  const add = (day: unknown, amount: unknown): void => {
    const value = Number(amount)
    if (typeof day !== 'string' || !Number.isFinite(value)) return
    perDay.set(day, (perDay.get(day) ?? 0) + value)
  }
  for (const row of settled) add(row.earned_on, row.amount)
  for (const row of service) add(row.kst_date, row.amount)
  return [...perDay.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([earned_on, amount]) => ({ earned_on, amount }))
}

/** 지금까지 모은 잼 — `jam_wallets.total_earned`(활동 정산) + `jam_service_daily.amount` 전체 합(서비스 활동). 지갑이 없으면 서비스 활동 합만 센다 */
export async function readJamTotalEarned(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase.from('jam_wallets').select('total_earned').eq('user_id', userId).maybeSingle()
  if (error) throwQueryError('잼 지갑', error)
  const settled = Number((data as { total_earned: number | string } | null)?.total_earned ?? 0)
  if (!Number.isFinite(settled)) throw new Error(`[${TAG}] 잼 지갑의 모은 양을 숫자로 읽지 못했다 (userId: ${userId})`)

  let service = 0
  for (const row of await fetchServiceDailyRows(supabase, userId)) {
    const amount = Number(row.amount)
    if (!Number.isFinite(amount)) throw new Error(`[${TAG}] 서비스 활동 잼의 양을 숫자로 읽지 못했다 (userId: ${userId})`)
    service += amount
  }
  return settled + service
}

/** 한 주에 모은 잼 — 날짜별 모은 양을 월~일(KST) 주로 합산한 역대 최고 값 */
export async function readJamWeeklyEarned(supabase: SupabaseClient, userId: string): Promise<number> {
  return bestWeekJamEarned(await fetchDailyEarnedRows(supabase, userId))
}

/** 도달한 챕터 — `user_chapters.chapter_no`. 행이 없거나 퀘스트 전(NULL)이면 0 */
export async function readChapterReached(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase.from('user_chapters').select('chapter_no').eq('user_id', userId).maybeSingle()
  if (error) throwQueryError('챕터', error)
  const chapterNo = (data as { chapter_no: number | null } | null)?.chapter_no
  return typeof chapterNo === 'number' ? chapterNo : 0
}

/** `.in()`에 한 번에 넘기는 활동 id 수 — URL이 길어지지 않게 나눠 읽는다(`jamActionCheckinMetrics.ts`·`jamActionItemMetrics.ts`와 같은 값) */
const IN_CHUNK_SIZE = 200

/**
 * 참가한 뒤 기간 안에 모은 잼 — `jam_period_earned`.
 *
 * (1) `strava_activities`에서 시작 시각이 기간 안(하한·상한 포함)인 활동 id를 끝까지 읽고(`selectAllPages`, 30,000행을 넘으면 던진다),
 * (2) `jam_transactions`에서 그 활동 id(200개씩)의 `reason = 'activity_settlement'` 줄의 `amount`를 더한다. 같은 활동은 한 번만
 * 정산되므로(`source_activity_id` 부분 유일 인덱스) 한 묶음의 줄 수는 200을 넘지 않는다. 정산되지 않은 활동은 줄이 없어 0이다.
 * (3) `reason = 'service_activity'`인 양수 줄 가운데 `created_at`이 기간 안인 `amount`를 더한다(`selectAllPages`). 소멸·채움·운영자 조정은 세지 않는다.
 *
 * `window`는 필수다 — 기간 없이 부르면 평생 합이 되어 참가 전에 모은 잼이 섞인다(이 키의 의미가 아니다).
 * 읽지 못하면 던진다(0으로 바꿔 돌려주면 «모은 양이 0»과 «세지 못함»이 구분되지 않는다) — `checkMissions`가 그 미션만 건너뛴다.
 */
export async function readJamEarnedWithin(supabase: SupabaseClient, userId: string, window: MetricWindow): Promise<number> {
  const activityRows = await selectAllPages<{ id: string }>(TAG, '기간 안 활동', (from, to) =>
    applyMetricWindow(
      // 걸러진 활동은 정산되지 않아 원장에 줄이 없다 — 인정된 활동만 읽어 읽는 행 수를 줄인다(티켓 20261017_1459)
      supabase.from('strava_activities').select('id').eq('user_id', userId).is('filter_reason', null),
      'start_date',
      window
    )
      .order('id')
      .range(from, to)
  )
  const activityIds = activityRows.map((row) => row.id)

  let total = 0
  for (let i = 0; i < activityIds.length; i += IN_CHUNK_SIZE) {
    const chunk = activityIds.slice(i, i + IN_CHUNK_SIZE)
    const { data, error } = await supabase
      .from('jam_transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('reason', 'activity_settlement')
      .in('source_activity_id', chunk)
    if (error) throwQueryError('활동 정산 잼', error)
    for (const row of (data ?? []) as { amount: number | string }[]) {
      const amount = Number(row.amount)
      if (!Number.isFinite(amount)) throw new Error(`[${TAG}] 활동 정산 잼의 양을 숫자로 읽지 못했다 (userId: ${userId})`)
      total += amount
    }
  }

  // 서비스 활동 잼 — 활동 시작 시각이 없고 일어난 시각에 바로 지급되므로 지급 시각(created_at)이 곧 활동 시각이다.
  // 소멸(capsule_forfeit)·채움·운영자 조정은 reason이 달라 들지 않고, 양수 줄만 센다.
  const serviceRows = await selectAllPages<{ amount: number | string }>(TAG, '기간 안 서비스 활동 잼', (from, to) =>
    applyMetricWindow(
      supabase.from('jam_transactions').select('amount').eq('user_id', userId).eq('reason', 'service_activity').gt('amount', 0),
      'created_at',
      window
    )
      .order('id')
      .range(from, to)
  )
  for (const row of serviceRows) {
    const amount = Number(row.amount)
    if (!Number.isFinite(amount)) throw new Error(`[${TAG}] 서비스 활동 잼의 양을 숫자로 읽지 못했다 (userId: ${userId})`)
    total += amount
  }
  return total
}
