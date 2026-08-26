'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  createColumnHelper,
  useTable,
  type ColumnVisibilityState,
  type SortingState,
  type Updater,
} from '@tanstack/react-table'
import { dataTableFeatures, type DataTableFeatures } from '@/components/admin/data-table/features'
import { DataTable } from '@/components/admin/data-table/data-table'
import { DataTableColumnHeader } from '@/components/admin/data-table/data-table-column-header'
import { DataTableViewOptions } from '@/components/admin/data-table/data-table-view-options'
import type { PoiListRow } from './PoiList'

interface PoiTableProps {
  pois: PoiListRow[]
  badgeMap: Map<string, string>
  categoryLabelMap: Map<string, string>
}

const columnHelper = createColumnHelper<DataTableFeatures, PoiListRow>()

/** URL의 `sort` 파라미터 ↔ TanStack `SortingState` 변환 — "이름" 컬럼만 헤더 클릭으로 정렬한다
 *  (배지/컬렉션 목록과 동일 패턴, `admin/badges/BadgesTable.tsx` 참고). 최신순은 컬럼이 없어
 *  헤더 클릭 대상이 아니다 — `PoiFilters.tsx`의 정렬 드롭다운이 계속 담당한다. */
function paramToSorting(sort: string | null): SortingState {
  if (sort === 'name_asc') return [{ id: 'name', desc: false }]
  if (sort === 'name_desc') return [{ id: 'name', desc: true }]
  return []
}

function sortingToParam(sorting: SortingState): string | null {
  const nameSort = sorting.find((s) => s.id === 'name')
  if (!nameSort) return null
  return nameSort.desc ? 'name_desc' : 'name_asc'
}

export function PoiTable({ pois, badgeMap, categoryLabelMap }: PoiTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})

  const sorting = useMemo(() => paramToSorting(searchParams.get('sort')), [searchParams])

  const handleSortingChange = (updater: Updater<SortingState>) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater
    const params = new URLSearchParams(searchParams.toString())
    const sortParam = sortingToParam(next)
    if (sortParam) params.set('sort', sortParam)
    else params.delete('sort')
    params.delete('page')
    router.push(`/admin/poi?${params.toString()}`)
  }

  const columns = useMemo(
    () => columnHelper.columns([
      columnHelper.accessor('name', {
        id: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="이름" />,
        enableHiding: false,
        cell: ({ row }) => (
          <Link href={`/admin/poi/${row.original.id}`} className="font-medium hover:underline">
            {row.original.name}
          </Link>
        ),
      }),
      columnHelper.accessor('category', {
        id: 'category',
        header: '카테고리',
        enableSorting: false,
        meta: { label: '카테고리' },
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground">
            {categoryLabelMap.get(getValue()) || getValue()}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'coordinates',
        header: '위도 / 경도',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <span className="text-xs font-mono">
            {row.original.latitude.toFixed(4)}, {row.original.longitude.toFixed(4)}
          </span>
        ),
      }),
      columnHelper.accessor('radius_meters', {
        id: 'radius',
        header: '반경',
        enableSorting: false,
        meta: { label: '반경' },
        cell: ({ getValue }) => <span className="text-sm">{getValue()}m</span>,
      }),
      columnHelper.accessor('linked_badge_id', {
        id: 'linkedBadge',
        header: '연결 배지',
        enableSorting: false,
        meta: { label: '연결 배지' },
        cell: ({ getValue }) => {
          const id = getValue()
          return <span className="text-sm">{id ? (badgeMap.get(id) || id) : '—'}</span>
        },
      }),
    ]),
    [badgeMap, categoryLabelMap]
  )

  const table = useTable({
    features: dataTableFeatures,
    data: pois,
    columns,
    getRowId: (row) => row.id,
    manualSorting: true,
    state: { sorting, columnVisibility },
    onSortingChange: handleSortingChange,
    onColumnVisibilityChange: setColumnVisibility,
  })

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DataTableViewOptions table={table} />
      </div>
      <DataTable table={table} columnCount={columns.length} emptyMessage="등록된 POI가 없습니다." />
    </div>
  )
}
