'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { createColumnHelper, useTable } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { dataTableFeatures, type DataTableFeatures } from '@/components/admin/data-table/features'
import { DataTable } from '@/components/admin/data-table/data-table'
import { DataTableColumnHeader } from '@/components/admin/data-table/data-table-column-header'
import { useUrlSorting } from '@/components/admin/data-table/use-list-params'
import { OpsStatusBadge } from '@/components/admin/ops/OpsStatusBadge'
import { formatKstDayTime, formatWeekRange } from '@/lib/admin/opsInbox/labels'
import type { OpsBundleListRow } from '@/lib/admin/opsInbox/query'

interface OpsInboxTableProps {
  rows: OpsBundleListRow[]
}

const columnHelper = createColumnHelper<DataTableFeatures, OpsBundleListRow>()

/** 머리 칸을 눌러 정렬할 수 있는 열: 주차·항목·받은 시각. 서버가 정렬한다(묶음 상태를 항목에서 계산하므로). */
const HEADER_SORTS = ['week', 'items', 'received_at'] as const
const DEFAULT_SORTING = [{ id: 'received_at', desc: true }]

/** 기획 상세 경로. `id`는 DB 행 ID(`ops_bundles.id`)다. */
export function opsBundleHref(id: string): string {
  return `/admin/ops-inbox/${id}`
}

/**
 * 받은 기획함 표(티켓 20260930_1817, S2). 열 6개: 주차·가설 / 에이전트 / 상태 / 항목 / 형식 오류 / 받은 시각.
 * 행 어디를 눌러도 같은 탭에서 상세로 간다. 새로 도착한 묶음은 그 행의 글자를 굵게 그린다(색만으로 나누지 않는다).
 * 제출 문자열(에이전트 이름·가설)은 React 텍스트 노드로만 그린다.
 */
export function OpsInboxTable({ rows }: OpsInboxTableProps) {
  const { sorting, onSortingChange } = useUrlSorting(HEADER_SORTS, DEFAULT_SORTING)

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor('week', {
          id: 'week',
          header: ({ column }) => <DataTableColumnHeader column={column} title="주차·가설" />,
          enableHiding: false,
          cell: ({ row }) => {
            const bundle = row.original
            const range = formatWeekRange(bundle.week)
            return (
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {bundle.isSample && <OpsStatusBadge type="sample" />}
                  <Link
                    href={opsBundleHref(bundle.id)}
                    className={cn(
                      'underline-offset-4 hover:underline',
                      range ? 'font-semibold text-foreground' : 'text-muted-foreground',
                      bundle.stage === 'arrived' && 'font-bold'
                    )}
                  >
                    {range ? `${range.label} (${range.range})` : '주차 없음'}
                  </Link>
                </div>
                {bundle.hypothesis && (
                  <p className="mt-0.5 max-w-md truncate text-xs text-muted-foreground" title={bundle.hypothesis}>
                    {bundle.hypothesis}
                  </p>
                )}
              </div>
            )
          },
        }),
        columnHelper.accessor('author', {
          id: 'author',
          header: '에이전트',
          enableSorting: false,
          enableHiding: false,
          cell: ({ row }) => (
            <span className={cn('block max-w-[10rem] truncate', row.original.stage === 'arrived' && 'font-semibold')}>
              {row.original.author}
            </span>
          ),
        }),
        columnHelper.display({
          id: 'status',
          header: '상태',
          enableSorting: false,
          enableHiding: false,
          cell: ({ row }) => {
            const bundle = row.original
            return (
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <OpsStatusBadge type="stage" stage={bundle.stage} />
                  {bundle.partialFailure && <OpsStatusBadge type="partial-failure" />}
                </div>
                {bundle.stage === 'review' && (
                  <p className="text-xs tabular-nums text-muted-foreground">
                    결정 {bundle.decidedCount}/{bundle.itemCount}
                  </p>
                )}
              </div>
            )
          },
        }),
        columnHelper.accessor('itemCount', {
          id: 'items',
          header: ({ column }) => <DataTableColumnHeader column={column} title="항목" />,
          enableHiding: false,
          cell: ({ row }) => (
            <span className={cn('tabular-nums', row.original.stage === 'arrived' && 'font-semibold')}>
              {row.original.itemCount}개
            </span>
          ),
        }),
        columnHelper.accessor('formatErrorCount', {
          id: 'format_errors',
          header: '형식 오류',
          enableSorting: false,
          enableHiding: false,
          cell: ({ row }) =>
            row.original.formatErrorCount > 0 ? (
              <OpsStatusBadge type="format-errors" count={row.original.formatErrorCount} short />
            ) : (
              <span className="text-sm text-muted-foreground">없음</span>
            ),
        }),
        columnHelper.accessor('receivedAt', {
          id: 'received_at',
          header: ({ column }) => <DataTableColumnHeader column={column} title="받은 시각" />,
          enableHiding: false,
          cell: ({ row }) => (
            <span className={cn('whitespace-nowrap tabular-nums', row.original.stage === 'arrived' && 'font-semibold')}>
              {formatKstDayTime(row.original.receivedAt) ?? '—'}
            </span>
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
    manualSorting: true,
    state: { sorting },
    onSortingChange,
  })

  return (
    <DataTable
      table={table}
      columnCount={columns.length}
      emptyMessage="표시할 기획이 없어요."
      getRowHref={(row) => opsBundleHref(row.original.id)}
    />
  )
}
