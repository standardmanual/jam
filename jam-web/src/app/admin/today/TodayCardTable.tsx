'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createColumnHelper, useTable, type ColumnVisibilityState } from '@tanstack/react-table'
import { toast } from 'sonner'
import { dataTableFeatures, type DataTableFeatures } from '@/components/admin/data-table/features'
import { DataTable } from '@/components/admin/data-table/data-table'
import { DataTableColumnHeader } from '@/components/admin/data-table/data-table-column-header'
import { DataTableViewOptions } from '@/components/admin/data-table/data-table-view-options'
import { DataTableBulkActionBar, type DataTableBulkAction } from '@/components/admin/data-table/data-table-bulk-action-bar'
import { DataTableSelectAllBanner } from '@/components/admin/data-table/data-table-select-all-banner'
import { BulkConfirmDialog } from '@/components/admin/data-table/data-table-bulk-confirm-dialog'
import { InlineSwitchCell } from '@/components/admin/data-table/data-table-inline-switch'
import { createSelectColumn } from '@/components/admin/data-table/data-table-select-column'
import { useCrossPageSelection } from '@/components/admin/data-table/use-cross-page-selection'
import { useListParams, useUrlSorting } from '@/components/admin/data-table/use-list-params'
import {
  runBulk,
  fetchListIds,
  downloadResponseAsFile,
  requestJson,
  type BulkRunResponse,
} from '@/components/admin/data-table/admin-fetch'
import { toastBulkResult } from '@/components/admin/ui/toast-helpers'
import { TODAY_SELECT_ALL_CAP, type TodayListRow } from '@/lib/admin/today-list-query'

interface TodayCardTableProps {
  cards: TodayListRow[]
  /** 현재 캘린더뷰가 보고 있는 날짜('YYYY-MM-DD') — 행 이동 링크의 `?date=`로 실어 날라
   *  전용 화면에서 저장·취소·삭제 후 이 날짜의 목록으로 돌아오게 한다(티켓 20260911_1454). */
  selectedDate: string
  /** 현재 필터 조건에 맞는 전체 건수 — 전체 선택 배너에 쓴다 */
  totalCount: number
}

type Status = '비활성' | '종료' | '예약' | '노출중'

const columnHelper = createColumnHelper<DataTableFeatures, TodayListRow>()

const BULK_ENDPOINT = '/api/admin/today/bulk'
const HEADER_SORTS = ['title'] as const

const ACTION_VERB: Record<string, string> = {
  activate: '활성화',
  deactivate: '비활성화',
  end_period: '기간 종료',
  delete: '삭제',
}

type ConfirmAction = 'activate' | 'deactivate' | 'end_period' | 'delete'

const CONFIRM_META: Record<ConfirmAction, { level: 1 | 3; title: string; verb: string }> = {
  activate: { level: 1, title: '투데이 카드 활성화', verb: '활성화' },
  deactivate: { level: 1, title: '투데이 카드 비활성화', verb: '비활성화' },
  end_period: { level: 1, title: '투데이 카드 기간 종료', verb: '기간 종료' },
  delete: { level: 3, title: '투데이 카드 삭제', verb: '삭제' },
}

function statusOf(c: TodayListRow, now: Date): Status {
  const started = new Date(c.starts_at) <= now
  const ended = new Date(c.ends_at) < now
  if (!c.is_active) return '비활성'
  if (ended) return '종료'
  if (!started) return '예약'
  return '노출중'
}

/**
 * 투데이 카드 목록 테이블(20260826_015) — 공통 목록 부품(티켓 20260924_0940)으로 전환했다
 * (티켓 20260924_0947). 페이지를 넘는 선택·"이 조건의 N건 모두 선택"·서버 정렬/검색/필터는
 * URL(`useListParams`)이 갖고, 일괄 처리는 요청 한 번(`POST /api/admin/today/bulk`)이다.
 *
 * 날짜(`date`)도 URL 필터 키라서 `useCrossPageSelection(filterKey)`가 날짜가 바뀔 때 선택을
 * 비우고, 쪽 번호는 `applyListParamPatch`가 1쪽으로 되돌린다.
 */
export function TodayCardTable({ cards, selectedDate, totalCount }: TodayCardTableProps) {
  const router = useRouter()
  const { filterKey, filterQuery } = useListParams()
  const { sorting, onSortingChange } = useUrlSorting(HEADER_SORTS, [])
  const { rowSelection, onRowSelectionChange, selectedIds, selectIds, clear } = useCrossPageSelection(filterKey)
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})

  const [bulkPending, setBulkPending] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [impactLoading, setImpactLoading] = useState(false)
  const [deletePreview, setDeletePreview] = useState<{
    processed: string[]
    skipped: BulkRunResponse['skipped']
    requiredPhrase: string
  } | null>(null)

  const columns = useMemo(
    () =>
      columnHelper.columns([
        createSelectColumn(columnHelper),
        columnHelper.accessor('title', {
          id: 'title',
          header: ({ column }) => <DataTableColumnHeader column={column} title="제목" />,
          enableHiding: false,
          cell: ({ row }) => (
            <Link
              href={`/admin/today/${row.original.id}?date=${selectedDate}`}
              className="font-medium max-w-[220px] block truncate hover:underline"
            >
              {row.original.title}
            </Link>
          ),
        }),
        columnHelper.accessor('is_active', {
          id: 'active',
          header: '활성',
          enableSorting: false,
          meta: { label: '활성' },
          cell: ({ row }) => (
            <InlineSwitchCell
              checked={row.original.is_active}
              label={`${row.original.title} 활성 상태`}
              onCheckedChange={async (next) => {
                await requestJson(`/api/admin/today/${row.original.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ is_active: next }),
                })
              }}
            />
          ),
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
              {new Date(row.original.starts_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })} ~<br />
              {new Date(row.original.ends_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
            </span>
          ),
        }),
        columnHelper.display({
          id: 'status',
          header: '노출 상태',
          enableSorting: false,
          meta: { label: '노출 상태' },
          cell: ({ row }) => {
            const status = statusOf(row.original, new Date())
            const cls =
              status === '노출중'
                ? 'bg-neutral-900/20 text-neutral-900'
                : status === '예약'
                  ? 'bg-amber-50 text-amber-600'
                  : 'bg-neutral-100 text-neutral-500'
            return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{status}</span>
          },
        }),
      ]),
    [selectedDate]
  )

  const table = useTable({
    features: dataTableFeatures,
    data: cards,
    columns,
    getRowId: (row) => row.id,
    manualSorting: true,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange,
    onRowSelectionChange,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const pageIds = cards.map((c) => c.id)
  const offPageCount = selectedIds.filter((id) => !pageIds.includes(id)).length

  const fetchAllIds = async () => {
    const params = new URLSearchParams(filterQuery)
    return fetchListIds(`/api/admin/today/ids?${params.toString()}`)
  }

  const runAction = async (action: ConfirmAction, confirmPhrase?: string) => {
    setBulkPending(true)
    try {
      const result = await runBulk(BULK_ENDPOINT, { ids: selectedIds, action, confirm_phrase: confirmPhrase })
      toastBulkResult(result, { verb: ACTION_VERB[action] })
      clear()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.')
    } finally {
      setBulkPending(false)
    }
  }

  const closeConfirm = () => {
    setConfirmAction(null)
    setDeletePreview(null)
  }

  const openConfirm = async (action: ConfirmAction) => {
    setConfirmAction(action)
    if (action !== 'delete') return // 등급 1 — 영향 미리보기 없이 확인창만 연다

    setImpactLoading(true)
    try {
      const result = await runBulk(BULK_ENDPOINT, { ids: selectedIds, action, dry_run: true })
      setDeletePreview({
        processed: result.processed,
        skipped: result.skipped,
        requiredPhrase: result.requiredPhrase ?? '',
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '삭제 대상을 확인하지 못했어요.')
      closeConfirm()
    } finally {
      setImpactLoading(false)
    }
  }

  const handleExport = async () => {
    setBulkPending(true)
    try {
      await downloadResponseAsFile('/api/admin/today/export', 'today.csv', {
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

  const actions: DataTableBulkAction[] = [
    { key: 'activate', label: '활성화', onClick: () => openConfirm('activate'), disabled: bulkPending },
    { key: 'deactivate', label: '비활성화', onClick: () => openConfirm('deactivate'), disabled: bulkPending },
    { key: 'end_period', label: '기간 종료', onClick: () => openConfirm('end_period'), disabled: bulkPending },
    { key: 'export', label: '내보내기', onClick: handleExport, disabled: bulkPending },
    { key: 'delete', label: '삭제', onClick: () => openConfirm('delete'), disabled: bulkPending, variant: 'destructive' },
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
        cap={TODAY_SELECT_ALL_CAP}
        fetchAllIds={fetchAllIds}
        selectIds={selectIds}
        clear={clear}
      />

      <DataTableBulkActionBar count={selectedIds.length} onClear={clear} actions={actions} offPageCount={offPageCount} />

      <DataTable
        table={table}
        columnCount={columns.length}
        emptyMessage="이 날짜에 노출되는 카드가 없어요."
        getRowHref={(row) => `/admin/today/${row.original.id}?date=${selectedDate}`}
      />

      {confirmAction && (
        <BulkConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) closeConfirm()
          }}
          level={CONFIRM_META[confirmAction].level}
          title={CONFIRM_META[confirmAction].title}
          verb={CONFIRM_META[confirmAction].verb}
          count={confirmAction === 'delete' ? (deletePreview?.processed.length ?? selectedIds.length) : selectedIds.length}
          impact={
            confirmAction === 'delete' && deletePreview ? (
              deletePreview.skipped.length > 0 ? (
                <>선택한 카드 중 {deletePreview.skipped.length}건은 이미 삭제돼 있어 제외돼요. 삭제한 카드는 되돌릴 수 없어요.</>
              ) : (
                <>삭제한 카드는 되돌릴 수 없어요.</>
              )
            ) : null
          }
          impactLoading={impactLoading}
          requiredPhrase={confirmAction === 'delete' ? deletePreview?.requiredPhrase : undefined}
          confirmDisabled={confirmAction === 'delete' ? (deletePreview?.processed.length ?? 0) === 0 : false}
          pending={bulkPending}
          onConfirm={async () => {
            const phrase = confirmAction === 'delete' ? deletePreview?.requiredPhrase : undefined
            await runAction(confirmAction, phrase)
            closeConfirm()
          }}
        />
      )}
    </div>
  )
}
