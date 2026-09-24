'use client'

import { Button } from '@/components/admin/ui/button'
import { DataTableToolbar } from '@/components/admin/data-table/data-table-toolbar'
import { DataTableFacetedFilter } from '@/components/admin/data-table/data-table-faceted-filter'
import { DataTableSearch } from '@/components/admin/data-table/data-table-search'
import { DataTableSortSelect } from '@/components/admin/data-table/data-table-sort-select'
import { useListParams } from '@/components/admin/data-table/use-list-params'
import { DEFAULT_USER_LIST_SORT, USER_LIST_SORT_OPTIONS } from '@/lib/admin/user-list'

const ONBOARDING_OPTIONS = [
  { value: 'done', label: '온보딩 완료' },
  { value: 'pending', label: '온보딩 미완료' },
]

const BAN_OPTIONS = [
  { value: 'banned', label: '제재 중' },
  { value: 'clean', label: '제재 없음' },
]

interface UsersFilterBarProps {
  tribes: { id: string; name: string }[]
}

/**
 * 유저 조회 필터 바(티켓 20260924_0951) — 이름·이메일 검색, 트라이브·온보딩·제재 상태 필터,
 * 정렬. URL 상태 규칙은 공용 부품(`useListParams`)이 갖는다.
 */
export default function UsersFilterBar({ tribes }: UsersFilterBarProps) {
  const { q, filters, setFilters, reset } = useListParams()
  const hasFilter = q !== '' || Object.keys(filters).length > 0

  return (
    <DataTableToolbar actions={<DataTableSortSelect options={USER_LIST_SORT_OPTIONS} defaultValue={DEFAULT_USER_LIST_SORT} />}>
      <DataTableSearch placeholder="이름, 이메일로 검색..." />

      <DataTableFacetedFilter
        title="트라이브"
        options={tribes.map((t) => ({ value: t.id, label: t.name }))}
        selected={filters.tribe_id ? [filters.tribe_id] : []}
        onChange={(values) => setFilters({ tribe_id: values[0] ?? null })}
      />
      <DataTableFacetedFilter
        title="온보딩"
        options={ONBOARDING_OPTIONS}
        selected={filters.onboarding ? [filters.onboarding] : []}
        onChange={(values) => setFilters({ onboarding: values[0] ?? null })}
      />
      <DataTableFacetedFilter
        title="제재"
        options={BAN_OPTIONS}
        selected={filters.ban ? [filters.ban] : []}
        onChange={(values) => setFilters({ ban: values[0] ?? null })}
      />

      {hasFilter && (
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={reset}>
          필터 초기화
        </Button>
      )}
    </DataTableToolbar>
  )
}
