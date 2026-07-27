import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import CategoryManager from '../CategoryManager'
import type { PoiCategoryRow } from '@/types/database'

export default async function AdminPoiCategoriesPage() {
  const supabase = createServiceClient()
  const [{ data: categoriesRaw }, { data: poisRaw }] = await Promise.all([
    supabase.from('poi_categories').select('*').order('slug'),
    supabase.from('poi').select('category'),
  ])

  const categories = (categoriesRaw ?? []) as PoiCategoryRow[]
  const usageCounts: Record<string, number> = {}
  for (const row of (poisRaw ?? []) as { category: string }[]) {
    usageCounts[row.category] = (usageCounts[row.category] ?? 0) + 1
  }

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
