/**
 * 박스를 그리는 유형 상수(`BOX_FEED_TYPES`·`BOX_KIND_FEED_TYPES`)와 홈 컴포넌트의 일치 (티켓 20261121_2113, 상위 20261120_2026)
 *
 * 어드민 「카드 모양」 섹션은 상수로 박스 칸을 보일지 정하고, 홈은 유형별 컴포넌트가 `FeedBox`를 그린다. 둘이 어긋나면 어드민에는 없는 칸에 값이 저장되거나
 * 있는 칸이 숨는다. 유형 8개를 각각 그려 박스(마스크가 걸리는 면)가 그려지는 유형이 상수와 같은지 대조한다.
 * 박스 모양은 마스크가 걸리는 `ticket`으로 고정한다(라운드는 마스크가 없을 수 있어 표식이 되지 않는다).
 *
 * 실행: cd jam-web && npx vitest run src/components/today/__tests__/FeedCard.boxTypes.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from '@/lib/testing/renderStable'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/today/TodayCardTracker', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

import FeedCard from '../feed/FeedCard'
import type { FeedCardView } from '@/lib/today/cardView'
import { BOX_FEED_TYPES, BOX_KIND_FEED_TYPES, FEED_TYPES } from '@/lib/today/feedChipSlots'
import { resolveFeedLook, type FeedLookCard, type RenderedFeedType } from '@/lib/today/feedLook'
import type { FeedValueChipSource } from '@/lib/today/feedValueChips'

const NOW = new Date('2026-11-21T12:00:00+09:00')
const MISSION: FeedValueChipSource = { resource: 'mission', endsAt: '2026-11-23T12:00:00+09:00', rewardPoints: 300 }
const BADGE = { name: '아침 러너', imageUrl: 'https://cdn.example/badge.png' }

function view(feedType: RenderedFeedType, stored: Partial<FeedLookCard> = {}): FeedCardView {
  const look = resolveFeedLook({
    card: { id: 'card-1', feed_type: feedType, box_shape: 'ticket', ...stored },
    feedType,
    valueSource: MISSION,
    now: NOW,
  })
  return {
    resource: 'mission',
    title: '낙엽 소리 따라\n걷는 한 주',
    feedType,
    imageUrl: 'https://cdn.example/cover.png',
    badgeImageUrl: BADGE.imageUrl,
    badgeName: BADGE.name,
    collectionName: '가을 컬렉션',
    collectionBadges: [BADGE, BADGE],
    itemBadges: [BADGE, BADGE, BADGE],
    listItems: [{ name: '코스 하나', href: '/missions/1', imageUrl: null }],
    look,
  }
}

const drawsBox = (html: string) => /mask-image/i.test(html)
const render = (v: FeedCardView) => renderToStaticMarkup(<FeedCard view={v} />)

describe('박스를 그리는 유형 상수와 홈 컴포넌트의 일치', () => {
  it('유형 8개 중 박스가 그려지는 유형이 BOX_FEED_TYPES와 같다', () => {
    const drawn = FEED_TYPES.filter((type) => drawsBox(render(view(type))))
    expect([...drawn].sort()).toEqual([...BOX_FEED_TYPES].sort())
  })

  it('박스 용도를 고르는 유형(BOX_KIND_FEED_TYPES)은 박스 유형의 부분집합이다', () => {
    for (const type of BOX_KIND_FEED_TYPES) expect(BOX_FEED_TYPES).toContain(type)
  })

  it('박스 유형은 박스 용도가 글자 박스든 이미지 마스크든 박스를 그린다', () => {
    for (const type of BOX_FEED_TYPES) {
      for (const boxKind of ['text', 'image_mask'] as const) {
        expect(drawsBox(render(view(type, { box_kind: boxKind })))).toBe(true)
      }
    }
  })
})
