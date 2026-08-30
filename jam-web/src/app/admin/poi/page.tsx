import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Suspense } from 'react'
import { Button } from '@/components/admin/ui/button'
import type { BadgeRow, PoiCategoryRow } from '@/types/database'
import { PoiList, type PoiListRow } from '@/components/admin/poi/PoiList'
import PoiFilters from './PoiFilters'
import Pagination from './Pagination'

const PAGE_SIZE = 30

// 목록(카드/테이블)에 실제로 쓰는 컬럼만 select — osm_id/naver_id/poi_tier/created_at 등은
// 상세화면 전용이라 목록에는 불필요하다(20260826_011 A8).
const POI_LIST_COLUMNS = 'id, name, latitude, longitude, radius_meters, category, linked_badge_id, is_active'

interface AdminPoiPageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function AdminPoiPage({ searchParams }: AdminPoiPageProps) {
  const params = await searchParams
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

  const [{ data: poisRaw, count }, { data: categoriesRaw }] = await Promise.all([
    query,
    supabase.from('poi_categories').select('*').order('slug'),
  ])

  const pois = (poisRaw ?? []) as PoiListRow[]

  const linkedBadgeIds = [...new Set(pois.map((p) => p.linked_badge_id).filter((id): id is string => !!id))]
  const { data: badgesRaw } = linkedBadgeIds.length > 0
    ? await supabase.from('badges').select('id, name').in('id', linkedBadgeIds)
    : { data: [] as Pick<BadgeRow, 'id' | 'name'>[] }
  const badges = (badgesRaw ?? []) as Pick<BadgeRow, 'id' | 'name'>[]
  const badgeMap = new Map(badges.map((b) => [b.id, b.name]))
  const categories = (categoriesRaw ?? []) as PoiCategoryRow[]
  const categoryLabelMap = new Map(categories.map((c) => [c.slug, c.label]))
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))

  return (
    <div className="space-y-6 p-4 md:p-8">
      {/* 헤더 */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-bold md:text-3xl">POI 관리</h1>
        <div className="flex flex-col gap-2 sm:flex-row">
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
