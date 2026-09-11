'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  createColumnHelper,
  useTable,
  type ColumnVisibilityState,
  type RowSelectionState,
} from '@tanstack/react-table'
import { Button } from '@/components/admin/ui/button'
import { Checkbox } from '@/components/admin/ui/checkbox'
import { Badge as StatusBadge } from '@/components/admin/ui/badge'
import { dataTableFeatures, type DataTableFeatures } from '@/components/admin/data-table/features'
import { DataTable } from '@/components/admin/data-table/data-table'
import { DataTableViewOptions } from '@/components/admin/data-table/data-table-view-options'
import { DataTableBulkActionBar } from '@/components/admin/data-table/data-table-bulk-action-bar'
import { RARITY_LABEL, RARITY_BADGE_COLOR } from '@/lib/admin/item-badge-status'
import type { BadgeRow } from '@/types/database'

type ExclusionBadgeRow = Pick<BadgeRow, 'id' | 'name' | 'image_url' | 'rarity' | 'item_book_id' | 'drop_excluded'>

interface DropExclusionBadgesTableProps {
  badges: ExclusionBadgeRow[]
  collectionNameById: Map<string, string>
  emptyMessage?: string
}

const columnHelper = createColumnHelper<DataTableFeatures, ExclusionBadgeRow>()

/**
 * 아이템배지 다중 선택 → 일괄 드랍 제외/제외 해제(티켓 20260911_2220).
 *
 * `src/app/admin/badges/`·`components/admin/itembooks/ItemBookTable.tsx`의
 * `RowSelectionState` + `DataTableBulkActionBar` 패턴을 그대로 재사용한다(티켓 20260908_2129) —
 * 전용 벌크 API 없이 단건 PATCH(`/api/admin/badges/[id]/drop-exclude`)를 선택 항목마다
 * 순차 호출한다. 되돌릴 수 있는 낮은 위험도의 값이라 확인 다이얼로그는 두지 않는다.
 */
export function DropExclusionBadgesTable({
  badges,
  collectionNameById,
  emptyMessage = '조건에 맞는 아이템배지가 없습니다.',
}: DropExclusionBadgesTableProps) {
  const router = useRouter()

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [bulkLoading, setBulkLoading] = useState(false)

  // 필터가 바뀌어 목록이 교체되면 이전 선택은 다른 행을 가리킬 수 있다 — 렌더 중 비교해
  // 초기화한다(ItemBookTable.tsx와 동일 패턴).
  const [prevBadges, setPrevBadges] = useState(badges)
  if (badges !== prevBadges) {
    setPrevBadges(badges)
    setRowSelection({})
  }

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.display({
          id: 'select',
          header: ({ table }) => (
            <Checkbox
              checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
              onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
              aria-label="전체 선택"
            />
          ),
          cell: ({ row }) => (
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label="행 선택"
            />
          ),
          enableSorting: false,
          enableHiding: false,
        }),
        columnHelper.accessor('name', {
          id: 'name',
          header: '이름',
          enableSorting: false,
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
        columnHelper.accessor('drop_excluded', {
          id: 'dropExcluded',
          header: '드랍 상태',
          enableSorting: false,
          enableHiding: false,
          meta: { label: '드랍 상태' },
          cell: ({ getValue }) =>
            getValue() ? (
              <StatusBadge variant="destructive">드랍 제외됨</StatusBadge>
            ) : (
              <span className="text-sm text-muted-foreground">드랍 대상</span>
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
    state: { rowSelection, columnVisibility },
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const selectedIds = table.getSelectedRowModel().rows.map((row) => row.original.id)

  const runBulkPatch = async (dropExcluded: boolean) => {
    setBulkLoading(true)
    try {
      let failCount = 0
      for (const id of selectedIds) {
        const res = await fetch(`/api/admin/badges/${id}/drop-exclude`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ drop_excluded: dropExcluded }),
        })
        if (!res.ok) failCount += 1
      }
      if (failCount > 0) {
        alert(`${failCount}개 배지의 상태 변경에 실패했습니다. 다시 시도해주세요.`)
      }
      router.refresh()
      setRowSelection({})
    } finally {
      setBulkLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DataTableViewOptions table={table} />
      </div>

      <DataTableBulkActionBar count={selectedIds.length} onClear={() => setRowSelection({})}>
        <Button type="button" variant="outline" size="sm" disabled={bulkLoading} onClick={() => runBulkPatch(true)}>
          선택 항목 드랍 제외
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={bulkLoading} onClick={() => runBulkPatch(false)}>
          선택 항목 제외 해제
        </Button>
      </DataTableBulkActionBar>

      <DataTable table={table} columnCount={columns.length} emptyMessage={emptyMessage} />
    </div>
  )
}
