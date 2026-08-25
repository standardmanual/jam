/**
 * badge-engine — 미션 보상 배지 / 평가 불가 조건 방어 분기 회귀 테스트 (티켓 20260825_028)
 *
 * 배경: 마이그레이션 084가 미션보상배지 15종의 condition_json에 `{"mission_reward": true}`를
 * 넣었는데, 엔진이 모르는 필드만 있는 조건은 어떤 검사 블록에도 걸리지 않고
 * evaluateConditionDetailed 마지막 줄의 `pass: true`로 떨어져 "활동 1건만 있으면 무조건 발급"
 * 상태가 됐다. 그 결과 미션 없이 미션보상배지가 발급되고 본 배지의 선행 배지 게이트가
 * 전부 열렸다. 이 테스트는 그 경로가 다시 열리지 않는지 지킨다.
 *
 * 실행: `npx vitest run src/lib/badge-engine/__tests__/mission-reward-gate.test.ts`
 */

import { evaluateConditionDetailed, checkCondition } from '../index'
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeCondition } from '@/types/database'

function makeActivity(overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  return {
    stravaId: 1,
    name: 'Test Activity',
    distanceKm: 10,
    movingTimeSec: 3600,
    elevationGainM: 100,
    jamActivityType: 'running',
    startDate: '2026-07-20T05:30:00Z',
    startDateLocal: '2026-07-20T05:30:00',
    averageSpeedKmh: 10,
    startLatLng: null,
    endLatLng: null,
    weatherTempC: null,
    ...overrides,
  }
}

const activities = [makeActivity(), makeActivity({ stravaId: 2, startDate: '2026-07-21T05:30:00Z', startDateLocal: '2026-07-21T05:30:00' })]

describe('mission_reward 조건', () => {
  it('{mission_reward: true} 단독 조건은 절대 pass되지 않는다', () => {
    const cond: BadgeCondition = { mission_reward: true }
    const result = evaluateConditionDetailed(cond, activities)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('미션 완료로만 지급')
  })

  it('활동 이력이 아무리 많아도 mission_reward 배지는 pass되지 않는다', () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      makeActivity({ stravaId: i + 1, distanceKm: 100, elevationGainM: 3000, movingTimeSec: 36000 })
    )
    expect(checkCondition({ mission_reward: true }, many)).toBe(false)
  })

  it('mission_reward가 다른 수치 조건과 함께 있어도 pass되지 않는다', () => {
    const cond: BadgeCondition = { mission_reward: true, activity_type: 'running', distance_km: 1 }
    expect(evaluateConditionDetailed(cond, activities).pass).toBe(false)
  })

  it('mission_reward: false는 이 분기에 걸리지 않는다 (수치 조건으로 정상 평가)', () => {
    const cond: BadgeCondition = { mission_reward: false, activity_type: 'running', distance_km: 5 }
    expect(evaluateConditionDetailed(cond, activities).pass).toBe(true)
  })
})

describe('평가 가능한 조건이 없는 경우', () => {
  it('빈 조건은 pass되지 않는다', () => {
    expect(evaluateConditionDetailed({}, activities).pass).toBe(false)
  })

  it('activity_type만 있는 조건(필터 전용)은 pass되지 않는다', () => {
    const result = evaluateConditionDetailed({ activity_type: 'running' }, activities)
    expect(result.pass).toBe(false)
    expect(result.reason).toBe('평가 가능한 조건 없음')
  })

  it('prerequisite_badge_names만 있는 조건은 pass되지 않는다', () => {
    expect(evaluateConditionDetailed({ prerequisite_badge_names: ['첫 숨결 레벨업'] }, activities).pass).toBe(false)
  })

  it('엔진이 모르는 필드만 있는 조건은 pass되지 않는다', () => {
    const unknown = { some_future_field: 123 } as unknown as BadgeCondition
    expect(evaluateConditionDetailed(unknown, activities).pass).toBe(false)
  })
})

describe('정상 조건은 방어 분기의 영향을 받지 않는다', () => {
  it('distance_km 단일 활동 조건은 그대로 평가된다', () => {
    expect(evaluateConditionDetailed({ activity_type: 'running', distance_km: 5 }, activities).pass).toBe(true)
    expect(evaluateConditionDetailed({ activity_type: 'running', distance_km: 50 }, activities).pass).toBe(false)
  })

  it('total_count 누적 조건은 그대로 평가된다', () => {
    expect(evaluateConditionDetailed({ activity_type: 'running', total_count: 2 }, activities).pass).toBe(true)
    expect(evaluateConditionDetailed({ activity_type: 'running', total_count: 3 }, activities).pass).toBe(false)
  })

  it('streak_days 조건은 그대로 평가된다', () => {
    expect(evaluateConditionDetailed({ activity_type: 'running', streak_days: 2 }, activities).pass).toBe(true)
    expect(evaluateConditionDetailed({ activity_type: 'running', streak_days: 3 }, activities).pass).toBe(false)
  })
})
