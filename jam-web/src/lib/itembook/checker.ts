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
import type { ItemBookRow, InventoryRow, BadgeType } from '@/types/database'

export interface ItemBookCompletionResult {
  completedIds: string[]
  rewardBadgesIssued: number
  /**
   * 이번 호출에서 실제로 발급된 보상 배지 id 목록 (발급 순서).
   * 20260823_007 — 동기화 응답에 획득 배지 상세를 실어보내기 위해 추가.
   * rewardBadgesIssued는 기존 소비처가 있어 그대로 둔다(= rewardBadgeIds.length).
   */
  rewardBadgeIds: string[]
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
    return { completedIds: [], rewardBadgesIssued: 0, rewardBadgeIds: [] }
  }

  const bookIds = itemBooks.map((b) => b.id)

  // 2. 북별 전체 소속 배지 수 (item + poi)
  //    Phase 16: poi 타입 배지도 북에 소속 가능. "보유" 판정 방식만 타입별로 다름.
  const { data: badgesRaw } = await supabase
    .from('badges')
    .select('id, item_book_id, type')
    .in('item_book_id', bookIds)
    .in('type', ['item', 'poi'])
    .is('deleted_at', null)

  const bookBadges = (badgesRaw ?? []) as { id: string; item_book_id: string; type: BadgeType }[]

  const badgeCountByBook = new Map<string, number>()
  const poiBadgesByBook = new Map<string, string[]>()
  for (const b of bookBadges) {
    if (!b.item_book_id) continue
    badgeCountByBook.set(b.item_book_id, (badgeCountByBook.get(b.item_book_id) ?? 0) + 1)
    if (b.type === 'poi') {
      const list = poiBadgesByBook.get(b.item_book_id) ?? []
      list.push(b.id)
      poiBadgesByBook.set(b.item_book_id, list)
    }
  }

  // 3. 유저의 슬롯 수 (북별)
  const { data: slotsRaw, error: slotsError } = await supabase
    .from('user_item_book_slots')
    .select('item_book_id')
    .eq('user_id', userId)
    .in('item_book_id', bookIds)

  if (slotsError) {
    console.error('[checkItemBookCompletion] user_item_book_slots 조회 오류:', slotsError)
    return { completedIds: [], rewardBadgesIssued: 0, rewardBadgeIds: [] }
  }

  const slotCountByBook = new Map<string, number>()
  for (const s of (slotsRaw ?? []) as { item_book_id: string }[]) {
    slotCountByBook.set(s.item_book_id, (slotCountByBook.get(s.item_book_id) ?? 0) + 1)
  }

  // 3-1. Phase 16: poi 타입 배지는 슬롯팅이 아니라 "1회 이상 획득 이력 존재"로 채움 판정
  //      (반복 획득되지만 완성 기여는 배지당 1로만 카운트)
  const allPoiBadgeIds = Array.from(poiBadgesByBook.values()).flat()
  if (allPoiBadgeIds.length > 0) {
    const { data: poiEarnsRaw, error: poiEarnsError } = await supabase
      .from('user_poi_badge_earns')
      .select('badge_id')
      .eq('user_id', userId)
      .in('badge_id', allPoiBadgeIds)

    if (poiEarnsError) {
      console.error('[checkItemBookCompletion] user_poi_badge_earns 조회 오류:', poiEarnsError)
      return { completedIds: [], rewardBadgesIssued: 0, rewardBadgeIds: [] }
    }

    const earnedPoiBadgeIds = new Set(
      ((poiEarnsRaw ?? []) as { badge_id: string }[]).map((e) => e.badge_id)
    )

    for (const [bookId, poiBadgeIds] of poiBadgesByBook) {
      const earnedCount = poiBadgeIds.filter((id) => earnedPoiBadgeIds.has(id)).length
      if (earnedCount > 0) {
        slotCountByBook.set(bookId, (slotCountByBook.get(bookId) ?? 0) + earnedCount)
      }
    }
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
    return { completedIds: [], rewardBadgesIssued: 0, rewardBadgeIds: [] }
  }

  console.info(`[checkItemBookCompletion] 완성된 아이템북 — userId: ${userId}, ids: ${completedIds.join(', ')}`)

  // 6. 완성 기록 upsert
  const completionRows = completedIds.map((id) => ({ user_id: userId, item_book_id: id }))
  const completionsTable = supabase.from('user_item_book_completions')
  // @ts-expect-error Supabase upsert() 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 user_item_book_completions 스키마와 일치
  await completionsTable.upsert(completionRows, { onConflict: 'user_id,item_book_id', ignoreDuplicates: true })

  // 7. reward_badge_id 발급
  const rewardBadgeIds: string[] = []

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

    const rewardBadgePayload = {
      user_id: userId,
      badge_id: book.reward_badge_id,
      triggered_by: `itembook_complete:${book.id}`,
    }
    const activityBadgesTable = supabase.from('user_activity_badges')
    // @ts-expect-error Supabase insert() 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 UserActivityBadgeRow와 일치
    const { error: insertError } = await activityBadgesTable.insert(rewardBadgePayload)

    if (insertError) {
      if (insertError.code === '23505') continue
      console.error(`[checkItemBookCompletion] 보상 배지 발급 오류 (book: ${book.id}):`, insertError)
      continue
    }

    // 인벤토리 used_slots 업데이트 (보상 배지는 activity badge이므로 인벤토리 대상 아님)
    void inventory // 보상 배지는 user_activity_badges에만 저장

    rewardBadgeIds.push(book.reward_badge_id)
    console.info(`[checkItemBookCompletion] 보상 배지 발급 완료 — userId: ${userId}, book: ${book.name}, reward_badge_id: ${book.reward_badge_id}`)
  }

  return { completedIds, rewardBadgesIssued: rewardBadgeIds.length, rewardBadgeIds }
}
