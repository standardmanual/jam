import { createServiceClient } from '@/lib/supabase/server'
import type { BadgeRow, CombinationRecipeRow } from '@/types/database'
import RecipeList from './RecipeList'

export default async function AdminRecipesPage() {
  const supabase = createServiceClient()

  const [{ data: recipesRaw }, { data: badgesRaw }] = await Promise.all([
    supabase.from('combination_recipes').select('*').order('created_at', { ascending: false }),
    // 배지 총 개수가 Supabase 기본 조회 제한(1000행)을 넘길 수 있어(등급 4종 x 세력별
    // 대량 아이템) 명시적으로 크게 잡아둔다 — 안 그러면 뒤쪽 배지가 누락되어 레시피
    // 목록의 결과 배지 이름이 DB엔 있는데도 화면에서 빈칸으로 보이는 문제가 생긴다.
    supabase.from('badges').select('id, name, rarity, type').is('deleted_at', null).order('type').order('rarity').limit(10000),
  ])

  const recipes = (recipesRaw ?? []) as CombinationRecipeRow[]
  const badges = (badgesRaw ?? []) as Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'type'>[]

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
