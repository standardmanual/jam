'use client'

import { memo, useEffect, useMemo, useState } from 'react'
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
import type { CombinationRecipeRow } from '@/types/database'

interface RecipeTableProps {
  recipes: CombinationRecipeRow[]
  badgeMap: Map<string, string>
  onEdit: (recipe: CombinationRecipeRow) => void
  onDelete: (id: string) => void
}

const columnHelper = createColumnHelper<DataTableFeatures, CombinationRecipeRow>()

/**
 * 레시피 목록 테이블(20260826_015) — `RecipeList.tsx`의 저작 폼과 분리된 자식 컴포넌트로,
 * 3단계a 공용 Data Table 컴포넌트로 전환했다. 33건 규모라 서버 페이지네이션은 두지 않는다
 * (사전 조사 결과). 레시피는 하드 DELETE만 있고(`is_public`은 삭제/비활성화가 아니라
 * 재료 공개 여부) 소프트 삭제 개념이 없다 — 20260826_015에서는 이 이유로 행 선택/일괄
 * 액션을 제외했으나, 20260827_011에서 사용자 재확인 후 명시적 경고와 함께 일괄 하드
 * 삭제를 추가하기로 결정했다(완료 기록 참고).
 */
function RecipeTableInner({ recipes, badgeMap, onEdit, onDelete }: RecipeTableProps) {
  const router = useRouter()
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [bulkLoading, setBulkLoading] = useState(false)
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)

  // AlertDialog(Radix Portal)는 기본적으로 document.body에 렌더링되는데, shadcn 어드민 테마
  // 실값은 [data-admin-theme] 스코프 안에만 존재한다 — 포털 컨테이너를 그 스코프 노드로
  // 지정한다(20260827_002 게이트 리뷰 이후 확립된 패턴, BadgesTable.tsx 참고).
  const [themeContainer, setThemeContainer] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setThemeContainer(document.querySelector<HTMLElement>('[data-admin-theme]'))
  }, [])

  // 목록(recipes)이 바뀌면(일괄 삭제 후 router.refresh() 등) 이전 선택은 다른 행을 가리킬
  // 수 있다 — 렌더 중 이전 값과 비교해 초기화한다(BadgesTable.tsx와 동일 패턴).
  const [prevRecipes, setPrevRecipes] = useState(recipes)
  if (recipes !== prevRecipes) {
    setPrevRecipes(recipes)
    setRowSelection({})
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
      columnHelper.display({
        id: 'ingredients',
        header: '재료',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.ingredient_badge_ids.map((id) => badgeMap.get(id) ?? id.slice(0, 8)).join(' + ')}
          </span>
        ),
      }),
      columnHelper.accessor('required_activity_badge_id', {
        id: 'requiredActivity',
        header: '필수 액티비티',
        enableSorting: false,
        meta: { label: '필수 액티비티' },
        cell: ({ getValue }) => {
          const id = getValue()
          return <span className="text-xs text-muted-foreground">{id ? badgeMap.get(id) ?? '—' : '—'}</span>
        },
      }),
      columnHelper.accessor('result_badge_id', {
        id: 'result',
        header: '결과',
        enableSorting: false,
        meta: { label: '결과' },
        cell: ({ getValue }) => {
          const id = getValue()
          return id ? (
            <span className="text-sm">{badgeMap.get(id) ?? '—'}</span>
          ) : (
            <span className="text-xs text-red-600">결과 미지정</span>
          )
        },
      }),
      columnHelper.accessor('success_rate', {
        id: 'successRate',
        header: ({ column }) => <DataTableColumnHeader column={column} title="성공률" />,
        meta: { label: '성공률' },
        cell: ({ getValue }) => <span>{Math.round(getValue() * 100)}%</span>,
      }),
      columnHelper.accessor('is_public', {
        id: 'isPublic',
        header: '공개',
        enableSorting: false,
        meta: { label: '공개' },
        cell: ({ getValue }) => {
          const isPublic = getValue()
          return (
            <span className={`text-xs px-2 py-0.5 rounded-full ${isPublic ? 'bg-emerald-50 text-emerald-600' : 'bg-neutral-100 text-neutral-500'}`}>
              {isPublic ? '공개' : '비공개'}
            </span>
          )
        },
      }),
      columnHelper.accessor('hint_text', {
        id: 'hint',
        header: '힌트',
        enableSorting: false,
        meta: { label: '힌트' },
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground max-w-[200px] block truncate">{getValue() ?? '—'}</span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <button onClick={() => onEdit(row.original)} className="text-xs hover:opacity-70">
              수정
            </button>
            <button onClick={() => onDelete(row.original.id)} className="text-xs text-red-600 hover:text-red-700">
              삭제
            </button>
          </div>
        ),
      }),
    ]),
    [badgeMap, onEdit, onDelete]
  )

  const table = useTable({
    features: dataTableFeatures,
    data: recipes,
    columns,
    getRowId: (row) => row.id,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
  })

  const selectedIds = table.getSelectedRowModel().rows.map((row) => row.original.id)

  // 일괄 삭제 전용 API는 없다 — 기존 단건 DELETE를 선택된 행 전체에 순차 호출한다
  // (20260827_011 요구사항, 다른 화면의 "기존 단건 API 순차 호출" 패턴과 동일).
  // 레시피는 소프트 삭제 개념이 없어 하드 DELETE만 가능하다 — 되돌릴 수 없다.
  const handleBulkDelete = async () => {
    setBulkLoading(true)
    try {
      let failCount = 0
      for (const id of selectedIds) {
        const res = await fetch(`/api/admin/recipes/${id}`, { method: 'DELETE' })
        if (!res.ok) failCount += 1
      }
      if (failCount > 0) {
        alert(`${failCount}개 레시피 삭제에 실패했습니다. 다시 시도해주세요.`)
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

      <DataTable table={table} columnCount={columns.length} emptyMessage="레시피 없음" />

      <AlertDialog
        open={showBulkConfirm}
        onOpenChange={(open) => {
          if (!open && !bulkLoading) setShowBulkConfirm(false)
        }}
      >
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>레시피 일괄 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 {selectedIds.length}개 레시피를 삭제합니다. 삭제하면 되돌릴 수 없습니다.
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

export const RecipeTable = memo(RecipeTableInner)
