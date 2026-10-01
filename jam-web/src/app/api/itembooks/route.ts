import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { d } from '@/lib/i18n'
import { computeBookCompletion } from '@/lib/itembook/completion-basis'
import { applyLaunchedItemBookFilter } from '@/lib/itembook/visibility'
import type {
  InventoryRow,
  InventoryItemRow,
  BadgeRow,
  ItemBookRow,
  TribeRow,
  UserItemBookSlotRow,
  UserItemBookCompletionRow,
} from '@/types/database'

// GET /api/itembooks — 유저가 디스커버리한(인벤토리에 아이템 배지를 보유한) 아이템북 목록
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: d.common.authRequired }, { status: 401 })

  // 1) 유저 인벤토리
  const { data: invRaw } = await supabase
    .from('inventory')
    .select('id')
    .eq('user_id', user.id)
    .single()
  if (!invRaw) return NextResponse.json({ itemBooks: [] })
  const inventoryId = (invRaw as Pick<InventoryRow, 'id'>).id

  // 2) 인벤토리 아이템 → 고유 badge_id 목록 (슬롯 여부 관계없이 전부)
  const { data: invItemsRaw } = await supabase
    .from('inventory_items')
    .select('badge_id')
    .eq('inventory_id', inventoryId)
  const ownedBadgeIds = Array.from(
    new Set(((invItemsRaw ?? []) as Pick<InventoryItemRow, 'badge_id'>[]).map((i) => i.badge_id))
  )
  if (ownedBadgeIds.length === 0) return NextResponse.json({ itemBooks: [] })

  // 3) 보유 배지 중 아이템북 소속 아이템 배지만 추림 → book별 발견 배지 Set
  const { data: ownedBadgesRaw } = await supabase
    .from('badges')
    .select('id, item_book_id')
    .in('id', ownedBadgeIds)
    .eq('type', 'item')
    .not('item_book_id', 'is', null)
    .is('deleted_at', null)
  const ownedBadges = (ownedBadgesRaw ?? []) as Pick<BadgeRow, 'id' | 'item_book_id'>[]

  const discoveredMap = new Map<string, Set<string>>()
  for (const b of ownedBadges) {
    if (!b.item_book_id) continue
    if (!discoveredMap.has(b.item_book_id)) discoveredMap.set(b.item_book_id, new Set())
    discoveredMap.get(b.item_book_id)!.add(b.id)
  }
  const discoveredBookIds = Array.from(discoveredMap.keys())
  if (discoveredBookIds.length === 0) return NextResponse.json({ itemBooks: [] })

  // 4) 공개된 아이템북만 — 공개 전(비활성·시작 전) 컬렉션은 목록에서 뺀다. 기간이 끝난 컬렉션은
  //    보유자에게 계속 보인다(판정은 visibility.ts, 티켓 20260930_1516 결정 E1·E2).
  const { data: booksRaw } = await applyLaunchedItemBookFilter(
    supabase.from('item_books').select('*').in('id', discoveredBookIds),
    new Date().toISOString()
  )
  const books = (booksRaw ?? []) as ItemBookRow[]
  const bookIds = books.map((b) => b.id)
  if (bookIds.length === 0) return NextResponse.json({ itemBooks: [] })

  // 5) 전체 아이템 배지 수 + 슬롯 카운트 + 완성 여부 병렬 조회 — 걸러진 컬렉션 id로만 조회한다
  const [{ data: allBadgesRaw }, { data: slotsRaw }, { data: compRaw }] =
    await Promise.all([
      supabase.from('badges').select('id, item_book_id, type, drop_excluded').in('item_book_id', bookIds).eq('type', 'item').is('deleted_at', null),
      supabase
        .from('user_item_book_slots')
        .select('item_book_id, badge_id')
        .eq('user_id', user.id)
        .in('item_book_id', bookIds),
      supabase
        .from('user_item_book_completions')
        .select('item_book_id')
        .eq('user_id', user.id)
        .in('item_book_id', bookIds),
    ])

  // 북별 분모(드랍 제외 배지를 뺀 수)·분자 — 공용 함수 (티켓 20260921_1112)
  const filledBadgeIds = new Set(
    ((slotsRaw ?? []) as Pick<UserItemBookSlotRow, 'badge_id'>[]).map((s) => s.badge_id)
  )
  const completionMap = computeBookCompletion(
    (allBadgesRaw ?? []) as { id: string; item_book_id: string | null; type: string; drop_excluded: boolean | null }[],
    filledBadgeIds,
    { types: ['item'] }
  )

  // 완성된 북 Set
  const completedSet = new Set(
    ((compRaw ?? []) as Pick<UserItemBookCompletionRow, 'item_book_id'>[]).map((c) => c.item_book_id)
  )

  // 6) 트라이브 조회
  const tribeIds = Array.from(
    new Set(books.map((b) => b.tribe_id).filter((f): f is string => !!f))
  )
  const tribeMap = new Map<string, Pick<TribeRow, 'id' | 'name' | 'image_url'>>()
  if (tribeIds.length > 0) {
    const { data: tribesRaw } = await supabase
      .from('tribes')
      .select('id, name, image_url')
      .in('id', tribeIds)
    for (const f of (tribesRaw ?? []) as Pick<TribeRow, 'id' | 'name' | 'image_url'>[]) {
      tribeMap.set(f.id, f)
    }
  }

  const itemBooks = books.map((book) => {
    const tribe = book.tribe_id ? tribeMap.get(book.tribe_id) : undefined
    return {
      id: book.id,
      name: book.name,
      description: book.description,
      image_url: book.image_url,
      tribe: tribe
        ? { id: tribe.id, name: tribe.name, image_url: tribe.image_url }
        : null,
      totalBadgeCount: completionMap.get(book.id)?.total ?? 0,
      discoveredBadgeCount: discoveredMap.get(book.id)?.size ?? 0,
      slottedCount: completionMap.get(book.id)?.filled ?? 0,
      isCompleted: completedSet.has(book.id) || (completionMap.get(book.id)?.complete ?? false),
    }
  })

  return NextResponse.json({ itemBooks })
}
