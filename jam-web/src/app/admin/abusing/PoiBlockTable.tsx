'use client'

import { useMemo, useState } from 'react'
import {
  createColumnHelper,
  useTable,
  type ColumnVisibilityState,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table'
import { Button } from '@/components/admin/ui/button'
import { Checkbox } from '@/components/admin/ui/checkbox'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/admin/ui/alert-dialog'
import { dataTableFeatures, type DataTableFeatures } from '@/components/admin/data-table/features'
import { DataTable } from '@/components/admin/data-table/data-table'
import { DataTableColumnHeader } from '@/components/admin/data-table/data-table-column-header'
import { DataTableViewOptions } from '@/components/admin/data-table/data-table-view-options'
import { DataTableBulkActionBar } from '@/components/admin/data-table/data-table-bulk-action-bar'

export interface PoiBlockRow {
  id: string
  user_id: string
  poi_id: string
  blocked_until: string
  reason: string
  created_at: string
  user: { id: string; email: string; username: string } | null
  poi: { id: string; name: string } | null
}

interface PoiBlockTableProps {
  poiBlocks: PoiBlockRow[]
  /** 단건 해제 — 기존 `removePoiBlock` 그대로 재사용 */
  onRemove: (userId: string, poiId: string) => void
  /** 일괄 해제 — 선택된 (유저, POI) 쌍 전체를 순차 해제한다 */
  onBulkRemove: (pairs: { userId: string; poiId: string }[]) => Promise<void>
}

const columnHelper = createColumnHelper<DataTableFeatures, PoiBlockRow>()

/**
 * POI 블록 목록 테이블(20260826_015) — 3단계a 공용 Data Table 컴포넌트로 전환했다.
 * 단건 해제 API가 이미 있어(`DELETE /api/admin/abusing/poi-blocks`) `밴 기록`과 동일한
 * 원칙으로 그 API를 순차 호출하는 일괄 해제를 추가한다.
 */
export function PoiBlockTable({ poiBlocks, onRemove, onBulkRemove }: PoiBlockTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [bulkLoading, setBulkLoading] = useState(false)
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)

  // AlertDialog(Radix Portal)는 기본적으로 document.body에 렌더링되는데, shadcn 어드민 테마
  // 실값은 [data-admin-theme] 스코프 안에만 존재한다 — 포털 컨테이너를 그 스코프 노드로
  // 지정한다(20260827_002 게이트 리뷰에서 alert-dialog.tsx 팔레트 전환 후 미연결 시 흰
  // 배경 위 흰 글씨로 안 보이는 회귀를 발견해 추가).
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  const columns = useMemo(
    () => columnHelper.columns([
      columnHelper.display({
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
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
      columnHelper.accessor((r) => r.user?.username ?? r.user_id, {
        id: 'user',
        header: '유저',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.user?.username ?? '—'}</p>
            <p className="text-xs text-muted-foreground">{row.original.user?.email ?? row.original.user_id.slice(0, 8)}</p>
          </div>
        ),
      }),
      columnHelper.accessor((r) => r.poi?.name ?? r.poi_id, {
        id: 'poi',
        header: 'POI',
        enableSorting: false,
        meta: { label: 'POI' },
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
        id: 'blockedUntil',
        header: ({ column }) => <DataTableColumnHeader column={column} title="차단 만료" />,
        meta: { label: '차단 만료' },
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground">
            {new Date(getValue()).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <button
            onClick={() => onRemove(row.original.user_id, row.original.poi_id)}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-neutral-50"
          >
            해제
          </button>
        ),
      }),
    ]),
    [onRemove]
  )

  const table = useTable({
    features: dataTableFeatures,
    data: poiBlocks,
    columns,
    getRowId: (row) => row.id,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const selectedPairs = table.getSelectedRowModel().rows.map((row) => ({
    userId: row.original.user_id,
    poiId: row.original.poi_id,
  }))

  const handleBulkRemove = async () => {
    setBulkLoading(true)
    try {
      await onBulkRemove(selectedPairs)
      setRowSelection({})
    } finally {
      setBulkLoading(false)
      setShowBulkConfirm(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DataTableViewOptions table={table} />
      </div>

      <DataTableBulkActionBar count={selectedPairs.length} onClear={() => setRowSelection({})}>
        <Button type="button" variant="outline" size="sm" onClick={() => setShowBulkConfirm(true)}>
          선택 항목 해제
        </Button>
      </DataTableBulkActionBar>

      <DataTable table={table} columnCount={columns.length} emptyMessage="활성 POI 블록 없음" />

      <AlertDialog
        open={showBulkConfirm}
        onOpenChange={(open) => {
          if (!open && !bulkLoading) setShowBulkConfirm(false)
        }}
      >
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>POI 블록 일괄 해제</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 {selectedPairs.length}건의 POI 블록을 해제할까요?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={bulkLoading} onClick={() => setShowBulkConfirm(false)}>
              취소
            </Button>
            <Button type="button" variant="destructive" disabled={bulkLoading} onClick={handleBulkRemove}>
              계속
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
