'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  createColumnHelper,
  useTable,
  type ColumnVisibilityState,
  type SortingState,
} from '@tanstack/react-table'
import { dataTableFeatures, type DataTableFeatures } from '@/components/admin/data-table/features'
import { DataTable } from '@/components/admin/data-table/data-table'
import { DataTableColumnHeader } from '@/components/admin/data-table/data-table-column-header'
import { DataTableViewOptions } from '@/components/admin/data-table/data-table-view-options'
import type { HighValueEntry } from '@/lib/points/summary'

interface HighValueTableProps {
  rows: HighValueEntry[]
}

function fmt(n: number): string {
  return n.toLocaleString('ko-KR')
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

const columnHelper = createColumnHelper<DataTableFeatures, HighValueEntry>()

/**
 * 최근 고액 지급/회수 테이블(20260826_015) — 3단계a 공용 Data Table 컴포넌트로 전환했다.
 * 지급/회수 원장은 회계성 로그라 삭제·수정 대상이 아니다(티켓 명시) — 행 선택/일괄 액션은
 * 두지 않고 표시/정렬 용도로만 쓴다.
 */
export function HighValueTable({ rows }: HighValueTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})

  const columns = useMemo(
    () => columnHelper.columns([
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
        id: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} title="일시" />,
        meta: { label: '일시' },
        // ISO 문자열은 사전식 정렬로도 시간순과 일치한다 — 기본 sortFn(원시값 비교)으로 충분.
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
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
  })

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DataTableViewOptions table={table} />
      </div>
      <DataTable table={table} columnCount={columns.length} emptyMessage="해당 없음" />
    </div>
  )
}
