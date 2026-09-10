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

  // 이미 레시피에 쓰인 배지 id 전부 — 정확히 이 id들만 골라 조회하므로 배지 전체가
  // 몇 건이든(POI만도 1,800건이 넘는다 — (main)/badges/page.tsx 주석 참고) PostgREST
  // 기본 응답 상한(1000행)과 무관하게 이름이 항상 정상 표시된다.
  //
  // 티켓 20260825_029: 이전에는 여기에 더해 type 필터 없는 배지 전체 목록도 함께 조회해
  // badgeById에 합쳤으나(`.limit(10000)` — PostgREST 서버 설정상 그 상한을 못 넘겨 사실상
  // 미삭제 배지 2172건 중 1000건에서 절단), RecipeList.tsx가 badges prop을 이 이름 조회
  // 용도로만 쓰고(신규 레시피의 배지 선택은 이미 검색 기반 BadgeSearchSelect를 씀) 그
  // 결과는 아래 usedBadgeIds 조회로 완전히 덮어써져 실질적인 효과가 없었다 — 절단 위험만
  // 지닌 채 아무 역할도 하지 않는 조회였으므로 제거한다.
  const usedBadgeIds = [
    ...new Set(
      recipes.flatMap((r) => [
        ...r.ingredient_badge_ids,
        ...(r.required_badge_ids ?? []),
        ...(r.reward_badge_ids ?? []),
      ]).filter((id): id is string => !!id)
    ),
  ]

  const { data: usedBadgesRaw } = usedBadgeIds.length > 0
    ? await supabase.from('badges').select('id, name, rarity, type').in('id', usedBadgeIds)
    : { data: [] as Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'type'>[] }
  const badges = (usedBadgesRaw ?? []) as Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'type'>[]

  // 보상 배지 다중 선택의 후보 좁히기 필터(트라이브·컬렉션) 선택지 — 목록 자체는 소규모다
  // (트라이브 10종, 활성 컬렉션 30종).
  const [{ data: tribesRaw }, { data: itemBooksRaw }] = await Promise.all([
    supabase.from('tribes').select('id, name').order('name'),
    supabase.from('item_books').select('id, name').order('name'),
  ])
  const tribes = (tribesRaw ?? []) as { id: string; name: string }[]
  const itemBooks = (itemBooksRaw ?? []) as { id: string; name: string }[]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">믹스 레시피</h1>
          <p className="text-muted-foreground text-sm mt-1">아이템 믹스 공식 관리</p>
        </div>
      </div>
      <RecipeList recipes={recipes} badges={badges} tribes={tribes} itemBooks={itemBooks} />
    </div>
  )
}
