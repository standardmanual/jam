/**
 * 아이템 조합 로직 v2 (서버 사이드 전용)
 *
 * 두 갈래 경로:
 *  A) 정석 레시피(combination_recipes 재료 정확 일치) → 레전드/미스틱 확정.
 *     피티 확률 보정 미적용(레시피 발견 가치가 확률형 트랙보다 항상 우월해야 함).
 *  B) 비매칭 임의 조합 → 세계관 다양성 티어(policy.ts)에 따른 확률로
 *     "소재 세계관을 제외한 다른 세계관의 최하위 등급 배지 n개" 또는 실패.
 *     실패는 연속 실패 스트릭에 따라 성공 확률이 즉시 미세 상승(피티)하고,
 *     일정 스트릭 이상부터는 계단식 소액 포인트를 보상한다(둘 다 독립 상한).
 *
 * 원본 아이템은 성공/실패 무관하게 항상 소각된다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import { awardPoints } from '@/lib/points'
import { getCombinePolicy, resolveTier } from '@/lib/combine/policy'
import type { BadgeRow, CombinationRecipeRow, InventoryItemRow } from '@/types/database'

export type CombineResult =
  | {
      success: true
      path: 'recipe' | 'diversity'
      resultBadges: { id: string; name: string; rarity: string }[]
    }
  | {
      success: false
      reason: 'invalid_count' | 'items_not_found' | 'recipe_fail' | 'fail'
      pointsAwarded: number
      streak: number
    }

const MIN_ITEMS = 2
const MAX_ITEMS = 10

export async function combineItems(userId: string, itemIds: string[]): Promise<CombineResult> {
  if (itemIds.length < MIN_ITEMS || itemIds.length > MAX_ITEMS || new Set(itemIds).size !== itemIds.length) {
    return { success: false, reason: 'invalid_count', pointsAwarded: 0, streak: 0 }
  }

  const supabase = createServiceClient()

  // 1. 인벤토리 조회
  const { data: invRaw } = await supabase
    .from('inventory')
    .select('id')
    .eq('user_id', userId)
    .single()

  const inventory = invRaw as Pick<{ id: string }, 'id'> | null
  if (!inventory) return { success: false, reason: 'items_not_found', pointsAwarded: 0, streak: 0 }

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
    return { success: false, reason: 'items_not_found', pointsAwarded: 0, streak: 0 }
  }

  // 3. 재료 배지의 세계관(faction) 조회 — "소재 세계관 제외" 판정에 사용
  const badgeIds = items.map((i) => i.badge_id)
  const { data: sourceBadgesRaw } = await supabase
    .from('badges')
    .select('id, faction_id')
    .in('id', badgeIds)

  const sourceBadges = (sourceBadgesRaw ?? []) as Pick<BadgeRow, 'id' | 'faction_id'>[]
  const sourceFactionIds = [...new Set(sourceBadges.map((b) => b.faction_id).filter((f): f is string => !!f))]

  // 4. 정석 레시피 정확 매칭 탐색 (순서 무관) — 재료가 일치해도 required_activity_badge_id가
  //    설정돼 있으면 해당 액티비티 배지를 보유해야 최종 매칭으로 인정한다(소모되지 않는 조건).
  const ingredientBadgeIds = [...badgeIds].sort()
  const { data: recipesRaw } = await supabase.from('combination_recipes').select('*')
  const recipes = (recipesRaw ?? []) as CombinationRecipeRow[]

  const ingredientMatches = recipes.filter((r) => {
    // 결과 배지가 삭제되어 result_badge_id가 NULL인 레시피는 아직 지급할 게 없으므로
    // "매칭"으로 인정하지 않는다 — 확률형(B) 경로로 자연스럽게 폴백된다.
    if (!r.result_badge_id) return false
    const sorted = [...r.ingredient_badge_ids].sort()
    if (sorted.length !== ingredientBadgeIds.length) return false
    return sorted.every((id, idx) => id === ingredientBadgeIds[idx])
  })

  let matched: CombinationRecipeRow | undefined
  for (const candidate of ingredientMatches) {
    if (!candidate.required_activity_badge_id) {
      matched = candidate
      break
    }
    const { data: hasActivityBadge } = await supabase
      .from('user_activity_badges')
      .select('id')
      .eq('user_id', userId)
      .eq('badge_id', candidate.required_activity_badge_id)
      .maybeSingle()
    if (hasActivityBadge) {
      matched = candidate
      break
    }
  }

  // 5. 원본 아이템 소각 — 성공/실패 무관 항상 소각
  // .select()로 실제 삭제된 행을 반환받아 개수를 검증한다: 동일 재료로 조합 API를
  // 동시에 2회 호출하면 둘 다 2번의 소유권 확인(위 2단계)은 통과할 수 있지만,
  // DELETE 자체는 Postgres가 행 단위로 원자 처리하므로 먼저 커밋된 요청만
  // itemIds 전체를 지우고 뒤늦은 요청은 이미 삭제된 행이라 0개(또는 일부)만 지운다.
  // 개수가 요청한 itemIds와 다르면 레이스로 판단해 보상 지급 없이 중단한다.
  const { data: deletedRows, error: deleteError } = await supabase
    .from('inventory_items')
    .delete()
    .in('id', itemIds)
    .eq('inventory_id', inventory.id)
    .select('id')

  if (deleteError) {
    console.error('[combineItems] 아이템 소각 오류:', deleteError)
    return { success: false, reason: 'items_not_found', pointsAwarded: 0, streak: 0 }
  }

  if (!deletedRows || deletedRows.length !== itemIds.length) {
    console.error('[combineItems] 소각된 행 수 불일치 — 동시 조합 시도로 판단, 처리 중단', {
      expected: itemIds.length,
      actual: deletedRows?.length ?? 0,
      userId,
    })
    return { success: false, reason: 'items_not_found', pointsAwarded: 0, streak: 0 }
  }

  if (matched && matched.result_badge_id) {
    // A) 정석 레시피 경로 — 피티 미적용
    if (Math.random() <= matched.success_rate) {
      const resultBadge = await grantBadge(supabase, inventory.id, matched.result_badge_id)
      await resetStreak(supabase, userId)
      if (resultBadge) {
        return { success: true, path: 'recipe', resultBadges: [resultBadge] }
      }
    }
    // 레시피가 매칭됐지만(드물게 admin이 success_rate<1로 낮춘 경우) 실패한 케이스도
    // 피티 스트릭에는 반영한다 — 유저 입장에선 여전히 "빈손" 시도이므로.
    const { streak, pointsAwarded } = await recordFailure(supabase, userId)
    return { success: false, reason: 'recipe_fail', pointsAwarded, streak }
  }

  // B) 비매칭 임의 조합 — 세계관 다양성 티어 확률 경로
  const policy = await getCombinePolicy()
  const tierInfo = resolveTier(itemIds.length, sourceFactionIds.length, policy)
  if (!tierInfo) {
    const { streak, pointsAwarded } = await recordFailure(supabase, userId)
    return { success: false, reason: 'fail', pointsAwarded, streak }
  }

  const state = await getStreak(supabase, userId)
  const effectiveRate = Math.min(tierInfo.bRate + state * policy.pity_prob_increment, policy.pity_prob_cap)

  if (Math.random() > effectiveRate) {
    const { streak, pointsAwarded } = await recordFailure(supabase, userId)
    return { success: false, reason: 'fail', pointsAwarded, streak }
  }

  // 소재 세계관을 제외한 세계관의 최하위 등급(common) 아이템 배지 중 무작위 n개
  const { data: candidatesRaw } = await supabase
    .from('badges')
    .select('id, name, rarity')
    .eq('type', 'item')
    .eq('rarity', 'common')
    .is('deleted_at', null)
    .not('faction_id', 'is', null)
    .not('faction_id', 'in', `(${sourceFactionIds.length > 0 ? sourceFactionIds.join(',') : '00000000-0000-0000-0000-000000000000'})`)

  const candidates = (candidatesRaw ?? []) as Pick<BadgeRow, 'id' | 'name' | 'rarity'>[]
  const shuffled = [...candidates].sort(() => Math.random() - 0.5)
  const picked = shuffled.slice(0, tierInfo.bCount)

  if (picked.length === 0) {
    const { streak, pointsAwarded } = await recordFailure(supabase, userId)
    return { success: false, reason: 'fail', pointsAwarded, streak }
  }

  const resultBadges: { id: string; name: string; rarity: string }[] = []
  for (const badge of picked) {
    const granted = await grantBadge(supabase, inventory.id, badge.id)
    if (granted) resultBadges.push(granted)
  }
  await resetStreak(supabase, userId)

  return { success: true, path: 'diversity', resultBadges }
}

async function grantBadge(
  supabase: ReturnType<typeof createServiceClient>,
  inventoryId: string,
  badgeId: string
): Promise<{ id: string; name: string; rarity: string } | null> {
  const q = supabase.from('inventory_items')
  const payload = {
    inventory_id: inventoryId,
    badge_id: badgeId,
    obtained_by: 'system_event',
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }
  // @ts-expect-error Supabase insert/update/upsert 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 InventoryItemsRow와 일치
  const { error: insertError } = await q.insert(payload)

  if (insertError) {
    console.error('[combineItems] 결과 아이템 추가 오류:', insertError)
    return null
  }

  const { data: badgeRaw } = await supabase.from('badges').select('id, name, rarity').eq('id', badgeId).single()
  return (badgeRaw as { id: string; name: string; rarity: string } | null) ?? null
}

async function getStreak(supabase: ReturnType<typeof createServiceClient>, userId: string): Promise<number> {
  const { data } = await supabase
    .from('user_combine_state')
    .select('consecutive_fail_count')
    .eq('user_id', userId)
    .maybeSingle()
  return (data as { consecutive_fail_count: number } | null)?.consecutive_fail_count ?? 0
}

async function resetStreak(supabase: ReturnType<typeof createServiceClient>, userId: string): Promise<void> {
  const q = supabase.from('user_combine_state')
  // @ts-expect-error Supabase insert/update/upsert 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 UserCombineStateRow와 일치
  await q.upsert({ user_id: userId, consecutive_fail_count: 0, updated_at: new Date().toISOString() })
}

/** 실패 처리: 스트릭 +1 저장 후, 임계치 이상이면 계단식 포인트 지급(독립 상한). */
async function recordFailure(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string
): Promise<{ streak: number; pointsAwarded: number }> {
  const policy = await getCombinePolicy()
  const prevStreak = await getStreak(supabase, userId)
  const streak = prevStreak + 1

  const q = supabase.from('user_combine_state')
  // @ts-expect-error Supabase insert/update/upsert 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 UserCombineStateRow와 일치
  await q.upsert({ user_id: userId, consecutive_fail_count: streak, updated_at: new Date().toISOString() })

  let pointsAwarded = 0
  if (streak >= policy.pity_points_start_streak) {
    const stepsPast = Math.floor((streak - policy.pity_points_start_streak) / policy.pity_points_step)
    pointsAwarded = Math.min(
      policy.pity_points_base + stepsPast * policy.pity_points_increment,
      policy.pity_points_cap
    )
    if (pointsAwarded > 0) {
      await awardPoints(userId, pointsAwarded, 'combine_pity_reward')
    }
  }

  return { streak, pointsAwarded }
}
