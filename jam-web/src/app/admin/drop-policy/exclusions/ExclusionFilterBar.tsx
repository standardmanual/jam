'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/admin/ui/button'
import { DataTableToolbar } from '@/components/admin/data-table/data-table-toolbar'
import { DataTableFacetedFilter } from '@/components/admin/data-table/data-table-faceted-filter'
import { DataTableSearch } from '@/components/admin/data-table/data-table-search'
import { DataTableSortSelect } from '@/components/admin/data-table/data-table-sort-select'
import { useListParams } from '@/components/admin/data-table/use-list-params'
import { collectionOptionsForTribe, type ExclusionTab } from '@/lib/admin/drop-exclusion-list'

interface ExclusionFilterBarProps {
  tab: ExclusionTab
  tribes: { id: string; name: string }[]
  itemBooks: { id: string; name: string; tribe_id: string | null }[]
}

const STATUS_OPTIONS = [
  { value: 'excluded', label: '제외됨' },
  { value: 'included', label: '드랍 대상' },
]

const SORT_OPTIONS: Record<ExclusionTab, { value: string; label: string }[]> = {
  badges: [
    { value: 'name_asc', label: '이름 오름차순' },
    { value: 'name_desc', label: '이름 내림차순' },
    { value: 'rarity_asc', label: '등급 낮은순' },
    { value: 'rarity_desc', label: '등급 높은순' },
  ],
  collections: [
    { value: 'name_asc', label: '이름 오름차순' },
    { value: 'name_desc', label: '이름 내림차순' },
  ],
}

/**
 * 드랍 제외 관리 화면의 조회 필터(티켓 20260911_2220, 공용 부품 전환 20260924_0948) — 트라이브 →
 * 컬렉션 연쇄 필터(트라이브를 바꾸면 컬렉션 선택이 풀린다), 이름 검색, 상태(제외됨/드랍 대상), 정렬.
 * 트라이브 선택은 목록을 좁히는 용도일 뿐, 트라이브 자체를 드랍 제외하는 기능은 없다(사용자 확정).
 * 컬렉션 필터는 아이템배지 탭에만 있다 — 컬렉션 탭은 컬렉션 자체가 목록이다.
 */
export function ExclusionFilterBar({ tab, tribes, itemBooks }: ExclusionFilterBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { q, filters, setFilters } = useListParams({ cascade: ['tribe_id', 'item_book_id'] })

  // `tab`은 필터가 아니라 화면 구분이라 필터 유무·초기화 대상에서 뺀다
  const hasFilter = q !== '' || Object.keys(filters).some((key) => key !== 'tab')

  const collectionOptions = collectionOptionsForTribe(itemBooks, filters.tribe_id ?? null)

  return (
    <DataTableToolbar
      actions={<DataTableSortSelect key={tab} options={SORT_OPTIONS[tab]} defaultValue="name_asc" />}
    >
      <DataTableSearch key={tab} placeholder={tab === 'badges' ? '배지 이름으로 검색...' : '컬렉션 이름으로 검색...'} />

      <DataTableFacetedFilter
        title="트라이브"
        options={tribes.map((t) => ({ value: t.id, label: t.name }))}
        selected={filters.tribe_id ? [filters.tribe_id] : []}
        onChange={(values) => setFilters({ tribe_id: values[0] ?? null })}
      />
      {tab === 'badges' && (
        <DataTableFacetedFilter
          title="컬렉션"
          options={collectionOptions.map((b) => ({ value: b.id, label: b.name }))}
          selected={filters.item_book_id ? [filters.item_book_id] : []}
          onChange={(values) => setFilters({ item_book_id: values[0] ?? null })}
        />
      )}
      <DataTableFacetedFilter
        title="상태"
        options={STATUS_OPTIONS}
        selected={filters.status ? [filters.status] : []}
        onChange={(values) => setFilters({ status: values[0] ?? null })}
      />

      {hasFilter && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={() => router.push(`${pathname}?tab=${tab}`)}
        >
          필터 초기화
        </Button>
      )}
    </DataTableToolbar>
  )
}
