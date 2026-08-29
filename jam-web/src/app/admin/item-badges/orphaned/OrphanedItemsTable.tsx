'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  createColumnHelper,
  useTable,
  type ColumnVisibilityState,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table'
import { Checkbox } from '@/components/admin/ui/checkbox'
import { dataTableFeatures, type DataTableFeatures } from '@/components/admin/data-table/features'
import { DataTable } from '@/components/admin/data-table/data-table'
import { DataTableColumnHeader } from '@/components/admin/data-table/data-table-column-header'
import { DataTableViewOptions } from '@/components/admin/data-table/data-table-view-options'
import { DataTableBulkActionBar } from '@/components/admin/data-table/data-table-bulk-action-bar'
import { RARITY_LABEL, RARITY_BADGE_COLOR, formatDateTime } from '@/lib/admin/item-badge-status'
import { DestroyOrphanedAction } from '../_orphaned-actions/DestroyOrphanedAction'
import { ReassignOrphanedAction } from '../_orphaned-actions/ReassignOrphanedAction'

export interface OrphanedItemRow {
  id: string
  serialLabel: string
  badgeId: string
  badgeName: string
  badgeImageUrl: string | null
  badgeRarity: string
  mintedAt: string
}

interface OrphanedItemsTableProps {
  rows: OrphanedItemRow[]
}

const columnHelper = createColumnHelper<DataTableFeatures, OrphanedItemRow>()

/**
 * "소유자 없음" 전체 목록 테이블(티켓 20260830_0104) — `[badgeId]/SerialListTable.tsx`와
 * 동일한 다중 선택 + 일괄 액션 바 패턴(20260829_2150)을 재사용하되, 배지 무관 전체 목록이라
 * 배지(도안) 컬럼을 추가한다. 이 화면은 항상 "소유자 없음" 상태 개체만 보여주므로(서버에서
 * 이미 그 조건으로 걸러 옴), 모든 행에서 값이 동일한 "현재 상태"·"현재 위치/소유자" 컬럼은
 * 정보성이 없어 넣지 않는다 — 그 두 컬럼은 SerialListTable의 "배지별" 맥락에서만 의미가 있다.
 */
export function OrphanedItemsTable({ rows }: OrphanedItemsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.display({
          id: 'select',
          header: ({ table }) => (
            <Checkbox
              checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
              onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
              aria-label="전체 선택"
            />
          ),
          cell: ({ row }) => (
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label="행 선택"
            />
          ),
          enableSorting: false,
          enableHiding: false,
        }),
        columnHelper.display({
          id: 'badge',
          header: '배지',
          enableSorting: false,
          enableHiding: false,
          cell: ({ row }) => {
            const r = row.original
            return (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 flex-shrink-0 rounded bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
                  {r.badgeImageUrl ? (
                    <Image src={r.badgeImageUrl} alt={r.badgeName} width={32} height={32} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-gray-400 text-[10px]">—</span>
                  )}
                </div>
                <div className="min-w-0">
                  <Link href={`/admin/item-badges/${r.badgeId}`} className="font-medium truncate hover:underline block">
                    {r.badgeName}
                  </Link>
                  <span
                    className={`inline-block mt-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                      RARITY_BADGE_COLOR[r.badgeRarity] ?? 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {RARITY_LABEL[r.badgeRarity] ?? r.badgeRarity}
                  </span>
                </div>
              </div>
            )
          },
        }),
        columnHelper.accessor('serialLabel', {
          id: 'serial',
          header: '일련번호',
          enableSorting: false,
          enableHiding: false,
          cell: ({ row }) => (
            <Link
              href={`/admin/item-badges/${row.original.badgeId}/${row.original.id}`}
              className="font-mono font-medium hover:underline"
            >
              #{row.original.serialLabel}
            </Link>
          ),
        }),
        columnHelper.accessor('mintedAt', {
          id: 'mintedAt',
          header: ({ column }) => <DataTableColumnHeader column={column} title="발급일시" />,
          meta: { label: '발급일시' },
          cell: ({ getValue }) => (
            <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(getValue())}</span>
          ),
        }),
      ]),
    []
  )

  const table = useTable({
    features: dataTableFeatures,
    data: rows,
    columns,
    getRowId: (row) => row.id,
    // 이 화면에 오르는 행은 서버에서 이미 소유자 없음 상태로만 걸러 왔으므로 전 행 선택 가능.
    enableRowSelection: true,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const selectedItems = table.getSelectedRowModel().rows.map((row) => ({
    id: row.original.id,
    serialLabel: row.original.serialLabel,
  }))

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DataTableViewOptions table={table} />
      </div>

      <DataTableBulkActionBar count={selectedItems.length} onClear={() => setRowSelection({})}>
        <DestroyOrphanedAction items={selectedItems} label="일괄 폐기" onDone={() => setRowSelection({})} />
        <ReassignOrphanedAction items={selectedItems} label="일괄 재배정" onDone={() => setRowSelection({})} />
      </DataTableBulkActionBar>

      <DataTable table={table} columnCount={columns.length} emptyMessage="소유자 없는 개체가 없습니다." />
    </div>
  )
}
