import SafeImage from '@/components/SafeImage'
import type { FeedCardView } from '@/lib/today/cardView'
import { FEED_BURST, FEED_CARD_MIN_HEIGHT } from '@/lib/today/feedConstants'
import FeedCollectionBurst, { type FeedBurstBadge } from './FeedCollectionBurst'
import { FeedCardShell, FeedChipPlanLayer, FeedStampLayer, FeedTextBlock } from './FeedCardParts'

/**
 * 컬렉션 소개(`collection_intro`) — 위 영역(높이 240) 가운데에 대표 그림 168×168, 그 뒤에서 아이템 배지 4개가 퍼지고, 아래에 제목(컬렉션 이름)과 설명 (티켓 20261121_0115).
 *
 * 샘플: 카드 최소 높이 416, 안쪽 여백 16. 대표 그림은 카드의 커버(`imageUrl`, 없으면 이 카드는 옛 경로로 간다)이고 `alt`는 컬렉션 이름이다. 칩은 카드 모서리에 걸쳐 계획(`look.chipPlan`)대로 놓인다(`FeedChipPlanLayer`, 칩 층은 모션 래퍼 바깥의 카드 셸 직계이고 계획이 퍼진 배지 자리·대표 그림 가운데·글자를 피한다). 도장은 대표 그림 모서리 안쪽이다.
 * 배지는 `look.burst`의 앞에서부터 배지 수만큼 쓴다(4개 미만이면 있는 만큼). 배지가 0개면 모션 래퍼 없이 대표 그림만 그린다(서버 컴포넌트). 모션은 `FeedCollectionBurst`(`'use client'`)가 맡고, 카드 면에 단 루트 표식(`markRoot`)을 그 래퍼가 찾아 카드 전체를 관찰한다.
 */

const ART_STYLE = { width: FEED_BURST.artSize, height: FEED_BURST.artSize }

export default function FeedCollectionCard({
  view,
  previewPhase,
}: {
  view: FeedCardView
  /** Story 전용: 모션 래퍼를 «모인»·«퍼진» 모습으로 고정한다. 조립(`FeedCard`)은 주지 않는다. */
  previewPhase?: 'collected' | 'spread'
}) {
  const placements = view.look.burst ?? []
  const badges: FeedBurstBadge[] = (view.collectionBadges ?? [])
    .slice(0, FEED_BURST.count)
    .flatMap((badge, index) => {
      const placement = placements[index]
      return badge.imageUrl && placement ? [{ imageUrl: badge.imageUrl, ...placement }] : []
    })

  const art = (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={ART_STYLE}>
      <SafeImage
        src={view.imageUrl}
        alt={view.collectionName ?? ''}
        width={FEED_BURST.artSize}
        height={FEED_BURST.artSize}
        className="h-full w-full object-contain"
      />
      <FeedStampLayer view={view} />
    </div>
  )

  return (
    <FeedCardShell view={view} minHeight={FEED_CARD_MIN_HEIGHT.collection_intro} markRoot className="justify-between gap-4">
      {badges.length > 0 ? (
        <FeedCollectionBurst badges={badges} previewPhase={previewPhase}>
          {art}
        </FeedCollectionBurst>
      ) : (
        <div className="relative flex-none" style={{ height: FEED_BURST.areaHeight }}>
          {art}
        </div>
      )}
      <FeedTextBlock view={view} />
      <FeedChipPlanLayer view={view} />
    </FeedCardShell>
  )
}
