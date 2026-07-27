'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { PoiCategoryRow } from '@/types/database'

interface PoiFiltersProps {
  categories: PoiCategoryRow[]
}

export default function PoiFilters({ categories }: PoiFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const category = searchParams.get('category') ?? 'all'
  const sort = searchParams.get('sort') ?? 'created_desc'

  const updateParams = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value === 'all' || value === '') params.delete(key)
      else params.set(key, value)
    }
    params.delete('page')
    router.push(`/admin/poi?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-3 mb-5">
      <select
        value={category}
        onChange={(e) => updateParams({ category: e.target.value })}
        className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2 text-[#111111] text-sm focus:outline-none focus:border-[#111111]/50"
      >
        <option value="all" className="bg-white">전체 카테고리</option>
        {categories.map((c) => (
          <option key={c.slug} value={c.slug} className="bg-white">{c.label} ({c.slug})</option>
        ))}
      </select>

      <select
        value={sort}
        onChange={(e) => updateParams({ sort: e.target.value })}
        className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-2 text-[#111111] text-sm focus:outline-none focus:border-[#111111]/50"
      >
        <option value="created_desc" className="bg-white">최근 등록순</option>
        <option value="name_asc" className="bg-white">이름 오름차순</option>
        <option value="name_desc" className="bg-white">이름 내림차순</option>
      </select>
    </div>
  )
}
