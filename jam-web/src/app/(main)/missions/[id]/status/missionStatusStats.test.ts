import { describe, expect, it } from 'vitest'
import { achievedCount, formatProgressWithUnit, gapToFirstText } from './missionStatusStats'
import type { AchievementEntry, RankingEntry } from './missionStatusTypes'

const rank = (userId: string, rankNo: number, progressValue: number): RankingEntry => ({
  userId, displayName: userId, username: userId, avatarUrl: null, progressValue, isCompleted: false, completedAt: null, rank: rankNo,
})
const person = (userId: string, achieved: boolean): AchievementEntry => ({
  userId, displayName: userId, username: userId, avatarUrl: null, achieved, achievedAt: null,
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

describe('achievedCount — «달성한 참가자»', () => {
  it('잘리지 않았으면 보이는 달성자 + 내 달성 여부다', () => {
    const others = [person('a', true), person('b', false)]
    expect(achievedCount(others, person('me', true), 3)).toBe(2)
    expect(achievedCount(others, person('me', false), 3)).toBe(1)
    expect(achievedCount(others, null, 2)).toBe(1)
  })
  it('잘렸어도 보이는 행에 미달성자가 있으면(달성자가 먼저 나오므로) 정확하다', () => {
    const others = [person('a', true), person('b', false)]
    expect(achievedCount(others, person('me', true), 10)).toBe(2)
  })
  it('잘렸는데 보이는 행이 전부 달성자이면 알 수 없어 null이다', () => {
    expect(achievedCount([person('a', true), person('b', true)], person('me', true), 10)).toBeNull()
    expect(achievedCount([], person('me', true), 5)).toBeNull()
  })
  it('다른 참가자가 없으면 내 여부만으로 센다', () => {
    expect(achievedCount([], person('me', true), 1)).toBe(1)
    expect(achievedCount([], person('me', false), 1)).toBe(0)
  })
})

describe('formatProgressWithUnit', () => {
  it('값과 단위를 붙인다', () => {
    expect(formatProgressWithUnit(12, 'distance')).toBe('12.0km')
    expect(formatProgressWithUnit(3.9, 'streak_days')).toBe('3일')
  })
})
