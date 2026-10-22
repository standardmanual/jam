/**
 * `TodayCard` — 모양 선택과 새 틀이 그리는 모양 목록 (티켓 20261001_1458, 상위 20260930_1453 b2)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `renderToStaticMarkup`으로 확인한다.
 * 트래커는 표식 div로 바꿔 「그려졌는가」로 확인한다(`CardFrame.test.tsx`와 같은 방식).
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'

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

import TodayCard, { RENDERED_SHAPES, isRenderedShape } from '../TodayCard'
import { CARD_SHAPES } from '@/lib/today/shape'
import type { CardView, ImageCardView, ListCardView } from '@/lib/today/cardView'

const TRACKING = { cardId: 'card-1', contentTypeId: 'T05', templateType: 'drop_alert', shape: 'brief' } as const

const briefView = (overrides: Partial<Extract<CardView, { shape: 'brief' }>> = {}): CardView => ({
  shape: 'brief',
  resource: 'drop',
  title: '한강 번개 드랍',
  label: '드랍',
  ...overrides,
})

const heroView = (overrides: Partial<ImageCardView> = {}): CardView => ({
  shape: 'hero',
  resource: 'mission',
  title: '한강 러닝 챌린지',
  label: '미션',
  imageUrl: null,
  ...overrides,
})

const squareView = (overrides: Partial<ImageCardView> = {}): CardView => ({
  shape: 'square',
  resource: 'mission',
  title: '한강 러닝 챌린지',
  label: '미션',
  imageUrl: null,
  ...overrides,
})

const listView = (overrides: Partial<ListCardView> = {}): CardView => ({
  shape: 'list',
  resource: 'badge',
  title: '성수동 배지 모음',
  label: '배지 소개',
  tiles: [
    { name: '성수동 탐험가', imageUrl: null, earned: true },
    { name: '한강 러너', imageUrl: null, earned: false },
  ],
  ...overrides,
})

const rankingView = (overrides: Partial<ListCardView> = {}): CardView =>
  listView({
    resource: 'ranking',
    title: '이번 주 러너 순위',
    label: '랭킹보드',
    tiles: [],
    ranking: {
      metricType: 'mission_progress',
      missionType: null,
      conditionFieldKey: null,
      totalParticipants: 2,
      entries: [
        { userId: 'u1', displayName: '가', username: 'runner1', avatarUrl: null, value: 10, rank: 1 },
        { userId: 'u2', displayName: '나', username: 'runner2', avatarUrl: null, value: 5, rank: 2 },
      ],
    },
    ...overrides,
  })

const posterView = (overrides: Partial<ImageCardView> = {}): CardView => ({
  shape: 'poster',
  resource: 'collection',
  title: '새 아이템이 열렸어요',
  label: '컬렉션',
  imageUrl: null,
  ...overrides,
})

describe('RENDERED_SHAPES — 새 틀이 그리는 모양 목록', () => {
  it('일곱 모양 전부다: brief·hero·poster·square·list·dome·ticket', () => {
    expect([...RENDERED_SHAPES]).toEqual(['brief', 'hero', 'poster', 'square', 'list', 'dome', 'ticket'])
  })

  it('카드 모양 7개와 같은 집합이다(저장될 수 있는 모든 모양을 새 틀이 그린다)', () => {
    expect([...RENDERED_SHAPES].sort()).toEqual([...CARD_SHAPES].sort())
  })

  it('모든 항목이 카드 모양 7개 안의 값이다', () => {
    for (const shape of RENDERED_SHAPES) expect(CARD_SHAPES).toContain(shape)
  })

  it('isRenderedShape: 목록의 모양만 true다', () => {
    expect(isRenderedShape('brief')).toBe(true)
    expect(isRenderedShape('hero')).toBe(true)
    expect(isRenderedShape('poster')).toBe(true)
    expect(isRenderedShape('square')).toBe(true)
    expect(isRenderedShape('list')).toBe(true)
    expect(isRenderedShape('dome')).toBe(true)
    expect(isRenderedShape('ticket')).toBe(true)
    for (const shape of CARD_SHAPES.filter((s) => !(RENDERED_SHAPES as readonly string[]).includes(s))) {
      expect(isRenderedShape(shape)).toBe(false)
    }
    for (const value of ['large_thumbnail', 'Brief', ' brief', '', null, undefined, 1]) expect(isRenderedShape(value)).toBe(false)
  })
})

describe('TodayCard — 모양으로 모양 컴포넌트를 고른다', () => {
  it('brief는 짧은 소식 모양으로 그린다', () => {
    const html = renderToStaticMarkup(<TodayCard view={briefView()} />)
    expect(html).toContain('min-h-[88px]')
    expect(html).toContain('한강 번개 드랍')
  })

  it('hero는 큰 이미지 모양으로 그린다(16:9 이미지 칸 + 흰 본문)', () => {
    const html = renderToStaticMarkup(<TodayCard view={heroView()} />)
    expect(html).toContain('relative aspect-video overflow-hidden bg-background')
    expect(html).toContain('<h3')
    expect(html).toContain('한강 러닝 챌린지')
    expect(html).not.toContain('min-h-[88px]')
  })

  it('poster는 포스터 모양으로 그린다(4:5 이미지 칸 + 아래 막 위 글자)', () => {
    const html = renderToStaticMarkup(<TodayCard view={posterView()} />)
    expect(html).toContain('relative aspect-[4/5] overflow-hidden bg-background')
    expect(html).toContain('absolute inset-x-0 bottom-0')
    expect(html).toContain('<h3')
    expect(html).toContain('새 아이템이 열렸어요')
    expect(html).not.toContain('min-h-[88px]')
    expect(html).not.toContain('aspect-video')
  })

  it('square는 정사각 큰 카드 모양으로 그린다(1:1 이미지 칸 + 흰 본문, 이미지는 자르지 않는다)', () => {
    const html = renderToStaticMarkup(<TodayCard view={squareView({ imageUrl: 'https://cdn.example/c.png' })} />)
    expect(html).toContain('relative aspect-square overflow-hidden bg-background')
    expect(html).toContain('object-contain')
    expect(html).not.toContain('object-cover')
    expect(html).toContain('<h3')
    expect(html).toContain('한강 러닝 챌린지')
    expect(html).not.toContain('min-h-[88px]')
    expect(html).not.toContain('aspect-video')
  })

  it('list는 목록 모양으로 그린다(타일형: 타일 줄 + 전체 보기 끝 줄)', () => {
    const html = renderToStaticMarkup(<TodayCard view={listView({ href: '/badges' })} />)
    expect(html).toContain('<ul class="flex w-max gap-2">')
    expect(html).toContain('<h3')
    expect(html).toContain('성수동 배지 모음')
    expect(html).toContain('전체 보기')
    expect(html).not.toContain('min-h-[88px]')
    expect(html).not.toContain('aspect-video')
  })

  it('모르는 모양은 그리지 않는다', () => {
    const unknown = { ...briefView(), shape: 'carousel' } as unknown as CardView
    expect(renderToStaticMarkup(<TodayCard view={unknown} />)).toBe('')
  })

  it('계측 정보와 href가 있으면 틀이 트래커·링크를 걸고 눌림은 한 곳에만 있으며 끝에 ›가 보인다', () => {
    const html = renderToStaticMarkup(<TodayCard view={briefView({ href: '/drops', tracking: TRACKING })} />)
    expect(html).toContain('data-tracker="card-1"')
    expect(html).toContain('<a ')
    expect(html.match(/jam-press/g)).toHaveLength(1)
    expect(html).toContain('›')
  })

  it('계측 정보가 없으면(미리보기) 링크·트래커·눌림이 없고, href가 있으면 ›만 보인다', () => {
    const html = renderToStaticMarkup(<TodayCard view={briefView({ href: '/drops' })} />)
    expect(html).not.toContain('<a')
    expect(html).not.toContain('data-tracker')
    expect(html).not.toContain('jam-press')
    expect(html).toContain('aria-hidden="true">›</span>')
  })

  it('href가 없으면 ›도 없다', () => {
    expect(renderToStaticMarkup(<TodayCard view={briefView()} />)).not.toContain('›')
  })
})

describe('TodayCard — hero의 접근·계측 틀', () => {
  const HERO_TRACKING = { cardId: 'card-2', contentTypeId: 'T01', templateType: 'mission_spotlight', shape: 'hero' } as const

  it('계측 정보와 href가 있으면 틀이 트래커·링크를 걸고 눌림은 한 곳에만 있으며 끝 줄이 보인다', () => {
    const html = renderToStaticMarkup(<TodayCard view={heroView({ href: '/missions/m1', tracking: HERO_TRACKING })} />)
    expect(html).toContain('data-tracker="card-2"')
    expect(html).toContain('<a ')
    expect(html).toContain('href="/missions/m1"')
    expect(html.match(/jam-press/g)).toHaveLength(1)
    expect(html).toContain('자세히 보기')
  })

  it('계측 정보가 없으면(미리보기) 링크·트래커·눌림이 없고, href가 있으면 끝 줄만 보인다', () => {
    const html = renderToStaticMarkup(<TodayCard view={heroView({ href: '/missions/m1' })} />)
    expect(html).not.toContain('<a')
    expect(html).not.toContain('data-tracker')
    expect(html).not.toContain('jam-press')
    expect(html).toContain('자세히 보기')
  })

  it('href가 없으면 끝 줄도 없다', () => {
    expect(renderToStaticMarkup(<TodayCard view={heroView()} />)).not.toContain('자세히 보기')
  })

  it('포커스 윤곽선이 잘리지 않게 overflow-hidden은 링크 안쪽 면(Card)에만 있다', () => {
    const html = renderToStaticMarkup(<TodayCard view={heroView({ href: '/missions/m1', tracking: HERO_TRACKING })} />)
    expect(html.slice(0, html.indexOf('overflow-hidden'))).toContain('jam-press')
  })
})

describe('TodayCard — poster의 접근·계측 틀', () => {
  const POSTER_TRACKING = { cardId: 'card-3', contentTypeId: 'T04', templateType: 'itembook_milestone', shape: 'poster' } as const

  it('계측 정보와 href가 있으면 틀이 트래커·링크를 걸고 눌림은 한 곳에만 있다(끝 줄은 없다)', () => {
    const html = renderToStaticMarkup(<TodayCard view={posterView({ href: '/collections/c1', tracking: POSTER_TRACKING })} />)
    expect(html).toContain('data-tracker="card-3"')
    expect(html).toContain('<a ')
    expect(html).toContain('href="/collections/c1"')
    expect(html.match(/jam-press/g)).toHaveLength(1)
    expect(html).not.toContain('자세히 보기')
  })

  it('계측 정보가 없으면(미리보기) 링크·트래커·눌림이 없고, href가 있어도 끝 줄이 없다', () => {
    const html = renderToStaticMarkup(<TodayCard view={posterView({ href: '/collections/c1' })} />)
    expect(html).not.toContain('<a')
    expect(html).not.toContain('data-tracker')
    expect(html).not.toContain('jam-press')
    expect(html).not.toContain('자세히 보기')
    expect(html).not.toContain('→')
  })

  it('포커스 윤곽선이 잘리지 않게 overflow-hidden은 링크 안쪽 면(Card)에만 있다', () => {
    const html = renderToStaticMarkup(<TodayCard view={posterView({ href: '/collections/c1', tracking: POSTER_TRACKING })} />)
    expect(html.slice(0, html.indexOf('overflow-hidden'))).toContain('jam-press')
    // 막이 absolute라 카드(Card)가 relative다 — 링크(block)는 relative가 아니다
    expect(html.slice(0, html.indexOf('relative'))).toContain('jam-press')
  })
})

describe('TodayCard — square의 접근·계측 틀', () => {
  const SQUARE_TRACKING = { cardId: 'card-4', contentTypeId: 'T01', templateType: 'mission_spotlight', shape: 'square' } as const

  it('계측 정보와 href가 있으면 틀이 트래커·링크를 걸고 눌림은 한 곳에만 있다(끝 줄은 없다)', () => {
    const html = renderToStaticMarkup(<TodayCard view={squareView({ href: '/missions/m1', tracking: SQUARE_TRACKING })} />)
    expect(html).toContain('data-tracker="card-4"')
    expect(html).toContain('<a ')
    expect(html).toContain('href="/missions/m1"')
    expect(html.match(/jam-press/g)).toHaveLength(1)
    expect(html).not.toContain('자세히 보기')
  })

  it('계측 정보가 없으면(미리보기) 링크·트래커·눌림이 없고, href가 있어도 끝 줄이 없다', () => {
    const html = renderToStaticMarkup(<TodayCard view={squareView({ href: '/missions/m1' })} />)
    expect(html).not.toContain('<a')
    expect(html).not.toContain('data-tracker')
    expect(html).not.toContain('jam-press')
    expect(html).not.toContain('자세히 보기')
    expect(html).not.toContain('→')
  })

  it('포커스 윤곽선이 잘리지 않게 overflow-hidden은 링크 안쪽 면(Card)에만 있다', () => {
    const html = renderToStaticMarkup(<TodayCard view={squareView({ href: '/missions/m1', tracking: SQUARE_TRACKING })} />)
    expect(html.slice(0, html.indexOf('overflow-hidden'))).toContain('jam-press')
  })
})

describe('TodayCard — list의 접근·계측 틀', () => {
  const LIST_TRACKING = { cardId: 'card-5', contentTypeId: 'T03', templateType: 'badge_spotlight', shape: 'list' } as const
  const RANKING_TRACKING = { cardId: 'card-6', contentTypeId: 'T08', templateType: 'ranking_board', shape: 'list' } as const

  it('타일형: 카드 전체가 하나의 링크이고 눌림은 한 곳에만 있으며 클릭도 기록한다', () => {
    const html = renderToStaticMarkup(<TodayCard view={listView({ href: '/badges', tracking: LIST_TRACKING })} />)
    expect(html).toContain('data-tracker="card-5"')
    expect(html).toContain('data-track-click="true"')
    expect(html.match(/<a /g)).toHaveLength(1)
    expect(html).toContain('href="/badges"')
    expect(html.match(/jam-press/g)).toHaveLength(1)
    expect(html).toContain('전체 보기')
  })

  it('타일형 미리보기(tracking 없음): 링크·트래커·눌림이 없고 href가 있으면 끝 줄만 보인다', () => {
    const html = renderToStaticMarkup(<TodayCard view={listView({ href: '/badges' })} />)
    expect(html).not.toContain('<a')
    expect(html).not.toContain('data-tracker')
    expect(html).not.toContain('jam-press')
    expect(html).toContain('전체 보기')
  })

  it('타일형은 href가 없으면 링크도 끝 줄도 없다(트래커는 노출을 위해 남는다)', () => {
    const html = renderToStaticMarkup(<TodayCard view={listView({ tracking: LIST_TRACKING })} />)
    expect(html).toContain('data-tracker="card-5"')
    expect(html).not.toContain('<a')
    expect(html).not.toContain('jam-press')
    expect(html).not.toContain('전체 보기')
  })

  it('행형: 카드 전체 링크가 없다 — 트래커는 노출만 기록한다(trackClick=false)', () => {
    const html = renderToStaticMarkup(
      <TodayCard view={rankingView({ href: '/missions/m1/status', tracking: RANKING_TRACKING })} currentUserId="u2" />,
    )
    expect(html).toContain('data-tracker="card-6"')
    expect(html).toContain('data-track-click="false"')
    // 카드 전체를 감싸는 링크가 없다: 트래커 바로 안쪽은 흰 카드 면이다
    expect(html).toMatch(/<div data-tracker="card-6" data-track-click="false"><div class="[^"]*" style="[^"]*">/)
  })

  it('행형 미리보기(tracking 없음): 링크·트래커·눌림이 모두 없다(행 링크도 없다)', () => {
    const html = renderToStaticMarkup(<TodayCard view={rankingView({ href: '/missions/m1/status' })} currentUserId="u2" />)
    expect(html).not.toContain('<a')
    expect(html).not.toContain('data-tracker')
    expect(html).not.toContain('jam-press')
  })

  it('currentUserId는 list에서만 쓰인다 — 다른 모양에 넘겨도 출력이 같다', () => {
    for (const view of [briefView(), heroView(), posterView(), squareView()]) {
      expect(renderToStaticMarkup(<TodayCard view={view} currentUserId="u2" />)).toBe(renderToStaticMarkup(<TodayCard view={view} />))
    }
  })
})
