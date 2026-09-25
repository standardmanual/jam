'use client'

import { useCallback, useMemo, useState } from 'react'
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
import {
  runBulk,
  fetchListIds,
  downloadResponseAsFile,
  requestJson,
  type BulkRunResponse,
} from '@/components/admin/data-table/admin-fetch'
import { toastBulkResult } from '@/components/admin/ui/toast-helpers'
import { missionTypeLabel } from '@/lib/admin/badge-labels'
import { contentImageSourceLabel } from '@/lib/admin/contentImageSource'
import { formatKstYmd } from '@/lib/admin/kst-format'
import { checkMissionConditionValue } from '@/lib/missions/condition-keys'
import type { MissionListRow, MissionStatus } from '@/lib/admin/mission-list-query'

/** 서버가 기준 시각 하나로 계산한 상태를 행에 실어 보낸다(클라이언트가 다시 계산하지 않는다) */
export interface MissionTableRow {
  mission: MissionListRow
  status: MissionStatus
  completionCount: number
  isGate: boolean
}

interface MissionTableProps {
  rows: MissionTableRow[]
  /** 현재 필터 조건에 맞는 전체 건수 — 전체 선택 배너에 쓴다 */
  totalCount: number
}

const columnHelper = createColumnHelper<DataTableFeatures, MissionTableRow>()

const SELECT_ALL_CAP = 1000
const BULK_ENDPOINT = '/api/admin/missions/bulk'

const STATUS_LABEL: Record<MissionStatus, string> = { active: '진행 중', ended: '종료', upcoming: '예정' }
const STATUS_CLASS: Record<MissionStatus, string> = {
  active: 'bg-neutral-900/20 text-neutral-900',
  ended: 'bg-neutral-100 text-neutral-500',
  upcoming: 'bg-amber-50 text-amber-600',
}

const EXPOSURE_LABEL: Record<string, string> = {
  hidden: '숨김',
  start_date: '시작일 노출',
  scheduled: '노출일 지정',
}

const ACTION_VERB: Record<string, string> = {
  hide: '숨김 처리',
  show: '노출 처리',
  end_period: '기간 종료 처리',
  delete: '삭제',
}

type ConfirmAction = 'hide' | 'show' | 'end_period' | 'delete'

const CONFIRM_META: Record<ConfirmAction, { level: 1 | 2 | 3; title: string }> = {
  hide: { level: 2, title: '미션 숨김' },
  show: { level: 1, title: '미션 노출' },
  end_period: { level: 2, title: '미션 기간 종료' },
  delete: { level: 3, title: '미션 삭제' },
}

const IN_PROGRESS_NOTICE = '숨겨도 이미 참여 중인 유저는 계속 진행하고 보상을 받아요.'

/**
 * 미션 목록 테이블(티켓 20260924_0946) — 공통 부품으로 전환했다. 필터·정렬·페이지는 서버(URL)에서
 * 처리하고, 표 안 대표 기능은 노출 스위치(숨김 ↔ 노출)다. 일괄 처리는 숨김·노출·기간 종료·삭제·
 * 내보내기를 서버 일괄 API(`/api/admin/missions/bulk`) 한 번으로 보낸다.
 *
 * 상태 컬럼은 저장된 값이 아니라 시작·종료일에서 계산한 값이다. 숨겨도 참여 중인 유저의 진행·완료·
 * 보상은 그대로라(`checker.ts`는 노출 모드를 보지 않는다) 숨김 확인창에 그 사실을 함께 적는다.
 */
export function MissionTable({ rows, totalCount }: MissionTableProps) {
  const router = useRouter()
  const { filterKey, filterQuery } = useListParams()
  const { sorting, onSortingChange } = useUrlSorting(['title'], [])
  const { rowSelection, onRowSelectionChange, selectedIds, selectIds, clear } = useCrossPageSelection(filterKey)
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})

  const [bulkPending, setBulkPending] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [impactLoading, setImpactLoading] = useState(false)
  const [preview, setPreview] = useState<{
    processed: string[]
    skipped: BulkRunResponse['skipped']
    inProgressUsers: number
    rankingModeLinks: number
    requiredPhrase: string
  } | null>(null)

  // 표 안 스위치가 숨김(등급 2) 확인창을 열 자리 — 확인창의 onConfirm/onOpenChange가 beforeChange가
  // 돌려준 Promise를 resolve해 InlineSwitchCell에 진행 여부를 알려준다. 열릴 때 1건 미리보기로
  // 참여 중인 유저 수를 미리 읽는다.
  const [hideTarget, setHideTarget] = useState<{
    title: string
    resolve: (ok: boolean) => void
    loading: boolean
    inProgressUsers: number
  } | null>(null)

  const confirmHideOne = useCallback((id: string, title: string) => {
    return new Promise<boolean>((resolve) => {
      setHideTarget({ title, resolve, loading: true, inProgressUsers: 0 })
      runBulk(BULK_ENDPOINT, { ids: [id], action: 'hide', dry_run: true })
        .then((result) => {
          setHideTarget((prev) =>
            prev ? { ...prev, loading: false, inProgressUsers: result.impact?.inProgressUsers ?? 0 } : prev
          )
        })
        .catch((error) => {
          toast.error(error instanceof Error ? error.message : '영향 범위를 확인하지 못했어요.')
          setHideTarget(null)
          resolve(false)
        })
    })
  }, [])

  const columns = useMemo(
    () =>
      columnHelper.columns([
        createSelectColumn(columnHelper),
        columnHelper.accessor((r) => r.mission.title, {
          id: 'title',
          header: ({ column }) => <DataTableColumnHeader column={column} title="미션" />,
          enableHiding: false,
          cell: ({ row }) => {
            const m = row.original.mission
            // 조건 값이 깨진 미션(예: item_collect인데 badge_id null) 표시 — 검증 함수를 그대로
            // 재사용한다(별도 판정 로직 금지, 티켓 20260905_1327).
            const conditionError = checkMissionConditionValue(m.mission_type, m.condition_json).error
            return (
              <span className="inline-flex items-center gap-2 font-medium">
                <Link href={`/admin/missions/${m.id}`} className="hover:underline">
                  {m.title}
                </Link>
                {conditionError && (
                  <span
                    className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600"
                    title={conditionError}
                  >
                    목표 미지정
                  </span>
                )}
              </span>
            )
          },
        }),
        columnHelper.accessor((r) => r.isGate, {
          id: 'kind',
          header: '구분',
          enableSorting: false,
          meta: { label: '구분' },
          cell: ({ row }) => <span className="text-sm">{row.original.isGate ? '게이트' : '일반'}</span>,
        }),
        columnHelper.accessor((r) => r.mission.mission_type, {
          id: 'type',
          header: '유형',
          enableSorting: false,
          meta: { label: '유형' },
          cell: ({ row }) => <span>{missionTypeLabel(row.original.mission.mission_type)}</span>,
        }),
        columnHelper.display({
          id: 'period',
          header: '기간',
          enableSorting: false,
          enableHiding: false,
          cell: ({ row }) => {
            const m = row.original.mission
            return (
              <span className="text-xs text-muted-foreground">
                {formatKstYmd(m.starts_at)} ~<br />
                {m.ends_at ? formatKstYmd(m.ends_at) : '상시'}
              </span>
            )
          },
        }),
        columnHelper.accessor((r) => r.completionCount, {
          id: 'completion',
          header: '달성',
          enableSorting: false,
          meta: { label: '달성' },
          cell: ({ row }) => (
            <span>
              {row.original.completionCount}
              {row.original.mission.max_completions ? `/${row.original.mission.max_completions}` : ''}명
            </span>
          ),
        }),
        columnHelper.accessor((r) => r.status, {
          id: 'status',
          header: '상태',
          enableSorting: false,
          meta: { label: '상태' },
          cell: ({ row }) => {
            const status = row.original.status
            return <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
          },
        }),
        columnHelper.accessor((r) => r.mission.exposure_mode, {
          id: 'exposure',
          header: '노출',
          enableSorting: false,
          meta: { label: '노출' },
          cell: ({ row }) => {
            const m = row.original.mission
            return (
              <div className="flex items-center gap-2">
                <InlineSwitchCell
                  checked={m.exposure_mode !== 'hidden'}
                  label={`${m.title} 노출 상태`}
                  beforeChange={(next) => (next ? Promise.resolve(true) : confirmHideOne(m.id, m.title))}
                  onCheckedChange={async (next) => {
                    // 노출로 되돌릴 모드는 노출일(exposure_at) 유무로 정한다(일괄 노출과 같은 규칙)
                    const exposureMode = next ? (m.exposure_at ? 'scheduled' : 'start_date') : 'hidden'
                    await requestJson(`/api/admin/missions/${m.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ exposure_mode: exposureMode }),
                    })
                  }}
                />
                <span className="text-xs text-muted-foreground">
                  {EXPOSURE_LABEL[m.exposure_mode] ?? m.exposure_mode}
                  {m.exposure_mode === 'scheduled' && m.exposure_at && <> · {formatKstYmd(m.exposure_at)}</>}
                </span>
              </div>
            )
          },
        }),
        columnHelper.accessor((r) => r.mission.image_source, {
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
    [confirmHideOne]
  )

  const table = useTable({
    features: dataTableFeatures,
    data: rows,
    columns,
    getRowId: (row) => row.mission.id,
    manualSorting: true,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange,
    onRowSelectionChange,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const pageIds = rows.map((r) => r.mission.id)
  const offPageCount = selectedIds.filter((id) => !pageIds.includes(id)).length

  const fetchAllIds = async () => {
    const params = new URLSearchParams(filterQuery)
    return fetchListIds(`/api/admin/missions/ids?${params.toString()}`)
  }

  const runAction = async (action: ConfirmAction, ids: string[], confirmPhrase?: string) => {
    setBulkPending(true)
    try {
      const result = await runBulk(BULK_ENDPOINT, { ids, action, confirm_phrase: confirmPhrase })
      toastBulkResult(result, { verb: ACTION_VERB[action] })
      clear()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해주세요.')
    } finally {
      setBulkPending(false)
    }
  }

  const closeConfirm = () => {
    setConfirmAction(null)
    setPreview(null)
  }

  const openConfirm = async (action: ConfirmAction) => {
    setConfirmAction(action)
    setImpactLoading(true)
    try {
      const result = await runBulk(BULK_ENDPOINT, { ids: selectedIds, action, dry_run: true })
      setPreview({
        processed: result.processed,
        skipped: result.skipped,
        inProgressUsers: result.impact?.inProgressUsers ?? 0,
        rankingModeLinks: result.impact?.rankingModeLinks ?? 0,
        requiredPhrase: result.requiredPhrase ?? '',
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '영향 범위를 확인하지 못했어요.')
      closeConfirm()
    } finally {
      setImpactLoading(false)
    }
  }

  const handleExport = async () => {
    setBulkPending(true)
    try {
      await downloadResponseAsFile('/api/admin/missions/export', 'missions.csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '내보내기에 실패했어요. 다시 시도해주세요.')
    } finally {
      setBulkPending(false)
    }
  }

  const actions: DataTableBulkAction[] = [
    { key: 'hide', label: '숨김', onClick: () => openConfirm('hide'), disabled: bulkPending },
    { key: 'show', label: '노출', onClick: () => openConfirm('show'), disabled: bulkPending },
    { key: 'end_period', label: '기간 종료', onClick: () => openConfirm('end_period'), disabled: bulkPending },
    { key: 'export', label: '내보내기', onClick: handleExport, disabled: bulkPending },
    { key: 'delete', label: '삭제', onClick: () => openConfirm('delete'), disabled: bulkPending, variant: 'destructive' },
  ]

  const impactOf = (action: ConfirmAction) => {
    if (!preview) return null
    const skippedNote =
      preview.skipped.length > 0 ? <> {preview.skipped.length}건은 조건에 맞지 않아 건너뛰어요.</> : null
    if (action === 'hide') {
      return (
        <>
          지금 참여 중인 유저 {preview.inProgressUsers}명이 있어요. {IN_PROGRESS_NOTICE}
          {skippedNote}
        </>
      )
    }
    if (action === 'end_period') {
      return (
        <>
          지금 참여 중인 유저 {preview.inProgressUsers}명이 있어요. 기간을 끝내면 이 유저들은 더 진행할 수 없어요.
          {skippedNote}
        </>
      )
    }
    if (action === 'delete') {
      const rankingNote =
        preview.rankingModeLinks > 0 ? <> 랭킹 규칙 {preview.rankingModeLinks}건의 대상이 비워져요.</> : null
      return preview.skipped.length > 0 ? (
        <>
          선택한 미션 중 {preview.skipped.length}건은 참여·완료 이력이 있어 삭제에서 제외돼요.
          {rankingNote}
        </>
      ) : (
        <>
          선택한 미션을 모두 삭제할 수 있어요.
          {rankingNote}
        </>
      )
    }
    return null
  }

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
        emptyMessage="조건에 맞는 미션이 없어요."
        getRowHref={(row) => `/admin/missions/${row.original.mission.id}`}
      />

      {hideTarget && (
        <BulkConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              hideTarget.resolve(false)
              setHideTarget(null)
            }
          }}
          level={2}
          title="미션 숨김"
          verb="숨김 처리"
          count={1}
          impact={
            <>
              ‘{hideTarget.title}’에 지금 참여 중인 유저 {hideTarget.inProgressUsers}명이 있어요. {IN_PROGRESS_NOTICE}
            </>
          }
          impactLoading={hideTarget.loading}
          pending={false}
          onConfirm={() => {
            hideTarget.resolve(true)
            setHideTarget(null)
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
          verb={ACTION_VERB[confirmAction]}
          count={preview ? preview.processed.length : selectedIds.length}
          impact={impactOf(confirmAction)}
          impactLoading={impactLoading}
          requiredPhrase={confirmAction === 'delete' ? preview?.requiredPhrase : undefined}
          confirmDisabled={impactLoading || !preview || preview.processed.length === 0}
          pending={bulkPending}
          onConfirm={async () => {
            const phrase = confirmAction === 'delete' ? preview?.requiredPhrase : undefined
            await runAction(confirmAction, selectedIds, phrase)
            closeConfirm()
          }}
        />
      )}
    </div>
  )
}
