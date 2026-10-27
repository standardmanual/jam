/**
 * 홈피드 미리보기 화면 시험이 함께 쓰는 값 (티켓 20261026_2025 2회차)
 */
import type { TodayCardWithHref } from '@/lib/today/cards'
import type { DayPreview, PreviewEntry } from '../homePreviewClient'

export function makeCard(id: string, overrides: Partial<TodayCardWithHref> = {}): TodayCardWithHref {
  return {
    id,
    template_type: 'editorial_article',
    layout_type: 'large_thumbnail',
    title: `카드 ${id}`,
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
    ends_at: '2026-12-31T00:00:00Z',
    sort_order: 0,
    is_active: true,
    created_at: '2026-09-30T00:00:00Z',
    created_by: null,
    ranking_mode_id: null,
    content_type_id: null,
    image_source: null,
    resolved_href: '/badges',
    resolved_badges: [],
    resolved_ranking: null,
    ...overrides,
  }
}

export function live(id: string, shape = 'hero'): PreviewEntry {
  return { source: 'live', id, card: makeCard(id, { shape } as Partial<TodayCardWithHref>), rationale: [] }
}

export function pending(id: string, rationale: PreviewEntry['rationale'] = [], shape = 'brief'): PreviewEntry {
  return { source: 'pending', id, card: makeCard(id, { shape } as Partial<TodayCardWithHref>), rationale }
}

export function makeDay(date: string, entries: PreviewEntry[], inputs: Partial<DayPreview['inputs']> = {}): DayPreview {
  const shapeCounts: Record<string, number> = {}
  for (const { card } of entries) {
    const shape = (card as { shape?: string }).shape ?? 'hero'
    shapeCounts[shape] = (shapeCounts[shape] ?? 0) + 1
  }
  return {
    date,
    entries,
    shapeCounts,
    pendingCount: entries.filter((e) => e.source === 'pending').length,
    inputs: { weather: 'rain', specialDays: [], stored: true, used: { weather: 'rain', specialDays: [] }, ...inputs },
  }
}

/** 2026-10-05(월)부터 7일. 날마다 카드 수가 다르다(0·1·2·3·…) */
export function makeWeek(): DayPreview[] {
  const dates = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']
  return dates.map((date, index) =>
    makeDay(
      date,
      Array.from({ length: index }, (_, i) => (i === index - 1 && index >= 3 ? pending(`${date}-p${i}`) : live(`${date}-l${i}`, i % 2 === 0 ? 'hero' : 'square'))),
    ),
  )
}
