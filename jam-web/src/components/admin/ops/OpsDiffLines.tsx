import { cn } from '@/lib/utils'
import { editPathLabel, formatDiffValue } from '@/lib/admin/opsInbox/labels'
import type { OpsEditDiffEntry } from '@/lib/admin/opsInbox/edit'

/**
 * 수정 전후 차이 표시 (티켓 20260930_1818, 채원 화면 설계 「차이 표시 `OpsDiffLines`」).
 *
 * 바뀐 칸만 「문안 · body: 전 → 후」 한 줄씩 그린다. 전은 취소선과 muted, 후는 굵게이고, 「→」 글자를 함께 그려 색에 기대지 않는다.
 * 수정 양식의 「바뀌는 내용」과 결정 기록의 수정·되돌림 줄이 함께 쓴다. 값은 제출 문자열이라 React 텍스트 노드로만 그린다.
 */
interface OpsDiffLinesProps {
  diff: readonly OpsEditDiffEntry[]
  className?: string
}

export function OpsDiffLines({ diff, className }: OpsDiffLinesProps) {
  if (diff.length === 0) return null
  return (
    <ul className={cn('space-y-1 text-sm', className)}>
      {diff.map((entry) => (
        <li key={entry.path} className="break-words">
          <span className="text-muted-foreground">{editPathLabel(entry.path)}: </span>
          <span className="sr-only">전 </span>
          <span className="text-muted-foreground line-through">{formatDiffValue(entry.path, entry.before)}</span>
          <span aria-hidden="true" className="mx-1.5 text-muted-foreground">
            →
          </span>
          <span className="sr-only">후 </span>
          <span className="font-bold text-foreground">{formatDiffValue(entry.path, entry.after)}</span>
        </li>
      ))}
    </ul>
  )
}
