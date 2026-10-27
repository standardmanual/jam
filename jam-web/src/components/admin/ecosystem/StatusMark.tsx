/**
 * 상태 표시 (티켓 20261026_2027 3-1, PRD admin-boards §3 원칙 2). 색만 쓰지 않고 기호와 글자를 함께 쓴다.
 * 상태가 없는 서버·클라이언트 공용 컴포넌트다.
 */
import { cn } from '@/lib/utils'
import type { NodeStatus } from '@/lib/admin/ecosystem/types'
import { STATUS_LABEL, STATUS_SYMBOL } from './format'

const TONE: Record<NodeStatus, string> = {
  stop: 'text-red-700',
  warn: 'text-amber-700',
  error: 'text-orange-700',
  insufficient: 'text-muted-foreground',
  ok: 'text-emerald-700',
  no_target: 'text-muted-foreground',
}

export function StatusMark({ status, className }: { status: NodeStatus; className?: string }) {
  return (
    <span
      data-status={status}
      className={cn('inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap break-keep', TONE[status], className)}
    >
      <span aria-hidden="true">{STATUS_SYMBOL[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  )
}
