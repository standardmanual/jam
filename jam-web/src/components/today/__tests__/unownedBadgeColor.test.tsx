/**
 * 홈피드 카드는 보유하지 않은 배지(`earned: false`)도 원본 컬러로 그린다 (티켓 20261118_1523)
 *
 * 서버 조회 값(`ResolvedBadge`)을 `toCardView`로 바꿔 `TodayCard`로 그린 마크업에 `grayscale`이 없는지 확인한다.
 * 세 경우: 커버 승격(이미지 모양)·`brief` 썸네일·`list` 타일.
 *
 * 실행: cd jam-web && npx vitest run src/components/today/__tests__/unownedBadgeColor.test.tsx
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
  default: ({ cardId, children }: { cardId: string; children: ReactNode }) => <div data-tracker={cardId}>{children}</div>,
}))

import TodayCard from '../TodayCard'
import { toCardView } from '@/lib/today/cardView'
import type { TodayCardWithHref, ResolvedBadge } from '@/lib/today/cards'

const unowned = (id: string): ResolvedBadge => ({
  id,
  name: `배지 ${id}`,
  image_url: `https://cdn.example/${id}.png`,
  rarity: 'rare',
  earned: false,
})

function makeCard(overrides: Partial<TodayCardWithHref> = {}): TodayCardWithHref {
  return {
    id: 'card-1',
    template_type: 'badge_spotlight',
    layout_type: 'large_thumbnail',
    title: '제목',
    subtitle: null,
    cover_image_url: null,
    badge_ids: ['a'],
    mission_id: null,
    item_book_id: null,
    region_label: null,
    body_markdown: null,
    target_href: null,
    exposure_tags: ['all'],
    starts_at: '2026-10-01T00:00:00+09:00',
    ends_at: '2026-10-31T23:59:59+09:00',
    sort_order: 3,
    is_active: true,
    created_at: '2026-09-30T00:00:00Z',
    created_by: null,
    ranking_mode_id: null,
    content_type_id: 'T05',
    image_source: null,
    description: null,
    shape: null,
    title_in_image: null,
    resolved_href: '/badges',
    resolved_badges: [unowned('a')],
    resolved_ranking: null,
    resolved_mission: null,
    resolved_collection: null,
    ...overrides,
  }
}

const html = (card: TodayCardWithHref) => renderToStaticMarkup(<TodayCard view={toCardView(card)} />)

describe('홈피드 카드 — 미보유 배지도 컬러', () => {
  it('커버가 없어 승격된 첫 배지 그림에 grayscale이 없다', () => {
    const out = html(makeCard({ shape: 'square' }))
    expect(out).toContain('https://cdn.example/a.png')
    expect(out).not.toContain('grayscale')
  })

  it('brief 썸네일에 grayscale이 없다', () => {
    const out = html(makeCard({ layout_type: 'shortcut' }))
    expect(out).toContain('https://cdn.example/a.png')
    expect(out).not.toContain('grayscale')
  })

  it('list 타일 그림에 grayscale이 없다', () => {
    const out = html(makeCard({ shape: 'list', badge_ids: ['a', 'b'], resolved_badges: [unowned('a'), unowned('b')] }))
    expect(out).toContain('https://cdn.example/b.png')
    expect(out).not.toContain('grayscale')
  })
})
