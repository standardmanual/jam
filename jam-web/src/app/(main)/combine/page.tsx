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

  const [
    { data: invRaw, error: invError },
    { data: recipesRaw, error: recipesError },
  ] = await Promise.all([
    service.from('inventory').select('id').eq('user_id', user.id).single(),
    service.from('combination_recipes').select('*'),
  ])
  // .single()이라 무인벤토리도 error로 잡힘 — 실제 오류와 구분은 못 하지만 최소 가시성 확보
  if (invError) console.error('[combine/page] inventory 조회 실패(무인벤토리 포함)', invError)
  if (recipesError) console.error('[combine/page] combination_recipes 조회 실패', recipesError)

  const recipes = (recipesRaw ?? []) as CombinationRecipeRow[]
  const publicRecipes = recipes.filter((r) => r.is_public)
  const hints = recipes
    .filter((r) => !r.is_public && r.hint_text)
    .map((r) => ({ hint_text: r.hint_text, result_badge_id: r.result_badge_id }))

  let items: Array<Pick<InventoryItemRow, 'id' | 'badge_id' | 'serial_prefix' | 'serial_number'> & { badge: Pick<BadgeRow, 'id' | 'name' | 'image_url' | 'rarity'> }> = []

  const inv = invRaw as { id: string } | null

  if (inv) {
    // 아이템북 슬롯에 장착된 아이템은 조합 재료로 사용할 수 없다 (인벤토리·아이템북 중 한 곳에만 위치)
    const { data: itemsRaw, error: itemsError } = await service
      .from('inventory_items')
      .select('id, badge_id, serial_prefix, serial_number')
      .eq('inventory_id', inv.id)
      .is('dropped_at', null)
      .is('slotted_in', null)
      .order('obtained_at', { ascending: false })
    if (itemsError) console.error('[combine/page] inventory_items(조합 재료) 조회 실패', itemsError)

    const inventoryItems = (itemsRaw ?? []) as Pick<InventoryItemRow, 'id' | 'badge_id' | 'serial_prefix' | 'serial_number'>[]
    const badgeIds = [...new Set(inventoryItems.map((i) => i.badge_id))]

    if (badgeIds.length > 0) {
      // 소프트 삭제된 배지(badges.deleted_at)는 조합 재료 목록에서 제외한다 —
      // badgeMap에 없으면 아래 filter(Boolean)로 해당 인벤토리 아이템만 조용히 빠진다.
      const { data: badgesRaw, error: badgesError } = await service
        .from('badges')
        .select('id, name, image_url, rarity')
        .in('id', badgeIds)
        .is('deleted_at', null)
      if (badgesError) console.error('[combine/page] badges(조합 재료 상세) 조회 실패', badgesError)

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
