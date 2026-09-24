'use client'

import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { DataTableToolbar } from '@/components/admin/data-table/data-table-toolbar'
import { DataTableFacetedFilter } from '@/components/admin/data-table/data-table-faceted-filter'
import { DataTableSearch } from '@/components/admin/data-table/data-table-search'
import { DataTableSortSelect } from '@/components/admin/data-table/data-table-sort-select'
import { useListParams } from '@/components/admin/data-table/use-list-params'
import { NAVER_CATEGORY_SEPARATOR } from '@/lib/admin/poi-review-list'
import type { PoiCategoryRow } from '@/types/database'

interface PoiReviewFiltersProps {
  categories: PoiCategoryRow[]
  /** 검토 대기 행의 네이버 원본 분류 고유값 — 필터 선택지 */
  naverCategories: string[]
}

const SORT_OPTIONS = [
  { value: 'created_desc', label: '수집일 최신순' },
  { value: 'created_asc', label: '수집일 오래된순' },
  { value: 'name_asc', label: '이름 오름차순' },
  { value: 'name_desc', label: '이름 내림차순' },
]

/**
 * POI 검토 큐 필터(티켓 20260907_1242, 공용 부품 전환 20260924_0948) — 이름 검색·배정 카테고리·
 * 네이버 원본 분류·수집일(범위)·정렬. 네이버 원본 분류는 여러 개를 함께 고를 수 있어(서버
 * `.in()`) `singleSelect={false}`이고, 값은 `|`로 이어 URL 한 키(`naver_category`)에 담는다.
 */
export default function PoiReviewFilters({ categories, naverCategories }: PoiReviewFiltersProps) {
  const { q, filters, setFilters, reset } = useListParams()

  const naverSelected = (filters.naver_category ?? '')
    .split(NAVER_CATEGORY_SEPARATOR)
    .filter((value) => value !== '')

  const hasFilter = q !== '' || Object.keys(filters).length > 0

  return (
    <DataTableToolbar actions={<DataTableSortSelect options={SORT_OPTIONS} defaultValue="created_desc" />}>
      <DataTableSearch placeholder="POI 이름으로 검색..." />

      <DataTableFacetedFilter
        title="배정 카테고리"
        options={categories.map((c) => ({ value: c.slug, label: `${c.label} (${c.slug})` }))}
        selected={filters.category ? [filters.category] : []}
        onChange={(values) => setFilters({ category: values[0] ?? null })}
      />
      <DataTableFacetedFilter
        title="네이버 원본 분류"
        options={naverCategories.map((value) => ({ value, label: value }))}
        selected={naverSelected}
        singleSelect={false}
        onChange={(values) => setFilters({ naver_category: values.join(NAVER_CATEGORY_SEPARATOR) || null })}
      />

      <div className="flex items-center gap-1.5">
        <span className="text-sm text-muted-foreground whitespace-nowrap">수집일</span>
        <Input
          type="date"
          aria-label="수집일 시작"
          value={filters.from ?? ''}
          onChange={(e) => setFilters({ from: e.target.value || null })}
          className="h-8 w-[150px]"
        />
        <span className="text-muted-foreground">~</span>
        <Input
          type="date"
          aria-label="수집일 끝"
          value={filters.to ?? ''}
          onChange={(e) => setFilters({ to: e.target.value || null })}
          className="h-8 w-[150px]"
        />
      </div>

      {hasFilter && (
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={reset}>
          필터 초기화
        </Button>
      )}
    </DataTableToolbar>
  )
}
