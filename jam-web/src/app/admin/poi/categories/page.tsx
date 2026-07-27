import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import CategoryManager from '../CategoryManager'
import { POI_CATEGORIES } from '@/lib/poi/categories'
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
  const pipelineLinkedSlugs = POI_CATEGORIES.map((c) => c.category)

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/poi" className="text-[#6b7280] hover:text-[#111111] text-sm transition-colors">
          ← POI 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">POI 카테고리 관리</h1>
      </div>
      <CategoryManager categories={categories} usageCounts={usageCounts} pipelineLinkedSlugs={pipelineLinkedSlugs} />
    </div>
  )
}
