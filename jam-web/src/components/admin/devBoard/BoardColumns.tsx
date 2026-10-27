/**
 * 개발 항목 보드 네 칸 (티켓 20261026_2028 3회차, PRD admin-boards §8)
 *
 * 대기·진행·staging 반영·배포됨. 칸 머리에 전체 개수, 담은 카드보다 전체가 많으면 칸 아래에 「이 밖에 N건 더 있어요」.
 * - 「배포됨」은 `estimatedDeployed`가 참이면 머리에 「추정」과 한 줄을 붙인다.
 * - 닫은 날짜가 없어 칸에 넣지 못한 완료 티켓이 있으면(`undatedClosed`) 「staging 반영」·「배포됨」 칸 아래에 알린다.
 * - 좁은 화면에서는 한 줄씩 쌓이고, 넓어지면 둘 → 넷이다.
 * 상태가 없는 서버·클라이언트 공용 컴포넌트다.
 */
import { Card } from '@/components/admin/ui/card'
import type { BoardColumn, BoardColumnKey, BoardColumns as BoardColumnsData } from '@/lib/admin/devBoard/types'
import { BOARD_COLUMN_KEYS } from '@/lib/admin/devBoard/types'
import { BOARD_COLUMN_TITLES } from '@/lib/admin/devBoard/view'
import { BoardCardItem } from './BoardCardItem'

export const ESTIMATED_NOTE = 'main에 티켓 색인이 없어 닫은 날짜로 가렸어요'

export function undatedNote(count: number): string {
  return `닫은 날짜가 없는 완료 티켓 ${count}건은 이 칸에 넣지 않았어요`
}

function ColumnView({
  columnKey,
  column,
  estimated,
  undatedClosed,
}: {
  columnKey: BoardColumnKey
  column: BoardColumn
  estimated: boolean
  undatedClosed: number
}) {
  const more = column.total - column.cards.length
  const showEstimate = columnKey === 'deployed' && estimated
  const showUndated = (columnKey === 'staged' || columnKey === 'deployed') && undatedClosed > 0
  return (
    <section data-column={columnKey} aria-labelledby={`dev-board-col-${columnKey}`} className="min-w-0">
      <Card className="space-y-3 bg-muted/30 p-3">
        <header className="space-y-1">
          <h3 id={`dev-board-col-${columnKey}`} className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-foreground">
            <span className="break-keep wrap-break-word">{BOARD_COLUMN_TITLES[columnKey]}</span>
            <span data-total="" className="tabular-nums text-muted-foreground">
              {column.total.toLocaleString('en-US')}
            </span>
            {showEstimate ? (
              <span data-estimated="" className="text-xs font-semibold text-amber-700 whitespace-nowrap">
                <span aria-hidden="true">▲ </span>추정
              </span>
            ) : null}
          </h3>
          {showEstimate ? (
            <p className="text-xs text-muted-foreground text-pretty break-keep wrap-break-word">{ESTIMATED_NOTE}</p>
          ) : null}
        </header>
        {column.cards.length === 0 ? (
          <p className="text-xs text-muted-foreground break-keep wrap-break-word">이 칸은 비어 있어요</p>
        ) : (
          <ul className="space-y-2">
            {column.cards.map((card) => (
              <BoardCardItem key={card.id + (card.path ?? '')} card={card} />
            ))}
          </ul>
        )}
        {more > 0 ? (
          <p data-more="" className="text-xs text-muted-foreground break-keep wrap-break-word">
            이 밖에 {more.toLocaleString('en-US')}건 더 있어요
          </p>
        ) : null}
        {showUndated ? (
          <p data-undated="" className="text-xs text-amber-700 text-pretty break-keep wrap-break-word">
            <span aria-hidden="true">▲ </span>
            {undatedNote(undatedClosed)}
          </p>
        ) : null}
      </Card>
    </section>
  )
}

export function BoardColumns({
  columns,
  estimatedDeployed,
  undatedClosed,
}: {
  columns: BoardColumnsData
  estimatedDeployed: boolean
  undatedClosed: number
}) {
  return (
    <section aria-labelledby="dev-board-board-heading" className="space-y-3">
      <div>
        <h2 id="dev-board-board-heading" className="text-base font-semibold text-foreground">
          개발 항목 보드
        </h2>
        <p className="mt-1 text-xs text-muted-foreground text-pretty break-keep wrap-break-word">
          티켓 번호를 누르면 GitHub의 티켓 문서가 새 탭에서 열려요
        </p>
      </div>
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-4">
        {BOARD_COLUMN_KEYS.map((key) => (
          <ColumnView key={key} columnKey={key} column={columns[key]} estimated={estimatedDeployed} undatedClosed={undatedClosed} />
        ))}
      </div>
    </section>
  )
}
