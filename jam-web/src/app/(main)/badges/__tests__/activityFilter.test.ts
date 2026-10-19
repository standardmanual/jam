/**
 * 배지함 종목 필터의 «공통» 옵션 (티켓 20261018_1817, 2회)
 *
 * «공통»은 `activity_types`가 비어 있는 모든 배지다. 예전 «JAM!» 옵션은 `admin_category='jam'`
 * 배지 12개만 골랐지만, «공통»은 합산 배지 8개까지 함께 고른다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/badges/__tests__/activityFilter.test.ts"
 */
import { describe, it, expect } from 'vitest'
import { matchesActivityFilter } from '../activityFilter'
import { BADGE_ACTIVITY_FILTER_LABELS } from '@/lib/utils'

describe('matchesActivityFilter', () => {
  it('«전체»는 종목이 있든 없든 모두 통과한다', () => {
    expect(matchesActivityFilter([], 'all')).toBe(true)
    expect(matchesActivityFilter(['running'], 'all')).toBe(true)
  })

  it('«공통»은 activity_types가 빈 배지만 통과한다', () => {
    expect(matchesActivityFilter([], 'common')).toBe(true)
    expect(matchesActivityFilter(['running'], 'common')).toBe(false)
    expect(matchesActivityFilter(['running', 'cycling'], 'common')).toBe(false)
  })

  it('종목을 고르면 그 종목을 가진 배지만 통과하고, 종목이 빈 배지는 빠진다', () => {
    expect(matchesActivityFilter(['running'], 'running')).toBe(true)
    expect(matchesActivityFilter(['running', 'cycling'], 'cycling')).toBe(true)
    expect(matchesActivityFilter(['cycling'], 'running')).toBe(false)
    expect(matchesActivityFilter([], 'running')).toBe(false)
  })
})

describe('필터 라벨', () => {
  it('«공통»이 있고 «JAM!» 옵션은 없다', () => {
    expect(BADGE_ACTIVITY_FILTER_LABELS.common).toBe('공통')
    expect(BADGE_ACTIVITY_FILTER_LABELS.jam).toBeUndefined()
  })
})
