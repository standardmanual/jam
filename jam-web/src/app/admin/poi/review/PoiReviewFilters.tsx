'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { DataTableToolbar } from '@/components/admin/data-table/data-table-toolbar'
import { DataTableFacetedFilter } from '@/components/admin/data-table/data-table-faceted-filter'
import type { PoiCategoryRow } from '@/types/database'

interface PoiReviewFiltersProps {
  categories: PoiCategoryRow[]
}

/**
 * POI 검토 큐 필터(티켓 20260907_1242) — 카테고리·수집일(범위) 두 가지만 지원한다(요구사항
 * 범위). `admin/poi/PoiFilters.tsx`와 동일하게 shadcn 공식 Data Table Toolbar 패턴을 쓴다.
 */
export default function PoiReviewFilters({ categories }: PoiReviewFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const category = searchParams.get('category') ?? 'all'
  const from = searchParams.get('from') ?? ''
  const to = searchParams.get('to') ?? ''

  const updateParams = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value === 'all' || value === '') params.delete(key)
      else params.set(key, value)
    }
    params.delete('page')
    router.push(`/admin/poi/review?${params.toString()}`)
  }

  const hasFilter = searchParams.has('category') || searchParams.has('from') || searchParams.has('to')

  return (
    <DataTableToolbar>
      <DataTableFacetedFilter
        title="카테고리"
        options={categories.map((c) => ({ value: c.slug, label: `${c.label} (${c.slug})` }))}
        selected={category === 'all' ? [] : [category]}
        onChange={(values) => updateParams({ category: values[0] ?? 'all' })}
      />

      <div className="flex items-center gap-1.5">
        <span className="text-sm text-muted-foreground whitespace-nowrap">수집일</span>
        <Input
          type="date"
          aria-label="수집일 시작"
          value={from}
          onChange={(e) => updateParams({ from: e.target.value })}
          className="h-8 w-[150px]"
        />
        <span className="text-muted-foreground">~</span>
        <Input
          type="date"
          aria-label="수집일 끝"
          value={to}
          onChange={(e) => updateParams({ to: e.target.value })}
          className="h-8 w-[150px]"
        />
      </div>

      {hasFilter && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={() => router.push('/admin/poi/review')}
        >
          필터 초기화
        </Button>
      )}
    </DataTableToolbar>
  )
}
