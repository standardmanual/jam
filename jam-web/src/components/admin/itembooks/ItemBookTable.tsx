'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  createColumnHelper,
  useTable,
  type ColumnVisibilityState,
  type RowSelectionState,
  type SortingState,
  type Updater,
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
import { ItemBookActiveToggleButton } from './ItemBookActiveToggleButton'
import type { ItemBookRow } from '@/types/database'

interface ItemBookTableProps {
  itemBooks: ItemBookRow[]
  badgeMap: Map<string, string>
  factionMap: Map<string, string>
  itemBadgeCountMap: Map<string, number>
  emptyMessage?: string
}

const columnHelper = createColumnHelper<DataTableFeatures, ItemBookRow>()

/** URL의 `sort` 파라미터 ↔ TanStack `SortingState` 변환 — "이름" 컬럼만 헤더 클릭으로 정렬한다
 *  (배지/POI 목록과 동일 패턴). */
function paramToSorting(sort: string | null): SortingState {
  if (sort === 'name_asc') return [{ id: 'name', desc: false }]
  if (sort === 'name_desc') return [{ id: 'name', desc: true }]
  return []
}

function sortingToParam(sorting: SortingState): string | null {
  const nameSort = sorting.find((s) => s.id === 'name')
  if (!nameSort) return null
  return nameSort.desc ? 'name_desc' : 'name_asc'
}

export function ItemBookTable({
  itemBooks,
  badgeMap,
  factionMap,
  itemBadgeCountMap,
  emptyMessage = '등록된 컬렉션이 없습니다.',
}: ItemBookTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [bulkLoading, setBulkLoading] = useState(false)
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)

  // AlertDialog(Radix Portal)는 기본적으로 document.body에 렌더링되는데, shadcn 어드민 테마
  // 실값은 [data-admin-theme] 스코프 안에만 존재한다 — 포털 컨테이너를 그 스코프 노드로
  // 지정한다(20260827_002 게이트 리뷰에서 alert-dialog.tsx 팔레트 전환 후 미연결 시 흰
  // 배경 위 흰 글씨로 안 보이는 회귀를 발견해 추가).
  const [themeContainer, setThemeContainer] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setThemeContainer(document.querySelector<HTMLElement>('[data-admin-theme]'))
  }, [])

  // 필터·정렬로 목록이 바뀌면 이전 선택은 다른 행을 가리킬 수 있다 — 렌더 중 비교해 초기화
  // (배지 목록 `BadgesTable.tsx`와 동일 패턴, useEffect보다 리렌더가 한 번 적다).
  const [prevItemBooks, setPrevItemBooks] = useState(itemBooks)
  if (itemBooks !== prevItemBooks) {
    setPrevItemBooks(itemBooks)
    setRowSelection({})
  }

  const sorting = useMemo(() => paramToSorting(searchParams.get('sort')), [searchParams])

  const handleSortingChange = (updater: Updater<SortingState>) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater
    const params = new URLSearchParams(searchParams.toString())
    const sortParam = sortingToParam(next)
    if (sortParam) params.set('sort', sortParam)
    else params.delete('sort')
    params.delete('page')
    router.push(`/admin/itembooks?${params.toString()}`)
  }

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
        cell: ({ row }) => (
          <Link href={`/admin/itembooks/${row.original.id}`} className="font-medium hover:underline">
            {row.original.name}
          </Link>
        ),
      }),
      columnHelper.accessor('faction_id', {
        id: 'faction',
        header: '세계관',
        enableSorting: false,
        meta: { label: '세계관' },
        cell: ({ getValue }) => {
          const id = getValue()
          return <span className="text-sm text-muted-foreground">{id ? factionMap.get(id) ?? '—' : '—'}</span>
        },
      }),
      columnHelper.accessor('required_activity_badge_id', {
        id: 'requiredBadge',
        header: '필수 액티비티 배지',
        enableSorting: false,
        meta: { label: '필수 액티비티 배지' },
        cell: ({ getValue }) => {
          const id = getValue()
          return <span className="text-sm">{id ? badgeMap.get(id) ?? '—' : '—'}</span>
        },
      }),
      columnHelper.display({
        id: 'itemBadgeCount',
        header: '아이템 배지 수',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => <span className="text-sm">{itemBadgeCountMap.get(row.original.id) ?? 0}개</span>,
      }),
      columnHelper.accessor('reward_badge_id', {
        id: 'rewardBadge',
        header: '보상 배지',
        enableSorting: false,
        meta: { label: '보상 배지' },
        cell: ({ getValue }) => {
          const id = getValue()
          return <span className="text-sm">{id ? badgeMap.get(id) ?? '—' : '—'}</span>
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: '관리',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <ItemBookActiveToggleButton itemBookId={row.original.id} isActive={row.original.is_active} />
          </div>
        ),
      }),
    ]),
    [badgeMap, factionMap, itemBadgeCountMap]
  )

  const table = useTable({
    features: dataTableFeatures,
    data: itemBooks,
    columns,
    getRowId: (row) => row.id,
    manualSorting: true,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange: handleSortingChange,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const selectedIds = table.getSelectedRowModel().rows.map((row) => row.original.id)

  // 일괄 삭제 전용 API는 없다 — 기존 단건 PATCH(is_active 토글)를 선택된 행 전체에 순차
  // 호출한다(20260826_014 배지 파일럿과 동일 방식). 컬렉션 비활성화는 소속 아이템배지를
  // 연쇄 소프트삭제한다(`cascadeDeactivateItemBookBadges`, PATCH 라우트가 처리).
  const handleBulkDeactivate = async () => {
    setBulkLoading(true)
    try {
      let failCount = 0
      for (const id of selectedIds) {
        const res = await fetch(`/api/admin/itembooks/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: false }),
        })
        if (!res.ok) failCount += 1
      }
      if (failCount > 0) {
        alert(`${failCount}개 컬렉션의 상태 변경에 실패했습니다. 다시 시도해주세요.`)
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

      <DataTableBulkActionBar count={selectedIds.length} onClear={() => setRowSelection({})}>
        <Button type="button" variant="destructive" size="sm" onClick={() => setShowBulkConfirm(true)}>
          선택 항목 비활성화
        </Button>
      </DataTableBulkActionBar>

      <DataTable table={table} columnCount={columns.length} emptyMessage={emptyMessage} />

      <AlertDialog
        open={showBulkConfirm}
        onOpenChange={(open) => {
          if (!open && !bulkLoading) setShowBulkConfirm(false)
        }}
      >
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>컬렉션 일괄 비활성화</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 {selectedIds.length}개 컬렉션을 비활성화하면 소속 아이템배지도 함께 비활성화되고,
              이미 획득한 유저에게서 회수됩니다. 계속하시겠습니까?
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
