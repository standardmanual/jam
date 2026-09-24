'use client'

import type { ReactNode } from 'react'
import { IconChevronDown, IconX } from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/admin/ui/dropdown-menu'

export interface DataTableBulkAction {
  key: string
  label: string
  onClick: () => void
  disabled?: boolean
  variant?: 'default' | 'outline' | 'destructive'
}

interface DataTableBulkActionBarProps {
  /** 선택된 행 개수 — 0이면 아무것도 렌더링하지 않는다 */
  count: number
  onClear: () => void
  /** 일괄 액션 버튼들(기존 방식 — 직접 JSX 버튼을 넣는다) */
  children?: ReactNode
  /**
   * 선언형 일괄 액션 목록(20260924_0940, 상위 티켓 §1-7b) — 앞 `primaryCount`개는 버튼으로
   * 드러내고 나머지는 "더보기" 드롭다운에 넣는다. `children`과 함께 써도 된다.
   */
  actions?: DataTableBulkAction[]
  /** 버튼으로 드러낼 대표 액션 수(기본 2) */
  primaryCount?: number
  /** 다른 페이지에서 선택된 건수 — 있으면 선택 수 옆에 함께 안내한다 */
  offPageCount?: number
}

/** 선택된 행 개수 + 일괄 액션 버튼을 보여주는 공용 바(20260826_014, 20260924_0940 확장) */
export function DataTableBulkActionBar({
  count,
  onClear,
  children,
  actions,
  primaryCount = 2,
  offPageCount,
}: DataTableBulkActionBarProps) {
  if (count === 0) return null

  const primary = actions?.slice(0, primaryCount) ?? []
  const overflow = actions?.slice(primaryCount) ?? []

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2.5">
      <div className="flex items-center gap-2 text-sm text-neutral-700">
        <span className="font-medium">
          {count}건 선택됨
          {!!offPageCount && offPageCount > 0 && ` (다른 페이지 ${offPageCount}건 포함)`}
        </span>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={onClear}>
          <IconX className="h-3.5 w-3.5" />
          선택 해제
        </Button>
      </div>
      <div className="flex items-center gap-2">
        {children}
        {primary.map((action) => (
          <Button
            key={action.key}
            type="button"
            variant={action.variant ?? 'outline'}
            size="sm"
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        ))}
        {overflow.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                더보기
                <IconChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {overflow.map((action) => (
                <DropdownMenuItem key={action.key} disabled={action.disabled} onClick={action.onClick}>
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
