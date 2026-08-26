'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  createColumnHelper,
  useTable,
  type ColumnVisibilityState,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table'
import { Button } from '@/components/admin/ui/button'
import { Checkbox } from '@/components/admin/ui/checkbox'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/admin/ui/alert-dialog'
import { dataTableFeatures, type DataTableFeatures } from '@/components/admin/data-table/features'
import { DataTable } from '@/components/admin/data-table/data-table'
import { DataTableColumnHeader } from '@/components/admin/data-table/data-table-column-header'
import { DataTableViewOptions } from '@/components/admin/data-table/data-table-view-options'
import { DataTableBulkActionBar } from '@/components/admin/data-table/data-table-bulk-action-bar'
import type { FactionRow } from '@/types/database'

interface FactionsTableProps {
  factions: FactionRow[]
  badgeCountMap: Map<string, number>
  bookCountMap: Map<string, number>
}

const columnHelper = createColumnHelper<DataTableFeatures, FactionRow>()

/**
 * 세계관 목록 테이블(20260826_015) — 3단계a 공용 Data Table 컴포넌트로 전환했다. 10건
 * 규모라 서버 페이지네이션은 두지 않는다(사전 조사 결과).
 *
 * 세계관은 `is_active`가 있어 일괄 비활성화가 가능하다(티켓 명시). 다만
 * `PUT /api/admin/factions/[id]`는 부분 필드만 보내면 `background_color` 등을 `null`로
 * 덮어쓰는 기존 버그가 있다(구현 중 발견, 완료 기록의 alert 참고) — 이미 서버에서 불러온
 * 전체 `FactionRow` 필드를 그대로 스프레드해 `is_active`만 덮어써 보내는 방식으로 우회한다
 * (새 PATCH 엔드포인트를 만들지 않고 기존 API 계약을 그대로 재사용, 배지 파일럿과 동일 원칙).
 */
export function FactionsTable({ factions, badgeCountMap, bookCountMap }: FactionsTableProps) {
  const router = useRouter()
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [bulkLoading, setBulkLoading] = useState(false)
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)

  const columns = useMemo(
    () => columnHelper.columns([
      columnHelper.display({
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
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
        header: ({ column }) => <DataTableColumnHeader column={column} title="이름" />,
        enableHiding: false,
        sortFn: 'text',
        cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
      }),
      columnHelper.accessor((r) => r.tagline ?? '', {
        id: 'tagline',
        header: '태그라인',
        enableSorting: false,
        meta: { label: '태그라인' },
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.tagline ?? '—'}</span>,
      }),
      columnHelper.accessor('drop_weight', {
        id: 'dropWeight',
        header: ({ column }) => <DataTableColumnHeader column={column} title="드랍 가중치" />,
        meta: { label: '드랍 가중치' },
        cell: ({ getValue }) => <span>{getValue().toFixed(1)}</span>,
      }),
      columnHelper.display({
        id: 'badgeCount',
        header: '배지 수',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => <span>{badgeCountMap.get(row.original.id) ?? 0}</span>,
      }),
      columnHelper.display({
        id: 'bookCount',
        header: '컬렉션 수',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => <span>{bookCountMap.get(row.original.id) ?? 0}</span>,
      }),
      columnHelper.accessor('sort_order', {
        id: 'sortOrder',
        header: ({ column }) => <DataTableColumnHeader column={column} title="정렬" />,
        meta: { label: '정렬' },
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue()}</span>,
      }),
      columnHelper.accessor('is_active', {
        id: 'status',
        header: '상태',
        enableSorting: false,
        meta: { label: '상태' },
        cell: ({ getValue }) => {
          const isActive = getValue()
          return (
            <span
              className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                isActive ? 'bg-neutral-900/10 text-neutral-900' : 'bg-white text-neutral-500 border border-neutral-200'
              }`}
            >
              {isActive ? '활성' : '비활성'}
            </span>
          )
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="text-right">
            <Link href={`/admin/factions/${row.original.id}`} className="text-xs text-muted-foreground hover:text-foreground">
              편집
            </Link>
          </div>
        ),
      }),
    ]),
    [badgeCountMap, bookCountMap]
  )

  const table = useTable({
    features: dataTableFeatures,
    data: factions,
    columns,
    getRowId: (row) => row.id,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original)

  const handleBulkDeactivate = async () => {
    setBulkLoading(true)
    try {
      let failCount = 0
      for (const faction of selectedRows) {
        const res = await fetch(`/api/admin/factions/${faction.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          // 이미 불러온 전체 필드를 그대로 보내고 is_active만 덮어쓴다 — PUT 라우트가
          // undefined 필드는 무시하지만 background_* 필드는 undefined일 때 null로 강제
          // 대입하는 기존 버그가 있어(완료 기록 alert 참고), 부분 body로 호출하면 안 된다.
          body: JSON.stringify({
            name: faction.name,
            tagline: faction.tagline,
            description: faction.description,
            image_url: faction.image_url,
            drop_weight: faction.drop_weight,
            is_active: false,
            sort_order: faction.sort_order,
            background_color: faction.background_color,
            background_shader_id: faction.background_shader_id,
            background_image_url: faction.background_image_url,
            background_video_url: faction.background_video_url,
          }),
        })
        if (!res.ok) failCount += 1
      }
      if (failCount > 0) {
        alert(`${failCount}개 세계관의 상태 변경에 실패했습니다. 다시 시도해주세요.`)
      }
      router.refresh()
      setRowSelection({})
    } finally {
      setBulkLoading(false)
      setShowBulkConfirm(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DataTableViewOptions table={table} />
      </div>

      <DataTableBulkActionBar count={selectedRows.length} onClear={() => setRowSelection({})}>
        <Button type="button" variant="destructive" size="sm" onClick={() => setShowBulkConfirm(true)}>
          선택 항목 비활성화
        </Button>
      </DataTableBulkActionBar>

      <DataTable table={table} columnCount={columns.length} emptyMessage="등록된 세계관이 없습니다." />

      <AlertDialog
        open={showBulkConfirm}
        onOpenChange={(open) => {
          if (!open && !bulkLoading) setShowBulkConfirm(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>세계관 일괄 비활성화</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 {selectedRows.length}개 세계관을 비활성화합니다. 계속하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={bulkLoading} onClick={() => setShowBulkConfirm(false)}>
              취소
            </Button>
            <Button type="button" variant="destructive" disabled={bulkLoading} onClick={handleBulkDeactivate}>
              계속
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
