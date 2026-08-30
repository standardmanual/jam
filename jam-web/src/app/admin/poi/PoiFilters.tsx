'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { DataTableToolbar } from '@/components/admin/data-table/data-table-toolbar'
import { DataTableFacetedFilter } from '@/components/admin/data-table/data-table-faceted-filter'
import type { PoiCategoryRow } from '@/types/database'

interface PoiFiltersProps {
  categories: PoiCategoryRow[]
}

/**
 * POI 목록 필터(20260826_015) — shadcn 공식 Data Table Toolbar 패턴으로 재구현
 * (배지 목록의 `BadgesFilterBar.tsx`와 동일 구조).
 * 키워드 검색(20260830_1607)도 `BadgesFilterBar.tsx`의 디바운스 패턴을 그대로 재사용한다.
 */
export default function PoiFilters({ categories }: PoiFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '')

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

  // 검색어는 타이핑마다 즉시 서버로 보내지 않고 400ms 디바운스 후 반영한다
  // (BadgesFilterBar.tsx와 동일 패턴).
  useEffect(() => {
    const current = searchParams.get('q') ?? ''
    if (searchInput === current) return
    const timer = setTimeout(() => updateParams({ q: searchInput.trim() }), 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  const hasFilter = searchParams.has('category') || searchParams.has('q')

  return (
    <DataTableToolbar
      actions={
        <Select value={sort} onValueChange={(v) => updateParams({ sort: v })}>
          <SelectTrigger className="h-8 w-auto min-w-[10rem]" aria-label="정렬">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created_desc">최근 등록순</SelectItem>
            <SelectItem value="name_asc">이름 오름차순</SelectItem>
            <SelectItem value="name_desc">이름 내림차순</SelectItem>
          </SelectContent>
        </Select>
      }
    >
      <Input
        placeholder="지점 이름으로 검색..."
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className="h-8 w-[180px] lg:w-[260px]"
      />

      <DataTableFacetedFilter
        title="카테고리"
        options={categories.map((c) => ({ value: c.slug, label: `${c.label} (${c.slug})` }))}
        selected={category === 'all' ? [] : [category]}
        onChange={(values) => updateParams({ category: values[0] ?? 'all' })}
      />

      {hasFilter && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={() => {
            setSearchInput('')
            router.push('/admin/poi')
          }}
        >
          필터 초기화
        </Button>
      )}
    </DataTableToolbar>
  )
}
