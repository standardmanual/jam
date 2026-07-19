import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type {
  InventoryRow,
  InventoryItemRow,
  BadgeRow,
  ItemBookRow,
  FactionRow,
  UserItemBookSlotRow,
  UserItemBookCompletionRow,
} from '@/types/database'

// GET /api/itembooks — 유저가 디스커버리한(인벤에 아이템 배지를 보유한) 아이템북 목록
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 1) 유저 인벤토리
  const { data: invRaw } = await supabase
    .from('inventory')
    .select('id')
    .eq('user_id', user.id)
    .single()
  if (!invRaw) return NextResponse.json({ itemBooks: [] })
  const inventoryId = (invRaw as Pick<InventoryRow, 'id'>).id

  // 2) 인벤 아이템 → 고유 badge_id 목록 (슬롯 여부 관계없이 전부)
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
  const ownedBadges = (ownedBadgesRaw ?? []) as Pick<BadgeRow, 'id' | 'item_book_id'>[]

  const discoveredMap = new Map<string, Set<string>>()
  for (const b of ownedBadges) {
    if (!b.item_book_id) continue
    if (!discoveredMap.has(b.item_book_id)) discoveredMap.set(b.item_book_id, new Set())
    discoveredMap.get(b.item_book_id)!.add(b.id)
  }
  const bookIds = Array.from(discoveredMap.keys())
  if (bookIds.length === 0) return NextResponse.json({ itemBooks: [] })

  // 4) 활성 아이템북 + 전체 아이템 배지 수 + 슬롯 카운트 + 완성 여부 병렬 조회
  const [{ data: booksRaw }, { data: allBadgesRaw }, { data: slotsRaw }, { data: compRaw }] =
    await Promise.all([
      supabase.from('item_books').select('*').in('id', bookIds),
      supabase.from('badges').select('id, item_book_id').in('item_book_id', bookIds).eq('type', 'item'),
      supabase
        .from('user_item_book_slots')
        .select('item_book_id')
        .eq('user_id', user.id)
        .in('item_book_id', bookIds),
      supabase
        .from('user_item_book_completions')
        .select('item_book_id')
        .eq('user_id', user.id)
        .in('item_book_id', bookIds),
    ])

  const books = (booksRaw ?? []) as ItemBookRow[]

  // 북별 전체 배지 수
  const totalMap = new Map<string, number>()
  for (const b of (allBadgesRaw ?? []) as Pick<BadgeRow, 'id' | 'item_book_id'>[]) {
    if (!b.item_book_id) continue
    totalMap.set(b.item_book_id, (totalMap.get(b.item_book_id) ?? 0) + 1)
  }

  // 북별 슬롯 수
  const slotMap = new Map<string, number>()
  for (const s of (slotsRaw ?? []) as Pick<UserItemBookSlotRow, 'item_book_id'>[]) {
    slotMap.set(s.item_book_id, (slotMap.get(s.item_book_id) ?? 0) + 1)
  }

  // 완성된 북 Set
  const completedSet = new Set(
    ((compRaw ?? []) as Pick<UserItemBookCompletionRow, 'item_book_id'>[]).map((c) => c.item_book_id)
  )

  // 5) 팩션 조회
  const factionIds = Array.from(
    new Set(books.map((b) => b.faction_id).filter((f): f is string => !!f))
  )
  const factionMap = new Map<string, Pick<FactionRow, 'id' | 'name' | 'image_url'>>()
  if (factionIds.length > 0) {
    const { data: factionsRaw } = await supabase
      .from('factions')
      .select('id, name, image_url')
      .in('id', factionIds)
    for (const f of (factionsRaw ?? []) as Pick<FactionRow, 'id' | 'name' | 'image_url'>[]) {
      factionMap.set(f.id, f)
    }
  }

  const itemBooks = books.map((book) => {
    const faction = book.faction_id ? factionMap.get(book.faction_id) : undefined
    return {
      id: book.id,
      name: book.name,
      description: book.description,
      image_url: book.image_url,
      faction: faction
        ? { id: faction.id, name: faction.name, image_url: faction.image_url }
        : null,
      totalBadgeCount: totalMap.get(book.id) ?? 0,
      discoveredBadgeCount: discoveredMap.get(book.id)?.size ?? 0,
      slottedCount: slotMap.get(book.id) ?? 0,
      isCompleted: completedSet.has(book.id),
    }
  })

  return NextResponse.json({ itemBooks })
}
