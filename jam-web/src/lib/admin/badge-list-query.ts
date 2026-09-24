/**
 * 배지 목록 쿼리 단일화(티켓 20260924_0944, 상위 티켓 §4.1 배지 행) — 목록 페이지
 * (`admin/badges/page.tsx`)·전체 선택용 ID 조회(`api/admin/badges/ids`)·내보내기
 * (`api/admin/badges/export`)가 같은 필터 규칙(`parseBadgeListParams`)을 쓰도록 모은다.
 * `admin/badges/page.tsx`의 `fetchAllRows`·파라미터 해석·3갈래 조회(체크인 지점 카테고리
 * 메모리 필터 / 계열·레벨 전량 정렬 / 기본 DB 정렬)를 그대로 옮겼다 — 동작은 바꾸지 않는다.
 *
 * 검색어는 {@link sanitizeSearchTerm}을 거친다(기존에는 `.or()`에 정제 없이 들어갔다).
 */
import type { createServiceClient } from '@/lib/supabase/server'
import type { BadgeType, BadgeRarity } from '@/types/database'
import type { Json } from '@/types/database.generated'
import type { BadgeListRow } from '@/components/admin/badges/BadgeList'
import { sanitizeSearchTerm } from './search-term'
import { UNASSIGNED_POI_CATEGORY, type AdminCategory } from './badge-labels'
import { ADMIN_LIST_PAGE_SIZE } from './list-params'
import {
  badgeUsesConditionField,
  compareBadgeListRows,
  parseAdminCategoryFilter,
  parseBadgeListSort,
  parseConditionFieldFilter,
  requiresFullFetchSort,
  type BadgeListSort,
  type BadgeListSortRow,
} from './badge-list-view'
import type { ConditionKey } from '@/lib/badge-engine/conditionRegistry'

type ServiceClient = ReturnType<typeof createServiceClient>

/** 목록(카드/테이블)에 실제로 쓰는 컬럼만 select(20260826_011 A8) */
export const BADGE_LIST_COLUMNS =
  'id, name, description, type, rarity, image_url, condition_json, activity_types, patch_available, patch_price_krw, tribe_id, deleted_at'

/** 계열순·레벨순 메모리 비교에만 필요한 추가 컬럼(티켓 20260905_0032 C-2) */
export const BADGE_SORT_COLUMNS = 'level, family_key, sort_order, created_at'

/** "필터 결과 전체 선택" 상한(상위 티켓 §6 결정 1) */
export const SELECT_ALL_CAP = 1000

export interface BadgeListParams {
  q: string
  type: BadgeType | undefined
  rarity: BadgeRarity | undefined
  activityType: string | undefined
  poiCategory: string | undefined
  tribeId: string | undefined
  itemBookId: string | undefined
  status: 'active' | 'inactive' | 'all'
  sort: BadgeListSort
  conditionField: ConditionKey | null
  adminCategory: AdminCategory | null
}

/**
 * URL(또는 API 쿼리) 파라미터 → 타입이 있는 목록 조건. 세 화면이 전부 이 함수를 거친다.
 *
 * ⚠️ `status`는 `'all'`을 `'active'`로 되돌리지 않는다 — 예전 버그(`BadgesFilterBar.tsx`가
 * `'all'`을 URL에서 지워 버려 이 함수 이전 단계에서 이미 기본값으로 뭉개졌다)는 필터 바 쪽의
 * URL 갱신 로직(`useListParams`의 `defaults: { status: 'active' }`)에서 고친다 — 이 함수
 * 자체는 처음부터 `status=all`을 그대로 존중했다.
 */
export function parseBadgeListParams(raw: Record<string, string | undefined>): BadgeListParams {
  return {
    q: sanitizeSearchTerm(raw.q ?? ''),
    type: raw.type as BadgeType | undefined,
    rarity: raw.rarity as BadgeRarity | undefined,
    activityType: raw.activity_type,
    poiCategory: raw.poi_category,
    tribeId: raw.tribe_id,
    itemBookId: raw.item_book_id,
    status: raw.status === 'inactive' || raw.status === 'all' ? raw.status : 'active',
    sort: parseBadgeListSort(raw.sort),
    conditionField: parseConditionFieldFilter(raw.condition_field),
    adminCategory: parseAdminCategoryFilter(raw.admin_category),
  }
}

type RangeQuery<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>

async function fetchAllRows<T>(query: RangeQuery<T>): Promise<T[]> {
  const rows: T[] = []
  let from = 0
  // PostgREST 기본 응답 상한(1000행) 대응 — 체크인 배지 카테고리 필터·계열/레벨 전량 정렬은
  // 1000행을 넘는 전체 집합을 메모리에서 다뤄야 해서 이 크기로 끝까지 나눠 받는다.
  const CHUNK = 1000
  for (;;) {
    const { data, error } = await query(from, from + CHUNK - 1)
    if (error) {
      console.error('[admin/badges] 목록 전체 조회 오류(부분 목록으로 이어감):', error)
      break
    }
    const page = data ?? []
    rows.push(...page)
    if (page.length < CHUNK) break
    from += CHUNK
  }
  return rows
}

/** Supabase 쿼리 빌더가 구조적으로 그대로 들어맞는 최소 인터페이스(`poi-list-query.ts`와 동일 관례) */
export interface BadgeListQuery<T> {
  is(column: string, value: null): BadgeListQuery<T>
  not(column: string, operator: string, value: unknown): BadgeListQuery<T>
  eq(column: string, value: string): BadgeListQuery<T>
  or(filters: string): BadgeListQuery<T>
  contains(column: string, value: string[]): BadgeListQuery<T>
  order(column: string, options?: { ascending?: boolean }): BadgeListQuery<T>
  range(from: number, to: number): PromiseLike<{ data: T[] | null; count: number | null; error: { message: string } | null }>
}

/**
 * 검색·필터를 쿼리에 적용한다(정렬은 호출부가 각자 규칙대로 건다 — 기본 DB 정렬 분기와
 * 전량 정렬 분기가 정렬 방식 자체가 다르기 때문). 체크인 지점 카테고리 필터
 * ({@link fetchCheckinCategoryCandidates})는 이 함수를 쓰지 않는다 — DB 조인 하나로 표현할
 * 수 없어 메모리에서 따로 계산한다.
 */
function applyBadgeListFilters<T>(query: BadgeListQuery<T>, params: BadgeListParams): BadgeListQuery<T> {
  let next = query

  if (params.status === 'active') next = next.is('deleted_at', null)
  else if (params.status === 'inactive') next = next.not('deleted_at', 'is', null)
  // status === 'all' → 필터 없음

  if (params.type) next = next.eq('type', params.type)
  if (params.rarity) next = next.eq('rarity', params.rarity)
  if (params.adminCategory) next = next.eq('admin_category', params.adminCategory)
  if (params.q) next = next.or(`name.ilike.%${params.q}%,description.ilike.%${params.q}%`)

  if (params.activityType) next = next.contains('activity_types', [params.activityType])
  if (params.tribeId) next = next.eq('tribe_id', params.tribeId)
  if (params.itemBookId) next = next.eq('item_book_id', params.itemBookId)
  if (params.conditionField) next = next.not(`condition_json->>${params.conditionField}`, 'is', null)

  return next
}

type CheckinCandidateRow = Omit<BadgeListRow, 'activity_types' | 'condition_json'> &
  Omit<BadgeListSortRow, 'name' | 'rarity' | 'activity_types'> & {
    activity_types: string[]
    condition_json: Json
    category: string | null
    admin_category: string | null
  }

/**
 * 지점 카테고리 필터(체크인 배지 전용, 티켓 20260830_1510·20260830_1522) 대상 후보를 전량
 * 조회 + 메모리 필터링으로 계산한다. `badges.category`(우선) → 연결된 `poi.category`(폴백)
 * 순으로 유효 카테고리를 판정하는 로직은 DB 조인 하나로 표현할 수 없다 — 매칭된 id를
 * `.in()`에 그대로 넘기면 카테고리 하나가 900개를 넘을 때 URL이 잘리는 문제도 있다
 * (티켓 20260825_035).
 */
async function fetchCheckinCategoryCandidates(
  supabase: ServiceClient,
  params: BadgeListParams,
  isUnassignedPoiFilter: boolean
): Promise<CheckinCandidateRow[]> {
  const [allCheckinRows, linkedPoiRows] = await Promise.all([
    fetchAllRows<CheckinCandidateRow>((from, to) =>
      supabase
        .from('badges')
        .select(`${BADGE_LIST_COLUMNS}, ${BADGE_SORT_COLUMNS}, category, admin_category`)
        .eq('type', 'checkin')
        .order('id')
        .range(from, to)
    ),
    fetchAllRows<{ linked_badge_id: string; category: string }>((from, to) =>
      supabase
        .from('poi')
        .select('linked_badge_id, category')
        .not('linked_badge_id', 'is', null)
        .order('linked_badge_id')
        .range(from, to)
    ),
  ])

  const poiCategoryByBadge = new Map<string, string>()
  for (const row of linkedPoiRows) {
    if (!poiCategoryByBadge.has(row.linked_badge_id)) poiCategoryByBadge.set(row.linked_badge_id, row.category)
  }

  let candidates = allCheckinRows.filter((b) => {
    const effectiveCategory = b.category ?? poiCategoryByBadge.get(b.id) ?? null
    return isUnassignedPoiFilter ? effectiveCategory === null : effectiveCategory === params.poiCategory
  })

  // 나머지 필터 — `applyBadgeListFilters`(DB 필터 분기)와 동일한 조건을 메모리에서 적용
  if (params.status === 'active') candidates = candidates.filter((b) => !b.deleted_at)
  else if (params.status === 'inactive') candidates = candidates.filter((b) => !!b.deleted_at)
  if (params.rarity) candidates = candidates.filter((b) => b.rarity === params.rarity)
  if (params.q) {
    const qLower = params.q.toLowerCase()
    candidates = candidates.filter(
      (b) => b.name.toLowerCase().includes(qLower) || (b.description ?? '').toLowerCase().includes(qLower)
    )
  }
  if (params.conditionField) {
    const conditionField = params.conditionField
    candidates = candidates.filter((b) =>
      badgeUsesConditionField(b.condition_json as Record<string, unknown> | null, conditionField)
    )
  }
  if (params.adminCategory) candidates = candidates.filter((b) => b.admin_category === params.adminCategory)

  return candidates
}

function toBadgeListRow(c: CheckinCandidateRow): BadgeListRow {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    type: c.type,
    rarity: c.rarity,
    image_url: c.image_url,
    condition_json: c.condition_json as BadgeListRow['condition_json'],
    activity_types: c.activity_types as BadgeListRow['activity_types'],
    patch_available: c.patch_available,
    patch_price_krw: c.patch_price_krw,
    tribe_id: c.tribe_id,
    deleted_at: c.deleted_at,
  }
}

/** 목록 페이지 조회 — 서버 컴포넌트(`admin/badges/page.tsx`)가 그대로 렌더링할 한 쪽 분량 */
export async function fetchBadgeListPage(
  supabase: ServiceClient,
  params: BadgeListParams,
  page: number
): Promise<{ badges: BadgeListRow[]; total: number }> {
  const isUnassignedPoiFilter = params.type === 'checkin' && params.poiCategory === UNASSIGNED_POI_CATEGORY
  const filterByCheckinCategory = params.type === 'checkin' && !!params.poiCategory
  const from = (Math.max(1, page) - 1) * ADMIN_LIST_PAGE_SIZE

  if (filterByCheckinCategory) {
    const candidates = await fetchCheckinCategoryCandidates(supabase, params, isUnassignedPoiFilter)
    candidates.sort(compareBadgeListRows(params.sort))
    return {
      total: candidates.length,
      badges: candidates.slice(from, from + ADMIN_LIST_PAGE_SIZE).map(toBadgeListRow),
    }
  }

  if (requiresFullFetchSort(params.sort)) {
    // 계열순·레벨순은 DB가 정렬할 수 없다(「0은 맨 뒤」·계열 키 폴백·레벨 없는 배지 맨 뒤) —
    // 전량을 가져와 메모리에서 정렬·페이지네이션한다.
    type SortableRow = BadgeListRow & Omit<BadgeListSortRow, 'name' | 'rarity' | 'activity_types'>
    const rows = await fetchAllRows<SortableRow>(async (rangeFrom, rangeTo) => {
      let query = supabase
        .from('badges')
        .select(`${BADGE_LIST_COLUMNS}, ${BADGE_SORT_COLUMNS}`) as unknown as BadgeListQuery<SortableRow>
      query = applyBadgeListFilters(query, params)
      const { data, error } = await query.order('id').range(rangeFrom, rangeTo)
      return { data, error }
    })
    rows.sort(compareBadgeListRows(params.sort))
    return { total: rows.length, badges: rows.slice(from, from + ADMIN_LIST_PAGE_SIZE) }
  }

  let query = supabase
    .from('badges')
    .select(`${BADGE_LIST_COLUMNS}, ${BADGE_SORT_COLUMNS}`, { count: 'exact' }) as unknown as BadgeListQuery<BadgeListRow>
  query = applyBadgeListFilters(query, params)

  switch (params.sort) {
    case 'name_asc': query = query.order('name', { ascending: true }); break
    case 'name_desc': query = query.order('name', { ascending: false }); break
    case 'created_asc': query = query.order('created_at', { ascending: true }); break
    default: query = query.order('created_at', { ascending: false })
  }

  const { data: badgesRaw, count } = await query.range(from, from + ADMIN_LIST_PAGE_SIZE - 1)
  return { badges: (badgesRaw ?? []) as BadgeListRow[], total: count ?? 0 }
}

/**
 * "이 조건의 N건 모두 선택" 배너·내보내기가 부르는 전체 ID 조회(상한 이내, 상위 티켓 §6
 * 결정 1). 목록 페이지와 같은 필터(`parseBadgeListParams`)를 써서, 화면에 보이는 "총 N개"와
 * 여기서 돌려주는 건수가 항상 같다. 정렬은 필요 없다(선택 대상 집합만 필요).
 */
export async function fetchBadgeListIds(
  supabase: ServiceClient,
  params: BadgeListParams,
  cap: number = SELECT_ALL_CAP
): Promise<{ ids: string[]; total: number }> {
  const isUnassignedPoiFilter = params.type === 'checkin' && params.poiCategory === UNASSIGNED_POI_CATEGORY
  const filterByCheckinCategory = params.type === 'checkin' && !!params.poiCategory

  if (filterByCheckinCategory) {
    const candidates = await fetchCheckinCategoryCandidates(supabase, params, isUnassignedPoiFilter)
    return { ids: candidates.slice(0, cap).map((c) => c.id), total: candidates.length }
  }

  let query = supabase.from('badges').select('id', { count: 'exact' }) as unknown as BadgeListQuery<{ id: string }>
  query = applyBadgeListFilters(query, params)
  const { data, count, error } = await query.range(0, cap - 1)
  if (error) {
    console.error('[admin/badges] id 목록 조회 오류:', error)
    return { ids: [], total: 0 }
  }
  return { ids: (data ?? []).map((r) => r.id), total: count ?? 0 }
}
