import type { CardView } from '@/lib/today/cardView'
import FeedCard from './feed/FeedCard'

/**
 * 표시 데이터(`CardView`)를 새 유형 카드(`FeedCard`)로 그린다 (티켓 20261122_1101, 상위 20261122_1100 8회차-1).
 *
 * 옛 7모양 분기와 `RENDERED_SHAPES`는 지웠다. `view`는 늘 새 유형이다 — `toCardView`가 `feed_type`이 비었거나 모르는 값이면 텍스트 박스(`text_box`)로 만들어 돌려준다.
 * 카드 틀(`CardFrame`: 링크·계측)은 `FeedCard`가 건다.
 */
export default function TodayCard({ view }: { view: CardView }) {
  return <FeedCard view={view} />
}
