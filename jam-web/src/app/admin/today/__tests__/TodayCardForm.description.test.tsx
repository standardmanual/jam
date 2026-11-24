/**
 * 투데이 카드 폼 — 설명문 칸은 카드 유형(feed_type)이 설명을 보일 때만 열린다 (티켓 20261109_1519, 20261124_1119)
 *
 * 확인하는 것: 템플릿과 무관하게 `DESCRIPTION_DEFAULT`가 참인 카드 유형은 설명문 칸이 있고, 거짓인 유형은 칸이 없다.
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)로 그려진 모양만 본다.
 *
 * 실행: cd jam-web && npx vitest run src/app/admin/today/__tests__/TodayCardForm.description.test.tsx
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
import { DESCRIPTION_DEFAULT } from '@/lib/today/feedLook'
import { FEED_TYPES } from '@/lib/today/feedChipSlots'
import type { TodayCardRow, TodayCardTemplateType } from '@/types/database'

function cardOf(template: TodayCardTemplateType, feedType: string): TodayCardRow {
  return {
    id: 'card-1',
    template_type: template,
    feed_type: feedType,
    layout_type: 'large_thumbnail',
    title: '시험 카드',
    description: '저장돼 있던 설명',
    exposure_tags: ['all'],
    starts_at: '2026-10-27T00:00:00Z',
    ends_at: '2026-10-28T00:00:00Z',
    sort_order: 0,
    is_active: true,
  } as unknown as TodayCardRow
}

const BASE_PROPS: ComponentProps<typeof TodayCardForm> = {
  missions: [],
  itemBooks: [],
  rankingModes: [],
  recipes: [],
  badgeLabels: [],
  returnDate: '2026-10-27',
}

const render = (template: TodayCardTemplateType, feedType: string): string =>
  renderToStaticMarkup(<TodayCardForm {...BASE_PROPS} card={cardOf(template, feedType)} />)

describe('TodayCardForm — 설명문 칸', () => {
  it('카드 유형마다 DESCRIPTION_DEFAULT가 참이면 칸과 저장된 설명이 있고, 거짓이면 칸이 없다', () => {
    for (const feedType of FEED_TYPES) {
      const html = render('mission_spotlight', feedType)
      if (DESCRIPTION_DEFAULT[feedType]) {
        expect(html, feedType).toContain('id="today-card-description"')
        expect(html, feedType).toContain('저장돼 있던 설명')
      } else {
        expect(html, feedType).not.toContain('id="today-card-description"')
      }
    }
  })

  it('템플릿과 무관하다: badge_spotlight + text_box는 칸이 없고 mission_spotlight + hero_box는 칸이 있다', () => {
    expect(render('badge_spotlight', 'text_box')).not.toContain('id="today-card-description"')
    expect(render('mission_spotlight', 'hero_box')).toContain('id="today-card-description"')
  })

  it('새 카드(기본 유형 텍스트)는 칸이 없다', () => {
    const html = renderToStaticMarkup(<TodayCardForm {...BASE_PROPS} />)
    expect(html).not.toContain('id="today-card-description"')
  })

  it('도움말이 숨김 유형 이름을 담는다', () => {
    const html = render('mission_spotlight', 'hero_box')
    expect(html).toContain('전체 배경 이미지·배지만·텍스트')
  })
})
