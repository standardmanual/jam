/**
 * 드랍 제외 관리 목록 쿼리 단일화(티켓 20260924_0948) — 목록 페이지(`admin/drop-policy/exclusions/
 * page.tsx`)와 전체 선택용 ID 조회(`api/admin/drop-policy/exclusions/ids`)가 같은 필터·정렬 규칙을
 * 쓰도록 `parseDropExclusionParams`(URL → 타입) + `applyBadgeExclusionQuery`·
 * `applyCollectionExclusionQuery`(타입 → 쿼리)로 나눈다(`poi-list-query.ts`와 같은 이유).
 *
 * 탭 두 개: 아이템배지(`badges`)와 컬렉션(`collections`). 두 탭은 서로 다른 표·선택·쪽 번호를 갖는다.
 */
import type { BadgeRow, ItemBookRow } from '@/types/database'
import { sanitizeSearchTerm } from './search-term'
import type { BulkResult } from './bulk/shared'

export const EXCLUSION_TABS = ['badges', 'collections'] as const
export type ExclusionTab = (typeof EXCLUSION_TABS)[number]

export function parseExclusionTab(value: string | undefined | null): ExclusionTab {
  return value === 'collections' ? 'collections' : 'badges'
}

export const BADGE_EXCLUSION_COLUMNS = 'id, name, image_url, rarity, item_book_id, drop_excluded'
export type ExclusionBadgeRow = Pick<
  BadgeRow,
  'id' | 'name' | 'image_url' | 'rarity' | 'item_book_id' | 'drop_excluded'
>

export const COLLECTION_EXCLUSION_COLUMNS = 'id, name, tribe_id, drop_excluded'
export type ExclusionCollectionRow = Pick<ItemBookRow, 'id' | 'name' | 'tribe_id' | 'drop_excluded'>

/** 탭별로 허용하는 정렬 — 컬렉션에는 등급이 없어 이름순만 있다 */
const SORTS_BY_TAB: Record<ExclusionTab, readonly string[]> = {
  badges: ['name_asc', 'name_desc', 'rarity_asc', 'rarity_desc'],
  collections: ['name_asc', 'name_desc'],
}
const DEFAULT_SORT = 'name_asc'

export type ExclusionStatus = 'excluded' | 'included' | 'all'

export interface DropExclusionParams {
  tab: ExclusionTab
  /** {@link sanitizeSearchTerm}을 거친 이름 검색어 — 빈 문자열이면 검색하지 않는다 */
  q: string
  /** 트라이브 → 컬렉션 연쇄 필터의 앞 단계 */
  tribeId: string | null
  /** 아이템배지 탭 전용 — 컬렉션 필터 */
  itemBookId: string | null
  status: ExclusionStatus
  sort: string
}

/** URL(또는 API 쿼리) 파라미터 → 타입이 있는 목록 조건. 목록·전체 선택이 전부 이 함수를 거친다. */
export function parseDropExclusionParams(raw: Record<string, string | undefined>): DropExclusionParams {
  const tab = parseExclusionTab(raw.tab)
  return {
    tab,
    q: sanitizeSearchTerm(raw.q ?? ''),
    tribeId: raw.tribe_id?.trim() || null,
    itemBookId: tab === 'badges' ? raw.item_book_id?.trim() || null : null,
    status: raw.status === 'excluded' || raw.status === 'included' ? raw.status : 'all',
    sort: raw.sort && SORTS_BY_TAB[tab].includes(raw.sort) ? raw.sort : DEFAULT_SORT,
  }
}

const SORT_COLUMN: Record<string, readonly [string, boolean]> = {
  name_asc: ['name', true],
  name_desc: ['name', false],
  // badge_rarity는 열거형이라 DB가 선언 순서(common → rare → epic → mystic)로 정렬한다
  rarity_asc: ['rarity', true],
  rarity_desc: ['rarity', false],
}

export interface ExclusionQueryResult<T> {
  data: T[] | null
  count: number | null
  error: { message: string } | null
}

/** Supabase 쿼리 빌더가 구조적으로 그대로 들어맞는 최소 인터페이스 — 호출부는
 *  `supabase.from(...).select(...) as unknown as ExclusionQuery<Row>`로 좁혀 쓴다. */
export interface ExclusionQuery<T> {
  ilike(column: string, pattern: string): ExclusionQuery<T>
  eq(column: string, value: string | boolean): ExclusionQuery<T>
  in(column: string, values: string[]): ExclusionQuery<T>
  is(column: string, value: null): ExclusionQuery<T>
  not(column: string, operator: string, value: unknown): ExclusionQuery<T>
  order(column: string, options?: { ascending?: boolean }): ExclusionQuery<T>
  range(from: number, to: number): PromiseLike<ExclusionQueryResult<T>>
}

/** 아이템배지 탭이 다루는 컬렉션 범위 — 컬렉션에 속한 배지 전체, 또는 특정 컬렉션들 */
export type BadgeCollectionScope = { kind: 'all' } | { kind: 'collections'; ids: string[] }

/** 트라이브 필터에 해당하는 컬렉션 id를 읽는 최소 인터페이스 */
export interface TribeCollectionsClient {
  from(table: 'item_books'): {
    select(columns: 'id'): {
      eq(column: string, value: string): PromiseLike<{ data: { id: string }[] | null; error: { message: string } | null }>
    }
  }
}

/**
 * 아이템배지 탭의 컬렉션 범위를 정한다. 컬렉션을 골랐으면 그 컬렉션 하나, 트라이브만 골랐으면 그
 * 트라이브의 컬렉션들, 아무것도 안 골랐으면 컬렉션에 속한 배지 전체다(이전 화면과 같은 범위).
 */
export async function resolveBadgeCollectionScope(
  client: TribeCollectionsClient,
  params: DropExclusionParams
): Promise<BadgeCollectionScope> {
  if (params.itemBookId) return { kind: 'collections', ids: [params.itemBookId] }
  if (!params.tribeId) return { kind: 'all' }

  const { data, error } = await client.from('item_books').select('id').eq('tribe_id', params.tribeId)
  if (error) throw new Error(error.message)
  return { kind: 'collections', ids: (data ?? []).map((row) => row.id) }
}

function applyStatus<T>(query: ExclusionQuery<T>, status: ExclusionStatus): ExclusionQuery<T> {
  return status === 'all' ? query : query.eq('drop_excluded', status === 'excluded')
}

function applySort<T>(query: ExclusionQuery<T>, sort: string): ExclusionQuery<T> {
  const [column, ascending] = SORT_COLUMN[sort] ?? SORT_COLUMN[DEFAULT_SORT]
  // 보조 정렬로 id를 항상 붙인다(동순위 페이징 안정성, `poi-list-query.ts`와 같은 이유)
  return query.order(column, { ascending }).order('id', { ascending: true })
}

/** 아이템배지 탭 쿼리 — 삭제되지 않은 아이템배지만, 이름 검색·상태·정렬을 적용한다 */
export function applyBadgeExclusionQuery<T>(
  query: ExclusionQuery<T>,
  params: DropExclusionParams,
  scope: BadgeCollectionScope
): ExclusionQuery<T> {
  let next = query.eq('type', 'item').is('deleted_at', null)

  if (scope.kind === 'all') next = next.not('item_book_id', 'is', null)
  else next = next.in('item_book_id', scope.ids)

  if (params.q) next = next.ilike('name', `%${params.q}%`)
  next = applyStatus(next, params.status)
  return applySort(next, params.sort)
}

/** 컬렉션 탭 쿼리 — 트라이브 필터, 이름 검색·상태·정렬을 적용한다 */
export function applyCollectionExclusionQuery<T>(
  query: ExclusionQuery<T>,
  params: DropExclusionParams
): ExclusionQuery<T> {
  let next = query

  if (params.tribeId) next = next.eq('tribe_id', params.tribeId)
  if (params.q) next = next.ilike('name', `%${params.q}%`)
  next = applyStatus(next, params.status)
  return applySort(next, params.sort)
}

/** 트라이브 필터에 따라 컬렉션 선택지를 좁힌다 — 트라이브 → 컬렉션 연쇄 필터 */
export function collectionOptionsForTribe<T extends { tribe_id: string | null }>(
  collections: T[],
  tribeId: string | null
): T[] {
  return tribeId ? collections.filter((c) => c.tribe_id === tribeId) : collections
}

/**
 * 일괄 처리 결과를 표준 응답 형태로 나눈다. `eligibleIds`(대상 종류가 맞는 id) 밖은 `ineligibleReason`
 * 으로, 대상이지만 실제로 갱신되지 않은 id는 "대상을 찾을 수 없음"으로 건너뛴다.
 */
export function splitExclusionResult(
  ids: string[],
  eligibleIds: string[],
  updatedIds: string[],
  ineligibleReason: string
): BulkResult {
  const eligible = new Set(eligibleIds)
  const updated = new Set(updatedIds)
  return {
    processed: ids.filter((id) => updated.has(id)),
    skipped: ids
      .filter((id) => !updated.has(id))
      .map((id) => ({ id, reason: eligible.has(id) ? '대상을 찾을 수 없음' : ineligibleReason })),
  }
}
