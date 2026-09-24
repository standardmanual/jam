'use client'

import { useEffect, useRef } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { ReactTable, Row, RowData } from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/ui/table'
import type { DataTableFeatures } from './features'
import { shouldNavigateOnRowClick } from './row-click'

interface DataTableProps<TData extends RowData> {
  /** `useTable({ features: dataTableFeatures, ... })`으로 화면(각 xxxTable.tsx)이 직접 만든 인스턴스 */
  table: ReactTable<DataTableFeatures, TData>
  /** 빈 상태 행의 colSpan 계산용 — 보통 `table.getAllColumns().length` */
  columnCount: number
  emptyMessage?: string
  className?: string
  /**
   * 반환값이 있으면 행 전체를 눌러 그 경로로 이동한다(20260924_0940, 상위 티켓 §1-4).
   * 체크박스·스위치·버튼 등 상호작용 요소를 누를 때는 이동하지 않는다(`row-click.ts`).
   */
  getRowHref?: (row: Row<DataTableFeatures, TData>) => string | undefined
}

/** 이 안쪽을 클릭하면 행 이동으로 보지 않는다(상위 티켓 §1-4 무시 규칙) */
const INTERACTIVE_SELECTOR = 'a, button, input, label, [role="switch"], [role="checkbox"]'

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
  getRowHref,
}: DataTableProps<TData>) {
  const router = useRouter()
  const warnedRef = useRef(false)

  const rows = table.getRowModel().rows

  // getRowId가 없으면 행 키가 배열 인덱스 문자열("0","1",...)로 떨어져, 페이지가 달라도
  // 같은 행 번호끼리 선택이 섞인다(useCrossPageSelection이 그 인덱스를 ID로 오인) —
  // 개발 모드에서만 한 번 경고한다. 콘솔 경고는 렌더링에 필요한 값이 아닌 부수효과라
  // useEffect에서 한다(렌더 중 ref 접근은 react-hooks/refs가 막는다).
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    if (!getRowHref || warnedRef.current || rows.length === 0) return
    if (/^\d+$/.test(rows[0].id)) {
      warnedRef.current = true
      console.warn(
        '[DataTable] getRowId가 지정되지 않은 것 같습니다 — 행 이동/선택이 페이지마다 섞일 수 있습니다.'
      )
    }
  }, [getRowHref, rows])

  const handleRowClick = (row: Row<DataTableFeatures, TData>, href: string) => (event: ReactMouseEvent<HTMLTableRowElement>) => {
    const target = event.target as HTMLElement
    const canNavigate = shouldNavigateOnRowClick({
      defaultPrevented: event.defaultPrevented,
      button: event.button,
      targetInsideRow: event.currentTarget.contains(target),
      targetIsInteractive: !!target.closest(INTERACTIVE_SELECTOR),
      hasTextSelection: (window.getSelection()?.toString().length ?? 0) > 0,
    })
    if (!canNavigate) return

    if (event.metaKey || event.ctrlKey) window.open(href, '_blank')
    else router.push(href)
  }

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
          {rows.length ? (
            rows.map((row) => {
              const href = getRowHref?.(row)
              return (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className={href ? 'hover:bg-gray-50 cursor-pointer' : 'hover:bg-gray-50'}
                  onClick={href ? handleRowClick(row, href) : undefined}
                  onMouseEnter={href ? () => router.prefetch(href) : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              )
            })
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
