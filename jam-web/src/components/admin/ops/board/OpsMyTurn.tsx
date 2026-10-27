import Link from 'next/link'
import { buttonVariants } from '@/components/admin/ui/button'
import { cn } from '@/lib/utils'
import { withSampleParam } from '@/lib/admin/opsHome/links'
import { formatKstClock, formatKstDay } from '@/lib/admin/opsInbox/labels'
import type { MyTurnCard, MyTurnReason } from '@/lib/admin/opsBoard/myTurn'
import { OpsRationaleChips, kindChipEntries } from './OpsRationaleChip'
import { SCREEN_STATE_STYLES, StateLabel } from './screenStateStyle'

/**
 * 운영 상황판의 「내 차례」 카드 줄 (티켓 20261026_2023 2회차, 어드민 상황판 PRD §6.1). 훅이 없는 서버 컴포넌트다.
 *
 * `computeMyTurn`의 카드를 가로 줄로 그린다. 카드: 상태(점+아이콘+글자), 제목(한 줄 말줄임), 건수, 마감(결정 필요만), 이유 칩(`OpsRationaleChips`, 티켓 20261026_2024), 주 버튼 하나.
 * 카드가 많으면 가로로 스크롤한다. 카드가 0장이면 한 줄 안내다. 제목은 에이전트가 보낸 문자열이라 React 텍스트 노드로만 그린다.
 */

const TEXT_CLASS = 'break-keep wrap-break-word'

const ACTION_LABELS: Record<MyTurnReason, string> = {
  items: '결정하기',
  failed_items: '확인하기',
  routine_stalled: '기획함 열기',
}

export const MY_TURN_EMPTY_TEXT = '내 차례인 일이 없어요'
export const DEADLINE_PASSED_TEXT = '마감이 지났어요'

/** 「수 18:00까지」. 마감이 지났으면 「마감이 지났어요」. 마감을 읽을 수 없으면 null이다. */
export function deadlineText(deadlineIso: string | null, now: Date): string | null {
  if (!deadlineIso) return null
  const at = Date.parse(deadlineIso)
  if (Number.isNaN(at)) return null
  if (at < now.getTime()) return DEADLINE_PASSED_TEXT
  const weekday = /\((.)\)/.exec(formatKstDay(deadlineIso) ?? '')?.[1]
  const clock = formatKstClock(deadlineIso)
  if (!weekday || !clock) return null
  return `${weekday} ${clock}까지`
}

function MyTurnCardView({ card, now, includeSample }: { card: MyTurnCard; now: Date; includeSample: boolean }) {
  const style = SCREEN_STATE_STYLES[card.kind]
  const deadline = card.kind === 'decide' ? deadlineText(card.deadlineIso, now) : null
  return (
    <li className={cn('flex w-72 shrink-0 flex-col gap-2 rounded-lg border p-4', style.box)}>
      <div className="flex items-center justify-between gap-2">
        <StateLabel state={card.kind} />
        <span className="text-xs font-medium tabular-nums text-foreground">{`${card.count}건`}</span>
      </div>
      <p className={cn('truncate text-sm font-semibold text-foreground', TEXT_CLASS)} title={card.title}>
        {card.title}
      </p>
      {deadline && <p className={cn('text-xs text-foreground', TEXT_CLASS)}>{deadline}</p>}
      <OpsRationaleChips chips={kindChipEntries(card.reasonChips)} />
      <Link
        href={withSampleParam(card.href, includeSample)}
        className={cn(buttonVariants({ size: 'sm', variant: card.kind === 'problem' ? 'outline' : 'default' }), 'mt-auto w-fit')}
      >
        {ACTION_LABELS[card.reason]}
      </Link>
    </li>
  )
}

interface OpsMyTurnProps {
  /** `computeMyTurn`의 카드. */
  cards: readonly MyTurnCard[]
  now: Date
  includeSample?: boolean
  className?: string
}

export function OpsMyTurn({ cards, now, includeSample = false, className }: OpsMyTurnProps) {
  return (
    <section aria-labelledby="ops-my-turn-heading" className={cn('space-y-3', className)}>
      <div className="flex items-baseline gap-3">
        <h2 id="ops-my-turn-heading" className={cn('text-lg font-semibold', TEXT_CLASS)}>
          내 차례
        </h2>
        <p className="text-sm tabular-nums text-muted-foreground">{`${cards.length}건`}</p>
      </div>
      {cards.length === 0 ? (
        <p className={cn('rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground', TEXT_CLASS)}>
          {MY_TURN_EMPTY_TEXT}
        </p>
      ) : (
        <ul
          role="list"
          aria-label="내 차례 카드"
          tabIndex={0}
          className="flex gap-3 overflow-x-auto pb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {cards.map((card) => (
            <MyTurnCardView key={card.id} card={card} now={now} includeSample={includeSample} />
          ))}
        </ul>
      )}
    </section>
  )
}
