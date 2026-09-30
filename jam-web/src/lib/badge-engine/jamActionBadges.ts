/**
 * JAM! 행동 지표 배지 판정·발급 — 공용 틀 (서버 사이드 전용, 티켓 20261001_0631, 상위 20260930_1456)
 *
 * 믹스 시도·성공·실패와 레시피 최초 성공처럼 «유저가 JAM!에서 한 행동»으로 배지를 판정·발급한다.
 * `usageBadges.ts`(팔로워·동기화·체크인 보유)와 같은 자리다 — 조건 키는 `conditionRegistry.ts`에
 * `role: 'meta'` + `evaluation: 'external'`로 선언돼 있어 메인 엔진(`evaluateConditionDetailed`)은
 * 이 조건들을 항상 fail 처리하고, 실제 판정·발급은 이 파일이 전담한다. 발급 정책(등급형 최상위 1개·
 * 레벨형 연속 발급·섀도우밴·포인트·피드)은 `usageBadges.ts`의 `issueQualifyingBadges`를 그대로 쓴다.
 *
 * ## 지표를 더하는 법 (②·③ 하위 티켓)
 * 1. `conditionRegistry.ts`에 `field({...})` 1개 (수치형은 `daily_sync_count` 복사)
 * 2. 이 파일의 `JAM_ACTION_CONDITION_KEYS`·`JamActionMetric`에 키 1개, `METRIC_COMPUTERS`에 계산 함수 1개
 *    (`Record<JamActionMetric, …>`라 계산 함수를 빠뜨리면 컴파일 오류다)
 * 3. `jamActionMetrics.ts`(또는 별도 파일)에 계산 함수 1개
 * 4. CHECK 키 확장 마이그레이션 1개(199 복사), `types/database.ts`·`conditionFormFields.ts`
 * 5. 호출 지점: 라우트는 `runJamActionEvaluation(userId, [키…])`(jamActionRoute.ts), 동기화는
 *    `evaluateJamActionBadges`를 직접 부르고 획득을 합친다.
 *
 * ⚠️ 이 파일은 `@/lib/strava/sync`를 import하지 않는다 — 동기화 경로(`sync.ts`)가 이 파일을 import하므로
 * 순환을 막기 위해서다. 알림 생성은 호출부(`jamActionRoute.ts`)가 맡는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import type { BadgeRow } from '@/types/database'
import { issueQualifyingBadges, type UsageBadgeEarned } from './usageBadges'
import {
  countCombineAttempts,
  countCombineFail,
  countCombineSuccess,
  fetchFirstSuccessRecipeIds,
} from './jamActionMetrics'
import {
  countDroppedItems,
  countPickedUpByUsers,
  countPickedUpItems,
  countPickupFromUsers,
} from './jamActionDropMetrics'

/** 이 파일이 판정하는 JAM! 행동 지표 키 — `conditionRegistry.ts` 선언과 1:1 대응 */
export const JAM_ACTION_CONDITION_KEYS = [
  'combine_attempt_count',
  'combine_success_count',
  'combine_fail_count',
  'recipe_first_success',
  // 드랍·픽업 4종 (티켓 20261001_0632)
  'drop_item_count',
  'pickup_item_count',
  'pickup_from_user_count',
  'picked_up_by_user_count',
] as const

export type JamActionConditionKey = (typeof JAM_ACTION_CONDITION_KEYS)[number]

/** 「유저 단위로 한 번 계산한 숫자 하나」를 모든 후보에 비교하는 수치형 지표 (`recipe_first_success` 제외) */
export type JamActionMetric = Exclude<JamActionConditionKey, 'recipe_first_success'>

/** 호출부가 「이번 행동으로 다시 볼 지표」로 넘기는 키 */
export type JamActionTrigger = JamActionConditionKey

type MetricComputer = (supabase: SupabaseClient, userId: string) => Promise<number>

/**
 * 수치형 지표별 현재값 계산. `Record<JamActionMetric, …>`라 키를 더하고 계산 함수를 빠뜨리면 컴파일 오류다.
 * 계산 함수는 **오류를 던진다** — 던지면 그 지표만 건너뛴다(fail-closed).
 */
const METRIC_COMPUTERS: Record<JamActionMetric, MetricComputer> = {
  combine_attempt_count: countCombineAttempts,
  combine_success_count: countCombineSuccess,
  combine_fail_count: countCombineFail,
  drop_item_count: countDroppedItems,
  pickup_item_count: countPickedUpItems,
  pickup_from_user_count: countPickupFromUsers,
  picked_up_by_user_count: countPickedUpByUsers,
}

function isRecipeFirstSuccessValue(v: unknown): v is { recipe_id: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { recipe_id?: unknown }).recipe_id === 'string' &&
    (v as { recipe_id: string }).recipe_id.length > 0
  )
}

function isMetricTrigger(trigger: JamActionTrigger): trigger is JamActionMetric {
  return trigger in METRIC_COMPUTERS
}

/**
 * 요청한 지표(`triggers`)를 조건으로 가진 배지를 조회해 판정하고, 조건을 채운 배지를 발급한다
 * (`user_activity_badges` insert + `point_reward` 지급 + `badge_earned` 피드 이벤트).
 *
 *  ① `badges` 후보를 한 번 조회한다. 조회 오류는 예외 없이 `[]`(로그만)
 *  ② 요청한 지표 키를 가진 후보만 남긴다. 없으면 **값 계산 없이** `[]`
 *  ③ 지표별로 현재값을 계산한다. 계산이 던지면 그 지표만 건너뛴다(fail-closed)
 *  ④ 수치형은 `issueQualifyingBadges`로 발급한다(`triggered_by` = `jam_action:${metric}`)
 *  ⑤ `recipe_first_success`는 내가 최초 성공자인 레시피 집합으로 현재값 1/0을 만든다
 *     (상태 기반이라 여러 번 불러도 같은 결과 — 재실행해도 멱등). `triggered_by` = `recipe_first_success:${recipe_id}`
 *
 * 이 함수는 조회 오류·계산 오류를 삼키지만 그 밖의 예기치 못한 예외까지 막지는 않는다 — 호출부
 * (`runJamActionEvaluation` 등)가 한 번 더 `try/catch`로 감싼다.
 *
 * `client`를 생략하면 새 service_role 클라이언트를 만든다.
 */
export async function evaluateJamActionBadges(
  userId: string,
  triggers: readonly JamActionTrigger[],
  client?: SupabaseClient
): Promise<UsageBadgeEarned[]> {
  const requested = [...new Set(triggers)]
  if (requested.length === 0) return []

  const supabase = client ?? createServiceClient()
  const now = new Date().toISOString()

  const { data: allBadgesRaw, error: badgesError } = await supabase
    .from('badges')
    .select('*')
    .eq('type', 'activity')
    .is('deleted_at', null)
    .or(`valid_from.is.null,valid_from.lte.${now}`)
    .or(`valid_until.is.null,valid_until.gte.${now}`)

  if (badgesError) {
    console.error('[evaluateJamActionBadges] 배지 목록 조회 오류:', badgesError)
    return []
  }
  const allBadges = (allBadgesRaw as BadgeRow[] | null) ?? []

  const earned: UsageBadgeEarned[] = []

  for (const trigger of requested) {
    try {
      if (isMetricTrigger(trigger)) {
        const candidates = allBadges.filter((b) => typeof b.condition_json?.[trigger] === 'number')
        if (candidates.length === 0) continue

        const currentValue = await METRIC_COMPUTERS[trigger](supabase, userId)
        const issued = await issueQualifyingBadges(
          supabase,
          userId,
          candidates,
          (b) => b.condition_json?.[trigger] as number,
          () => currentValue,
          () => `jam_action:${trigger}`,
          `evaluateJamActionBadges(metric: ${trigger})`
        )
        earned.push(...issued)
        continue
      }

      // recipe_first_success — 후보마다 자기 레시피를 가리키므로 지표 하나로 비교할 수 없다
      const candidates = allBadges.filter((b) => isRecipeFirstSuccessValue(b.condition_json?.recipe_first_success))
      if (candidates.length === 0) continue

      const recipeIdOf = (b: BadgeRow): string => (b.condition_json!.recipe_first_success as { recipe_id: string }).recipe_id
      const firstRecipeIds = await fetchFirstSuccessRecipeIds(supabase, userId, [...new Set(candidates.map(recipeIdOf))])
      const issued = await issueQualifyingBadges(
        supabase,
        userId,
        candidates,
        () => 1,
        (b) => (firstRecipeIds.has(recipeIdOf(b)) ? 1 : 0),
        (b) => `recipe_first_success:${recipeIdOf(b)}`,
        'evaluateJamActionBadges(recipe_first_success)'
      )
      earned.push(...issued)
    } catch (error) {
      // 계산·발급이 던지면 그 지표만 건너뛴다 — 다른 지표와 원본 액션은 계속 진행한다
      console.error(`[evaluateJamActionBadges] ${trigger} 판정 실패 — 이 지표만 건너뜀 (userId: ${userId}):`, error)
    }
  }

  return earned
}
