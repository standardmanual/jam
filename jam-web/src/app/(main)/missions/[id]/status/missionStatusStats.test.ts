import { describe, expect, it } from 'vitest'
import { formatProgressWithUnit, gapToFirstText } from './missionStatusStats'
import type { RankingEntry } from './missionStatusTypes'

const rank = (userId: string, rankNo: number, progressValue: number): RankingEntry => ({
  userId, displayName: userId, username: userId, avatarUrl: null, progressValue, isCompleted: false, completedAt: null, rank: rankNo,
})

describe('gapToFirstText — «1위와 차이»', () => {
  const entries = [rank('a', 1, 30), rank('me', 2, 20)]
  it('1위 값에서 내 값을 뺀 만큼을 단위와 함께 보인다', () => {
    expect(gapToFirstText(entries, entries[1], 'distance')).toBe('10.0km')
    expect(gapToFirstText(entries, rank('me', 2, 7), 'activity_count')).toBe('23회')
  })
  it('내가 1위이거나 me가 없거나 1위 행이 없으면 «—»다', () => {
    expect(gapToFirstText(entries, entries[0], 'distance')).toBe('—')
    expect(gapToFirstText(entries, null, 'distance')).toBe('—')
    expect(gapToFirstText([], rank('me', 3, 5), 'distance')).toBe('—')
  })
  it('값이 더 커도 0 아래로 내려가지 않는다', () => {
    expect(gapToFirstText(entries, rank('me', 2, 31), 'distance')).toBe('0.0km')
  })
})

describe('formatProgressWithUnit', () => {
  it('값과 단위를 붙인다', () => {
    expect(formatProgressWithUnit(12, 'distance')).toBe('12.0km')
    expect(formatProgressWithUnit(3.9, 'streak_days')).toBe('3일')
  })
})
