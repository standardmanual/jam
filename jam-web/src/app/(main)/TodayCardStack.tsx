import type { TodayCardWithHref } from '@/lib/today/cards'
import TodayCard from '@/components/today/TodayCard'
import { toCardView } from '@/lib/today/cardView'
import type { FeedPalette } from '@/lib/today/feedAssign'

/**
 * 투데이 카드 스택 (홈 화면). 카드 0개면 아무것도 렌더링하지 않는다. 제목 «투데이»·부제 «오늘의 소식»은 그리지 않는다(2026-11-04 사용자 요청, 티켓 20261104_1710).
 *
 * 모든 카드를 표시 데이터(`toCardView`, 계측 정보 `tracking` 포함)로 바꿔 `TodayCard`로 그린다. 유형은 `feed_type`이 정하고, 비었거나 모르는 값이면 텍스트 박스다
 * (티켓 20261122_1101, 옛 7모양 제거).
 * 카드를 누르면 이동하는 곳(`resolved_href`, 기사는 `/today/[id]`)과 노출·클릭 계측은 카드 틀(`CardFrame`)이 맡는다.
 */
export default function TodayCardStack({
  cards,
  palette,
}: {
  cards: TodayCardWithHref[]
  /** 색 키 → hex 표(컬러셋 교체, 티켓 20261121_2145). 색이 비어 있는 카드의 자동 배정에 쓴다. 없으면 기본 팔레트다. */
  palette?: FeedPalette
}) {
  if (!cards || cards.length === 0) return null

  return (
    <section>
      <div className="flex flex-col gap-2">
        {cards.map((card) => (
          <TodayCard key={card.id} view={toCardView(card, { tracking: true, palette })} />
        ))}
      </div>
    </section>
  )
}
