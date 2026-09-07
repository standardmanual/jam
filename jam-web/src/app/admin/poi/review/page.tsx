import Link from 'next/link'
import { Suspense } from 'react'
import { createServiceClient } from '@/lib/supabase/server'
import { Button } from '@/components/admin/ui/button'
import type { PoiCategoryRow } from '@/types/database'
import PoiReviewFilters from './PoiReviewFilters'
import { PoiReviewTable, type PoiReviewRow } from './PoiReviewTable'
import Pagination from '../Pagination'
import { pickSingleQueryParams, type SearchParamsPromise } from '@/lib/searchParams'

const PAGE_SIZE = 30

const REVIEW_LIST_COLUMNS = 'id, name, latitude, longitude, category, naver_category, naver_keyword, created_at'

interface AdminPoiReviewPageProps {
  searchParams: SearchParamsPromise
}

/**
 * POI 검토 큐(티켓 20260907_1242) — 수집 시 3단계 판정(자동승인/자동거부/검토대기) 중
 * "검토대기"(pending_review=true)로 저장된 POI만 모아 보여준다. 자동거부는 애초에 저장되지
 * 않으므로 이 화면에 나타나지 않는다. `admin/poi/page.tsx`와 동일한 서버사이드 필터/페이지네이션
 * 구조를 따른다.
 */
export default async function AdminPoiReviewPage({ searchParams }: AdminPoiReviewPageProps) {
  const params = pickSingleQueryParams(await searchParams)
  const category = params.category ?? 'all'
  const collectedFrom = params.from ?? ''
  const collectedTo = params.to ?? ''
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1)

  const supabase = createServiceClient()

  // naver_category/naver_keyword/pending_review는 마이그레이션 143에서 막 추가된 컬럼이라
  // 생성 타입(database.generated.ts)에 아직 없다 — db:types CLI 부재로 재생성 불가(완료 보고
  // 참고). eq()의 컬럼명 리터럴 검사만 `as string`으로 넓혀 우회한다(다른 컬럼명 검사에는
  // 영향 없음 — 아래 category/created_at 필터는 그대로 검증된다).
  let query = supabase
    .from('poi')
    .select(REVIEW_LIST_COLUMNS, { count: 'exact' })
    .eq('pending_review' as string, true)
  if (category !== 'all') query = query.eq('category', category)
  if (collectedFrom) query = query.gte('created_at', `${collectedFrom}T00:00:00`)
  if (collectedTo) query = query.lte('created_at', `${collectedTo}T23:59:59`)
  query = query.order('created_at', { ascending: false })

  const rangeFrom = (page - 1) * PAGE_SIZE
  const rangeTo = rangeFrom + PAGE_SIZE - 1
  query = query.range(rangeFrom, rangeTo)

  const [{ data: poisRaw, count, error }, { data: categoriesRaw }] = await Promise.all([
    query,
    supabase.from('poi_categories').select('*').order('slug'),
  ])
  if (error) console.error('[admin/poi/review] 검토 큐 조회 실패', error)

  // select 결과에 naver_category/naver_keyword가 포함돼 SelectQueryError로 잡힌다(위와 동일
  // 이유) — unknown을 경유해 캐스팅한다.
  const pois = (poisRaw ?? []) as unknown as PoiReviewRow[]
  // 20260907_1243: keywords가 text[]→jsonb로 바뀌어 생성 타입(여전히 string[]로 인식)과
  // 어긋난다 — unknown 경유로 좁게 우회한다(위 pois와 동일 이유).
  const categories = (categoriesRaw ?? []) as unknown as PoiCategoryRow[]
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">POI 검토 큐</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            네이버 원본 분류가 애매해 자동판정하지 못한 수집 건입니다. 카테고리 배정을 확인하고
            승인·거부해주세요.
          </p>
        </div>
        <Link href="/admin/poi">
          <Button variant="outline" className="w-full sm:w-auto">
            POI 관리로 돌아가기
          </Button>
        </Link>
      </div>

      <Suspense>
        <PoiReviewFilters categories={categories} />
      </Suspense>

      <div className="text-sm text-muted-foreground">검토 대기 {count ?? 0}건</div>

      <PoiReviewTable pois={pois} categories={categories} />

      <Pagination page={page} totalPages={totalPages} searchParams={params} basePath="/admin/poi/review" />
    </div>
  )
}
