'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { createColumnHelper, useTable, type ColumnVisibilityState } from '@tanstack/react-table'
import { dataTableFeatures, type DataTableFeatures } from '@/components/admin/data-table/features'
import { DataTable } from '@/components/admin/data-table/data-table'
import { DataTableColumnHeader } from '@/components/admin/data-table/data-table-column-header'
import { DataTableViewOptions } from '@/components/admin/data-table/data-table-view-options'
import { InlineSwitchCell } from '@/components/admin/data-table/data-table-inline-switch'
import { createSelectColumn } from '@/components/admin/data-table/data-table-select-column'
import { useUrlSorting } from '@/components/admin/data-table/use-list-params'
import { requestJson } from '@/components/admin/data-table/admin-fetch'
import type { ExclusionCollectionRow } from '@/lib/admin/drop-exclusion-list'
import { DropExclusionBulkControls } from './DropExclusionBulkControls'
import { useExclusionSelection } from './DropExclusionTabs'

interface DropExclusionCollectionsTableProps {
  collections: ExclusionCollectionRow[]
  tribeNameById: Map<string, string>
  /** 현재 필터 조건에 맞는 전체 건수 — 전체 선택 배너에 쓴다 */
  totalCount: number
}

const columnHelper = createColumnHelper<DataTableFeatures, ExclusionCollectionRow>()

const HEADER_SORTS = ['name'] as const

/**
 * 컬렉션 드랍 제외 표(티켓 20260911_2220, 표준 표 전환 20260924_0948) — 카드 목록을 표준 표로
 * 바꿨다. 제외 칸 스위치(`InlineSwitchCell`, 기존 `PATCH /api/admin/itembooks/[id]/drop-exclude`)는
 * `item_books.drop_excluded`만 바꾸고 소속 배지 각각의 `drop_excluded`는 건드리지 않는다.
 */
export function DropExclusionCollectionsTable({
  collections,
  tribeNameById,
  totalCount,
}: DropExclusionCollectionsTableProps) {
  const { sorting, onSortingChange } = useUrlSorting(HEADER_SORTS, [])
  const selection = useExclusionSelection('collections')
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})

  const columns = useMemo(
    () =>
      columnHelper.columns([
        createSelectColumn(columnHelper),
        columnHelper.accessor('name', {
          id: 'name',
          header: ({ column }) => <DataTableColumnHeader column={column} title="이름" />,
          enableHiding: false,
          cell: ({ row }) => (
            <Link href={`/admin/itembooks/${row.original.id}`} className="font-medium hover:underline">
              {row.original.name}
            </Link>
          ),
        }),
        columnHelper.accessor('tribe_id', {
          id: 'tribe',
          header: '트라이브',
          enableSorting: false,
          meta: { label: '트라이브' },
          cell: ({ getValue }) => {
            const id = getValue()
            return <span className="text-sm text-muted-foreground">{id ? tribeNameById.get(id) ?? '—' : '—'}</span>
          },
        }),
        columnHelper.accessor('drop_excluded', {
          id: 'dropExcluded',
          header: '전체 드랍 제외',
          enableSorting: false,
          enableHiding: false,
          cell: ({ row }) => (
            <InlineSwitchCell
              checked={row.original.drop_excluded}
              label={`${row.original.name} 컬렉션 전체 드랍 제외`}
              onCheckedChange={async (next) => {
                await requestJson(`/api/admin/itembooks/${row.original.id}/drop-exclude`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ drop_excluded: next }),
                })
              }}
            />
          ),
        }),
      ]),
    [tribeNameById]
  )

  const table = useTable({
    features: dataTableFeatures,
    data: collections,
    columns,
    getRowId: (row) => row.id,
    manualSorting: true,
    state: { sorting, rowSelection: selection.rowSelection, columnVisibility },
    onSortingChange,
    onRowSelectionChange: selection.onRowSelectionChange,
    onColumnVisibilityChange: setColumnVisibility,
  })

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DataTableViewOptions table={table} />
      </div>

      <DropExclusionBulkControls
        tab="collections"
        pageIds={collections.map((c) => c.id)}
        totalCount={totalCount}
        selection={selection}
      />

      <DataTable
        table={table}
        columnCount={columns.length}
        emptyMessage="조건에 맞는 컬렉션이 없습니다."
        getRowHref={(row) => `/admin/itembooks/${row.original.id}`}
      />
    </div>
  )
}
