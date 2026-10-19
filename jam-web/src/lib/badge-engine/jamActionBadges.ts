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
 * 5. 호출 지점: 라우트는 `runJamActionEvaluation(userId, [키…])`(jamActionRoute.ts) — 믹스 `/api/combine`,
 *    드랍·픽업 라우트, 컬렉션 장착 `/api/itembooks/[id]/slot`(③의 `after()`), 캡슐 열기 `/api/capsule/open`·
 *    잠긴 개체 열기 `/api/inventory/items/[itemId]/open`(티켓 20261018_1815의 `after()`). 동기화는 `sync.ts`의
 *    `evaluateJamActionSafely`가 새 활동이 있을 때 `JAM_SYNC_TRIGGERS`, 없을 때 가입 경과일
 *    (`JAM_EMPTY_SYNC_TRIGGERS`)을 판정하고 획득 id를 결산에 합친다. 어느 호출 지점에 어떤 키를 넘기는지는
 *    `jamActionDropTriggers.ts`·`jamActionProgressTriggers.ts`가 정한다. 기존 유저 재평가 배치
 *    (`reevaluateCatalog.ts`, 티켓 20261001_0634)도 호출 지점이다 — 키 전부(`JAM_ACTION_CONDITION_KEYS`)를
 *    `options`(dryRun·silent·접두 `triggered_by`)와 함께 넘긴다. 열릴 예정 배지 미리보기(`previewUpcomingJamBadges`,
 *    티켓 20261001_2203)도 같은 배치 파일에서 dryRun과 5번째 인자 `candidateOptions`를 넘겨 부른다.
 *
 * ## 가입 경과일은 전용 분기다
 * `days_since_signup`은 보조 키(`signup_recent_active_days`, 선택)가 붙을 수 있어 «유저 단위로 한 번 계산한 숫자
 * 하나»를 모든 후보에 비교하는 `METRIC_COMPUTERS` 흐름에 맞지 않는다(`recipe_first_success`처럼 전용 분기).
 * 보조 키는 트리거가 아니라 후보를 거르는 조건이라 `JAM_ACTION_CONDITION_KEYS`가 아닌
 * `JAM_ACTION_MODIFIER_KEYS`에 둔다. `active_week_streak`도 보조 키(`active_week_min_days`)에 따라 후보마다 값이 달라 전용 분기다.
 * `jam_week_count`·`jam_week_streak`도 보조 키(`jam_week_min_earned`)에 따라 후보마다 값이 달라 전용 분기다(티켓 20261019_0542 2회).
 *
 * ⚠️ 이 파일은 `@/lib/strava/sync`도, `sync.ts`를 import하는 `jamActionRoute.ts`도 import하지 않는다 —
 * `sync.ts`가 이 파일을 import하므로 순환을 막기 위해서다. 알림 생성은 호출부(`jamActionRoute.ts`와 `sync.ts`)가 맡는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import type { BadgeRow } from '@/types/database'
import { issueQualifyingBadges, type IssueBadgeOptions, type UsageBadgeEarned } from './usageBadges'
import { JAM_ACTION_CONDITION_KEYS, JAM_ACTION_MODIFIER_KEYS, type JamActionConditionKey } from './jamActionKeys'
import {
  countCombineAttempts,
  countCombineFail,
  countCombineSuccess,
  fetchFirstSuccessRecipeIds,
} from './jamActionMetrics'
import {
  countDroppedItemPickedUpCount,
  countDroppedItems,
  countPickedUpByUsers,
  countPickedUpItems,
  countPickupFromUsers,
} from './jamActionDropMetrics'
import { countCollectionCompletions, countMissionCompletions } from './jamActionCompletionMetrics'
import {
  countCapsuleOpens,
  countCrossTribeCombineSuccess,
  countLockedItemOpens,
  countLockedItemPickups,
  countOtherTribeItemKinds,
} from './jamActionItemMetrics'
import {
  countJamWeeks,
  DEFAULT_JAM_WEEK_MIN_EARNED,
  fetchDailyEarnedRows,
  jamWeekStreak,
  readChapterReached,
  readJamTotalEarned,
  readJamWeeklyEarned,
} from './jamActionJamMetrics'
import { countCheckinSeasonYearCount, countNewCheckinBadgeCount } from './jamActionCheckinMetrics'
import {
  countDaysSinceSignup,
  countRecentActiveDays,
  countSameSpotCheckinDays,
  countWeeklyActiveDays,
} from './jamActionDayMetrics'
import {
  activeWeekStreak,
  countDistinctActivityTypeCount,
  countFullSeasonYearCount,
  countFullWeekCount,
  countReturnStreakWeeks,
  dayKeysOf,
  DEFAULT_ACTIVE_WEEK_MIN_DAYS,
  fetchRecognizedActivities,
} from './jamActionActivityMetrics'

// 이 파일이 판정하는 JAM! 행동 지표 키와 보조 키. 서버 모듈 없이 키만 필요한 순수 모듈(운영툴 예약 등록 핸들러)이 쓰도록
// 순수 파일 `jamActionKeys.ts`로 옮겼고(티켓 20261004_1756), 기존 호출부가 그대로 쓰도록 여기서 다시 내보낸다.
export { JAM_ACTION_CONDITION_KEYS, JAM_ACTION_MODIFIER_KEYS }
export type { JamActionConditionKey }

/**
 * 「유저 단위로 한 번 계산한 숫자 하나」를 모든 후보에 비교하는 수치형 지표.
 * `recipe_first_success`(후보마다 레시피가 다르다)와 `days_since_signup`·`active_week_streak`·`jam_week_count`·`jam_week_streak`(후보마다 보조 키가 다르다)은 전용 분기라 뺀다.
 */
export type JamActionMetric = Exclude<
  JamActionConditionKey,
  'recipe_first_success' | 'days_since_signup' | 'active_week_streak' | 'jam_week_count' | 'jam_week_streak'
>

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
  mission_complete_count: countMissionCompletions,
  collection_complete_count: countCollectionCompletions,
  weekly_active_days: countWeeklyActiveDays,
  same_spot_checkin_days: countSameSpotCheckinDays,
  capsule_open_count: countCapsuleOpens,
  locked_item_open_count: countLockedItemOpens,
  locked_item_pickup_count: countLockedItemPickups,
  other_tribe_item_kinds_count: countOtherTribeItemKinds,
  cross_tribe_combine_success_count: countCrossTribeCombineSuccess,
  jam_total_earned: readJamTotalEarned,
  jam_weekly_earned: readJamWeeklyEarned,
  chapter_reached: readChapterReached,
  return_streak_weeks: countReturnStreakWeeks,
  full_week_count: countFullWeekCount,
  full_season_year_count: countFullSeasonYearCount,
  distinct_activity_type_count: countDistinctActivityTypeCount,
  new_checkin_badge_count: countNewCheckinBadgeCount,
  checkin_season_year_count: countCheckinSeasonYearCount,
  dropped_item_picked_up_count: countDroppedItemPickedUpCount,
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

/** `evaluateJamActionBadges`의 후보 확장 옵션 — 열릴 예정 배지 미리보기 전용(티켓 20261001_2203). 의미는 함수 설명 참고 */
export interface JamActionCandidateOptions {
  includeUpcoming?: boolean
  extraCandidates?: readonly BadgeRow[]
  badgeIds?: readonly string[]
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
 *  ⑥ `days_since_signup`은 가입 경과일을 한 번 계산하고, 후보 중 보조 키(`signup_recent_active_days`)가 숫자인
 *     배지가 있을 때만 최근 30일 활동일을 한 번 더 계산한다. 보조 키가 있는 배지의 현재값은 최근 활동일이 보조 키
 *     이상일 때만 가입 경과일이고 아니면 0이다(발급되지 않는다). 어느 계산이든 던지면 이 분기 전체를 건너뛴다.
 *     `triggered_by` = `jam_action:days_since_signup`
 *
 * 이 함수는 조회 오류·계산 오류를 삼키지만 그 밖의 예기치 못한 예외까지 막지는 않는다 — 호출부
 * (`runJamActionEvaluation` 등)가 한 번 더 `try/catch`로 감싼다.
 *
 * `client`를 생략하면 새 service_role 클라이언트를 만든다.
 *
 * `options`는 `issueQualifyingBadges`에 그대로 넘긴다(수치형·`days_since_signup`·`recipe_first_success` 세 곳).
 * 생략하면 자연 발급과 같다. 재평가 배치만 쓴다(`dryRun`·`silent`·`triggeredByPrefix`, 티켓 20261001_0634).
 *
 * `candidateOptions`는 «열릴 예정 배지 미리보기» 전용이다(티켓 20261001_2203). 생략하면 위 설명 그대로
 * `valid_from`이 지났고 `valid_until`이 안 지난 배지만 후보다. 켜면 후보가 넓어지므로 **`options.dryRun`이 아니면 던진다**
 * (미래 배지를 실제로 발급하면 공개 전에 소급 지급된다).
 *  - `includeUpcoming`: `valid_from` 필터만 뺀다. `valid_until` 필터는 그대로 둔다
 *  - `extraCandidates`: DB에 아직 없는 배지 정의를 조회 결과에 합친다(같은 id면 이쪽이 이긴다). `valid_until`이 지난 정의는 뺀다
 *  - `badgeIds`: 값이 있으면 후보를 이 id들로 좁힌다(같은 이름·계열 배지의 등급·레벨 판정도 좁혀진 후보 안에서 한다)
 */
export async function evaluateJamActionBadges(
  userId: string,
  triggers: readonly JamActionTrigger[],
  client?: SupabaseClient,
  options?: IssueBadgeOptions,
  candidateOptions?: JamActionCandidateOptions
): Promise<UsageBadgeEarned[]> {
  const widensCandidates = Boolean(candidateOptions?.includeUpcoming) || (candidateOptions?.extraCandidates?.length ?? 0) > 0
  if (widensCandidates && !options?.dryRun) {
    throw new Error('includeUpcoming·extraCandidates는 dryRun에서만 쓸 수 있다 — 공개 전 배지를 실제로 발급할 수 없다')
  }

  const requested = [...new Set(triggers)]
  if (requested.length === 0) return []

  const supabase = client ?? createServiceClient()
  const now = new Date().toISOString()

  let query = supabase.from('badges').select('*').eq('type', 'activity').is('deleted_at', null)
  if (!candidateOptions?.includeUpcoming) query = query.or(`valid_from.is.null,valid_from.lte.${now}`)
  const { data: allBadgesRaw, error: badgesError } = await query.or(`valid_until.is.null,valid_until.gte.${now}`)

  if (badgesError) {
    console.error('[evaluateJamActionBadges] 배지 목록 조회 오류:', badgesError)
    return []
  }
  let allBadges = (allBadgesRaw as BadgeRow[] | null) ?? []

  const extras = (candidateOptions?.extraCandidates ?? []).filter((b) => !b.valid_until || Date.parse(b.valid_until) >= Date.parse(now))
  if (extras.length > 0) {
    const extraIds = new Set(extras.map((b) => b.id))
    allBadges = [...allBadges.filter((b) => !extraIds.has(b.id)), ...extras]
  }
  const onlyIds = candidateOptions?.badgeIds?.length ? new Set(candidateOptions.badgeIds) : null
  if (onlyIds) allBadges = allBadges.filter((b) => onlyIds.has(b.id))

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
          `evaluateJamActionBadges(metric: ${trigger})`,
          options
        )
        earned.push(...issued)
        continue
      }

      if (trigger === 'days_since_signup') {
        // 후보마다 보조 키가 다르므로 지표 하나로 비교할 수 없다 — 가입 경과일은 한 번만 계산한다
        const candidates = allBadges.filter((b) => typeof b.condition_json?.days_since_signup === 'number')
        if (candidates.length === 0) continue

        const recentActiveRequirementOf = (b: BadgeRow): number | null => {
          const required = b.condition_json?.signup_recent_active_days
          return typeof required === 'number' ? required : null
        }

        // 같은 판정 안에서 날짜 경계가 어긋나지 않도록 두 계산이 같은 시각을 본다
        const asOf = new Date()
        const daysSinceSignup = await countDaysSinceSignup(supabase, userId, asOf)
        const recentActiveDays = candidates.some((b) => recentActiveRequirementOf(b) !== null)
          ? await countRecentActiveDays(supabase, userId, asOf)
          : 0
        const issued = await issueQualifyingBadges(
          supabase,
          userId,
          candidates,
          (b) => b.condition_json?.days_since_signup as number,
          (b) => {
            const required = recentActiveRequirementOf(b)
            return required === null || recentActiveDays >= required ? daysSinceSignup : 0
          },
          () => 'jam_action:days_since_signup',
          'evaluateJamActionBadges(days_since_signup)',
          options
        )
        earned.push(...issued)
        continue
      }

      if (trigger === 'active_week_streak') {
        // 후보마다 «채운 주»의 기준(보조 키 `active_week_min_days`)이 다르므로 지표 하나로 비교할 수 없다 — 활동한 날은 한 번만 읽고
        // 기준값별로 연속 주 수를 한 번씩 계산한다
        const candidates = allBadges.filter((b) => typeof b.condition_json?.active_week_streak === 'number')
        if (candidates.length === 0) continue

        const minDaysOf = (b: BadgeRow): number => {
          const minDays = b.condition_json?.active_week_min_days
          return typeof minDays === 'number' ? minDays : DEFAULT_ACTIVE_WEEK_MIN_DAYS
        }
        const dayKeys = dayKeysOf(await fetchRecognizedActivities(supabase, userId))
        const streakByMinDays = new Map<number, number>()
        for (const b of candidates) {
          const minDays = minDaysOf(b)
          if (!streakByMinDays.has(minDays)) streakByMinDays.set(minDays, activeWeekStreak(dayKeys, minDays))
        }
        const issued = await issueQualifyingBadges(
          supabase,
          userId,
          candidates,
          (b) => b.condition_json?.active_week_streak as number,
          (b) => streakByMinDays.get(minDaysOf(b)) ?? 0,
          () => 'jam_action:active_week_streak',
          'evaluateJamActionBadges(active_week_streak)',
          options
        )
        earned.push(...issued)
        continue
      }

      if (trigger === 'jam_week_count' || trigger === 'jam_week_streak') {
        // 후보마다 «채운 주»의 기준(보조 키 `jam_week_min_earned`)이 다르므로 지표 하나로 비교할 수 없다 — 날짜별 모은 잼은 한 번만 읽고
        // 기준값별로 한 번씩 계산한다
        const candidates = allBadges.filter((b) => typeof b.condition_json?.[trigger] === 'number')
        if (candidates.length === 0) continue

        const minEarnedOf = (b: BadgeRow): number => {
          const minEarned = b.condition_json?.jam_week_min_earned
          return typeof minEarned === 'number' ? minEarned : DEFAULT_JAM_WEEK_MIN_EARNED
        }
        const compute = trigger === 'jam_week_count' ? countJamWeeks : jamWeekStreak
        const rows = await fetchDailyEarnedRows(supabase, userId)
        const valueByMinEarned = new Map<number, number>()
        for (const b of candidates) {
          const minEarned = minEarnedOf(b)
          if (!valueByMinEarned.has(minEarned)) valueByMinEarned.set(minEarned, compute(rows, minEarned))
        }
        const issued = await issueQualifyingBadges(
          supabase,
          userId,
          candidates,
          (b) => b.condition_json?.[trigger] as number,
          (b) => valueByMinEarned.get(minEarnedOf(b)) ?? 0,
          () => `jam_action:${trigger}`,
          `evaluateJamActionBadges(${trigger})`,
          options
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
        'evaluateJamActionBadges(recipe_first_success)',
        options
      )
      earned.push(...issued)
    } catch (error) {
      // 계산·발급이 던지면 그 지표만 건너뛴다 — 다른 지표와 원본 액션은 계속 진행한다
      console.error(`[evaluateJamActionBadges] ${trigger} 판정 실패 — 이 지표만 건너뜀 (userId: ${userId}):`, error)
    }
  }

  return earned
}
