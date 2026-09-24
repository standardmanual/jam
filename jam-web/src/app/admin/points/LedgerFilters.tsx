'use client'

import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { DataTableToolbar } from '@/components/admin/data-table/data-table-toolbar'
import { DataTableFacetedFilter } from '@/components/admin/data-table/data-table-faceted-filter'
import { DataTableSortSelect } from '@/components/admin/data-table/data-table-sort-select'
import { useListParams } from '@/components/admin/data-table/use-list-params'
import { LEDGER_DEFAULT_SORT, LEDGER_REASON_OPTIONS } from '@/lib/admin/points-ledger-query'

const SORT_OPTIONS = [
  { value: 'created_desc', label: '최신순' },
  { value: 'created_asc', label: '오래된순' },
  { value: 'amount_desc', label: '금액 큰 순' },
  { value: 'amount_asc', label: '금액 작은 순' },
]

/**
 * 고액 원장 필터(티켓 20260924_0950) — 사유(단일 선택)·기간(시작일·종료일)·정렬. 원장에는 이름
 * 검색 대상이 없어(유저 이름은 표시만 한다) 검색 입력은 두지 않는다. 필터를 바꾸면 1쪽으로
 * 돌아가고 선택이 풀린다(`useListParams`).
 */
export function LedgerFilters() {
  const { filters, setFilters, reset } = useListParams()
  const hasFilter = Object.keys(filters).length > 0

  return (
    <DataTableToolbar actions={<DataTableSortSelect options={SORT_OPTIONS} defaultValue={LEDGER_DEFAULT_SORT} />}>
      <DataTableFacetedFilter
        title="사유"
        options={LEDGER_REASON_OPTIONS}
        selected={filters.reason ? [filters.reason] : []}
        onChange={(values) => setFilters({ reason: values[0] ?? null })}
      />

      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        시작일
        <Input
          type="date"
          value={filters.from ?? ''}
          max={filters.to}
          onChange={(e) => setFilters({ from: e.target.value || null })}
          className="h-8 w-[10.5rem]"
        />
      </label>
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        종료일
        <Input
          type="date"
          value={filters.to ?? ''}
          min={filters.from}
          onChange={(e) => setFilters({ to: e.target.value || null })}
          className="h-8 w-[10.5rem]"
        />
      </label>

      {hasFilter && (
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={reset}>
          필터 초기화
        </Button>
      )}
    </DataTableToolbar>
  )
}
