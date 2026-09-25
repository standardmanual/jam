import { Suspense } from 'react'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import type { CombinationRecipeSlotRow } from '@/types/database'
import { DataTablePagination } from '@/components/admin/data-table/data-table-pagination'
import { pickSingleQueryParams, type SearchParamsPromise } from '@/lib/searchParams'
import { ADMIN_LIST_PAGE_SIZE, pageRange, totalPagesOf } from '@/lib/admin/list-params'
import { logQueryError, throwOnQueryError } from '@/lib/admin/queryError'
import {
  RECIPE_LIST_COLUMNS,
  parseRecipeListParams,
  applyRecipeListQuery,
  type RecipeListRow,
  type RecipeListQuery,
} from '@/lib/admin/recipe-list'
import RecipeFilters from './RecipeFilters'
import { RecipeTable, type RecipeWithSlots } from './RecipeTable'

/**
 * 믹스 레시피 목록(티켓 20260924_0949) — 이름 검색·정렬·번호 페이지 이동을 서버에서 처리한다
 * (한 쪽 50건). 삭제는 표의 선택 후 일괄 삭제 한 경로뿐이다.
 *
 * ⚠️ 쿼리 값의 타입을 `string`으로 좁히지 말 것 — 같은 키가 두 번 오면 Next가 배열을 넘긴다
 * (`pickSingleQueryParams`가 흡수, 티켓 20260906_1312).
 */
interface AdminRecipesPageProps {
  searchParams: SearchParamsPromise
}

export default async function AdminRecipesPage({ searchParams }: AdminRecipesPageProps) {
  const rawParams = pickSingleQueryParams(await searchParams)
  const params = parseRecipeListParams(rawParams)
  const page = Math.max(1, parseInt(rawParams.page ?? '1', 10) || 1)

  const supabase = createServiceClient()

  let query = supabase
    .from('combination_recipes')
    .select(RECIPE_LIST_COLUMNS, { count: 'exact' }) as unknown as RecipeListQuery<RecipeListRow>
  query = applyRecipeListQuery(query, params)
  const [from, to] = pageRange(page, ADMIN_LIST_PAGE_SIZE)
  const { data: recipesRaw, count, error: recipesError } = await query.range(from, to)
  throwOnQueryError(recipesError, 'recipes')
  const recipesBase = recipesRaw ?? []

  // 티켓 20260917_1427: 재료·보유 조건이 `combination_recipe_slots`로 이관됐다 — 이 쪽의
  // 레시피 id들만 골라 슬롯을 조회하고 recipe_id로 묶는다.
  const recipeIds = recipesBase.map((r) => r.id)
  const { data: slotsRaw, error: slotsError } =
    recipeIds.length > 0
      ? await supabase.from('combination_recipe_slots').select('*').in('recipe_id', recipeIds)
      : { data: [] as CombinationRecipeSlotRow[], error: null }
  logQueryError(slotsError, 'recipes/slots')
  const slotsByRecipe = new Map<string, CombinationRecipeSlotRow[]>()
  for (const slot of (slotsRaw ?? []) as CombinationRecipeSlotRow[]) {
    const list = slotsByRecipe.get(slot.recipe_id) ?? []
    list.push(slot)
    slotsByRecipe.set(slot.recipe_id, list)
  }
  const recipes: RecipeWithSlots[] = recipesBase.map((r) => ({ ...r, slots: slotsByRecipe.get(r.id) ?? [] }))

  // 이 쪽 레시피가 쓰는 배지 id만 골라 이름을 조회한다 — 배지 전체가 몇 건이든 PostgREST
  // 기본 응답 상한(1000행)과 무관하게 이름이 정상 표시된다(티켓 20260825_029).
  const usedBadgeIds = [
    ...new Set(
      recipes
        .flatMap((r) => [...r.slots.flatMap((s) => s.allowed_badge_ids), ...(r.reward_badge_ids ?? [])])
        .filter((id): id is string => !!id)
    ),
  ]
  const { data: usedBadgesRaw, error: usedBadgesError } =
    usedBadgeIds.length > 0
      ? await supabase.from('badges').select('id, name').in('id', usedBadgeIds)
      : { data: [] as { id: string; name: string }[], error: null }
  logQueryError(usedBadgesError, 'recipes/badge-names')
  const badgeMap = new Map(((usedBadgesRaw ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]))

  const totalCount = count ?? 0
  const totalPages = totalPagesOf(totalCount, ADMIN_LIST_PAGE_SIZE)

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">믹스 레시피</h1>
          <p className="text-muted-foreground text-sm mt-1">아이템 믹스 공식 관리</p>
        </div>
        <Link
          href="/admin/recipes/new"
          className="inline-block bg-primary text-white font-bold px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors text-sm"
        >
          + 레시피 등록
        </Link>
      </div>

      <Suspense>
        <RecipeFilters />
      </Suspense>

      <div className="text-sm text-muted-foreground">총 {totalCount}개</div>

      <RecipeTable recipes={recipes} badgeMap={badgeMap} totalCount={totalCount} />

      <DataTablePagination page={page} totalPages={totalPages} />
    </div>
  )
}
