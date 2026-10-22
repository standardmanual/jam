'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createColumnHelper, useTable, type ColumnVisibilityState } from '@tanstack/react-table'
import { toast } from 'sonner'
import { Button } from '@/components/admin/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/admin/ui/dialog'
import { dataTableFeatures, type DataTableFeatures } from '@/components/admin/data-table/features'
import { DataTable } from '@/components/admin/data-table/data-table'
import { DataTableColumnHeader } from '@/components/admin/data-table/data-table-column-header'
import { DataTableViewOptions } from '@/components/admin/data-table/data-table-view-options'
import { DataTableBulkActionBar, type DataTableBulkAction } from '@/components/admin/data-table/data-table-bulk-action-bar'
import { DataTableSelectAllBanner } from '@/components/admin/data-table/data-table-select-all-banner'
import { BulkConfirmDialog } from '@/components/admin/data-table/data-table-bulk-confirm-dialog'
import { createSelectColumn } from '@/components/admin/data-table/data-table-select-column'
import { useCrossPageSelection } from '@/components/admin/data-table/use-cross-page-selection'
import { useListParams, useUrlSorting } from '@/components/admin/data-table/use-list-params'
import { useAdminPortalContainer } from '@/components/admin/data-table/use-admin-portal-container'
import { runBulk, fetchListIds } from '@/components/admin/data-table/admin-fetch'
import { toastBulkResult } from '@/components/admin/ui/toast-helpers'
import { UNASSIGNED_POI_CATEGORY_SLUG } from '@/lib/admin/poi-review'
import type { PoiReviewRow } from '@/lib/admin/poi-review-list'
import type { PoiCategoryRow } from '@/types/database'

interface PoiReviewTableProps {
  pois: PoiReviewRow[]
  categories: PoiCategoryRow[]
  /** 현재 필터 조건에 맞는 검토 대기 전체 건수 — 전체 선택 배너에 쓴다 */
  totalCount: number
}

const columnHelper = createColumnHelper<DataTableFeatures, PoiReviewRow>()

const SELECT_ALL_CAP = 1000
const BULK_ENDPOINT = '/api/admin/poi/review/bulk'

/** 카테고리 지정 다이얼로그가 어떤 대상에 적용되는지 — 단건(행 버튼)/다중선택(일괄 액션 바) 공용 */
interface CategoryDialogState {
  ids: string[]
  category: string
}

type BulkConfirmAction = 'approve' | 'reject'

const CONFIRM_META: Record<BulkConfirmAction, { title: string; verb: string; note: string }> = {
  approve: {
    title: '장소 일괄 활성화',
    verb: '활성화',
    note: '현재 배정된 카테고리 그대로 활성화해요',
  },
  reject: {
    title: '장소 일괄 거부',
    verb: '거부',
    note: '미분류(거부됨) 카테고리로 이동하고 지도에서 숨겨져요. 나중에 장소 상세 화면에서 되돌릴 수 있어요',
  },
}

/**
 * POI 검토 큐 테이블(티켓 20260907_1242, 공용 부품 전환 20260924_0948) — `admin/poi/PoiTable.tsx`와
 * 같은 공용 부품(선택 유지·전체 선택 배너·일괄 바·확인창)을 쓴다.
 *
 * 행 안 버튼 3개(활성화·카테고리 지정 후 활성화·거부)는 단건 라우트(`/api/admin/poi/review/[id]`)로
 * 즉시 실행한다 — 삭제가 아니라 되돌릴 수 있는 상태 변경이라 확인창이 없다(20260924_0941 활성 칸과
 * 같은 이유). 일괄 처리는 등급 1이라 "N건을 ○○할까요?" 확인창을 거친다. 필터 결과 전체를 골라
 * 처리하는 사이 다른 어드민이 처리한 POI는 서버가 "이미 처리됨"으로 건너뛴다.
 *
 * 티켓 20260908_1755: "승인" 버튼의 표시 레이블을 "활성화"로 바꿔 `/admin/poi/[id]` 편집 화면의
 * "활성화"와 개념을 통일했다 — 동작·API(`approvePendingPois`)는 그대로다.
 */
export function PoiReviewTable({ pois, categories, totalCount }: PoiReviewTableProps) {
  const router = useRouter()
  const { filterKey, filterQuery } = useListParams()
  const { sorting, onSortingChange } = useUrlSorting(['name'], [])
  const { rowSelection, onRowSelectionChange, selectedIds, selectIds, clear } = useCrossPageSelection(filterKey)
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const themeContainer = useAdminPortalContainer()

  const [actionLoading, setActionLoading] = useState(false)
  const [categoryDialog, setCategoryDialog] = useState<CategoryDialogState | null>(null)
  const [bulkConfirmAction, setBulkConfirmAction] = useState<BulkConfirmAction | null>(null)

  const categoryLabelMap = useMemo(() => new Map(categories.map((c) => [c.slug, c.label])), [categories])
  const categoryOptions = useMemo(
    () => categories.filter((c) => c.slug !== UNASSIGNED_POI_CATEGORY_SLUG),
    [categories]
  )

  const refreshAfterAction = () => {
    router.refresh()
    clear()
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
      if (!res.ok) toast.error(data?.error ?? '활성화 처리 중 오류가 발생했습니다.')
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
      if (!res.ok) toast.error(data?.error ?? '거부 중 오류가 발생했습니다.')
      refreshAfterAction()
    } finally {
      setActionLoading(false)
    }
  }

  // 다중선택 일괄 액션 — 순차 단건 PATCH 반복이 아니라 bulk 엔드포인트 하나로 처리한다.
  const runReviewBulk = async (ids: string[], action: BulkConfirmAction, category?: string) => {
    setActionLoading(true)
    try {
      const result = await runBulk(BULK_ENDPOINT, {
        ids,
        action,
        payload: category ? { category } : undefined,
      })
      toastBulkResult(result, { verb: action === 'reject' ? '거부' : '활성화' })
      refreshAfterAction()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '요청을 처리하지 못했습니다. 잠시 뒤 다시 시도해주세요.')
    } finally {
      setActionLoading(false)
      setCategoryDialog(null)
      setBulkConfirmAction(null)
    }
  }

  const columns = useMemo(
    () =>
      columnHelper.columns([
        createSelectColumn(columnHelper),
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
            <span className="text-sm text-muted-foreground">{categoryLabelMap.get(getValue()) || getValue()}</span>
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
            <span className="text-sm text-muted-foreground">{new Date(getValue()).toLocaleDateString('ko-KR')}</span>
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
                활성화
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 행 버튼 핸들러는 매 렌더 새로 만들어지지만 값은 categoryLabelMap·actionLoading 외에 바뀌지 않는다
    [categoryLabelMap, actionLoading]
  )

  const table = useTable({
    features: dataTableFeatures,
    data: pois,
    columns,
    getRowId: (row) => row.id,
    manualSorting: true,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange,
    onRowSelectionChange,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const pageIds = pois.map((p) => p.id)
  const offPageCount = selectedIds.filter((id) => !pageIds.includes(id)).length

  const fetchAllIds = async () => {
    const params = new URLSearchParams(filterQuery)
    return fetchListIds(`/api/admin/poi/review/ids?${params.toString()}`)
  }

  // 일괄 [일괄 활성화] 더보기 [카테고리 지정 후 활성화] [거부] (상위 티켓 §4.2)
  const actions: DataTableBulkAction[] = [
    { key: 'approve', label: '일괄 활성화', onClick: () => setBulkConfirmAction('approve'), disabled: actionLoading },
    {
      key: 'category',
      label: '카테고리 지정 후 활성화',
      onClick: () => setCategoryDialog({ ids: selectedIds, category: '' }),
      disabled: actionLoading,
    },
    { key: 'reject', label: '거부', onClick: () => setBulkConfirmAction('reject'), disabled: actionLoading },
  ]

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

      <DataTableBulkActionBar
        count={selectedIds.length}
        onClear={clear}
        actions={actions}
        primaryCount={1}
        offPageCount={offPageCount}
      />

      <DataTable
        table={table}
        columnCount={columns.length}
        emptyMessage="검토 대기 중인 장소가 없어요"
        getRowHref={(row) => `/admin/poi/${row.original.id}`}
      />

      {/* 카테고리 지정 다이얼로그 — 행 단건 · 일괄 공용. 대상 카테고리를 골라야 하므로 그 선택이 확인 단계를 겸한다 */}
      <Dialog
        open={categoryDialog !== null}
        onOpenChange={(open) => {
          if (!open && !actionLoading) setCategoryDialog(null)
        }}
      >
        <DialogContent container={themeContainer ?? undefined}>
          <DialogHeader>
            <DialogTitle>카테고리 지정 후 활성화</DialogTitle>
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
                else runReviewBulk(categoryDialog.ids, 'approve', categoryDialog.category)
              }}
            >
              지정 후 활성화
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 일괄 활성화·거부 확인창(등급 1) — 한 번의 클릭으로 여러 행에 영향을 주므로 확인을 거친다 */}
      {bulkConfirmAction && (
        <BulkConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open && !actionLoading) setBulkConfirmAction(null)
          }}
          level={1}
          title={CONFIRM_META[bulkConfirmAction].title}
          verb={CONFIRM_META[bulkConfirmAction].verb}
          count={selectedIds.length}
          pending={actionLoading}
          onConfirm={() => runReviewBulk(selectedIds, bulkConfirmAction)}
        >
          <p className="text-sm text-muted-foreground">{CONFIRM_META[bulkConfirmAction].note}</p>
        </BulkConfirmDialog>
      )}
    </div>
  )
}
