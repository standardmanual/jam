import { NextRequest, NextResponse } from 'next/server'
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

// GET /api/itembooks/[id] — 아이템북 상세 + 유저 슬롯 상태
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 1) 아이템북 (활성만)
  const { data: bookRaw } = await supabase
    .from('item_books')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .single()
  if (!bookRaw) return NextResponse.json({ error: '아이템북을 찾을 수 없습니다.' }, { status: 404 })
  const book = bookRaw as ItemBookRow

  // 2) 팩션 + 3) 이 북에 속한 아이템 배지 병렬
  const [factionRes, badgesRes] = await Promise.all([
    book.faction_id
      ? supabase.from('factions').select('*').eq('id', book.faction_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from('badges')
      .select('id, name, image_url, rarity')
      .eq('item_book_id', id)
      .eq('type', 'item')
      .order('created_at', { ascending: true }),
  ])

  const faction = (factionRes.data ?? null) as FactionRow | null
  const badges = (badgesRes.data ?? []) as Pick<BadgeRow, 'id' | 'name' | 'image_url' | 'rarity'>[]
  const badgeIds = badges.map((b) => b.id)

  // 4) 유저 인벤토리
  const { data: invRaw } = await supabase
    .from('inventory')
    .select('id')
    .eq('user_id', user.id)
    .single()
  const inventoryId = invRaw ? (invRaw as Pick<InventoryRow, 'id'>).id : null

  // 5) 인벤 아이템(슬롯 포함/미포함) + 6) 유저 슬롯 + 7) 완성 여부 병렬
  const [invItemsRes, slotsRes, compRes] = await Promise.all([
    inventoryId && badgeIds.length > 0
      ? supabase
          .from('inventory_items')
          .select('id, badge_id, serial_number, serial_prefix, slotted_in')
          .eq('inventory_id', inventoryId)
          .in('badge_id', badgeIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from('user_item_book_slots')
      .select('id, badge_id, inventory_item_id, slotted_at')
      .eq('user_id', user.id)
      .eq('item_book_id', id),
    supabase
      .from('user_item_book_completions')
      .select('item_book_id')
      .eq('user_id', user.id)
      .eq('item_book_id', id)
      .maybeSingle(),
  ])

  const invItems = (invItemsRes.data ?? []) as Pick<
    InventoryItemRow,
    'id' | 'badge_id' | 'serial_number' | 'serial_prefix' | 'slotted_in'
  >[]
  const slots = (slotsRes.data ?? []) as Pick<
    UserItemBookSlotRow,
    'id' | 'badge_id' | 'inventory_item_id' | 'slotted_at'
  >[]
  const isCompleted = !!(compRes.data as Pick<UserItemBookCompletionRow, 'item_book_id'> | null)

  // badge_id → slot
  const slotByBadge = new Map(slots.map((s) => [s.badge_id, s]))
  // id → inventory_item (슬롯된 아이템 참조용)
  const invById = new Map(invItems.map((i) => [i.id, i]))

  const badgeSlots = badges.map((badge) => {
    const slot = slotByBadge.get(badge.id) ?? null

    let invItem:
      | Pick<InventoryItemRow, 'id' | 'serial_number' | 'serial_prefix'>
      | null = null

    if (slot) {
      // 슬롯에 장착된 아이템 참조
      const ref = invById.get(slot.inventory_item_id)
      invItem = ref
        ? { id: ref.id, serial_number: ref.serial_number, serial_prefix: ref.serial_prefix }
        : null
    } else {
      // 슬롯 안 된(slotted_in IS NULL) 인벤 아이템 중 첫 번째
      const owned = invItems.find((i) => i.badge_id === badge.id && i.slotted_in === null)
      invItem = owned
        ? { id: owned.id, serial_number: owned.serial_number, serial_prefix: owned.serial_prefix }
        : null
    }

    return {
      badge: {
        id: badge.id,
        name: badge.name,
        image_url: badge.image_url,
        rarity: badge.rarity,
      },
      inventoryItem: invItem,
      slot: slot ? { id: slot.id, slotted_at: slot.slotted_at } : null,
    }
  })

  return NextResponse.json({
    itemBook: { ...book, faction },
    badgeSlots,
    isCompleted,
  })
}
