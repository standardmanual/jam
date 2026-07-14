/**
 * JAM! 아이템북 완성 체크 로직 (서버 사이드 전용)
 *
 * Phase 8 슬롯 기반 완성 모델:
 * - user_item_book_slots 카운트 >= badges(item_book_id) 카운트 → 완성
 * - 완성 기록: user_item_book_completions (upsert, 최초 1회)
 * - reward_badge_id가 있는 경우 user_activity_badges에 보상 배지 발급
 *
 * 주의: 슬롯 기반 완성은 /api/itembooks/[id]/slot POST 핸들러에서 실시간으로 처리됨.
 *       이 함수는 Strava sync 등 배치 맥락에서 누락된 완성을 보정하는 catch-up 용도.
 *
 * service_role 클라이언트 사용 (RLS 우회)
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { ItemBookRow, InventoryRow } from '@/types/database'

export interface ItemBookCompletionResult {
  completedIds: string[]
  rewardBadgesIssued: number
}

/**
 * 유저의 아이템북 완성 여부를 확인하고 완성 기록 및 reward_badge를 발급합니다.
 * @param userId - 대상 유저 ID
 */
export async function checkItemBookCompletion(userId: string): Promise<ItemBookCompletionResult> {
  const supabase = createServiceClient()

  // 1. 활성 item_books 전체 조회
  const { data: itemBooksRaw, error: itemBooksError } = await supabase
    .from('item_books')
    .select('*')
    .eq('is_active', true)

  const itemBooks = itemBooksRaw as ItemBookRow[] | null

  if (itemBooksError || !itemBooks || itemBooks.length === 0) {
    if (itemBooksError) console.error('[checkItemBookCompletion] item_books 조회 오류:', itemBooksError)
    return { completedIds: [], rewardBadgesIssued: 0 }
  }

  const bookIds = itemBooks.map((b) => b.id)

  // 2. 북별 전체 아이템 배지 수
  const { data: badgesRaw } = await supabase
    .from('badges')
    .select('id, item_book_id')
    .in('item_book_id', bookIds)
    .eq('type', 'item')

  const badgeCountByBook = new Map<string, number>()
  for (const b of (badgesRaw ?? []) as { id: string; item_book_id: string }[]) {
    if (!b.item_book_id) continue
    badgeCountByBook.set(b.item_book_id, (badgeCountByBook.get(b.item_book_id) ?? 0) + 1)
  }

  // 3. 유저의 슬롯 수 (북별)
  const { data: slotsRaw, error: slotsError } = await supabase
    .from('user_item_book_slots')
    .select('item_book_id')
    .eq('user_id', userId)
    .in('item_book_id', bookIds)

  if (slotsError) {
    console.error('[checkItemBookCompletion] user_item_book_slots 조회 오류:', slotsError)
    return { completedIds: [], rewardBadgesIssued: 0 }
  }

  const slotCountByBook = new Map<string, number>()
  for (const s of (slotsRaw ?? []) as { item_book_id: string }[]) {
    slotCountByBook.set(s.item_book_id, (slotCountByBook.get(s.item_book_id) ?? 0) + 1)
  }

  // 4. 기존 완성 기록 조회 (중복 처리 방지)
  const { data: existingCompRaw } = await supabase
    .from('user_item_book_completions')
    .select('item_book_id')
    .eq('user_id', userId)
    .in('item_book_id', bookIds)

  const alreadyCompletedSet = new Set(
    ((existingCompRaw ?? []) as { item_book_id: string }[]).map((c) => c.item_book_id)
  )

  // 5. 완성 판정
  const completedIds: string[] = []
  const completedBooks: ItemBookRow[] = []

  for (const book of itemBooks) {
    const total = badgeCountByBook.get(book.id) ?? 0
    if (total === 0) continue // 배지 없는 북은 완성 불가

    const slotted = slotCountByBook.get(book.id) ?? 0
    if (slotted < total) continue

    if (!alreadyCompletedSet.has(book.id)) {
      completedIds.push(book.id)
      completedBooks.push(book)
    }
  }

  if (completedIds.length === 0) {
    return { completedIds: [], rewardBadgesIssued: 0 }
  }

  console.info(`[checkItemBookCompletion] 완성된 아이템북 — userId: ${userId}, ids: ${completedIds.join(', ')}`)

  // 6. 완성 기록 upsert
  await supabase
    .from('user_item_book_completions')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(
      completedIds.map((id) => ({ user_id: userId, item_book_id: id })) as any,
      { onConflict: 'user_id,item_book_id', ignoreDuplicates: true }
    )

  // 7. reward_badge_id 발급
  let rewardBadgesIssued = 0

  // 유저 인벤토리
  const { data: inventoryRaw } = await supabase
    .from('inventory')
    .select('id')
    .eq('user_id', userId)
    .single()
  const inventory = inventoryRaw as Pick<InventoryRow, 'id'> | null

  for (const book of completedBooks) {
    if (!book.reward_badge_id) continue

    const { data: existing } = await supabase
      .from('user_activity_badges')
      .select('id')
      .eq('user_id', userId)
      .eq('badge_id', book.reward_badge_id)
      .maybeSingle()

    if (existing) continue

    const { error: insertError } = await supabase
      .from('user_activity_badges')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        user_id: userId,
        badge_id: book.reward_badge_id,
        triggered_by: `itembook_complete:${book.id}`,
      } as any)

    if (insertError) {
      if (insertError.code === '23505') continue
      console.error(`[checkItemBookCompletion] 보상 배지 발급 오류 (book: ${book.id}):`, insertError)
      continue
    }

    // 인벤토리 used_slots 업데이트 (보상 배지는 activity badge이므로 인벤 대상 아님)
    void inventory // 보상 배지는 user_activity_badges에만 저장

    rewardBadgesIssued++
    console.info(`[checkItemBookCompletion] 보상 배지 발급 완료 — userId: ${userId}, book: ${book.name}, reward_badge_id: ${book.reward_badge_id}`)
  }

  return { completedIds, rewardBadgesIssued }
}
