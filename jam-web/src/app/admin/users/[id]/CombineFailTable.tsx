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
import type { CombineFailReason } from '@/types/database'

export interface CombineFailRow {
  id: string
  attempted_at: string
  ingredient_badge_ids: string[]
  fail_reason: CombineFailReason | string
  points_awarded: number
}

interface CombineFailTableProps {
  rows: CombineFailRow[]
  /** 재료 배지 id → 이름 (서버에서 사용된 id만 골라 조회해 넘긴다) */
  badgeNames: Record<string, string>
}

const REASON_LABEL: Record<string, string> = {
  no_recipe_match: '레시피 미매칭',
  items_not_found: '재료를 찾지 못함',
  invalid_count: '재료 개수 오류',
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

const columnHelper = createColumnHelper<DataTableFeatures, CombineFailRow>()

/**
 * 유저 상세의 믹스 실패 이력 테이블 (티켓 20260910_1408). 피티가 폐기되면서
 * `user_combine_state`의 연속 실패 카운터를 대체하는 개별 시도 기록이다.
 * 읽기 전용이라 행 선택/일괄 액션이 없다(BadgeHistoryTable과 동일).
 */
export function CombineFailTable({ rows, badgeNames }: CombineFailTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})

  const columns = useMemo(
    () => columnHelper.columns([
      columnHelper.accessor('attempted_at', {
        id: 'attemptedAt',
        header: ({ column }) => <DataTableColumnHeader column={column} title="시도 일시" />,
        meta: { label: '시도 일시' },
        // ISO 문자열은 사전식 정렬로도 시간순과 일치한다 — 기본 sortFn으로 충분.
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(getValue())}</span>
        ),
      }),
      columnHelper.display({
        id: 'ingredients',
        header: '투입 재료',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const ids = row.original.ingredient_badge_ids ?? []
          return (
            <span className="text-sm">
              {ids.length === 0
                ? '—'
                : ids.map((id) => badgeNames[id] ?? id.slice(0, 8)).join(' + ')}
            </span>
          )
        },
      }),
      columnHelper.accessor('fail_reason', {
        id: 'failReason',
        header: '실패 사유',
        enableSorting: false,
        meta: { label: '실패 사유' },
        cell: ({ getValue }) => <span>{REASON_LABEL[getValue()] ?? getValue()}</span>,
      }),
      columnHelper.accessor('points_awarded', {
        id: 'pointsAwarded',
        header: '지급 포인트',
        enableSorting: false,
        meta: { label: '지급 포인트' },
        cell: ({ getValue }) => <span>{getValue() > 0 ? `${getValue()}P` : '—'}</span>,
      }),
    ]),
    [badgeNames]
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
      <DataTable table={table} columnCount={columns.length} emptyMessage="믹스 실패 이력이 없습니다." />
    </div>
  )
}
