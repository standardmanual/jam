'use client'

import { Button } from '@/components/admin/ui/button'
import { DataTableToolbar } from '@/components/admin/data-table/data-table-toolbar'
import { DataTableFacetedFilter } from '@/components/admin/data-table/data-table-faceted-filter'
import { DataTableSearch } from '@/components/admin/data-table/data-table-search'
import { DataTableSortSelect } from '@/components/admin/data-table/data-table-sort-select'
import { useListParams } from '@/components/admin/data-table/use-list-params'

// `admin/badges/BadgesFilterBar.tsx`의 RARITY_OPTIONS와 동일 — badges.rarity가 같은 enum이라
// 표기도 동일하게 맞춘다(티켓 20260830_1242).
const RARITY_OPTIONS = [
  { value: 'common', label: 'Common' },
  { value: 'rare', label: 'Rare' },
  { value: 'epic', label: 'Epic' },
  { value: 'mystic', label: 'Mystic' },
]

const SORT_OPTIONS = [
  { value: 'name_asc', label: '이름 오름차순' },
  { value: 'name_desc', label: '이름 내림차순' },
]

interface ItemBadgeSearchBarProps {
  tribes: { id: string; name: string }[]
  itemBooks: { id: string; name: string; tribe_id: string | null }[]
}

/**
 * 아이템배지 현황 필터 바(티켓 20260829_2139, 20260830_1242) — 20260924_0950에서 공용 부품
 * (`useListParams`·`DataTableSearch`·`DataTableSortSelect`·`DataTableFacetedFilter`)으로
 * 교체했다. 필터·검색·정렬이 바뀌면 쪽 번호가 1쪽으로 돌아간다. 트라이브 → 컬렉션 연쇄는
 * 유지한다: 트라이브를 바꾸면 이미 고른 컬렉션이 풀린다(`cascade`).
 */
export function ItemBadgeSearchBar({ tribes, itemBooks }: ItemBadgeSearchBarProps) {
  const { q, filters, setFilters, reset } = useListParams({ cascade: ['tribe_id', 'item_book_id'] })
  const hasFilter = q !== '' || Object.keys(filters).length > 0

  // 선택된 트라이브 기준으로 컬렉션 옵션을 좁힌다
  const filteredItemBooks = filters.tribe_id ? itemBooks.filter((b) => b.tribe_id === filters.tribe_id) : itemBooks

  return (
    <DataTableToolbar actions={<DataTableSortSelect options={SORT_OPTIONS} defaultValue="name_asc" />}>
      <DataTableSearch placeholder="배지 이름으로 검색..." />

      <DataTableFacetedFilter
        title="트라이브"
        options={tribes.map((t) => ({ value: t.id, label: t.name }))}
        selected={filters.tribe_id ? [filters.tribe_id] : []}
        onChange={(values) => setFilters({ tribe_id: values[0] ?? null })}
      />
      <DataTableFacetedFilter
        title="컬렉션"
        options={filteredItemBooks.map((b) => ({ value: b.id, label: b.name }))}
        selected={filters.item_book_id ? [filters.item_book_id] : []}
        onChange={(values) => setFilters({ item_book_id: values[0] ?? null })}
      />
      <DataTableFacetedFilter
        title="등급"
        options={RARITY_OPTIONS}
        selected={filters.rarity ? [filters.rarity] : []}
        onChange={(values) => setFilters({ rarity: values[0] ?? null })}
      />

      {hasFilter && (
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={reset}>
          필터 초기화
        </Button>
      )}
    </DataTableToolbar>
  )
}
