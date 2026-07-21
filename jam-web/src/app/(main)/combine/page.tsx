import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { BadgeRow, CombinationRecipeRow, InventoryItemRow } from '@/types/database'
import CombineClient from './CombineClient'

export default async function CombinePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  const [{ data: invRaw }, { data: recipesRaw }] = await Promise.all([
    service.from('inventory').select('id').eq('user_id', user.id).single(),
    service.from('combination_recipes').select('*'),
  ])

  const recipes = (recipesRaw ?? []) as CombinationRecipeRow[]
  const publicRecipes = recipes.filter((r) => r.is_public)
  const hints = recipes
    .filter((r) => !r.is_public && r.hint_text)
    .map((r) => ({ hint_text: r.hint_text, result_badge_id: r.result_badge_id }))

  let items: Array<Pick<InventoryItemRow, 'id' | 'badge_id' | 'serial_prefix' | 'serial_number'> & { badge: Pick<BadgeRow, 'id' | 'name' | 'image_url' | 'rarity'> }> = []

  const inv = invRaw as { id: string } | null

  if (inv) {
    // 아이템북 슬롯에 장착된 아이템은 조합 재료로 사용할 수 없다 (인벤토리·아이템북 중 한 곳에만 위치)
    const { data: itemsRaw } = await service
      .from('inventory_items')
      .select('id, badge_id, serial_prefix, serial_number')
      .eq('inventory_id', inv.id)
      .is('dropped_at', null)
      .is('slotted_in', null)
      .order('obtained_at', { ascending: false })

    const inventoryItems = (itemsRaw ?? []) as Pick<InventoryItemRow, 'id' | 'badge_id' | 'serial_prefix' | 'serial_number'>[]
    const badgeIds = [...new Set(inventoryItems.map((i) => i.badge_id))]

    if (badgeIds.length > 0) {
      const { data: badgesRaw } = await service
        .from('badges')
        .select('id, name, image_url, rarity')
        .in('id', badgeIds)

      const badgeMap = new Map(
        ((badgesRaw ?? []) as Pick<BadgeRow, 'id' | 'name' | 'image_url' | 'rarity'>[])
          .map((b) => [b.id, b])
      )

      items = inventoryItems
        .map((item) => {
          const badge = badgeMap.get(item.badge_id)
          if (!badge) return null
          return { ...item, badge }
        })
        .filter(Boolean) as typeof items
    }
  }

  return <CombineClient items={items} hints={hints} publicRecipes={publicRecipes} />
}
