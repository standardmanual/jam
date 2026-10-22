import { Suspense } from 'react'
import { createServiceClient } from '@/lib/supabase/server'
import { DataTablePagination } from '@/components/admin/data-table/data-table-pagination'
import { ADMIN_LIST_PAGE_SIZE, totalPagesOf } from '@/lib/admin/list-params'
import { logQueryError } from '@/lib/admin/queryError'
import { parseUserListParams, fetchUserListPage } from '@/lib/admin/user-list'
import { pickSingleQueryParams, type SearchParamsPromise } from '@/lib/searchParams'
import { UsersTable } from './UsersTable'
import UsersFilterBar from './UsersFilterBar'

/**
 * ⚠️ 쿼리 값의 타입을 `string`으로 좁히지 말 것 — 같은 키가 두 번 오면(`?page=1&page=2`)
 * Next가 배열을 넘긴다. `pickSingleQueryParams`가 배열을 「값 없음」으로 흡수한다
 * (티켓 20260906_1312).
 */
interface AdminUsersPageProps {
  searchParams: SearchParamsPromise
}

/**
 * 유저 조회(티켓 20260924_0951) — 검색·필터·서버 정렬·한 쪽 50건. 조회·집계는
 * `lib/admin/user-list.ts`가 갖는다(전체 선택용 ID 조회·내보내기와 같은 필터 규칙).
 */
export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const rawParams = pickSingleQueryParams(await searchParams)
  const page = Math.max(1, parseInt(rawParams.page ?? '1', 10) || 1)
  const params = parseUserListParams(rawParams)

  const supabase = createServiceClient()
  const [{ rows, total }, { data: tribesRaw, error: tribesError }] = await Promise.all([
    fetchUserListPage(supabase, params, page),
    supabase.from('tribes').select('id, name').order('name'),
  ])

  logQueryError(tribesError, 'users/tribes')

  const hasFilter = !!(params.q || params.tribeId || params.onboarding || params.ban)

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">유저</h1>

      {/* 필터·표는 URL(useSearchParams)과 동기화하므로 Suspense로 감싼다 */}
      <Suspense>
        <UsersFilterBar tribes={tribesRaw ?? []} />
      </Suspense>

      <div className="text-sm text-muted-foreground">
        총 {total.toLocaleString('ko-KR')}명
        {hasFilter && ' (필터 적용 중)'}
      </div>

      <Suspense>
        <UsersTable rows={rows} totalCount={total} />
      </Suspense>

      <Suspense>
        <DataTablePagination page={page} totalPages={totalPagesOf(total, ADMIN_LIST_PAGE_SIZE)} />
      </Suspense>
    </div>
  )
}
