'use client'

import type { ColumnHelper, RowData } from '@tanstack/react-table'
import { Checkbox } from '@/components/admin/ui/checkbox'
import type { DataTableFeatures } from './features'

/**
 * 표 왼쪽 선택 체크박스 칼럼 공용화(티켓 20260924_0940). 머리 체크박스는 항상 "현재 페이지
 * 전체 선택"(전체 선택 기준은 상위 티켓 §1-1 참고, 필터 결과 전체 선택은
 * `DataTableSelectAllBanner`가 따로 담당). `MissionTable.tsx`/`BadgesTable.tsx`/`PoiTable.tsx`
 * 세 화면에 그대로 반복돼 있던 정의를 하나로 모았다.
 */
export function createSelectColumn<TData extends RowData>(columnHelper: ColumnHelper<DataTableFeatures, TData>) {
  return columnHelper.display({
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
  })
}
