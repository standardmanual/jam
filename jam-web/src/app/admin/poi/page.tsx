import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { PoiRow, BadgeRow, PoiCategoryRow } from '@/types/database'
import PoiFilters from './PoiFilters'
import Pagination from './Pagination'

const PAGE_SIZE = 30

interface AdminPoiPageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function AdminPoiPage({ searchParams }: AdminPoiPageProps) {
  const params = await searchParams
  const category = params.category ?? 'all'
  const sort = params.sort ?? 'created_desc'
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1)

  const supabase = createServiceClient()

  let query = supabase.from('poi').select('*', { count: 'exact' })
  if (category !== 'all') query = query.eq('category', category)

  if (sort === 'name_asc') query = query.order('name', { ascending: true })
  else if (sort === 'name_desc') query = query.order('name', { ascending: false })
  else query = query.order('created_at', { ascending: false })

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  query = query.range(from, to)

  const [{ data: poisRaw, count }, { data: badgesRaw }, { data: categoriesRaw }] = await Promise.all([
    query,
    supabase.from('badges').select('id, name'),
    supabase.from('poi_categories').select('*').order('slug'),
  ])

  const pois = (poisRaw ?? []) as PoiRow[]
  const badges = (badgesRaw ?? []) as Pick<BadgeRow, 'id' | 'name'>[]
  const badgeMap = new Map(badges.map((b) => [b.id, b.name]))
  const categories = (categoriesRaw ?? []) as PoiCategoryRow[]
  const categoryLabelMap = new Map(categories.map((c) => [c.slug, c.label]))
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">POI 관리</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/poi/categories"
            className="bg-white border border-[#e5e7eb] text-[#374151] font-medium px-4 py-2 rounded-xl hover:bg-[#f3f4f6] transition-colors text-sm"
          >
            카테고리 관리
          </Link>
          <Link
            href="/admin/poi/new"
            className="bg-[#111111] text-white font-bold px-4 py-2 rounded-xl hover:bg-[#242424] transition-colors text-sm"
          >
            + POI 등록
          </Link>
        </div>
      </div>

      <PoiFilters categories={categories} />

      <p className="text-[#6b7280] text-xs mb-3">총 {count ?? 0}개</p>

      <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e5e7eb] text-[#6b7280] text-left">
              <th className="px-5 py-3 font-medium">이름</th>
              <th className="px-5 py-3 font-medium">카테고리</th>
              <th className="px-5 py-3 font-medium">위도 / 경도</th>
              <th className="px-5 py-3 font-medium">반경</th>
              <th className="px-5 py-3 font-medium">연결 배지</th>
            </tr>
          </thead>
          <tbody>
            {pois.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-[#898989]">
                  등록된 POI가 없습니다.
                </td>
              </tr>
            )}
            {pois.map((poi) => (
              <tr key={poi.id} className="border-b border-[#f3f4f6] hover:bg-[#f8f9fa] transition-colors">
                <td className="px-5 py-3">
                  <Link
                    href={`/admin/poi/${poi.id}`}
                    className="font-medium hover:text-[#111111] transition-colors"
                  >
                    {poi.name}
                  </Link>
                </td>
                <td className="px-5 py-3 text-[#374151]">{categoryLabelMap.get(poi.category) ?? poi.category}</td>
                <td className="px-5 py-3 text-[#374151] font-mono text-xs">
                  {poi.latitude.toFixed(4)}, {poi.longitude.toFixed(4)}
                </td>
                <td className="px-5 py-3 text-[#374151]">{poi.radius_meters}m</td>
                <td className="px-5 py-3 text-[#374151]">
                  {poi.linked_badge_id ? badgeMap.get(poi.linked_badge_id) ?? poi.linked_badge_id : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} searchParams={params} />
    </div>
  )
}
