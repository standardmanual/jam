import type { FeedCardView } from '@/lib/today/cardView'
import { FEED_BADGE_AREA_HEIGHT, FEED_CARD_MIN_HEIGHT } from '@/lib/today/feedConstants'
import { FeedBadgeArt, FeedCardShell, FeedChipPlanLayer, FeedStampLayer, FeedTextBlock } from './FeedCardParts'

/**
 * 배지 소개(`badge_intro`) — 위에 배지 그림을 박스 없이 가운데에(208×208, 영역 높이 216), 아래에 제목과 설명 (티켓 20261121_0041).
 *
 * 샘플: 카드 최소 높이 348. 칩은 카드 모서리에 걸쳐 계획(`look.chipPlan`)대로 놓이고(`FeedChipPlanLayer`) 배지 그림 가운데를 가리지 않는다. 도장은 배지 그림이 아니라 카드 네 모서리 중 한 곳의 안쪽(12px)에 붙는다(티켓 20261127_0750). 배지 그림이 없으면 빈 영역을 유지한다(자원 아이콘을 그리지 않는다).
 */
export default function FeedBadgeIntroCard({ view }: { view: FeedCardView }) {
  return (
    <FeedCardShell view={view} minHeight={FEED_CARD_MIN_HEIGHT.badge_intro} className="justify-between gap-4">
      <div className="flex items-center justify-center" style={{ height: FEED_BADGE_AREA_HEIGHT }}>
        <FeedBadgeArt view={view} />
      </div>
      <FeedTextBlock view={view} />
      <FeedChipPlanLayer view={view} />
      <FeedStampLayer view={view} />
    </FeedCardShell>
  )
}
