/**
 * 홈 카드 게재용 설명문(description) 표시 테스트 (티켓 20260929_1335)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)로 고정한다.
 * 확인하는 것: (1) 5개 레이아웃(large_thumbnail·badge_gallery·other·ranking_list·banner)에서 설명문이
 * 14px·2줄 말줄임으로 부제 아래에 나오는지 (2) shortcut은 그리지 않는지 (3) 값이 null·빈 문자열·공백뿐이면
 * 설명문이 없는 카드와 DOM이 똑같은지 (4) 부제가 없으면 mt-1, 있으면 mt-2인지.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import TodayCardStack from './TodayCardStack'
import type { TodayCardWithHref } from '@/lib/today/cards'
import type { TodayCardLayoutType } from '@/types/database'

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
    resolved_href: '/badges',
    resolved_badges: [],
    resolved_ranking: null,
    ...partial,
  }
}

const render = (card: TodayCardWithHref) => renderToStaticMarkup(<TodayCardStack cards={[card]} />)

const DESCRIPTION = '성수동에서 새로 발견된 배지를 만나 보세요'
const DESCRIPTION_CLASS = 'text-[length:var(--text-small)] leading-[var(--leading-small)] line-clamp-2 break-words'

describe('TodayCardStack — 게재용 설명문', () => {
  const visibleLayouts: TodayCardLayoutType[] = ['large_thumbnail', 'badge_gallery', 'other', 'ranking_list', 'banner']

  it.each(visibleLayouts)('%s: 부제 아래 14px·2줄 말줄임으로 그린다', (layout) => {
    const html = render(makeCard({ layout_type: layout, description: DESCRIPTION }))
    expect(html).toContain(DESCRIPTION)
    expect(html).toContain(DESCRIPTION_CLASS)
    expect(html.indexOf('이번 주 새로 열렸어요')).toBeLessThan(html.indexOf(DESCRIPTION))
    expect(html).toContain('mt-2')
  })

  it('밝은 카드는 text-text-inverse/60, 배너(커버 있음)는 text-white/80이다', () => {
    expect(render(makeCard({ layout_type: 'large_thumbnail', description: DESCRIPTION }))).toContain(
      `${DESCRIPTION_CLASS} text-text-inverse/60 mt-2`
    )
    expect(render(makeCard({ layout_type: 'banner', description: DESCRIPTION }))).toContain(`${DESCRIPTION_CLASS} text-white/80 mt-2`)
  })

  it('배너인데 커버가 없으면 기타형 대체라 밝은 카드 색을 쓴다', () => {
    const html = render(makeCard({ layout_type: 'banner', cover_image_url: null, description: DESCRIPTION }))
    expect(html).toContain(`${DESCRIPTION_CLASS} text-text-inverse/60 mt-2`)
    expect(html).not.toContain('text-white/80')
  })

  it('shortcut은 설명문이 있어도 이전과 같은 모양이다', () => {
    const base = render(makeCard({ layout_type: 'shortcut' }))
    const withDescription = render(makeCard({ layout_type: 'shortcut', description: DESCRIPTION }))
    expect(withDescription).not.toContain(DESCRIPTION)
    expect(withDescription).toBe(base)
  })

  it.each(visibleLayouts)('%s: null·빈 문자열·공백뿐이면 설명문이 없는 카드와 DOM이 같다', (layout) => {
    const base = render(makeCard({ layout_type: layout, description: null }))
    expect(render(makeCard({ layout_type: layout, description: '' }))).toBe(base)
    expect(render(makeCard({ layout_type: layout, description: '   ' }))).toBe(base)
    expect(base).not.toContain('line-clamp-2 break-words')
  })

  it('부제가 없으면 제목 바로 아래 mt-1로 붙는다(빈 여백 없음)', () => {
    const html = render(makeCard({ subtitle: null, description: DESCRIPTION }))
    expect(html).toContain(`${DESCRIPTION_CLASS} text-text-inverse/60 mt-1`)
    expect(html).not.toContain(`${DESCRIPTION_CLASS} text-text-inverse/60 mt-2`)
  })

  it('앞뒤 공백은 잘라서 그린다', () => {
    expect(render(makeCard({ description: `  ${DESCRIPTION}  ` }))).toContain(`>${DESCRIPTION}</p>`)
  })
})

describe('TodayCardStack — 옛 렌더러의 눌림과 칩 (티켓 20261001_1458)', () => {
  const layouts: TodayCardLayoutType[] = ['large_thumbnail', 'badge_gallery', 'shortcut', 'banner', 'other']

  it.each(layouts)('%s: 눌림은 jam-press 하나이고 예전 눌림 문자열은 남지 않는다', (layout) => {
    const html = render(makeCard({ layout_type: layout }))
    expect(html).toContain('jam-press')
    expect(html).not.toContain('active:scale-[0.98]')
    expect(html).not.toContain('duration-100')
  })

  it('ranking_list: 미션 대상 랭킹의 제목 링크가 jam-press를 쓴다', () => {
    const html = render(
      makeCard({
        layout_type: 'ranking_list',
        template_type: 'ranking_board',
        resolved_href: '/missions/m-1/status',
        resolved_ranking: {
          metricType: 'mission_progress',
          missionType: null,
          conditionFieldKey: null,
          totalParticipants: 0,
          entries: [],
        },
      })
    )
    expect(html).toContain('block jam-press')
    expect(html).not.toContain('active:scale-[0.98]')
  })

  // shortcut은 칩 없이 아이콘·제목 한 줄이라 제외한다
  const chipLayouts = layouts.filter((layout) => layout !== 'shortcut')
  it.each(chipLayouts)('%s: 칩은 MODULAR LabelChip(인라인 6px 10px)이고 예전 칩 클래스는 없다', (layout) => {
    const html = render(makeCard({ layout_type: layout }))
    expect(html).toMatch(/<span class="" style="[^"]*padding:6px 10px[^"]*">배지 소개<\/span>/)
    expect(html).not.toContain('px-2.5 py-1.5')
  })
})
