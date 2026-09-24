/**
 * 믹스 레시피 목록 쿼리 단일화(티켓 20260924_0949) — 목록 페이지(`admin/recipes/page.tsx`)·
 * 전체 선택용 ID 조회(`api/admin/recipes/ids`)가 같은 검색·정렬 규칙을 쓰도록
 * `parseRecipeListParams`(URL → 타입) + `applyRecipeListQuery`(타입 → 쿼리)로 나눈다
 * (`poi-list-query.ts`와 같은 구조). 레시피에는 활성 여부 칸이 없어 필터는 이름 검색뿐이다.
 */
import type { CombinationRecipeRow } from '@/types/database'
import { sanitizeSearchTerm } from './search-term'

/** 목록·내보내기에 쓰는 컬럼 — 슬롯은 별도 조회한다 */
export const RECIPE_LIST_COLUMNS = 'id, name, reward_points, reward_badge_ids, created_at'

export type RecipeListRow = Pick<
  CombinationRecipeRow,
  'id' | 'name' | 'reward_points' | 'reward_badge_ids' | 'created_at'
>

const RECIPE_LIST_SORTS = ['created_desc', 'created_asc', 'name_asc', 'name_desc'] as const
export type RecipeListSort = (typeof RECIPE_LIST_SORTS)[number]

export const RECIPE_DEFAULT_SORT: RecipeListSort = 'created_desc'

function isRecipeListSort(value: string | undefined): value is RecipeListSort {
  return !!value && (RECIPE_LIST_SORTS as readonly string[]).includes(value)
}

export interface RecipeListParams {
  /** {@link sanitizeSearchTerm}을 거친 검색어 — 빈 문자열이면 검색하지 않는다 */
  q: string
  sort: RecipeListSort
}

/** URL(또는 API 쿼리) 파라미터 → 타입이 있는 목록 조건 */
export function parseRecipeListParams(raw: Record<string, string | undefined>): RecipeListParams {
  return {
    q: sanitizeSearchTerm(raw.q ?? ''),
    sort: isRecipeListSort(raw.sort) ? raw.sort : RECIPE_DEFAULT_SORT,
  }
}

const SORT_COLUMN: Record<RecipeListSort, readonly [string, boolean]> = {
  created_desc: ['created_at', false],
  created_asc: ['created_at', true],
  name_asc: ['name', true],
  name_desc: ['name', false],
}

export interface RecipeListQueryResult<T> {
  data: T[] | null
  count: number | null
  error: { message: string } | null
}

/** Supabase 쿼리 빌더가 구조적으로 그대로 들어맞는 최소 인터페이스 */
export interface RecipeListQuery<T> {
  ilike(column: string, pattern: string): RecipeListQuery<T>
  order(column: string, options?: { ascending?: boolean }): RecipeListQuery<T>
  range(from: number, to: number): PromiseLike<RecipeListQueryResult<T>>
}

/**
 * 검색·정렬을 쿼리에 적용한다. 보조 정렬로 `id`를 항상 붙인다(동순위 페이징 안정성,
 * `poi-list-query.ts`와 같은 이유).
 */
export function applyRecipeListQuery<T>(query: RecipeListQuery<T>, params: RecipeListParams): RecipeListQuery<T> {
  let next = query
  if (params.q) next = next.ilike('name', `%${params.q}%`)

  const [column, ascending] = SORT_COLUMN[params.sort]
  next = next.order(column, { ascending })
  next = next.order('id', { ascending: true })
  return next
}
