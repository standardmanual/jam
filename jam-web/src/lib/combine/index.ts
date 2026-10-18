/**
 * 아이템 믹스 로직 v5 — 레시피 선택형 단일 검증 (서버 사이드 전용) — 티켓 20260917_1427
 *
 * 두 갈래 구조는 그대로 유지한다.
 *  1) 레시피 매칭 → 레시피가 지정한 보상(포인트 + 배지 전부)을 **확정 지급**.
 *  2) 미매칭 → 배지를 전혀 지급하지 않고 정책의 고정 포인트(`fail_reward_points`)만 지급.
 *
 * 매칭 성립(슬롯 기반) = 레시피의 모든 슬롯에 대해,
 *  - badge_type = 'item'  : 유저가 투입한 아이템 배지 중 allowed_badge_ids에 속하는 것이
 *                           정확히 1개 대응(슬롯당 서로 다른 배지 인스턴스, 여분 투입 불허)
 *  - badge_type = 'activity'|'checkin' : 유저가 보유한 배지 중 allowed_badge_ids에 속하는
 *                           것이 1개 이상 존재(보유만 확인, 소각 없음)
 *  하나라도 대응/보유 실패 시 그 레시피는 미매칭.
 *
 * v4(같은 티켓 앞 단계, 어드민 슬롯 재설계)까지는 유저가 투입한 아이템만 받아 **공개·
 * 비공개 레시피 전체를 순회**하며 매칭되는 첫 레시피를 채택했다. 이 방식은 OR 매칭
 * 도입으로 한 유저의 투입이 여러 레시피 조건을 동시에 만족할 수 있게 되면서 "배열 순회
 * 순서로 우선순위가 갈리는" medium-confidence 문제를 안고 있었다(게이트 리뷰 지적).
 *
 * v5(유저 화면 레시피 선택형 플로우)는 유저가 공개 레시피 목록에서 먼저 하나를 선택하고,
 * 서버는 `combineRecipeAttempt()`로 **선택된 레시피 하나만** 검증한다 — 전체 스캔이
 * 사라지므로 우선순위 문제 자체가 발생하지 않는다. `matchesRecipeSlots()`는 이미 슬롯
 * ↔ 투입 아이템의 최적 대응을 백트래킹으로 찾으므로, 클라이언트가 슬롯별 배지 인스턴스를
 * 지정해 보내지 않고 투입 아이템 id 목록만 보내도 매칭 판정은 동일하게 성립한다(슬롯 id
 * 매핑은 UI 표시 편의를 위한 것일 뿐 서버 판정에 필요하지 않다).
 *
 * 이전(v3, 티켓 20260910_1408)의 "정확 집합 일치" 방식을 완전히 대체한다 — 슬롯당 후보
 * 1개로 표현하면 기존 레시피와 동등하므로 하위 호환 손실 없음.
 *
 * 재료로 투입한 아이템 개체는 성공/실패 무관하게 항상 소각된다. 보유 조건 배지
 * (액티비티·체크인)는 소각되지 않는다.
 *
 * 공개 기간(마이그레이션 204·213, 티켓 20261001_1157·20261002_0710): 공개 시각이 아직 지나지 않았거나
 * 종료 시각이 지난 레시피는 존재하지 않는 레시피와 똑같이 처리한다 — 0단계에서 `recipe_not_found`로
 * 거절하며, 재료 소각·포인트 지급은 일어나지 않는다. 판정은 `lib/combine/visibility.ts`의
 * `recipeReleaseState` 하나다. 종료된 레시피로 이미 받은 보상은 그대로다.
 *
 * 운영자 시험 믹스(티켓 20261001_1159): 호출부가 `allowUnreleased: true`를 넘기면(운영자) 공개 전
 * 레시피도 믹스할 수 있다. 이때만 결과를 «시험 믹스»(`testMix: true`)로 본다 — 재료 소각·인벤토리
 * 칸 반환·Consume 이벤트·보상 배지·포인트 지급은 실제와 똑같이 처리하고, 성공·실패 기록
 * (`user_combine_success_logs`·`user_combine_fail_logs`)과 JAM! 믹스 지표 판정은 남기지 않는다.
 * 공개 시각이 지난 레시피는 `allowUnreleased`여도 일반 믹스다(기록이 정상으로 남는다).
 * 종료된 레시피는 `allowUnreleased`여도 거절한다 — 시험 믹스는 «공개 전 확인»이 목적이다(티켓 20261002_0710 G7).
 *
 * JAM 2.0 믹스 고치기(티켓 20261018_0055, 운영 로직 8.4절·마이그레이션 236):
 *  - 믹스 칸은 최대 5칸(`MAX_ITEMS`)이다.
 *  - 이용 정지 중이면 `UserSuspendedError`를 던지고(라우트가 403), 받지 않은 결과가 남아 있으면 소각 전에
 *    `pending_results_exist`로 거절한다(라우트가 409). 둘 다 재료·포인트·실패 기록이 없다.
 *  - 결과 아이템 배지의 공개 기간이 끝난 레시피는 소각 전에 `recipe_not_found`로 거절한다(`hasEndedResultBadge`).
 *  - 결과 지급은 `combine_grant_results` 한 번이다. 빈칸이 모자라면 DB가 결과 전부를 받지 않은 결과로 남기고(재료는 소모됨)
 *    `resultStatus: 'pending'`으로 알린다. 결과에는 기한이 없고 잠김은 레시피(`reward_locked`)와 배지(`always_locked`)가 정한다.
 *    앱은 빈칸을 세지 않는다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import { awardPoints } from '@/lib/points'
import { getCombinePolicy } from '@/lib/combine/policy'
import { getPendingCount } from '@/lib/combine/pending'
import { hasEndedResultBadge, recipeReleaseState } from '@/lib/combine/visibility'
import { assertNotSuspended } from '@/lib/suspension/suspension'
import type { JamActionTrigger } from '@/lib/badge-engine/jamActionBadges'
import type { ReleaseInventorySlotsResult } from '@/lib/inventory/slots'
import type {
  CombinationRecipeRow,
  CombinationRecipeSlotRow,
  CombineFailReason,
  InventoryItemRow,
} from '@/types/database'

type ServiceClient = ReturnType<typeof createServiceClient>

export type CombineResult =
  | {
      success: true
      path: 'recipe'
      /**
       * 지급된 결과 배지. 잠긴 채 나온 것은 `locked: true`이고 `id`·`name`을 빈 문자열로 가린다(운영 로직 7.3절).
       * 받지 않은 결과(`resultStatus: 'pending'`)와 지급할 결과가 없는 경우는 빈 배열이다.
       */
      resultBadges: { id: string; name: string; rarity: string; locked?: true }[]
      pointsAwarded: number
      /** 결과 지급 상태 — `granted`(인벤토리에 지급), `pending`(빈칸이 모자라 받지 않은 결과로 남김), `none`(지급한 결과 없음) */
      resultStatus: 'granted' | 'pending' | 'none'
      /** `pending`일 때 받지 않은 결과 개수(= 받으려면 필요한 빈칸 수) */
      pendingCount?: number
      /** `pending`일 때 믹스 시점의 인벤토리 빈칸 수 */
      freeSlots?: number
      /** 레시피가 보상 없음(포인트 0, 보상 배지 없음)으로 정해져 있다 — 빈손이어도 이상 상황이 아니다 */
      noReward?: true
      /** 공개 전 레시피를 운영자가 믹스한 시험 믹스 — 기록·지표에 남지 않는다. 일반 믹스에는 키가 없다. */
      testMix?: true
    }
  | {
      success: false
      reason: CombineFailReason
      pointsAwarded: number
      /** 공개 전 레시피를 운영자가 믹스한 시험 믹스 — 기록·지표에 남지 않는다. 일반 믹스에는 키가 없다. */
      testMix?: true
    }

/** 믹스 칸 상한 — 운영 로직 8.6절의 코드 상수(티켓 20261018_0055) */
export const MAX_ITEMS = 5

/** `combineRecipeAttempt()` 호출 옵션 */
export interface CombineAttemptOptions {
  /** 공개 전 레시피도 믹스를 허용한다(운영자 전용). 허용된 공개 전 믹스는 시험 믹스가 된다. */
  allowUnreleased?: boolean
}

/**
 * `combineRecipeAttempt()` 실행 중 갱신되는 `inventory.used_slots` 캐시 카운터의 로컬 사본.
 * 소각·지급이 일어날 때마다 이 값을 갱신하며 DB에도 함께 반영한다(20260912_2101).
 */
type InventorySlotState = { id: string; used_slots: number; max_slots: number }

/**
 * 유저가 선택한 레시피 하나만 검증한다(티켓 20260917_1427) — 이전 `combineItems()`처럼
 * 전체 레시피를 스캔하지 않는다. `itemIds`는 유저가 인벤토리에서 골라 슬롯에 채운 아이템
 * 배지 개체 id 목록이다(아이템 슬롯 개수만큼, 액티비티·체크인 슬롯은 보유 여부만 서버가
 * 직접 조회하므로 별도 입력이 필요 없다).
 */
export async function combineRecipeAttempt(
  userId: string,
  recipeId: string,
  itemIds: string[],
  options: CombineAttemptOptions = {}
): Promise<CombineResult> {
  if (
    typeof recipeId !== 'string' ||
    !recipeId ||
    !Array.isArray(itemIds) ||
    itemIds.length > MAX_ITEMS ||
    new Set(itemIds).size !== itemIds.length
  ) {
    // 재료를 특정할 수 없는 단계라 소각·포인트 없이 이력만 남긴다.
    const supabase = createServiceClient()
    await logFailure(supabase, userId, [], 'invalid_count', 0)
    return { success: false, reason: 'invalid_count', pointsAwarded: 0 }
  }

  const supabase = createServiceClient()

  // 소각 앞의 두 관문(티켓 20261018_0055) — 둘 다 재료·포인트·실패 기록 없이 끝난다.
  // 이용 정지 중이면 던지고(라우트가 403), 읽지 못해도 던진다(정지 유저가 조회 실패 틈에 믹스하면 안 된다).
  await assertNotSuspended(supabase, userId)
  // 받지 않은 결과가 있으면 새 믹스를 막는다(운영 로직 8.4·6.4절). 결과를 받아야 새 재료를 쓸 수 있다.
  if ((await getPendingCount(supabase, userId)) > 0) {
    return { success: false, reason: 'pending_results_exist', pointsAwarded: 0 }
  }

  // 0. 선택된 레시피 존재·공개 확인 — 여기서부터는 이 레시피 하나만 검증 대상이다.
  // 공개 전·종료된 레시피는 없는 레시피와 같다(재료 소각보다 반드시 앞에서 거절한다). 운영자
  // (`allowUnreleased`)만 공개 전(`scheduled`) 레시피를 통과한다. 종료된(`ended`) 레시피는 운영자도
  // 거절한다(티켓 20261002_0710 G7).
  const { data: recipeRaw } = await supabase
    .from('combination_recipes')
    .select('*')
    .eq('id', recipeId)
    .maybeSingle()
  const recipe = recipeRaw as CombinationRecipeRow | null
  const releaseState = recipe ? recipeReleaseState(recipe) : null
  const released = releaseState === 'released'
  if (!recipe || !(released || (releaseState === 'scheduled' && options.allowUnreleased))) {
    await logFailure(supabase, userId, [], 'recipe_not_found', 0)
    return { success: false, reason: 'recipe_not_found', pointsAwarded: 0 }
  }

  // 결과 아이템 배지의 공개 기간이 끝난 레시피는 없는 레시피와 같다(티켓 20261018_0055, 운영 로직 8.4절) — 재료만 잃는 일을
  // 막으려고 소각 앞에서 거절한다. 운영자(`allowUnreleased`)도 같다. 조회가 실패하면 닫는다(fail-closed).
  // 같은 조회 결과를 아래 결과 지급 뒤 응답용 이름·등급·잠김에도 쓴다.
  const rewardBadgeIds = recipe.reward_badge_ids ?? []
  let rewardBadges: RewardBadgeInfo[] = []
  if (rewardBadgeIds.length > 0) {
    const { data: rewardBadgesRaw, error: rewardBadgesError } = await supabase
      .from('badges')
      .select('id, name, rarity, always_locked, valid_until')
      .in('id', rewardBadgeIds)
      .is('deleted_at', null)
    if (rewardBadgesError) {
      console.error('[combineRecipeAttempt] 결과 배지 조회 실패 — 레시피를 쓸 수 없는 것으로 처리:', rewardBadgesError)
      await logFailure(supabase, userId, [], 'recipe_not_found', 0)
      return { success: false, reason: 'recipe_not_found', pointsAwarded: 0 }
    }
    rewardBadges = (Array.isArray(rewardBadgesRaw) ? rewardBadgesRaw : []) as RewardBadgeInfo[]
    if (hasEndedResultBadge(rewardBadgeIds, rewardBadges)) {
      await logFailure(supabase, userId, [], 'recipe_not_found', 0)
      return { success: false, reason: 'recipe_not_found', pointsAwarded: 0 }
    }
  }

  // 여기까지 왔는데 공개 전이면 운영자의 시험 믹스다. 이후 결과는 전부 `testMix`를 달고 나가며,
  // 실패 이력(`recordFailure`)과 성공 기록(`recordCombineSuccess`)은 남기지 않는다.
  const testMix = !released
  const withTestMix = <T extends CombineResult>(result: T): T => (testMix ? { ...result, testMix: true } : result)
  const recordFailure = (ingredientBadgeIds: string[], failReason: CombineFailReason, pointsAwarded: number) =>
    testMix ? Promise.resolve() : logFailure(supabase, userId, ingredientBadgeIds, failReason, pointsAwarded)

  const { data: slotsRaw } = await supabase
    .from('combination_recipe_slots')
    .select('*')
    .eq('recipe_id', recipe.id)
    .order('slot_order', { ascending: true })
  const recipeSlots = (slotsRaw ?? []) as CombinationRecipeSlotRow[]

  // 1. 인벤토리 조회 — used_slots/max_slots도 함께 가져와 소각·지급 시 카운터 증감에 쓴다
  const { data: invRaw } = await supabase
    .from('inventory')
    .select('id, used_slots, max_slots')
    .eq('user_id', userId)
    .single()

  const inventory = invRaw as InventorySlotState | null
  if (!inventory) {
    await recordFailure([], 'items_not_found', 0)
    return withTestMix({ success: false, reason: 'items_not_found', pointsAwarded: 0 })
  }

  // 2. 해당 아이템들이 실제로 이 유저 소유인지 확인
  // 아이템북에 슬롯됐거나 이미 드랍된 아이템은 재료로 쓸 수 없음(둘 다 걸리면 조회에서
  // 빠져 아래 items.length 불일치로 자연스럽게 items_not_found 처리됨)
  const { data: itemsRaw } = await supabase
    .from('inventory_items')
    .select('id, badge_id, locked')
    .eq('inventory_id', inventory.id)
    .in('id', itemIds)
    .is('slotted_in', null)
    .is('dropped_at', null)

  const items = (itemsRaw ?? []) as (Pick<InventoryItemRow, 'id' | 'badge_id'> & { locked?: boolean | null })[]
  if (items.length !== itemIds.length) {
    await recordFailure(items.map((i) => i.badge_id), 'items_not_found', 0)
    return withTestMix({ success: false, reason: 'items_not_found', pointsAwarded: 0 })
  }

  // 잠긴 개체는 재료로 쓸 수 없다(티켓 20261018_0051, 운영 로직 7.2절). 소각보다 앞에서 거절하므로 재료는 그대로 남고,
  // 소각이 일어나지 않은 거절이라 실패 이력·포인트·JAM! 지표(`jamTriggersForCombineResult`)를 남기지 않는다.
  if (items.some((i) => i.locked === true)) {
    return withTestMix({ success: false, reason: 'locked_item_not_allowed', pointsAwarded: 0 })
  }

  const badgeIds = items.map((i) => i.badge_id)

  // 3. 선택된 레시피의 슬롯 충족 여부만 판정한다(전체 레시피 스캔 없음).
  const matched = (await matchesRecipeSlots(supabase, userId, recipeSlots, badgeIds)) ? recipe : undefined

  // 4. 원본 아이템 소각 — 성공/실패 무관 항상 소각
  // 20260829_2101: 개체 파괴 방식이 소프트 삭제로 확정됐다(하드 삭제하면 CustodyEvent
  // 이력이 고아가 된다) — DELETE 대신 destroyed_at을 세운다. 레이스 판정 방식은 동일한
  // 원리를 유지한다: `.is('destroyed_at', null)`로 필터한 UPDATE는 Postgres가 행 단위로
  // 원자 처리하므로, 동일 재료로 믹스 API를 동시에 2회 호출해도 먼저 커밋된 요청만
  // itemIds 전체를 파괴하고 뒤늦은 요청은 이미 destroyed_at이 찍힌 행이라 매치되지 않는다.
  // 개수가 요청한 itemIds와 다르면 레이스로 판단해 보상 지급 없이 중단한다.
  // inventory_id도 함께 비운다 — 코드베이스 전반의 "owned = inventory_id IS NOT NULL"
  // 조회 관례가 destroyed_at을 모르는 채로도 파괴된 개체를 자동으로 걸러내게 하기 위함
  // (migrations/108 주석 참고).
  const destroyedAt = new Date().toISOString()
  const { data: destroyedRows, error: destroyError } = await supabase
    .from('inventory_items')
    .update({ destroyed_at: destroyedAt, inventory_id: null })
    .in('id', itemIds)
    .eq('inventory_id', inventory.id)
    .is('destroyed_at', null)
    .select('id')

  if (destroyError) {
    console.error('[combineRecipeAttempt] 아이템 소각 오류:', destroyError)
    await recordFailure(badgeIds, 'items_not_found', 0)
    return withTestMix({ success: false, reason: 'items_not_found', pointsAwarded: 0 })
  }

  if (!destroyedRows || destroyedRows.length !== itemIds.length) {
    console.error('[combineRecipeAttempt] 소각된 행 수 불일치 — 동시 믹스 시도로 판단, 처리 중단', {
      expected: itemIds.length,
      actual: destroyedRows?.length ?? 0,
      userId,
    })
    await recordFailure(badgeIds, 'items_not_found', 0)
    return withTestMix({ success: false, reason: 'items_not_found', pointsAwarded: 0 })
  }

  // used_slots 감소 — 소각한 재료 개수만큼 인벤토리 칸을 반환한다(20260912_2101).
  // release_inventory_slots() RPC(마이그레이션 173, 티켓 20260914_1813)가 inventory 행을
  // 잠근 채로 감소시키므로, 아래 grantBadge()의 지급 증가와 같은 인벤토리 행을 두고
  // 서로 다른 시점에 read-then-write하던 레이스가 사라진다. 클램프(GREATEST(0, ...))는
  // RPC 내부에서 처리한다.
  const { data: releaseRpcResult, error: releaseRpcError } = await supabase.rpc('release_inventory_slots', {
    p_inventory_id: inventory.id,
    p_count: destroyedRows.length,
  })
  if (releaseRpcError) {
    console.error('[combineRecipeAttempt] release_inventory_slots RPC 오류:', releaseRpcError)
  } else {
    const releaseResult = releaseRpcResult as ReleaseInventorySlotsResult
    if (releaseResult.ok) {
      inventory.used_slots = releaseResult.usedSlots
    } else {
      console.error('[combineRecipeAttempt] release_inventory_slots 실패:', releaseResult.reason)
    }
  }

  // Consume 이벤트 — actor 유저명을 스냅샷으로 기록한다(라이브 조인 의존 금지).
  const { data: actorRaw } = await supabase.from('users').select('username').eq('id', userId).maybeSingle()
  const actorUsername = (actorRaw as { username: string } | null)?.username ?? null
  const consumeEventsQuery = supabase.from('custody_events')
  const consumeEventsPayload = itemIds.map((id) => ({
    inventory_item_id: id,
    event_type: 'Consume' as const,
    actor_user_id: userId,
    actor_username: actorUsername,
  }))
  const { error: consumeEventError } = await consumeEventsQuery.insert(consumeEventsPayload)
  if (consumeEventError) {
    console.error('[combineRecipeAttempt] Consume 이벤트 기록 오류:', consumeEventError)
  }

  // 5-a. 매칭 성공 — 지정 보상 확정 지급 (확률 없음)
  if (matched) {
    // 결과 지급은 `combine_grant_results` 한 번이다(마이그레이션 236). 빈칸이 결과 개수 이상이면 모두 기한 없이 지급하고,
    // 모자라면 일부만 주지 않고 전부 받지 않은 결과로 남긴다. 잠김은 레시피(`reward_locked`)와 배지(`always_locked`)가 정한다.
    // 앱은 빈칸을 세지 않는다 — 소각으로 칸이 반환된 뒤의 값은 DB가 인벤토리 행을 잠그고 읽는다.
    const grant = await grantResults(supabase, userId, matched, rewardBadgeIds, rewardBadges)

    let pointsAwarded = 0
    if (matched.reward_points > 0) {
      const ok = await awardPoints(userId, matched.reward_points, 'combine_recipe_reward')
      if (ok) pointsAwarded = matched.reward_points
    }

    // 성공 기록 — 보상·포인트 지급이 끝난 뒤에 남긴다(재료 소각·보상 지급 순서는 그대로).
    // 빈손 성공(보상 배지가 하나도 지급되지 않은 경우)도 성공 1건이다. 기록이 실패해도
    // 응답과 보상은 그대로다(티켓 20261001_0631, 믹스 행동 지표). 시험 믹스는 기록하지 않는다 —
    // 남기면 운영자가 공개 전에 먼저 성공해 실제 첫 성공 유저의 «레시피 최초 성공» 몫을 가로챈다
    // (티켓 20261001_1159).
    if (!testMix) {
      await recordCombineSuccess(
        supabase,
        userId,
        matched.id,
        badgeIds,
        grant.recordedBadgeIds,
        pointsAwarded
      )
    }

    const noReward = rewardBadgeIds.length === 0 && matched.reward_points <= 0
    return withTestMix({
      success: true,
      path: 'recipe',
      resultBadges: grant.resultBadges,
      pointsAwarded,
      resultStatus: grant.status,
      ...(grant.status === 'pending' ? { pendingCount: grant.pendingCount, freeSlots: grant.freeSlots } : {}),
      ...(noReward ? { noReward: true as const } : {}),
    })
  }

  // 5-b. 미매칭 — 배지 없이 고정 포인트만
  const policy = await getCombinePolicy()
  let pointsAwarded = 0
  if (policy.fail_reward_points > 0) {
    const ok = await awardPoints(userId, policy.fail_reward_points, 'combine_fail_reward')
    if (ok) pointsAwarded = policy.fail_reward_points
  }
  await recordFailure(badgeIds, 'no_recipe_match', pointsAwarded)
  return withTestMix({ success: false, reason: 'no_recipe_match', pointsAwarded })
}

/**
 * 레시피 슬롯 전체 충족 여부를 판정한다.
 *  - 아이템 슬롯: 투입한 아이템 배지 개수와 아이템 슬롯 개수가 정확히 같아야 하고, 각
 *    슬롯이 서로 다른 아이템 인스턴스에 1:1 대응돼야 한다(여분 투입 불허, 중복 대응 불허).
 *  - 액티비티·체크인 슬롯: 후보(OR) 중 하나라도 보유하면 충족(소각 없음).
 */
async function matchesRecipeSlots(
  supabase: ServiceClient,
  userId: string,
  slots: CombinationRecipeSlotRow[],
  inputBadgeIds: string[]
): Promise<boolean> {
  const itemSlots = slots.filter((s) => s.badge_type === 'item')
  const conditionSlots = slots.filter((s) => s.badge_type !== 'item')

  if (inputBadgeIds.length !== itemSlots.length) return false
  if (!findItemSlotAssignment(itemSlots, inputBadgeIds)) return false

  if (conditionSlots.length === 0) return true

  const allowedUnion = [...new Set(conditionSlots.flatMap((s) => s.allowed_badge_ids))]
  const owned = await getOwnedConditionBadgeIds(supabase, userId, allowedUnion)
  if (owned === null) return false // fail-closed: 조회 실패 시 매칭 보류

  return conditionSlots.every((slot) => slot.allowed_badge_ids.some((id) => owned.has(id)))
}

/**
 * 아이템 슬롯 ↔ 투입 아이템 배지의 1:1 대응을 찾는다(같은 배지 인스턴스가 여러 슬롯에
 * 중복 대응되지 않도록 백트래킹). 슬롯·아이템 모두 최대 10개라 지수 폭발 우려 없음.
 */
function findItemSlotAssignment(itemSlots: CombinationRecipeSlotRow[], inputBadgeIds: string[]): boolean {
  const used = new Array(inputBadgeIds.length).fill(false)

  function backtrack(slotIdx: number): boolean {
    if (slotIdx === itemSlots.length) return true
    const allowed = new Set(itemSlots[slotIdx].allowed_badge_ids)
    for (let i = 0; i < inputBadgeIds.length; i++) {
      if (used[i] || !allowed.has(inputBadgeIds[i])) continue
      used[i] = true
      if (backtrack(slotIdx + 1)) return true
      used[i] = false
    }
    return false
  }

  return backtrack(0)
}

/**
 * 보유 조건 배지 조회 — 액티비티 배지는 `user_activity_badges`, 체크인 배지는
 * `user_checkin_badge_earns`에 기록된다. 어느 쪽에서든 발견되면 보유로 인정한다
 * (조회 대상은 슬롯 타입과 무관하게 후보 id 전체로 넓혀 두 테이블을 함께 조회한다).
 * 조회 실패 시 `null`을 반환한다 — fail-closed(보상 오지급 방지).
 */
async function getOwnedConditionBadgeIds(
  supabase: ServiceClient,
  userId: string,
  candidateBadgeIds: string[]
): Promise<Set<string> | null> {
  if (candidateBadgeIds.length === 0) return new Set()

  const [{ data: activityRaw, error: activityError }, { data: checkinRaw, error: checkinError }] =
    await Promise.all([
      supabase.from('user_activity_badges').select('badge_id').eq('user_id', userId).in('badge_id', candidateBadgeIds),
      supabase.from('user_checkin_badge_earns').select('badge_id').eq('user_id', userId).in('badge_id', candidateBadgeIds),
    ])

  if (activityError || checkinError) {
    console.error('[combineRecipeAttempt] 보유 조건 배지 조회 실패 — 매칭을 보류합니다:', activityError ?? checkinError)
    return null
  }

  return new Set<string>([
    ...((activityRaw ?? []) as { badge_id: string }[]).map((r) => r.badge_id),
    ...((checkinRaw ?? []) as { badge_id: string }[]).map((r) => r.badge_id),
  ])
}

/** 결과 배지 조회 한 줄 — 응답용 이름·등급·잠김과 공개 기간 판정에 쓴다 */
interface RewardBadgeInfo {
  id: string
  name: string
  rarity: string
  always_locked?: boolean | null
  valid_until?: string | null
}

interface GrantResultsOutcome {
  status: 'granted' | 'pending' | 'none'
  resultBadges: { id: string; name: string; rarity: string; locked?: true }[]
  /** 성공 기록(`record_combine_success`)에 남길 결과 배지 id — 받지 않은 결과도 이번 믹스의 결과이므로 포함한다 */
  recordedBadgeIds: string[]
  pendingCount: number
  freeSlots: number
}

/**
 * 결과 배지를 `combine_grant_results` 한 번으로 지급한다(마이그레이션 236). 지급할 결과가 없으면 부르지 않는다.
 * RPC 오류·실패 응답이면 재료가 이미 소각된 뒤라 되돌릴 수 없으므로, 운영이 탐지할 수 있게 로그를 남기고 빈 결과로 이어 간다
 * (지금까지 «지급 실패 = 빈손 성공»과 같다). 삭제된 배지는 DB가 건너뛴다 — 응답도 조회된(삭제되지 않은) 배지만 싣는다.
 */
async function grantResults(
  supabase: ServiceClient,
  userId: string,
  recipe: CombinationRecipeRow,
  rewardBadgeIds: string[],
  rewardBadges: RewardBadgeInfo[]
): Promise<GrantResultsOutcome> {
  const empty: GrantResultsOutcome = { status: 'none', resultBadges: [], recordedBadgeIds: [], pendingCount: 0, freeSlots: 0 }
  if (rewardBadgeIds.length === 0) return empty

  const { data, error } = await supabase.rpc('combine_grant_results', {
    p_user_id: userId,
    p_recipe_id: recipe.id,
    p_badge_ids: rewardBadgeIds,
    p_locked: recipe.reward_locked === true,
  })
  const result = data as {
    ok?: boolean
    error?: string
    status?: string
    pendingCount?: number
    free?: number
  } | null
  if (error || !result || result.ok !== true) {
    console.error('[combineRecipeAttempt] combine_grant_results 실패 — 재료만 소각된 빈손 성공 발생:', {
      recipeId: recipe.id,
      rewardBadgeIds,
      userId,
      rpcError: error?.message ?? result?.error ?? 'unknown',
    })
    return empty
  }

  const badgeById = new Map(rewardBadges.map((b) => [b.id, b]))
  const grantable = rewardBadgeIds.map((id) => badgeById.get(id)).filter((b): b is RewardBadgeInfo => b !== undefined)

  if (result.status === 'pending') {
    return {
      status: 'pending',
      resultBadges: [],
      recordedBadgeIds: grantable.map((b) => b.id),
      pendingCount: Number(result.pendingCount ?? grantable.length),
      freeSlots: Number(result.free ?? 0),
    }
  }

  if (result.status === 'granted') {
    return {
      status: 'granted',
      resultBadges: grantable.map((b) =>
        recipe.reward_locked === true || b.always_locked === true
          ? { id: '', name: '', rarity: b.rarity, locked: true as const }
          : { id: b.id, name: b.name, rarity: b.rarity }
      ),
      recordedBadgeIds: grantable.map((b) => b.id),
      pendingCount: 0,
      freeSlots: 0,
    }
  }

  // status 'none' — 결과 배지가 전부 삭제돼 지급할 것이 없었다
  console.error('[combineRecipeAttempt] 레시피 보상 배지가 전부 지급되지 않음 — 재료만 소각된 빈손 성공 발생:', {
    recipeId: recipe.id,
    rewardBadgeIds,
    userId,
  })
  return empty
}

/** 실패 이력 적재 — 어드민 유저 상세에서만 조회한다(유저 화면 비노출). 실패해도 응답을 막지 않는다. */
async function logFailure(
  supabase: ServiceClient,
  userId: string,
  ingredientBadgeIds: string[],
  failReason: CombineFailReason,
  pointsAwarded: number
): Promise<void> {
  const q = supabase.from('user_combine_fail_logs')
  const { error } = await q.insert({
    user_id: userId,
    ingredient_badge_ids: ingredientBadgeIds,
    fail_reason: failReason,
    points_awarded: pointsAwarded,
  })
  if (error) console.error('[combineRecipeAttempt] 실패 이력 기록 오류:', error)
}

/**
 * 성공 이력 적재 — `record_combine_success` RPC(마이그레이션 200)가 성공 1행과 «레시피 최초 성공»
 * 표시를 원자적으로 만든다. 믹스 시도·성공 횟수와 `recipe_first_success` 배지 조건의 원천이다.
 * 오류·예외는 `console.error`로만 남기고 삼킨다 — 이미 재료가 소각되고 보상이 지급된 뒤라 기록
 * 실패가 믹스 응답을 바꾸면 안 된다.
 */
async function recordCombineSuccess(
  supabase: ServiceClient,
  userId: string,
  recipeId: string,
  ingredientBadgeIds: string[],
  resultBadgeIds: string[],
  pointsAwarded: number
): Promise<void> {
  try {
    const { error } = await supabase.rpc('record_combine_success', {
      p_user_id: userId,
      p_recipe_id: recipeId,
      p_ingredient_badge_ids: ingredientBadgeIds,
      p_result_badge_ids: resultBadgeIds,
      p_points_awarded: pointsAwarded,
    })
    if (error) console.error('[combineRecipeAttempt] 성공 이력 기록 오류:', error)
  } catch (error) {
    console.error('[combineRecipeAttempt] 성공 이력 기록 예외:', error)
  }
}

/**
 * 믹스 결과에 따라 JAM! 행동 지표 중 다시 판정할 것을 고른다 — `/api/combine` 라우트가 결과에 이어 부른다.
 *  - 성공: 시도·성공·레시피 최초 성공
 *  - `no_recipe_match`(재료가 소각된 실패): 시도·실패
 *  - 그 밖의 실패(`invalid_count`·`items_not_found`·`recipe_not_found`·`locked_item_not_allowed`·`pending_results_exist`)는 재료가 소각되기 전에 끝났으므로 판정하지 않는다
 *  - 시험 믹스(`testMix`)는 성공·실패와 관계없이 판정하지 않는다(티켓 20261001_1159)
 */
export function jamTriggersForCombineResult(result: CombineResult): JamActionTrigger[] {
  if (result.testMix) return []
  if (result.success) return ['combine_attempt_count', 'combine_success_count', 'recipe_first_success']
  if (result.reason === 'no_recipe_match') return ['combine_attempt_count', 'combine_fail_count']
  return []
}
