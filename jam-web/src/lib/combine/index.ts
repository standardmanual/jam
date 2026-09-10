/**
 * 아이템 믹스 로직 v3 (서버 사이드 전용) — 티켓 20260910_1408
 *
 * 두 갈래로 단순화했다.
 *  1) 레시피 정확 매칭 → 레시피가 지정한 보상(포인트 + 배지 전부)을 **확정 지급**.
 *  2) 미매칭 → 배지를 전혀 지급하지 않고 정책의 고정 포인트(`fail_reward_points`)만 지급.
 *
 * 매칭 성립 = (유저가 투입한 아이템 배지 집합 == ingredient_badge_ids, 순서 무관 완전 일치)
 *            AND (required_badge_ids의 모든 배지를 유저가 보유)
 *
 * 폐기된 것(v2까지 있던 것): 트라이브 다양성 티어 확률 경로(경로 B), 피티 확률 보정·계단식
 * 포인트, `success_rate`. 경로 B는 아이템 배지 보유 트라이브가 2종뿐인 실제 카탈로그에서
 * "소재 트라이브 제외" 후보가 0종이 되는 인센티브 역전을 일으켰다.
 *
 * 재료로 투입한 아이템 개체는 성공/실패 무관하게 항상 소각된다. 보유 조건 배지
 * (액티비티·체크인)는 소각되지 않는다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import { awardPoints } from '@/lib/points'
import { getCombinePolicy } from '@/lib/combine/policy'
import type { CombinationRecipeRow, CombineFailReason, InventoryItemRow } from '@/types/database'
import type { Database } from '@/types/database.generated'

/**
 * `inventory_items.serial_number`는 NOT NULL인데 DEFAULT가 없어(migrations/034) 생성 타입이
 * Insert 필수 컬럼으로 잡지만, 실제 값은 BEFORE INSERT 트리거 `assign_random_serial()`
 * (migrations/108)이 채운다. 이 한 컬럼만 `Omit`으로 떼어내고 나머지 컬럼은 이름·타입 검사를
 * 그대로 받게 둔다 — 억제(`@ts-expect-error`)로 덮으면 컬럼명 오타까지 같이 통과한다
 * (티켓 20260831_1213).
 */
type InventoryItemInsert = Database['public']['Tables']['inventory_items']['Insert']
type InventoryItemInsertByTrigger = Omit<InventoryItemInsert, 'serial_number'>

type ServiceClient = ReturnType<typeof createServiceClient>

export type CombineResult =
  | {
      success: true
      path: 'recipe'
      resultBadges: { id: string; name: string; rarity: string }[]
      pointsAwarded: number
    }
  | {
      success: false
      reason: CombineFailReason
      pointsAwarded: number
    }

const MIN_ITEMS = 2
const MAX_ITEMS = 10

export async function combineItems(userId: string, itemIds: string[]): Promise<CombineResult> {
  if (itemIds.length < MIN_ITEMS || itemIds.length > MAX_ITEMS || new Set(itemIds).size !== itemIds.length) {
    // 재료를 특정할 수 없는 단계라 소각·포인트 없이 이력만 남긴다.
    const supabase = createServiceClient()
    await logFailure(supabase, userId, [], 'invalid_count', 0)
    return { success: false, reason: 'invalid_count', pointsAwarded: 0 }
  }

  const supabase = createServiceClient()

  // 1. 인벤토리 조회
  const { data: invRaw } = await supabase
    .from('inventory')
    .select('id')
    .eq('user_id', userId)
    .single()

  const inventory = invRaw as { id: string } | null
  if (!inventory) {
    await logFailure(supabase, userId, [], 'items_not_found', 0)
    return { success: false, reason: 'items_not_found', pointsAwarded: 0 }
  }

  // 2. 해당 아이템들이 실제로 이 유저 소유인지 확인
  // 아이템북에 슬롯됐거나 이미 드랍된 아이템은 재료로 쓸 수 없음(둘 다 걸리면 조회에서
  // 빠져 아래 items.length 불일치로 자연스럽게 items_not_found 처리됨)
  const { data: itemsRaw } = await supabase
    .from('inventory_items')
    .select('id, badge_id')
    .eq('inventory_id', inventory.id)
    .in('id', itemIds)
    .is('slotted_in', null)
    .is('dropped_at', null)

  const items = (itemsRaw ?? []) as Pick<InventoryItemRow, 'id' | 'badge_id'>[]
  if (items.length !== itemIds.length) {
    await logFailure(supabase, userId, items.map((i) => i.badge_id), 'items_not_found', 0)
    return { success: false, reason: 'items_not_found', pointsAwarded: 0 }
  }

  const badgeIds = items.map((i) => i.badge_id)

  // 3. 레시피 정확 매칭 탐색 (순서 무관) — 재료가 일치해도 required_badge_ids(액티비티·체크인
  //    배지, 소각되지 않는 보유 조건)를 전부 보유해야 최종 매칭으로 인정한다.
  const { data: recipesRaw } = await supabase.from('combination_recipes').select('*')
  const recipes = (recipesRaw ?? []) as CombinationRecipeRow[]

  const ingredientMatches = recipes.filter((r) => sameBadgeSet(r.ingredient_badge_ids, badgeIds))

  let matched: CombinationRecipeRow | undefined
  for (const candidate of ingredientMatches) {
    if (await hasAllRequiredBadges(supabase, userId, candidate.required_badge_ids ?? [])) {
      matched = candidate
      break
    }
  }

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
    console.error('[combineItems] 아이템 소각 오류:', destroyError)
    await logFailure(supabase, userId, badgeIds, 'items_not_found', 0)
    return { success: false, reason: 'items_not_found', pointsAwarded: 0 }
  }

  if (!destroyedRows || destroyedRows.length !== itemIds.length) {
    console.error('[combineItems] 소각된 행 수 불일치 — 동시 믹스 시도로 판단, 처리 중단', {
      expected: itemIds.length,
      actual: destroyedRows?.length ?? 0,
      userId,
    })
    await logFailure(supabase, userId, badgeIds, 'items_not_found', 0)
    return { success: false, reason: 'items_not_found', pointsAwarded: 0 }
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
    console.error('[combineItems] Consume 이벤트 기록 오류:', consumeEventError)
  }

  // 5-a. 매칭 성공 — 지정 보상 확정 지급 (확률 없음)
  if (matched) {
    const resultBadges: { id: string; name: string; rarity: string }[] = []
    for (const badgeId of matched.reward_badge_ids ?? []) {
      const granted = await grantBadge(supabase, inventory.id, badgeId)
      if (granted) resultBadges.push(granted)
    }

    let pointsAwarded = 0
    if (matched.reward_points > 0) {
      const ok = await awardPoints(userId, matched.reward_points, 'combine_recipe_reward')
      if (ok) pointsAwarded = matched.reward_points
    }

    return { success: true, path: 'recipe', resultBadges, pointsAwarded }
  }

  // 5-b. 미매칭 — 배지 없이 고정 포인트만
  const policy = await getCombinePolicy()
  let pointsAwarded = 0
  if (policy.fail_reward_points > 0) {
    const ok = await awardPoints(userId, policy.fail_reward_points, 'combine_fail_reward')
    if (ok) pointsAwarded = policy.fail_reward_points
  }
  await logFailure(supabase, userId, badgeIds, 'no_recipe_match', pointsAwarded)
  return { success: false, reason: 'no_recipe_match', pointsAwarded }
}

/**
 * 순서 무관 완전 일치 — **배지 종류 집합**을 비교한다.
 *
 * 같은 배지를 2개 이상 요구하는 레시피(중복 재료)는 지원하지 않는 것이 확정 사양이다
 * (저장 단계 `normalizeRecipePayload()`의 중복 거부가 정본). 그래서 개수까지 세는
 * 다중집합 비교가 아니라 집합 비교로 판정한다.
 */
function sameBadgeSet(recipeIds: string[], inputBadgeIds: string[]): boolean {
  const recipeSet = new Set(recipeIds)
  const inputSet = new Set(inputBadgeIds)
  if (recipeSet.size !== inputSet.size) return false
  for (const id of recipeSet) {
    if (!inputSet.has(id)) return false
  }
  return true
}

/**
 * 보유 조건 검증 — 액티비티 배지는 `user_activity_badges`, 체크인 배지는
 * `user_checkin_badge_earns`에 기록된다. 어느 쪽에서든 발견되면 보유로 인정한다
 * (레시피가 배지 타입을 따로 저장하지 않으므로 두 테이블을 함께 조회한다).
 */
async function hasAllRequiredBadges(
  supabase: ServiceClient,
  userId: string,
  requiredBadgeIds: string[]
): Promise<boolean> {
  if (requiredBadgeIds.length === 0) return true

  const [{ data: activityRaw, error: activityError }, { data: checkinRaw, error: checkinError }] =
    await Promise.all([
      supabase.from('user_activity_badges').select('badge_id').eq('user_id', userId).in('badge_id', requiredBadgeIds),
      supabase.from('user_checkin_badge_earns').select('badge_id').eq('user_id', userId).in('badge_id', requiredBadgeIds),
    ])

  // fail-closed: 조회가 실패하면 "보유함"으로 오판하지 않는다(보상 오지급 방지).
  if (activityError || checkinError) {
    console.error('[combineItems] 보유 조건 배지 조회 실패 — 매칭을 보류합니다:', activityError ?? checkinError)
    return false
  }

  const owned = new Set<string>([
    ...((activityRaw ?? []) as { badge_id: string }[]).map((r) => r.badge_id),
    ...((checkinRaw ?? []) as { badge_id: string }[]).map((r) => r.badge_id),
  ])
  return requiredBadgeIds.every((id) => owned.has(id))
}

async function grantBadge(
  supabase: ServiceClient,
  inventoryId: string,
  badgeId: string
): Promise<{ id: string; name: string; rarity: string } | null> {
  // 지급 전에 배지 존재/삭제 여부를 먼저 확인한다 — INSERT를 먼저 하고 나중에
  // deleted_at 필터로 조회하면, 결과가 소프트 삭제 상태일 때 inventory_items 행은
  // 이미 커밋됐는데 API는 실패로 응답하는 지급-응답 불일치가 발생한다(017 게이트 리뷰
  // FAIL 사유). 삭제된 배지면 INSERT 자체를 생략해 "지급 안 함 = 실패 응답"을 일치시킨다.
  const { data: badgeRaw } = await supabase
    .from('badges')
    .select('id, name, rarity')
    .eq('id', badgeId)
    .is('deleted_at', null)
    .single()
  const badge = (badgeRaw as { id: string; name: string; rarity: string } | null) ?? null

  if (!badge) {
    console.error('[combineItems] 보상 배지가 삭제 상태라 지급을 생략함:', badgeId)
    return null
  }

  const q = supabase.from('inventory_items')
  const payload: InventoryItemInsertByTrigger = {
    inventory_id: inventoryId,
    badge_id: badgeId,
    obtained_by: 'system_event',
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }
  const { error: insertError } = await q.insert(payload as InventoryItemInsert)

  if (insertError) {
    console.error('[combineItems] 보상 아이템 추가 오류:', insertError)
    return null
  }

  return badge
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
  if (error) console.error('[combineItems] 실패 이력 기록 오류:', error)
}
