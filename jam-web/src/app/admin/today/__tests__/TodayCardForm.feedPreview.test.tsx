/**
 * 투데이 카드 폼 — 홈 화면 미리보기에 개편 칸 연결 (티켓 20261121_1318, 상위 20261120_2026 5회차-4)
 *
 * 확인하는 것: 폼 값 → 미리보기 카드 행 변환(`feedPreviewFields`), 그 행을 `toCardView`로 바꾼 결과의 유형·색·칩,
 * 고정 시드, «자동»은 NULL, 유형을 비우면 옛 미리보기 그대로, 수정 화면의 안내 문구와 한계 접이식 문구.
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)로 그려진 모양만 본다.
 *
 * 실행: cd jam-web && npx vitest run src/app/admin/today/__tests__/TodayCardForm.feedPreview.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ComponentProps } from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import TodayCardForm, { FEED_PREVIEW_LIMITS, FEED_PREVIEW_SEED, feedPreviewFields } from '../TodayCardForm'
import { EMPTY_FEED_CARD_FORM_VALUES, type FeedCardFormValues } from '@/lib/admin/feedCardFields'
import { toCardView } from '@/lib/today/cardView'
import { FEED_TYPES } from '@/lib/today/feedChipSlots'
import type { TodayCardWithHref } from '@/lib/today/cards'
import type { TodayCardRow } from '@/types/database'

const values = (patch: Partial<FeedCardFormValues> = {}): FeedCardFormValues => ({ ...EMPTY_FEED_CARD_FORM_VALUES, ...patch })

const baseRow = {
  id: 'preview',
  template_type: 'badge_spotlight',
  layout_type: 'large_thumbnail',
  shape: null,
  title: '성수동 배지',
  subtitle: null,
  description: null,
  cover_image_url: 'https://example.com/cover.png',
  badge_ids: [],
  exposure_tags: ['all'],
  starts_at: '2026-11-21T00:00:00Z',
  ends_at: '2026-11-22T00:00:00Z',
  sort_order: 0,
  is_active: true,
} as unknown as TodayCardRow

const viewOf = (patch: Partial<FeedCardFormValues>) => {
  const card = {
    ...baseRow,
    ...feedPreviewFields(values(patch)),
    resolved_href: null,
    resolved_badges: [{ id: 'b1', name: '배지', image_url: 'https://example.com/b.png', rarity: null }],
  } as unknown as TodayCardWithHref
  return toCardView(card, { now: new Date('2026-11-21T03:00:00Z') })
}

describe('feedPreviewFields — 폼 값을 미리보기 행에 싣는 값으로', () => {
  it('유형이 비어 있으면 새 칸을 하나도 싣지 않는다(옛 7모양 미리보기 그대로)', () => {
    expect(feedPreviewFields(values({ bgColorKey: 'red', stampMode: 'on', titleChipWords: ['성수동'] }))).toEqual({})
  })

  it('«자동»인 칸은 NULL로 싣는다', () => {
    const fields = feedPreviewFields(values({ feedType: 'hero_box' }))
    expect(fields.feed_type).toBe('hero_box')
    expect(fields.bg_color_key).toBeNull()
    expect(fields.chip_color_key).toBeNull()
    expect(fields.box_color_key).toBeNull()
    expect(fields.chips).toBeNull()
    expect(fields.show_description).toBeNull()
    expect(fields.stamp_enabled).toBeNull()
    expect(fields.title_chip_words).toBeNull()
  })

  it('지정한 값은 그대로 싣는다', () => {
    const fields = feedPreviewFields(
      values({ feedType: 'text_box', bgColorKey: 'ref-blue', chipsMode: 'none', stampMode: 'on', stampSlot: 'top-left', titleChipWords: ['성수동'] }),
    )
    expect(fields.bg_color_key).toBe('ref-blue')
    expect(fields.chips).toEqual([])
    expect(fields.stamp_enabled).toBe(true)
    expect(fields.stamp_slot).toBe('top-left')
    expect(fields.title_chip_words).toEqual(['성수동'])
  })

  it('저장된 시드가 없으면 고정 시드를, 있으면 그 시드를 쓴다', () => {
    expect(feedPreviewFields(values({ feedType: 'hero_box' })).feed_seed).toBe(FEED_PREVIEW_SEED)
    expect(feedPreviewFields(values({ feedType: 'badge_only' })).feed_seed).toBe(FEED_PREVIEW_SEED)
    expect(feedPreviewFields(values({ feedType: 'hero_box', feedSeed: '12345' })).feed_seed).toBe(12345)
    expect(feedPreviewFields(values({ feedType: 'hero_box', feedSeed: 'abc' })).feed_seed).toBe(FEED_PREVIEW_SEED)
  })

  it('유형 8개 키는 모두 폼 값으로 만들 수 있다', () => {
    for (const type of FEED_TYPES) expect(feedPreviewFields(values({ feedType: type })).feed_type).toBe(type)
  })
})

describe('미리보기 표시 데이터(toCardView)', () => {
  it('유형을 비우면 새 갈래가 아니라 옛 모양 표시 데이터다', () => {
    expect('feedType' in viewOf({})).toBe(false)
  })

  it('새 유형을 고르면 그 유형의 표시 데이터가 된다', () => {
    for (const type of ['hero_box', 'badge_intro', 'badge_only', 'text_box'] as const) {
      expect((viewOf({ feedType: type }) as { feedType?: string }).feedType, type).toBe(type)
    }
  })

  it('지정한 배경색이 그릴 값에 반영된다', () => {
    const view = viewOf({ feedType: 'hero_box', bgColorKey: 'ref-pink' }) as unknown as { look: { colors: { bg: string } } }
    expect(view.look.colors.bg).toBe('ref-pink')
  })

  it('«칩 없음»이면 칩이 없고 «직접»의 문구 칩은 그대로 보인다', () => {
    const none = viewOf({ feedType: 'hero_box', chipsMode: 'none' }) as unknown as { look: { chips: unknown[] } }
    expect(none.look.chips).toHaveLength(0)
    const custom = viewOf({
      feedType: 'hero_box',
      chipsMode: 'custom',
      chips: [{ kind: 'phrase', source: '', text: '새로 나왔어요', slot: '', tilt: '' }],
    }) as unknown as { look: { chips: { text?: string }[] } }
    expect(custom.look.chips.map((c) => c.text)).toContain('새로 나왔어요')
  })

  it('같은 입력은 두 번 그려도 같은 값이다(고정 시드)', () => {
    expect(JSON.stringify(viewOf({ feedType: 'hero_box' }))).toBe(JSON.stringify(viewOf({ feedType: 'hero_box' })))
  })
})

describe('TodayCardForm — 미리보기 한계 접이식과 수정 화면 안내', () => {
  const props: ComponentProps<typeof TodayCardForm> = {
    missions: [],
    itemBooks: [],
    rankingModes: [],
    recipes: [],
    badgeLabels: [],
    returnDate: '2026-11-21',
  }
  const cardOf = (patch: Partial<TodayCardRow>): TodayCardRow => ({ ...baseRow, id: 'card-1', ...patch }) as TodayCardRow

  it('접이식 제목과 세 한계 문구가 있고 기본은 접혀 있다', () => {
    const html = renderToStaticMarkup(<TodayCardForm {...props} />)
    expect(html).toContain('미리보기와 홈이 다를 수 있는 것')
    expect(html).toContain('data-state="closed"')
    expect(FEED_PREVIEW_LIMITS).toHaveLength(3)
    expect(FEED_PREVIEW_LIMITS[2]).toContain('저장하면 홈에서 컬렉션 배지가 보여요')
  })

  it('수정 화면이 저장된 커버 대표 색을 이미지 규칙 경고에 쓰고, 새 카드는 경고 없이 안내 한 줄만 보인다(티켓 20261121_1829)', () => {
    const saved = cardOf({ feed_type: 'hero_box', bg_color_key: 'red', cover_colors: ['#FF1D1D'] } as Partial<TodayCardRow>)
    const edited = renderToStaticMarkup(<TodayCardForm {...props} card={saved} />)
    expect(edited).toContain('이미지의 대표 색과 너무 비슷해서 묻혀요')
    expect(edited).not.toContain('feed-cover-colors-notice')
    // 대표 색을 모르는 저장 카드(아직 안 뽑음)는 경고도 안내도 없다.
    const unknown = renderToStaticMarkup(<TodayCardForm {...props} card={cardOf({ feed_type: 'hero_box', bg_color_key: 'red' })} />)
    expect(unknown).not.toContain('이미지의 대표 색과 너무 비슷해서 묻혀요')
    expect(unknown).not.toContain('feed-cover-colors-notice')
  })

  it('수정 화면에서 배지 소개의 연결 배지 대표 색(bg_colors)으로 경고한다', () => {
    const badge = { id: 'b1', name: '배지', rarity: 'common', type: 'item', point_reward: 0, bg_colors: ['#FF1D1D'] }
    const card = cardOf({ template_type: 'badge_spotlight', feed_type: 'badge_intro', bg_color_key: 'red', badge_ids: ['b1'] } as Partial<TodayCardRow>)
    const html = renderToStaticMarkup(<TodayCardForm {...props} card={card} badgeLabels={[badge]} />)
    expect(html).toContain('이미지의 대표 색과 너무 비슷해서 묻혀요')
    expect(renderToStaticMarkup(<TodayCardForm {...props} card={card} badgeLabels={[{ ...badge, bg_colors: null }]} />)).not.toContain(
      '이미지의 대표 색과 너무 비슷해서 묻혀요',
    )
  })

  it('저장된 새 유형 카드를 수정하면 자동 값 안내가 보인다', () => {
    const html = renderToStaticMarkup(<TodayCardForm {...props} card={cardOf({ feed_type: 'hero_box', feed_seed: 77 })} />)
    expect(html).toContain('저장할 때 자동으로 정해진 값은 그대로 보여요')
  })

  it('옛 모양 카드를 수정하거나 새 카드를 만들 때는 안내가 없다', () => {
    expect(renderToStaticMarkup(<TodayCardForm {...props} card={cardOf({})} />)).not.toContain('저장할 때 자동으로 정해진 값은')
    expect(renderToStaticMarkup(<TodayCardForm {...props} />)).not.toContain('저장할 때 자동으로 정해진 값은')
  })
})
