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
import { DataTableSortSelect } from '@/components/admin/data-table/data-table-sort-select'
import { createSelectColumn } from '@/components/admin/data-table/data-table-select-column'
import { useCrossPageSelection } from '@/components/admin/data-table/use-cross-page-selection'
import { useListParams, useUrlSorting } from '@/components/admin/data-table/use-list-params'
import { fetchListIds, downloadResponseAsFile } from '@/components/admin/data-table/admin-fetch'
import { RARITY_LABEL, RARITY_BADGE_COLOR, formatDateTime } from '@/lib/admin/item-badge-status'
import { ORPHANED_DEFAULT_SORT, type OrphanedItemRow } from '@/lib/admin/orphaned-items-query'
import type { BadgeRarity } from '@/types/database'
import { DestroyOrphanedAction } from '../_orphaned-actions/DestroyOrphanedAction'
import { ReassignOrphanedAction } from '../_orphaned-actions/ReassignOrphanedAction'

interface OrphanedItemsTableProps {
  rows: OrphanedItemRow[]
  /** 소유자 없는 개체 전체 건수(한 쪽 건수가 아니다) — 전체 선택 배너에 쓴다 */
  totalCount: number
}

const columnHelper = createColumnHelper<DataTableFeatures, OrphanedItemRow>()

const SELECT_ALL_CAP = 1000
/** 머리 칸 정렬이 가능한 컬럼 id — URL `sort` 값은 `${id}_asc|desc`(서버 `parseOrphanedListParams`와 같은 규칙) */
const HEADER_SORTS = ['minted', 'badge', 'serial'] as const

const SORT_OPTIONS = [
  { value: 'minted_desc', label: '발급일 최신순' },
  { value: 'minted_asc', label: '발급일 오래된순' },
  { value: 'badge_asc', label: '배지 이름 오름차순' },
  { value: 'badge_desc', label: '배지 이름 내림차순' },
  { value: 'serial_asc', label: '일련번호 오름차순' },
  { value: 'serial_desc', label: '일련번호 내림차순' },
]

/**
 * "소유자 없음" 전체 목록 테이블(티켓 20260830_0104) — 20260924_0950에서 공용 부품으로 교체했다.
 * 정렬은 서버가 전체 행에 적용한 뒤 쪽을 자른다(클라이언트는 정렬하지 않는다). 일괄 처리는
 * 폐기(등급 3)·재배정(등급 2)·내보내기이고, 선택은 쪽을 넘어 유지된다. 이 화면은 항상 "소유자
 * 없음" 상태 개체만 보여주므로 값이 모든 행에서 같은 "현재 상태"·"현재 위치/소유자" 컬럼은 두지 않는다.
 */
export function OrphanedItemsTable({ rows, totalCount }: OrphanedItemsTableProps) {
  const { filterKey, filterQuery, sort } = useListParams()
  const { sorting, onSortingChange } = useUrlSorting(HEADER_SORTS, [])
  const { rowSelection, onRowSelectionChange, selectedIds, selectIds, clear } = useCrossPageSelection(filterKey)
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [exporting, setExporting] = useState(false)

  const columns = useMemo(
    () =>
      columnHelper.columns([
        createSelectColumn(columnHelper),
        columnHelper.accessor((r) => r.badgeName, {
          id: 'badge',
          header: ({ column }) => <DataTableColumnHeader column={column} title="배지" />,
          enableHiding: false,
          cell: ({ row }) => {
            const r = row.original
            return (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 flex-shrink-0 rounded bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
                  {r.badgeImageUrl ? (
                    <Image src={r.badgeImageUrl} alt={r.badgeName} width={32} height={32} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-gray-400 text-[10px]">—</span>
                  )}
                </div>
                <div className="min-w-0">
                  <Link href={`/admin/item-badges/${r.badgeId}`} className="font-medium truncate hover:underline block">
                    {r.badgeName}
                  </Link>
                  <span
                    className={`inline-block mt-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                      RARITY_BADGE_COLOR[r.badgeRarity as BadgeRarity] ?? 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {RARITY_LABEL[r.badgeRarity as BadgeRarity] ?? r.badgeRarity}
                  </span>
                </div>
              </div>
            )
          },
        }),
        columnHelper.accessor((r) => r.serialLabel, {
          id: 'serial',
          header: ({ column }) => <DataTableColumnHeader column={column} title="일련번호" />,
          enableHiding: false,
          cell: ({ row }) => (
            <Link
              href={`/admin/item-badges/${row.original.badgeId}/${row.original.id}`}
              className="font-mono font-medium hover:underline"
            >
              #{row.original.serialLabel}
            </Link>
          ),
        }),
        columnHelper.accessor('mintedAt', {
          id: 'minted',
          header: ({ column }) => <DataTableColumnHeader column={column} title="발급일시" />,
          meta: { label: '발급일시' },
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
    manualSorting: true,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange,
    onRowSelectionChange,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const pageIds = rows.map((r) => r.id)
  const offPageCount = selectedIds.filter((id) => !pageIds.includes(id)).length
  const selectedItems = selectedIds.map((id) => ({ id }))

  const fetchAllIds = async () => {
    const params = new URLSearchParams(filterQuery)
    if (sort) params.set('sort', sort)
    return fetchListIds(`/api/admin/item-badges/orphaned/ids?${params.toString()}`)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      await downloadResponseAsFile('/api/admin/item-badges/orphaned/export', 'orphaned_item_badges.csv', {
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
      <div className="flex items-center justify-end gap-2">
        <DataTableSortSelect options={SORT_OPTIONS} defaultValue={ORPHANED_DEFAULT_SORT} />
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

      <DataTableBulkActionBar count={selectedIds.length} onClear={clear} actions={actions} offPageCount={offPageCount}>
        <DestroyOrphanedAction items={selectedItems} label="폐기" onDone={clear} />
        <ReassignOrphanedAction items={selectedItems} label="재배정" onDone={clear} />
      </DataTableBulkActionBar>

      <DataTable
        table={table}
        columnCount={columns.length}
        emptyMessage="소유자 없는 개체가 없습니다."
        getRowHref={(row) => `/admin/item-badges/${row.original.badgeId}/${row.original.id}`}
      />
    </div>
  )
}
