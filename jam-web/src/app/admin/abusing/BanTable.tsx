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

export interface BanRow {
  id: string
  user_id: string
  ban_level: 'soft' | 'hard'
  reason: string
  expires_at: string | null
  created_at: string
  created_by: string
  user: { id: string; email: string; username: string } | null
}

interface BanTableProps {
  bans: BanRow[]
  /** 단건 해제 — 기존 `removeBan`(네이티브 confirm 포함) 그대로 재사용 */
  onRemove: (userId: string) => void
  /** 일괄 해제 — 선택된 유저 id 전체를 순차 해제한다 */
  onBulkRemove: (userIds: string[]) => Promise<void>
}

const columnHelper = createColumnHelper<DataTableFeatures, BanRow>()

/**
 * 섀도우밴 목록 테이블(20260826_015) — 3단계a 공용 Data Table 컴포넌트로 전환했다. 밴
 * 기록은 소수(현재 0건)라 서버 페이지네이션은 두지 않는다. 단건 해제(unban) API가 이미
 * 있어(`DELETE /api/admin/abusing/bans`) 그 API를 순차 호출하는 일괄 해제를 추가한다
 * (티켓 명시 — 배지 파일럿과 동일 방식).
 */
export function BanTable({ bans, onRemove, onBulkRemove }: BanTableProps) {
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
      columnHelper.accessor('ban_level', {
        id: 'banLevel',
        header: ({ column }) => <DataTableColumnHeader column={column} title="레벨" />,
        meta: { label: '레벨' },
        cell: ({ getValue }) => {
          const level = getValue()
          return (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${level === 'hard' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
              {level.toUpperCase()}
            </span>
          )
        },
      }),
      columnHelper.accessor('reason', {
        id: 'reason',
        header: '사유',
        enableSorting: false,
        meta: { label: '사유' },
        cell: ({ getValue }) => <span className="text-xs max-w-[160px] block truncate">{getValue()}</span>,
      }),
      columnHelper.accessor('expires_at', {
        id: 'expiresAt',
        header: '만료',
        enableSorting: false,
        meta: { label: '만료' },
        cell: ({ getValue }) => {
          const v = getValue()
          return <span className="text-xs text-muted-foreground">{v ? new Date(v).toLocaleDateString('ko-KR') : '영구'}</span>
        },
      }),
      columnHelper.accessor('created_by', {
        id: 'createdBy',
        header: '적용자',
        enableSorting: false,
        meta: { label: '적용자' },
        cell: ({ getValue }) => <span className="text-xs text-muted-foreground">{getValue()}</span>,
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <button
            onClick={() => onRemove(row.original.user_id)}
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
    data: bans,
    columns,
    getRowId: (row) => row.id,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const selectedUserIds = table.getSelectedRowModel().rows.map((row) => row.original.user_id)

  const handleBulkRemove = async () => {
    setBulkLoading(true)
    try {
      await onBulkRemove(selectedUserIds)
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

      <DataTableBulkActionBar count={selectedUserIds.length} onClear={() => setRowSelection({})}>
        <Button type="button" variant="outline" size="sm" onClick={() => setShowBulkConfirm(true)}>
          선택 항목 해제
        </Button>
      </DataTableBulkActionBar>

      <DataTable table={table} columnCount={columns.length} emptyMessage="섀도우밴 유저 없음" />

      <AlertDialog
        open={showBulkConfirm}
        onOpenChange={(open) => {
          if (!open && !bulkLoading) setShowBulkConfirm(false)
        }}
      >
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>섀도우밴 일괄 해제</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 {selectedUserIds.length}명의 섀도우밴을 해제할까요?
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
