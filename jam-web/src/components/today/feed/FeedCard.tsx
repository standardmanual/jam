import type { ComponentType } from 'react'
import type { FeedCardView } from '@/lib/today/cardView'
import type { RenderedFeedType } from '@/lib/today/feedLook'
import CardFrame from '../CardFrame'
import FeedBadgeIntroCard from './FeedBadgeIntroCard'
import FeedBadgeOnlyCard from './FeedBadgeOnlyCard'
import FeedFullImageCard from './FeedFullImageCard'
import FeedHeroBoxCard from './FeedHeroBoxCard'
import FeedTextBoxCard from './FeedTextBoxCard'

/**
 * 홈피드 개편 카드 조립 (티켓 20261121_0041, 상위 20261120_2026 4회차-2). 서버 컴포넌트(상호작용·모션 없음).
 *
 * `FeedCardView`의 `feedType`으로 유형별 컴포넌트를 고르고 카드 틀(`CardFrame`)로 감싼다. 카드 전체 링크·계측·눌림·포커스 윤곽선은 `CardFrame`이 건다(CTA 버튼은 없다).
 * 유형별 컴포넌트는 `FEED_RENDERED_TYPES`(`lib/today/feedLook.ts`)와 같은 키를 가진다 — 어떤 카드를 이 갈래로 보낼지는 `toCardView`가 같은 목록으로 이미 걸러 두므로,
 * 여기서는 목록에 없는 유형을 걸러 내지 않는다(둘이 어긋나면 카드가 사라진다). `full_image`는 `FEED_FULL_IMAGE_ENABLED`가 꺼져 있어 홈에서는 이 갈래로 오지 않고 Story만 그린다.
 */
const BY_TYPE: Record<RenderedFeedType, ComponentType<{ view: FeedCardView }>> = {
  hero_box: FeedHeroBoxCard,
  text_box: FeedTextBoxCard,
  badge_intro: FeedBadgeIntroCard,
  badge_only: FeedBadgeOnlyCard,
  full_image: FeedFullImageCard,
}

export default function FeedCard({ view }: { view: FeedCardView }) {
  const Body = BY_TYPE[view.feedType]
  return (
    <CardFrame view={view}>
      <Body view={view} />
    </CardFrame>
  )
}
