/**
 * 컬렉션(item_books) 목록 쿼리 단일화(티켓 20260924_0945, 상위 티켓 §4.1 컬렉션 행) —
 * 목록 페이지(`admin/itembooks/page.tsx`)·전체 선택용 ID 조회(`api/admin/itembooks/ids`)가
 * 같은 필터 규칙(`parseItemBookListParams`)을 쓰도록 모은다. 그래서 화면의 "총 N개"와 ID
 * 조회 건수가 항상 같다.
 *
 * 상태 필터의 "노출 중" 조건은 `lib/itembook/checker.ts`의 활성 컬렉션 조회(`is_active` +
 * 노출 기간 안)와 같은 규칙이다 — 노출 기간이 컬렉션 노출에 바로 반영된다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import type { ItemBookRow } from '@/types/database'
import { sanitizeSearchTerm } from './search-term'
import { ADMIN_LIST_PAGE_SIZE, pageRange } from './list-params'
import { UNKNOWN_IMAGE_SOURCE_FILTER } from './contentImageSource'

type ServiceClient = ReturnType<typeof createServiceClient>

/** "필터 결과 전체 선택" 상한(상위 티켓 §6 결정 1) */
export const ITEM_BOOK_SELECT_ALL_CAP = 1000

export type ItemBookStatusFilter = 'visible' | 'out_of_period' | 'inactive' | 'all'
export type ItemBookListSort = 'created_desc' | 'created_asc' | 'name_asc' | 'name_desc'

export const DEFAULT_ITEM_BOOK_STATUS: ItemBookStatusFilter = 'all'
export const DEFAULT_ITEM_BOOK_SORT: ItemBookListSort = 'created_desc'

export const ITEM_BOOK_STATUS_OPTIONS: { value: ItemBookStatusFilter; label: string }[] = [
  { value: 'visible', label: '노출 중' },
  { value: 'out_of_period', label: '기간 밖' },
  { value: 'inactive', label: '비활성' },
  { value: 'all', label: '전체' },
]

export const ITEM_BOOK_SORT_OPTIONS: { value: ItemBookListSort; label: string }[] = [
  { value: 'created_desc', label: '최근 등록순' },
  { value: 'created_asc', label: '오래된순' },
  { value: 'name_asc', label: '이름 ↑ (오름차순)' },
  { value: 'name_desc', label: '이름 ↓ (내림차순)' },
]

export interface ItemBookListParams {
  q: string
  tribe: string | undefined
  status: ItemBookStatusFilter
  sort: ItemBookListSort
  /** 제작 경로 필터(티켓 20260925_1409) — `admin-generator`, 값 없음(NULL)을 거르는
   *  `UNKNOWN_IMAGE_SOURCE_FILTER`, 또는 필터 없음(undefined). */
  imageSource: string | undefined
}

/** URL(또는 API 쿼리) 파라미터 → 타입이 있는 목록 조건. 목록·ID 조회가 전부 이 함수를 거친다. */
export function parseItemBookListParams(raw: Record<string, string | undefined>): ItemBookListParams {
  const status = ITEM_BOOK_STATUS_OPTIONS.find((o) => o.value === raw.status)?.value ?? DEFAULT_ITEM_BOOK_STATUS
  const sort = ITEM_BOOK_SORT_OPTIONS.find((o) => o.value === raw.sort)?.value ?? DEFAULT_ITEM_BOOK_SORT
  return {
    q: sanitizeSearchTerm(raw.q ?? ''),
    tribe: raw.tribe && raw.tribe !== 'all' ? raw.tribe : undefined,
    status,
    sort,
    imageSource: raw.image_source,
  }
}

/** Supabase 쿼리 빌더가 구조적으로 그대로 들어맞는 최소 인터페이스 */
export interface ItemBookListQuery<T> {
  eq(column: string, value: string | boolean): ItemBookListQuery<T>
  ilike(column: string, pattern: string): ItemBookListQuery<T>
  is(column: string, value: null): ItemBookListQuery<T>
  or(filters: string): ItemBookListQuery<T>
  order(column: string, options?: { ascending?: boolean }): ItemBookListQuery<T>
  range(
    from: number,
    to: number
  ): PromiseLike<{ data: T[] | null; count: number | null; error: { message: string } | null }>
}

/**
 * 검색·트라이브·상태 조건을 쿼리에 적용한다. `nowIso`는 "지금"의 기준 시각이다(테스트가 고정값을
 * 넘긴다).
 *
 * - 노출 중: `is_active` 그리고 `valid_from`이 비었거나 지금 이전, `valid_until`이 비었거나 지금 이후
 *   (`checkItemBookCompletion`의 활성 컬렉션 조회와 같은 조건)
 * - 기간 밖: `is_active`이지만 시작 전이거나 종료 후
 * - 비활성: `is_active`가 꺼져 있음(기간과 무관)
 * - 전체: 상태 조건 없음
 */
export function applyItemBookListFilters<T>(
  query: ItemBookListQuery<T>,
  params: ItemBookListParams,
  nowIso: string
): ItemBookListQuery<T> {
  let next = query

  if (params.q) next = next.ilike('name', `%${params.q}%`)
  if (params.tribe) next = next.eq('tribe_id', params.tribe)

  switch (params.status) {
    case 'visible':
      next = next
        .eq('is_active', true)
        .or(`valid_from.is.null,valid_from.lte.${nowIso}`)
        .or(`valid_until.is.null,valid_until.gte.${nowIso}`)
      break
    case 'out_of_period':
      next = next.eq('is_active', true).or(`valid_from.gt.${nowIso},valid_until.lt.${nowIso}`)
      break
    case 'inactive':
      next = next.eq('is_active', false)
      break
    case 'all':
      break
  }

  if (params.imageSource === UNKNOWN_IMAGE_SOURCE_FILTER) next = next.is('image_source', null)
  else if (params.imageSource) next = next.eq('image_source', params.imageSource)

  return next
}

/** 정렬 — 값이 같은 행끼리 페이지 경계에서 흔들리지 않도록 마지막에 id를 함께 건다 */
export function applyItemBookListSort<T>(query: ItemBookListQuery<T>, sort: ItemBookListSort): ItemBookListQuery<T> {
  switch (sort) {
    case 'name_asc':
      return query.order('name', { ascending: true }).order('id')
    case 'name_desc':
      return query.order('name', { ascending: false }).order('id')
    case 'created_asc':
      return query.order('created_at', { ascending: true }).order('id')
    default:
      return query.order('created_at', { ascending: false }).order('id')
  }
}

export async function fetchItemBookListPage(
  supabase: ServiceClient,
  params: ItemBookListParams,
  page: number
): Promise<{ books: ItemBookRow[]; total: number }> {
  const [from, to] = pageRange(page, ADMIN_LIST_PAGE_SIZE)
  let query = supabase.from('item_books').select('*', { count: 'exact' }) as unknown as ItemBookListQuery<ItemBookRow>
  query = applyItemBookListFilters(query, params, new Date().toISOString())
  query = applyItemBookListSort(query, params.sort)

  const { data, count } = await query.range(from, to)
  return { books: data ?? [], total: count ?? 0 }
}

/**
 * "이 조건의 N건 모두 선택" 배너가 부르는 전체 ID 조회(상한 이내). 정렬은 필요 없다.
 * 조회에 실패하면 빈 목록이 아니라 예외를 던진다 — 빈 목록을 "0건 선택"으로 오해하지 않게 한다.
 */
export async function fetchItemBookListIds(
  supabase: ServiceClient,
  params: ItemBookListParams,
  cap: number = ITEM_BOOK_SELECT_ALL_CAP
): Promise<{ ids: string[]; total: number }> {
  let query = supabase.from('item_books').select('id', { count: 'exact' }) as unknown as ItemBookListQuery<{ id: string }>
  query = applyItemBookListFilters(query, params, new Date().toISOString())

  const { data, count, error } = await query.range(0, cap - 1)
  if (error) throw new Error(`[itembook-list-query] id 목록 조회 실패: ${error.message}`)
  return { ids: (data ?? []).map((r) => r.id), total: count ?? 0 }
}
