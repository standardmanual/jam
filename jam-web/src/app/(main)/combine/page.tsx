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
    const { data: itemsRaw } = await service
      .from('inventory_items')
      .select('id, badge_id, serial_prefix, serial_number')
      .eq('inventory_id', inv.id)
      .is('dropped_at', null)
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

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-5 pt-5 pb-4">
        <h1 className="text-2xl font-black">아이템 조합</h1>
        <p className="text-white/40 text-sm mt-1">인벤토리 아이템 2~3개를 합성해 새 아이템을 만들어요</p>
      </div>
      <div className="h-px bg-white/10 mx-5" />
      <CombineClient items={items} hints={hints} publicRecipes={publicRecipes} />
    </div>
  )
}
