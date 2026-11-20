import SafeImage from '@/components/SafeImage'
import type { FeedCardView } from '@/lib/today/cardView'
import { FEED_CARD_MIN_HEIGHT, FEED_CHIP_OFFSET, FEED_DROP_PICKUP } from '@/lib/today/feedConstants'
import FeedBox from '../FeedBox'
import { FeedCardShell, FeedChipLayer, FeedStampLayer, FeedTextBlock } from './FeedCardParts'

/**
 * 드랍·픽업(`drop_pickup`) — 위에 아이템 배지 3개를 박스에 담아 한 줄(영역 높이 184, 칸 간격 8, 칸마다 배지 80×80을 가운데에), 아래에 제목과 설명 (티켓 20261121_0115).
 *
 * 샘플: 카드 최소 높이 360. 박스 모양은 카드의 모양(`look.boxShape`, 5종 중 하나)을 **아이템 방향**(`item`)으로 그린다. 칸 폭은 3칸 기준이라 배지가 3개 미만이면 있는 만큼을 가운데에 모은다.
 * 이미지가 없는 배지는 이름 글자로 대신한다. 칩은 박스 줄 위(`box-row-top`) 자리 하나이고 박스 줄의 왼쪽 위 모서리에 걸친다(걸침 정도는 `FEED_CHIP_OFFSET`).
 * 배지가 0개인 카드는 `toCardView`가 옛 경로로 보내 여기로 오지 않는다. 박스에는 외곽선이 없고 칩은 마스크 밖의 형제 층이다.
 */

/** 칸 폭: 3칸과 칸 간격 2개를 뺀 균등 폭. 배지 수와 상관없이 같아 한두 개여도 칸 크기가 변하지 않는다. */
const CELL_STYLE = { width: `calc((100% - ${FEED_DROP_PICKUP.gap * (FEED_DROP_PICKUP.columns - 1)}px) / ${FEED_DROP_PICKUP.columns})` }
const ROW_STYLE = { height: FEED_DROP_PICKUP.rowHeight }

/** `box-row-top` 자리: 박스 줄의 왼쪽 위 모서리에 걸친다. 이 밖의 자리 이름은 이 유형이 그리지 않는다. */
function boxRowChipPosition(slot: string) {
  return slot === 'box-row-top' ? { top: -FEED_CHIP_OFFSET.y, left: -FEED_CHIP_OFFSET.x } : null
}

export default function FeedDropPickupCard({ view }: { view: FeedCardView }) {
  const { look } = view
  const badges = (view.itemBadges ?? []).slice(0, FEED_DROP_PICKUP.columns)
  return (
    <FeedCardShell view={view} minHeight={FEED_CARD_MIN_HEIGHT.drop_pickup} className="justify-between gap-4">
      <div className="relative flex flex-none justify-center gap-2" style={ROW_STYLE}>
        {badges.map((badge, index) => (
          <div key={index} className="flex-none" style={CELL_STYLE}>
            <FeedBox
              shape={look.boxShape}
              orientation="item"
              color={look.colors.box}
              seed={look.seed}
              className="flex h-full w-full items-center justify-center"
            >
              <SafeImage
                src={badge.imageUrl}
                alt={badge.name}
                width={FEED_DROP_PICKUP.badgeSize}
                height={FEED_DROP_PICKUP.badgeSize}
                className="object-contain"
                fallback={
                  <span className="line-clamp-3 px-2 text-center text-xs font-bold text-foreground break-keep wrap-break-word">{badge.name}</span>
                }
              />
            </FeedBox>
          </div>
        ))}
        <FeedChipLayer view={view} positionOf={boxRowChipPosition} />
        <FeedStampLayer view={view} />
      </div>
      <FeedTextBlock view={view} />
    </FeedCardShell>
  )
}
