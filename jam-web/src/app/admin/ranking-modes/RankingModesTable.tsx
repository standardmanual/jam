'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { createColumnHelper, useTable, type ColumnVisibilityState } from '@tanstack/react-table'
import { dataTableFeatures, type DataTableFeatures } from '@/components/admin/data-table/features'
import { DataTable } from '@/components/admin/data-table/data-table'
import { DataTableColumnHeader } from '@/components/admin/data-table/data-table-column-header'
import { DataTableViewOptions } from '@/components/admin/data-table/data-table-view-options'
import { DataTableToolbar } from '@/components/admin/data-table/data-table-toolbar'
import { DataTableSearch } from '@/components/admin/data-table/data-table-search'
import { DataTableSortSelect } from '@/components/admin/data-table/data-table-sort-select'
import { useUrlSorting } from '@/components/admin/data-table/use-list-params'
import { RANKING_MODE_SORT_OPTIONS, DEFAULT_RANKING_MODE_SORT } from '@/lib/admin/ranking-mode-list'
import type { RankingModeRow } from '@/types/database'

export interface RankingModeListRow {
  id: string
  title: string
  target_type: RankingModeRow['target_type']
  metric_type: RankingModeRow['metric_type']
  starts_at: string
  ends_at: string
  /** 이 규칙을 쓰는 활성·미종료 투데이 카드 수(`ranking-mode-references.ts`) */
  liveCardCount: number
  /** 연결된 미션·대상 유저에 문제가 있으면 그 안내 문구, 정상이면 null */
  integrityMessage: string | null
}

const TARGET_TYPE_LABEL: Record<RankingModeRow['target_type'], string> = {
  mission_participants: '미션 참가자 전원',
  manual_users: '유저 직접 지정',
}

const METRIC_TYPE_LABEL: Record<RankingModeRow['metric_type'], string> = {
  mission_progress: '미션 진행도',
  condition_field: '배지 조건 필드',
  badge_count: '배지 보유 개수',
}

const HEADER_SORTS = ['title'] as const

const columnHelper = createColumnHelper<DataTableFeatures, RankingModeListRow>()

/**
 * 랭킹 규칙 목록 표(티켓 20260924_0947) — 원시 `<table>`을 공통 목록 부품으로 바꿨다. 정렬·검색은
 * 서버(URL)가 처리하고, 행 아무 곳이나 눌러 수정 화면으로 간다. 일괄 처리는 없다(규칙은 소수라
 * 하나씩 고치고, 삭제는 수정 화면에서 한다 — 사용 중인 규칙은 서버가 막는다).
 */
export default function RankingModesTable({ modes }: { modes: RankingModeListRow[] }) {
  const { sorting, onSortingChange } = useUrlSorting(HEADER_SORTS, [])
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor('title', {
          id: 'title',
          header: ({ column }) => <DataTableColumnHeader column={column} title="제목" />,
          enableHiding: false,
          cell: ({ row }) => (
            <Link href={`/admin/ranking-modes/${row.original.id}/edit`} className="font-medium hover:underline">
              {row.original.title}
            </Link>
          ),
        }),
        columnHelper.accessor('target_type', {
          id: 'target',
          header: '대상',
          enableSorting: false,
          meta: { label: '대상' },
          cell: ({ getValue }) => <span className="text-xs text-muted-foreground">{TARGET_TYPE_LABEL[getValue()]}</span>,
        }),
        columnHelper.accessor('metric_type', {
          id: 'metric',
          header: '정렬 지표',
          enableSorting: false,
          meta: { label: '정렬 지표' },
          cell: ({ getValue }) => <span className="text-xs text-muted-foreground">{METRIC_TYPE_LABEL[getValue()]}</span>,
        }),
        columnHelper.display({
          id: 'period',
          header: '집계 기간',
          enableSorting: false,
          meta: { label: '집계 기간' },
          cell: ({ row }) => (
            <span className="text-xs text-muted-foreground">
              {new Date(row.original.starts_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })} ~{' '}
              {new Date(row.original.ends_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
            </span>
          ),
        }),
        columnHelper.accessor('liveCardCount', {
          id: 'liveCards',
          header: '연결된 카드 수',
          enableSorting: false,
          meta: { label: '연결된 카드 수' },
          cell: ({ getValue }) => <span className="text-sm tabular-nums">{getValue()}</span>,
        }),
        columnHelper.accessor('integrityMessage', {
          id: 'status',
          header: '상태',
          enableSorting: false,
          meta: { label: '상태' },
          cell: ({ getValue }) => {
            const message = getValue()
            return message ? (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-600">{message}</span>
            ) : (
              <span className="text-xs text-muted-foreground">정상</span>
            )
          },
        }),
      ]),
    []
  )

  const table = useTable({
    features: dataTableFeatures,
    data: modes,
    columns,
    getRowId: (row) => row.id,
    manualSorting: true,
    state: { sorting, columnVisibility },
    onSortingChange,
    onColumnVisibilityChange: setColumnVisibility,
  })

  return (
    <div className="space-y-3">
      <DataTableToolbar
        actions={
          <>
            <DataTableSortSelect
              options={RANKING_MODE_SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              defaultValue={DEFAULT_RANKING_MODE_SORT}
            />
            <DataTableViewOptions table={table} />
          </>
        }
      >
        <DataTableSearch placeholder="제목으로 검색..." />
      </DataTableToolbar>

      <DataTable
        table={table}
        columnCount={columns.length}
        emptyMessage="조건에 맞는 랭킹 규칙이 없어요."
        getRowHref={(row) => `/admin/ranking-modes/${row.original.id}/edit`}
      />
    </div>
  )
}
