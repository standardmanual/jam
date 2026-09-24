'use client'

import { Button } from '@/components/admin/ui/button'
import { DataTableToolbar } from '@/components/admin/data-table/data-table-toolbar'
import { DataTableSearch } from '@/components/admin/data-table/data-table-search'
import { DataTableSortSelect } from '@/components/admin/data-table/data-table-sort-select'
import { useListParams } from '@/components/admin/data-table/use-list-params'

const SORT_OPTIONS = [
  { value: 'created_desc', label: '최근 등록순' },
  { value: 'created_asc', label: '오래된순' },
  { value: 'name_asc', label: '이름 오름차순' },
  { value: 'name_desc', label: '이름 내림차순' },
]

/**
 * 믹스 레시피 목록 필터 바(티켓 20260924_0949) — 레시피에는 활성 여부 칸이 없어 이름 검색과
 * 정렬만 둔다. 공용 부품(`DataTableSearch`·`DataTableSortSelect`)으로 URL 상태를 다룬다.
 */
export default function RecipeFilters() {
  const { q, reset } = useListParams()

  return (
    <DataTableToolbar actions={<DataTableSortSelect options={SORT_OPTIONS} defaultValue="created_desc" />}>
      <DataTableSearch placeholder="레시피 이름으로 검색..." />
      {q !== '' && (
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={reset}>
          필터 초기화
        </Button>
      )}
    </DataTableToolbar>
  )
}
