'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
      <Select value={category} onValueChange={(v) => updateParams({ category: v })}>
        <SelectTrigger className="w-auto min-w-[10rem]" aria-label="카테고리 필터">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">전체 카테고리</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.slug} value={c.slug}>{c.label} ({c.slug})</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={sort} onValueChange={(v) => updateParams({ sort: v })}>
        <SelectTrigger className="w-auto min-w-[10rem]" aria-label="정렬">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="created_desc">최근 등록순</SelectItem>
          <SelectItem value="name_asc">이름 오름차순</SelectItem>
          <SelectItem value="name_desc">이름 내림차순</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
