/**
 * 드랍·픽업 카드 `FeedDropPickupCard` (티켓 20261121_0115, 상위 20261120_2026 4회차-3)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `renderToStaticMarkup`으로 마크업 문자열을 단언한다.
 *
 * 확인하는 것: 구성(최소 높이 360·박스 줄 높이 184·칸 폭 3칸 기준·배지 80), 박스 모양을 아이템 방향으로 그림(외곽선 없음), 배지 1~3개, 이미지 없는 배지는 이름 글자,
 * 칩 한 개가 박스 줄 위(왼쪽 위 모서리에 걸침), 카드 전체 링크 하나, 설명 숨김, hex 없음.
 *
 * 실행: cd jam-web && npx vitest run src/components/today/__tests__/FeedDropPickupCard.test.tsx
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
import type { FeedCardView, FeedCardViewBadge } from '@/lib/today/cardView'
import { FEED_CARD_MIN_HEIGHT, FEED_DROP_PICKUP } from '@/lib/today/feedConstants'
import { resolveFeedLook, type FeedLookCard } from '@/lib/today/feedLook'

const NOW = new Date('2026-11-21T12:00:00+09:00')
const BADGES: FeedCardViewBadge[] = [
  { name: '레터링 펜', imageUrl: 'https://cdn.example/pen.png' },
  { name: '황동 카메라', imageUrl: 'https://cdn.example/camera.png' },
  { name: '비닐우산', imageUrl: 'https://cdn.example/umbrella.png' },
]

interface Options extends Partial<FeedLookCard> {
  badges?: FeedCardViewBadge[]
  description?: string
  tracking?: boolean
}

function dropView({ badges = BADGES, description, tracking, ...stored }: Options = {}): FeedCardView {
  const look = resolveFeedLook({
    card: { id: 'card-1', feed_type: 'drop_pickup', ...stored },
    feedType: 'drop_pickup',
    valueSource: { resource: 'drop_pickup' },
    now: NOW,
  })
  const view: FeedCardView = { resource: 'drop', title: '내겐 남는 것이\n누군가의 새것', feedType: 'drop_pickup', imageUrl: null, itemBadges: badges, look }
  if (description && look.showDescription) view.description = description
  if (tracking) {
    view.href = '/drops'
    view.tracking = { cardId: 'card-1', contentTypeId: null, templateType: 'drop_alert', shape: 'hero' }
  }
  return view
}

const render = (view: FeedCardView) => renderToStaticMarkup(<FeedCard view={view} />)
const count = (html: string, needle: string) => html.split(needle).length - 1

describe('드랍·픽업 — 구성', () => {
  it('최소 높이 360, 박스 줄 높이 184, 칸 폭은 3칸 기준, 배지 80×80이다', () => {
    const html = render(dropView({ description: '남는 배지는 드랍해 봐요.' }))
    expect(html).toContain(`min-height:${FEED_CARD_MIN_HEIGHT.drop_pickup}px`)
    expect(FEED_CARD_MIN_HEIGHT.drop_pickup).toBe(360)
    expect(html).toContain(`height:${FEED_DROP_PICKUP.rowHeight}px`)
    expect(FEED_DROP_PICKUP.rowHeight).toBe(184)
    expect(html).toContain('width:calc((100% - 16px) / 3)')
    expect(html).toContain('gap-2')
    expect(html).toContain('width="80"')
    expect(html).toContain('height="80"')
    expect(html).toContain('남는 배지는 드랍해 봐요.')
  })

  it('배지 3개가 박스에 담기고 박스 색은 색 변수다(외곽선 없음, hex 없음)', () => {
    const html = render(dropView({ box_color_key: 'ref-lime', box_shape: 'round' }))
    expect(count(html, 'background-color:var(--feed-ref-lime)')).toBe(3)
    for (const badge of BADGES) expect(html).toContain(badge.imageUrl as string)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}[;"']/)
    // 칩에만 외곽선(border-width)이 있다
    expect(count(html, 'border-width')).toBe(count(html, 'rounded-full'))
  })

  it('배지의 alt는 이름이다', () => {
    const html = render(dropView())
    for (const badge of BADGES) expect(html).toContain(`alt="${badge.name}"`)
  })

  it('박스 모양은 카드가 정한 모양을 아이템 방향으로 그린다(티켓은 마스크, 라운드는 모서리 클래스)', () => {
    expect(render(dropView({ box_shape: 'round' }))).toContain('rounded-xl')
    const ticket = render(dropView({ box_shape: 'ticket' }))
    expect(ticket).toContain('mask-image')
    // 반원 돌출은 아이템 방향이라 위·아래에 28px 바깥 여백이 생긴다
    expect(render(dropView({ box_shape: 'bump' }))).toContain('padding:28px 0px 28px 0px')
  })

  it('배지가 1~2개여도 있는 만큼 같은 칸 폭으로 그린다', () => {
    for (const n of [1, 2]) {
      const html = render(dropView({ badges: BADGES.slice(0, n), box_color_key: 'red-soft' }))
      expect(count(html, 'background-color:var(--jam-red-soft)')).toBe(n)
      expect(count(html, 'width:calc((100% - 16px) / 3)')).toBe(n)
    }
  })

  it('이미지가 없는 배지는 이름 글자로 대신한다(이미지 태그 없음)', () => {
    const html = render(dropView({ badges: [{ name: '이름만 있는 배지', imageUrl: null }] }))
    expect(html).not.toContain('<img')
    expect(html).toContain('이름만 있는 배지')
    expect(html).toContain('break-keep')
    expect(html).toContain('wrap-break-word')
  })
})

describe('드랍·픽업 — 칩·링크·설명', () => {
  it('칩은 박스 줄 위 한 개이고 왼쪽 위 모서리에 걸친다(큰 칩 40)', () => {
    const html = render(dropView({ chips: [{ kind: 'phrase', text: '드랍', slot: 'box-row-top' }] }))
    expect(count(html, 'rounded-full')).toBe(1)
    expect(html).toContain('드랍')
    expect(html).toContain('left:-12px')
    expect(html).toContain('top:-16px')
    expect(html).toContain('height:40px')
  })

  it('저장된 칩이 둘이어도 자리가 하나뿐이라 한 개만 그린다', () => {
    const html = render(
      dropView({
        chips: [
          { kind: 'phrase', text: '드랍' },
          { kind: 'phrase', text: '픽업' },
        ],
      }),
    )
    expect(count(html, 'rounded-full')).toBe(1)
  })

  it('칩 없음([])이면 칩이 없다', () => {
    expect(count(render(dropView({ chips: [] })), 'rounded-full')).toBe(0)
  })

  it('폭 320에서 칩이 카드 바깥으로 나가지 않는다(걸침 12 < 안쪽 여백 16)', () => {
    const html = render(dropView({ chips: [{ kind: 'phrase', text: '드랍', slot: 'box-row-top' }] }))
    const left = Number(/left:(-?\d+)px/.exec(html.slice(html.indexOf('z-10')))?.[1])
    expect(Math.abs(left)).toBeLessThan(16)
  })

  it('설명 숨김이면 설명이 없다', () => {
    expect(render(dropView({ description: '남는 배지는 드랍해 봐요.', show_description: false }))).not.toContain('남는 배지는 드랍해 봐요.')
  })

  it('계측 정보가 있으면 카드 전체 링크가 하나이고 클릭을 기록한다', () => {
    const html = render(dropView({ tracking: true }))
    expect(count(html, '<a ')).toBe(1)
    expect(html).toContain('href="/drops"')
    expect(html).toContain('data-track-click="true"')
  })

  it('계측 정보가 없으면(미리보기) 링크·트래커가 없다', () => {
    const html = render(dropView())
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('data-tracker')
  })
})
