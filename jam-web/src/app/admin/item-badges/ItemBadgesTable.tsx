'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createColumnHelper, useTable, type ColumnVisibilityState } from '@tanstack/react-table'
import { toast } from 'sonner'
import { dataTableFeatures, type DataTableFeatures } from '@/components/admin/data-table/features'
import { DataTable } from '@/components/admin/data-table/data-table'
import { DataTableColumnHeader } from '@/components/admin/data-table/data-table-column-header'
import { DataTableViewOptions } from '@/components/admin/data-table/data-table-view-options'
import { DataTableBulkActionBar, type DataTableBulkAction } from '@/components/admin/data-table/data-table-bulk-action-bar'
import { DataTableSelectAllBanner } from '@/components/admin/data-table/data-table-select-all-banner'
import { createSelectColumn } from '@/components/admin/data-table/data-table-select-column'
import { useCrossPageSelection } from '@/components/admin/data-table/use-cross-page-selection'
import { useListParams, useUrlSorting } from '@/components/admin/data-table/use-list-params'
import { fetchListIds, downloadResponseAsFile } from '@/components/admin/data-table/admin-fetch'
import { RARITY_LABEL, RARITY_BADGE_COLOR } from '@/lib/admin/item-badge-status'
import type { ItemBadgeListRow } from '@/lib/admin/item-badge-list'

interface ItemBadgesTableProps {
  badges: ItemBadgeListRow[]
  /** 도안별 총 발급 수(`countRowsByKey`) — 없는 도안은 0 */
  issuedCountByBadge: Record<string, number>
  /** 현재 필터 조건에 맞는 전체 건수(한 쪽 건수가 아니다) — 전체 선택 배너에 쓴다 */
  totalCount: number
}

const columnHelper = createColumnHelper<DataTableFeatures, ItemBadgeListRow>()

const SELECT_ALL_CAP = 1000
const HEADER_SORTS = ['name'] as const

/**
 * 아이템배지 발급현황 목록 표(티켓 20260924_0950, 상위 티켓 §4.3) — 카드 그리드를 표로 바꿨다.
 * 바꾸는 기능이 없는 감사·기록형 화면이라 일괄 처리는 내보내기뿐이다. 행 아무 곳이나 눌러도
 * 그 배지의 발급 일련번호 목록(`/admin/item-badges/{badgeId}`)으로 이동한다.
 * 발급 수 기준 정렬은 서버(DB)에서 할 수 없어 넣지 않았다.
 */
export function ItemBadgesTable({ badges, issuedCountByBadge, totalCount }: ItemBadgesTableProps) {
  const { filterKey, filterQuery } = useListParams()
  const { sorting, onSortingChange } = useUrlSorting(HEADER_SORTS, [])
  const { rowSelection, onRowSelectionChange, selectedIds, selectIds, clear } = useCrossPageSelection(filterKey)
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [exporting, setExporting] = useState(false)

  const columns = useMemo(
    () =>
      columnHelper.columns([
        createSelectColumn(columnHelper),
        columnHelper.accessor('name', {
          id: 'name',
          header: ({ column }) => <DataTableColumnHeader column={column} title="배지" />,
          enableHiding: false,
          cell: ({ row }) => (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex-shrink-0 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
                {row.original.image_url ? (
                  <Image
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
              <Link href={`/admin/item-badges/${row.original.id}`} className="font-medium hover:underline">
                {row.original.name}
              </Link>
            </div>
          ),
        }),
        columnHelper.accessor('rarity', {
          id: 'rarity',
          header: '등급',
          enableSorting: false,
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
        columnHelper.display({
          id: 'issued',
          header: '총 발급',
          enableSorting: false,
          meta: { label: '총 발급' },
          cell: ({ row }) => (
            <span className="text-sm">{(issuedCountByBadge[row.original.id] ?? 0).toLocaleString('ko-KR')}개</span>
          ),
        }),
      ]),
    [issuedCountByBadge]
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
    return fetchListIds(`/api/admin/item-badges/ids?${params.toString()}`)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      await downloadResponseAsFile('/api/admin/item-badges/export', 'item_badges.csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '내보내기에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setExporting(false)
    }
  }

  const actions: DataTableBulkAction[] = [{ key: 'export', label: '내보내기', onClick: handleExport, disabled: exporting }]

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
        emptyMessage="조건에 맞는 배지가 없습니다."
        getRowHref={(row) => `/admin/item-badges/${row.original.id}`}
      />
    </div>
  )
}
