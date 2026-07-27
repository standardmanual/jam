import { createServiceClient } from '@/lib/supabase/server'
import type { BadgeRow, CombinationRecipeRow } from '@/types/database'
import RecipeList from './RecipeList'

export default async function AdminRecipesPage() {
  const supabase = createServiceClient()

  const { data: recipesRaw } = await supabase
    .from('combination_recipes')
    .select('*')
    .order('created_at', { ascending: false })
  const recipes = (recipesRaw ?? []) as CombinationRecipeRow[]

  // 이미 레시피에 쓰인 배지 id 전부 — 전체 배지 목록 조회가 Supabase 서버 단 Max Rows
  // 상한에 걸려 일부만 내려와도(코드의 limit()으론 그 상한을 못 넘김), 기존 레시피가
  // 참조하는 배지만큼은 정확히 짚어서 별도로 가져와 이름이 항상 정상 표시되도록 한다.
  const usedBadgeIds = [
    ...new Set(
      recipes.flatMap((r) => [
        ...r.ingredient_badge_ids,
        r.result_badge_id,
        r.required_activity_badge_id,
      ]).filter((id): id is string => !!id)
    ),
  ]

  const [{ data: badgesRaw }, { data: usedBadgesRaw }] = await Promise.all([
    supabase.from('badges').select('id, name, rarity, type').is('deleted_at', null).order('type').order('rarity').limit(10000),
    usedBadgeIds.length > 0
      ? supabase.from('badges').select('id, name, rarity, type').in('id', usedBadgeIds)
      : Promise.resolve({ data: [] as Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'type'>[] }),
  ])

  const badgeById = new Map<string, Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'type'>>()
  for (const b of (badgesRaw ?? []) as Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'type'>[]) badgeById.set(b.id, b)
  for (const b of (usedBadgesRaw ?? []) as Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'type'>[]) badgeById.set(b.id, b)
  const badges = [...badgeById.values()]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">조합 레시피</h1>
          <p className="text-[#6b7280] text-sm mt-1">아이템 조합 공식 관리</p>
        </div>
      </div>
      <RecipeList recipes={recipes} badges={badges} />
    </div>
  )
}
