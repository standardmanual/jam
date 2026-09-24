'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { useListParams } from './use-list-params'

interface DataTableSortSelectOption {
  value: string
  label: string
}

interface DataTableSortSelectProps {
  options: DataTableSortSelectOption[]
  /** 이 값이면 URL에서 `sort` 키를 지운다(기본 정렬) */
  defaultValue: string
}

/**
 * 정렬 드롭다운 — 머리 칸 클릭 정렬(`useUrlSorting`)과 같은 URL `sort` 키를 쓴다(티켓
 * 20260924_0940). 최신순·오래된순처럼 컬럼이 없는 정렬 기준은 이 드롭다운만이 유일한
 * 경로다(기존 `BadgesFilterBar.tsx`의 정렬 Select를 공용화).
 */
export function DataTableSortSelect({ options, defaultValue }: DataTableSortSelectProps) {
  const { sort, setSort } = useListParams({ defaults: { sort: defaultValue } })

  return (
    <Select value={sort ?? defaultValue} onValueChange={(v) => setSort(v)}>
      <SelectTrigger className="h-8 w-auto min-w-[8rem]" aria-label="정렬">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
