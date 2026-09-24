'use client'

import { Button } from '@/components/admin/ui/button'
import { DataTableToolbar } from '@/components/admin/data-table/data-table-toolbar'
import { DataTableFacetedFilter } from '@/components/admin/data-table/data-table-faceted-filter'
import { DataTableSearch } from '@/components/admin/data-table/data-table-search'
import { DataTableSortSelect } from '@/components/admin/data-table/data-table-sort-select'
import { useListParams } from '@/components/admin/data-table/use-list-params'

interface FilterOption {
  value: string
  label: string
}

interface BadgeFamiliesFilterBarProps {
  /** 종목 선택지 — 목록에 실제로 있는 종목만(순서는 배지 트리 탭 순서) */
  activityOptions: FilterOption[]
  /** 사용 조건 지표 선택지 — 라벨·순서는 조건 레지스트리에서 나온다 */
  conditionOptions: FilterOption[]
}

const SORT_OPTIONS = [
  { value: 'default', label: '기본순' },
  { value: 'name_asc', label: '계열명 오름차순' },
  { value: 'name_desc', label: '계열명 내림차순' },
  { value: 'count_desc', label: '배지 많은순' },
  { value: 'count_asc', label: '배지 적은순' },
]

/**
 * 계열 목록 필터 바 (티켓 20260905_0032 C-3, 20260924_0949에서 공용 부품으로 교체)
 *
 * 164계열이 되면 눈으로 훑을 수 없어 좁힐 수단을 둔다. 필터·검색·정렬 상태는 URL에 두고
 * (`useListParams`) 서버 컴포넌트가 `listFamilies`로 목록을 좁힌다 — 필터를 바꾸면 1쪽으로
 * 돌아간다. 배지 목록 필터와 같은 공용 부품이라 두 화면의 조작 방식이 갈리지 않는다.
 */
export default function BadgeFamiliesFilterBar({ activityOptions, conditionOptions }: BadgeFamiliesFilterBarProps) {
  const { q, filters, setFilters, reset } = useListParams()
  const hasFilter = q !== '' || Object.keys(filters).length > 0

  return (
    <DataTableToolbar actions={<DataTableSortSelect options={SORT_OPTIONS} defaultValue="default" />}>
      <DataTableSearch placeholder="계열명, 계열 키로 검색..." />

      <DataTableFacetedFilter
        title="종목"
        options={activityOptions}
        selected={filters.activity_type ? [filters.activity_type] : []}
        onChange={(values) => setFilters({ activity_type: values[0] ?? null })}
      />

      <DataTableFacetedFilter
        title="조건값"
        options={conditionOptions}
        selected={filters.condition_key ? [filters.condition_key] : []}
        onChange={(values) => setFilters({ condition_key: values[0] ?? null })}
      />

      {hasFilter && (
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={reset}>
          필터 초기화
        </Button>
      )}
    </DataTableToolbar>
  )
}
