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
import { chainInputOf, planFeedChips } from '@/lib/today/feedChipChain'
import { FEED_CARD_MIN_HEIGHT, FEED_FULL_IMAGE_SCRIM, FEED_PHOTO_TEXT_SCRIM } from '@/lib/today/feedConstants'
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
/** 칩 층이 그린 칩 수: 알약(`rounded-full`)과 스티커(`role="img"`)의 합. 제목 속 칩도 알약이라 제목 속 칩이 없는 카드에서 쓴다. */
const chipCount = (html: string) => count(html, 'rounded-full') + count(html, 'role="img"')
/** 이 view의 칩 계획(`toCardViews`가 없는 단건 경로는 «앞 카드 없음» 계획이다) */
const planOf = (view: FeedCardView) => view.look.chipPlan ?? planFeedChips([chainInputOf(view)])[0]

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
    const html = render(feedView('hero_box', { bg_color_key: 'red' }))
    expect(html).toContain('rounded-2xl')
    expect(html).toContain('p-4')
    expect(html).toContain('background-color:var(--jam-red)')
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
  it('최소 높이 316, 이미지 박스 높이 184, 제목과 설명(보임)', () => {
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
    const withImage = render(feedView('hero_box', { box_color_key: 'blue' }))
    expect(withImage).toContain('cover.png')
    expect(withImage).toContain('background-color:var(--jam-blue)')
    const without = render(feedView('hero_box', { box_color_key: 'blue', imageUrl: null }))
    expect(without).not.toContain('<img')
    expect(without).toContain('background-color:var(--jam-blue)')
  })

  it('칩은 계획대로 그려진다: 칩 수는 계획의 칩 수이고 분류 칩은 영어 문구의 스티커 또는 검정 알약이다', () => {
    expect(chipCount(render(feedView('hero_box', { chips: [] })))).toBe(0)
    expect(chipCount(render(feedView('hero_box', { chips: [TWO_CHIPS[0]] })))).toBe(1)
    for (let seed = 1; seed <= 20; seed += 1) {
      const view = feedView('hero_box', { chips: TWO_CHIPS, feed_seed: seed })
      const html = render(view)
      const plan = planOf(view)
      expect(chipCount(html)).toBe(plan.chips.length)
      // 저장된 한글 구분 문구(아이템 배지)는 영어 분류 문구로 보인다
      expect(html).not.toContain('아이템 배지')
      const label = plan.chips.find((chip) => chip.kind === 'label')
      if (label?.presentation === 'sticker') expect(html).toContain('aria-label="ITEM"')
      if (label?.presentation === 'pill') {
        expect(html).toContain('>ITEM<')
        expect(html).toContain('background-color:var(--foreground)')
        expect(html).toContain('text-snow')
      }
      if (plan.chips.some((chip) => chip.kind === 'value')) expect(html).toContain('이번 주 미션')
    }
  })

  it('칩 층은 이미지 박스가 아니라 카드 모서리 기준이다: 카드 직계 층에서 %·px 위치로 놓이고 옛 걸침(-16px·-12px)이 없다', () => {
    const html = render(feedView('hero_box', { chips: [{ kind: 'phrase', text: '칩', slot: 'image-top-left' }] }))
    expect(html).toContain('data-chip-plan')
    expect(html).toContain('pointer-events-none absolute inset-0 z-10')
    expect(html).toMatch(/(?:left|right):calc\(-?[\d.]+% \+ [\d.]+px\)/)
    expect(html).not.toContain('top:-16px')
    expect(html).not.toContain('left:-12px')
    // 칩 층은 제목·설명 뒤, 카드 셸의 마지막 자식이다
    expect(html.indexOf('data-chip-plan')).toBeGreaterThan(html.indexOf('<h3'))
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
  it('정사각형(aspect-square)이고 높이 숫자(440·408)가 없으며, 큰 글자 48/1.1 굵기 900 가운데 정렬', () => {
    const html = render(feedView('text_box', { title: '잠긴 채\n온 배지,\n열어\n볼까요', box_shape: 'round' }))
    expect(html).toContain('aspect-square')
    expect(html).not.toContain('min-height')
    expect(html).not.toContain('min-height:440px')
    expect(html).not.toContain('min-height:408px')
    expect(html).toContain('text-[14.7cqw]')
    expect(html).toContain('leading-[1.1]')
    expect(html).toContain('font-black')
    expect(html).toContain('text-center')
    expect(html).toContain('whitespace-pre-line')
  })

  it('설명은 show_description이 참이어도 그리지 않는다', () => {
    const html = render(feedView('text_box', { description: '그려지지 않는 설명', show_description: true }))
    expect(html).not.toContain('그려지지 않는 설명')
  })

  it('박스가 카드(안쪽 여백 16)를 채운다: 앵커·박스가 flex-1이고 글자 층이 박스 밖으로 나가지 않는다', () => {
    const html = render(feedView('text_box', { box_shape: 'ticket' }))
    expect(html).toContain('p-4')
    expect(html).toContain('relative flex min-h-0 flex-1')
    expect(html).toContain('relative flex flex-1 items-center justify-center overflow-hidden')
    expect(html).toContain('max-h-full')
  })

  it('긴 제목은 글자 크기를 낮춘다(48 → 36 → 30)', () => {
    expect(render(feedView('text_box', { title: '짧은 제목' }))).toContain('text-[14.7cqw]')
    expect(render(feedView('text_box', { title: '가나다라마\n가나다라마\n가나다라마\n가나다라마\n가나다라마' }))).toContain('text-[11cqw]')
    const longest = render(feedView('text_box', { title: '가을 숲길을 따라 걷다가 만나는 작은 쉼터에서 한숨 돌려요 오늘도 수고했어요 아주 길고 긴 제목입니다 끝' }))
    expect(longest).toContain('text-[9.2cqw]')
    expect(longest).not.toContain('text-[14.7cqw]')
  })

  it('색 면 박스의 제목은 --foreground이고 막이 없다', () => {
    const html = render(feedView('text_box', { box_kind: 'text', bg_color_key: 'yellow' }))
    expect(html).toContain('color:var(--foreground)')
    expect(html).not.toContain('color:var(--snow)')
    expect(html).not.toContain('color-mix')
  })

  it('사진이 그려지는 텍스트형은 제목이 --snow이고 박스 전체에 어둠 막 32%가 깔린다', () => {
    const html = render(feedView('text_box', { box_kind: 'image_mask', bg_color_key: 'yellow' }))
    expect(FEED_PHOTO_TEXT_SCRIM).toBe(0.32)
    expect(html).toContain('cover.png')
    expect(html).toContain('color:var(--snow)')
    expect(html).toContain('background-color:color-mix(in srgb, var(--foreground) 32%, transparent)')
    expect(html).toContain('class="pointer-events-none absolute inset-0" style="background-color:color-mix')
    // 막은 사진 뒤가 아니라 사진 위·글자 앞에 있다
    expect(html.indexOf('cover.png')).toBeLessThan(html.indexOf('color-mix'))
    expect(html.indexOf('color-mix')).toBeLessThan(html.indexOf('color:var(--snow)'))
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}[;"']/)
  })

  it('이미지 마스크인데 이미지가 없으면 색 면으로 대신하므로 글자는 검정이고 막이 없다', () => {
    const html = render(feedView('text_box', { box_kind: 'image_mask', imageUrl: null, bg_color_key: 'yellow' }))
    expect(html).toContain('color:var(--foreground)')
    expect(html).not.toContain('color:var(--snow)')
    expect(html).not.toContain('color-mix')
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

  it('칩 0·1·2개는 계획대로 그려지고 도장은 한 개다', () => {
    expect(chipCount(render(feedView('text_box', { chips: [] })))).toBe(0)
    expect(chipCount(render(feedView('text_box', { chips: [TWO_CHIPS[0]] })))).toBe(1)
    for (let seed = 1; seed <= 20; seed += 1) {
      const view = feedView('text_box', { chips: TWO_CHIPS, feed_seed: seed })
      const html = render(view)
      expect(chipCount(html)).toBe(planOf(view).chips.length)
      // 칩 층은 박스 안이 아니라 카드 셸 직계라 박스 뒤에 온다
      expect(html.indexOf('data-chip-plan')).toBeGreaterThan(html.indexOf('<h3'))
    }
    expect(count(render(feedView('text_box', { stamp_enabled: true })), 'JOIN AND MOVE')).toBe(1)
  })
})

describe('배지 소개(badge_intro)', () => {
  const base = { badgeImageUrl: 'https://cdn.example/badge.png', badgeName: '높은 곳 배지', description: '700m를 넘기면 받아요.' }

  it('최소 높이 348, 배지 그림 208×208(영역 높이 216), 설명 보임', () => {
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

  it('칩은 카드 모서리 계획 층이 그리고(배지 칸 안이 아니다) 박스는 없다', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const view = feedView('badge_intro', { ...base, chips: TWO_CHIPS, feed_seed: seed })
      const html = render(view)
      expect(chipCount(html)).toBe(planOf(view).chips.length)
      expect(html).not.toContain('mask-image')
      // 배지 칸(208×208)은 칩 층을 품지 않는다: 칩 층은 칸이 닫힌 뒤, 제목·설명 뒤에 온다
      expect(html.indexOf('data-chip-plan')).toBeGreaterThan(html.indexOf('<h3'))
    }
  })
})

describe('배지만(badge_only)', () => {
  const base = { title: '해가 짧아진 저녁의\n한 바퀴', badgeImageUrl: 'https://cdn.example/badge.png', badgeName: '파장의 골목 배지' }

  it('최소 높이 300, 제목이 위·배지가 아래, 설명은 숨김', () => {
    const html = render(feedView('badge_only', { ...base, description: '그려지지 않는 설명', show_description: true }))
    expect(html).toContain(`min-height:${FEED_CARD_MIN_HEIGHT.badge_only}px`)
    expect(html.indexOf('<h3')).toBeLessThan(html.indexOf('badge.png'))
    expect(html).not.toContain('그려지지 않는 설명')
  })

  it('칩이 저장돼 있어도 그리지 않고 제목 속 칩만 쓴다', () => {
    const noChips = render(feedView('badge_only', { ...base, chips: TWO_CHIPS }))
    expect(count(noChips, 'rounded-full')).toBe(0)
    expect(count(noChips, 'role="img"')).toBe(0)
    // 칩 자리가 없는 유형이라 계획이 비어 칩 층 자체를 그리지 않는다
    expect(noChips).not.toContain('data-chip-plan')
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
    const html = render(feedView('full_image', { imageUrl: null, bg_color_key: 'green' }))
    expect(html).not.toContain('<img')
    expect(html).toContain('background-color:var(--jam-green)')
  })
})
