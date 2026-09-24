'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { createColumnHelper, useTable, type ColumnVisibilityState } from '@tanstack/react-table'
import { toast } from 'sonner'
import { dataTableFeatures, type DataTableFeatures } from '@/components/admin/data-table/features'
import { DataTable } from '@/components/admin/data-table/data-table'
import { DataTableColumnHeader } from '@/components/admin/data-table/data-table-column-header'
import { DataTableViewOptions } from '@/components/admin/data-table/data-table-view-options'
import { DataTableBulkActionBar, type DataTableBulkAction } from '@/components/admin/data-table/data-table-bulk-action-bar'
import { DataTableSelectAllBanner } from '@/components/admin/data-table/data-table-select-all-banner'
import { createSelectColumn } from '@/components/admin/data-table/data-table-select-column'
import { useCrossPageSelection } from '@/components/admin/data-table/use-cross-page-selection'
import { useListParams, useUrlSorting } from '@/components/admin/data-table/use-list-params'
import { fetchListIds, downloadResponseAsFile } from '@/components/admin/data-table/admin-fetch'
import type { LedgerEntry } from '@/lib/admin/points-ledger-query'

interface HighValueTableProps {
  rows: LedgerEntry[]
  /** 현재 필터 조건에 맞는 전체 건수(한 쪽 건수가 아니다) — 전체 선택 배너에 쓴다 */
  totalCount: number
}

function fmt(n: number): string {
  return n.toLocaleString('ko-KR')
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

const columnHelper = createColumnHelper<DataTableFeatures, LedgerEntry>()

const SELECT_ALL_CAP = 1000
/** 머리 칸 정렬이 가능한 컬럼 id — URL `sort` 값은 `${id}_asc|desc`(서버 `parseLedgerListParams`와 같은 규칙) */
const HEADER_SORTS = ['amount', 'created'] as const

/**
 * 고액 지급/회수 원장 표(20260826_015, 20260924_0950 전환) — 서버 필터·정렬·번호 페이지 이동과
 * 페이지를 넘는 선택을 갖춘다. 지급/회수 원장은 회계성 로그라 삭제·수정 대상이 아니다(티켓
 * 명시) — 일괄 처리는 내보내기뿐이다. 행을 누르면 그 유저 상세로 이동한다(예전 링크와 같은 곳).
 */
export function HighValueTable({ rows, totalCount }: HighValueTableProps) {
  const { filterKey, filterQuery, sort } = useListParams()
  const { sorting, onSortingChange } = useUrlSorting(HEADER_SORTS, [])
  const { rowSelection, onRowSelectionChange, selectedIds, selectIds, clear } = useCrossPageSelection(filterKey)
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [exporting, setExporting] = useState(false)

  const columns = useMemo(
    () => columnHelper.columns([
      createSelectColumn(columnHelper),
      columnHelper.accessor((r) => r.username ?? r.user_id, {
        id: 'user',
        header: '유저',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <Link href={`/admin/users/${row.original.user_id}`} className="hover:text-foreground transition-colors">
            {row.original.username ?? row.original.user_id.slice(0, 8)}
          </Link>
        ),
      }),
      columnHelper.accessor('amount', {
        id: 'amount',
        header: ({ column }) => <DataTableColumnHeader column={column} title="금액" />,
        meta: { label: '금액' },
        cell: ({ getValue }) => {
          const amount = getValue()
          return (
            <span className={`font-bold ${amount > 0 ? '' : 'text-red-600'}`}>
              {amount > 0 ? '+' : '−'}{fmt(Math.abs(amount))}P
            </span>
          )
        },
      }),
      columnHelper.accessor('label', {
        id: 'label',
        header: '사유',
        enableSorting: false,
        meta: { label: '사유' },
        cell: ({ getValue }) => <span>{getValue()}</span>,
      }),
      columnHelper.accessor('created_at', {
        id: 'created',
        header: ({ column }) => <DataTableColumnHeader column={column} title="일시" />,
        meta: { label: '일시' },
        cell: ({ getValue }) => <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(getValue())}</span>,
      }),
    ]),
    []
  )

  const table = useTable({
    features: dataTableFeatures,
    data: rows,
    columns,
    getRowId: (row) => row.id,
    manualSorting: true,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange,
    onRowSelectionChange,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const pageIds = rows.map((r) => r.id)
  const offPageCount = selectedIds.filter((id) => !pageIds.includes(id)).length

  const fetchAllIds = async () => {
    const params = new URLSearchParams(filterQuery)
    if (sort) params.set('sort', sort)
    return fetchListIds(`/api/admin/points/ledger/ids?${params.toString()}`)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      await downloadResponseAsFile('/api/admin/points/ledger/export', 'points_ledger.csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '내보내기에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setExporting(false)
    }
  }

  const actions: DataTableBulkAction[] = [{ key: 'export', label: '내보내기', onClick: handleExport, disabled: exporting }]

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DataTableViewOptions table={table} />
      </div>

      <DataTableSelectAllBanner
        pageIds={pageIds}
        selection={selectedIds}
        totalCount={totalCount}
        cap={SELECT_ALL_CAP}
        fetchAllIds={fetchAllIds}
        selectIds={selectIds}
        clear={clear}
      />

      <DataTableBulkActionBar count={selectedIds.length} onClear={clear} actions={actions} offPageCount={offPageCount} />

      <DataTable
        table={table}
        columnCount={columns.length}
        emptyMessage="조건에 맞는 원장이 없습니다."
        getRowHref={(row) => `/admin/users/${row.original.user_id}`}
      />
    </div>
  )
}
