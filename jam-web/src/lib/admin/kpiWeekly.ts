/**
 * 주간 집계 API `/api/admin/kpi/weekly` 계산 로직 (티켓 20260918_1150)
 *
 * GA4가 놓치는 운영 이상 4개를 DB 기준으로 집계한다(상위 티켓 20260918_1101 §4-7).
 * 응답에는 집계 숫자만 담고 닉네임·이메일·유저 ID 등 개인 식별 정보는 절대 넣지 않는다.
 *
 * 지표별 원천 데이터 정의 — 값이 있는 3개(+1 서브지표), 원천이 없어 null을 반환하는 1개:
 *
 * 1. 미션 달성자 수 — `user_mission_completions.completed_at`이 기간 안에 있는 행의
 *    `user_id` distinct count. (응답에는 개수만 담고 user_id 목록은 버린다)
 * 2. 배지 발급량 — `user_activity_badges.earned_at`이 기간 안에 있는 행의 개수.
 *    `earned_at`은 최초 발급 시각에 고정되고 이후 반복 획득(마이그레이션 132)이 갱신하지
 *    않는다(그 컬럼의 COMMENT 참고) — 그래서 "발급"의 정의와 정확히 일치한다.
 * 2-1. 배지 중복 발급 건수 — **원천 데이터 없음, null 반환**. `user_activity_badges`는
 *    `UNIQUE(user_id, badge_id)`(마이그레이션 001·130)로 동일 배지 재발급이 DB 레벨에서
 *    구조적으로 불가능하고, 반복 획득은 같은 행의 `earn_count`만 올릴 뿐 "그 증가는
 *    발급이 아니다"(마이그레이션 132 COMMENT ON COLUMN 원문). 체크인 배지
 *    (`user_checkin_badge_earns`)는 같은 POI 재방문마다 새 행이 쌓이지만 이는 설계된
 *    반복 지급이지 "중복(오류)"이 아니라서 같은 지표로 셀 수 없다. 추측 대신 null +
 *    사유를 반환한다.
 * 3. Strava 동기화 실패 건수 — `strava_sync_failures.occurred_at`이 기간 안에 있는 행의
 *    개수(티켓 20260918_1307). `syncStravaActivities()`가 토큰 갱신 실패·Strava API 오류·
 *    레이트리밋으로 실패할 때마다 이 테이블에 기록한다. 응답에는 개수만 담고 user_id는
 *    버린다(상위 티켓 §4-6). `failure_type='drop_attempt_failed'`(동기화는 끝났지만 드랍
 *    시도가 실패한 행)는 이 건수에서 뺀다 — 동기화 실패로 보이지 않게 한다(티켓 20261014_1319).
 * 3-1. 드랍 시도 실패 건수 — 같은 테이블에서 `failure_type='drop_attempt_failed'`인 행의
 *    개수(티켓 20261014_1319). 같은 `occurred_at` 기간 조건이고 user_id는 버린다. 이 유형의
 *    행이 아직 없으면 0이다.
 * 4. 앰비언트 드랍 만료 건수 — **원천 데이터 없음, null 반환**. 앰비언트(시스템) 드랍은
 *    설계상 만료가 없다 — `poi_drops.source='system'`인 행은 `expires_at`이 항상 NULL로
 *    강제된다(`ambient-drop/index.ts` 주석 "만료 없음 (poi_drops.expires_at = NULL,
 *    poi_drops_source_consistency CHECK로 강제)"). `expire_stale_poi_drops()` cron은
 *    `expires_at IS NOT NULL`인 행만 골라 만료시키므로 system 소스 행은 절대 걸리지
 *    않는다 — 즉 이 지표를 0으로 반환하면 "이번 주 앰비언트 만료가 없었다"로 오독되지만
 *    실제로는 "이 기능 자체가 만료를 만들지 않는다"는 뜻이라 null로 구분한다.
 * 5. 믹스 포인트 지급(티켓 20260924_1455) — `point_transactions.created_at`이 기간 안인 행 중
 *    `reason='combine_fail_reward'`(미매칭 실패 포인트)와 `'combine_recipe_reward'`(레시피
 *    성공 포인트)를 사유별로 건수·`amount` 합계로 센다. 재료 1개만 넣어도 미매칭 소각 +
 *    실패 포인트가 지급되는 파밍 규모를 보기 위한 지표다(`SERVICE_OPERATIONS.md` §8-1).
 *    유저 id는 읽지도 담지도 않는다.
 * 6. 믹스 레시피 결과물 배지 유효성 — `combination_recipes.reward_badge_ids`가 가리키는 배지
 *    중 `badges` 행이 없거나 `deleted_at`이 있는 것이 하나라도 있는 레시피 수. 기간과
 *    무관한 현재 상태 스냅샷이다. 레시피 id 목록은 응답에 담지 않고 개수만 담는다.
 */
import { createServiceClient } from '@/lib/supabase/server'

export const DEFAULT_KPI_WEEKLY_DAYS = 7
const MIN_DAYS = 1
const MAX_DAYS = 90

export interface KpiWeeklyRange {
  days: number
  startIso: string
  endIso: string
}

/**
 * 조회 기간을 계산한다 — `days`는 쿼리 파라미터로 덮어쓸 수 있다(완료 조건이 요구한
 * "쿼리 파라미터로 바꿀 수 있다").
 *
 * `end`는 호출 시각(now), `start`는 정확히 `days*24시간` 전이다 — 절대 시각(epoch) 차만
 * 빼므로 타임존과 무관하게 항상 같은 결과가 나온다("지난 N일"의 가장 단순하고 모호함 없는
 * 정의). 자정 정렬(캘린더 day-boundary)이 필요한 다른 KST 로직(`lib/notifications/kst.ts`)과
 * 달리, 이 지표는 "그 시각 기준 최근 N일 롤링 윈도"면 충분하다 — 매 호출 시각이 곧
 * 리포트 생성 시각이기 때문이다.
 */
export function resolveKpiWeeklyRange(
  daysParam: string | null | undefined,
  now: Date = new Date()
): KpiWeeklyRange {
  const parsed = daysParam ? Number.parseInt(daysParam, 10) : DEFAULT_KPI_WEEKLY_DAYS
  const days =
    Number.isFinite(parsed) && parsed >= MIN_DAYS && parsed <= MAX_DAYS ? parsed : DEFAULT_KPI_WEEKLY_DAYS

  const endIso = now.toISOString()
  const startIso = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
  return { days, startIso, endIso }
}

export interface KpiWeeklyMetrics {
  range: KpiWeeklyRange
  missionAchievers: { value: number; definition: string }
  badgeIssuance: {
    issued: { value: number; definition: string }
    duplicate: { value: null; reason: string }
  }
  stravaSyncFailures: { value: number; definition: string }
  dropAttemptFailures: { value: number; definition: string }
  ambientDropExpired: { value: null; reason: string }
  combinePoints: {
    fail: { count: number; totalPoints: number; definition: string }
    recipe: { count: number; totalPoints: number; definition: string }
  }
  combineRecipeRewardBadges: {
    totalRecipes: number
    invalidRecipes: number
    definition: string
  }
}

const LEDGER_PAGE_SIZE = 1000

/** 동기화 중 드랍 시도가 실패한 행의 `strava_sync_failures.failure_type` 값 — 동기화 실패 건수에서 빼고 따로 센다. */
const DROP_ATTEMPT_FAILED = 'drop_attempt_failed'

const DEFINITIONS = {
  missionAchievers:
    'user_mission_completions.completed_at이 기간 안인 행의 user_id distinct 개수',
  badgeIssued: 'user_activity_badges.earned_at이 기간 안인 행 개수(최초 발급 시각 고정)',
  badgeDuplicateReason:
    "원천 데이터 없음 — user_activity_badges는 UNIQUE(user_id, badge_id)로 재발급이 구조적으로 불가능하고, 반복 획득(earn_count 증가)은 '발급'이 아니다(마이그레이션 132).",
  stravaSyncFailures:
    'strava_sync_failures.occurred_at이 기간 안인 행 개수(토큰 갱신 실패·Strava API 오류·레이트리밋 합산, 드랍 시도 실패는 제외)',
  dropAttemptFailures:
    "strava_sync_failures.occurred_at이 기간 안이고 failure_type='drop_attempt_failed'인 행 개수(동기화 중 드랍 시도가 실패한 건수, 동기화 실패 건수에는 세지 않음)",
  ambientDropExpiredReason:
    "원천 데이터 없음 — source='system' 드랍은 설계상 expires_at이 항상 NULL이라(만료 없음) 만료 집계 대상 행 자체가 없다.",
  combinePointsFail:
    "point_transactions.reason='combine_fail_reward'이고 created_at이 기간 안인 행의 건수와 amount 합계(레시피 미매칭 실패 포인트)",
  combinePointsRecipe:
    "point_transactions.reason='combine_recipe_reward'이고 created_at이 기간 안인 행의 건수와 amount 합계(레시피 매칭 성공 포인트)",
  combineRecipeRewardBadges:
    'combination_recipes.reward_badge_ids 중 badges 행이 없거나 deleted_at이 있는 배지를 하나라도 가진 레시피 수(현재 시점 스냅샷, 기간 무관)',
} as const

type LedgerRow = { reason: string; amount: number }

/** 믹스 포인트 원장 행을 기간 안에서 전부 읽는다 — PostgREST 행 상한(1000)을 넘겨도 잘리지 않게 페이지로 읽는다. */
async function fetchCombineLedgerRows(
  supabase: ReturnType<typeof createServiceClient>,
  range: KpiWeeklyRange
): Promise<LedgerRow[]> {
  const rows: LedgerRow[] = []
  for (let from = 0; ; from += LEDGER_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('point_transactions')
      .select('reason, amount')
      .in('reason', ['combine_fail_reward', 'combine_recipe_reward'])
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + LEDGER_PAGE_SIZE - 1)
    if (error) throw error
    const page = (data ?? []) as LedgerRow[]
    rows.push(...page)
    if (page.length < LEDGER_PAGE_SIZE) return rows
  }
}

/** 결과물 배지가 삭제됐거나 없는 레시피 수를 센다. */
async function countRecipesWithInvalidRewardBadges(
  supabase: ReturnType<typeof createServiceClient>
): Promise<{ totalRecipes: number; invalidRecipes: number }> {
  const { data: recipes, error } = await supabase
    .from('combination_recipes')
    .select('reward_badge_ids')
  if (error) throw error
  const recipeList = recipes ?? []

  const badgeIds = [...new Set(recipeList.flatMap((r) => r.reward_badge_ids ?? []))]
  if (badgeIds.length === 0) return { totalRecipes: recipeList.length, invalidRecipes: 0 }

  const { data: badges, error: badgeError } = await supabase
    .from('badges')
    .select('id')
    .in('id', badgeIds)
    .is('deleted_at', null)
  if (badgeError) throw badgeError

  const validIds = new Set((badges ?? []).map((b) => b.id))
  const invalidRecipes = recipeList.filter((r) =>
    (r.reward_badge_ids ?? []).some((id) => !validIds.has(id))
  ).length
  return { totalRecipes: recipeList.length, invalidRecipes }
}

/** 지표를 집계한다. 공용 프로덕션 DB이므로 읽기 쿼리만 쓴다. */
export async function computeKpiWeeklyMetrics(range: KpiWeeklyRange): Promise<KpiWeeklyMetrics> {
  const supabase = createServiceClient()

  const [
    missionRows,
    badgeCount,
    stravaSyncFailureCount,
    dropAttemptFailureCount,
    ledgerRows,
    recipeRewardBadges,
  ] = await Promise.all([
    supabase
      .from('user_mission_completions')
      .select('user_id')
      .gte('completed_at', range.startIso)
      .lt('completed_at', range.endIso),
    supabase
      .from('user_activity_badges')
      .select('id', { count: 'exact', head: true })
      .gte('earned_at', range.startIso)
      .lt('earned_at', range.endIso),
    supabase
      .from('strava_sync_failures')
      .select('id', { count: 'exact', head: true })
      .gte('occurred_at', range.startIso)
      .lt('occurred_at', range.endIso)
      .neq('failure_type', DROP_ATTEMPT_FAILED),
    supabase
      .from('strava_sync_failures')
      .select('id', { count: 'exact', head: true })
      .gte('occurred_at', range.startIso)
      .lt('occurred_at', range.endIso)
      .eq('failure_type', DROP_ATTEMPT_FAILED),
    fetchCombineLedgerRows(supabase, range),
    countRecipesWithInvalidRewardBadges(supabase),
  ])

  if (missionRows.error) throw missionRows.error
  if (badgeCount.error) throw badgeCount.error
  if (stravaSyncFailureCount.error) throw stravaSyncFailureCount.error
  if (dropAttemptFailureCount.error) throw dropAttemptFailureCount.error

  const sumByReason = (reason: string) => {
    const matched = ledgerRows.filter((r) => r.reason === reason)
    return { count: matched.length, totalPoints: matched.reduce((sum, r) => sum + r.amount, 0) }
  }

  const distinctAchievers = new Set((missionRows.data ?? []).map((r) => r.user_id)).size

  return {
    range,
    missionAchievers: { value: distinctAchievers, definition: DEFINITIONS.missionAchievers },
    badgeIssuance: {
      issued: { value: badgeCount.count ?? 0, definition: DEFINITIONS.badgeIssued },
      duplicate: { value: null, reason: DEFINITIONS.badgeDuplicateReason },
    },
    stravaSyncFailures: {
      value: stravaSyncFailureCount.count ?? 0,
      definition: DEFINITIONS.stravaSyncFailures,
    },
    dropAttemptFailures: {
      value: dropAttemptFailureCount.count ?? 0,
      definition: DEFINITIONS.dropAttemptFailures,
    },
    ambientDropExpired: { value: null, reason: DEFINITIONS.ambientDropExpiredReason },
    combinePoints: {
      fail: { ...sumByReason('combine_fail_reward'), definition: DEFINITIONS.combinePointsFail },
      recipe: { ...sumByReason('combine_recipe_reward'), definition: DEFINITIONS.combinePointsRecipe },
    },
    combineRecipeRewardBadges: {
      ...recipeRewardBadges,
      definition: DEFINITIONS.combineRecipeRewardBadges,
    },
  }
}
