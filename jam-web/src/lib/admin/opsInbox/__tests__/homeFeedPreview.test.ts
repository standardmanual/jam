/**
 * 기획 상세 [홈피드로 보기]의 값 계산 (티켓 20261026_2025 2회차)
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/opsInbox/__tests__/homeFeedPreview.test.ts
 */
import { describe, it, expect } from 'vitest'
import { earliestStartsAt, homeFeedInitialDate } from '../homeFeedPreview'

describe('earliestStartsAt', () => {
  it('항목 중 가장 이른 공개 시각을 고른다(표기 오프셋이 달라도 시각으로 비교한다)', () => {
    expect(
      earliestStartsAt([
        { startsAt: '2026-12-30T09:00:00+09:00' },
        { startsAt: '2026-12-29T23:00:00Z' }, // KST 12/30 08:00 — 위보다 이르다
        { startsAt: null },
        { startsAt: '2027-01-02T00:00:00+09:00' },
      ]),
    ).toBe('2026-12-29T23:00:00Z')
  })

  it('읽을 수 있는 시각이 없으면 null이다', () => {
    expect(earliestStartsAt([])).toBeNull()
    expect(earliestStartsAt([{ startsAt: null }, { startsAt: '시각 아님' }])).toBeNull()
  })
})

describe('homeFeedInitialDate', () => {
  const NOW = new Date('2026-10-05T03:00:00Z')
  it('공개 시각이 있으면 그 KST 날짜다', () => {
    expect(homeFeedInitialDate('2026-12-29T16:30:00Z', '2026-12-28', NOW)).toBe('2026-12-30')
  })
  it('공개 시각이 없으면 묶음 주 월요일, 그것도 없으면 오늘이다', () => {
    expect(homeFeedInitialDate(null, '2026-12-28', NOW)).toBe('2026-12-28')
    expect(homeFeedInitialDate(null, null, NOW)).toBe('2026-10-05')
  })
})
