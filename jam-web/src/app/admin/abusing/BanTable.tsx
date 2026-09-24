'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { createColumnHelper, useTable, type ColumnVisibilityState } from '@tanstack/react-table'
import { dataTableFeatures, type DataTableFeatures } from '@/components/admin/data-table/features'
import { DataTable } from '@/components/admin/data-table/data-table'
import { DataTableColumnHeader } from '@/components/admin/data-table/data-table-column-header'
import { DataTableViewOptions } from '@/components/admin/data-table/data-table-view-options'
import { DataTableBulkActionBar } from '@/components/admin/data-table/data-table-bulk-action-bar'
import { DataTableSelectAllBanner } from '@/components/admin/data-table/data-table-select-all-banner'
import { BulkConfirmDialog } from '@/components/admin/data-table/data-table-bulk-confirm-dialog'
import { InlineSwitchCell } from '@/components/admin/data-table/data-table-inline-switch'
import { createSelectColumn } from '@/components/admin/data-table/data-table-select-column'
import { useCrossPageSelection } from '@/components/admin/data-table/use-cross-page-selection'
import { useListParams, useUrlSorting } from '@/components/admin/data-table/use-list-params'
import { requestJson } from '@/components/admin/data-table/admin-fetch'
import type { AbusingPolicy } from '@/lib/abusing/policy'
import { describeBanLevelChange } from '@/lib/admin/abusing-bulk'
import { ABUSING_SELECT_ALL_CAP, type BanRow } from '@/lib/admin/abusing-list'
import { useSanctionBulk } from './useSanctionBulk'

export type { BanRow }

interface BanTableProps {
  bans: BanRow[]
  /** 현재 필터 조건에 맞는 전체 건수 — 전체 선택 배너에 쓴다 */
  totalCount: number
  /** 등급 전환 확인창이 드랍 배율 변화를 문장으로 보여줄 때 쓰는 저장된 정책 */
  policy: AbusingPolicy
}

const columnHelper = createColumnHelper<DataTableFeatures, BanRow>()

const HEADER_SORTS = ['level', 'expires'] as const

interface LevelChangeTarget {
  from: 'soft' | 'hard'
  to: 'soft' | 'hard'
  resolve: (ok: boolean) => void
}

/**
 * 섀도우밴 목록 표(티켓 20260924_0952) — 공용 부품으로 전환했다. 활성/만료 필터·검색·번호 페이지는
 * 서버가 URL(`?tab=bans&status=&q=&page=`)로 나누고, 표 안 대표 기능은 등급 전환(soft ↔ hard)이다.
 * 등급이 바뀌면 유저의 드랍 배율이 달라지므로(위험 등급 2) 바꾸기 전에 확인창을 거친다. 일괄 처리는
 * [해제]·[만료 연장]이다. 행을 누르면 그 유저의 상세로 이동한다.
 */
export function BanTable({ bans, totalCount, policy }: BanTableProps) {
  const { filterKey, filterQuery } = useListParams()
  const { sorting, onSortingChange } = useUrlSorting(HEADER_SORTS, [])
  const { rowSelection, onRowSelectionChange, selectedIds, selectIds, clear } = useCrossPageSelection(filterKey)
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [levelChange, setLevelChange] = useState<LevelChangeTarget | null>(null)

  const bulk = useSanctionBulk({
    bulkEndpoint: '/api/admin/abusing/bans/bulk',
    idsEndpoint: '/api/admin/abusing/bans/ids',
    noun: '섀도우밴',
    selectedIds,
    clear,
    filterQuery,
    releaseImpact: (impact) => (
      <>
        활성 Hard-ban {impact.hardCount ?? 0}건, 활성 Soft-ban {impact.softCount ?? 0}건, 이미 만료된 {impact.expiredCount ?? 0}건
      </>
    ),
  })

  const columns = useMemo(
    () =>
      columnHelper.columns([
        createSelectColumn(columnHelper),
        columnHelper.accessor((r) => r.user?.username ?? r.user_id, {
          id: 'user',
          header: '유저',
          enableSorting: false,
          enableHiding: false,
          cell: ({ row }) => (
            <Link href={`/admin/users/${row.original.user_id}`} className="block hover:underline">
              <span className="block font-medium">{row.original.user?.username ?? '—'}</span>
              <span className="block text-xs text-muted-foreground">
                {row.original.user?.email ?? row.original.user_id.slice(0, 8)}
              </span>
            </Link>
          ),
        }),
        columnHelper.accessor('ban_level', {
          id: 'level',
          header: ({ column }) => <DataTableColumnHeader column={column} title="등급" />,
          meta: { label: '등급' },
          cell: ({ row }) => {
            const level = row.original.ban_level
            const name = row.original.user?.username ?? row.original.user_id.slice(0, 8)
            return (
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${level === 'hard' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}
                >
                  {level.toUpperCase()}
                </span>
                <InlineSwitchCell
                  checked={level === 'hard'}
                  label={`${name} Hard-ban 여부`}
                  beforeChange={(next) =>
                    new Promise<boolean>((resolve) => {
                      setLevelChange({ from: level, to: next ? 'hard' : 'soft', resolve })
                    })
                  }
                  onCheckedChange={async (next) => {
                    await requestJson(`/api/admin/abusing/bans/${row.original.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ ban_level: next ? 'hard' : 'soft' }),
                    })
                  }}
                />
              </div>
            )
          },
        }),
        columnHelper.accessor('reason', {
          id: 'reason',
          header: '사유',
          enableSorting: false,
          meta: { label: '사유' },
          cell: ({ getValue }) => <span className="text-xs max-w-[160px] block truncate">{getValue()}</span>,
        }),
        columnHelper.accessor('expires_at', {
          id: 'expires',
          header: ({ column }) => <DataTableColumnHeader column={column} title="만료" />,
          meta: { label: '만료' },
          cell: ({ getValue }) => {
            const v = getValue()
            return <span className="text-xs text-muted-foreground">{v ? new Date(v).toLocaleDateString('ko-KR') : '영구'}</span>
          },
        }),
        columnHelper.accessor('created_by', {
          id: 'createdBy',
          header: '적용자',
          enableSorting: false,
          meta: { label: '적용자' },
          cell: ({ getValue }) => <span className="text-xs text-muted-foreground">{getValue()}</span>,
        }),
      ]),
    []
  )

  const table = useTable({
    features: dataTableFeatures,
    data: bans,
    columns,
    getRowId: (row) => row.id,
    manualSorting: true,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange,
    onRowSelectionChange,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const pageIds = bans.map((b) => b.id)
  const offPageCount = selectedIds.filter((id) => !pageIds.includes(id)).length

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DataTableViewOptions table={table} />
      </div>

      <DataTableSelectAllBanner
        pageIds={pageIds}
        selection={selectedIds}
        totalCount={totalCount}
        cap={ABUSING_SELECT_ALL_CAP}
        fetchAllIds={bulk.fetchAllIds}
        selectIds={selectIds}
        clear={clear}
      />

      <DataTableBulkActionBar count={selectedIds.length} onClear={clear} actions={bulk.actions} offPageCount={offPageCount} />

      <DataTable
        table={table}
        columnCount={columns.length}
        emptyMessage="조건에 맞는 섀도우밴이 없어요."
        getRowHref={(row) => `/admin/users/${row.original.user_id}`}
      />

      {bulk.dialogs}

      {levelChange && (
        <BulkConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              levelChange.resolve(false)
              setLevelChange(null)
            }
          }}
          level={2}
          title="섀도우밴 등급 전환"
          verb={`${levelChange.to === 'hard' ? 'Hard-ban' : 'Soft-ban'}으로 전환`}
          count={1}
          impact={describeBanLevelChange(levelChange.from, levelChange.to, policy)}
          pending={false}
          onConfirm={() => {
            levelChange.resolve(true)
            setLevelChange(null)
          }}
        />
      )}
    </div>
  )
}
