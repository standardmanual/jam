'use client'

import { Button } from '@/components/admin/ui/button'
import { DataTableToolbar } from '@/components/admin/data-table/data-table-toolbar'
import { DataTableFacetedFilter } from '@/components/admin/data-table/data-table-faceted-filter'
import { DataTableSearch } from '@/components/admin/data-table/data-table-search'
import { DataTableSortSelect } from '@/components/admin/data-table/data-table-sort-select'
import { useListParams } from '@/components/admin/data-table/use-list-params'
import { missionTypeLabel } from '@/lib/admin/badge-labels'

interface MissionFilterBarProps {
  /** 고른 구분에 실제로 존재하는 미션 유형 — 서버가 구분에 맞춰 좁혀 보낸다 */
  typeOptions: string[]
}

const KIND_OPTIONS = [
  { value: 'normal', label: '일반' },
  { value: 'gate', label: '게이트' },
]

const REWARD_OPTIONS = [
  { value: 'badge', label: '배지' },
  { value: 'points', label: '포인트' },
  { value: 'none', label: '보상 없음' },
]

const STATE_OPTIONS = [
  { value: 'upcoming', label: '예정' },
  { value: 'active', label: '진행 중' },
  { value: 'ended', label: '종료' },
]

const SORT_OPTIONS = [
  { value: 'created_desc', label: '최근 등록순' },
  { value: 'starts_desc', label: '시작일 늦은순' },
  { value: 'starts_asc', label: '시작일 빠른순' },
  { value: 'ends_asc', label: '종료일 빠른순' },
  { value: 'ends_desc', label: '종료일 늦은순' },
  { value: 'title_asc', label: '제목 오름차순' },
  { value: 'title_desc', label: '제목 내림차순' },
]

/**
 * 연쇄 필터 체인(부모 → 자식): 구분 → 미션 유형 → 보상 유형. 앞 필터를 바꾸면 뒤 필터 선택이
 * 함께 풀린다(`applyListParamPatch`의 cascade 규칙). 상태 필터는 이 체인 밖이다.
 */
const FILTER_CASCADE = ['kind', 'mission_type', 'reward']

/**
 * 미션 목록 필터 바(티켓 20260924_0946) — 공용 부품으로 제목 검색·연쇄 필터·상태 필터·정렬을
 * 구성한다. 모든 필터는 서버 `.eq()` 단일값 필터라 `singleSelect`(기본값)만 쓴다.
 */
export default function MissionFilterBar({ typeOptions }: MissionFilterBarProps) {
  const { q, filters, setFilters, reset } = useListParams({ cascade: FILTER_CASCADE })
  const hasFilter = q !== '' || Object.keys(filters).length > 0

  return (
    <DataTableToolbar actions={<DataTableSortSelect options={SORT_OPTIONS} defaultValue="created_desc" />}>
      <DataTableSearch placeholder="미션 제목으로 검색..." />

      <DataTableFacetedFilter
        title="구분"
        options={KIND_OPTIONS}
        selected={filters.kind ? [filters.kind] : []}
        onChange={(values) => setFilters({ kind: values[0] ?? null })}
      />
      <DataTableFacetedFilter
        title="미션 유형"
        options={typeOptions.map((type) => ({ value: type, label: missionTypeLabel(type) }))}
        selected={filters.mission_type ? [filters.mission_type] : []}
        onChange={(values) => setFilters({ mission_type: values[0] ?? null })}
      />
      <DataTableFacetedFilter
        title="보상 유형"
        options={REWARD_OPTIONS}
        selected={filters.reward ? [filters.reward] : []}
        onChange={(values) => setFilters({ reward: values[0] ?? null })}
      />
      <DataTableFacetedFilter
        title="상태"
        options={STATE_OPTIONS}
        selected={filters.state ? [filters.state] : []}
        onChange={(values) => setFilters({ state: values[0] ?? null })}
      />

      {hasFilter && (
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={reset}>
          필터 초기화
        </Button>
      )}
    </DataTableToolbar>
  )
}
