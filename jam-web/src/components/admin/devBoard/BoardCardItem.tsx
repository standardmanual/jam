/**
 * 보드 카드 하나 (티켓 20261026_2028 3회차, PRD admin-boards §8)
 *
 * 티켓 카드: 제목(`[카테고리] ` 접두 제거), 티켓 번호(GitHub `blob/staging` 새 탭 링크), 우선순위·카테고리, 출처(티켓 `origin`이 있을 때만).
 * 요청 카드: 「요청 N번」과 제목, 출처. 이 화면은 읽기만 한다(요청 접기·만들기는 생태계 정책 패널).
 * 상태가 없는 서버·클라이언트 공용 컴포넌트다.
 */
import { DEV_REQUEST_ORIGIN_LABELS } from '@/lib/admin/devRequests/constants'
import { stripCategoryPrefix } from '@/lib/admin/devBoard/ticketIndex'
import type { BoardCard } from '@/lib/admin/devBoard/types'
import { ticketUrl } from '@/lib/admin/devBoard/view'

export function BoardCardItem({ card }: { card: BoardCard }) {
  const origin = card.origin ? DEV_REQUEST_ORIGIN_LABELS[card.origin] : null
  if (card.kind === 'request') {
    return (
      <li data-kind="request" data-card-id={card.id} className="space-y-1 rounded-md border border-sky-200 bg-sky-50 p-3">
        <p className="text-xs font-semibold text-sky-800 whitespace-nowrap break-keep">
          <span aria-hidden="true">＋ </span>요청 {card.requestNo}번
        </p>
        <p className="text-sm font-medium text-pretty break-keep wrap-break-word">{card.title}</p>
        {origin ? (
          <p data-origin={card.origin ?? ''} className="text-xs text-muted-foreground break-keep wrap-break-word">
            {origin}
          </p>
        ) : null}
      </li>
    )
  }
  const meta = [card.priority, card.category].filter((part) => part !== '')
  return (
    <li data-kind="ticket" data-card-id={card.id} className="space-y-1 rounded-md border border-border bg-background p-3">
      <p className="text-sm font-medium text-pretty break-keep wrap-break-word">{stripCategoryPrefix(card.title)}</p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground break-keep wrap-break-word">
        {card.path ? (
          <a
            href={ticketUrl(card.path)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono underline underline-offset-2 hover:text-foreground"
          >
            {card.id}
          </a>
        ) : (
          <span className="font-mono">{card.id}</span>
        )}
        {meta.length > 0 ? <span>{meta.join(' · ')}</span> : null}
        {origin ? <span data-origin={card.origin ?? ''}>{origin}</span> : null}
      </p>
    </li>
  )
}
