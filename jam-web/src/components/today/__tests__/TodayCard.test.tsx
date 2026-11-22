/**
 * `TodayCard` — 새 유형 전용 (티켓 20261122_1101, 상위 20261122_1100 8회차-1)
 *
 * 옛 7모양 분기(`RENDERED_SHAPES`·`isRenderedShape`)를 지웠다. `TodayCard`는 `FeedCard`만 부르고, 카드 행에서 출발하면 `feed_type`이 비었거나 모르는 값이어도
 * `toCardView`가 텍스트 박스 뷰를 만들어 오류 없이 그려진다. 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `renderToStaticMarkup`으로 확인한다.
 * 트래커는 표식 div로 바꿔 「그려졌는가·클릭을 세는가」로 확인한다.
 *
 * 실행: cd jam-web && npx vitest run src/components/today/__tests__/TodayCard.test.tsx
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

import TodayCard from '../TodayCard'
import FeedCard from '../feed/FeedCard'
import { toCardView } from '@/lib/today/cardView'
import type { TodayCardWithHref } from '@/lib/today/cards'

function makeCard(partial: Partial<TodayCardWithHref> = {}): TodayCardWithHref {
  return {
    id: 'card-1',
    template_type: 'badge_spotlight',
    layout_type: 'large_thumbnail',
    title: '성수동 신규 배지',
    subtitle: null,
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
    content_type_id: 'T05',
    image_source: null,
    shape: null,
    resolved_href: '/badges',
    resolved_badges: [],
    resolved_ranking: null,
    ...partial,
  }
}

const OPTIONS = { tracking: true } as const
const draw = (card: TodayCardWithHref) => renderToStaticMarkup(<TodayCard view={toCardView(card, OPTIONS)} />)
const count = (html: string, needle: string) => html.split(needle).length - 1

describe('TodayCard — FeedCard만 그린다', () => {
  it('표시 데이터를 FeedCard에 그대로 넘긴다(출력이 같다)', () => {
    const view = toCardView(makeCard({ feed_type: 'hero_box' }), OPTIONS)
    expect(renderToStaticMarkup(<TodayCard view={view} />)).toBe(renderToStaticMarkup(<FeedCard view={view} />))
  })

  it('RENDERED_SHAPES·isRenderedShape 같은 옛 모양 판정을 내보내지 않는다', async () => {
    const mod = (await import('../TodayCard')) as Record<string, unknown>
    expect(Object.keys(mod)).toEqual(['default'])
  })
})

describe('TodayCard — feed_type이 비었거나 모르는 값이면 텍스트 박스로 그린다', () => {
  const view = (feedType: unknown) => toCardView(makeCard({ feed_type: feedType as never }), OPTIONS)

  it.each([
    ['NULL', null],
    ['값이 없음', undefined],
    ['모르는 값', 'future_type'],
    ['꺼져 있는 full_image', 'full_image'],
  ])('feed_type이 %s이면 text_box 뷰이고 텍스트 박스 출력과 같다', (_label, feedType) => {
    expect(view(feedType).feedType).toBe('text_box')
    const textBox = toCardView(makeCard({ feed_type: 'text_box' }), OPTIONS)
    expect(renderToStaticMarkup(<TodayCard view={view(feedType)} />)).toBe(renderToStaticMarkup(<TodayCard view={textBox} />))
  })

  it('옛 모양 값(shape)이 저장돼 있어도 무시하고 오류 없이 제목을 그린다', () => {
    for (const shape of ['hero', 'poster', 'square', 'brief', 'list', 'dome', 'ticket'] as const) {
      const html = draw(makeCard({ shape, feed_type: null }))
      expect(html).toContain('성수동 신규 배지')
      expect(html).toContain('data-tracker="card-1"')
    }
  })

  it('랭킹 보드·레시피 공개 카드도 던지지 않고 텍스트 박스로 그린다', () => {
    for (const template_type of ['ranking_board', 'recipe_reveal'] as const) {
      const html = draw(makeCard({ template_type, feed_type: null }))
      expect(html).toContain('성수동 신규 배지')
    }
  })
})

describe('TodayCard — 접근·계측 틀(CardFrame)', () => {
  it('계측 정보와 href가 있으면 틀이 트래커·링크를 걸고 눌림은 한 곳에만 있다', () => {
    const html = draw(makeCard())
    expect(html).toContain('data-tracker="card-1"')
    expect(html).toContain('data-track-click="true"')
    expect(html).toContain('href="/badges"')
    expect(count(html, 'jam-press')).toBe(1)
  })

  it('계측 정보가 없으면(미리보기) 링크·트래커·눌림이 없다', () => {
    const html = renderToStaticMarkup(<TodayCard view={toCardView(makeCard())} />)
    expect(html).not.toContain('data-tracker')
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('jam-press')
  })

  it('목록형은 카드 전체 링크가 없고 항목 링크 클릭만 센다', () => {
    const html = draw(
      makeCard({ feed_type: 'gallery_list', list_items: [{ name: '산', href: '/drops?place=mountain', image_url: null }] }),
    )
    expect(html).toContain('data-tracker="card-1"')
    expect(html).toContain('href="/drops?place=mountain"')
    expect(html).not.toContain('href="/badges"')
  })
})
