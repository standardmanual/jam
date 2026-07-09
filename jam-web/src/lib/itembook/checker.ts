/**
 * JAM! 아이템북 완성 체크 로직 (서버 사이드 전용)
 *
 * - item_books 테이블의 required_activity_badge_id → user_activity_badges 확인
 * - required_item_badge_ids → inventory_items 확인
 * - 둘 다 충족한 아이템북 id 목록 반환
 * - service_role 클라이언트 사용 (RLS 우회)
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { ItemBookRow, UserActivityBadgeRow, InventoryItemRow, InventoryRow } from '@/types/database'

/**
 * 유저의 아이템북 완성 여부를 확인합니다.
 * @param userId - 대상 유저 ID
 * @returns 완성된 item_book id 목록
 */
export async function checkItemBookCompletion(userId: string): Promise<string[]> {
  const supabase = createServiceClient()

  // 1. item_books 전체 조회
  const { data: itemBooksRaw, error: itemBooksError } = await supabase
    .from('item_books')
    .select('*')

  const itemBooks = itemBooksRaw as ItemBookRow[] | null

  if (itemBooksError || !itemBooks || itemBooks.length === 0) {
    if (itemBooksError) console.error('[checkItemBookCompletion] item_books 조회 오류:', itemBooksError)
    return []
  }

  // 2. 유저가 보유한 액티비티 배지 ID 목록
  const { data: activityBadgesRaw, error: abError } = await supabase
    .from('user_activity_badges')
    .select('badge_id')
    .eq('user_id', userId)

  const activityBadges = activityBadgesRaw as Pick<UserActivityBadgeRow, 'badge_id'>[] | null

  if (abError) {
    console.error('[checkItemBookCompletion] user_activity_badges 조회 오류:', abError)
    return []
  }

  const ownedActivityBadgeIds = new Set((activityBadges ?? []).map((b) => b.badge_id))

  // 3. 유저의 인벤토리 조회
  const { data: inventoryRaw, error: invError } = await supabase
    .from('inventory')
    .select('id')
    .eq('user_id', userId)
    .single()

  const inventory = inventoryRaw as Pick<InventoryRow, 'id'> | null

  if (invError || !inventory) {
    // 인벤토리 없으면 아이템 배지도 없음 → 완성 불가
    return []
  }

  // 4. 유저의 인벤토리 아이템 배지 ID 목록
  const { data: inventoryItemsRaw, error: iiError } = await supabase
    .from('inventory_items')
    .select('badge_id')
    .eq('inventory_id', inventory.id)

  const inventoryItems = inventoryItemsRaw as Pick<InventoryItemRow, 'badge_id'>[] | null

  if (iiError) {
    console.error('[checkItemBookCompletion] inventory_items 조회 오류:', iiError)
    return []
  }

  const ownedItemBadgeIds = new Set((inventoryItems ?? []).map((i) => i.badge_id))

  // 5. 각 아이템북 완성 여부 평가
  const completedIds: string[] = []

  for (const book of itemBooks) {
    // 액티비티 배지 조건
    const hasActivityBadge = ownedActivityBadgeIds.has(book.required_activity_badge_id)
    if (!hasActivityBadge) continue

    // 아이템 배지 조건 (required_item_badge_ids 모두 보유해야 함)
    const requiredItemIds: string[] = Array.isArray(book.required_item_badge_ids)
      ? book.required_item_badge_ids
      : []

    const hasAllItemBadges = requiredItemIds.every((id) => ownedItemBadgeIds.has(id))
    if (!hasAllItemBadges) continue

    completedIds.push(book.id)
  }

  if (completedIds.length > 0) {
    console.info(`[checkItemBookCompletion] 완성된 아이템북 — userId: ${userId}, ids: ${completedIds.join(', ')}`)
  }

  return completedIds
}
