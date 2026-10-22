import { createServiceClient } from '@/lib/supabase/server'
import { Suspense } from 'react'
import Link from 'next/link'
import { Button } from '@/components/admin/ui/button'
import type { TribeRow, ItemBookRow, PoiCategoryRow } from '@/types/database'
import BadgeList from '@/components/admin/badges/BadgeList'
import BadgesFilterBar from './BadgesFilterBar'
import { DataTablePagination } from '@/components/admin/data-table/data-table-pagination'
import { ADMIN_LIST_PAGE_SIZE, totalPagesOf } from '@/lib/admin/list-params'
import { parseBadgeListParams, fetchBadgeListPage } from '@/lib/admin/badge-list-query'
import { logQueryError } from '@/lib/admin/queryError'
import { pickSingleQueryParams, type SearchParamsPromise } from '@/lib/searchParams'

/**
 * ⚠️ 쿼리 값의 타입을 `string`으로 좁히지 말 것 — 같은 키가 두 번 오면(`?page=1&page=2`)
 * Next가 배열을 넘긴다. `pickSingleQueryParams`가 배열을 「값 없음」으로 흡수해 이 아래
 * 모든 읽기가 단일 문자열만 보게 한다 (티켓 20260906_1312).
 */
interface AdminBadgesPageProps {
  searchParams: SearchParamsPromise
}

export default async function AdminBadgesPage({ searchParams }: AdminBadgesPageProps) {
  const rawParams = pickSingleQueryParams(await searchParams)
  const page = Math.max(1, parseInt(rawParams.page ?? '1', 10) || 1)
  const params = parseBadgeListParams(rawParams)

  const supabase = createServiceClient()

  const [
    { badges, total },
    { data: tribesRaw, error: tribesError },
    { data: itemBooksRaw, error: itemBooksError },
    { data: poiCategoriesRaw, error: poiCategoriesError },
  ] = await Promise.all([
    fetchBadgeListPage(supabase, params, page),
    supabase.from('tribes').select('id, name').order('name'),
    supabase.from('item_books').select('id, name, tribe_id').order('name'),
    supabase.from('poi_categories').select('slug, label').order('label'),
  ])
  // 필터 선택지·이름 표시용 부가 조회라 오류는 로그만 남긴다(주 조회 오류는 위 함수가 던진다, 티켓 20260925_1941)
  logQueryError(tribesError, 'badges/tribes')
  logQueryError(itemBooksError, 'badges/item-books')
  logQueryError(poiCategoriesError, 'badges/poi-categories')

  const totalPages = totalPagesOf(total, ADMIN_LIST_PAGE_SIZE)
  const tribeMap = new Map(
    ((tribesRaw ?? []) as Pick<TribeRow, 'id' | 'name'>[]).map((f) => [f.id, f.name])
  )
  const tribes = (tribesRaw ?? []) as Pick<TribeRow, 'id' | 'name'>[]
  const itemBooks = (itemBooksRaw ?? []) as Pick<ItemBookRow, 'id' | 'name' | 'tribe_id'>[]
  const poiCategories = (poiCategoriesRaw ?? []) as Pick<PoiCategoryRow, 'slug' | 'label'>[]

  const hasFilter = !!(
    params.q ||
    params.type ||
    params.rarity ||
    params.activityType ||
    params.poiCategory ||
    params.tribeId ||
    params.itemBookId ||
    params.conditionField ||
    params.adminCategory ||
    params.imageSource ||
    params.status !== 'active'
  )

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">배지</h1>
        <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
          <Link href="/admin/badges/bulk" className="w-full md:w-auto">
            <Button variant="outline" className="w-full md:w-auto h-11 md:h-10">
              배지 수정
            </Button>
          </Link>
          <Link href="/admin/badges/new" className="w-full md:w-auto">
            <Button className="w-full md:w-auto h-11 md:h-10">+ 배지 등록</Button>
          </Link>
        </div>
      </div>

      {/* 필터 */}
      <Suspense>
        <BadgesFilterBar
          tribes={tribes}
          itemBooks={itemBooks}
          poiCategories={poiCategories}
        />
      </Suspense>

      {/* 카운트 */}
      <div className="text-sm text-muted-foreground">
        총 {total}개
        {hasFilter && ' (필터 적용 중)'}
      </div>

      {/* 목록 — 데스크탑 테이블(BadgesTable.tsx)이 정렬·선택 상태를 URL과 동기화하려고
          useSearchParams()를 쓴다(20260826_014). BadgesFilterBar와 같은 이유로 Suspense로 감싼다. */}
      <Suspense>
        <BadgeList badges={badges} tribeMap={tribeMap} totalCount={total} />
      </Suspense>

      {/* 페이지네이션 */}
      <DataTablePagination page={page} totalPages={totalPages} />
    </div>
  )
}
