/**
 * POI 목록 쿼리 단일화(티켓 20260924_0941) — 목록 페이지(`admin/poi/page.tsx`)·전체 선택용 ID
 * 조회(`api/admin/poi/ids`)·내보내기(`api/admin/poi/export`)가 같은 필터·정렬 규칙을 쓰도록
 * `parsePoiListParams`(URL → 타입) + `applyPoiListQuery`(타입 → 쿼리)로 나눈다. 세 화면이
 * 각자 필터를 다시 구현하면 "총 N개"와 "전체 선택" 건수가 어긋날 수 있다.
 */
import type { PoiRow } from '@/types/database'
import { sanitizeSearchTerm } from './search-term'

/** 목록(카드/테이블)에 실제로 쓰는 컬럼만 select — 상세화면 전용 컬럼은 여기 넣지 않는다
 *  (20260826_011 A8과 동일한 원칙). `admin/poi/page.tsx`의 단일 출처. */
export const POI_LIST_COLUMNS =
  'id, name, latitude, longitude, radius_meters, category, linked_badge_id, is_active'

export type PoiListRow = Pick<
  PoiRow,
  'id' | 'name' | 'latitude' | 'longitude' | 'radius_meters' | 'category' | 'linked_badge_id' | 'is_active'
>

/** CSV 내보내기 전용 컬럼 — 목록에는 없는 등급(`poi_tier`)까지 포함한다 */
export const POI_EXPORT_COLUMNS =
  'id, name, category, latitude, longitude, radius_meters, poi_tier, linked_badge_id, is_active'

export type PoiExportRow = Pick<
  PoiRow,
  'id' | 'name' | 'category' | 'latitude' | 'longitude' | 'radius_meters' | 'poi_tier' | 'linked_badge_id' | 'is_active'
>

const POI_LIST_SORTS = ['name_asc', 'name_desc', 'created_desc', 'created_asc'] as const
export type PoiListSort = (typeof POI_LIST_SORTS)[number]

function isPoiListSort(value: string | undefined): value is PoiListSort {
  return !!value && (POI_LIST_SORTS as readonly string[]).includes(value)
}

export interface PoiListParams {
  /** {@link sanitizeSearchTerm}을 거친 검색어 — 빈 문자열이면 검색하지 않는다 */
  q: string
  category: string | 'all'
  status: 'active' | 'inactive' | 'all'
  tier: 1 | 2 | 'all'
  linked: 'yes' | 'no' | 'all'
  sort: PoiListSort
}

const DEFAULT_SORT: PoiListSort = 'created_desc'

/** URL(또는 API 쿼리) 파라미터 → 타입이 있는 목록 조건. 세 화면이 전부 이 함수를 거친다. */
export function parsePoiListParams(raw: Record<string, string | undefined>): PoiListParams {
  return {
    q: sanitizeSearchTerm(raw.q ?? ''),
    category: raw.category?.trim() || 'all',
    status: raw.status === 'active' || raw.status === 'inactive' ? raw.status : 'all',
    tier: raw.tier === '1' ? 1 : raw.tier === '2' ? 2 : 'all',
    linked: raw.linked === 'yes' || raw.linked === 'no' ? raw.linked : 'all',
    sort: isPoiListSort(raw.sort) ? raw.sort : DEFAULT_SORT,
  }
}

const SORT_COLUMN: Record<PoiListSort, readonly [string, boolean]> = {
  name_asc: ['name', true],
  name_desc: ['name', false],
  created_desc: ['created_at', false],
  created_asc: ['created_at', true],
}

export interface PoiListQueryResult<T> {
  data: T[] | null
  count: number | null
  error: { message: string } | null
}

/** Supabase 쿼리 빌더가 구조적으로 그대로 들어맞는 최소 인터페이스 — 호출부는
 *  `supabase.from('poi').select(...) as unknown as PoiListQuery<Row>`로 좁혀 쓴다. */
export interface PoiListQuery<T> {
  ilike(column: string, pattern: string): PoiListQuery<T>
  eq(column: string, value: string | boolean | number): PoiListQuery<T>
  not(column: string, operator: string, value: unknown): PoiListQuery<T>
  is(column: string, value: null): PoiListQuery<T>
  order(column: string, options?: { ascending?: boolean }): PoiListQuery<T>
  range(from: number, to: number): PromiseLike<PoiListQueryResult<T>>
}

/**
 * 검색·필터·정렬을 쿼리에 적용한다. `.select()`까지 호출한 쿼리를 넘기면 `.range()`를 부를
 * 수 있는 상태로 돌려준다 — 페이지 크기(목록)·상한(전체 선택 ID 조회)은 호출부가 정한다.
 * 보조 정렬로 `id`를 항상 붙인다(동순위 페이징 안정성, `list-counts.ts`와 동일한 이유).
 */
export function applyPoiListQuery<T>(query: PoiListQuery<T>, params: PoiListParams): PoiListQuery<T> {
  let next = query

  if (params.q) next = next.ilike('name', `%${params.q}%`)
  if (params.category !== 'all') next = next.eq('category', params.category)
  if (params.status !== 'all') next = next.eq('is_active', params.status === 'active')
  if (params.tier !== 'all') next = next.eq('poi_tier', params.tier)
  if (params.linked === 'yes') next = next.not('linked_badge_id', 'is', null)
  if (params.linked === 'no') next = next.is('linked_badge_id', null)

  const [column, ascending] = SORT_COLUMN[params.sort]
  next = next.order(column, { ascending })
  next = next.order('id', { ascending: true })

  return next
}
