/**
 * 자동 카드의 아이콘 — 홈과 미리보기가 같은 아이콘을 그린다 (티켓 20261001_2244, 상위 20260930_1453 조각 b7)
 *
 * 자원 `auto`는 진행 알림(`progress_nudge`)과 지역 트렌드(`location_trend`)를 한 값으로 묶는다. 예전에는 지역 값이 있으면 핀을 그렸으므로
 * 진행 알림 카드에 지역 값이 들어 있으면 핀이 됐다. 이제 표시 데이터의 템플릿 구분 값(`template`)으로 정한다: 지역 트렌드는 핀, 진행 알림은 모래시계(지역 값과 무관).
 * 홈은 표시 데이터에 계측 정보(`tracking`)를 싣고 미리보기는 싣지 않는데, 두 쪽이 같은 아이콘을 그려야 한다. 카드 데이터에서 출발해
 * `toCardView` → `TodayCard`까지 이어서 확인한다(`resourceIconOf` 단위 시험은 `resourceIcon.test.tsx`).
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `renderToStaticMarkup`으로 확인한다.
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
  default: ({ children }: { children: ReactNode }) => <div data-tracker="">{children}</div>,
}))

import TodayCard from '../TodayCard'
import { resourceIconOf } from '../resourceIcon'
import { toCardView } from '@/lib/today/cardView'
import type { TodayCardWithHref } from '@/lib/today/cards'

function makeCard(overrides: Partial<TodayCardWithHref>): TodayCardWithHref {
  return {
    id: 'card-1',
    template_type: 'progress_nudge',
    layout_type: 'shortcut',
    title: '한강 러닝 챌린지가 곧 끝나요',
    subtitle: null,
    description: null,
    cover_image_url: null,
    badge_ids: [],
    mission_id: null,
    item_book_id: null,
    region_label: null,
    body_markdown: null,
    target_href: null,
    exposure_tags: ['all'],
    starts_at: '2026-10-01T00:00:00Z',
    ends_at: '2026-10-31T00:00:00Z',
    sort_order: 0,
    is_active: true,
    created_at: '2026-09-30T00:00:00Z',
    created_by: null,
    ranking_mode_id: null,
    content_type_id: null,
    image_source: null,
    shape: null,
    title_in_image: null,
    resolved_href: '/missions/m1',
    resolved_badges: [],
    resolved_ranking: null,
    resolved_mission: null,
    resolved_collection: null,
    ...overrides,
  }
}

/** `brief`의 64px 칸이 그리는 아이콘 마크업(`CardThumb`의 크기·색) */
const THUMB_CLASS = 'w-6 h-6 text-text-inverse/60'
const thumbIcon = (template: 'progress_nudge' | 'location_trend') =>
  renderToStaticMarkup(resourceIconOf({ resource: 'auto', template }, { className: THUMB_CLASS }))

const HOME = { tracking: true }
const PREVIEW = {}

describe('자동 카드 아이콘 — 지역 트렌드는 핀, 진행 알림은 모래시계', () => {
  it('두 아이콘은 서로 다르다', () => {
    expect(thumbIcon('progress_nudge')).not.toBe(thumbIcon('location_trend'))
  })

  it.each([
    ['홈(tracking 있음)', HOME],
    ['미리보기(tracking 없음)', PREVIEW],
  ])('%s: 진행 알림은 지역 값이 있어도 모래시계다', (_name, options) => {
    const html = renderToStaticMarkup(
      <TodayCard view={toCardView(makeCard({ template_type: 'progress_nudge', region_label: '성수동' }), options)} />,
    )
    expect(html).toContain(thumbIcon('progress_nudge'))
    expect(html).not.toContain(thumbIcon('location_trend'))
  })

  it.each([
    ['홈(tracking 있음)', HOME],
    ['미리보기(tracking 없음)', PREVIEW],
  ])('%s: 지역 트렌드는 핀이다', (_name, options) => {
    const html = renderToStaticMarkup(
      <TodayCard view={toCardView(makeCard({ template_type: 'location_trend', region_label: '성수동' }), options)} />,
    )
    expect(html).toContain(thumbIcon('location_trend'))
    expect(html).not.toContain(thumbIcon('progress_nudge'))
  })

  it('홈과 미리보기가 같은 아이콘을 그린다(두 템플릿 모두)', () => {
    for (const template_type of ['progress_nudge', 'location_trend'] as const) {
      const card = makeCard({ template_type, region_label: '성수동' })
      const icon = thumbIcon(template_type)
      expect(renderToStaticMarkup(<TodayCard view={toCardView(card, HOME)} />)).toContain(icon)
      expect(renderToStaticMarkup(<TodayCard view={toCardView(card, PREVIEW)} />)).toContain(icon)
    }
  })

  it('이미지가 없는 이미지 모양의 자리 표시도 같은 규칙이다(hero로 저장된 진행 알림은 지역 값이 있어도 모래시계)', () => {
    const slotClass = 'w-8 h-8 text-text/60'
    const hourglass = renderToStaticMarkup(resourceIconOf({ resource: 'auto', template: 'progress_nudge' }, { className: slotClass }))
    const pin = renderToStaticMarkup(resourceIconOf({ resource: 'auto', template: 'location_trend' }, { className: slotClass }))
    const html = renderToStaticMarkup(
      <TodayCard view={toCardView(makeCard({ shape: 'hero', template_type: 'progress_nudge', region_label: '성수동' }), HOME)} />,
    )
    expect(html).toContain(hourglass)
    expect(html).not.toContain(pin)
  })
})
