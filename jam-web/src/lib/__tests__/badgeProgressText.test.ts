/**
 * badgeProgressText.ts 회귀 테스트 — 조건값 한 줄 표기(`formatStopConditionValue`).
 *
 * 진행 문구를 조립하던 나머지 함수와 그 시험은 배지 트리 화면 제거와 함께 걷어냈다
 * (티켓 20261018_1817, 2회). 남은 함수는 `badgeTree.ts`가 계열 눈금의 조건 문구에 쓴다.
 */
import { describe, it, expect } from 'vitest'
import { formatStopConditionValue } from '@/lib/badgeProgressText'
import type { BadgeCondition } from '@/types/database'

describe('formatStopConditionValue (티켓 20260906_1323 §7)', () => {
  it('measurable 하나면 그 필드의 chip을 그대로 쓴다', () => {
    expect(formatStopConditionValue({ distance_km: 4 } as BadgeCondition)).toBe('누적 4km')
  })

  it('여럿이면 registry 선언 순서대로 " · "로 잇는다', () => {
    // 「완전한 하루」 실데이터 — 단위만 붙이면 「6일 · 1일 · 5회」가 되어 무엇의 숫자인지 사라진다.
    const text = formatStopConditionValue({
      streak_days: 6,
      rest_after_streak: 1,
      repeat_count: 5,
    } as BadgeCondition)
    expect(text).toBe('6일 연속 · 연속 후 휴식 1일 · 5회 충족')
  })

  it('measurable이 4개 이상이어도 최대 3개까지만 적는다', () => {
    const text = formatStopConditionValue({
      distance_km: 10,
      total_count: 3,
      streak_days: 2,
      active_days_count: 30,
    } as BadgeCondition)
    expect(text).toBe('누적 10km · 3회 · 2일 연속')
  })

  it('filter 역할 필드(요일 등)는 세지 않는다 — measurable만 고른다', () => {
    // day_of_week는 role: 'filter'라 조건값에 들어가지 않는다.
    expect(formatStopConditionValue({ day_of_week: ['saturday'], total_count: 5 } as BadgeCondition)).toBe('5회')
  })

  it('measurable이 하나도 없으면 null — 호출부가 기존 폴백을 쓴다', () => {
    expect(formatStopConditionValue({ mission_reward: true } as BadgeCondition)).toBeNull()
    expect(formatStopConditionValue(null)).toBeNull()
  })

  it('페이스 축은 mm:ss로 적는다(원값 「초」를 그대로 보여주지 않는다)', () => {
    expect(formatStopConditionValue({ max_pace_sec_per_km: 450 } as BadgeCondition)).toBe('7:30/km 이내')
  })

  it('소수 1자리 축도 조건값 원문을 그대로 쓴다', () => {
    expect(formatStopConditionValue({ weekend_duration_hours: 1.5 } as BadgeCondition)).toBe('주말 1.5h')
  })

  it('형태가 깨진 조건이어도 터지지 않고 그 필드만 건너뛴다', () => {
    // activities_within_hours는 객체형 — 스칼라가 들어오면 chip이 내부를 파다 터진다.
    const broken = { activities_within_hours: 3, total_count: 2 } as unknown as BadgeCondition
    expect(() => formatStopConditionValue(broken)).not.toThrow()
    expect(formatStopConditionValue(broken)).toContain('2회')
  })
})
