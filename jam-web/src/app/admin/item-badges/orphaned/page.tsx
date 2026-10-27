import { createServiceClient } from '@/lib/supabase/server'
import { OrphanedItemsTable } from './OrphanedItemsTable'
import { DataTablePagination } from '@/components/admin/data-table/data-table-pagination'
import { pickSingleQueryParams, type SearchParamsPromise } from '@/lib/searchParams'
import { ADMIN_LIST_PAGE_SIZE, pageRange, totalPagesOf } from '@/lib/admin/list-params'
import { loadOrphanedRows, parseOrphanedListParams, sortOrphanedRows } from '@/lib/admin/orphaned-items-query'

/**
 * ⚠️ 쿼리 값의 타입을 `string`으로 좁히지 말 것 — 같은 키가 두 번 오면(`?page=1&page=2`)
 * Next가 배열을 넘긴다. `pickSingleQueryParams`가 배열을 「값 없음」으로 흡수해 이 아래
 * 모든 읽기가 단일 문자열만 보게 한다 (티켓 20260906_1312).
 */
interface Props {
  searchParams: SearchParamsPromise
}

/**
 * "소유자 없음" 아이템배지 전체 목록(티켓 20260830_0104) — 배지(도안)를 먼저 선택하지
 * 않고, 전체 배지에 걸쳐 소유자를 잃은 개체만 모아 조회한다. 폐기·재배정은
 * `_orphaned-actions/`의 액션 컴포넌트(서버 일괄 처리 `api/admin/item-badges/orphaned/bulk`)를
 * 그대로 쓴다 — 이 화면은 접근 경로(목록)를 담당한다.
 *
 * 20260924_0950: 행 조회·"소유자 없음" 판정·정렬을 `lib/admin/orphaned-items-query.ts`로
 * 옮겼다(판정 근거와 이력은 그 파일 주석). 정렬은 서버에서 전체 행에 적용한 뒤 쪽을 자르므로
 * 쪽을 넘어 일관된다.
 */
export default async function OrphanedItemsPage({ searchParams }: Props) {
  const rawParams = pickSingleQueryParams(await searchParams)
  const { sort } = parseOrphanedListParams(rawParams)
  const page = Math.max(1, parseInt(rawParams.page ?? '1', 10) || 1)

  const supabase = createServiceClient()

  const allRows = sortOrphanedRows(await loadOrphanedRows(supabase), sort)
  const totalCount = allRows.length
  const totalPages = totalPagesOf(totalCount, ADMIN_LIST_PAGE_SIZE)
  const clampedPage = Math.min(page, totalPages)
  const [from, to] = pageRange(clampedPage, ADMIN_LIST_PAGE_SIZE)
  const pageRows = allRows.slice(from, to + 1)

  return (
    <div className="w-full p-4 md:p-8 space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">미소유 배지</h1>
        <p className="text-muted-foreground text-sm mt-1">
          회원 탈퇴 등으로 소유자가 지정되지 않은 아이템배지 목록이에요
        </p>
      </div>

      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">총 {totalCount}개</div>

        <OrphanedItemsTable rows={pageRows} totalCount={totalCount} />

        <DataTablePagination page={clampedPage} totalPages={totalPages} />
      </div>
    </div>
  )
}
