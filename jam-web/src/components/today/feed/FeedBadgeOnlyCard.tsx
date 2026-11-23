import type { FeedCardView } from '@/lib/today/cardView'
import { FEED_BADGE_AREA_HEIGHT, FEED_CARD_MIN_HEIGHT } from '@/lib/today/feedConstants'
import { FeedBadgeArt, FeedCardShell, FeedChipPlanLayer, FeedTitle } from './FeedCardParts'

/**
 * 배지만(`badge_only`) — 위에 제목, 아래에 배지 그림(208×208, 영역 높이 216) (티켓 20261121_0041).
 *
 * 샘플: 카드 최소 높이 332. 칩이 없고(자리가 없는 유형이라 `look.chips`도 비어 있다) 제목 속 칩만 선택으로 쓴다. 다른 유형과 같은 칩 계획 층(`FeedChipPlanLayer`)을 두지만 계획이 비어 있어 아무것도 그리지 않는다(칩 계획의 아래 두 모서리 후보는 칩이 생길 때를 위한 것). 설명은 그리지 않는다.
 * 이 유형은 칩 자리가 없어 도장 자리도 없다(`look.stamp`가 늘 null).
 */
export default function FeedBadgeOnlyCard({ view }: { view: FeedCardView }) {
  return (
    <FeedCardShell view={view} minHeight={FEED_CARD_MIN_HEIGHT.badge_only} className="justify-between gap-4">
      <FeedTitle view={view} />
      <div className="flex items-center justify-center" style={{ height: FEED_BADGE_AREA_HEIGHT }}>
        <FeedBadgeArt view={view} />
      </div>
      <FeedChipPlanLayer view={view} />
    </FeedCardShell>
  )
}
