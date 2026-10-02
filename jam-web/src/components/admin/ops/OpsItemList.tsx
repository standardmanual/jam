'use client'

import type { ReactNode } from 'react'
import { IconChevronRight } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { formatKstDayTime, kindLabel } from '@/lib/admin/opsInbox/labels'
import { groupItemsByDay, userExperienceOf } from '@/lib/admin/opsInbox/itemView'
import type { OpsItemRecord } from '@/lib/admin/opsInbox/query'
import { rowChipOf, type BalanceLine } from '@/lib/admin/opsInbox/balance/view'
import { OpsKindIcon } from './opsIcons'
import { OpsStatusBadge } from './OpsStatusBadge'

/**
 * 항목 목록(티켓 20260930_1817, 채원 화면 설계 「항목 목록의 한 행」).
 *
 * 공개 시각(KST) 날짜마다 묶어 머리줄(「10/6(월) · 3개」, sticky)을 두고, 같은 날은 공개 시각 순이다. 공개 시각이 없는
 * 항목은 맨 끝 「공개 시각이 없어요」 묶음이다. 행은 종류 아이콘과 글, 시각, 상태 칩, 형식 오류 칩, 「유저가 겪는 것」(2줄)이다.
 * 선택한 행은 왼쪽 굵은 선·배경·chevron·`aria-current`로 나타낸다(색만으로 나누지 않는다).
 * 밸런스 경고가 걸린 행에는 칩 하나가 붙는다: 주의가 있으면 「밸런스 주의 N」, 없고 참고·점검 못 함만 있으면 「밸런스 참고 N」
 * (`balanceLinesByItem`, 티켓 20260930_1459). 반려·취소·실패 항목은 평가에서 빠지므로 칩이 없다.
 * 상태가 「실패」인 행에는 칩 줄 아래에 실패 사유가 한 줄로 줄여 보인다(`failReasonsByItem`, 티켓 20261002_1648). 사유가 없으면 줄을 그리지 않는다.
 *
 * `rowLead`는 행 왼쪽 자리다(1818이 검토중 항목에 체크박스를 채운다). 슬롯이 없으면 자리를 잡지 않는다.
 * 슬롯이 있으면 모든 행이 40×40 자리를 비워 두어 글자가 같은 선에서 시작한다. 행을 누르면 선택이고, 슬롯 안의 조작은
 * 선택을 바꾸지 않는다(버튼 밖에 있다). 제출 문자열은 React 텍스트 노드로만 그린다.
 */

interface OpsItemListProps {
  items: readonly OpsItemRecord[]
  selectedId: string | null
  onSelect: (id: string) => void
  rowLead?: (item: OpsItemRecord) => ReactNode
  /** 방금 상태가 바뀐 항목 ID. 그 행은 1.2초 동안 `bg-muted`로 잔상을 남긴다. */
  flashingIds?: ReadonlySet<string>
  /** 항목 ID → 밸런스 경고 줄. 줄이 있는 항목의 행에 칩 하나를 단다. */
  balanceLinesByItem?: Readonly<Record<string, readonly BalanceLine[]>>
  /** 항목 ID → 가장 최근 실패 사유. 상태가 「실패」인 행에만 보인다. */
  failReasonsByItem?: Readonly<Record<string, string>>
}

/** 행 요소 ID. 다음 항목으로 옮길 때 `scrollIntoView({ block: 'nearest' })`가 이 ID를 찾는다. */
export function opsItemRowId(itemId: string): string {
  return `ops-item-row-${itemId}`
}

function OpsItemRow({
  item,
  selected,
  onSelect,
  rowLead,
  flashing,
  balanceLines,
  failReason,
}: {
  item: OpsItemRecord
  selected: boolean
  onSelect: (id: string) => void
  rowLead?: (item: OpsItemRecord) => ReactNode
  flashing: boolean
  balanceLines?: readonly BalanceLine[]
  failReason?: string
}) {
  const startsAt = formatKstDayTime(item.startsAt)
  const experience = userExperienceOf(item)
  const balanceChip = rowChipOf(balanceLines)

  return (
    <li
      id={opsItemRowId(item.id)}
      className={cn(
        'flex items-start border-l-4 transition-colors duration-700 motion-reduce:transition-none',
        selected ? 'border-l-primary bg-muted' : 'border-l-transparent hover:bg-muted/50',
        flashing && !selected && 'bg-muted'
      )}
    >
      {rowLead && <div className="flex size-10 shrink-0 items-center justify-center">{rowLead(item)}</div>}
      <button
        type="button"
        onClick={() => onSelect(item.id)}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'flex min-w-0 flex-1 items-start gap-2 py-2.5 pr-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-900',
          rowLead ? 'pl-0' : 'pl-3'
        )}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
              <OpsKindIcon kind={item.kind} className="size-4 shrink-0" />
              {kindLabel(item.kind)}
            </span>
            {startsAt && <span className="text-xs tabular-nums text-muted-foreground">{startsAt} 시작</span>}
            <OpsStatusBadge type="item" status={item.status} />
            {item.formatErrors.length > 0 && <OpsStatusBadge type="format-errors" count={item.formatErrors.length} />}
            {balanceChip && <OpsStatusBadge type="balance" level={balanceChip.level} count={balanceChip.count} />}
          </div>
          {item.status === 'failed' && failReason && (
            <p className="truncate text-xs text-destructive" title={failReason}>
              {failReason}
            </p>
          )}
          {experience ? (
            <p className="line-clamp-2 break-words text-sm text-muted-foreground">{experience}</p>
          ) : (
            <p className="text-sm text-muted-foreground">유저가 겪는 것이 비어 있어요</p>
          )}
        </div>
        {selected && <IconChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
      </button>
    </li>
  )
}

export function OpsItemList({ items, selectedId, onSelect, rowLead, flashingIds, balanceLinesByItem, failReasonsByItem }: OpsItemListProps) {
  const groups = groupItemsByDay(items)

  return (
    <div className="divide-y divide-border rounded-lg border border-border bg-background">
      {groups.map((group) => {
        const heading = group.dayLabel ? `${group.dayLabel} · ${group.items.length}개` : `공개 시각이 없어요 · ${group.items.length}개`
        return (
          <section key={group.dayKey ?? 'undated'} aria-label={heading}>
            <h3 className="sticky top-0 z-10 border-b border-border bg-muted px-3 py-1.5 text-xs font-semibold tabular-nums text-muted-foreground">
              {heading}
            </h3>
            <ul className="divide-y divide-border">
              {group.items.map((item) => (
                <OpsItemRow
                  key={item.id}
                  item={item}
                  selected={item.id === selectedId}
                  onSelect={onSelect}
                  rowLead={rowLead}
                  flashing={flashingIds?.has(item.id) ?? false}
                  balanceLines={balanceLinesByItem?.[item.id]}
                  failReason={failReasonsByItem?.[item.id]}
                />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
