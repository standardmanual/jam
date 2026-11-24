import SafeImage from '@/components/SafeImage'
import type { FeedCardView } from '@/lib/today/cardView'
import { FEED_CARD_MIN_HEIGHT, FEED_HERO_IMAGE_HEIGHT } from '@/lib/today/feedConstants'
import FeedBox from '../FeedBox'
import { FeedCardShell, FeedChipPlanLayer, FeedStampLayer, FeedTextBlock } from './FeedCardParts'

/**
 * 히어로(`hero_box`) — 위에 이미지 박스(박스 모양 5종 중 하나로 자른 이미지 마스크), 아래에 제목과 설명 (티켓 20261121_0041).
 *
 * 샘플: 카드 최소 높이 316, 이미지 박스 높이 184(폭은 카드 폭 − 좌우 16px). 칩은 카드 모서리에 걸쳐 계획(`look.chipPlan`)대로 놓이고(`FeedChipPlanLayer`, 코너 칩: 큰 칩 52·작은 칩 40, 사진 박스에는 가운데 안전 구역이 없어 제목·설명 글자만 피한다), 도장은 이미지 모서리 안쪽이다.
 * 이미지가 없으면 박스는 색 면(`look.colors.box`)이다(자리 표시를 그리지 않는다). 이미지는 장식이라 `alt`가 비어 있다 — 제목이 글자로 보인다.
 * 도장은 마스크 밖의 형제 층이라 앵커(`relative` 래퍼)에 놓고, 칩 층은 카드 셸의 직계 자식이다. 반원 돌출은 돌출 영역이 박스 요소 안에 있어 `FeedBox`가 안쪽 여백을 건다.
 */

const IMAGE_SIZES = '(min-width: 430px) 366px, calc(100vw - 64px)'

export default function FeedHeroBoxCard({ view }: { view: FeedCardView }) {
  const { look } = view
  return (
    <FeedCardShell view={view} minHeight={FEED_CARD_MIN_HEIGHT.hero_box} className="justify-between gap-4">
      <div className="relative" style={{ height: FEED_HERO_IMAGE_HEIGHT }}>
        <FeedBox
          shape={look.boxShape}
          orientation="image"
          color={look.colors.box}
          seed={look.seed}
          className="relative h-full w-full overflow-hidden"
        >
          <SafeImage src={view.imageUrl} alt="" sizes={IMAGE_SIZES} className="object-cover" />
        </FeedBox>
        <FeedStampLayer view={view} />
      </div>
      <FeedTextBlock view={view} />
      <FeedChipPlanLayer view={view} />
    </FeedCardShell>
  )
}
