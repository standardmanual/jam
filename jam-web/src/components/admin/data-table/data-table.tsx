'use client'

import type { ReactTable, RowData } from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/ui/table'
import type { DataTableFeatures } from './features'

interface DataTableProps<TData extends RowData> {
  /** `useTable({ features: dataTableFeatures, ... })`으로 화면(각 xxxTable.tsx)이 직접 만든 인스턴스 */
  table: ReactTable<DataTableFeatures, TData>
  /** 빈 상태 행의 colSpan 계산용 — 보통 `table.getAllColumns().length` */
  columnCount: number
  emptyMessage?: string
  className?: string
}

/**
 * 어드민 공용 Data Table 렌더러(20260826_014) — 헤더/바디/빈 상태만 그린다.
 * 툴바(필터)·일괄 액션 바·페이지네이션은 화면별로 이 컴포넌트 위아래에 조합한다
 * (배지 화면 예시: `components/admin/badges/BadgesTable.tsx`).
 */
export function DataTable<TData extends RowData>({
  table,
  columnCount,
  emptyMessage = '표시할 항목이 없습니다.',
  className,
}: DataTableProps<TData>) {
  return (
    <div className={className ?? 'border rounded-lg overflow-hidden'}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="bg-gray-50">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} colSpan={header.colSpan}>
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? 'selected' : undefined}
                className="hover:bg-gray-50"
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columnCount} className="text-center py-8 text-gray-500">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
