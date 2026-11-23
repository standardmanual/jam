/**
 * 투데이 카드 스택 — 모든 카드를 새 유형으로 그린다 (티켓 20261001_2244, 20261122_1101)
 *
 * 스택은 모든 카드를 표시 데이터(`toCardViews`, 계측 정보 포함)로 바꿔 `TodayCard`로 그린다. 옛 7모양 갈래는 8회차-1(티켓 20261122_1101)에서 지웠다 —
 * `feed_type`이 비었거나 모르는 값이면 텍스트 박스다. 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더
 * (`renderToStaticMarkup`)로 고정한다. 트래커는 표식 div로 바꿔 「어떤 카드가 감싸졌는가」로 확인한다.
 *
 * 확인하는 것: (1) 모든 카드가 트래커로 감싸지고 목록형만 카드 전체 링크가 없다 (2) 카드 0장이면 아무것도 그리지 않는다 (3) 섹션 머리가 없고 카드 순서를 지킨다
 * (4) 옛 7모양 마크업이 남지 않는다.
 * 어드민 미리보기의 「계측과 이동을 모두 끈다」는 `src/app/admin/today/__tests__/TodayCardPreview.test.tsx`가 맡는다.
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

import TodayCardStack from './TodayCardStack'
import type { TodayCardWithHref } from '@/lib/today/cards'

function makeCard(partial: Partial<TodayCardWithHref> = {}): TodayCardWithHref {
  return {
    id: 'card-1',
    template_type: 'badge_spotlight',
    layout_type: 'large_thumbnail',
    title: '성수동 신규 배지',
    subtitle: '이번 주 새로 열렸어요',
    description: null,
    cover_image_url: 'https://example.com/cover.webp',
    badge_ids: [],
    mission_id: null,
    item_book_id: null,
    region_label: null,
    body_markdown: null,
    target_href: null,
    exposure_tags: ['all'],
    starts_at: '2026-09-29T00:00:00Z',
    ends_at: '2026-12-30T14:59:59Z',
    sort_order: 0,
    is_active: true,
    created_at: '2026-09-29T00:00:00Z',
    created_by: null,
    ranking_mode_id: null,
    content_type_id: null,
    image_source: null,
    shape: null,
    resolved_href: '/badges',
    resolved_badges: [],
    resolved_ranking: null,
    ...partial,
  }
}

const render = (cards: TodayCardWithHref[]) => renderToStaticMarkup(<TodayCardStack cards={cards} />)
const count = (html: string, needle: string) => html.split(needle).length - 1

/** 카드 전체 링크(`CardFrame`)의 클래스 */
const CARD_LINK = 'block rounded-2xl jam-press'
/** 옛 7모양 틀의 마크업 */
const LEGACY_FRAMES = [
  'min-h-[88px]',
  'relative aspect-video overflow-hidden bg-background',
  'relative aspect-[4/5] overflow-hidden bg-background',
  'relative aspect-square overflow-hidden bg-background',
  'w-16 shrink-0',
]

describe('TodayCardStack — feed_type이 비었거나 모르는 카드도 새 유형(텍스트 박스)으로 그린다', () => {
  it.each([
    ['NULL', null],
    ['모르는 값', 'future_type'],
  ])('feed_type이 %s이면 옛 레이아웃·모양과 상관없이 텍스트 박스 한 장이다', (_label, feedType) => {
    for (const layout_type of ['large_thumbnail', 'banner', 'badge_gallery', 'shortcut', 'other', 'ranking_list'] as const) {
      const html = render([makeCard({ layout_type, feed_type: feedType as never, shape: 'poster' })])
      expect(html).toContain('성수동 신규 배지')
      expect(html).toContain(CARD_LINK)
      for (const legacy of LEGACY_FRAMES) expect(html).not.toContain(legacy)
    }
  })

  it('기사 카드도 카드 틀의 링크로 이동한다(href가 그대로다)', () => {
    const html = render([makeCard({ template_type: 'editorial_article', resolved_href: '/today/card-1' })])
    expect(html).toContain('href="/today/card-1"')
  })
})

describe('TodayCardStack — 모든 카드가 트래커로 감싸지고 목록형만 카드 전체 링크가 없다', () => {
  it('일반 카드: 트래커가 클릭을 세고 카드 전체가 링크 하나다(앵커 안에 앵커가 없다)', () => {
    const html = render([makeCard({ feed_type: 'hero_box' })])
    expect(html).toContain('data-tracker="card-1"')
    expect(html).toContain('data-track-click="true"')
    expect(count(html, '<a ')).toBe(1)
    expect(count(html, 'jam-press')).toBe(1)
    expect(html).toContain('href="/badges"')
  })

  it('목록형: 카드 전체 링크가 없고 항목 링크가 항목마다 있다(클릭은 항목 링크로만 센다)', () => {
    const html = render([
      makeCard({
        feed_type: 'gallery_list',
        list_items: [
          { name: '산', href: '/drops?place=mountain', image_url: null },
          { name: '바다', href: '/drops?place=sea', image_url: null },
        ],
      }),
    ])
    expect(html).toContain('data-tracker="card-1"')
    expect(html).not.toContain('href="/badges"')
    expect(html).toContain('href="/drops?place=mountain"')
    expect(html).toContain('href="/drops?place=sea"')
  })

  it('여러 장이면 장마다 트래커가 하나씩 있다', () => {
    const html = render([makeCard({ id: 'a' }), makeCard({ id: 'b', feed_type: 'hero_box' }), makeCard({ id: 'c', feed_type: 'text_box' })])
    for (const id of ['a', 'b', 'c']) expect(count(html, `data-tracker="${id}"`)).toBe(1)
  })
})

describe('TodayCardStack — 섹션 머리와 카드 0장', () => {
  it('카드가 0장이면 아무것도 그리지 않는다', () => {
    expect(render([])).toBe('')
  })

  it('섹션 머리(제목 「투데이」·부제 「오늘의 소식」)를 그리지 않고 카드부터 나온다', () => {
    const html = render([makeCard()])
    expect(html).not.toContain('투데이')
    expect(html).not.toContain('오늘의 소식')
    expect(html.startsWith('<section><div class="flex flex-col gap-2">')).toBe(true)
  })

  it('여러 장이 섞여 있어도 순서를 지킨다', () => {
    const html = render([
      makeCard({ id: 'a', title: '첫째 카드' }),
      makeCard({ id: 'b', title: '둘째 카드', feed_type: 'hero_box' }),
      makeCard({ id: 'c', title: '셋째 카드', feed_type: 'text_box' }),
    ])
    expect(html.indexOf('첫째 카드')).toBeLessThan(html.indexOf('둘째 카드'))
    expect(html.indexOf('둘째 카드')).toBeLessThan(html.indexOf('셋째 카드'))
  })
})

describe('TodayCardStack — 옛 렌더러의 마크업이 남지 않는다', () => {
  it('예전 눌림 문자열(active:scale-[0.98]·duration-100)이 없다', () => {
    const html = render([makeCard(), makeCard({ id: 'b', feed_type: 'hero_box' })])
    expect(html).not.toContain('active:scale-[0.98]')
    expect(html).not.toContain('duration-100')
  })

  it('`preview` prop은 스택이 받지 않는다 — 넘겨도 계측과 링크가 그대로다', () => {
    const props = { cards: [makeCard()], preview: true } as unknown as Parameters<typeof TodayCardStack>[0]
    const html = renderToStaticMarkup(<TodayCardStack {...props} />)
    expect(html).toContain('data-tracker="card-1"')
    expect(html).toContain('href="/badges"')
  })
})
