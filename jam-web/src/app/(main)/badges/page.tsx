import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BadgeRow, UserActivityBadgeRow, ItemBookRow, BadgeRarity } from '@/types/database'
import BadgesClient, { ItemBookProgress, ItemBadgeCard } from './BadgesClient'

export default async function BadgesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: earnedBadges }, { data: inventoryData }] = await Promise.all([
    supabase
      .from('user_activity_badges')
      .select('*, badge:badges(*)')
      .eq('user_id', user.id)
      .order('earned_at', { ascending: false }),
    supabase
      .from('inventory')
      .select('id, inventory_items(id, badge_id, serial_number, expires_at, dropped_at, badge:badges(id, name, image_url, rarity))')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  const badges: Array<{ badge: BadgeRow; earned: UserActivityBadgeRow }> = (
    (earnedBadges ?? []) as Array<{ badge: BadgeRow } & UserActivityBadgeRow>
  ).map((r) => ({ badge: r.badge, earned: r }))

  type RawInventoryItem = {
    id: string
    badge_id: string
    serial_number: number
    expires_at: string | null
    dropped_at: string | null
    badge: { id: string; name: string; image_url: string | null; rarity: BadgeRarity }
  }
  type RawInventory = { id: string; inventory_items: RawInventoryItem[] }

  const inventory = inventoryData as RawInventory | null
  // 아이템배지 탭: 드랍(양도)한 건 제외하고, 아이템북 슬롯에 넣었든 안 넣었든 소유 중인 건 전부 표시
  const rawItems: RawInventoryItem[] = (inventory?.inventory_items ?? []).filter(
    (item) => item.dropped_at === null
  )

  const itemBadges: ItemBadgeCard[] = rawItems.map((item) => ({
    itemId: item.id,
    badgeId: item.badge_id,
    serialNumber: item.serial_number,
    expiresAt: item.expires_at,
    name: item.badge.name,
    imageUrl: item.badge.image_url,
    rarity: item.badge.rarity,
  }))

  // 보유한 아이템 배지에 연결된 아이템북만 표시
  const ownedBadgeIds = [...new Set(rawItems.map((i) => i.badge_id))]

  let books: ItemBookRow[] = []
  let itemBookProgress: ItemBookProgress[] = []

  if (ownedBadgeIds.length > 0) {
    const { data: ownedBadgesWithBook } = await supabase
      .from('badges')
      .select('id, item_book_id')
      .in('id', ownedBadgeIds)
      .eq('type', 'item')
      .not('item_book_id', 'is', null)

    const bookIds = [...new Set(((ownedBadgesWithBook ?? []) as { id: string; item_book_id: string }[]).map((b) => b.item_book_id))]

    if (bookIds.length > 0) {
      const [{ data: booksRaw }, { data: bookBadgesRaw }, { data: slotsRaw }, { data: completionsRaw }] =
        await Promise.all([
          supabase.from('item_books').select('*').in('id', bookIds),
          supabase.from('badges').select('id, item_book_id').in('item_book_id', bookIds).eq('type', 'item'),
          supabase.from('user_item_book_slots').select('item_book_id').eq('user_id', user.id).in('item_book_id', bookIds),
          supabase.from('user_item_book_completions').select('item_book_id').eq('user_id', user.id).in('item_book_id', bookIds),
        ])

      books = (booksRaw ?? []) as ItemBookRow[]

      const totalByBook = new Map<string, number>()
      for (const b of (bookBadgesRaw ?? []) as { id: string; item_book_id: string }[]) {
        if (!b.item_book_id) continue
        totalByBook.set(b.item_book_id, (totalByBook.get(b.item_book_id) ?? 0) + 1)
      }
      const slottedByBook = new Map<string, number>()
      for (const s of (slotsRaw ?? []) as { item_book_id: string }[]) {
        slottedByBook.set(s.item_book_id, (slottedByBook.get(s.item_book_id) ?? 0) + 1)
      }
      const completedSet = new Set(((completionsRaw ?? []) as { item_book_id: string }[]).map((c) => c.item_book_id))

      itemBookProgress = books.map((book) => {
        const total = totalByBook.get(book.id) ?? 0
        const owned = slottedByBook.get(book.id) ?? 0
        const completed = completedSet.has(book.id) || (total > 0 && owned >= total)
        return { bookId: book.id, owned, total, completed }
      })
    }
  }

  return (
    <BadgesClient
      badges={badges}
      itemBadges={itemBadges}
      itemBooks={books}
      itemBookProgress={itemBookProgress}
    />
  )
}
