'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  createColumnHelper,
  useTable,
  type ColumnVisibilityState,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table'
import { toast } from 'sonner'
import { dataTableFeatures, type DataTableFeatures } from '@/components/admin/data-table/features'
import { DataTable } from '@/components/admin/data-table/data-table'
import { DataTableColumnHeader } from '@/components/admin/data-table/data-table-column-header'
import { DataTableViewOptions } from '@/components/admin/data-table/data-table-view-options'
import { DataTableBulkActionBar, type DataTableBulkAction } from '@/components/admin/data-table/data-table-bulk-action-bar'
import { BulkConfirmDialog } from '@/components/admin/data-table/data-table-bulk-confirm-dialog'
import { InlineSwitchCell } from '@/components/admin/data-table/data-table-inline-switch'
import { createSelectColumn } from '@/components/admin/data-table/data-table-select-column'
import { runBulk, type BulkRunResponse } from '@/components/admin/data-table/admin-fetch'
import { toastBulkResult } from '@/components/admin/ui/toast-helpers'
import type { TribeRow } from '@/types/database'

interface TribesTableProps {
  tribes: TribeRow[]
  /** 트라이브 id → 삭제되지 않은 배지 수 */
  badgeCounts: Record<string, number>
  /** 트라이브 id → 컬렉션 수 */
  bookCounts: Record<string, number>
  /** 트라이브 id → 삭제가 막히는 사유(건수 포함). 막는 참조가 없으면 null */
  deleteBlockReasons: Record<string, string | null>
}

const columnHelper = createColumnHelper<DataTableFeatures, TribeRow>()

const BULK_ENDPOINT = '/api/admin/tribes/bulk'

const ACTION_VERB: Record<string, string> = {
  activate: '활성화',
  deactivate: '비활성화',
  delete: '삭제',
}

type ConfirmAction = 'activate' | 'deactivate' | 'delete'

/** 활성화는 등급 1, 비활성화는 등급 2(온보딩·추천에서 빠짐), 삭제는 등급 3(상위 티켓 §3) */
const CONFIRM_META: Record<ConfirmAction, { level: 1 | 2 | 3; title: string; verb: string }> = {
  activate: { level: 1, title: '트라이브 활성화', verb: '활성화' },
  deactivate: { level: 2, title: '트라이브 비활성화', verb: '비활성화' },
  delete: { level: 3, title: '트라이브 삭제', verb: '삭제' },
}

interface DeactivateImpact {
  activeBookCount: number
  badgeCount: number
  userCount: number
}

function toDeactivateImpact(impact: BulkRunResponse['impact']): DeactivateImpact {
  return {
    activeBookCount: impact?.activeBookCount ?? 0,
    badgeCount: impact?.badgeCount ?? 0,
    userCount: impact?.userCount ?? 0,
  }
}

/**
 * 비활성화 확인창의 영향 안내(등급 2). 트라이브를 끄면 온보딩 선택지와 추천 후보에서 빠진다 —
 * 드랍 엔진은 트라이브의 활성 여부를 읽지 않으므로 드랍은 그대로다(티켓 20260924_0945).
 */
function DeactivateImpactNote({ impact }: { impact: DeactivateImpact }) {
  return (
    <>
      활성 컬렉션 {impact.activeBookCount}개, 배지 {impact.badgeCount}개, 이 트라이브를 고른 유저{' '}
      {impact.userCount}명이 있어요. 온보딩 선택지와 추천 후보에서 빠져요. 드랍에는 영향이 없어요.
    </>
  )
}

/**
 * 트라이브 목록 테이블(20260826_015, 20260924_0945에서 서버 일괄 처리로 전환). 10건 규모라
 * 서버 페이지네이션·필터는 두지 않고(정렬은 화면 안에서), 전체 선택 확장 배너도 없다.
 *
 * 상태 칸은 표 안 스위치다 — 켜기는 바로 반영하고, 끄기는 등급 2라 영향 수를 보여 주는 확인창을
 * 거친다. `PUT /api/admin/tribes/[id]`가 부분 body를 받으면 body에 없는 필드는 기존 값을 유지하도록
 * 병합하므로(20260827_005) `{ is_active }`만 보내면 된다. 삭제는 드랍 기록 참조 때문에 사실상
 * 막히는 경우가 많아, "삭제 불가 사유" 칸에 막는 참조를 건수로 보여 준다.
 */
export function TribesTable({ tribes, badgeCounts, bookCounts, deleteBlockReasons }: TribesTableProps) {
  const router = useRouter()
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})

  const [bulkPending, setBulkPending] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [impactLoading, setImpactLoading] = useState(false)
  const [deactivateImpact, setDeactivateImpact] = useState<DeactivateImpact | null>(null)
  const [deletePreview, setDeletePreview] = useState<{
    processed: string[]
    skipped: BulkRunResponse['skipped']
    requiredPhrase: string
  } | null>(null)

  // 표 안 스위치가 등급 2(비활성화) 확인창을 열 자리 — 그 트라이브 하나의 영향 수를 미리보기
  // (dry_run)로 가져온 뒤 확인창을 연다.
  const [deactivateTarget, setDeactivateTarget] = useState<{
    id: string
    name: string
    impact: DeactivateImpact | null
    loading: boolean
    resolve: (ok: boolean) => void
  } | null>(null)

  const selectedIds = Object.keys(rowSelection)
  const nameById = useMemo(() => new Map(tribes.map((t) => [t.id, t.name])), [tribes])

  const columns = useMemo(
    () =>
      columnHelper.columns([
        createSelectColumn(columnHelper),
        columnHelper.accessor('name', {
          id: 'name',
          header: ({ column }) => <DataTableColumnHeader column={column} title="이름" />,
          enableHiding: false,
          sortFn: 'text',
          cell: ({ row }) => (
            <Link href={`/admin/tribes/${row.original.id}`} className="font-medium hover:underline">
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
              beforeChange={(next) =>
                next
                  ? Promise.resolve(true)
                  : new Promise<boolean>((resolve) => {
                      const { id, name } = row.original
                      setDeactivateTarget({ id, name, impact: null, loading: true, resolve })
                      runBulk(BULK_ENDPOINT, { ids: [id], action: 'deactivate', dry_run: true })
                        .then((result) => {
                          setDeactivateTarget((prev) =>
                            prev && prev.id === id
                              ? { ...prev, impact: toDeactivateImpact(result.impact), loading: false }
                              : prev
                          )
                        })
                        .catch(() => {
                          // 영향 수를 못 가져와도 확인창은 연다 — 수치를 0으로 두지 않고 안내 문구로 대신한다.
                          setDeactivateTarget((prev) => (prev && prev.id === id ? { ...prev, loading: false } : prev))
                        })
                    })
              }
              onCheckedChange={async (next) => {
                const res = await fetch(`/api/admin/tribes/${row.original.id}`, {
                  method: 'PUT',
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
        columnHelper.accessor((r) => r.tagline ?? '', {
          id: 'tagline',
          header: '태그라인',
          enableSorting: false,
          meta: { label: '태그라인' },
          cell: ({ row }) => <span className="text-muted-foreground">{row.original.tagline ?? '—'}</span>,
        }),
        columnHelper.accessor('drop_weight', {
          id: 'dropWeight',
          header: ({ column }) => <DataTableColumnHeader column={column} title="드랍 가중치" />,
          meta: { label: '드랍 가중치' },
          cell: ({ getValue }) => <span>{getValue().toFixed(1)}</span>,
        }),
        columnHelper.display({
          id: 'badgeCount',
          header: '배지 수',
          enableSorting: false,
          enableHiding: false,
          cell: ({ row }) => <span>{badgeCounts[row.original.id] ?? 0}</span>,
        }),
        columnHelper.display({
          id: 'bookCount',
          header: '컬렉션 수',
          enableSorting: false,
          enableHiding: false,
          cell: ({ row }) => <span>{bookCounts[row.original.id] ?? 0}</span>,
        }),
        columnHelper.accessor('sort_order', {
          id: 'sortOrder',
          header: ({ column }) => <DataTableColumnHeader column={column} title="정렬" />,
          meta: { label: '정렬' },
          cell: ({ getValue }) => <span className="text-muted-foreground">{getValue()}</span>,
        }),
        columnHelper.display({
          id: 'deleteBlockReason',
          header: '삭제 불가 사유',
          enableSorting: false,
          meta: { label: '삭제 불가 사유' },
          cell: ({ row }) => {
            const reason = deleteBlockReasons[row.original.id]
            return reason ? (
              <span className="text-xs text-muted-foreground">{reason}</span>
            ) : (
              <span className="text-xs text-muted-foreground">삭제할 수 있음</span>
            )
          },
        }),
      ]),
    [badgeCounts, bookCounts, deleteBlockReasons]
  )

  const table = useTable({
    features: dataTableFeatures,
    data: tribes,
    columns,
    getRowId: (row) => row.id,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const clear = () => setRowSelection({})

  const runAction = async (action: ConfirmAction, ids: string[], confirmPhrase?: string) => {
    setBulkPending(true)
    try {
      const result = await runBulk(BULK_ENDPOINT, { ids, action, confirm_phrase: confirmPhrase })
      // 건너뜀 사유는 트라이브 이름으로 보여 준다
      toastBulkResult(
        { ...result, skipped: result.skipped.map((s) => ({ ...s, label: nameById.get(s.id) })) },
        { verb: ACTION_VERB[action] }
      )
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
    setDeactivateImpact(null)
    setDeletePreview(null)
  }

  const openConfirm = async (action: ConfirmAction) => {
    setConfirmAction(action)
    if (action === 'activate') return // 등급 1 — 영향 미리보기 없이 바로 확인창만 연다

    setImpactLoading(true)
    try {
      const result = await runBulk(BULK_ENDPOINT, { ids: selectedIds, action, dry_run: true })
      if (action === 'deactivate') {
        setDeactivateImpact(toDeactivateImpact(result.impact))
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

  const actions: DataTableBulkAction[] = [
    { key: 'activate', label: '활성화', onClick: () => openConfirm('activate'), disabled: bulkPending },
    { key: 'deactivate', label: '비활성화', onClick: () => openConfirm('deactivate'), disabled: bulkPending },
    { key: 'delete', label: '삭제', onClick: () => openConfirm('delete'), disabled: bulkPending, variant: 'destructive' },
  ]

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DataTableViewOptions table={table} />
      </div>

      <DataTableBulkActionBar count={selectedIds.length} onClear={clear} actions={actions} />

      <DataTable
        table={table}
        columnCount={columns.length}
        emptyMessage="등록된 트라이브가 없습니다."
        getRowHref={(row) => `/admin/tribes/${row.original.id}`}
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
          title="트라이브 비활성화"
          verb="비활성화"
          count={1}
          impact={
            deactivateTarget.impact ? (
              <DeactivateImpactNote impact={deactivateTarget.impact} />
            ) : (
              <>영향 수를 불러오지 못했어요. 온보딩 선택지와 추천 후보에서 빠져요. 드랍에는 영향이 없어요.</>
            )
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
            confirmAction === 'deactivate' && deactivateImpact ? (
              <DeactivateImpactNote impact={deactivateImpact} />
            ) : confirmAction === 'delete' && deletePreview ? (
              deletePreview.skipped.length > 0 ? (
                <>선택한 트라이브 중 {deletePreview.skipped.length}건은 연결된 참조가 있어 삭제에서 제외됩니다.</>
              ) : (
                <>선택한 트라이브를 모두 삭제할 수 있습니다.</>
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
        />
      )}
    </div>
  )
}
