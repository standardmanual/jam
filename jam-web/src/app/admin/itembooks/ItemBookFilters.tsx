'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/admin/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { DataTableToolbar } from '@/components/admin/data-table/data-table-toolbar'
import { DataTableFacetedFilter } from '@/components/admin/data-table/data-table-faceted-filter'
import type { TribeRow } from '@/types/database'

interface ItemBookFiltersProps {
  tribes: Pick<TribeRow, 'id' | 'name'>[]
}

/**
 * 컬렉션 목록 필터(20260826_015) — shadcn 공식 Data Table Toolbar 패턴으로 재구현
 * (배지 목록의 `BadgesFilterBar.tsx`와 동일 구조).
 */
export default function ItemBookFilters({ tribes }: ItemBookFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const tribe = searchParams.get('tribe') ?? 'all'
  const sort = searchParams.get('sort') ?? 'created_desc'

  const updateParams = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value === 'all' || value === '') params.delete(key)
      else params.set(key, value)
    }
    params.delete('page')
    router.push(`/admin/itembooks?${params.toString()}`)
  }

  const hasFilter = searchParams.has('tribe')

  return (
    <DataTableToolbar
      actions={
        <Select value={sort} onValueChange={(v) => updateParams({ sort: v })}>
          <SelectTrigger className="h-8 w-auto min-w-[10rem]" aria-label="정렬">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created_desc">최근 등록순</SelectItem>
            <SelectItem value="name_asc">이름 ↑ (오름차순)</SelectItem>
            <SelectItem value="name_desc">이름 ↓ (내림차순)</SelectItem>
          </SelectContent>
        </Select>
      }
    >
      <DataTableFacetedFilter
        title="트라이브"
        options={tribes.map((f) => ({ value: f.id, label: f.name }))}
        selected={tribe === 'all' ? [] : [tribe]}
        onChange={(values) => updateParams({ tribe: values[0] ?? 'all' })}
      />

      {hasFilter && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={() => router.push('/admin/itembooks')}
        >
          필터 초기화
        </Button>
      )}
    </DataTableToolbar>
  )
}
