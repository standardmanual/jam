'use client'

import { useMemo, useState } from 'react'
import {
  createColumnHelper,
  useTable,
  type ColumnVisibilityState,
  type SortingState,
} from '@tanstack/react-table'
import { dataTableFeatures, type DataTableFeatures } from '@/components/admin/data-table/features'
import { DataTable } from '@/components/admin/data-table/data-table'
import { DataTableColumnHeader } from '@/components/admin/data-table/data-table-column-header'
import { DataTableViewOptions } from '@/components/admin/data-table/data-table-view-options'
import type { BadgeConditionSnapshot } from '@/types/database'

export interface BadgeHistoryRow {
  id: string
  earned_at: string
  triggered_by: string | null
  triggered_by_activity_name: string | null
  condition_snapshot: BadgeConditionSnapshot | null
  badges: { id: string; name: string; rarity: string } | null
}

interface BadgeHistoryTableProps {
  rows: BadgeHistoryRow[]
}

const RARITY_LABEL: Record<string, string> = {
  common: 'Common', rare: 'Rare', legend: 'Legend', mythic: 'Mythic',
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function formatActivity(a: NonNullable<BadgeConditionSnapshot['trigger_activity']>): string {
  const parts: string[] = []
  if (a.name) parts.push(a.name)
  if (a.activityType) parts.push(a.activityType)
  if (a.distanceKm != null) parts.push(`${a.distanceKm}km`)
  if (a.movingTimeSec != null) parts.push(`${Math.round(a.movingTimeSec / 60)}분`)
  if (a.elevationGainM != null) parts.push(`고도 ${a.elevationGainM}m`)
  if (a.averageSpeedKmh != null) parts.push(`평속 ${a.averageSpeedKmh}km/h`)
  return parts.join(' · ')
}

const columnHelper = createColumnHelper<DataTableFeatures, BadgeHistoryRow>()

/**
 * 유저 상세의 배지 획득 히스토리 테이블(20260826_015) — 3단계a 공용 Data Table 컴포넌트로
 * 전환했다. 읽기 전용 목록이라 행 선택/일괄 액션 개념 자체가 없다(티켓 명시) — 정렬(획득일시)
 * 과 컬럼 표시 토글만 제공한다.
 */
export function BadgeHistoryTable({ rows }: BadgeHistoryTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})

  const columns = useMemo(
    () => columnHelper.columns([
      columnHelper.accessor((r) => r.badges?.name ?? '(삭제된 배지)', {
        id: 'badgeName',
        header: '배지',
        enableSorting: false,
        enableHiding: false,
        cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
      }),
      columnHelper.accessor((r) => r.badges?.rarity ?? '', {
        id: 'rarity',
        header: '등급',
        enableSorting: false,
        meta: { label: '등급' },
        cell: ({ row }) => (
          <span>{RARITY_LABEL[row.original.badges?.rarity ?? ''] ?? row.original.badges?.rarity ?? '—'}</span>
        ),
      }),
      columnHelper.accessor((r) => r.triggered_by ?? '', {
        id: 'triggeredBy',
        header: '획득 경로',
        enableSorting: false,
        meta: { label: '획득 경로' },
        cell: ({ row }) => <span>{row.original.triggered_by ?? '—'}</span>,
      }),
      columnHelper.display({
        id: 'snapshot',
        header: '획득 근거 (실측값)',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const snapshot = row.original.condition_snapshot
          if (!snapshot) return <span className="text-muted-foreground">기록 없음</span>
          return (
            <div className="flex flex-col gap-0.5">
              <span>{snapshot.actual || '—'}</span>
              <span className="text-muted-foreground text-xs">기준: {snapshot.required || '—'}</span>
            </div>
          )
        },
      }),
      columnHelper.display({
        id: 'triggerActivity',
        header: '트리거 활동',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const snapshot = row.original.condition_snapshot
          return (
            <span>
              {snapshot?.trigger_activity
                ? formatActivity(snapshot.trigger_activity)
                : (row.original.triggered_by_activity_name ?? '—')}
            </span>
          )
        },
      }),
      columnHelper.accessor('earned_at', {
        id: 'earnedAt',
        header: ({ column }) => <DataTableColumnHeader column={column} title="획득일시" />,
        meta: { label: '획득일시' },
        // ISO 문자열은 사전식 정렬로도 시간순과 일치한다 — 기본 sortFn(원시값 비교)으로 충분.
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(getValue())}</span>
        ),
      }),
    ]),
    []
  )

  const table = useTable({
    features: dataTableFeatures,
    data: rows,
    columns,
    getRowId: (row) => row.id,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
  })

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DataTableViewOptions table={table} />
      </div>
      <DataTable table={table} columnCount={columns.length} emptyMessage="획득한 배지가 없습니다." />
    </div>
  )
}
