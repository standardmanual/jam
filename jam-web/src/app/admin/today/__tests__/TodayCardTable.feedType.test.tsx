/**
 * 투데이 카드 표 「유형」 열 문구 (티켓 20261121_1318)
 *
 * 확인하는 것: 새 유형이면 한국어 유형 이름, 없으면 «옛 모양 (레이아웃 이름)», 모르는 값은 키 그대로.
 *
 * 실행: cd jam-web && npx vitest run src/app/admin/today/__tests__/TodayCardTable.feedType.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import { feedTypeCellText } from '../TodayCardTable'
import { FEED_TYPE_LABELS } from '../FeedCardSection'
import { TODAY_LAYOUT_OPTIONS } from '@/lib/admin/today-sections'
import { FEED_TYPES } from '@/lib/today/feedChipSlots'
import { TODAY_LIST_COLUMNS } from '@/lib/admin/today-list-query'

describe('feedTypeCellText', () => {
  it('새 유형 8개는 한국어 유형 이름이다', () => {
    for (const type of FEED_TYPES) {
      expect(feedTypeCellText({ feed_type: type, layout_type: 'large_thumbnail' })).toBe(FEED_TYPE_LABELS[type])
    }
    expect(feedTypeCellText({ feed_type: 'gallery_list', layout_type: 'other' })).toBe('목록형')
  })

  it('유형이 없으면 «옛 모양 (레이아웃 이름)»이다', () => {
    expect(feedTypeCellText({ feed_type: null, layout_type: 'large_thumbnail' })).toBe('옛 모양 (큰 썸네일형)')
    expect(feedTypeCellText({ layout_type: 'banner' })).toBe('옛 모양 (배너형)')
    for (const option of TODAY_LAYOUT_OPTIONS) {
      expect(feedTypeCellText({ feed_type: null, layout_type: option.value })).toBe(`옛 모양 (${option.label.split(' — ')[0]})`)
    }
  })

  it('모르는 값은 키를 그대로 보인다', () => {
    expect(feedTypeCellText({ feed_type: 'future_type' as never, layout_type: 'large_thumbnail' })).toBe('future_type')
    expect(feedTypeCellText({ feed_type: null, layout_type: 'mystery' as never })).toBe('옛 모양 (mystery)')
  })

  it('표 조회가 feed_type을 싣는다', () => {
    expect(TODAY_LIST_COLUMNS.split(', ')).toContain('feed_type')
  })
})
