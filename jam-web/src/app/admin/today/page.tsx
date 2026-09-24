import Link from 'next/link'
import { Suspense } from 'react'
import { createServiceClient } from '@/lib/supabase/server'
import { Button } from '@/components/admin/ui/button'
import { DataTablePagination } from '@/components/admin/data-table/data-table-pagination'
import { TodayCardTable } from './TodayCardTable'
import TodayDateNav from './TodayDateNav'
import TodayFilterBar from './TodayFilterBar'
import { ADMIN_LIST_PAGE_SIZE, pageRange, totalPagesOf } from '@/lib/admin/list-params'
import {
  TODAY_LIST_COLUMNS,
  applyTodayListQuery,
  parseTodayListParams,
  type TodayListQuery,
  type TodayListRow,
} from '@/lib/admin/today-list-query'
import { pickSingleQueryParams, type SearchParamsPromise } from '@/lib/searchParams'

/**
 * ⚠️ 쿼리 값의 타입을 `string`으로 좁히지 말 것 — 같은 키가 두 번 오면(`?date=a&date=b`)
 * Next가 배열을 넘긴다. `pickSingleQueryParams`가 배열을 「값 없음」(= 오늘 날짜·기본 조건)으로
 * 흡수해 이 아래 모든 읽기가 단일 문자열만 보게 한다(티켓 20260906_1312).
 */
interface AdminTodayPageProps {
  searchParams: SearchParamsPromise
}

export default async function AdminTodayPage({ searchParams }: AdminTodayPageProps) {
  const rawParams = pickSingleQueryParams(await searchParams)
  // 20260902_1028: 날짜별 캘린더뷰로 전환 — 선택 날짜(KST 달력 기준)에 걸치는 카드만 조회한다
  // (구간형 카드는 starts_at~ends_at에 포함되는 모든 날짜의 목록에 매일 반복 노출로 나타난다).
  // 20260924_0947: 날짜·템플릿·검색어·정렬 조건은 `today-list-query.ts` 한 곳이 갖는다.
  const params = parseTodayListParams(rawParams)
  const selectedDate = params.date
  const page = Math.max(1, parseInt(rawParams.page ?? '1', 10) || 1)

  const supabase = createServiceClient()

  // 20260911_1454: 생성·수정 폼이 전용 화면(new · [id]/edit)으로 분리되면서, 이 목록 화면은
  // 카드 테이블 · 캘린더 날짜 탐색만 남았다 — 폼 전용 참조 데이터(missions · itemBooks ·
  // badgeLabels)는 더 이상 여기서 조회하지 않는다.
  let query = supabase
    .from('today_cards')
    .select(TODAY_LIST_COLUMNS, { count: 'exact' }) as unknown as TodayListQuery<TodayListRow>
  query = applyTodayListQuery(query, params)
  const [from, to] = pageRange(page, ADMIN_LIST_PAGE_SIZE)
  const { data: cardsRaw, count } = await query.range(from, to)

  const cards = (cardsRaw ?? []) as TodayListRow[]
  const total = count ?? 0
  const totalPages = totalPagesOf(total, ADMIN_LIST_PAGE_SIZE)
  const hasFilter = !!(params.q || params.template)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">투데이 콘텐츠 관리</h1>
          <p className="text-muted-foreground text-sm mt-1">
            홈(투데이) 카드 CMS — 템플릿별 카드 제작 · 예약 발행 · 노출조건 태그
          </p>
        </div>
        <Link href={`/admin/today/new?date=${selectedDate}`}>
          <Button>+ 콘텐츠 추가</Button>
        </Link>
      </div>

      {/* 날짜 이동·필터 바·표는 useSearchParams()로 URL 상태를 읽어 Suspense로 감싼다(배지 관리와 동일) */}
      <Suspense>
        <TodayDateNav selectedDate={selectedDate} />
      </Suspense>
      <div className="border-t border-border my-4" />

      <div className="space-y-4">
        <Suspense>
          <TodayFilterBar />
        </Suspense>

        <div className="text-sm text-muted-foreground">
          총 {total}개
          {hasFilter && ' (필터 적용 중)'}
        </div>

        <Suspense>
          <TodayCardTable cards={cards} selectedDate={selectedDate} totalCount={total} />
        </Suspense>

        <DataTablePagination page={page} totalPages={totalPages} />
      </div>
    </div>
  )
}
