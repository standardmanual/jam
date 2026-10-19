/**
 * 미션 DB 기록 조건의 지표 읽기 (서버 사이드 전용, 티켓 20261019_1445 1·2회)
 *
 * `engine_condition` 미션의 조건 가운데 활동 기록이 아니라 **DB 행**을 세는 키 19개
 * (`ENGINE_DELEGATED_DB_CONDITION_KEY_LIST`: 믹스·드랍·픽업·미션/컬렉션 완료·캡슐 열기·잠긴 개체·트라이브를 넘는 믹스 +
 * 2회의 날짜·체크인 5개)를 «참가한 뒤, 미션 기간 안»의 값으로 읽어 `{ 키: 값 }`을 돌려준다. 비교는 순수 함수 `evaluateEngineMissionCondition`이
 * 한다 — 이 파일은 읽기만 한다.
 *
 * ## 기간
 * 하한은 참가 시각과 미션 시작 가운데 늦은 쪽, 상한은 미션 종료다(둘 다 포함). 경계 계산은 활동 선택과 같은
 * `lib/missions/window.ts`의 `missionWindowIsoBounds`다. 읽기 함수(`lib/badge-engine/jamAction*Metrics.ts`)에 선택 인자
 * `window`로 넘겨 DB가 시각으로 거른다.
 *
 * ## 읽지 못하면 던진다
 * 지표 읽기 함수의 규약(`jamActionMetrics.ts` 머리 주석)과 같다 — DB 오류를 0으로 바꿔 돌려주면 «센 값이 0»과 «세지 못함»이
 * 구분되지 않는다. 던진 오류는 `checkMissions`가 받아 **그 미션만 건너뛴다**(0으로 폴백해 미완료로 판정하지도, 완료로 판정하지도 않는다).
 * 하한을 정할 수 없을 때(참가·시작 시각이 둘 다 해석되지 않을 때)도 던진다 — 하한 없이 읽으면 평생값이 섞여 참가 전의 기록이 세어진다.
 *
 * ## 값 모양
 * 모든 값은 숫자다. `recipe_first_success`만 «지정한 레시피를 기간 안에 처음 성공했는가»를 1/0으로 돌려준다
 * (배지 엔진이 같은 키를 1/0로 비교하는 것과 같다, `jamActionBadges.ts`).
 * 객체 값을 가진 `checkin_category_count`(`{ category, count }`)·`checkin_badge_count`(`{ checkin_badge_names, count }`)는
 * «지정한 장소 종류·이름 목록에 든 배지가 몇 개인가»를 숫자로 돌려주고, `count`와의 비교는 `engineCondition.ts`가 한다.
 * 값 모양이 틀린 조건은 읽지 않고 0을 돌려준다 — 비교 쪽도 모양이 틀리면 충족하지 못하므로 결과가 같다.
 *
 * ## 날짜·체크인 키 (2회)
 *  - `weekly_active_days`·`same_spot_checkin_days`: 기간 밖 활동·체크인은 세지 않는다. 기간 경계의 주는 잘린 대로 센다.
 *  - `new_checkin_badge_count`·`checkin_category_count`·`checkin_badge_count`: 전체 이력으로 배지별 처음 받은 시각을 정한 뒤
 *    그 시각이 기간 안인 배지만 센다 — 기간 전에 받은 배지를 기간 안에 다시 받아도 새 배지로 세지 않는다.
 *
 * ## 미션별 지연 조회
 * 루프 앞에서 한꺼번에 읽지 않고 미션마다 그 미션의 기간으로 읽는다 — 기간이 미션마다 다르고, 같은 동기화에서 먼저 완료된 미션이
 * 뒤 미션의 `mission_complete_count`에 잡혀야 하기 때문이다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MissionCondition } from '@/types/database'
import {
  countCombineAttempts,
  countCombineFail,
  countCombineSuccess,
  fetchFirstSuccessRecipeIds,
} from '@/lib/badge-engine/jamActionMetrics'
import {
  countDroppedItems,
  countPickedUpByUsers,
  countPickedUpItems,
  countPickupFromUsers,
} from '@/lib/badge-engine/jamActionDropMetrics'
import { countCollectionCompletions, countMissionCompletions } from '@/lib/badge-engine/jamActionCompletionMetrics'
import {
  countCheckinCategoryBadges,
  countCheckinListedBadges,
  countNewCheckinBadgeCount,
} from '@/lib/badge-engine/jamActionCheckinMetrics'
import { countSameSpotCheckinDays, countWeeklyActiveDays } from '@/lib/badge-engine/jamActionDayMetrics'
import { isCheckinBadgeCountValue, isCheckinCategoryCountValue } from '@/lib/badge-engine/checkinHoldings'
import {
  countCapsuleOpens,
  countCrossTribeCombineSuccess,
  countLockedItemOpens,
  countLockedItemPickups,
} from '@/lib/badge-engine/jamActionItemMetrics'
import type { MetricWindow } from '@/lib/badge-engine/jamActionWindow'
import { dbConditionKeysIn, type EngineDelegatedDbConditionKey } from '@/lib/missions/condition-keys'
import { missionWindowIsoBounds, type MissionWindow } from '@/lib/missions/window'

/** 조건에 든 DB 키의 현재값. 조건에 없는 키는 들어 있지 않다 */
export type MissionDbMetrics = Partial<Record<EngineDelegatedDbConditionKey, number>>

type MetricReader = (
  supabase: SupabaseClient,
  userId: string,
  window: MetricWindow,
  condition: MissionCondition
) => Promise<number>

/**
 * 키별 읽기. `Record<EngineDelegatedDbConditionKey, …>`라 키를 더하고 읽기를 빠뜨리면 컴파일 오류다.
 * 읽기 함수는 DB 오류를 던진다.
 */
const READERS: Record<EngineDelegatedDbConditionKey, MetricReader> = {
  combine_attempt_count: (s, u, w) => countCombineAttempts(s, u, w),
  combine_success_count: (s, u, w) => countCombineSuccess(s, u, w),
  combine_fail_count: (s, u, w) => countCombineFail(s, u, w),
  recipe_first_success: async (s, u, w, condition) => {
    const recipeId = condition.recipe_first_success?.recipe_id
    // 레시피를 가리키지 않는 값은 «처음 성공했는가»를 물을 수 없다 — 0이면 비교 쪽에서 충족하지 못한다
    if (typeof recipeId !== 'string' || recipeId === '') return 0
    const firstIds = await fetchFirstSuccessRecipeIds(s, u, [recipeId], w)
    return firstIds.has(recipeId) ? 1 : 0
  },
  drop_item_count: (s, u, w) => countDroppedItems(s, u, w),
  pickup_item_count: (s, u, w) => countPickedUpItems(s, u, w),
  pickup_from_user_count: (s, u, w) => countPickupFromUsers(s, u, w),
  picked_up_by_user_count: (s, u, w) => countPickedUpByUsers(s, u, w),
  mission_complete_count: (s, u, w) => countMissionCompletions(s, u, w),
  collection_complete_count: (s, u, w) => countCollectionCompletions(s, u, w),
  capsule_open_count: (s, u, w) => countCapsuleOpens(s, u, w),
  locked_item_open_count: (s, u, w) => countLockedItemOpens(s, u, w),
  locked_item_pickup_count: (s, u, w) => countLockedItemPickups(s, u, w),
  cross_tribe_combine_success_count: (s, u, w) => countCrossTribeCombineSuccess(s, u, w),
  // ── 날짜·체크인 5개 (2회) ──
  weekly_active_days: (s, u, w) => countWeeklyActiveDays(s, u, w),
  same_spot_checkin_days: (s, u, w) => countSameSpotCheckinDays(s, u, w),
  new_checkin_badge_count: (s, u, w) => countNewCheckinBadgeCount(s, u, w),
  checkin_category_count: async (s, u, w, condition) => {
    const value = condition.checkin_category_count
    // 장소 종류를 가리키지 않는 값은 «그 종류의 배지가 몇 개인가»를 물을 수 없다 — 0이면 비교 쪽에서도 충족하지 못한다
    if (!isCheckinCategoryCountValue(value)) return 0
    return countCheckinCategoryBadges(s, u, value.category, w)
  },
  checkin_badge_count: async (s, u, w, condition) => {
    const value = condition.checkin_badge_count
    if (!isCheckinBadgeCountValue(value)) return 0
    // 문자열이 아닌 이름은 어떤 배지와도 맞지 않는다 — 이름 조회에 섞여 조회가 깨지지 않게 먼저 거른다
    const names = value.checkin_badge_names.filter((name): name is string => typeof name === 'string')
    return countCheckinListedBadges(s, u, names, w)
  },
}

/**
 * 조건에 든 DB 키만 «참가한 뒤, 미션 기간 안»의 값으로 읽는다. DB 키가 없으면 아무것도 읽지 않고 빈 객체를 돌려준다.
 * 읽지 못하면 던진다 — 호출자(`checkMissions`)가 그 미션만 건너뛴다.
 */
export async function loadMissionDbMetrics(
  supabase: SupabaseClient,
  userId: string,
  condition: MissionCondition,
  window: MissionWindow
): Promise<MissionDbMetrics> {
  const keys = dbConditionKeysIn(condition)
  const metrics: MissionDbMetrics = {}
  if (keys.length === 0) return metrics

  const { fromIso, toIso } = missionWindowIsoBounds(window)
  if (fromIso === null) {
    throw new Error(
      '[loadMissionDbMetrics] 미션 기간의 시작 시각을 정하지 못해 DB 기록 조건을 읽지 않았어요. ' +
        '참가 시각(joined_at)과 미션 시작(starts_at)이 둘 다 시각으로 해석되지 않기 때문이에요. ' +
        '하한 없이 읽으면 참가 전의 기록이 섞여서 세어져요. 미션의 starts_at과 참가 기록의 joined_at 값을 확인해 주세요.'
    )
  }
  const metricWindow: MetricWindow = { fromIso, toIso }

  const values = await Promise.all(keys.map((key) => READERS[key](supabase, userId, metricWindow, condition)))
  keys.forEach((key, i) => {
    metrics[key] = values[i]
  })
  return metrics
}
