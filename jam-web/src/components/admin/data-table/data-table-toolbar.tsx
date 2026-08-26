'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface DataTableToolbarProps {
  /** 검색 입력·페싯 필터(`DataTableFacetedFilter`)·초기화 버튼 등 왼쪽 그룹 */
  children: ReactNode
  /** `DataTableViewOptions` 등 오른쪽 그룹(선택) */
  actions?: ReactNode
  className?: string
}

/**
 * shadcn 공식 Data Table Toolbar의 레이아웃 셸(20260826_014) — 왼쪽 필터 그룹 / 오른쪽
 * 액션 그룹으로 나뉘는 구조만 제공한다. 어떤 필터를 넣을지는 화면별로 결정한다
 * (커스텀 배치 대신 이 셸을 재사용할 것 — `BadgesFilterBar.tsx` 참고).
 */
export function DataTableToolbar({ children, actions, className }: DataTableToolbarProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
