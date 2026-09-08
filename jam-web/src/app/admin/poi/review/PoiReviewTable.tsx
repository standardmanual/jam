'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  createColumnHelper,
  useTable,
  type ColumnVisibilityState,
  type RowSelectionState,
} from '@tanstack/react-table'
import { Button } from '@/components/admin/ui/button'
import { Checkbox } from '@/components/admin/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/admin/ui/alert-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/admin/ui/dialog'
import { dataTableFeatures, type DataTableFeatures } from '@/components/admin/data-table/features'
import { DataTable } from '@/components/admin/data-table/data-table'
import { DataTableViewOptions } from '@/components/admin/data-table/data-table-view-options'
import { DataTableBulkActionBar } from '@/components/admin/data-table/data-table-bulk-action-bar'
import { UNASSIGNED_POI_CATEGORY_SLUG } from '@/lib/admin/poi-review'
import type { PoiCategoryRow, PoiRow } from '@/types/database'

export type PoiReviewRow = Pick<
  PoiRow,
  | 'id'
  | 'name'
  | 'latitude'
  | 'longitude'
  | 'category'
  | 'naver_category'
  | 'naver_keyword'
  | 'created_at'
  | 'is_active'
>

interface PoiReviewTableProps {
  pois: PoiReviewRow[]
  categories: PoiCategoryRow[]
}

const columnHelper = createColumnHelper<DataTableFeatures, PoiReviewRow>()

/** 카테고리 변경 다이얼로그가 어떤 대상에 적용되는지 — 단건(행 버튼)/다중선택(일괄 액션 바) 공용 */
interface CategoryDialogState {
  ids: string[]
  category: string
}

/**
 * POI 검토 큐 테이블(티켓 20260907_1242) — `admin/poi/PoiTable.tsx`·`admin/missions/MissionTable.tsx`와
 * 동일한 다중선택 패턴을 재사용한다.
 *
 * 행 단건 승인/거부는 즉시 실행한다(확인 다이얼로그 없음) — `PoiActiveToggleButton`과 같은
 * 이유로, 삭제가 아니라 되돌릴 수 있는 상태 변경이기 때문이다(승인은 재검토 큐에서 사라질
 * 뿐 `/admin/poi/[id]`에서 다시 바꿀 수 있고, 거부도 카테고리를 되돌리면 복구된다). 다중선택
 * 일괄 액션만 다른 화면들과 동일하게 확인 다이얼로그를 거친다 — 한 번의 클릭으로 여러 행에
 * 영향을 주기 때문이다. 카테고리 변경(단건·일괄 공통)은 대상 카테고리를 반드시 골라야 하므로
 * 그 선택 자체가 확인 단계를 겸한다.
 */
export function PoiReviewTable({ pois, categories }: PoiReviewTableProps) {
  const router = useRouter()

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [actionLoading, setActionLoading] = useState(false)
  const [categoryDialog, setCategoryDialog] = useState<CategoryDialogState | null>(null)
  const [bulkConfirmAction, setBulkConfirmAction] = useState<'approve' | 'reject' | null>(null)

  // AlertDialog/Dialog(Radix Portal)는 기본적으로 document.body에 렌더링되는데, shadcn 어드민
  // 테마 실값은 [data-admin-theme] 스코프 안에만 존재한다 — 포털 컨테이너를 그 스코프 노드로
  // 지정한다(PoiTable.tsx·MissionTable.tsx와 동일 패턴, 20260827_002 게이트 리뷰 회귀 방지).
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  // 필터·페이지 이동으로 목록(pois)이 바뀌면 이전 선택은 다른 행을 가리킬 수 있다 — 렌더 중
  // 이전 값과 비교해 초기화한다(PoiTable.tsx와 동일 패턴).
  const [prevPois, setPrevPois] = useState(pois)
  if (pois !== prevPois) {
    setPrevPois(pois)
    setRowSelection({})
  }

  const categoryLabelMap = useMemo(() => new Map(categories.map((c) => [c.slug, c.label])), [categories])
  const categoryOptions = useMemo(
    () => categories.filter((c) => c.slug !== UNASSIGNED_POI_CATEGORY_SLUG),
    [categories]
  )

  const refreshAfterAction = () => {
    router.refresh()
    setRowSelection({})
  }

  // 행 단건 액션 — 즉시 실행(위 컴포넌트 주석 참고).
  const handleApprove = async (id: string, category?: string) => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/poi/review/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', category }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) alert(data?.error ?? '승인 중 오류가 발생했습니다.')
      refreshAfterAction()
    } finally {
      setActionLoading(false)
      setCategoryDialog(null)
    }
  }

  const handleReject = async (id: string) => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/poi/review/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) alert(data?.error ?? '거부 중 오류가 발생했습니다.')
      refreshAfterAction()
    } finally {
      setActionLoading(false)
    }
  }

  // 다중선택 일괄 액션 — 순차 단건 PATCH 반복이 아니라 bulk 엔드포인트 하나로 처리한다.
  const runBulk = async (ids: string[], action: 'approve' | 'reject', category?: string) => {
    setActionLoading(true)
    try {
      const res = await fetch('/api/admin/poi/review/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action, category }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) alert(data?.error ?? '처리 중 오류가 발생했습니다.')
      refreshAfterAction()
    } finally {
      setActionLoading(false)
      setCategoryDialog(null)
      setBulkConfirmAction(null)
    }
  }

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
      columnHelper.accessor('name', {
        id: 'name',
        header: '이름',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <Link href={`/admin/poi/${row.original.id}`} className="font-medium hover:underline">
            {row.original.name}
          </Link>
        ),
      }),
      columnHelper.accessor('naver_category', {
        id: 'naverCategory',
        header: '네이버 원본 분류',
        enableSorting: false,
        meta: { label: '네이버 원본 분류' },
        cell: ({ getValue }) => <span className="text-sm">{getValue() || '—'}</span>,
      }),
      columnHelper.accessor('category', {
        id: 'category',
        header: '배정 카테고리',
        enableSorting: false,
        meta: { label: '배정 카테고리' },
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground">
            {categoryLabelMap.get(getValue()) || getValue()}
          </span>
        ),
      }),
      columnHelper.accessor('naver_keyword', {
        id: 'naverKeyword',
        header: '수집 키워드',
        enableSorting: false,
        meta: { label: '수집 키워드' },
        cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{getValue() || '—'}</span>,
      }),
      columnHelper.accessor('is_active', {
        id: 'isActive',
        header: '노출',
        enableSorting: false,
        meta: { label: '노출' },
        cell: ({ getValue }) => (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
              getValue()
                ? 'bg-neutral-900/10 text-neutral-900'
                : 'bg-white text-neutral-500 border border-neutral-200'
            }`}
          >
            {getValue() ? '활성' : '비활성'}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'coordinates',
        header: '좌표',
        enableSorting: false,
        meta: { label: '좌표' },
        cell: ({ row }) => (
          <span className="text-xs font-mono">
            {row.original.latitude.toFixed(4)}, {row.original.longitude.toFixed(4)}
          </span>
        ),
      }),
      columnHelper.accessor('created_at', {
        id: 'createdAt',
        header: '수집일',
        enableSorting: false,
        meta: { label: '수집일' },
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground">
            {new Date(getValue()).toLocaleDateString('ko-KR')}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={actionLoading}
              onClick={() => handleApprove(row.original.id)}
            >
              승인
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={actionLoading}
              onClick={() => setCategoryDialog({ ids: [row.original.id], category: row.original.category })}
            >
              카테고리 변경
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={actionLoading}
              onClick={() => handleReject(row.original.id)}
            >
              거부
            </Button>
          </div>
        ),
      }),
    ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categoryLabelMap, actionLoading]
  )

  const table = useTable({
    features: dataTableFeatures,
    data: pois,
    columns,
    getRowId: (row) => row.id,
    state: { rowSelection, columnVisibility },
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const selectedIds = table.getSelectedRowModel().rows.map((row) => row.original.id)

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DataTableViewOptions table={table} />
      </div>

      <DataTableBulkActionBar count={selectedIds.length} onClear={() => setRowSelection({})}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={actionLoading}
          onClick={() => setBulkConfirmAction('approve')}
        >
          선택 항목 일괄 승인
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={actionLoading}
          onClick={() => setCategoryDialog({ ids: selectedIds, category: '' })}
        >
          카테고리 변경 후 일괄 승인
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={actionLoading}
          onClick={() => setBulkConfirmAction('reject')}
        >
          선택 항목 일괄 거부
        </Button>
      </DataTableBulkActionBar>

      <DataTable table={table} columnCount={columns.length} emptyMessage="검토 대기 중인 POI가 없습니다." />

      {/* 카테고리 변경 다이얼로그 — 행 단건("카테고리 변경") · 일괄("카테고리 변경 후 일괄 승인") 공용 */}
      <Dialog
        open={categoryDialog !== null}
        onOpenChange={(open) => {
          if (!open && !actionLoading) setCategoryDialog(null)
        }}
      >
        <DialogContent container={themeContainer ?? undefined}>
          <DialogHeader>
            <DialogTitle>카테고리 변경 후 승인</DialogTitle>
          </DialogHeader>
          <Select
            value={categoryDialog?.category ?? ''}
            onValueChange={(v) => setCategoryDialog((prev) => (prev ? { ...prev, category: v } : prev))}
          >
            <SelectTrigger aria-label="배정 카테고리">
              <SelectValue placeholder="카테고리를 선택하세요" />
            </SelectTrigger>
            <SelectContent container={themeContainer ?? undefined}>
              {categoryOptions.map((c) => (
                <SelectItem key={c.slug} value={c.slug}>
                  {c.label} ({c.slug})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={actionLoading} onClick={() => setCategoryDialog(null)}>
              취소
            </Button>
            <Button
              type="button"
              disabled={actionLoading || !categoryDialog?.category}
              onClick={() => {
                if (!categoryDialog?.category) return
                if (categoryDialog.ids.length === 1) handleApprove(categoryDialog.ids[0], categoryDialog.category)
                else runBulk(categoryDialog.ids, 'approve', categoryDialog.category)
              }}
            >
              변경 후 승인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 일괄 승인/거부 확인 다이얼로그 — 한 번의 클릭으로 여러 행에 영향을 주므로 확인을 거친다 */}
      <AlertDialog
        open={bulkConfirmAction !== null}
        onOpenChange={(open) => {
          if (!open && !actionLoading) setBulkConfirmAction(null)
        }}
      >
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkConfirmAction === 'reject' ? 'POI 일괄 거부' : 'POI 일괄 승인'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkConfirmAction === 'reject'
                ? `선택한 ${selectedIds.length}개 POI를 거부합니다. 미분류(거부됨) 카테고리로 이관되고 지도에서 숨겨집니다. 필요하면 나중에 POI 상세화면에서 다시 되돌릴 수 있습니다.`
                : `선택한 ${selectedIds.length}개 POI를 현재 배정된 카테고리 그대로 승인합니다.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={actionLoading} onClick={() => setBulkConfirmAction(null)}>
              취소
            </Button>
            <Button
              type="button"
              variant={bulkConfirmAction === 'reject' ? 'destructive' : 'default'}
              disabled={actionLoading}
              onClick={() => bulkConfirmAction && runBulk(selectedIds, bulkConfirmAction)}
            >
              {bulkConfirmAction === 'reject' ? '거부' : '승인'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
