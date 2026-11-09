/**
 * 투데이 카드 폼 — 설명문 칸은 홈이 설명 문단을 그리는 유형에만 열린다 (티켓 20261109_1519)
 *
 * 확인하는 것: 배지 소개·컨텐츠 소개는 설명문 칸이 있고, 그 밖의 유형(미션·드랍·기사 등)은 칸이 없다.
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
import { DESCRIPTION_TEMPLATES } from '@/lib/today/shape'
import { TODAY_TEMPLATE_OPTIONS } from '@/lib/admin/today-sections'
import type { TodayCardRow, TodayCardTemplateType } from '@/types/database'

function cardOf(template: TodayCardTemplateType): TodayCardRow {
  return {
    id: 'card-1',
    template_type: template,
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

const render = (template: TodayCardTemplateType): string => renderToStaticMarkup(<TodayCardForm {...BASE_PROPS} card={cardOf(template)} />)

describe('TodayCardForm — 설명문 칸', () => {
  it('설명 문단을 그리는 유형(배지 소개·컨텐츠 소개)은 설명문 칸이 있다', () => {
    for (const template of DESCRIPTION_TEMPLATES) {
      const html = render(template)
      expect(html, template).toContain('id="today-card-description"')
      expect(html, template).toContain('저장돼 있던 설명')
    }
  })

  it('그 밖의 유형은 설명문 칸이 없다', () => {
    const hidden = TODAY_TEMPLATE_OPTIONS.map((o) => o.value).filter((t) => !(DESCRIPTION_TEMPLATES as readonly string[]).includes(t))
    expect(hidden.length).toBeGreaterThan(0)
    for (const template of hidden) {
      expect(render(template), template).not.toContain('id="today-card-description"')
    }
  })
})
