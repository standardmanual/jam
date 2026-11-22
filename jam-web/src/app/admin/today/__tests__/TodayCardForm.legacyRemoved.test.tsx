/**
 * 투데이 카드 폼 — 옛 노출 형태·옛 모양 선택이 없고 카드 유형은 늘 하나가 골라져 있다 (티켓 20261122_1153)
 *
 * 확인하는 것: 폼에 「노출 형태」 선택이 없고, 카드 유형 선택에 «옛 모양 그대로»가 없으며,
 * 새 카드의 기본 유형은 텍스트 박스(`text_box`)다. 유형이 비어 있던 옛 카드의 수정 화면도 텍스트 박스로 보인다.
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)로 그려진 모양만 본다.
 *
 * 실행: cd jam-web && npx vitest run src/app/admin/today/__tests__/TodayCardForm.legacyRemoved.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ComponentProps } from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import TodayCardForm from '../TodayCardForm'
import { FEED_TYPE_LABELS } from '../FeedCardSection'
import { DEFAULT_FEED_TYPE, EMPTY_FEED_CARD_FORM_VALUES, withDefaultFeedType } from '@/lib/admin/feedCardFields'
import type { TodayCardRow } from '@/types/database'

const BASE_PROPS: ComponentProps<typeof TodayCardForm> = {
  missions: [],
  itemBooks: [],
  rankingModes: [],
  recipes: [],
  badgeLabels: [],
  returnDate: '2026-11-22',
}

const savedCard = (patch: Partial<TodayCardRow> = {}): TodayCardRow =>
  ({
    id: 'card-1',
    template_type: 'badge_spotlight',
    layout_type: 'banner',
    shape: 'dome',
    title: '시험 카드',
    exposure_tags: ['all'],
    starts_at: '2026-11-22T00:00:00Z',
    ends_at: '2026-11-23T00:00:00Z',
    sort_order: 0,
    is_active: true,
    feed_type: null,
    ...patch,
  }) as unknown as TodayCardRow

describe('기본 카드 유형', () => {
  it('새 카드의 기본 유형은 텍스트 박스다', () => {
    expect(DEFAULT_FEED_TYPE).toBe('text_box')
    expect(withDefaultFeedType(EMPTY_FEED_CARD_FORM_VALUES).feedType).toBe('text_box')
  })

  it('이미 유형이 있으면 그대로 두고, 나머지 값도 바꾸지 않는다', () => {
    const values = { ...EMPTY_FEED_CARD_FORM_VALUES, feedType: 'hero_box' as const, feedSeed: '7' }
    expect(withDefaultFeedType(values)).toBe(values)
    expect(withDefaultFeedType({ ...EMPTY_FEED_CARD_FORM_VALUES, feedSeed: '7' })).toEqual({
      ...EMPTY_FEED_CARD_FORM_VALUES,
      feedType: 'text_box',
      feedSeed: '7',
    })
  })
})

describe('TodayCardForm — 옛 노출 형태·옛 모양이 없다', () => {
  it('새 카드 작성 화면에 「노출 형태」 선택이 없다', () => {
    const html = renderToStaticMarkup(<TodayCardForm {...BASE_PROPS} />)
    expect(html).not.toContain('노출 형태')
    expect(html).not.toContain('id="today-card-layout"')
    expect(html).not.toContain('바로가기형은 화면에 보이지 않아요')
  })

  it('새 카드는 카드 유형이 텍스트 박스로 골라져 있고 «옛 모양 그대로»가 없다', () => {
    const html = renderToStaticMarkup(<TodayCardForm {...BASE_PROPS} />)
    expect(html).toContain('id="feed-card-type"')
    expect(html).toContain(FEED_TYPE_LABELS.text_box)
    expect(html).not.toContain('옛 모양 그대로')
    expect(html).not.toContain('유형을 골라 주세요')
  })

  it('유형이 비어 있던 옛 카드의 수정 화면도 텍스트 박스로 보인다(저장하면 채워진다)', () => {
    const html = renderToStaticMarkup(<TodayCardForm {...BASE_PROPS} card={savedCard()} />)
    expect(html).not.toContain('노출 형태')
    expect(html).not.toContain('옛 모양 그대로')
    expect(html).toContain(FEED_TYPE_LABELS.text_box)
  })

  it('저장된 유형이 있으면 그 유형이 보인다', () => {
    const html = renderToStaticMarkup(<TodayCardForm {...BASE_PROPS} card={savedCard({ feed_type: 'gallery_list' })} />)
    expect(html).toContain(FEED_TYPE_LABELS.gallery_list)
  })
})
