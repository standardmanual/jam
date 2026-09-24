'use client'

import { Button } from '@/components/admin/ui/button'
import { DataTableToolbar } from '@/components/admin/data-table/data-table-toolbar'
import { DataTableFacetedFilter } from '@/components/admin/data-table/data-table-faceted-filter'
import { DataTableSearch } from '@/components/admin/data-table/data-table-search'
import { DataTableSortSelect } from '@/components/admin/data-table/data-table-sort-select'
import { useListParams } from '@/components/admin/data-table/use-list-params'
import type { PoiCategoryRow } from '@/types/database'

interface PoiFiltersProps {
  categories: PoiCategoryRow[]
}

const STATUS_OPTIONS = [
  { value: 'active', label: '활성' },
  { value: 'inactive', label: '비활성' },
]

const TIER_OPTIONS = [
  { value: '1', label: 'T1 수동 등록' },
  { value: '2', label: 'T2 자동수집' },
]

const LINKED_OPTIONS = [
  { value: 'yes', label: '연결됨' },
  { value: 'no', label: '연결 안 됨' },
]

const SORT_OPTIONS = [
  { value: 'created_desc', label: '최근 등록순' },
  { value: 'created_asc', label: '오래된순' },
  { value: 'name_asc', label: '이름 오름차순' },
  { value: 'name_desc', label: '이름 내림차순' },
]

/**
 * POI 목록 필터(티켓 20260924_0941) — 공용 부품(`useListParams`·`DataTableSearch`·
 * `DataTableSortSelect`·`DataTableFacetedFilter`)으로 전면 교체했다. 카테고리·상태·등급·
 * 연결 배지 유무 4개 필터는 전부 서버 `.eq()` 단일값 필터라 `singleSelect`(기본값)만 쓴다.
 */
export default function PoiFilters({ categories }: PoiFiltersProps) {
  const { q, filters, setFilters, reset } = useListParams()
  const hasFilter = q !== '' || Object.keys(filters).length > 0

  return (
    <DataTableToolbar actions={<DataTableSortSelect options={SORT_OPTIONS} defaultValue="created_desc" />}>
      <DataTableSearch placeholder="지점 이름으로 검색..." />

      <DataTableFacetedFilter
        title="카테고리"
        options={categories.map((c) => ({ value: c.slug, label: `${c.label} (${c.slug})` }))}
        selected={filters.category ? [filters.category] : []}
        onChange={(values) => setFilters({ category: values[0] ?? null })}
      />
      <DataTableFacetedFilter
        title="상태"
        options={STATUS_OPTIONS}
        selected={filters.status ? [filters.status] : []}
        onChange={(values) => setFilters({ status: values[0] ?? null })}
      />
      <DataTableFacetedFilter
        title="등급"
        options={TIER_OPTIONS}
        selected={filters.tier ? [filters.tier] : []}
        onChange={(values) => setFilters({ tier: values[0] ?? null })}
      />
      <DataTableFacetedFilter
        title="연결 배지"
        options={LINKED_OPTIONS}
        selected={filters.linked ? [filters.linked] : []}
        onChange={(values) => setFilters({ linked: values[0] ?? null })}
      />

      {hasFilter && (
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={reset}>
          필터 초기화
        </Button>
      )}
    </DataTableToolbar>
  )
}
