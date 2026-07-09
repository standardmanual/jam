import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BadgeRow, UserActivityBadgeRow, ItemBookRow, InventoryItemRow, InventoryRow } from '@/types/database'
import BadgesClient, { ItemBookProgress } from './BadgesClient'

export default async function BadgesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: earnedBadges }, { data: itemBooks }, { data: inventoryData }] = await Promise.all([
    supabase
      .from('user_activity_badges')
      .select('*, badge:badges(*)')
      .eq('user_id', user.id)
      .order('earned_at', { ascending: false }),
    supabase.from('item_books').select('*'),
    supabase
      .from('inventory')
      .select('id, inventory_items(badge_id)')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  const badges: Array<{ badge: BadgeRow; earned: UserActivityBadgeRow }> = (
    (earnedBadges ?? []) as Array<{ badge: BadgeRow } & UserActivityBadgeRow>
  ).map((r) => ({ badge: r.badge, earned: r }))

  const ownedActivityBadgeIds = new Set(badges.map((b) => b.badge.id))

  type InventoryWithItems = InventoryRow & { inventory_items: Pick<InventoryItemRow, 'badge_id'>[] }
  const inventory = inventoryData as InventoryWithItems | null
  const ownedItemBadgeIds = new Set(
    (inventory?.inventory_items ?? []).map((i) => i.badge_id)
  )

  const books = (itemBooks ?? []) as ItemBookRow[]
  const itemBookProgress: ItemBookProgress[] = books.map((book) => {
    const requiredItemIds: string[] = Array.isArray(book.required_item_badge_ids)
      ? book.required_item_badge_ids
      : []
    const total = 1 + requiredItemIds.length
    let owned = 0
    if (ownedActivityBadgeIds.has(book.required_activity_badge_id)) owned++
    owned += requiredItemIds.filter((id) => ownedItemBadgeIds.has(id)).length
    return { bookId: book.id, owned, total, completed: owned === total }
  })

  return (
    <BadgesClient
      badges={badges}
      itemBooks={books}
      itemBookProgress={itemBookProgress}
    />
  )
}
