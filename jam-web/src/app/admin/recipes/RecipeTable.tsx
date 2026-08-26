'use client'

import { memo, useMemo, useState } from 'react'
import {
  createColumnHelper,
  useTable,
  type ColumnVisibilityState,
  type SortingState,
} from '@tanstack/react-table'
import { dataTableFeatures, type DataTableFeatures } from '@/components/admin/data-table/features'
import { DataTable } from '@/components/admin/data-table/data-table'
import { DataTableColumnHeader } from '@/components/admin/data-table/data-table-column-header'
import { DataTableViewOptions } from '@/components/admin/data-table/data-table-view-options'
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
 * 재료 공개 여부) 소프트 삭제 개념이 없어 행 선택/일괄 액션은 이 화면 범위에서 제외한다
 * (20260826_015 티켓 판단, 완료 기록 참고).
 */
function RecipeTableInner({ recipes, badgeMap, onEdit, onDelete }: RecipeTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})

  const columns = useMemo(
    () => columnHelper.columns([
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
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
  })

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DataTableViewOptions table={table} />
      </div>
      <DataTable table={table} columnCount={columns.length} emptyMessage="레시피 없음" />
    </div>
  )
}

export const RecipeTable = memo(RecipeTableInner)
