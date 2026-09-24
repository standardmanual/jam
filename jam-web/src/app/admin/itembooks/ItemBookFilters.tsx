'use client'

import { Button } from '@/components/admin/ui/button'
import { DataTableToolbar } from '@/components/admin/data-table/data-table-toolbar'
import { DataTableFacetedFilter } from '@/components/admin/data-table/data-table-faceted-filter'
import { DataTableSearch } from '@/components/admin/data-table/data-table-search'
import { DataTableSortSelect } from '@/components/admin/data-table/data-table-sort-select'
import { useListParams } from '@/components/admin/data-table/use-list-params'
import {
  DEFAULT_ITEM_BOOK_SORT,
  DEFAULT_ITEM_BOOK_STATUS,
  ITEM_BOOK_SORT_OPTIONS,
  ITEM_BOOK_STATUS_OPTIONS,
} from '@/lib/admin/itembook-list-query'
import type { TribeRow } from '@/types/database'

interface ItemBookFiltersProps {
  tribes: Pick<TribeRow, 'id' | 'name'>[]
}

/**
 * 컬렉션 목록 필터 바(티켓 20260924_0945) — 공용 부품(`useListParams`·`DataTableSearch`·
 * `DataTableSortSelect`·`DataTableFacetedFilter`)으로 교체했다. 필터·정렬 값과 기본값은
 * 서버 페이지와 같은 `itembook-list-query.ts`가 단일 출처다 — 여기서 다시 나열하면 서버가 모르는
 * 값을 고를 수 있다.
 */
export default function ItemBookFilters({ tribes }: ItemBookFiltersProps) {
  const { q, filters, setFilters, reset } = useListParams({ defaults: { status: DEFAULT_ITEM_BOOK_STATUS } })

  const tribe = filters.tribe ?? 'all'
  const status = filters.status ?? DEFAULT_ITEM_BOOK_STATUS
  const hasFilter = q !== '' || Object.keys(filters).length > 0

  return (
    <DataTableToolbar
      actions={<DataTableSortSelect options={ITEM_BOOK_SORT_OPTIONS} defaultValue={DEFAULT_ITEM_BOOK_SORT} />}
    >
      <DataTableSearch placeholder="컬렉션 이름으로 검색..." />

      <DataTableFacetedFilter
        title="트라이브"
        options={tribes.map((f) => ({ value: f.id, label: f.name }))}
        selected={tribe === 'all' ? [] : [tribe]}
        onChange={(values) => setFilters({ tribe: values[0] ?? null })}
      />

      <DataTableFacetedFilter
        title="상태"
        options={ITEM_BOOK_STATUS_OPTIONS}
        selected={[status]}
        onChange={(values) => setFilters({ status: values[0] ?? null })}
      />

      {hasFilter && (
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={reset}>
          필터 초기화
        </Button>
      )}
    </DataTableToolbar>
  )
}
