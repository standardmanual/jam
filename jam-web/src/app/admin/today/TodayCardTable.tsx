'use client'

import { memo, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
  /** 현재 캘린더뷰가 보고 있는 날짜('YYYY-MM-DD') — [수정]·[상세보기] 링크의 `?date=`로 실어
   *  날라 전용 화면에서 저장·취소·삭제 후 이 날짜의 목록으로 돌아오게 한다(티켓 20260911_1454). */
  selectedDate: string
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
 *
 * [수정]은 인라인 폼을 펼치던 콜백에서 전용 수정 화면(`[id]/edit`)으로 이동하는 링크로
 * 바뀌었다(User Story 12) — 목록 자체의 테이블 디자인·일괄 작업은 이번 티켓 범위 밖이라
 * 그대로 뒀다(티켓 20260911_1454).
 */
function TodayCardTableInner({ cards, selectedDate, onToggleActive, onDelete }: TodayCardTableProps) {
  const router = useRouter()
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [bulkLoading, setBulkLoading] = useState(false)
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const now = new Date()

  // AlertDialog(Radix Portal)는 기본적으로 document.body에 렌더링되는데, shadcn 어드민 테마
  // 실값은 [data-admin-theme] 스코프 안에만 존재한다 — 포털 컨테이너를 그 스코프 노드로
  // 지정한다 (4단계a `BadgeForm.tsx`와 동일 패턴, 20260827_002 게이트 리뷰에서 alert-dialog.tsx
  // 팔레트 전환 후 미연결 시 흰 배경 위 흰 글씨로 안 보이는 회귀를 발견해 추가).
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
            <Link href={`/admin/today/${row.original.id}?date=${selectedDate}`} className="text-xs hover:opacity-70">
              상세보기
            </Link>
            <Link href={`/admin/today/${row.original.id}/edit?date=${selectedDate}`} className="text-xs hover:opacity-70">
              수정
            </Link>
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
    [selectedDate, onToggleActive, onDelete]
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

  // 일괄 하드 삭제(20260907_1134) — 참조 위험이 낮다고 판단해 별도 가드 없이 한 번의
  // DELETE 쿼리로 처리한다(순차 단건 호출이 아니다).
  const handleBulkDelete = async () => {
    setBulkLoading(true)
    try {
      const res = await fetch('/api/admin/today/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        alert(data?.error ?? '일괄 삭제 중 오류가 발생했습니다.')
      }
      router.refresh()
      setRowSelection({})
    } finally {
      setBulkLoading(false)
      setShowBulkDeleteConfirm(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DataTableViewOptions table={table} />
      </div>

      <DataTableBulkActionBar count={selectedIds.length} onClear={() => setRowSelection({})}>
        <Button type="button" variant="outline" size="sm" disabled={bulkLoading} onClick={() => setShowBulkConfirm(true)}>
          선택 항목 비활성화
        </Button>
        <Button type="button" variant="destructive" size="sm" disabled={bulkLoading} onClick={() => setShowBulkDeleteConfirm(true)}>
          선택 항목 삭제
        </Button>
      </DataTableBulkActionBar>

      <DataTable table={table} columnCount={columns.length} emptyMessage="카드 없음" />

      <AlertDialog
        open={showBulkConfirm}
        onOpenChange={(open) => {
          if (!open && !bulkLoading) setShowBulkConfirm(false)
        }}
      >
        <AlertDialogContent container={themeContainer ?? undefined}>
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

      <AlertDialog
        open={showBulkDeleteConfirm}
        onOpenChange={(open) => {
          if (!open && !bulkLoading) setShowBulkDeleteConfirm(false)
        }}
      >
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>투데이 카드 일괄 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 {selectedIds.length}개 카드를 삭제합니다. 삭제하면 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={bulkLoading} onClick={() => setShowBulkDeleteConfirm(false)}>
              취소
            </Button>
            <Button type="button" variant="destructive" disabled={bulkLoading} onClick={handleBulkDelete}>
              삭제
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export const TodayCardTable = memo(TodayCardTableInner)
