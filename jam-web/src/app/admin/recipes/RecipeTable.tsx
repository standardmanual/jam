'use client'

import { memo, useMemo, useState } from 'react'
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
import { runBulk, fetchListIds, downloadResponseAsFile, type BulkRunResponse } from '@/components/admin/data-table/admin-fetch'
import { toastBulkResult } from '@/components/admin/ui/toast-helpers'
import type { CombinationRecipeSlotRow } from '@/types/database'
import { recipeStatusDisplay, type RecipeListRow } from '@/lib/admin/recipe-list'

export type RecipeWithSlots = RecipeListRow & { slots: CombinationRecipeSlotRow[] }

interface RecipeTableProps {
  recipes: RecipeWithSlots[]
  badgeMap: Map<string, string>
  /** 현재 검색 조건에 맞는 전체 건수(쪽당 건수가 아니다) — 전체 선택 배너에 쓴다 */
  totalCount: number
}

const columnHelper = createColumnHelper<DataTableFeatures, RecipeWithSlots>()

const SELECT_ALL_CAP = 1000
const BULK_ENDPOINT = '/api/admin/recipes/bulk'
const HEADER_SORTS = ['name'] as const

interface DeletePreview {
  processed: string[]
  skipped: BulkRunResponse['skipped']
  requiredPhrase: string
  slotCount: number
}

/**
 * 믹스 레시피 목록 표(티켓 20260924_0949, 상위 티켓 §1·§4.1). 행 아무 곳이나 눌러 상세로
 * 이동하고, 삭제는 행을 선택한 뒤 일괄 삭제(등급 3 — 확인 문구 입력) 한 경로뿐이다. 레시피에는
 * 활성 여부 칸이 없고 공개 시각·종료 시각만 있어(「상태」 열에 공개 예정 / 공개 중 / 종료됨으로 보인다,
 * 티켓 20261001_1158·20261002_0710) 표 안 대표 기능은 두지 않는다. 삭제가 참조로 막힌 항목은 결과 안내에
 * 사유와 함께 나온다.
 */
function RecipeTableInner({ recipes, badgeMap, totalCount }: RecipeTableProps) {
  const router = useRouter()
  const { filterKey, filterQuery } = useListParams()
  const { sorting, onSortingChange } = useUrlSorting(HEADER_SORTS, [])
  const { rowSelection, onRowSelectionChange, selectedIds, selectIds, clear } = useCrossPageSelection(filterKey)
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})

  const [bulkPending, setBulkPending] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [deletePreview, setDeletePreview] = useState<DeletePreview | null>(null)

  const columns = useMemo(
    () =>
      columnHelper.columns([
        createSelectColumn(columnHelper),
        columnHelper.accessor('name', {
          id: 'name',
          header: ({ column }) => <DataTableColumnHeader column={column} title="이름" />,
          enableHiding: false,
          cell: ({ row }) => (
            <Link href={`/admin/recipes/${row.original.id}`} className="text-sm font-medium hover:underline">
              {row.original.name ?? <span className="text-muted-foreground">—</span>}
            </Link>
          ),
        }),
        columnHelper.display({
          id: 'slots',
          header: '슬롯',
          enableSorting: false,
          enableHiding: false,
          cell: ({ row }) => {
            const slots = row.original.slots
            const itemCount = slots.filter((s) => s.badge_type === 'item').length
            const conditionCount = slots.length - itemCount
            return (
              <span className="text-sm">
                슬롯 {slots.length}개(아이템 {itemCount} · 조건 {conditionCount})
              </span>
            )
          },
        }),
        columnHelper.display({
          id: 'slotDetail',
          header: '슬롯 상세',
          enableSorting: false,
          meta: { label: '슬롯 상세' },
          cell: ({ row }) => {
            const slots = [...row.original.slots].sort((a, b) => a.slot_order - b.slot_order)
            if (slots.length === 0) return <span className="text-xs text-muted-foreground">—</span>
            return (
              <span className="text-xs text-muted-foreground">
                {slots
                  .map((s) => s.allowed_badge_ids.map((id) => badgeMap.get(id) ?? id.slice(0, 8)).join('/'))
                  .join(' + ')}
              </span>
            )
          },
        }),
        columnHelper.display({
          id: 'reward',
          header: '보상',
          enableSorting: false,
          enableHiding: false,
          cell: ({ row }) => {
            const { reward_points: points, reward_badge_ids: badgeIds } = row.original
            const parts: string[] = []
            if (points > 0) parts.push(`${points}P`)
            if ((badgeIds ?? []).length > 0) {
              parts.push((badgeIds ?? []).map((id) => badgeMap.get(id) ?? id.slice(0, 8)).join(', '))
            }
            return parts.length > 0 ? (
              <span className="text-sm">{parts.join(' + ')}</span>
            ) : (
              <span className="text-xs text-red-600">보상 미지정</span>
            )
          },
        }),
        columnHelper.display({
          id: 'release',
          header: '상태',
          enableSorting: false,
          enableHiding: false,
          cell: ({ row }) => {
            const { state, label } = recipeStatusDisplay(row.original)
            if (state === 'scheduled') return <span className="text-sm text-amber-700">{label}</span>
            if (state === 'ended') return <span className="text-sm text-muted-foreground">{label}</span>
            return <span className="text-sm">{label}</span>
          },
        }),
      ]),
    [badgeMap]
  )

  const table = useTable({
    features: dataTableFeatures,
    data: recipes,
    columns,
    getRowId: (row) => row.id,
    manualSorting: true,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange,
    onRowSelectionChange,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const pageIds = recipes.map((r) => r.id)
  const offPageCount = selectedIds.filter((id) => !pageIds.includes(id)).length

  const fetchAllIds = async () => {
    const params = new URLSearchParams(filterQuery)
    return fetchListIds(`/api/admin/recipes/ids?${params.toString()}`)
  }

  const closeDelete = () => {
    setShowDelete(false)
    setDeletePreview(null)
  }

  /** 삭제 미리보기 — 함께 지워질 슬롯 수와 참조로 막힌 항목을 서버가 계산한다 */
  const openDelete = async () => {
    setShowDelete(true)
    setPreviewLoading(true)
    try {
      const result = await runBulk(BULK_ENDPOINT, { ids: selectedIds, action: 'delete', dry_run: true })
      setDeletePreview({
        processed: result.processed,
        skipped: result.skipped,
        requiredPhrase: result.requiredPhrase ?? '',
        slotCount: (result.impact?.slotCount as number | undefined) ?? 0,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '영향 범위를 확인하지 못했습니다.')
      closeDelete()
    } finally {
      setPreviewLoading(false)
    }
  }

  const runDelete = async () => {
    if (!deletePreview) return
    setBulkPending(true)
    try {
      const result = await runBulk(BULK_ENDPOINT, {
        ids: selectedIds,
        action: 'delete',
        confirm_phrase: deletePreview.requiredPhrase,
      })
      toastBulkResult(result, { verb: '삭제' })
      clear()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '요청을 처리하지 못했습니다. 잠시 뒤 다시 시도해주세요.')
    } finally {
      setBulkPending(false)
      closeDelete()
    }
  }

  const handleExport = async () => {
    setBulkPending(true)
    try {
      await downloadResponseAsFile('/api/admin/recipes/export', 'recipes.csv', {
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
    { key: 'export', label: '내보내기', onClick: handleExport, disabled: bulkPending },
    { key: 'delete', label: '삭제', onClick: openDelete, disabled: bulkPending, variant: 'destructive' },
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
        emptyMessage="레시피 없음"
        getRowHref={(row) => `/admin/recipes/${row.original.id}`}
      />

      {showDelete && (
        <BulkConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open && !bulkPending) closeDelete()
          }}
          level={3}
          title="레시피 삭제"
          verb="삭제"
          count={deletePreview?.processed.length ?? selectedIds.length}
          impact={
            deletePreview ? (
              <>
                <p>
                  레시피 {deletePreview.processed.length}개와 슬롯 {deletePreview.slotCount}개가 함께 삭제됩니다. 되돌릴 수
                  없습니다.
                </p>
                {deletePreview.skipped.length > 0 && (
                  <>
                    <p className="mt-1">선택한 레시피 중 {deletePreview.skipped.length}개는 삭제 대상에서 제외됩니다.</p>
                    <p className="mt-1">
                      {deletePreview.skipped
                        .slice(0, 3)
                        .map((s) => `${s.label ?? s.id.slice(0, 8)}: ${s.reason}`)
                        .join(' / ')}
                      {deletePreview.skipped.length > 3 ? ` 외 ${deletePreview.skipped.length - 3}개` : ''}
                    </p>
                  </>
                )}
              </>
            ) : null
          }
          impactLoading={previewLoading}
          requiredPhrase={deletePreview?.requiredPhrase}
          confirmDisabled={(deletePreview?.processed.length ?? 0) === 0}
          pending={bulkPending}
          onConfirm={runDelete}
        />
      )}
    </div>
  )
}

export const RecipeTable = memo(RecipeTableInner)
