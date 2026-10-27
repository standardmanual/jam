import { Suspense } from 'react'
import { createServiceClient } from '@/lib/supabase/server'
import { ItemBadgeSearchBar } from './ItemBadgeSearchBar'
import { ItemBadgesTable } from './ItemBadgesTable'
import { DataTablePagination } from '@/components/admin/data-table/data-table-pagination'
import { pickSingleQueryParams, type SearchParamsPromise } from '@/lib/searchParams'
import { ADMIN_LIST_PAGE_SIZE, pageRange, totalPagesOf } from '@/lib/admin/list-params'
import type { CountRowsClient } from '@/lib/admin/list-counts'
import { logQueryError, throwOnQueryError } from '@/lib/admin/queryError'
import {
  ITEM_BADGE_LIST_COLUMNS,
  parseItemBadgeListParams,
  applyItemBadgeListQuery,
  loadItemBadgeIssuedCounts,
  type ItemBadgeListRow,
  type ItemBadgeListQuery,
} from '@/lib/admin/item-badge-list'

/**
 * ⚠️ 쿼리 값의 타입을 `string`으로 좁히지 말 것 — 같은 키가 두 번 오면(`?page=1&page=2`)
 * Next가 배열을 넘긴다. `pickSingleQueryParams`가 배열을 「값 없음」으로 흡수해 이 아래
 * 모든 읽기가 단일 문자열만 보게 한다 (티켓 20260906_1312).
 */
interface Props {
  searchParams: SearchParamsPromise
}

/**
 * 아이템배지 현황 — 배지 검색 화면(티켓 20260829_2139, 열린 결정 2·3; 메뉴명 20260830_1242 변경).
 *
 * `/admin/badges`(도안 CRUD)와는 다른 잡스토리(조회/감사)이자 다른 객체(Badge 도안이
 * 아니라 InventoryItem 개체)를 다루므로 독립된 최상위 메뉴로 뒀다. 배지(도안)를 먼저
 * 고르고, 그 배지로 발급된 일련번호 목록은 `[badgeId]` 하위 화면에서 본다.
 *
 * 활성/비활성(deleted_at) 구분 없이 전체 아이템배지를 대상으로 한다 — 회수된 배지라도
 * 과거에 발급된 개체의 이력은 감사 대상이다.
 *
 * 20260924_0950: 필터가 없어도 목록을 보여 주고(예전에는 필터를 걸어야 나왔다), 100건 제한을
 * 번호 페이지 이동(50건)으로 바꿨다. 발급 수는 `countRowsByKey`로 정확히 센다.
 */
export default async function ItemBadgesSearchPage({ searchParams }: Props) {
  const rawParams = pickSingleQueryParams(await searchParams)
  const params = parseItemBadgeListParams(rawParams)
  const page = Math.max(1, parseInt(rawParams.page ?? '1', 10) || 1)

  const supabase = createServiceClient()

  let query = supabase
    .from('badges')
    .select(ITEM_BADGE_LIST_COLUMNS, { count: 'exact' }) as unknown as ItemBadgeListQuery<ItemBadgeListRow>
  query = applyItemBadgeListQuery(query, params)
  const [from, to] = pageRange(page, ADMIN_LIST_PAGE_SIZE)

  const [
    { data: badgesRaw, count, error: badgesError },
    { data: tribesRaw, error: tribesError },
    { data: itemBooksRaw, error: itemBooksError },
  ] = await Promise.all([
    query.range(from, to),
    supabase.from('tribes').select('id, name').order('name'),
    supabase.from('item_books').select('id, name, tribe_id').order('name'),
  ])
  throwOnQueryError(badgesError, 'item-badges')
  logQueryError(tribesError, 'item-badges/tribes')
  logQueryError(itemBooksError, 'item-badges/item-books')
  const badges = badgesRaw ?? []
  const tribes = (tribesRaw ?? []) as { id: string; name: string }[]
  const itemBooks = (itemBooksRaw ?? []) as { id: string; name: string; tribe_id: string | null }[]

  const issuedCountByBadge = await loadItemBadgeIssuedCounts(
    supabase as unknown as CountRowsClient,
    badges.map((b) => b.id)
  )

  const totalCount = count ?? 0

  return (
    <div className="w-full p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">아이템배지</h1>
        <p className="text-muted-foreground text-sm mt-1">
          배지별 발급된 일련번호와 소유 현황을 확인해요
        </p>
      </div>

      <Suspense>
        <ItemBadgeSearchBar tribes={tribes} itemBooks={itemBooks} />
      </Suspense>

      <div className="text-sm text-muted-foreground">총 {totalCount}종</div>

      <ItemBadgesTable badges={badges} issuedCountByBadge={issuedCountByBadge} totalCount={totalCount} />

      <DataTablePagination page={page} totalPages={totalPagesOf(totalCount, ADMIN_LIST_PAGE_SIZE)} />
    </div>
  )
}
