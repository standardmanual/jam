'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createColumnHelper, useTable, type ColumnVisibilityState } from '@tanstack/react-table'
import { dataTableFeatures, type DataTableFeatures } from '@/components/admin/data-table/features'
import { DataTable } from '@/components/admin/data-table/data-table'
import { DataTableColumnHeader } from '@/components/admin/data-table/data-table-column-header'
import { DataTableViewOptions } from '@/components/admin/data-table/data-table-view-options'
import { InlineSwitchCell } from '@/components/admin/data-table/data-table-inline-switch'
import { createSelectColumn } from '@/components/admin/data-table/data-table-select-column'
import { useUrlSorting } from '@/components/admin/data-table/use-list-params'
import { requestJson } from '@/components/admin/data-table/admin-fetch'
import { RARITY_LABEL, RARITY_BADGE_COLOR } from '@/lib/admin/item-badge-status'
import type { ExclusionBadgeRow } from '@/lib/admin/drop-exclusion-list'
import { DropExclusionBulkControls } from './DropExclusionBulkControls'
import { useExclusionSelection } from './DropExclusionTabs'

interface DropExclusionBadgesTableProps {
  badges: ExclusionBadgeRow[]
  collectionNameById: Map<string, string>
  /** 현재 필터 조건에 맞는 전체 건수 — 전체 선택 배너에 쓴다 */
  totalCount: number
  emptyMessage?: string
}

const columnHelper = createColumnHelper<DataTableFeatures, ExclusionBadgeRow>()

const HEADER_SORTS = ['name', 'rarity'] as const

/**
 * 아이템배지 드랍 제외 표(티켓 20260911_2220, 표준 표 전환 20260924_0948) — 제외 칸은 표 안에서
 * 바로 반영되는 스위치(`InlineSwitchCell`, 기존 `PATCH /api/admin/badges/[id]/drop-exclude`)이고,
 * 일괄 제외·해제는 서버 일괄 처리 한 번이다(`DropExclusionBulkControls`). 되돌릴 수 있는 낮은
 * 위험도라 스위치는 확인창 없이 바로 반영한다.
 */
export function DropExclusionBadgesTable({
  badges,
  collectionNameById,
  totalCount,
  emptyMessage = '조건에 맞는 아이템배지가 없습니다.',
}: DropExclusionBadgesTableProps) {
  const { sorting, onSortingChange } = useUrlSorting(HEADER_SORTS, [])
  const selection = useExclusionSelection('badges')
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
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 shrink-0 rounded bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
                {row.original.image_url ? (
                  <Image
                    src={row.original.image_url}
                    alt={row.original.name}
                    width={32}
                    height={32}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-gray-400 text-xs">—</span>
                )}
              </div>
              <Link href={`/admin/item-badges/${row.original.id}`} className="font-medium hover:underline">
                {row.original.name}
              </Link>
            </div>
          ),
        }),
        columnHelper.accessor('item_book_id', {
          id: 'collection',
          header: '컬렉션',
          enableSorting: false,
          meta: { label: '컬렉션' },
          cell: ({ getValue }) => {
            const id = getValue()
            return <span className="text-sm text-muted-foreground">{id ? collectionNameById.get(id) ?? '—' : '—'}</span>
          },
        }),
        columnHelper.accessor('rarity', {
          id: 'rarity',
          header: ({ column }) => <DataTableColumnHeader column={column} title="등급" />,
          meta: { label: '등급' },
          cell: ({ getValue }) => {
            const rarity = getValue()
            return (
              <span
                className={`inline-block px-2 py-0.5 text-xs font-semibold rounded ${
                  (rarity ? RARITY_BADGE_COLOR[rarity] : null) ?? 'bg-gray-100 text-gray-700'
                }`}
              >
                {rarity ? RARITY_LABEL[rarity] : '—'}
              </span>
            )
          },
        }),
        columnHelper.accessor('drop_excluded', {
          id: 'dropExcluded',
          header: '드랍 제외',
          enableSorting: false,
          enableHiding: false,
          cell: ({ row }) => (
            <InlineSwitchCell
              checked={row.original.drop_excluded}
              label={`${row.original.name} 드랍 제외`}
              onCheckedChange={async (next) => {
                await requestJson(`/api/admin/badges/${row.original.id}/drop-exclude`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ drop_excluded: next }),
                })
              }}
            />
          ),
        }),
      ]),
    [collectionNameById]
  )

  const table = useTable({
    features: dataTableFeatures,
    data: badges,
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
        tab="badges"
        pageIds={badges.map((b) => b.id)}
        totalCount={totalCount}
        selection={selection}
      />

      <DataTable
        table={table}
        columnCount={columns.length}
        emptyMessage={emptyMessage}
        getRowHref={(row) => `/admin/item-badges/${row.original.id}`}
      />
    </div>
  )
}
