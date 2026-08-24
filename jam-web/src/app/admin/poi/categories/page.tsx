import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import CategoryManager from '../CategoryManager'
import type { PoiCategoryRow } from '@/types/database'

export default async function AdminPoiCategoriesPage() {
  const supabase = createServiceClient()
  const { data: categoriesRaw } = await supabase.from('poi_categories').select('*').order('slug')
  const categories = (categoriesRaw ?? []) as PoiCategoryRow[]

  // 카테고리별 사용량은 DB에서 직접 센다 — poi 전체를 select하면 PostgREST 기본 max-rows(1000)에
  // 걸려 앞 1000행만 집계되고, POI가 그보다 많아진 지금은 실제와 다른 숫자가 표시된다.
  const usageEntries = await Promise.all(
    categories.map(async (c) => {
      const { count } = await supabase
        .from('poi')
        .select('*', { count: 'exact', head: true })
        .eq('category', c.slug)
      return [c.slug, count ?? 0] as const
    })
  )
  const usageCounts: Record<string, number> = Object.fromEntries(usageEntries)

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/poi" className="text-[#6b7280] hover:text-[#111111] text-sm transition-colors">
          ← POI 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">POI 카테고리 관리</h1>
        <p className="text-[#6b7280] text-sm mt-1">
          &quot;파이프라인 연동&quot;을 켠 카테고리는 드랍/픽업 지도의 자동검색 대상이 됩니다 — 티어·키워드가 실제 검색 동작을 바꿉니다.
        </p>
      </div>
      <CategoryManager categories={categories} usageCounts={usageCounts} />
    </div>
  )
}
