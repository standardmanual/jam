'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createColumnHelper, useTable, type ColumnVisibilityState } from '@tanstack/react-table'
import { toast } from 'sonner'
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
import {
  runBulk,
  fetchListIds,
  downloadResponseAsFile,
  type BulkRunResponse,
} from '@/components/admin/data-table/admin-fetch'
import { toastBulkResult } from '@/components/admin/ui/toast-helpers'
import { adminReasonLabel } from '@/lib/points/reasons'
import type { UserBulkAction } from '@/lib/admin/user-bulk'
import type { UserListRow } from '@/lib/admin/user-list'
import { BulkPointsDialog, type BulkPointsPayload } from './BulkPointsDialog'
import { UserBulkImpactSummary } from './UserBulkImpactSummary'

interface UsersTableProps {
  rows: UserListRow[]
  /** 현재 필터 조건에 맞는 전체 건수 — 전체 선택 배너에 쓴다 */
  totalCount: number
}

const columnHelper = createColumnHelper<DataTableFeatures, UserListRow>()

const SELECT_ALL_CAP = 1000
const BULK_ENDPOINT = '/api/admin/users/bulk'
/** 머리 칸 정렬을 허용하는 컬럼 — 서버 정렬 값(`username_asc` 등)과 짝이다 */
const HEADER_SORTS = ['username', 'createdAt'] as const

const CONFIRM_META: Record<UserBulkAction, { title: string }> = {
  grant_points: { title: '포인트 지급·회수' },
  reset: { title: '유저 컨텐츠 초기화' },
  delete: { title: '유저 완전 삭제' },
}

interface ConfirmState {
  action: UserBulkAction
  payload?: BulkPointsPayload
  preview: BulkRunResponse | null
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR')
}

/**
 * 유저 목록 테이블(티켓 20260924_0951) — 공용 부품으로 전환했다. 서버 검색·정렬·페이지 이동,
 * 페이지를 넘는 선택, 행 이동을 쓰고, 유저 단위 위험 작업(포인트 지급·회수, 초기화, 삭제)은
 * 일괄 처리 바의 등급 3 확인창으로만 실행한다. 행마다 있던 초기화·삭제 버튼은 유저 상세로 옮겼다.
 * 어드민·본인 계정은 서버가 실행 때 자동으로 제외하고 그 수를 확인창에 보여 준다.
 */
export function UsersTable({ rows, totalCount }: UsersTableProps) {
  const router = useRouter()
  const { filterKey, filterQuery } = useListParams()
  const { sorting, onSortingChange } = useUrlSorting(HEADER_SORTS, [])
  const { rowSelection, onRowSelectionChange, selectedIds, selectIds, clear } = useCrossPageSelection(filterKey)
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})

  const [bulkPending, setBulkPending] = useState(false)
  const [pointsDialogOpen, setPointsDialogOpen] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [impactLoading, setImpactLoading] = useState(false)

  const columns = useMemo(
    () =>
      columnHelper.columns([
        createSelectColumn(columnHelper),
        columnHelper.accessor((r) => r.username ?? '', {
          id: 'username',
          header: ({ column }) => <DataTableColumnHeader column={column} title="이름" />,
          enableHiding: false,
          cell: ({ row }) => (
            <Link href={`/admin/users/${row.original.id}`} className="font-medium hover:underline">
              {row.original.username ?? row.original.displayName ?? '—'}
            </Link>
          ),
        }),
        columnHelper.accessor((r) => r.email, {
          id: 'email',
          header: '이메일',
          enableSorting: false,
          meta: { label: '이메일' },
          cell: ({ row }) => <span>{row.original.email}</span>,
        }),
        columnHelper.accessor((r) => r.tribeName ?? '', {
          id: 'tribe',
          header: '트라이브',
          enableSorting: false,
          meta: { label: '트라이브' },
          cell: ({ row }) => <span className="text-sm">{row.original.tribeName ?? '—'}</span>,
        }),
        columnHelper.accessor((r) => r.isAdmin, {
          id: 'admin',
          header: '어드민',
          enableSorting: false,
          meta: { label: '어드민' },
          cell: ({ row }) =>
            row.original.isAdmin ? (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-neutral-900 text-white">어드민</span>
            ) : (
              <span className="text-gray-400 text-sm">—</span>
            ),
        }),
        columnHelper.accessor((r) => (r.suspended ? '정지 중' : ''), {
          id: 'ban',
          header: '제재',
          enableSorting: false,
          meta: { label: '제재' },
          cell: ({ row }) => {
            const { suspended, suspendedAt } = row.original
            if (!suspended) return <span className="text-gray-400 text-sm">—</span>
            return (
              <span className="flex flex-col gap-0.5">
                <span className="w-fit text-xs font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600">이용 정지</span>
                {suspendedAt && <span className="text-xs text-muted-foreground">{formatDate(suspendedAt)}부터</span>}
              </span>
            )
          },
        }),
        columnHelper.accessor((r) => r.badgeCount, {
          id: 'badgeCount',
          header: '보유 배지',
          enableSorting: false,
          meta: { label: '보유 배지' },
          cell: ({ row }) => <span>{row.original.badgeCount}</span>,
        }),
        columnHelper.accessor((r) => r.itemCount, {
          id: 'itemCount',
          header: '보유 아이템',
          enableSorting: false,
          meta: { label: '보유 아이템' },
          cell: ({ row }) => <span>{row.original.itemCount}</span>,
        }),
        columnHelper.accessor((r) => r.createdAt, {
          id: 'createdAt',
          header: ({ column }) => <DataTableColumnHeader column={column} title="가입일" />,
          meta: { label: '가입일' },
          cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
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

  const fetchAllIds = async () => fetchListIds(`/api/admin/users/ids?${new URLSearchParams(filterQuery).toString()}`)

  const closeConfirm = () => setConfirm(null)

  /**
   * 미리보기(dry_run)로 영향 수치와 확인 문구를 받아 등급 3 확인창을 연다 — DB는 바뀌지 않는다.
   * 포인트 입력창이 열려 있는 동안에는 확인창을 겹쳐 열지 않고, 미리보기가 도착한 뒤에 연다.
   * 성공하면 true.
   */
  const openConfirm = async (action: UserBulkAction, payload?: BulkPointsPayload): Promise<boolean> => {
    if (action !== 'grant_points') setConfirm({ action, payload, preview: null })
    setImpactLoading(true)
    try {
      const preview = await runBulk(BULK_ENDPOINT, { ids: selectedIds, action, payload, dry_run: true })
      setConfirm({ action, payload, preview })
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '영향 범위를 확인하지 못했어요. 다시 시도해 주세요.')
      setConfirm(null)
      return false
    } finally {
      setImpactLoading(false)
    }
  }

  const runAction = async (state: ConfirmState, confirmPhrase: string) => {
    setBulkPending(true)
    try {
      // 확인 문구를 입력한 뒤의 실행 요청이므로 1,000P 이상 확인(`confirmed`)도 함께 보낸다
      const payload = state.payload ? { ...state.payload, confirmed: true } : undefined
      const result = await runBulk(BULK_ENDPOINT, {
        ids: selectedIds,
        action: state.action,
        payload,
        confirm_phrase: confirmPhrase,
      })
      const verb =
        state.action === 'reset'
          ? '초기화'
          : state.action === 'delete'
            ? '삭제'
            : (state.payload?.amount ?? 0) < 0
              ? '회수'
              : '지급'
      toastBulkResult(result, { verb })
      clear()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.')
    } finally {
      setBulkPending(false)
    }
  }

  const handleExport = async () => {
    setBulkPending(true)
    try {
      await downloadResponseAsFile('/api/admin/users/export', 'users.csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '내보내지 못했어요. 다시 시도해 주세요.')
    } finally {
      setBulkPending(false)
    }
  }

  // 대표 버튼은 내보내기 하나, 되돌릴 수 없는 세 동작은 "더보기"에 둔다(상위 티켓 §4.4)
  const actions: DataTableBulkAction[] = [
    { key: 'export', label: '내보내기', onClick: handleExport, disabled: bulkPending },
    { key: 'grant_points', label: '포인트 지급·회수', onClick: () => setPointsDialogOpen(true), disabled: bulkPending },
    { key: 'reset', label: '초기화', onClick: () => openConfirm('reset'), disabled: bulkPending, variant: 'destructive' },
    { key: 'delete', label: '삭제', onClick: () => openConfirm('delete'), disabled: bulkPending, variant: 'destructive' },
  ]

  const preview = confirm?.preview ?? null
  const grantAmount = confirm?.payload?.amount ?? 0

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
        emptyMessage="조건에 맞는 유저가 없어요."
        getRowHref={(row) => `/admin/users/${row.original.id}`}
      />

      <BulkPointsDialog
        open={pointsDialogOpen}
        onOpenChange={setPointsDialogOpen}
        count={selectedIds.length}
        pending={impactLoading}
        onSubmit={async (payload) => {
          if (await openConfirm('grant_points', payload)) setPointsDialogOpen(false)
        }}
      />

      {confirm && (
        <BulkConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) closeConfirm()
          }}
          level={3}
          title={CONFIRM_META[confirm.action].title}
          verb={confirm.action === 'grant_points' ? (grantAmount < 0 ? '회수' : '지급') : confirm.action === 'reset' ? '초기화' : '삭제'}
          count={preview?.processed.length ?? selectedIds.length}
          impact={
            <UserBulkImpactSummary action={confirm.action} impact={preview?.impact} skippedCount={preview?.skipped.length ?? 0} />
          }
          impactLoading={impactLoading}
          requiredPhrase={preview?.requiredPhrase}
          confirmDisabled={(preview?.processed.length ?? 0) === 0}
          pending={bulkPending}
          onConfirm={async () => {
            if (!preview?.requiredPhrase) return
            await runAction(confirm, preview.requiredPhrase)
            closeConfirm()
          }}
        >
          {confirm.action === 'grant_points' && confirm.payload && (
            <p className="text-sm text-neutral-700">
              유저 한 명당 {Math.abs(grantAmount).toLocaleString('ko-KR')}P · 사유 {adminReasonLabel(confirm.payload.reasonLabel)}
              {confirm.payload.note ? ` (${confirm.payload.note})` : ''}
            </p>
          )}
        </BulkConfirmDialog>
      )}
    </div>
  )
}
