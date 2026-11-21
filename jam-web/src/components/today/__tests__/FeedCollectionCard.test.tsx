/**
 * 컬렉션 소개 카드 `FeedCollectionCard` (티켓 20261121_0115, 상위 20261120_2026 4회차-3)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `renderToStaticMarkup`으로 서버가 내보내는 기본 HTML을 단언한다 — 모션 래퍼의 스크립트 동작은
 * `FeedCollectionBurst.test.tsx`가 맡는다. 여기서는 «기본 HTML이 퍼진 모습인가»를 본다.
 *
 * 확인하는 것: 구성(최소 높이 416·영역 높이 240·대표 그림 168·`alt`는 컬렉션 이름), 기본 HTML은 퍼진 모습(불투명도 1·전환 없음·배지 `aria-hidden`·`alt=""`),
 * 배지 0~4개(0개면 모션 래퍼 없이 대표 그림만), 작은 칩 하나가 그림 모서리에 걸침, 설명 숨김, 폭 320 한도, hex 없음.
 *
 * 실행: cd jam-web && npx vitest run src/components/today/__tests__/FeedCollectionCard.test.tsx
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
  default: ({ cardId, trackClick, children }: { cardId: string; trackClick?: boolean; children: ReactNode }) => (
    <div data-tracker={cardId} data-track-click={String(trackClick ?? true)}>
      {children}
    </div>
  ),
}))

import FeedCard from '../feed/FeedCard'
import type { FeedCardView } from '@/lib/today/cardView'
import { FEED_BURST, FEED_CARD_MIN_HEIGHT } from '@/lib/today/feedConstants'
import { resolveFeedLook, type FeedLookCard } from '@/lib/today/feedLook'

const NOW = new Date('2026-11-21T12:00:00+09:00')
const BADGES = [1, 2, 3, 4].map((n) => ({ name: `아이템 ${n}`, imageUrl: `https://cdn.example/b${n}.png` }))

interface Options extends Partial<FeedLookCard> {
  badgeCount?: number
  description?: string
  imageUrl?: string | null
  tracking?: boolean
}

function collectionView(options: Options = {}): FeedCardView {
  const { badgeCount = 4, description, imageUrl = 'https://cdn.example/art.png', tracking, ...stored } = options
  const look = resolveFeedLook({
    card: { id: 'card-1', feed_type: 'collection_intro', ...stored },
    feedType: 'collection_intro',
    valueSource: { resource: 'collection', itemCount: 12 },
    now: NOW,
  })
  const view: FeedCardView = {
    resource: 'collection',
    title: '골목길 필름 스냅',
    feedType: 'collection_intro',
    imageUrl,
    collectionName: '골목길 필름 스냅',
    look,
  }
  if (badgeCount > 0) view.collectionBadges = BADGES.slice(0, badgeCount)
  if (description && look.showDescription) view.description = description
  if (tracking) {
    view.href = '/collections/book-1'
    view.tracking = { cardId: 'card-1', contentTypeId: null, templateType: 'itembook_milestone', shape: 'hero' }
  }
  return view
}

const render = (view: FeedCardView) => renderToStaticMarkup(<FeedCard view={view} />)
const count = (html: string, needle: string) => html.split(needle).length - 1

describe('컬렉션 소개 — 구성', () => {
  it('카드 면(최소 높이를 가진 요소)이 카드 루트 표식을 달고 있어 모션 래퍼가 카드 전체를 관찰한다', () => {
    for (const badgeCount of [0, 4]) {
      const html = render(collectionView({ badgeCount }))
      expect(count(html, 'data-feed-card-root')).toBe(1)
      // 표식은 카드 면(배경색·최소 높이) 요소에 있다
      expect(html).toMatch(/<div class="relative flex flex-col rounded-2xl p-4[^"]*" style="[^"]*min-height:416px[^"]*" data-feed-card-root="">/)
    }
  })

  it('최소 높이 416, 영역 높이 240, 대표 그림 168×168(object-contain)이고 alt는 컬렉션 이름이다', () => {
    const html = render(collectionView({ description: '활판 골목 끝 현상소.' }))
    expect(html).toContain(`min-height:${FEED_CARD_MIN_HEIGHT.collection_intro}px`)
    expect(FEED_CARD_MIN_HEIGHT.collection_intro).toBe(416)
    expect(html).toContain('height:240px')
    expect(html).toContain('width:168px;height:168px')
    expect(html).toContain('alt="골목길 필름 스냅"')
    expect(html).toContain('object-contain')
    expect(html).toContain('활판 골목 끝 현상소.')
  })

  it('설명 숨김(show_description=false)이면 설명 문단이 없다', () => {
    expect(render(collectionView({ description: '활판 골목 끝 현상소.', show_description: false }))).not.toContain('활판 골목 끝 현상소.')
  })

  it('색은 변수만 쓰고(hex 없음) 카드 면에 외곽선이 없다', () => {
    const html = render(collectionView({ bg_color_key: 'blue-soft' }))
    expect(html).toContain('background-color:var(--feed-color-blue-soft, var(--jam-blue-soft))')
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}[;"']/)
  })

  it('칩은 작은 칩 하나 이상이 그림 모서리에 걸치고 폭 320에서 카드 안쪽 여백(16) 안에 있다', () => {
    const view = collectionView({ chips: [{ kind: 'phrase', text: '컬렉션', slot: 'art-top-left' }] })
    const html = render(view)
    expect(count(html, 'rounded-full')).toBe(1)
    expect(html).toContain('컬렉션')
    // 걸침 한도: 가로 12 < 안쪽 여백 16이고 앵커(그림)가 가운데에 있어 카드 바깥으로 나가지 않는다
    expect(html).toContain('left:-12px')
    expect(html).toContain('top:-16px')
    // 칩 크기는 작은 칩(높이 32)이다
    expect(html).toContain('height:32px')
    expect(html).not.toContain('height:40px')
  })

  it('칩이 둘이어도 모두 작은 칩이다', () => {
    const view = collectionView({
      chips: [
        { kind: 'phrase', text: '아이템 12개', slot: 'art-top-left' },
        { kind: 'label', text: '컬렉션', slot: 'art-bottom-right' },
      ],
    })
    const html = render(view)
    expect(count(html, 'rounded-full')).toBe(2)
    expect(html).not.toContain('height:40px')
  })

  it('계측 정보가 있으면 카드 전체 링크가 하나이고 클릭을 기록한다(목록형과 달리 일반 카드)', () => {
    const html = render(collectionView({ tracking: true }))
    expect(count(html, '<a ')).toBe(1)
    expect(html).toContain('href="/collections/book-1"')
    expect(html).toContain('data-track-click="true"')
  })
})

describe('컬렉션 소개 — 기본 HTML은 퍼진 모습', () => {
  it('배지 4개가 퍼진 모습(불투명도 1·스케일 1·전환 없음)으로 나온다', () => {
    const view = collectionView({ badgeCount: 4 })
    const html = render(view)
    expect(count(html, 'aria-hidden="true"')).toBeGreaterThanOrEqual(4)
    for (const badge of BADGES) expect(html).toContain(badge.imageUrl)
    expect(count(html, 'opacity:1')).toBe(4)
    expect(count(html, 'scale(1)')).toBe(4)
    expect(count(html, 'transition:none')).toBe(4)
    expect(html).not.toContain('scale(0.3)')
    expect(html).not.toContain('opacity:0')
    // 퍼진 자리는 영역 크기에 비례(cqw·cqh)하고 배지마다 look.burst의 값이다
    expect(count(html, '50cqw')).toBe(4)
    view.look.burst?.slice(0, 4).forEach((point) => {
      expect(html).toContain(`width:${point.size}px;height:${point.size}px`)
      expect(html).toContain(`rotate(${point.tilt}deg)`)
    })
    expect(html).toContain('container-type:size')
  })

  it('배지는 장식이다: alt가 비어 있고 aria-hidden이며 대표 그림만 이름을 말한다', () => {
    const html = render(collectionView({ badgeCount: 4 }))
    expect(count(html, 'alt=""')).toBe(4)
    expect(html).not.toContain('alt="아이템')
    expect(html).toContain('alt="골목길 필름 스냅"')
  })

  it('transform·opacity 말고는 움직이지 않는다(전환 속성이 없거나 transform·opacity뿐)', () => {
    const html = render(collectionView())
    expect(html).not.toMatch(/(?:left|top|width|height)\s+[\d.]+s/)
  })

  it('배지가 4개 미만이면 있는 만큼만 그린다', () => {
    for (const badgeCount of [1, 2, 3]) {
      const html = render(collectionView({ badgeCount }))
      expect(count(html, '50cqw')).toBe(badgeCount)
    }
    expect(FEED_BURST.count).toBe(4)
  })

  it('배지가 0개면 모션 래퍼 없이 대표 그림만 그린다', () => {
    const html = render(collectionView({ badgeCount: 0 }))
    expect(html).not.toContain('container-type')
    expect(html).not.toContain('50cqw')
    expect(html).toContain('art.png')
    expect(html).toContain('height:240px')
  })

  it('저장된 collection_burst를 그린다', () => {
    const html = render(collectionView({ badgeCount: 1, collection_burst: [{ x: 0.5, y: -0.25, tilt: 5, size: 70, delay_ms: 90 }] }))
    expect(html).toContain('translate(calc(0.5 * 50cqw), calc(-0.25 * 50cqh)) rotate(5deg) scale(1)')
    expect(html).toContain('width:70px;height:70px')
    expect(html).toContain('transition:none')
  })

  it('그림 주소가 없는 배지는 그리지 않는다', () => {
    const view = collectionView({ badgeCount: 2 })
    view.collectionBadges = [{ name: '그림 없음', imageUrl: null as unknown as string }, BADGES[0]]
    expect(count(render(view), '50cqw')).toBe(1)
  })
})
