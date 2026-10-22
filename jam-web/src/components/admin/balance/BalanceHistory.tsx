import { cn } from '@/lib/utils'
import { formatBalanceNumber } from '@/lib/admin/balance/fields'
import { UNKNOWN_ACTOR_LABEL, type BalanceHistoryEntry } from '@/lib/admin/balance/history'
import { formatKstYmdHm } from '@/lib/admin/kst-format'

/**
 * 밸런스 설정 구역의 «최근 변경» 목록 (티켓 20261022_1132 1회). 저장 한 번이 한 줄이다: 누가 · 언제(KST), 바꾼 칸의 «이전 → 새 값», 메모.
 * 바꾼 사람은 표시 이름만 보인다(어드민 ID·이메일은 읽기 결과에 없다). 서버·클라이언트 어디서나 쓰는 순수 부분이다. 문장은 모두 React 텍스트 노드다.
 */
export const HISTORY_TITLE = '최근 변경'
export const HISTORY_EMPTY_MESSAGE = '아직 바꾼 기록이 없어요.'
export const HISTORY_FAILED_MESSAGE = '최근 변경을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.'
export const DISCLOSURE_CHIP_LABEL = '확률 안내에 반영된 칸 포함'

const TEXT = 'break-keep wrap-break-word'

export interface BalanceHistoryProps {
  /** 구역 키. 한 쪽에 구역이 여럿이라 제목 ID에 넣어 겹치지 않게 한다. */
  sectionId: string
  /** 최근 변경. 읽지 못했으면 `null`. */
  entries: readonly BalanceHistoryEntry[] | null
  /** 칸 이름 → 화면에 보일 이름. 없는 칸 이름은 그대로 보인다. */
  labels: Readonly<Record<string, string>>
  /** 칸 이름 → 단위(배, 주, 잼 등). */
  units?: Readonly<Record<string, string | undefined>>
}

export function BalanceHistory({ sectionId, entries, labels, units = {} }: BalanceHistoryProps) {
  const titleId = `balance-${sectionId}-history-title`
  return (
    <section aria-labelledby={titleId} className="space-y-3">
      <h3 id={titleId} className={cn('text-sm font-semibold text-balance', TEXT)}>
        {HISTORY_TITLE}
      </h3>
      {entries === null && <p className={cn('text-sm text-muted-foreground text-pretty', TEXT)}>{HISTORY_FAILED_MESSAGE}</p>}
      {entries !== null && entries.length === 0 && <p className={cn('text-sm text-muted-foreground text-pretty', TEXT)}>{HISTORY_EMPTY_MESSAGE}</p>}
      {entries !== null && entries.length > 0 && (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="space-y-1 rounded-lg border border-border p-3">
              <p className={cn('text-sm font-medium', TEXT)}>
                {entry.changedByName ?? UNKNOWN_ACTOR_LABEL} · {formatKstYmdHm(entry.createdAt)}
                {entry.affectsDisclosure && (
                  <span className={cn('ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 whitespace-nowrap', TEXT)}>
                    {DISCLOSURE_CHIP_LABEL}
                  </span>
                )}
              </p>
              <ul className="space-y-0.5">
                {entry.changes.map((change) => (
                  <li key={change.field} className={cn('text-sm text-pretty', TEXT)}>
                    {labels[change.field] ?? change.field}: {formatBalanceNumber(change.from)}
                    {units[change.field] ?? ''} → {formatBalanceNumber(change.to)}
                    {units[change.field] ?? ''}
                  </li>
                ))}
              </ul>
              {entry.note && <p className={cn('text-sm text-muted-foreground text-pretty', TEXT)}>메모: {entry.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
