/**
 * 투데이 카드 스택 미리보기(`preview`) 테스트 (티켓 20260930_1645)
 *
 * 어드민 미리보기가 실제 노출·클릭 계측을 남기지 않고, 눌러도 서비스 화면으로 이동하지 않는지 고정한다.
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)로 확인하고,
 * 계측은 `TodayCardTracker`를 표식 div로 바꿔 "그려졌는가"로 확인한다 — 노출 보고(`IntersectionObserver`)와
 * 클릭 보고(`/api/today/events`, GA `today_card_click`)는 모두 이 컴포넌트 안에서만 일어난다.
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
  default: ({ cardId, trackClick = true, children }: { cardId: string; trackClick?: boolean; children: ReactNode }) => (
    <div data-tracker={cardId} data-track-click={String(trackClick)}>
      {children}
    </div>
  ),
}))

import TodayCardStack from './TodayCardStack'
import type { TodayCardWithHref } from '@/lib/today/cards'
import type { RankingModeMetricType, TodayCardLayoutType } from '@/types/database'

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

const rankingCard = (metricType: RankingModeMetricType): TodayCardWithHref =>
  makeCard({
    layout_type: 'ranking_list',
    template_type: 'ranking_board',
    resolved_href: '/missions/m-1/status',
    resolved_ranking: {
      metricType,
      missionType: null,
      conditionFieldKey: null,
      totalParticipants: 2,
      entries: [
        { userId: 'u-1', displayName: '김잼', username: 'kimjam', avatarUrl: null, value: 10, rank: 1 },
        { userId: 'u-2', displayName: '이잼', username: 'leejam', avatarUrl: null, value: 5, rank: 2 },
      ],
    },
  })

const linkLayouts: TodayCardLayoutType[] = ['large_thumbnail', 'badge_gallery', 'shortcut', 'banner', 'other']

describe('TodayCardStack — 홈(기본값)은 계측과 링크를 그대로 건다', () => {
  it.each(linkLayouts)('%s: 트래커로 감싸고 카드 링크를 건다', (layout) => {
    const html = renderToStaticMarkup(<TodayCardStack cards={[makeCard({ layout_type: layout })]} />)
    expect(html).toContain('data-tracker="card-1"')
    expect(html).toContain('data-track-click="true"')
    expect(html).toContain('href="/badges"')
  })

  it('ranking_list: 노출만 추적하고(클릭 제외) 순위 행은 유저 프로필로 링크한다', () => {
    const html = renderToStaticMarkup(<TodayCardStack cards={[rankingCard('mission_progress')]} />)
    expect(html).toContain('data-tracker="card-1"')
    expect(html).toContain('data-track-click="false"')
    expect(html).toContain('href="/missions/m-1/status"')
    expect(html).toContain('href="/kimjam"')
  })
})

describe('TodayCardStack — preview는 계측과 이동을 모두 끈다', () => {
  it.each(linkLayouts)('%s: 트래커도 링크도 그리지 않고 카드 모양은 그대로 그린다', (layout) => {
    const html = renderToStaticMarkup(<TodayCardStack cards={[makeCard({ layout_type: layout })]} preview />)
    expect(html).not.toContain('data-tracker')
    expect(html).not.toContain('href=')
    expect(html).toContain('성수동 신규 배지')
  })

  it.each<RankingModeMetricType>(['mission_progress', 'badge_count'])(
    'ranking_list(%s): 트래커도 제목 링크도 순위 행 링크도 없고 순위는 그대로 그린다',
    (metricType) => {
      const html = renderToStaticMarkup(<TodayCardStack cards={[rankingCard(metricType)]} preview />)
      expect(html).not.toContain('data-tracker')
      expect(html).not.toContain('href=')
      expect(html).toContain('김잼')
      expect(html).toContain('이잼')
    }
  )

  it('brief(새 틀): 트래커도 링크도 눌림도 없이 모양은 그대로 그리고, href가 있으면 끝 ›만 보인다 (티켓 20261001_1458)', () => {
    const html = renderToStaticMarkup(<TodayCardStack cards={[makeCard({ shape: 'brief' })]} preview />)
    expect(html).toContain('min-h-[88px]')
    expect(html).toContain('성수동 신규 배지')
    expect(html).not.toContain('data-tracker')
    expect(html).not.toContain('href=')
    expect(html).not.toContain('<a')
    expect(html).not.toContain('jam-press')
    expect(html).toContain('aria-hidden="true">›</span>')
  })

  it('brief(새 틀): 홈(기본값)은 같은 카드를 트래커로 감싸고 링크를 건다', () => {
    const html = renderToStaticMarkup(<TodayCardStack cards={[makeCard({ shape: 'brief' })]} />)
    expect(html).toContain('data-tracker="card-1"')
    expect(html).toContain('data-track-click="true"')
    expect(html).toContain('href="/badges"')
  })

  it('여러 장을 한꺼번에 그려도 어느 카드의 트래커도 남지 않는다', () => {
    const cards = [
      makeCard({ id: 'a' }),
      makeCard({ id: 'b', layout_type: 'badge_gallery' }),
      { ...rankingCard('mission_progress'), id: 'c' },
      makeCard({ id: 'd', shape: 'brief' }),
    ]
    const html = renderToStaticMarkup(<TodayCardStack cards={cards} preview />)
    expect(html).not.toContain('data-tracker')
    expect(html).not.toContain('href=')
  })
})
