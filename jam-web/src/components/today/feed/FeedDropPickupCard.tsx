import SafeImage from '@/components/SafeImage'
import type { FeedCardView } from '@/lib/today/cardView'
import {
  FEED_CARD_MIN_HEIGHT,
  FEED_DROP_PICKUP,
  dropPickupFrameOf,
  feedTextOnBg,
} from '@/lib/today/feedConstants'
import { FeedCardShell, FeedChipPlanLayer, FeedStampLayer, FeedTextBlock } from './FeedCardParts'

/**
 * 드랍·픽업(`drop_pickup`) — 위에 아이템 배지 1~5개를 박스 없이 크게 겹치고 기울여 흩뿌리고, 아래에 제목과 설명 (티켓 20261122_2229, 상위 20261122_2217 §7).
 *
 * 배지 영역은 기준 326×248(카드 폭 − 안 여백 32)의 비율을 지키는 `relative` 상자 하나다. 배지는 그 안에 `absolute`로 놓는다: 중심은 영역 폭·높이 대비 %,
 * 한 변은 기준 폭 대비 %(폭이 줄면 같은 비율로 줄어 틀 모양이 유지된다), 기울기는 `rotate`다. 배지 수(`FEED_DROP_PICKUP_FRAMES`)가 틀을 정하므로 같은 카드는 늘 같은 모양이다(무작위 없음).
 * 틀의 배열 순서가 앞뒤 순서다(뒤 항목이 위, `zIndex`). 6개 이상이면 앞 5개만 그린다. 배지에 박스·외곽선·그림자를 더하지 않는다(그림 자체가 다이컷 테두리를 갖는다).
 * 그림이 없거나 불러오지 못한 배지는 같은 상자·기울기 안에서 이름 글자로 대신한다(알약·카드 모양 없이 글자만, 글자색은 바탕을 따른다).
 * 칩 «DROP»·«PICKUP»은 카드 셸의 계획 층(`FeedChipPlanLayer`)이 그리고, 계획이 배지 기울인 상자의 가운데 구역과 제목·설명 글자를 피한다. 정적 배치라 모션이 없다.
 * 배지가 0개인 카드는 `toCardView`가 옛 경로로 보내 여기로 오지 않는다.
 */
export default function FeedDropPickupCard({ view }: { view: FeedCardView }) {
  const badges = (view.itemBadges ?? []).slice(0, FEED_DROP_PICKUP.max)
  const frame = dropPickupFrameOf(badges.length)
  const textColor = feedTextOnBg(view.look.colors.bg)
  return (
    <FeedCardShell view={view} minHeight={FEED_CARD_MIN_HEIGHT.drop_pickup} className="justify-between gap-4">
      <div className="relative w-full flex-none" style={{ aspectRatio: `${FEED_DROP_PICKUP.refWidth} / ${FEED_DROP_PICKUP.refHeight}` }}>
        {badges.map((badge, index) => {
          const spot = frame[index]
          return (
            <div
              key={index}
              data-drop-badge=""
              className="absolute flex items-center justify-center"
              style={{
                left: `${spot.x}%`,
                top: `${spot.y}%`,
                width: `${(spot.size / FEED_DROP_PICKUP.refWidth) * 100}%`,
                aspectRatio: '1 / 1',
                transform: `translate(-50%, -50%) rotate(${spot.tilt}deg)`,
                zIndex: index,
              }}
            >
              <SafeImage
                src={badge.imageUrl}
                alt={badge.name}
                width={spot.size}
                height={spot.size}
                className="h-full w-full object-contain"
                fallback={
                  <span
                    className="line-clamp-3 w-full px-1 text-center text-base font-black break-keep wrap-break-word"
                    style={{ color: textColor }}
                  >
                    {badge.name}
                  </span>
                }
              />
            </div>
          )
        })}
        <FeedStampLayer view={view} />
      </div>
      <FeedTextBlock view={view} />
      <FeedChipPlanLayer view={view} />
    </FeedCardShell>
  )
}
