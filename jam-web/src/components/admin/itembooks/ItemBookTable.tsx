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
import { InlineSwitchCell } from '@/components/admin/data-table/data-table-inline-switch'
import { createSelectColumn } from '@/components/admin/data-table/data-table-select-column'
import { useCrossPageSelection } from '@/components/admin/data-table/use-cross-page-selection'
import { useListParams, useUrlSorting } from '@/components/admin/data-table/use-list-params'
import { runBulk, fetchListIds, downloadResponseAsFile, type BulkRunResponse } from '@/components/admin/data-table/admin-fetch'
import { toastBulkResult } from '@/components/admin/ui/toast-helpers'
import { contentImageSourceLabel } from '@/lib/admin/contentImageSource'
import type { ItemBookRow } from '@/types/database'

interface ItemBookTableProps {
  itemBooks: ItemBookRow[]
  badgeMap: Map<string, string>
  tribeMap: Map<string, string>
  itemBadgeCountMap: Map<string, number>
  emptyMessage?: string
  /** 현재 필터 조건에 맞는 전체 건수 — 전체 선택 배너에 쓴다 */
  totalCount: number
}

const columnHelper = createColumnHelper<DataTableFeatures, ItemBookRow>()

const SELECT_ALL_CAP = 1000
const BULK_ENDPOINT = '/api/admin/itembooks/bulk'

const ACTION_VERB: Record<string, string> = {
  activate: '활성화',
  deactivate: '비활성화',
  delete: '삭제',
}

type ConfirmAction = 'activate' | 'deactivate' | 'delete'

/** 활성·비활성화는 등급 1(되돌릴 수 있음), 삭제는 등급 3(상위 티켓 §3) */
const CONFIRM_META: Record<ConfirmAction, { level: 1 | 3; title: string; verb: string }> = {
  activate: { level: 1, title: '컬렉션 활성화', verb: '활성화' },
  deactivate: { level: 1, title: '컬렉션 비활성화', verb: '비활성화' },
  delete: { level: 3, title: '컬렉션 삭제', verb: '삭제' },
}

export function ItemBookTable({
  itemBooks,
  badgeMap,
  tribeMap,
  itemBadgeCountMap,
  emptyMessage = '등록된 컬렉션이 없습니다.',
  totalCount,
}: ItemBookTableProps) {
  const router = useRouter()
  const { filterKey, filterQuery } = useListParams()
  const { sorting, onSortingChange } = useUrlSorting(['name'], [])
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
        columnHelper.accessor('name', {
          id: 'name',
          header: ({ column }) => <DataTableColumnHeader column={column} title="이름" />,
          enableHiding: false,
          cell: ({ row }) => (
            <Link href={`/admin/itembooks/${row.original.id}`} className="font-medium hover:underline">
              {row.original.name}
            </Link>
          ),
        }),
        columnHelper.accessor('is_active', {
          id: 'status',
          header: '상태',
          enableSorting: false,
          meta: { label: '상태' },
          cell: ({ row }) => (
            <InlineSwitchCell
              checked={row.original.is_active}
              label={`${row.original.name} 활성 상태`}
              onCheckedChange={async (next) => {
                const res = await fetch(`/api/admin/itembooks/${row.original.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ is_active: next }),
                })
                if (!res.ok) {
                  const data = await res.json().catch(() => ({}))
                  throw new Error(data.error ?? '상태 변경에 실패했습니다. 다시 시도해주세요.')
                }
              }}
            />
          ),
        }),
        columnHelper.accessor('tribe_id', {
          id: 'tribe',
          header: '트라이브',
          enableSorting: false,
          meta: { label: '트라이브' },
          cell: ({ getValue }) => {
            const id = getValue()
            return <span className="text-sm text-muted-foreground">{id ? tribeMap.get(id) ?? '—' : '—'}</span>
          },
        }),
        columnHelper.accessor('required_activity_badge_id', {
          id: 'requiredBadge',
          header: '필수 액티비티 배지',
          enableSorting: false,
          meta: { label: '필수 액티비티 배지' },
          cell: ({ getValue }) => {
            const id = getValue()
            return <span className="text-sm">{id ? badgeMap.get(id) ?? '—' : '—'}</span>
          },
        }),
        columnHelper.display({
          id: 'itemBadgeCount',
          header: '아이템 배지 수',
          enableSorting: false,
          enableHiding: false,
          cell: ({ row }) => <span className="text-sm">{itemBadgeCountMap.get(row.original.id) ?? 0}개</span>,
        }),
        columnHelper.accessor('reward_badge_id', {
          id: 'rewardBadge',
          header: '보상 배지',
          enableSorting: false,
          meta: { label: '보상 배지' },
          cell: ({ getValue }) => {
            const id = getValue()
            return <span className="text-sm">{id ? badgeMap.get(id) ?? '—' : '—'}</span>
          },
        }),
        columnHelper.accessor('image_source', {
          id: 'image_source',
          header: '제작 경로',
          enableSorting: false,
          meta: { label: '제작 경로' },
          cell: ({ getValue }) => (
            <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium whitespace-nowrap">
              {contentImageSourceLabel(getValue())}
            </span>
          ),
        }),
      ]),
    [badgeMap, tribeMap, itemBadgeCountMap]
  )

  const table = useTable({
    features: dataTableFeatures,
    data: itemBooks,
    columns,
    getRowId: (row) => row.id,
    manualSorting: true,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange,
    onRowSelectionChange,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const pageIds = itemBooks.map((b) => b.id)
  const offPageCount = selectedIds.filter((id) => !pageIds.includes(id)).length

  const fetchAllIds = async () => {
    const params = new URLSearchParams(filterQuery)
    return fetchListIds(`/api/admin/itembooks/ids?${params.toString()}`)
  }

  const runAction = async (action: ConfirmAction, ids: string[], confirmPhrase?: string) => {
    setBulkPending(true)
    try {
      const result = await runBulk(BULK_ENDPOINT, { ids, action, confirm_phrase: confirmPhrase })
      toastBulkResult(result, { verb: ACTION_VERB[action] })
      clear()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '요청을 처리하지 못했습니다. 잠시 뒤 다시 시도해주세요.')
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
    if (action !== 'delete') return // 등급 1 — 영향 미리보기 없이 바로 확인창만 연다

    setImpactLoading(true)
    try {
      const result = await runBulk(BULK_ENDPOINT, { ids: selectedIds, action, dry_run: true })
      setDeletePreview({
        processed: result.processed,
        skipped: result.skipped,
        requiredPhrase: result.requiredPhrase ?? '',
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '영향 범위를 확인하지 못했습니다.')
      closeConfirm()
    } finally {
      setImpactLoading(false)
    }
  }

  const handleExport = async () => {
    setBulkPending(true)
    try {
      await downloadResponseAsFile('/api/admin/itembooks/export', 'itembooks.csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '내보내기에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setBulkPending(false)
    }
  }

  const actions: DataTableBulkAction[] = [
    { key: 'activate', label: '활성화', onClick: () => openConfirm('activate'), disabled: bulkPending },
    { key: 'deactivate', label: '비활성화', onClick: () => openConfirm('deactivate'), disabled: bulkPending },
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
        cap={SELECT_ALL_CAP}
        fetchAllIds={fetchAllIds}
        selectIds={selectIds}
        clear={clear}
      />

      <DataTableBulkActionBar count={selectedIds.length} onClear={clear} actions={actions} offPageCount={offPageCount} />

      <DataTable
        table={table}
        columnCount={columns.length}
        emptyMessage={emptyMessage}
        getRowHref={(row) => `/admin/itembooks/${row.original.id}`}
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
                <>선택한 컬렉션 중 {deletePreview.skipped.length}건은 유저 진행 기록이 있어 삭제에서 제외됩니다.</>
              ) : (
                <>선택한 컬렉션을 모두 삭제할 수 있습니다.</>
              )
            ) : null
          }
          impactLoading={impactLoading}
          requiredPhrase={confirmAction === 'delete' ? deletePreview?.requiredPhrase : undefined}
          confirmDisabled={confirmAction === 'delete' ? (deletePreview?.processed.length ?? 0) === 0 : false}
          pending={bulkPending}
          onConfirm={async () => {
            const phrase = confirmAction === 'delete' ? deletePreview?.requiredPhrase : undefined
            await runAction(confirmAction, selectedIds, phrase)
            closeConfirm()
          }}
        >
          {/* 컬렉션의 활성/비활성은 소속 아이템배지와 독립적이다(티켓 20260914_1729) */}
          {confirmAction === 'deactivate' && (
            <p className="text-sm text-neutral-700">
              비활성화하면 유저에게 더 이상 노출되지 않습니다. 소속 아이템배지에는 영향을 주지 않습니다.
            </p>
          )}
        </BulkConfirmDialog>
      )}
    </div>
  )
}
