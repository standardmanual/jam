/**
 * 홈피드 개편 카드 `FeedCard`와 다섯 유형 (티켓 20261121_0041, 상위 20261120_2026 4회차-2)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `renderToStaticMarkup`으로 마크업 문자열을 단언한다.
 * 트래커는 표식 div로 바꿔 «그려졌는가·클릭 기록 여부»로 확인한다(`TodayCard.test.tsx`와 같은 방식).
 *
 * 확인하는 것: 유형별 구성(설명 숨김·칩 개수·제목 속 칩·도장 한 개·`aria-hidden`), 카드 전체 링크 하나·CTA 없음, 이미지 없음, 새 갈래가 `TodayCard`로 가는지,
 * hex 없이 색 변수만 쓰는지.
 *
 * 실행: cd jam-web && npx vitest run src/components/today/__tests__/FeedCard.test.tsx
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
import TodayCard from '../TodayCard'
import type { FeedCardView } from '@/lib/today/cardView'
import { FEED_CARD_MIN_HEIGHT, FEED_FULL_IMAGE_SCRIM } from '@/lib/today/feedConstants'
import { resolveFeedLook, type FeedLookCard, type RenderedFeedType } from '@/lib/today/feedLook'
import type { FeedValueChipSource } from '@/lib/today/feedValueChips'

const NOW = new Date('2026-11-21T12:00:00+09:00')
const MISSION: FeedValueChipSource = { resource: 'mission', endsAt: '2026-11-23T12:00:00+09:00', rewardPoints: 300 }

interface Options extends Partial<FeedLookCard> {
  title?: string
  description?: string
  imageUrl?: string | null
  badgeImageUrl?: string | null
  badgeName?: string
  href?: string
  tracking?: boolean
}

function feedView(feedType: RenderedFeedType, options: Options = {}): FeedCardView {
  const { title = '낙엽 소리 따라\n걷는 한 주', description, imageUrl = 'https://cdn.example/cover.png', badgeImageUrl, badgeName, href, tracking, ...stored } = options
  const look = resolveFeedLook({ card: { id: 'card-1', feed_type: feedType, ...stored }, feedType, valueSource: MISSION, now: NOW })
  const view: FeedCardView = { resource: 'mission', title, feedType, imageUrl, look }
  if (description && look.showDescription) view.description = description
  if (badgeImageUrl) view.badgeImageUrl = badgeImageUrl
  if (badgeName) view.badgeName = badgeName
  if (href) view.href = href
  if (tracking) view.tracking = { cardId: 'card-1', contentTypeId: null, templateType: 'mission_spotlight', feedType }
  return view
}

const render = (view: FeedCardView) => renderToStaticMarkup(<FeedCard view={view} />)
const count = (html: string, needle: string) => html.split(needle).length - 1

const TWO_CHIPS = [
  { kind: 'phrase' as const, text: '이번 주 미션' },
  { kind: 'label' as const, text: '아이템 배지' },
]

describe('FeedCard — 공통', () => {
  it('카드 전체 링크는 CardFrame이 하나만 걸고 CTA 버튼은 없다', () => {
    const html = render(feedView('hero_box', { href: '/missions/m1', tracking: true }))
    expect(count(html, '<a ')).toBe(1)
    expect(html).toContain('href="/missions/m1"')
    expect(html).not.toContain('<button')
  })

  it('계측 정보가 없으면(미리보기) 링크·트래커가 없다', () => {
    const html = render(feedView('hero_box', { href: '/missions/m1' }))
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('data-tracker')
  })

  it('카드 면은 rounded-2xl·p-4이고 배경은 색 변수다(hex 없음, 외곽선 없음)', () => {
    const html = render(feedView('hero_box', { bg_color_key: 'red-soft' }))
    expect(html).toContain('rounded-2xl')
    expect(html).toContain('p-4')
    expect(html).toContain('background-color:var(--feed-color-red-soft, var(--jam-red-soft))')
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}[;"']/)
  })

  it('제목은 데이터의 줄바꿈을 따르고(whitespace-pre-line) 한국어 줄바꿈 클래스를 갖는다', () => {
    const html = render(feedView('hero_box'))
    expect(html).toContain('<h3')
    expect(html).toContain('whitespace-pre-line')
    expect(html).toContain('break-keep')
    expect(html).toContain('wrap-break-word')
    expect(html).toMatch(/<h3[^>]*style="color:var\(--foreground\)"/)
    expect(html).toContain('font-black')
  })

  it('TodayCard가 feedType 갈래를 FeedCard로 보낸다(옛 모양 판정과 무관)', () => {
    const view = feedView('hero_box', { href: '/missions/m1', tracking: true })
    expect(renderToStaticMarkup(<TodayCard view={view} />)).toBe(render(view))
  })
})

describe('히어로(hero_box)', () => {
  it('최소 높이 360, 이미지 박스 높이 184, 제목과 설명(보임)', () => {
    const html = render(feedView('hero_box', { description: '먼저 참가해 봐요.', box_shape: 'round' }))
    expect(html).toContain(`min-height:${FEED_CARD_MIN_HEIGHT.hero_box}px`)
    expect(html).toContain('height:184px')
    expect(html).toContain('먼저 참가해 봐요.')
    expect(html).toContain('text-sm font-medium')
  })

  it('설명 숨김(show_description=false)이면 설명 문단이 없다', () => {
    const html = render(feedView('hero_box', { description: '먼저 참가해 봐요.', show_description: false }))
    expect(html).not.toContain('먼저 참가해 봐요.')
  })

  it('이미지가 있으면 이미지가 박스 안에 있고 없으면 색 면 박스만 남는다(자리 표시 없음)', () => {
    const withImage = render(feedView('hero_box', { box_color_key: 'ref-blue' }))
    expect(withImage).toContain('cover.png')
    expect(withImage).toContain('background-color:var(--feed-color-ref-blue, var(--feed-ref-blue))')
    const without = render(feedView('hero_box', { box_color_key: 'ref-blue', imageUrl: null }))
    expect(without).not.toContain('<img')
    expect(without).toContain('background-color:var(--feed-color-ref-blue, var(--feed-ref-blue))')
  })

  it('칩 개수만큼 칩이 있고 구분 칩은 검정(--foreground 면·--snow 글자)이다', () => {
    expect(count(render(feedView('hero_box', { chips: [] })), 'rounded-full')).toBe(0)
    expect(count(render(feedView('hero_box', { chips: [TWO_CHIPS[0]] })), 'rounded-full')).toBe(1)
    const two = render(feedView('hero_box', { chips: TWO_CHIPS }))
    expect(count(two, 'rounded-full')).toBe(2)
    expect(two).toContain('이번 주 미션')
    expect(two).toContain('아이템 배지')
    expect(two).toContain('background-color:var(--foreground)')
    expect(two).toContain('text-snow')
  })

  it('칩은 앵커 모서리에 걸친다(가로 12·세로 16)', () => {
    const html = render(feedView('hero_box', { chips: [{ kind: 'phrase', text: '칩', slot: 'image-top-left' }] }))
    expect(html).toContain('top:-16px')
    expect(html).toContain('left:-12px')
  })

  it('제목 속 칩: 낱말이 칩으로 감싸지고 제목 글자는 그대로 읽힌다(0·1·2개)', () => {
    const chipsIn = (words: string[]) => {
      const html = render(feedView('hero_box', { chips: [], title: '낙엽 소리 따라 걷는 한 주', title_chip_words: words }))
      return count(html, 'rounded-full')
    }
    expect(chipsIn([])).toBe(0)
    expect(chipsIn(['걷는'])).toBe(1)
    expect(chipsIn(['낙엽', '걷는'])).toBe(2)
  })

  it('도장은 켰을 때 한 개이고 aria-hidden이다', () => {
    const off = render(feedView('hero_box', { stamp_enabled: false }))
    expect(off).not.toContain('JOIN AND MOVE')
    const on = render(feedView('hero_box', { stamp_enabled: true }))
    expect(count(on, 'JOIN AND MOVE')).toBe(1)
    expect(count(on, '<svg')).toBe(1)
    expect(on).toMatch(/aria-hidden="true"[^>]*pointer-events-none/)
  })

  it('박스 5모양이 모두 그려진다(마스크 또는 모서리 클래스)', () => {
    for (const shape of ['round', 'ticket', 'stamp', 'wave', 'bump'] as const) {
      const html = render(feedView('hero_box', { box_shape: shape, feed_seed: 5 }))
      expect(html).toContain('background-color:var(--')
      if (shape !== 'round') expect(html).toMatch(/mask-image|-webkit-mask-image/)
    }
  })
})

describe('짙은 초록 바탕 — 바탕 위 글자는 --snow, 박스 안 글자는 --foreground (통합 팔레트 2 회차 8)', () => {
  const DEEP = { bg_color_key: 'green-deep', box_color_key: 'yellow' } as const
  const titleColor = (html: string) => html.match(/<h3[^>]*style="[^"]*?color:(var\([^)]*\))/)?.[1]
  const descriptionColor = (html: string) => html.match(/<p class="text-sm font-medium[^"]*" style="color:(var\([^)]*\))/)?.[1]

  it.each(['hero_box', 'drop_pickup', 'badge_intro', 'badge_only'] as const)('%s: 제목이 --snow다', (type) => {
    const html = render(feedView(type, { ...DEEP, description: '먼저 참가해 봐요.', badgeImageUrl: 'https://cdn.example/b.png', badgeName: '배지' }))
    expect(titleColor(html)).toBe('var(--snow)')
  })

  it.each(['hero_box', 'badge_intro'] as const)('%s: 설명도 --snow다', (type) => {
    const html = render(feedView(type, { ...DEEP, description: '먼저 참가해 봐요.', badgeImageUrl: 'https://cdn.example/b.png' }))
    expect(descriptionColor(html)).toBe('var(--snow)')
  })

  it('text_box: 박스 안 제목은 짙은 초록 바탕에서도 --foreground다', () => {
    const html = render(feedView('text_box', DEEP))
    expect(titleColor(html)).toBe('var(--foreground)')
    expect(html).not.toContain('color:var(--snow)')
  })

  it('짙은 초록 바탕이 아니면 제목·설명이 --foreground다(변경 전과 같다)', () => {
    const html = render(feedView('hero_box', { bg_color_key: 'yellow', box_color_key: 'pink', description: '먼저 참가해 봐요.' }))
    expect(titleColor(html)).toBe('var(--foreground)')
    expect(descriptionColor(html)).toBe('var(--foreground)')
    expect(html).not.toContain('color:var(--snow)')
  })

  it('제목 속 칩 글자는 짙은 초록 바탕에서도 --foreground 클래스다(칩 자기 글자색)', () => {
    const html = render(feedView('hero_box', { ...DEEP, title: '해가 짧아진 저녁의 한 바퀴', title_chip_words: ['저녁'] }))
    expect(html).toContain('text-foreground')
  })
})

describe('텍스트(text_box)', () => {
  it('최소 높이 440, 박스 최소 높이 408, 큰 글자 48/1.1 굵기 900 가운데 정렬', () => {
    const html = render(feedView('text_box', { title: '잠긴 채\n온 배지,\n열어\n볼까요', box_shape: 'round' }))
    expect(html).toContain(`min-height:${FEED_CARD_MIN_HEIGHT.text_box}px`)
    expect(html).toContain('min-height:408px')
    expect(html).toContain('text-5xl')
    expect(html).toContain('leading-[1.1]')
    expect(html).toContain('font-black')
    expect(html).toContain('text-center')
    expect(html).toContain('whitespace-pre-line')
  })

  it('설명은 show_description이 참이어도 그리지 않는다', () => {
    const html = render(feedView('text_box', { description: '그려지지 않는 설명', show_description: true }))
    expect(html).not.toContain('그려지지 않는 설명')
  })

  it('티켓 모양의 최소 높이가 190 이상이다', () => {
    const html = render(feedView('text_box', { box_shape: 'ticket' }))
    const minHeights = [...html.matchAll(/min-height:(\d+)px/g)].map((match) => Number(match[1]))
    expect(Math.max(...minHeights)).toBeGreaterThanOrEqual(190)
    expect(html).toContain('min-height:408px')
  })

  it('글자 안쪽 여백 32px을 부모가 준다(물결·티켓 홈이 글자에 닿지 않게)', () => {
    expect(render(feedView('text_box', { box_shape: 'wave', feed_seed: 1 }))).toContain('padding:32px')
  })

  it('이미지 마스크 박스에 이미지가 있으면 그리고, 색 면 박스는 이미지를 그리지 않는다', () => {
    expect(render(feedView('text_box', { box_kind: 'image_mask' }))).toContain('cover.png')
    expect(render(feedView('text_box', { box_kind: 'image_mask', imageUrl: null }))).not.toContain('<img')
    expect(render(feedView('text_box', { box_kind: 'text' }))).not.toContain('cover.png')
  })

  it('박스에 외곽선이 없다(칩에만 있다)', () => {
    const html = render(feedView('text_box', { chips: [] }))
    expect(html).not.toContain('border')
    expect(html).not.toContain('outline')
  })

  it('칩 0·1·2개와 도장 한 개', () => {
    expect(count(render(feedView('text_box', { chips: [] })), 'rounded-full')).toBe(0)
    expect(count(render(feedView('text_box', { chips: TWO_CHIPS })), 'rounded-full')).toBe(2)
    expect(count(render(feedView('text_box', { stamp_enabled: true })), 'JOIN AND MOVE')).toBe(1)
  })
})

describe('배지 소개(badge_intro)', () => {
  const base = { badgeImageUrl: 'https://cdn.example/badge.png', badgeName: '높은 곳 배지', description: '700m를 넘기면 받아요.' }

  it('최소 높이 384, 배지 그림 208×208(영역 높이 216), 설명 보임', () => {
    const html = render(feedView('badge_intro', base))
    expect(html).toContain(`min-height:${FEED_CARD_MIN_HEIGHT.badge_intro}px`)
    expect(html).toContain('height:216px')
    expect(html).toContain('width:208px;height:208px')
    expect(html).toContain('alt="높은 곳 배지"')
    expect(html).toContain('700m를 넘기면 받아요.')
  })

  it('배지 그림이 없으면 같은 크기의 빈 영역을 남긴다(자원 아이콘을 그리지 않는다)', () => {
    const html = render(feedView('badge_intro', { ...base, badgeImageUrl: null, imageUrl: null }))
    expect(html).toContain('width:208px;height:208px')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<svg')
  })

  it('칩은 배지 그림 둘레에 걸치고 박스는 없다', () => {
    const html = render(feedView('badge_intro', { ...base, chips: TWO_CHIPS }))
    expect(count(html, 'rounded-full')).toBe(2)
    expect(html).not.toContain('mask-image')
  })
})

describe('배지만(badge_only)', () => {
  const base = { title: '해가 짧아진 저녁의\n한 바퀴', badgeImageUrl: 'https://cdn.example/badge.png', badgeName: '파장의 골목 배지' }

  it('최소 높이 332, 제목이 위·배지가 아래, 설명은 숨김', () => {
    const html = render(feedView('badge_only', { ...base, description: '그려지지 않는 설명', show_description: true }))
    expect(html).toContain(`min-height:${FEED_CARD_MIN_HEIGHT.badge_only}px`)
    expect(html.indexOf('<h3')).toBeLessThan(html.indexOf('badge.png'))
    expect(html).not.toContain('그려지지 않는 설명')
  })

  it('칩이 저장돼 있어도 그리지 않고 제목 속 칩만 쓴다', () => {
    const noChips = render(feedView('badge_only', { ...base, chips: TWO_CHIPS }))
    expect(count(noChips, 'rounded-full')).toBe(0)
    const titleChip = render(feedView('badge_only', { ...base, title: '해가 짧아진 저녁의 한 바퀴', title_chip_words: ['저녁'] }))
    expect(count(titleChip, 'rounded-full')).toBe(1)
  })

  it('도장은 그리지 않는다(자리가 없다)', () => {
    expect(render(feedView('badge_only', { ...base, stamp_enabled: true }))).not.toContain('JOIN AND MOVE')
  })
})

describe('전체 배경 이미지(full_image) — 꺼져 있지만 컴포넌트는 그린다', () => {
  it('정사각(aspect-square), 이미지가 카드 전체, 제목은 왼쪽 아래 16px(--foreground 글자), 설명 숨김', () => {
    const html = render(feedView('full_image', { description: '그려지지 않는 설명', show_description: true }))
    expect(html).toContain('aspect-square')
    expect(html).toContain('cover.png')
    expect(html).toContain('inset-x-4 bottom-4')
    expect(html).toMatch(/<h3[^>]*text-foreground/)
    expect(html).not.toMatch(/<h3[^>]*text-snow/)
    expect(html).not.toContain('그려지지 않는 설명')
  })

  it('제목 뒤 막은 기본 농도 0이라 그리지 않는다(켤 때 채원이 글자색·막을 함께 정한다, hex 없음)', () => {
    const html = render(feedView('full_image'))
    expect(FEED_FULL_IMAGE_SCRIM.opacity).toBe(0)
    expect(html).not.toContain('linear-gradient')
    expect(html).not.toContain(`height:${FEED_FULL_IMAGE_SCRIM.heightPercent}%`)
  })

  it('칩은 이미지 위 모서리 안쪽이고 제목 자리(왼쪽 아래)를 쓰지 않는다', () => {
    for (let i = 0; i < 12; i += 1) {
      const html = render(feedView('full_image', { feed_seed: i, chips: TWO_CHIPS }))
      expect(html).not.toMatch(/bottom:16px;left:16px/)
      expect(html).not.toContain('top:-16px')
    }
  })

  it('이미지가 없으면 카드 배경 색 면이다', () => {
    const html = render(feedView('full_image', { imageUrl: null, bg_color_key: 'green-soft' }))
    expect(html).not.toContain('<img')
    expect(html).toContain('background-color:var(--feed-color-green-soft, var(--jam-green-soft))')
  })
})
