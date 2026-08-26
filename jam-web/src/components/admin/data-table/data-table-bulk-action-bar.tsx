'use client'

import type { ReactNode } from 'react'
import { IconX } from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'

interface DataTableBulkActionBarProps {
  /** 선택된 행 개수 — 0이면 아무것도 렌더링하지 않는다 */
  count: number
  onClear: () => void
  /** 일괄 액션 버튼들 */
  children: ReactNode
}

/** 선택된 행 개수 + 일괄 액션 버튼을 보여주는 공용 바(20260826_014) */
export function DataTableBulkActionBar({ count, onClear, children }: DataTableBulkActionBarProps) {
  if (count === 0) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2.5">
      <div className="flex items-center gap-2 text-sm text-neutral-700">
        <span className="font-medium">{count}개 선택됨</span>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={onClear}>
          <IconX className="h-3.5 w-3.5" />
          선택 해제
        </Button>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}
