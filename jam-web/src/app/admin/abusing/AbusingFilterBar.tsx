'use client'

import { Button } from '@/components/admin/ui/button'
import { DataTableToolbar } from '@/components/admin/data-table/data-table-toolbar'
import { DataTableFacetedFilter } from '@/components/admin/data-table/data-table-faceted-filter'
import { DataTableSearch } from '@/components/admin/data-table/data-table-search'
import { useListParams } from '@/components/admin/data-table/use-list-params'

const STATUS_OPTIONS = [
  { value: 'active', label: '활성' },
  { value: 'expired', label: '만료' },
  { value: 'all', label: '전체' },
]

interface AbusingFilterBarProps {
  placeholder: string
  /** 상태 선택지. 기본은 활성·만료·전체(POI 블록). 이용 정지 탭은 정지 중·풀림·전체를 넘긴다 */
  statusOptions?: { value: string; label: string }[]
}

/**
 * 이용 정지·POI 블록 탭이 함께 쓰는 필터 바(티켓 20260924_0952, 20261017_1426) — 검색과 상태(활성·만료·전체, 이용 정지는 정지 중·풀림·전체).
 * 상태 기본값 `active`를 등록해 두면 "전체"를 골라도 URL에 남는다(`BadgesFilterBar`와 같은 규칙).
 * `tab`은 URL에 함께 있는 값이라 필터로 세지 않고, 초기화도 검색·상태만 지운다(탭이 풀리면 안 된다).
 */
export default function AbusingFilterBar({ placeholder, statusOptions = STATUS_OPTIONS }: AbusingFilterBarProps) {
  const { q, filters, setFilters } = useListParams({ defaults: { status: 'active' } })
  const currentStatus = filters.status ?? 'active'
  const hasFilter = q !== '' || filters.status !== undefined

  return (
    <DataTableToolbar>
      <DataTableSearch placeholder={placeholder} />
      <DataTableFacetedFilter
        title="상태"
        options={statusOptions}
        selected={[currentStatus]}
        onChange={(values) => setFilters({ status: values[0] ?? null })}
      />
      {hasFilter && (
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setFilters({ q: null, status: null })}>
          필터 초기화
        </Button>
      )}
    </DataTableToolbar>
  )
}
