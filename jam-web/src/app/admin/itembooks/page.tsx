import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Suspense } from 'react'
import { Button } from '@/components/admin/ui/button'
import type { BadgeRow, TribeRow } from '@/types/database'
import { ItemBookList } from '@/components/admin/itembooks/ItemBookList'
import ItemBookFilters from './ItemBookFilters'
import { DataTablePagination } from '@/components/admin/data-table/data-table-pagination'
import { ADMIN_LIST_PAGE_SIZE, totalPagesOf } from '@/lib/admin/list-params'
import { countRowsByKey, type CountRowsClient } from '@/lib/admin/list-counts'
import { logQueryError } from '@/lib/admin/queryError'
import {
  DEFAULT_ITEM_BOOK_STATUS,
  fetchItemBookListPage,
  parseItemBookListParams,
} from '@/lib/admin/itembook-list-query'
import { pickSingleQueryParams, type SearchParamsPromise } from '@/lib/searchParams'

/**
 * ⚠️ 쿼리 값의 타입을 `string`으로 좁히지 말 것 — 같은 키가 두 번 오면(`?page=1&page=2`)
 * Next가 배열을 넘긴다. `pickSingleQueryParams`가 배열을 「값 없음」으로 흡수해 이 아래
 * 모든 읽기가 단일 문자열만 보게 한다 (티켓 20260906_1312).
 */
interface AdminItemBooksPageProps {
  searchParams: SearchParamsPromise
}

export default async function AdminItemBooksPage({ searchParams }: AdminItemBooksPageProps) {
  const rawParams = pickSingleQueryParams(await searchParams)
  const page = Math.max(1, parseInt(rawParams.page ?? '1', 10) || 1)
  const params = parseItemBookListParams(rawParams)

  const supabase = createServiceClient()

  // 검색·트라이브·상태 필터와 정렬·페이지는 `itembook-list-query.ts`가 단일 출처다 — 전체 선택용 ID
  // 조회(`api/admin/itembooks/ids`)가 같은 규칙을 쓴다(티켓 20260924_0945).
  const [{ books, total }, { data: tribesRaw, error: tribesError }] = await Promise.all([
    fetchItemBookListPage(supabase, params, page),
    supabase.from('tribes').select('id, name'),
  ])
  // 트라이브 이름은 표시용 부가 조회라 오류는 로그만 남긴다(주 조회 오류는 위 함수가 던진다, 티켓 20260925_1941)
  logQueryError(tribesError, 'itembooks/tribes')

  const totalPages = totalPagesOf(total, ADMIN_LIST_PAGE_SIZE)
  const tribes = (tribesRaw ?? []) as Pick<TribeRow, 'id' | 'name'>[]
  const tribeMap = new Map(tribes.map((f) => [f.id, f.name]))

  // 이 페이지에 보여줄 책들이 참조하는 배지(필요/보상)의 이름만 bounded로 조회 — 배지 테이블
  // 필터 없이 전량(현재 5585건) 조회하면 PostgREST 기본 응답 상한(1000행)에 걸려 뒤쪽 배지가
  // 통째로 빠지는 문제가 있었다(티켓 20260825_029). 페이지네이션 전환 후에는 현재 페이지의
  // 책들만 대상으로 하므로 범위가 더 좁아진다.
  const labelIds = [
    ...new Set(
      books.flatMap((b) => [b.required_activity_badge_id, b.reward_badge_id]).filter((id): id is string => !!id)
    ),
  ]
  const bookIds = books.map((b) => b.id)
  const [{ data: badgesRaw }, itemBadgeCounts] = await Promise.all([
    labelIds.length > 0
      ? supabase.from('badges').select('id, name').in('id', labelIds)
      : Promise.resolve({ data: [] as Pick<BadgeRow, 'id' | 'name'>[] }),
    // [20260902_1043] deleted_at 필터를 두지 않아 배정 관계(item_book_id)가 남아있는 배지는
    // 활성/비활성 무관하게 전부 센다 — 컬렉션을 비활성화해도 목록 페이지의 이 카운트가
    // 0으로 사라지면 안 된다([id]/page.tsx의 배지 슬롯 관리 목록과 동일한 원칙). 배지 행을
    // 통째로 불러 세면 1,000행 상한에 걸려 잘리므로 `countRowsByKey`로 센다(티켓 20260924_0945).
    countRowsByKey(supabase as unknown as CountRowsClient, 'badges', 'item_book_id', bookIds, (q) =>
      q.eq('type', 'item')
    ),
  ])
  const badges = (badgesRaw ?? []) as Pick<BadgeRow, 'id' | 'name'>[]
  const badgeMap = new Map(badges.map((b) => [b.id, b.name]))
  const itemBadgeCountMap = new Map(Object.entries(itemBadgeCounts))

  const hasFilter = !!(params.q || params.tribe || params.status !== DEFAULT_ITEM_BOOK_STATUS)
  const emptyMessage = hasFilter ? '조건에 맞는 컬렉션이 없습니다.' : '등록된 컬렉션이 없습니다.'

  return (
    <div className="space-y-6 p-4 md:p-8">
      {/* 헤더 */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-bold md:text-3xl">컬렉션 관리</h1>
        <Link href="/admin/itembooks/new">
          <Button className="w-full md:w-auto">
            + 컬렉션 등록
          </Button>
        </Link>
      </div>

      {/* 필터 */}
      <Suspense>
        <ItemBookFilters tribes={tribes} />
      </Suspense>

      {/* 카운트 */}
      <div className="text-sm text-muted-foreground">
        총 {total}개
        {hasFilter && ' (필터 적용 중)'}
      </div>

      {/* 목록 — 데스크탑 테이블(ItemBookTable.tsx)이 정렬·선택 상태를 URL과 동기화하려고
          useSearchParams()를 쓴다. 필터 바와 같은 이유로 Suspense로 감싼다. */}
      <Suspense>
        <ItemBookList
          itemBooks={books}
          badgeMap={badgeMap}
          tribeMap={tribeMap}
          itemBadgeCountMap={itemBadgeCountMap}
          emptyMessage={emptyMessage}
          totalCount={total}
        />
      </Suspense>

      {/* 페이지네이션 */}
      <DataTablePagination page={page} totalPages={totalPages} />
    </div>
  )
}
