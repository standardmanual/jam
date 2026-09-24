'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createColumnHelper, useTable, type ColumnVisibilityState } from '@tanstack/react-table'
import { toast } from 'sonner'
import { Button } from '@/components/admin/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
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
import { useAdminPortalContainer } from '@/components/admin/data-table/use-admin-portal-container'
import { runBulk, fetchListIds, downloadResponseAsFile, type BulkRunResponse } from '@/components/admin/data-table/admin-fetch'
import { toastBulkResult } from '@/components/admin/ui/toast-helpers'
import type { PoiListRow } from '@/lib/admin/poi-list-query'
import type { PoiCategoryRow } from '@/types/database'

interface PoiTableProps {
  pois: PoiListRow[]
  badgeMap: Map<string, string>
  categoryLabelMap: Map<string, string>
  /** 다중선택 카테고리 일괄변경 다이얼로그의 Select 옵션(20260907_1643) */
  categories: PoiCategoryRow[]
  /** 현재 필터 조건에 맞는 전체 건수 — 전체 선택 배너에 쓴다 */
  totalCount: number
}

const columnHelper = createColumnHelper<DataTableFeatures, PoiListRow>()

const SELECT_ALL_CAP = 1000
const BULK_ENDPOINT = '/api/admin/poi/bulk'

const ACTION_VERB: Record<string, string> = {
  activate: '활성화',
  deactivate: '비활성화',
  category: '카테고리 변경',
  delete: '삭제',
}

type ConfirmAction = 'activate' | 'deactivate' | 'delete'

const CONFIRM_META: Record<ConfirmAction, { level: 1 | 2 | 3; title: string; verb: string }> = {
  activate: { level: 1, title: 'POI 활성화', verb: '활성화' },
  deactivate: { level: 2, title: 'POI 비활성화', verb: '비활성화' },
  delete: { level: 3, title: 'POI 삭제', verb: '삭제' },
}

export function PoiTable({ pois, badgeMap, categoryLabelMap, categories, totalCount }: PoiTableProps) {
  const router = useRouter()
  const { filterKey, filterQuery } = useListParams()
  const { sorting, onSortingChange } = useUrlSorting(['name'], [])
  const { rowSelection, onRowSelectionChange, selectedIds, selectIds, clear } = useCrossPageSelection(filterKey)
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const themeContainer = useAdminPortalContainer()

  const [bulkPending, setBulkPending] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [impactLoading, setImpactLoading] = useState(false)
  const [dryRunImpact, setDryRunImpact] = useState<{ activeCount: number } | null>(null)
  const [deletePreview, setDeletePreview] = useState<{
    processed: string[]
    skipped: BulkRunResponse['skipped']
    requiredPhrase: string
  } | null>(null)

  const [showCategoryDialog, setShowCategoryDialog] = useState(false)
  const [bulkCategory, setBulkCategory] = useState('')

  // 표 안 스위치가 등급 2(비활성화) 확인창을 열 자리 — 확인창의 onConfirm/onOpenChange가
  // beforeChange가 돌려준 Promise를 resolve해 InlineSwitchCell에 진행 여부를 알려준다.
  const [deactivateTarget, setDeactivateTarget] = useState<{ id: string; resolve: (ok: boolean) => void } | null>(
    null
  )

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
        columnHelper.accessor('category', {
          id: 'category',
          header: '카테고리',
          enableSorting: false,
          meta: { label: '카테고리' },
          cell: ({ getValue }) => (
            <span className="text-sm text-muted-foreground">{categoryLabelMap.get(getValue()) || getValue()}</span>
          ),
        }),
        columnHelper.display({
          id: 'coordinates',
          header: '위도 / 경도',
          enableSorting: false,
          enableHiding: false,
          cell: ({ row }) => (
            <span className="text-xs font-mono">
              {row.original.latitude.toFixed(4)}, {row.original.longitude.toFixed(4)}
            </span>
          ),
        }),
        columnHelper.accessor('radius_meters', {
          id: 'radius',
          header: '반경',
          enableSorting: false,
          meta: { label: '반경' },
          cell: ({ getValue }) => <span className="text-sm">{getValue()}m</span>,
        }),
        columnHelper.accessor('linked_badge_id', {
          id: 'linkedBadge',
          header: '연결 배지',
          enableSorting: false,
          meta: { label: '연결 배지' },
          cell: ({ getValue }) => {
            const id = getValue()
            return <span className="text-sm">{id ? badgeMap.get(id) || id : '—'}</span>
          },
        }),
        columnHelper.accessor('is_active', {
          id: 'status',
          header: '활성',
          enableSorting: false,
          meta: { label: '활성' },
          cell: ({ row }) => (
            <InlineSwitchCell
              checked={row.original.is_active}
              label={`${row.original.name} 활성 상태`}
              beforeChange={(next) =>
                next
                  ? Promise.resolve(true)
                  : new Promise<boolean>((resolve) => setDeactivateTarget({ id: row.original.id, resolve }))
              }
              onCheckedChange={async (next) => {
                const res = await fetch(`/api/admin/poi/${row.original.id}`, {
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
      ]),
    [badgeMap, categoryLabelMap]
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
    return fetchListIds(`/api/admin/poi/ids?${params.toString()}`)
  }

  const runAction = async (action: string, ids: string[], payload?: unknown, confirmPhrase?: string) => {
    setBulkPending(true)
    try {
      const result = await runBulk(BULK_ENDPOINT, { ids, action, payload, confirm_phrase: confirmPhrase })
      toastBulkResult(result, { verb: ACTION_VERB[action] ?? action })
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
    setDryRunImpact(null)
    setDeletePreview(null)
  }

  const openConfirm = async (action: ConfirmAction) => {
    setConfirmAction(action)
    if (action === 'activate') return // 등급 1 — 영향 미리보기 없이 바로 확인창만 연다

    setImpactLoading(true)
    try {
      const result = await runBulk(BULK_ENDPOINT, { ids: selectedIds, action, dry_run: true })
      if (action === 'deactivate') {
        setDryRunImpact({ activeCount: (result.impact?.activeCount as number | undefined) ?? 0 })
      } else {
        setDeletePreview({
          processed: result.processed,
          skipped: result.skipped,
          requiredPhrase: result.requiredPhrase ?? '',
        })
      }
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
      await downloadResponseAsFile('/api/admin/poi/export', 'poi.csv', {
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
    { key: 'deactivate', label: '비활성화', onClick: () => openConfirm('deactivate'), disabled: bulkPending },
    { key: 'activate', label: '활성화', onClick: () => openConfirm('activate'), disabled: bulkPending },
    {
      key: 'category',
      label: '카테고리 변경',
      onClick: () => {
        setBulkCategory('')
        setShowCategoryDialog(true)
      },
      disabled: bulkPending,
    },
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
        emptyMessage="등록된 POI가 없습니다."
        getRowHref={(row) => `/admin/poi/${row.original.id}`}
      />

      {deactivateTarget && (
        <BulkConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              deactivateTarget.resolve(false)
              setDeactivateTarget(null)
            }
          }}
          level={2}
          title="POI 비활성화"
          verb="비활성화"
          count={1}
          impact={<>지도·체크인·드랍에서 제외됩니다.</>}
          pending={false}
          onConfirm={() => {
            deactivateTarget.resolve(true)
            setDeactivateTarget(null)
          }}
        />
      )}

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
            confirmAction === 'deactivate' && dryRunImpact ? (
              <>선택한 POI 중 지금 활성 상태인 POI {dryRunImpact.activeCount}개가 비활성화됩니다.</>
            ) : confirmAction === 'delete' && deletePreview ? (
              deletePreview.skipped.length > 0 ? (
                <>선택한 POI 중 {deletePreview.skipped.length}건은 참조 이력이 있어 삭제에서 제외됩니다.</>
              ) : (
                <>선택한 POI를 모두 삭제할 수 있습니다.</>
              )
            ) : null
          }
          impactLoading={impactLoading}
          requiredPhrase={confirmAction === 'delete' ? deletePreview?.requiredPhrase : undefined}
          confirmDisabled={confirmAction === 'delete' ? (deletePreview?.processed.length ?? 0) === 0 : false}
          pending={bulkPending}
          onConfirm={async () => {
            const phrase = confirmAction === 'delete' ? deletePreview?.requiredPhrase : undefined
            await runAction(confirmAction, selectedIds, undefined, phrase)
            closeConfirm()
          }}
        />
      )}

      <BulkConfirmDialog
        open={showCategoryDialog}
        onOpenChange={(open) => {
          if (!open && !bulkPending) {
            setShowCategoryDialog(false)
            setBulkCategory('')
          }
        }}
        level={1}
        title="POI 카테고리 일괄 변경"
        verb="카테고리 변경"
        count={selectedIds.length}
        confirmDisabled={!bulkCategory}
        pending={bulkPending}
        onConfirm={async () => {
          await runAction('category', selectedIds, { category: bulkCategory })
          setShowCategoryDialog(false)
          setBulkCategory('')
        }}
      >
        <Select value={bulkCategory} onValueChange={setBulkCategory} disabled={bulkPending}>
          <SelectTrigger aria-label="변경할 카테고리">
            <SelectValue placeholder="카테고리를 선택하세요" />
          </SelectTrigger>
          <SelectContent container={themeContainer ?? undefined}>
            {categories.map((c) => (
              <SelectItem key={c.slug} value={c.slug}>
                {c.label} ({c.slug})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </BulkConfirmDialog>
    </div>
  )
}
