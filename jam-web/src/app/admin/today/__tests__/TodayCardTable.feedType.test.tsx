/**
 * 투데이 카드 표 「유형」 열 문구 (티켓 20261121_1318)
 *
 * 확인하는 것: 새 유형이면 한국어 유형 이름, 없으면 «텍스트 박스(기본)», 모르는 값은 키 그대로(티켓 20261122_1153).
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
import { FEED_TYPES } from '@/lib/today/feedChipSlots'
import { TODAY_LIST_COLUMNS } from '@/lib/admin/today-list-query'

describe('feedTypeCellText', () => {
  it('새 유형 8개는 한국어 유형 이름이다', () => {
    for (const type of FEED_TYPES) {
      expect(feedTypeCellText({ feed_type: type })).toBe(FEED_TYPE_LABELS[type])
    }
    expect(feedTypeCellText({ feed_type: 'gallery_list' })).toBe('목록형')
  })

  it('유형이 없는 옛 데이터는 «텍스트 박스(기본)»이다 — 홈이 텍스트 박스로 그린다', () => {
    expect(feedTypeCellText({ feed_type: null })).toBe('텍스트 박스(기본)')
    expect(feedTypeCellText({})).toBe('텍스트 박스(기본)')
  })

  it('모르는 값은 키를 그대로 보인다', () => {
    expect(feedTypeCellText({ feed_type: 'future_type' as never })).toBe('future_type')
  })

  it('표 조회가 feed_type을 싣고 노출 형태(layout_type)는 싣지 않는다', () => {
    const columns = TODAY_LIST_COLUMNS.split(', ')
    expect(columns).toContain('feed_type')
    expect(columns).not.toContain('layout_type')
  })
})
