/**
 * Phase 15: 아이템 조합 로직 (서버 사이드 전용)
 *
 * - combination_recipes 테이블에서 재료 조합 매칭
 * - 성공 확률 적용 → 결과 배지 인벤토리에 추가
 * - 원본 아이템 소각 (inventory_items에서 DELETE)
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { CombinationRecipeRow, InventoryItemRow } from '@/types/database'

export type CombineResult =
  | { success: true; resultBadgeId: string; resultBadgeName: string }
  | { success: false; reason: 'no_recipe' | 'chance_fail' | 'items_not_found' }

export async function combineItems(userId: string, itemIds: string[]): Promise<CombineResult> {
  if (itemIds.length < 2 || itemIds.length > 3) {
    return { success: false, reason: 'no_recipe' }
  }

  const supabase = createServiceClient()

  // 1. 인벤토리 조회
  const { data: invRaw } = await supabase
    .from('inventory')
    .select('id')
    .eq('user_id', userId)
    .single()

  const inventory = invRaw as Pick<{ id: string }, 'id'> | null
  if (!inventory) return { success: false, reason: 'items_not_found' }

  // 2. 해당 아이템들이 실제로 이 유저 소유인지 확인
  const { data: itemsRaw } = await supabase
    .from('inventory_items')
    .select('id, badge_id')
    .eq('inventory_id', inventory.id)
    .in('id', itemIds)

  const items = (itemsRaw ?? []) as Pick<InventoryItemRow, 'id' | 'badge_id'>[]

  if (items.length !== itemIds.length) {
    return { success: false, reason: 'items_not_found' }
  }

  // 3. 재료 배지 ID 정렬 (순서 무관 매칭을 위해)
  const ingredientBadgeIds = items.map((i) => i.badge_id).sort()

  // 4. 매칭되는 레시피 탐색
  const { data: recipesRaw } = await supabase
    .from('combination_recipes')
    .select('*')

  const recipes = (recipesRaw ?? []) as CombinationRecipeRow[]

  const matched = recipes.find((r) => {
    const sorted = [...r.ingredient_badge_ids].sort()
    if (sorted.length !== ingredientBadgeIds.length) return false
    return sorted.every((id, idx) => id === ingredientBadgeIds[idx])
  })

  if (!matched) return { success: false, reason: 'no_recipe' }

  // 5. 원본 아이템 소각 (순서 보장을 위해 먼저 삭제)
  const { error: deleteError } = await supabase
    .from('inventory_items')
    .delete()
    .in('id', itemIds)
    .eq('inventory_id', inventory.id)

  if (deleteError) {
    console.error('[combineItems] 아이템 소각 오류:', deleteError)
    return { success: false, reason: 'items_not_found' }
  }

  // 6. 성공 확률 적용
  if (Math.random() > matched.success_rate) {
    // 실패 시 원본 아이템 복구하지 않음 (PRD: 관리자 설정으로 소각 가능 — 기본 소각)
    return { success: false, reason: 'chance_fail' }
  }

  // 7. 결과 배지를 인벤토리에 추가
  const { error: insertError } = await supabase
    .from('inventory_items')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      inventory_id: inventory.id,
      badge_id: matched.result_badge_id,
      obtained_by: 'system_event',
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    } as any)

  if (insertError) {
    console.error('[combineItems] 결과 아이템 추가 오류:', insertError)
    return { success: false, reason: 'no_recipe' }
  }

  // 8. 결과 배지 이름 조회
  const { data: badgeRaw } = await supabase
    .from('badges')
    .select('name')
    .eq('id', matched.result_badge_id)
    .single()

  return {
    success: true,
    resultBadgeId: matched.result_badge_id,
    resultBadgeName: (badgeRaw as { name: string } | null)?.name ?? '???',
  }
}
