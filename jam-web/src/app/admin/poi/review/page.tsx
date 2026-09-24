import Link from 'next/link'
import { Suspense } from 'react'
import { createServiceClient } from '@/lib/supabase/server'
import { Button } from '@/components/admin/ui/button'
import type { PoiCategoryRow } from '@/types/database'
import PoiReviewFilters from './PoiReviewFilters'
import { PoiReviewTable } from './PoiReviewTable'
import { DataTablePagination } from '@/components/admin/data-table/data-table-pagination'
import { pickSingleQueryParams, type SearchParamsPromise } from '@/lib/searchParams'
import { ADMIN_LIST_PAGE_SIZE, pageRange, totalPagesOf } from '@/lib/admin/list-params'
import {
  POI_REVIEW_LIST_COLUMNS,
  parsePoiReviewListParams,
  applyPoiReviewListQuery,
  collectPendingNaverCategories,
  type NaverCategoryQueryClient,
  type PoiReviewQuery,
  type PoiReviewRow,
} from '@/lib/admin/poi-review-list'

interface AdminPoiReviewPageProps {
  searchParams: SearchParamsPromise
}

/**
 * POI 검토 큐(티켓 20260907_1242) — 수집 시 3단계 판정(자동승인/자동거부/검토대기) 중
 * "검토대기"(pending_review=true)로 저장된 POI만 모아 보여준다. 자동거부는 애초에 저장되지
 * 않으므로 이 화면에 나타나지 않는다. 검색·필터·정렬은 `lib/admin/poi-review-list.ts`가
 * 갖고(목록·전체 선택 ID 조회 공용), 한 쪽 크기는 공통 표준(50건)이다(티켓 20260924_0948).
 */
export default async function AdminPoiReviewPage({ searchParams }: AdminPoiReviewPageProps) {
  const rawParams = pickSingleQueryParams(await searchParams)
  const params = parsePoiReviewListParams(rawParams)
  const page = Math.max(1, parseInt(rawParams.page ?? '1', 10) || 1)

  const supabase = createServiceClient()

  // naver_category/naver_keyword/pending_review는 마이그레이션 143에서 막 추가된 컬럼이라
  // 생성 타입(database.generated.ts)에 아직 없다 — 좁은 인터페이스(PoiReviewQuery)로 캐스팅한다.
  let query = supabase
    .from('poi')
    .select(POI_REVIEW_LIST_COLUMNS, { count: 'exact' }) as unknown as PoiReviewQuery<PoiReviewRow>
  query = applyPoiReviewListQuery(query, params)
  const [from, to] = pageRange(page, ADMIN_LIST_PAGE_SIZE)

  const [{ data: poisRaw, count, error }, { data: categoriesRaw }, naverCategories] = await Promise.all([
    query.range(from, to),
    supabase.from('poi_categories').select('*').order('slug'),
    collectPendingNaverCategories(supabase as unknown as NaverCategoryQueryClient).catch((e: unknown) => {
      console.error('[admin/poi/review] 네이버 원본 분류 선택지 조회 실패', e)
      return [] as string[]
    }),
  ])
  if (error) console.error('[admin/poi/review] 검토 큐 조회 실패', error)

  const pois = poisRaw ?? []
  // 20260907_1243: keywords가 text[]→jsonb로 바뀌어 생성 타입(여전히 string[]로 인식)과
  // 어긋난다 — unknown 경유로 좁게 우회한다.
  const categories = (categoriesRaw ?? []) as unknown as PoiCategoryRow[]
  const totalPages = totalPagesOf(count ?? 0, ADMIN_LIST_PAGE_SIZE)

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">POI 검토 큐</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            자동수집은 중단됐습니다(티켓 20260907_1811) — 신규 항목은 대부분 &apos;POI
            임시등록&apos;으로 만든 비활성 건입니다. 이름을 눌러 편집 화면에서 정보를 확인·수정한
            뒤 이 목록의 &apos;활성화&apos; 버튼을 눌러주세요. 배정 카테고리가 지도 노출 대상이면
            바로 노출되고, 아니면 검토 완료 처리만 됩니다 — 노출 여부를 다시 조정하려면 편집
            화면에서 저장하세요.
          </p>
        </div>
        <Link href="/admin/poi">
          <Button variant="outline" className="w-full sm:w-auto">
            POI 관리로 돌아가기
          </Button>
        </Link>
      </div>

      <Suspense>
        <PoiReviewFilters categories={categories} naverCategories={naverCategories} />
      </Suspense>

      <div className="text-sm text-muted-foreground">검토 대기 {count ?? 0}건</div>

      <PoiReviewTable pois={pois} categories={categories} totalCount={count ?? 0} />

      <DataTablePagination page={page} totalPages={totalPages} />
    </div>
  )
}
