'use client'

import { Button } from '@/components/admin/ui/button'
import { DataTableToolbar } from '@/components/admin/data-table/data-table-toolbar'
import { DataTableFacetedFilter } from '@/components/admin/data-table/data-table-faceted-filter'
import { DataTableSearch } from '@/components/admin/data-table/data-table-search'
import { DataTableSortSelect } from '@/components/admin/data-table/data-table-sort-select'
import { useListParams } from '@/components/admin/data-table/use-list-params'
import { DEFAULT_TODAY_LIST_SORT, TODAY_LIST_SORT_OPTIONS } from '@/lib/admin/today-list-query'
import { TODAY_TEMPLATE_OPTIONS } from '@/lib/admin/today-sections'

const TEMPLATE_OPTIONS = TODAY_TEMPLATE_OPTIONS.map((o) => ({ value: o.value as string, label: o.label }))
const SORT_OPTIONS = TODAY_LIST_SORT_OPTIONS.map((o) => ({ value: o.value as string, label: o.label }))

/**
 * 투데이 목록 필터 바(티켓 20260924_0947) — 템플릿 필터·제목 검색·정렬. 날짜(`date`)는
 * `TodayDateNav`가 같은 URL에서 관리하므로, 여기서 필터를 바꾸거나 초기화해도 보고 있는 날짜는
 * 그대로 둔다.
 */
export default function TodayFilterBar() {
  const { q, sort, filters, setFilters } = useListParams()

  const currentTemplate = filters.template
  const hasFilter = q !== '' || !!currentTemplate || (!!sort && sort !== DEFAULT_TODAY_LIST_SORT)

  return (
    <DataTableToolbar actions={<DataTableSortSelect options={SORT_OPTIONS} defaultValue={DEFAULT_TODAY_LIST_SORT} />}>
      <DataTableSearch placeholder="제목으로 검색..." />

      <DataTableFacetedFilter
        title="템플릿"
        options={TEMPLATE_OPTIONS}
        selected={currentTemplate ? [currentTemplate] : []}
        onChange={(values) => setFilters({ template: values[0] ?? null })}
      />

      {hasFilter && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={() => setFilters({ q: null, template: null, sort: null })}
        >
          필터 초기화
        </Button>
      )}
    </DataTableToolbar>
  )
}
