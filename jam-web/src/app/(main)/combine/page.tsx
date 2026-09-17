import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import type {
  BadgeRow,
  CombinationRecipeRow,
  CombinationRecipeSlotRow,
  InventoryItemRow,
} from '@/types/database'
import CombineClient, { type RecipeWithSlots } from './CombineClient'

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
  const publicRecipeRows = recipes.filter((r) => r.is_public)
  const publicRecipeIds = publicRecipeRows.map((r) => r.id)

  // 티켓 20260917_1427: 유저 화면이 레시피 선택형 플로우로 바뀌면서, 공개 레시피는 슬롯
  // 목록과 슬롯별 후보 배지 상세(이름·이미지)까지 함께 내려줘야 슬롯 채우기 화면을 그릴 수
  // 있다. 비공개 레시피는 힌트 문구로만 노출되므로 슬롯 상세는 조회하지 않는다.
  const { data: slotsFullRaw, error: slotsError } =
    publicRecipeIds.length > 0
      ? await service
          .from('combination_recipe_slots')
          .select('*')
          .in('recipe_id', publicRecipeIds)
          .order('slot_order', { ascending: true })
      : { data: [] as CombinationRecipeSlotRow[], error: null }
  if (slotsError) console.error('[combine/page] combination_recipe_slots 조회 실패', slotsError)
  const slotRows = (slotsFullRaw ?? []) as CombinationRecipeSlotRow[]

  const allowedBadgeIds = [...new Set(slotRows.flatMap((s) => s.allowed_badge_ids))]
  const { data: allowedBadgesRaw, error: allowedBadgesError } =
    allowedBadgeIds.length > 0
      ? await service.from('badges').select('id, name, image_url').in('id', allowedBadgeIds).is('deleted_at', null)
      : { data: [] as Pick<BadgeRow, 'id' | 'name' | 'image_url'>[], error: null }
  if (allowedBadgesError) console.error('[combine/page] 슬롯 후보 배지 상세 조회 실패', allowedBadgesError)
  const badgeDetailMap = new Map(
    ((allowedBadgesRaw ?? []) as Pick<BadgeRow, 'id' | 'name' | 'image_url'>[]).map((b) => [b.id, b])
  )

  // 조건 슬롯(액티비티·체크인)은 유저가 실제로 보유한 후보만 "충족"으로 표시한다 —
  // 소각하지 않고 보유 여부만 확인하는 슬롯이라 서버가 미리 조회해 내려준다.
  const conditionCandidateIds = [
    ...new Set(slotRows.filter((s) => s.badge_type !== 'item').flatMap((s) => s.allowed_badge_ids)),
  ]
  const [{ data: ownedActivityRaw, error: activityError }, { data: ownedCheckinRaw, error: checkinError }] =
    conditionCandidateIds.length > 0
      ? await Promise.all([
          service
            .from('user_activity_badges')
            .select('badge_id')
            .eq('user_id', user.id)
            .in('badge_id', conditionCandidateIds),
          service
            .from('user_checkin_badge_earns')
            .select('badge_id')
            .eq('user_id', user.id)
            .in('badge_id', conditionCandidateIds),
        ])
      : [{ data: [] as { badge_id: string }[], error: null }, { data: [] as { badge_id: string }[], error: null }]
  if (activityError) console.error('[combine/page] user_activity_badges 조회 실패', activityError)
  if (checkinError) console.error('[combine/page] user_checkin_badge_earns 조회 실패', checkinError)
  const ownedConditionBadgeIds = [
    ...new Set([
      ...((ownedActivityRaw ?? []) as { badge_id: string }[]).map((r) => r.badge_id),
      ...((ownedCheckinRaw ?? []) as { badge_id: string }[]).map((r) => r.badge_id),
    ]),
  ]

  const slotsByRecipe = new Map<string, RecipeWithSlots['slots']>()
  for (const slot of slotRows) {
    const list = slotsByRecipe.get(slot.recipe_id) ?? []
    list.push({
      id: slot.id,
      slot_order: slot.slot_order,
      badge_type: slot.badge_type,
      candidates: slot.allowed_badge_ids
        .map((id) => badgeDetailMap.get(id))
        .filter((b): b is Pick<BadgeRow, 'id' | 'name' | 'image_url'> => Boolean(b)),
    })
    slotsByRecipe.set(slot.recipe_id, list)
  }

  const publicRecipes: RecipeWithSlots[] = publicRecipeRows.map((r) => ({
    ...r,
    slots: (slotsByRecipe.get(r.id) ?? []).sort((a, b) => a.slot_order - b.slot_order),
  }))
  const hints = recipes
    .filter((r) => !r.is_public && r.hint_text)
    .map((r) => ({ hint_text: r.hint_text }))

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

  return (
    <CombineClient
      items={items}
      hints={hints}
      publicRecipes={publicRecipes}
      ownedConditionBadgeIds={ownedConditionBadgeIds}
    />
  )
}
