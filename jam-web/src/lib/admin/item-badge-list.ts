/**
 * 아이템배지 발급현황 목록 쿼리 단일화(티켓 20260924_0950, 상위 티켓 §4.3) — 목록 페이지
 * (`admin/item-badges/page.tsx`)·전체 선택용 ID 조회(`api/admin/item-badges/ids`)·내보내기
 * (`api/admin/item-badges/export`)가 같은 필터·정렬 규칙을 쓰도록 `parseItemBadgeListParams`
 * (URL → 타입) + `applyItemBadgeListQuery`(타입 → 쿼리)로 나눈다.
 *
 * 예전에는 필터를 하나도 걸지 않으면 목록이 나오지 않았고(`hasFilter`), 100건까지만 보여 줬다.
 * 이제 필터가 없어도 전체 아이템배지 도안(`type = 'item'`)을 한 쪽 50건씩 보여 준다.
 * 발급 수 기준 정렬은 서버(DB) 정렬로 할 수 없어 정렬 선택지에 넣지 않는다.
 */
import type { BadgeRarity, BadgeRow } from '@/types/database'
import { sanitizeSearchTerm } from './search-term'
import { countRowsByKey, type CountRowsClient } from './list-counts'

/** 목록 표에 쓰는 컬럼만 select — `admin/item-badges/page.tsx`의 단일 출처 */
export const ITEM_BADGE_LIST_COLUMNS = 'id, name, image_url, rarity'

export type ItemBadgeListRow = Pick<BadgeRow, 'id' | 'name' | 'image_url' | 'rarity'>

/** CSV 내보내기 전용 컬럼 — 트라이브·컬렉션 이름을 붙이기 위한 참조 id까지 포함한다 */
export const ITEM_BADGE_EXPORT_COLUMNS = 'id, name, rarity, tribe_id, item_book_id'

export type ItemBadgeExportRow = Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'tribe_id' | 'item_book_id'>

const RARITIES: readonly BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

function isRarity(value: string | undefined): value is BadgeRarity {
  return !!value && (RARITIES as readonly string[]).includes(value)
}

const ITEM_BADGE_LIST_SORTS = ['name_asc', 'name_desc'] as const
export type ItemBadgeListSort = (typeof ITEM_BADGE_LIST_SORTS)[number]

function isItemBadgeListSort(value: string | undefined): value is ItemBadgeListSort {
  return !!value && (ITEM_BADGE_LIST_SORTS as readonly string[]).includes(value)
}

export interface ItemBadgeListParams {
  /** {@link sanitizeSearchTerm}을 거친 검색어 — 빈 문자열이면 검색하지 않는다 */
  q: string
  tribeId: string | undefined
  itemBookId: string | undefined
  rarity: BadgeRarity | undefined
  sort: ItemBadgeListSort
}

export const ITEM_BADGE_DEFAULT_SORT: ItemBadgeListSort = 'name_asc'

/** URL(또는 API 쿼리) 파라미터 → 타입이 있는 목록 조건. 세 곳이 전부 이 함수를 거친다.
 *  알 수 없는 등급 값은 "전체"로 본다. */
export function parseItemBadgeListParams(raw: Record<string, string | undefined>): ItemBadgeListParams {
  return {
    q: sanitizeSearchTerm(raw.q ?? ''),
    tribeId: raw.tribe_id?.trim() || undefined,
    itemBookId: raw.item_book_id?.trim() || undefined,
    rarity: isRarity(raw.rarity) ? raw.rarity : undefined,
    sort: isItemBadgeListSort(raw.sort) ? raw.sort : ITEM_BADGE_DEFAULT_SORT,
  }
}

export interface ItemBadgeListQueryResult<T> {
  data: T[] | null
  count: number | null
  error: { message: string } | null
}

/** Supabase 쿼리 빌더가 구조적으로 그대로 들어맞는 최소 인터페이스 — 호출부는
 *  `supabase.from('badges').select(...) as unknown as ItemBadgeListQuery<Row>`로 좁혀 쓴다. */
export interface ItemBadgeListQuery<T> {
  ilike(column: string, pattern: string): ItemBadgeListQuery<T>
  eq(column: string, value: string): ItemBadgeListQuery<T>
  order(column: string, options?: { ascending?: boolean }): ItemBadgeListQuery<T>
  range(from: number, to: number): PromiseLike<ItemBadgeListQueryResult<T>>
}

/**
 * 아이템배지 도안(`type = 'item'`) 조건과 검색·필터·정렬을 쿼리에 적용한다. 보조 정렬로 `id`를
 * 항상 붙인다(이름이 같은 도안 사이의 페이징 안정성).
 */
export function applyItemBadgeListQuery<T>(
  query: ItemBadgeListQuery<T>,
  params: ItemBadgeListParams
): ItemBadgeListQuery<T> {
  let next = query.eq('type', 'item')

  if (params.q) next = next.ilike('name', `%${params.q}%`)
  if (params.tribeId) next = next.eq('tribe_id', params.tribeId)
  if (params.itemBookId) next = next.eq('item_book_id', params.itemBookId)
  if (params.rarity) next = next.eq('rarity', params.rarity)

  next = next.order('name', { ascending: params.sort === 'name_asc' })
  next = next.order('id', { ascending: true })

  return next
}

/**
 * 도안별 총 발급 수. 행을 전부 받아 세면 PostgREST 상한(1,000행)에서 잘려 적게 나오므로
 * `countRowsByKey`로 끝까지 읽어 정확히 센다. 회수·소모된 개체도 발급 이력이라 센다
 * (감사 대상 — 예전 화면과 같은 기준).
 */
export function loadItemBadgeIssuedCounts(
  client: CountRowsClient,
  badgeIds: string[]
): Promise<Record<string, number>> {
  return countRowsByKey(client, 'inventory_items', 'badge_id', badgeIds)
}
