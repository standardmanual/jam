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
import type { PoiListRow } from './PoiList'

interface PoiTableProps {
  pois: PoiListRow[]
  badgeMap: Map<string, string>
  categoryLabelMap: Map<string, string>
}

const columnHelper = createColumnHelper<DataTableFeatures, PoiListRow>()

/** URL의 `sort` 파라미터 ↔ TanStack `SortingState` 변환 — "이름" 컬럼만 헤더 클릭으로 정렬한다
 *  (배지/컬렉션 목록과 동일 패턴, `admin/badges/BadgesTable.tsx` 참고). 최신순은 컬럼이 없어
 *  헤더 클릭 대상이 아니다 — `PoiFilters.tsx`의 정렬 드롭다운이 계속 담당한다. */
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

export function PoiTable({ pois, badgeMap, categoryLabelMap }: PoiTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [bulkLoading, setBulkLoading] = useState(false)
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)

  // AlertDialog(Radix Portal)는 기본적으로 document.body에 렌더링되는데, shadcn 어드민 테마
  // 실값은 [data-admin-theme] 스코프 안에만 존재한다 — 포털 컨테이너를 그 스코프 노드로
  // 지정한다(20260827_002 게이트 리뷰에서 alert-dialog.tsx 팔레트 전환 후 미연결 시 흰
  // 배경 위 흰 글씨로 안 보이는 회귀를 발견해 추가, BadgesTable.tsx와 동일 패턴).
  const [themeContainer, setThemeContainer] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setThemeContainer(document.querySelector<HTMLElement>('[data-admin-theme]'))
  }, [])

  // 필터·정렬·페이지 이동으로 목록(pois)이 바뀌면 이전 선택은 다른 행을 가리킬 수 있다 —
  // 렌더 중 이전 값과 비교해 초기화한다(BadgesTable.tsx와 동일 패턴).
  const [prevPois, setPrevPois] = useState(pois)
  if (pois !== prevPois) {
    setPrevPois(pois)
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
    router.push(`/admin/poi?${params.toString()}`)
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
          <Link href={`/admin/poi/${row.original.id}`} className="font-medium hover:underline">
            {row.original.name}
          </Link>
        ),
      }),
      columnHelper.accessor('category', {
        id: 'category',
        header: '카테고리',
        enableSorting: false,
        meta: { label: '카테고리' },
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground">
            {categoryLabelMap.get(getValue()) || getValue()}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'coordinates',
        header: '위도 / 경도',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <span className="text-xs font-mono">
            {row.original.latitude.toFixed(4)}, {row.original.longitude.toFixed(4)}
          </span>
        ),
      }),
      columnHelper.accessor('radius_meters', {
        id: 'radius',
        header: '반경',
        enableSorting: false,
        meta: { label: '반경' },
        cell: ({ getValue }) => <span className="text-sm">{getValue()}m</span>,
      }),
      columnHelper.accessor('linked_badge_id', {
        id: 'linkedBadge',
        header: '연결 배지',
        enableSorting: false,
        meta: { label: '연결 배지' },
        cell: ({ getValue }) => {
          const id = getValue()
          return <span className="text-sm">{id ? (badgeMap.get(id) || id) : '—'}</span>
        },
      }),
    ]),
    [badgeMap, categoryLabelMap]
  )

  const table = useTable({
    features: dataTableFeatures,
    data: pois,
    columns,
    getRowId: (row) => row.id,
    manualSorting: true,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange: handleSortingChange,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const selectedIds = table.getSelectedRowModel().rows.map((row) => row.original.id)

  // 일괄 삭제 전용 API는 없다 — 기존 단건 DELETE를 선택된 행 전체에 순차 호출한다
  // (20260827_011 요구사항, 다른 화면의 "기존 단건 API 순차 호출" 패턴과 동일).
  // POI는 소프트 삭제 개념이 없어 하드 DELETE만 가능하다 — 되돌릴 수 없다.
  const handleBulkDelete = async () => {
    setBulkLoading(true)
    try {
      let failCount = 0
      for (const id of selectedIds) {
        const res = await fetch(`/api/admin/poi/${id}`, { method: 'DELETE' })
        if (!res.ok) failCount += 1
      }
      if (failCount > 0) {
        alert(`${failCount}개 POI 삭제에 실패했습니다. 다시 시도해주세요.`)
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
          선택 항목 삭제
        </Button>
      </DataTableBulkActionBar>

      <DataTable table={table} columnCount={columns.length} emptyMessage="등록된 POI가 없습니다." />

      <AlertDialog
        open={showBulkConfirm}
        onOpenChange={(open) => {
          if (!open && !bulkLoading) setShowBulkConfirm(false)
        }}
      >
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>POI 일괄 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 {selectedIds.length}개 POI를 삭제합니다. 삭제하면 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={bulkLoading} onClick={() => setShowBulkConfirm(false)}>
              취소
            </Button>
            <Button type="button" variant="destructive" disabled={bulkLoading} onClick={handleBulkDelete}>
              삭제
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
