'use client'

import { memo, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
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
import type { TodayCardRow } from '@/types/database'

interface TodayCardTableProps {
  cards: TodayCardRow[]
  onEdit: (card: TodayCardRow) => void
  onToggleActive: (card: TodayCardRow) => void
  onDelete: (id: string) => void
}

type Status = '비활성' | '종료' | '예약' | '노출중'

const columnHelper = createColumnHelper<DataTableFeatures, TodayCardRow>()

function statusOf(c: TodayCardRow, now: Date): Status {
  const started = new Date(c.starts_at) <= now
  const ended = new Date(c.ends_at) < now
  if (!c.is_active) return '비활성'
  if (ended) return '종료'
  if (!started) return '예약'
  return '노출중'
}

/**
 * 투데이 카드 목록 테이블(20260826_015) — `TodayCardList.tsx`의 저작 폼과 분리된 자식
 * 컴포넌트로, 3단계a 공용 Data Table 컴포넌트로 전환했다. 40건 규모라 서버 페이지네이션은
 * 두지 않고(사전 조사 결과) 정렬도 클라이언트에서 처리한다.
 *
 * `is_active`가 실존 컬럼이라(배지/컬렉션과 동일하게 소프트 비활성화 개념) 행 선택 + 일괄
 * 비활성화를 추가한다 — 기존 단건 PATCH(`/api/admin/today/[id]`)를 순차 호출한다
 * (20260826_014 배지 파일럿과 동일 방식).
 */
function TodayCardTableInner({ cards, onEdit, onToggleActive, onDelete }: TodayCardTableProps) {
  const router = useRouter()
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [bulkLoading, setBulkLoading] = useState(false)
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const now = new Date()

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
      columnHelper.accessor('title', {
        id: 'title',
        header: ({ column }) => <DataTableColumnHeader column={column} title="제목" />,
        enableHiding: false,
        sortFn: 'text',
        cell: ({ getValue }) => <span className="font-medium max-w-[220px] block truncate">{getValue()}</span>,
      }),
      columnHelper.accessor('template_type', {
        id: 'template',
        header: '템플릿',
        enableSorting: false,
        meta: { label: '템플릿' },
        cell: ({ getValue }) => <span className="text-xs text-muted-foreground">{getValue()}</span>,
      }),
      columnHelper.accessor('layout_type', {
        id: 'layout',
        header: '노출형태',
        enableSorting: false,
        meta: { label: '노출형태' },
        cell: ({ getValue }) => <span className="text-xs text-muted-foreground">{getValue()}</span>,
      }),
      columnHelper.accessor('exposure_tags', {
        id: 'exposureTags',
        header: '노출조건',
        enableSorting: false,
        meta: { label: '노출조건' },
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground max-w-[180px] block truncate">
            {getValue().join(', ')}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'period',
        header: '기간',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {new Date(row.original.starts_at).toLocaleDateString('ko-KR')} ~<br />
            {new Date(row.original.ends_at).toLocaleDateString('ko-KR')}
          </span>
        ),
      }),
      columnHelper.accessor((r) => statusOf(r, now), {
        id: 'status',
        header: '상태',
        enableSorting: false,
        meta: { label: '상태' },
        cell: ({ getValue }) => {
          const status = getValue()
          const cls =
            status === '노출중'
              ? 'bg-neutral-900/20 text-neutral-900'
              : status === '예약'
                ? 'bg-amber-50 text-amber-600'
                : 'bg-neutral-100 text-neutral-500'
          return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{status}</span>
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-3 whitespace-nowrap">
            <button onClick={() => onEdit(row.original)} className="text-xs hover:opacity-70">
              수정
            </button>
            <button onClick={() => onToggleActive(row.original)} className="text-xs hover:opacity-70">
              {row.original.is_active ? '비활성화' : '활성화'}
            </button>
            <button onClick={() => onDelete(row.original.id)} className="text-xs text-red-600 hover:text-red-700">
              삭제
            </button>
          </div>
        ),
      }),
    ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onEdit, onToggleActive, onDelete]
  )

  const table = useTable({
    features: dataTableFeatures,
    data: cards,
    columns,
    getRowId: (row) => row.id,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const selectedIds = table.getSelectedRowModel().rows.map((row) => row.original.id)

  const handleBulkDeactivate = async () => {
    setBulkLoading(true)
    try {
      let failCount = 0
      for (const id of selectedIds) {
        const res = await fetch(`/api/admin/today/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: false }),
        })
        if (!res.ok) failCount += 1
      }
      if (failCount > 0) {
        alert(`${failCount}개 카드의 상태 변경에 실패했습니다. 다시 시도해주세요.`)
      }
      router.refresh()
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

      <DataTableBulkActionBar count={selectedIds.length} onClear={() => setRowSelection({})}>
        <Button type="button" variant="destructive" size="sm" onClick={() => setShowBulkConfirm(true)}>
          선택 항목 비활성화
        </Button>
      </DataTableBulkActionBar>

      <DataTable table={table} columnCount={columns.length} emptyMessage="카드 없음" />

      <AlertDialog
        open={showBulkConfirm}
        onOpenChange={(open) => {
          if (!open && !bulkLoading) setShowBulkConfirm(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>투데이 카드 일괄 비활성화</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 {selectedIds.length}개 카드를 비활성화하면 홈(투데이)에 더 이상 노출되지 않습니다.
              계속하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={bulkLoading} onClick={() => setShowBulkConfirm(false)}>
              취소
            </Button>
            <Button type="button" variant="destructive" disabled={bulkLoading} onClick={handleBulkDeactivate}>
              계속
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export const TodayCardTable = memo(TodayCardTableInner)
