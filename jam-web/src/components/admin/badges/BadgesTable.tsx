'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import SafeImage from '@/components/SafeImage'
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
import { AssignTribeDialog } from './AssignTribeDialog'
import type { BadgeCondition, BadgeRarity } from '@/types/database'
import type { BadgeListRow } from './BadgeList'
import { badgeTypeLabel } from '@/lib/admin/badge-labels'
import { contentImageSourceLabel } from '@/lib/admin/contentImageSource'
import { formatConditionChips } from '@/lib/badge-engine/conditionRegistry'

const RARITY_COLOR: Record<string, string> = {
  common: 'text-gray-600',
  rare: 'text-blue-600',
  epic: 'text-violet-600',
  mystic: 'text-amber-600',
}

const RARITY_LABEL: Record<BadgeRarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  mystic: 'Mystic',
}

/**
 * condition_json을 간단한 칩 목록으로 변환.
 *
 * 문구는 조건 필드 메타 레지스트리(`conditionRegistry.ts`)가 단일 출처다(티켓 20260905_0028).
 */
function conditionSummary(c: BadgeCondition | null): string[] {
  return formatConditionChips(c)
}

interface BadgesTableProps {
  badges: BadgeListRow[]
  tribeMap?: Map<string, string>
  /** 현재 필터 조건에 맞는 전체 건수 — 전체 선택 배너에 쓴다 */
  totalCount: number
}

const columnHelper = createColumnHelper<DataTableFeatures, BadgeListRow>()

const SELECT_ALL_CAP = 1000
const BULK_ENDPOINT = '/api/admin/badges/list-bulk'

const ACTION_VERB: Record<string, string> = {
  activate: '활성화',
  deactivate: '비활성화',
  assign_tribe: '트라이브 지정',
  delete: '삭제',
}

type ConfirmAction = 'activate' | 'deactivate' | 'delete'

const CONFIRM_META: Record<ConfirmAction, { level: 1 | 2 | 3; title: string; verb: string }> = {
  activate: { level: 1, title: '배지 활성화', verb: '활성화' },
  deactivate: { level: 2, title: '배지 비활성화', verb: '비활성화' },
  delete: { level: 3, title: '배지 삭제', verb: '삭제' },
}

export default function BadgesTable({ badges, tribeMap = new Map(), totalCount }: BadgesTableProps) {
  const router = useRouter()
  const { filterKey, filterQuery } = useListParams()
  const { sorting, onSortingChange } = useUrlSorting(['name'], [])
  const { rowSelection, onRowSelectionChange, selectedIds, selectIds, clear } = useCrossPageSelection(filterKey)
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})

  const [bulkPending, setBulkPending] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [impactLoading, setImpactLoading] = useState(false)
  const [dryRunImpact, setDryRunImpact] = useState<{ droppableCount: number } | null>(null)
  const [deletePreview, setDeletePreview] = useState<{
    processed: string[]
    skipped: BulkRunResponse['skipped']
    requiredPhrase: string
  } | null>(null)
  const [showAssignTribeDialog, setShowAssignTribeDialog] = useState(false)

  // 표 안 스위치가 등급 2(비활성화) 확인창을 열 자리 — 그 배지 하나의 무효화될 드랍 수를
  // 미리보기(dry_run)로 가져온 뒤 확인창을 연다(상세 요구사항 "1건 미리보기").
  const [deactivateTarget, setDeactivateTarget] = useState<{
    id: string
    droppableCount: number | null
    loading: boolean
    resolve: (ok: boolean) => void
  } | null>(null)

  const tribeList = useMemo(() => Array.from(tribeMap, ([id, name]) => ({ id, name })), [tribeMap])

  const columns = useMemo(
    () =>
      columnHelper.columns([
        createSelectColumn(columnHelper),
        columnHelper.accessor('image_url', {
          id: 'image',
          header: '이미지',
          enableSorting: false,
          enableHiding: false,
          cell: ({ row }) => (
            <div className="w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
              {row.original.image_url ? (
                <SafeImage
                  src={row.original.image_url}
                  alt={row.original.name}
                  width={40}
                  height={40}
                  className="w-full h-full object-contain"
                />
              ) : (
                <span className="text-gray-400 text-xs">—</span>
              )}
            </div>
          ),
        }),
        columnHelper.accessor('name', {
          id: 'name',
          header: ({ column }) => <DataTableColumnHeader column={column} title="이름" />,
          enableHiding: false,
          cell: ({ row }) => (
            <Link href={`/admin/badges/${row.original.id}`} className="font-medium hover:underline">
              {row.original.name}
            </Link>
          ),
        }),
        columnHelper.accessor('deleted_at', {
          id: 'status',
          header: '상태',
          enableSorting: false,
          meta: { label: '상태' },
          cell: ({ row }) => (
            <InlineSwitchCell
              checked={!row.original.deleted_at}
              label={`${row.original.name} 활성 상태`}
              beforeChange={(next) =>
                next
                  ? Promise.resolve(true)
                  : new Promise<boolean>((resolve) => {
                      const id = row.original.id
                      setDeactivateTarget({ id, droppableCount: null, loading: true, resolve })
                      runBulk(BULK_ENDPOINT, { ids: [id], action: 'deactivate', dry_run: true })
                        .then((result) => {
                          const count = (result.impact?.droppableCount as number | undefined) ?? 0
                          setDeactivateTarget((prev) =>
                            prev && prev.id === id ? { ...prev, droppableCount: count, loading: false } : prev
                          )
                        })
                        .catch(() => {
                          setDeactivateTarget((prev) =>
                            prev && prev.id === id ? { ...prev, droppableCount: 0, loading: false } : prev
                          )
                        })
                    })
              }
              onCheckedChange={async (next) => {
                const res = await fetch(`/api/admin/badges/${row.original.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ active: next }),
                })
                if (!res.ok) {
                  const data = await res.json().catch(() => ({}))
                  throw new Error(data.error ?? '상태 변경에 실패했습니다. 다시 시도해주세요.')
                }
              }}
            />
          ),
        }),
        columnHelper.accessor('type', {
          id: 'type',
          header: '타입',
          enableSorting: false,
          meta: { label: '타입' },
          cell: ({ getValue }) => (
            <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
              {badgeTypeLabel(getValue())}
            </span>
          ),
        }),
        columnHelper.accessor('rarity', {
          id: 'rarity',
          header: '희귀도',
          enableSorting: false,
          meta: { label: '희귀도' },
          cell: ({ getValue }) => {
            const rarity = getValue()
            return (
              <span className={`font-semibold text-sm ${(rarity ? RARITY_COLOR[rarity] : '') || ''}`}>
                {/* 무한레벨형은 등급이 없다(마이그레이션 130) — 레벨 표기는 티켓 20260905_0032/0034 */}
                {rarity ? RARITY_LABEL[rarity as BadgeRarity] : '—'}
              </span>
            )
          },
        }),
        columnHelper.accessor('tribe_id', {
          id: 'tribe',
          header: '트라이브',
          enableSorting: false,
          meta: { label: '트라이브' },
          cell: ({ getValue }) => {
            const tribeId = getValue()
            return <span className="text-sm">{tribeId ? (tribeMap.get(tribeId) ?? '—') : '—'}</span>
          },
        }),
        columnHelper.accessor('activity_types', {
          id: 'activity',
          header: '활동',
          enableSorting: false,
          meta: { label: '활동' },
          cell: ({ getValue }) => {
            const types = getValue()
            return <span className="text-sm">{types?.length ? types.join(', ') : '—'}</span>
          },
        }),
        columnHelper.accessor('condition_json', {
          id: 'condition',
          header: '조건',
          enableSorting: false,
          meta: { label: '조건' },
          cell: ({ getValue }) => {
            const chips = conditionSummary(getValue() as BadgeCondition | null)
            if (chips.length === 0) return <span className="text-gray-500 text-xs">없음</span>
            return (
              <div className="flex flex-wrap gap-1 max-w-xs">
                {chips.slice(0, 2).map((chip, i) => (
                  <span key={i} className="text-xs bg-gray-100 text-gray-700 rounded px-1.5 py-0.5 whitespace-nowrap">
                    {chip}
                  </span>
                ))}
                {chips.length > 2 && <span className="text-xs text-gray-500">+{chips.length - 2}</span>}
              </div>
            )
          },
        }),
        columnHelper.accessor('patch_available', {
          id: 'patch',
          header: '패치',
          enableSorting: false,
          meta: { label: '패치' },
          cell: ({ row }) =>
            row.original.patch_available ? (
              <span className="text-emerald-600 font-medium text-sm">
                {row.original.patch_price_krw?.toLocaleString()}원
              </span>
            ) : (
              <span className="text-gray-500 text-sm">—</span>
            ),
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
    [tribeMap]
  )

  const table = useTable({
    features: dataTableFeatures,
    data: badges,
    columns,
    getRowId: (row) => row.id,
    manualSorting: true,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange,
    onRowSelectionChange,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const pageIds = badges.map((b) => b.id)
  const offPageCount = selectedIds.filter((id) => !pageIds.includes(id)).length

  const fetchAllIds = async () => {
    const params = new URLSearchParams(filterQuery)
    return fetchListIds(`/api/admin/badges/ids?${params.toString()}`)
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
        setDryRunImpact({ droppableCount: (result.impact?.droppableCount as number | undefined) ?? 0 })
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
      await downloadResponseAsFile('/api/admin/badges/export', 'badges.csv', {
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
    {
      key: 'assign_tribe',
      label: '트라이브 지정',
      onClick: () => setShowAssignTribeDialog(true),
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
        emptyMessage="등록된 배지가 없습니다."
        getRowHref={(row) => `/admin/badges/${row.original.id}`}
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
          title="배지 비활성화"
          verb="비활성화"
          count={1}
          impact={
            deactivateTarget.droppableCount !== null ? (
              <>아직 픽업되지 않은 월드 드랍 {deactivateTarget.droppableCount}건이 무효화됩니다.</>
            ) : null
          }
          impactLoading={deactivateTarget.loading}
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
              <>선택한 배지 중 아직 픽업되지 않은 월드 드랍 {dryRunImpact.droppableCount}건이 무효화됩니다.</>
            ) : confirmAction === 'delete' && deletePreview ? (
              deletePreview.skipped.length > 0 ? (
                <>선택한 배지 중 {deletePreview.skipped.length}건은 참조 이력이 있어 삭제에서 제외됩니다.</>
              ) : (
                <>선택한 배지를 모두 삭제할 수 있습니다.</>
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

      <AssignTribeDialog
        open={showAssignTribeDialog}
        onOpenChange={(open) => {
          if (!open && !bulkPending) setShowAssignTribeDialog(false)
        }}
        ids={selectedIds}
        tribes={tribeList}
        pending={bulkPending}
        onConfirm={async (tribeId) => {
          await runAction('assign_tribe', selectedIds, { tribe_id: tribeId })
          setShowAssignTribeDialog(false)
        }}
      />
    </div>
  )
}
