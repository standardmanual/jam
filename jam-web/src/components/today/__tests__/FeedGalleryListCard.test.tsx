/**
 * 목록형 카드 `FeedGalleryListCard` (티켓 20261121_0115, 상위 20261120_2026 4회차-3)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `renderToStaticMarkup`으로 마크업 문자열을 단언한다. 트래커는 표식 div로 바꿔 «클릭 기록 여부와 방식»을 본다.
 *
 * 확인하는 것: 4칸 그리드·정사각 칸·모서리 12·이름 두 줄까지, 항목마다 따로 링크, **카드 전체에는 링크가 없고** 항목·화살표 링크가 앵커 안의 앵커 없이 나란히 있다,
 * 계측은 분리(`trackClick`은 켜고 링크 안 클릭만 센다), 화살표 칸 접근성 이름, 항목 1~3개의 빈 칸 없는 당김, `list_more_href` 없으면 화살표 칸 없음,
 * 그림 없는 항목은 이름 글자, 미리보기(계측 없음)에서는 링크가 없다, 칩은 카드 오른쪽 위.
 *
 * 실행: cd jam-web && npx vitest run src/components/today/__tests__/FeedGalleryListCard.test.tsx
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
  default: ({
    cardId,
    trackClick,
    clickOnLinksOnly,
    children,
  }: {
    cardId: string
    trackClick?: boolean
    clickOnLinksOnly?: boolean
    children: ReactNode
  }) => (
    <div data-tracker={cardId} data-track-click={String(trackClick ?? true)} data-links-only={String(clickOnLinksOnly ?? false)}>
      {children}
    </div>
  ),
}))

import FeedCard from '../feed/FeedCard'
import { isSafeListHref } from '../feed/FeedGalleryListCard'
import TodayCard from '../TodayCard'
import type { FeedCardView, FeedCardViewListItem } from '@/lib/today/cardView'
import { FEED_CARD_MIN_HEIGHT, FEED_GALLERY } from '@/lib/today/feedConstants'
import { resolveFeedLook, type FeedLookCard } from '@/lib/today/feedLook'

const NOW = new Date('2026-11-21T12:00:00+09:00')
const ITEMS: FeedCardViewListItem[] = [
  { name: '산', href: '/drops?place=mountain', imageUrl: 'https://cdn.example/m.png' },
  { name: '편의점', href: '/drops?place=cvs', imageUrl: null },
  { name: '마트', href: '/drops?place=mart', imageUrl: 'https://cdn.example/mart.png' },
]

interface Options extends Partial<FeedLookCard> {
  items?: FeedCardViewListItem[]
  moreHref?: string | null
  description?: string
  tracking?: boolean
  title?: string
}

function listView({ items = ITEMS, moreHref = '/drops', description, tracking, title = '요즘 드랍이 많은 곳', ...stored }: Options = {}): FeedCardView {
  const look = resolveFeedLook({
    card: { id: 'card-1', feed_type: 'gallery_list', ...stored },
    feedType: 'gallery_list',
    valueSource: null,
    now: NOW,
  })
  const view: FeedCardView = { resource: 'drop', title, feedType: 'gallery_list', imageUrl: null, listItems: items, look }
  if (moreHref) view.listMoreHref = moreHref
  if (description && look.showDescription) view.description = description
  if (tracking) {
    // 카드 전체 링크용 주소가 있어도 목록형은 쓰지 않는다
    view.href = '/drops'
    view.tracking = { cardId: 'card-1', contentTypeId: null, templateType: 'drop_alert', feedType: view.feedType }
  }
  return view
}

const render = (view: FeedCardView) => renderToStaticMarkup(<FeedCard view={view} />)
const count = (html: string, needle: string) => html.split(needle).length - 1
const anchors = (html: string) => [...html.matchAll(/<a [^>]*>/g)].map((match) => match[0])

describe('목록형 — 구성', () => {
  it('최소 높이 260, 4칸 그리드(칸 간격 8), 제목과 설명(보임)', () => {
    const html = render(listView({ description: '가까운 곳에서 픽업해 봐요.' }))
    expect(html).toContain(`min-height:${FEED_CARD_MIN_HEIGHT.gallery_list}px`)
    expect(FEED_CARD_MIN_HEIGHT.gallery_list).toBe(260)
    expect(html).toContain('grid grid-cols-4')
    expect(html).toContain('gap-2')
    expect(html).toContain('요즘 드랍이 많은 곳')
    expect(html).toContain('가까운 곳에서 픽업해 봐요.')
  })

  it('설명 숨김(show_description=false)이면 설명이 없다', () => {
    expect(render(listView({ description: '가까운 곳에서 픽업해 봐요.', show_description: false }))).not.toContain('가까운 곳에서 픽업해 봐요.')
  })

  it('항목 칸은 정사각(aspect-square)·모서리 12(rounded-xl)·면 색은 박스 색 키이고 hex가 없다', () => {
    const html = render(listView({ box_color_key: 'ref-pink' }))
    expect(count(html, 'aspect-square')).toBe(4) // 항목 3 + 화살표 1
    expect(count(html, 'rounded-xl')).toBeGreaterThanOrEqual(4)
    expect(count(html, 'background-color:var(--feed-color-ref-pink, var(--feed-ref-pink))')).toBe(3)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}[;"']/)
  })

  it('이름은 12px 굵게 두 줄까지(line-clamp-2)이고 한국어 줄바꿈 클래스를 갖는다', () => {
    const html = render(listView())
    expect(count(html, 'line-clamp-2')).toBe(3)
    expect(html).toContain('text-xs font-bold')
    expect(html).toContain('break-keep')
    expect(html).toContain('wrap-break-word')
  })

  it('그림이 있는 항목은 이미지를, 없는 항목은 이름 글자를 칸 안에 그린다', () => {
    const html = render(listView())
    expect(html).toContain('m.png')
    expect(html).toContain('mart.png')
    expect(count(html, '<img')).toBe(2)
    // 그림 없는 항목의 이름은 칸 안(aria-hidden)과 아래 이름 줄에 두 번 나온다
    expect(count(html, '편의점')).toBe(2)
    expect(html).toContain('aria-hidden="true" class="px-1 text-center text-xs font-bold')
  })

  it('항목 그림은 장식이라 alt가 비어 있다(이름 줄이 링크 이름)', () => {
    expect(count(render(listView()), 'alt=""')).toBe(2)
  })
})

describe('목록형 — 항목 수와 화살표 칸', () => {
  it.each([1, 2, 3])('항목 %i개면 빈 칸 없이 화살표 칸이 바로 뒤에 온다(칸 수 = 항목 + 1)', (n) => {
    const html = render(listView({ items: ITEMS.slice(0, n), tracking: true }))
    expect(count(html, 'aspect-square')).toBe(n + 1)
    expect(anchors(html)).toHaveLength(n + 1)
    // 화살표 칸이 마지막 앵커다
    expect(anchors(html)[n]).toContain('aria-label="요즘 드랍이 많은 곳 전체 보기"')
  })

  it('list_more_href가 없으면 화살표 칸을 그리지 않는다', () => {
    const html = render(listView({ moreHref: null, tracking: true }))
    expect(count(html, 'aspect-square')).toBe(3)
    expect(html).not.toContain('전체 보기')
    expect(anchors(html)).toHaveLength(3)
  })

  it('화살표 칸은 검정 바탕 정사각 안의 → 아이콘(aria-hidden)이다', () => {
    const html = render(listView())
    expect(html).toContain('bg-foreground')
    expect(html).toContain('M5 12h14M13 6l6 6-6 6')
    expect(html).toContain(`width="${FEED_GALLERY.arrowIconSize}"`)
    expect(html).toContain('aria-hidden="true"')
  })

  it('화살표 칸의 접근성 이름은 «{제목} 전체 보기»다(제목의 줄바꿈은 공백으로)', () => {
    const html = render(listView({ title: '요즘 드랍이\n많은 곳', tracking: true }))
    expect(html).toContain('aria-label="요즘 드랍이 많은 곳 전체 보기"')
  })
})

describe('목록형 — 링크와 계측의 분리', () => {
  it('카드 전체에는 링크가 없다: 앵커는 항목·화살표뿐이고 카드의 href(/drops)로 가는 감싸는 링크가 없다', () => {
    const html = render(listView({ tracking: true }))
    const all = anchors(html)
    expect(all).toHaveLength(4)
    expect(all[0]).toContain('href="/drops?place=mountain"')
    expect(all[1]).toContain('href="/drops?place=cvs"')
    expect(all[2]).toContain('href="/drops?place=mart"')
    expect(all[3]).toContain('href="/drops"')
    // 앵커 안에 앵커가 없다: 열린 앵커 직전 닫기가 항상 있다
    expect(html.replace(/<a [^>]*>/g, '<a>')).not.toMatch(/<a>(?:(?!<\/a>)[\s\S])*<a>/)
    // 카드 전체 링크의 눌림 클래스가 카드 바깥 감싸개에 없다
    expect(html.trimStart().startsWith('<div data-tracker')).toBe(true)
    expect(html).toContain('<div data-tracker="card-1" data-track-click="true" data-links-only="true"><div class="relative flex flex-col')
  })

  it('계측은 켜져 있다: 트래커가 클릭을 기록하되 링크 안의 클릭만 센다(항목·화살표 클릭 = 카드 클릭)', () => {
    const html = render(listView({ tracking: true }))
    expect(html).toContain('data-tracker="card-1"')
    expect(html).toContain('data-track-click="true"')
    expect(html).toContain('data-links-only="true"')
  })

  it('항목 링크는 눌림(jam-press)과 키보드 포커스 윤곽선을 칸 모서리에 맞춰 가진다', () => {
    const [first] = anchors(render(listView({ tracking: true })))
    expect(first).toContain('jam-press')
    expect(first).toContain('focus-visible:outline-2')
    expect(first).toContain('rounded-xl')
  })

  it('계측 정보가 없으면(미리보기) 링크·트래커가 없고 눌러도 이동하지 않는다(화살표 이름은 글자로 남는다)', () => {
    const html = render(listView())
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('data-tracker')
    expect(html).toContain('요즘 드랍이 많은 곳 전체 보기')
    expect(html).toContain('sr-only')
  })

  it('TodayCard가 목록형도 FeedCard로 보낸다', () => {
    const view = listView({ tracking: true })
    expect(renderToStaticMarkup(<TodayCard view={view} />)).toBe(render(view))
  })

  it('다른 유형의 틀은 바뀌지 않았다: 히어로는 카드 전체 링크 하나이고 클릭을 그대로 센다', () => {
    const hero = resolveFeedLook({ card: { id: 'card-1', feed_type: 'hero_box' }, feedType: 'hero_box', valueSource: null, now: NOW })
    const view: FeedCardView = {
      resource: 'mission',
      title: '제목',
      feedType: 'hero_box',
      imageUrl: null,
      look: hero,
      href: '/missions/m1',
      tracking: { cardId: 'card-1', contentTypeId: null, templateType: 'mission_spotlight', feedType: 'hero_box' },
    }
    const html = render(view)
    expect(anchors(html)).toHaveLength(1)
    expect(html).toContain('data-track-click="true"')
    expect(html).toContain('data-links-only="false"')
  })
})

describe('목록형 — 주소 안전 검사(isSafeListHref)', () => {
  it('내부 경로(/로 시작, //로 시작하지 않음)와 https://로 시작하는 값만 안전하다', () => {
    for (const ok of ['/drops', '/drops?place=mountain', '/', 'https://j-a-m.app/drops', 'HTTPS://example.com']) expect(isSafeListHref(ok)).toBe(true)
  })

  it('프로토콜 상대(//)·역슬래시·http·javascript·data·빈 값·공백·상대 경로는 안전하지 않다', () => {
    for (const bad of ['//evil.example/x', '/\\evil.example', 'http://example.com', 'javascript:alert(1)', 'data:text/html,x', '', ' /drops', '/dro ps', 'drops', 'mailto:a@b.c']) {
      expect(isSafeListHref(bad)).toBe(false)
    }
    expect(isSafeListHref(null)).toBe(false)
    expect(isSafeListHref(undefined)).toBe(false)
  })

  it('안전하지 않은 항목 주소는 링크 없이 그린다(그림·이름은 그대로, 나머지 항목은 링크)', () => {
    const items: FeedCardViewListItem[] = [
      { name: '산', href: 'javascript:alert(1)', imageUrl: null },
      { name: '편의점', href: '//evil.example/x', imageUrl: null },
      { name: '마트', href: '/drops?place=mart', imageUrl: null },
    ]
    const html = render(listView({ items, tracking: true }))
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('evil.example')
    const all = anchors(html)
    expect(all).toHaveLength(2) // 마트 + 화살표
    expect(all[0]).toContain('href="/drops?place=mart"')
    expect(count(html, 'aspect-square')).toBe(4)
    expect(html).toContain('산')
    expect(html).toContain('편의점')
  })

  it('https:// 주소 항목은 링크로 그린다', () => {
    const html = render(listView({ items: [{ name: '외부', href: 'https://j-a-m.app/x', imageUrl: null }], tracking: true }))
    expect(anchors(html)[0]).toContain('href="https://j-a-m.app/x"')
  })

  it.each(['//evil.example', 'http://example.com', 'javascript:alert(1)', 'drops'])('list_more_href가 %s면 화살표 칸을 그리지 않는다', (moreHref) => {
    const html = render(listView({ moreHref, tracking: true }))
    expect(count(html, 'aspect-square')).toBe(3)
    expect(html).not.toContain('전체 보기')
    expect(html).not.toContain('bg-foreground')
    expect(anchors(html)).toHaveLength(3)
  })

  it('list_more_href가 https://로 시작하면 화살표 칸을 그린다', () => {
    const html = render(listView({ moreHref: 'https://j-a-m.app/drops', tracking: true }))
    expect(anchors(html)[3]).toContain('href="https://j-a-m.app/drops"')
  })
})

describe('목록형 — 칩', () => {
  it('칩은 제목 위 칩 줄의 오른쪽 끝에 한 개 놓인다(절대 위치가 아니라 제목과 겹치지 않는다)', () => {
    const html = render(listView({ chips: [{ kind: 'phrase', text: '요즘 인기', slot: 'card-top-right' }] }))
    expect(count(html, 'rounded-full')).toBe(1)
    expect(html).toContain('요즘 인기')
    expect(html).toContain('justify-end')
    expect(html).not.toContain('position:absolute')
    // 칩 층(`FeedChipLayer`)은 `absolute z-10` 래퍼를 쓴다. 칩 줄은 흐름 안에 있어 이 래퍼가 없다.
    expect(html).not.toContain('absolute z-10')
    // 칩 줄이 제목보다 앞에 온다.
    expect(html.indexOf('요즘 인기')).toBeLessThan(html.indexOf('<h3'))
  })

  it('칩이 없으면 그리지 않고 칩 줄도 만들지 않는다', () => {
    const html = render(listView({ chips: [] }))
    expect(count(html, 'rounded-full')).toBe(0)
    expect(html).not.toContain('justify-end')
  })
})
