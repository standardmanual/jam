/**
 * 받은 기획함 (S2) — 티켓 20260930_1817, 운영툴 PRD §6
 *
 * 에이전트가 보낸 한 주 기획의 목록이다. 서버에서 렌더한다(`loading.tsx`를 만들지 않는다). 묶음 상태는 저장하지 않고 항목
 * 상태에서 계산하므로(`bundleStatus.ts`) 계산한 뒤 거르고 정렬하고 50건씩 자른다(`listOpsBundles`).
 * 조회 오류는 던져서 `admin/error.tsx`가 받는다(빈 목록으로 보이지 않게).
 *
 * ⚠️ 쿼리 값의 타입을 `string`으로 좁히지 말 것 — `pickSingleQueryParams`가 같은 키가 두 번 오는 경우(배열)를 「값 없음」으로
 * 흡수한다(티켓 20260906_1312).
 */
import Link from 'next/link'
import { Suspense } from 'react'
import { IconInbox } from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'
import { DataTablePagination } from '@/components/admin/data-table/data-table-pagination'
import { listOpsBundles, parseOpsInboxParams } from '@/lib/admin/opsInbox/query'
import { pickSingleQueryParams, type SearchParamsPromise } from '@/lib/searchParams'
import { OpsInboxTable } from './OpsInboxTable'
import { OpsInboxTabs } from './OpsInboxTabs'

interface OpsInboxPageProps {
  searchParams: SearchParamsPromise
}

export default async function OpsInboxPage({ searchParams }: OpsInboxPageProps) {
  const params = parseOpsInboxParams(pickSingleQueryParams(await searchParams))
  const list = await listOpsBundles(params)
  const isEmpty = list.counts.all === 0

  return (
    <div className="w-full p-4 md:p-8 space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">운영플랜</h1>
        <p className="text-muted-foreground text-sm mt-1">에이전트가 보낸 한 주 기획을 확인하고 승인해요</p>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-border p-8">
          <IconInbox className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">아직 받은 기획이 없어요</p>
          <p className="text-sm text-muted-foreground">에이전트가 기획을 보내면 여기에 나타나요</p>
        </div>
      ) : (
        // 탭·표·쪽 이동이 `useSearchParams`를 쓴다 — 다른 어드민 목록과 같은 이유로 Suspense로 감싼다.
        <Suspense>
          <OpsInboxTabs tab={params.tab} counts={list.counts}>
            {list.total === 0 ? (
              <div className="flex flex-col items-start gap-3 rounded-lg border border-border p-8">
                <p className="font-medium">이 조건에 맞는 기획이 없어요</p>
                <Button asChild variant="outline" size="sm">
                  <Link href="/admin/ops-inbox">전체 보기</Link>
                </Button>
              </div>
            ) : (
              <OpsInboxTable rows={list.rows} />
            )}
          </OpsInboxTabs>
          <DataTablePagination page={list.page} totalPages={list.totalPages} />
        </Suspense>
      )}
    </div>
  )
}
