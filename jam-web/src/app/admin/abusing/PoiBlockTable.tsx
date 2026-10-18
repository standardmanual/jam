'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { createColumnHelper, useTable, type ColumnVisibilityState } from '@tanstack/react-table'
import { dataTableFeatures, type DataTableFeatures } from '@/components/admin/data-table/features'
import { DataTable } from '@/components/admin/data-table/data-table'
import { DataTableColumnHeader } from '@/components/admin/data-table/data-table-column-header'
import { DataTableViewOptions } from '@/components/admin/data-table/data-table-view-options'
import { DataTableBulkActionBar } from '@/components/admin/data-table/data-table-bulk-action-bar'
import { DataTableSelectAllBanner } from '@/components/admin/data-table/data-table-select-all-banner'
import { createSelectColumn } from '@/components/admin/data-table/data-table-select-column'
import { useCrossPageSelection } from '@/components/admin/data-table/use-cross-page-selection'
import { useListParams, useUrlSorting } from '@/components/admin/data-table/use-list-params'
import { ABUSING_SELECT_ALL_CAP, type PoiBlockRow } from '@/lib/admin/abusing-list'
import { useSanctionBulk } from './useSanctionBulk'

export type { PoiBlockRow }

interface PoiBlockTableProps {
  poiBlocks: PoiBlockRow[]
  /** 현재 필터 조건에 맞는 전체 건수 — 전체 선택 배너에 쓴다 */
  totalCount: number
}

const columnHelper = createColumnHelper<DataTableFeatures, PoiBlockRow>()

const HEADER_SORTS = ['expires'] as const

/**
 * POI 블록 목록 표(티켓 20260924_0952) — 옛 제재 표와 같은 조합이다. 표 안에서 바로 바꿀
 * 값은 없고(상위 티켓 §4.4), 일괄 처리는 [해제]·[만료 연장]이다. 행을 누르면 그 유저의 상세로
 * 이동한다.
 */
export function PoiBlockTable({ poiBlocks, totalCount }: PoiBlockTableProps) {
  const { filterKey, filterQuery } = useListParams()
  const { sorting, onSortingChange } = useUrlSorting(HEADER_SORTS, [])
  const { rowSelection, onRowSelectionChange, selectedIds, selectIds, clear } = useCrossPageSelection(filterKey)
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})

  const bulk = useSanctionBulk({
    bulkEndpoint: '/api/admin/abusing/poi-blocks/bulk',
    idsEndpoint: '/api/admin/abusing/poi-blocks/ids',
    noun: '장소 블록',
    selectedIds,
    clear,
    filterQuery,
    releaseImpact: (impact) => (
      <>
        아직 적용 중인 블록 {impact.activeCount ?? 0}건, 이미 만료된 블록 {impact.expiredCount ?? 0}건
      </>
    ),
  })

  const columns = useMemo(
    () =>
      columnHelper.columns([
        createSelectColumn(columnHelper),
        columnHelper.accessor((r) => r.user?.username ?? r.user_id, {
          id: 'user',
          header: '유저',
          enableSorting: false,
          enableHiding: false,
          cell: ({ row }) => (
            <Link href={`/admin/users/${row.original.user_id}`} className="block hover:underline">
              <span className="block font-medium">{row.original.user?.username ?? '—'}</span>
              <span className="block text-xs text-muted-foreground">
                {row.original.user?.email ?? row.original.user_id.slice(0, 8)}
              </span>
            </Link>
          ),
        }),
        columnHelper.accessor((r) => r.poi?.name ?? r.poi_id, {
          id: 'poi',
          header: '장소',
          enableSorting: false,
          meta: { label: '장소' },
          cell: ({ row }) => <span>{row.original.poi?.name ?? row.original.poi_id.slice(0, 8)}</span>,
        }),
        columnHelper.accessor('reason', {
          id: 'reason',
          header: '사유',
          enableSorting: false,
          meta: { label: '사유' },
          cell: ({ getValue }) => <span className="text-xs">{getValue()}</span>,
        }),
        columnHelper.accessor('blocked_until', {
          id: 'expires',
          header: ({ column }) => <DataTableColumnHeader column={column} title="차단 만료" />,
          meta: { label: '차단 만료' },
          cell: ({ getValue }) => (
            <span className="text-xs text-muted-foreground">
              {new Date(getValue()).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          ),
        }),
      ]),
    []
  )

  const table = useTable({
    features: dataTableFeatures,
    data: poiBlocks,
    columns,
    getRowId: (row) => row.id,
    manualSorting: true,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange,
    onRowSelectionChange,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const pageIds = poiBlocks.map((b) => b.id)
  const offPageCount = selectedIds.filter((id) => !pageIds.includes(id)).length

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DataTableViewOptions table={table} />
      </div>

      <DataTableSelectAllBanner
        pageIds={pageIds}
        selection={selectedIds}
        totalCount={totalCount}
        cap={ABUSING_SELECT_ALL_CAP}
        fetchAllIds={bulk.fetchAllIds}
        selectIds={selectIds}
        clear={clear}
      />

      <DataTableBulkActionBar count={selectedIds.length} onClear={clear} actions={bulk.actions} offPageCount={offPageCount} />

      <DataTable
        table={table}
        columnCount={columns.length}
        emptyMessage="조건에 맞는 장소 블록이 없어요."
        getRowHref={(row) => `/admin/users/${row.original.user_id}`}
      />

      {bulk.dialogs}
    </div>
  )
}
