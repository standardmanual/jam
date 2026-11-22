/**
 * 투데이 카드 목록 표·상세 — 노출 형태 열·항목이 없고 카드 유형이 보인다 (티켓 20261122_1153)
 *
 * 확인하는 것: 표에 「노출형태」 열이 없고 「유형」 열에 새 유형 이름(NULL은 «텍스트 박스(기본)»)이 보인다.
 * 상세 화면의 「노출 형태」 항목은 「카드 유형」으로 바뀌었다.
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)로 그려진 모양만 본다.
 *
 * 실행: cd jam-web && npx vitest run src/app/admin/today/__tests__/TodayCardTable.legacyRemoved.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import { TodayCardTable } from '../TodayCardTable'
import TodayCardDetail from '@/components/admin/today/TodayCardDetail'
import type { TodayListRow } from '@/lib/admin/today-list-query'
import type { TodayCardRow } from '@/types/database'

const listRow = (patch: Partial<TodayListRow> = {}): TodayListRow =>
  ({
    id: 'card-1',
    title: '시험 카드',
    template_type: 'badge_spotlight',
    exposure_tags: ['all'],
    starts_at: '2026-11-22T00:00:00Z',
    ends_at: '2026-11-23T00:00:00Z',
    sort_order: 0,
    is_active: true,
    created_at: '2026-11-21T00:00:00Z',
    image_source: null,
    feed_type: null,
    ...patch,
  }) as TodayListRow

describe('TodayCardTable — 노출형태 열이 없다', () => {
  it('열 머리에 「노출형태」가 없고 「유형」이 있다', () => {
    const html = renderToStaticMarkup(<TodayCardTable cards={[listRow()]} selectedDate="2026-11-22" totalCount={1} />)
    expect(html).not.toContain('노출형태')
    expect(html).toContain('유형')
  })

  it('유형 열은 새 유형 이름이고 NULL은 «텍스트 박스(기본)»이다', () => {
    const html = renderToStaticMarkup(
      <TodayCardTable
        cards={[listRow({ id: 'a', feed_type: 'gallery_list' }), listRow({ id: 'b', feed_type: null })]}
        selectedDate="2026-11-22"
        totalCount={2}
      />,
    )
    expect(html).toContain('목록형')
    expect(html).toContain('텍스트 박스(기본)')
    expect(html).not.toContain('옛 모양')
  })
})

describe('TodayCardDetail — 노출 형태 항목이 카드 유형으로 바뀌었다', () => {
  const card = (patch: Partial<TodayCardRow> = {}): TodayCardRow =>
    ({
      id: 'card-1',
      template_type: 'badge_spotlight',
      layout_type: 'banner',
      shape: null,
      title: '시험 카드',
      exposure_tags: ['all'],
      starts_at: '2026-11-22T00:00:00Z',
      ends_at: '2026-11-23T00:00:00Z',
      sort_order: 0,
      is_active: true,
      badge_ids: [],
      feed_type: null,
      ...patch,
    }) as unknown as TodayCardRow

  it('「노출 형태」가 없고 「카드 유형」에 유형 이름이 보인다', () => {
    const html = renderToStaticMarkup(
      <TodayCardDetail card={card({ feed_type: 'hero_box' })} linkedBadges={[]} returnDate="2026-11-22" />,
    )
    expect(html).not.toContain('노출 형태')
    expect(html).toContain('카드 유형')
    expect(html).toContain('히어로')
  })

  it('유형이 비어 있는 카드는 «텍스트 박스(기본)»으로 보인다', () => {
    const html = renderToStaticMarkup(<TodayCardDetail card={card()} linkedBadges={[]} returnDate="2026-11-22" />)
    expect(html).toContain('텍스트 박스(기본)')
  })
})
