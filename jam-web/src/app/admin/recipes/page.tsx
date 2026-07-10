import { createServiceClient } from '@/lib/supabase/server'
import type { BadgeRow, CombinationRecipeRow } from '@/types/database'
import RecipeList from './RecipeList'

export default async function AdminRecipesPage() {
  const supabase = createServiceClient()

  const [{ data: recipesRaw }, { data: badgesRaw }] = await Promise.all([
    supabase.from('combination_recipes').select('*').order('created_at', { ascending: false }),
    supabase.from('badges').select('id, name, rarity, type').order('type').order('rarity'),
  ])

  const recipes = (recipesRaw ?? []) as CombinationRecipeRow[]
  const badges = (badgesRaw ?? []) as Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'type'>[]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">조합 레시피</h1>
          <p className="text-white/40 text-sm mt-1">아이템 조합 공식 관리</p>
        </div>
      </div>
      <RecipeList recipes={recipes} badges={badges} />
    </div>
  )
}
