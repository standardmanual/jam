import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Suspense } from 'react'
import { Button } from '@/components/admin/ui/button'
import type { BadgeRow, PoiCategoryRow } from '@/types/database'
import { PoiList, type PoiListRow } from '@/components/admin/poi/PoiList'
import PoiFilters from './PoiFilters'
import Pagination from './Pagination'
import { pickSingleQueryParams, type SearchParamsPromise } from '@/lib/searchParams'

const PAGE_SIZE = 30

// 목록(카드/테이블)에 실제로 쓰는 컬럼만 select — osm_id/naver_id/poi_tier/created_at 등은
// 상세화면 전용이라 목록에는 불필요하다(20260826_011 A8).
const POI_LIST_COLUMNS = 'id, name, latitude, longitude, radius_meters, category, linked_badge_id, is_active'

/**
 * ⚠️ 쿼리 값의 타입을 `string`으로 좁히지 말 것 — 같은 키가 두 번 오면(`?page=1&page=2`)
 * Next가 배열을 넘긴다. `pickSingleQueryParams`가 배열을 「값 없음」으로 흡수해 이 아래
 * 모든 읽기가 단일 문자열만 보게 한다 (티켓 20260906_1312).
 */
interface AdminPoiPageProps {
  searchParams: SearchParamsPromise
}

export default async function AdminPoiPage({ searchParams }: AdminPoiPageProps) {
  const params = pickSingleQueryParams(await searchParams)
  const category = params.category ?? 'all'
  const sort = params.sort ?? 'created_desc'
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1)
  const q = params.q?.trim() ?? ''

  const supabase = createServiceClient()

  let query = supabase.from('poi').select(POI_LIST_COLUMNS, { count: 'exact' })
  if (category !== 'all') query = query.eq('category', category)
  if (q) query = query.ilike('name', `%${q}%`)

  if (sort === 'name_asc') query = query.order('name', { ascending: true })
  else if (sort === 'name_desc') query = query.order('name', { ascending: false })
  else query = query.order('created_at', { ascending: false })

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  query = query.range(from, to)

  const [{ data: poisRaw, count }, { data: categoriesRaw }, { count: pendingReviewCount }] = await Promise.all([
    query,
    supabase.from('poi_categories').select('*').order('slug'),
    // 20260907_1242: 헤더의 "검토 큐" 버튼에 대기 건수를 보여준다 — 검토 큐 진입 없이도
    // 처리할 게 있는지 한눈에 알 수 있어야 실제로 쓰인다.
    // pending_review는 마이그레이션 143에서 막 추가된 컬럼이라 생성 타입에 없다 — db:types
    // CLI 부재로 재생성 불가(완료 보고 참고). eq()의 컬럼명 리터럴 검사만 `as string`으로
    // 넓혀 우회한다(다른 컬럼명 검사에는 영향 없음).
    supabase.from('poi').select('*', { count: 'exact', head: true }).eq('pending_review' as string, true),
  ])

  const pois = (poisRaw ?? []) as PoiListRow[]

  const linkedBadgeIds = [...new Set(pois.map((p) => p.linked_badge_id).filter((id): id is string => !!id))]
  const { data: badgesRaw } = linkedBadgeIds.length > 0
    ? await supabase.from('badges').select('id, name').in('id', linkedBadgeIds)
    : { data: [] as Pick<BadgeRow, 'id' | 'name'>[] }
  const badges = (badgesRaw ?? []) as Pick<BadgeRow, 'id' | 'name'>[]
  const badgeMap = new Map(badges.map((b) => [b.id, b.name]))
  // 20260907_1243: keywords가 text[]→jsonb로 바뀌어 생성 타입(여전히 string[]로 인식)과
  // 어긋난다 — 다른 컬럼은 그대로인 known-shape이므로 unknown 경유로 좁게 우회한다.
  const categories = (categoriesRaw ?? []) as unknown as PoiCategoryRow[]
  const categoryLabelMap = new Map(categories.map((c) => [c.slug, c.label]))
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))

  return (
    <div className="space-y-6 p-4 md:p-8">
      {/* 헤더 */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-bold md:text-3xl">POI 관리</h1>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/admin/poi/review">
            <Button variant="outline" className="w-full sm:w-auto">
              검토 큐{pendingReviewCount ? ` (${pendingReviewCount})` : ''}
            </Button>
          </Link>
          <Link href="/admin/poi/categories">
            <Button variant="outline" className="w-full sm:w-auto">
              카테고리 관리
            </Button>
          </Link>
          <Link href="/admin/poi/new">
            <Button className="w-full sm:w-auto">
              + POI 등록
            </Button>
          </Link>
        </div>
      </div>

      {/* 필터 */}
      <Suspense>
        <PoiFilters categories={categories} />
      </Suspense>

      {/* 카운트 */}
      <div className="text-sm text-muted-foreground">
        총 {count ?? 0}개
      </div>

      {/* 목록 */}
      <PoiList pois={pois} badgeMap={badgeMap} categoryLabelMap={categoryLabelMap} />

      {/* 페이지네이션 */}
      <Pagination page={page} totalPages={totalPages} searchParams={params} />
    </div>
  )
}
