/**
 * badge-engine evaluateConditionDetailed — 조건 유닛 테스트
 *
 * 테스트 범위:
 *   - temperature_min_c (폭염 조건)
 *   - temperature_max_c (한파 조건)
 *   - time_range (시간대 조건)
 *   - poi_id (항상 false 스켈레톤)
 *
 * 실행: jest 또는 vitest (프레임워크 무관 — describe/it/expect 호환)
 */

import { evaluateConditionDetailed } from '../index'
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeCondition } from '@/types/database'

// ── 테스트용 활동 팩토리 ──────────────────────────────────────────────────

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

// ── temperature_min_c (폭염 배지) ─────────────────────────────────────────

describe('temperature_min_c', () => {
  it('기온이 조건 이상이면 pass', () => {
    const cond: BadgeCondition = { temperature_min_c: 35 }
    const acts = [makeActivity({ weatherTempC: 38 })]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  it('기온이 조건과 같으면 pass', () => {
    const cond: BadgeCondition = { temperature_min_c: 35 }
    const acts = [makeActivity({ weatherTempC: 35 })]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  it('기온이 조건 미만이면 fail', () => {
    const cond: BadgeCondition = { temperature_min_c: 35 }
    const acts = [makeActivity({ weatherTempC: 30 })]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('기온 부족')
  })

  it('여러 활동 중 하나라도 조건 충족하면 pass', () => {
    const cond: BadgeCondition = { temperature_min_c: 35 }
    const acts = [
      makeActivity({ weatherTempC: 30 }),
      makeActivity({ weatherTempC: 37 }),
    ]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  it('날씨 데이터 없으면 fail (Strava 미제공)', () => {
    const cond: BadgeCondition = { temperature_min_c: 35 }
    const acts = [makeActivity({ weatherTempC: null })]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('날씨 데이터 없음')
  })

  it('weatherTempC undefined인 경우도 날씨 데이터 없음', () => {
    const cond: BadgeCondition = { temperature_min_c: 35 }
    const acts = [makeActivity({ weatherTempC: undefined })]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('날씨 데이터 없음')
  })
})

// ── temperature_max_c (한파 배지) ─────────────────────────────────────────

describe('temperature_max_c', () => {
  it('기온이 조건 이하이면 pass', () => {
    const cond: BadgeCondition = { temperature_max_c: 0 }
    const acts = [makeActivity({ weatherTempC: -5 })]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  it('기온이 조건과 같으면 pass', () => {
    const cond: BadgeCondition = { temperature_max_c: 0 }
    const acts = [makeActivity({ weatherTempC: 0 })]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  it('기온이 조건 초과이면 fail', () => {
    const cond: BadgeCondition = { temperature_max_c: 0 }
    const acts = [makeActivity({ weatherTempC: 5 })]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('기온 초과')
  })

  it('여러 활동 중 최저 기온이 조건 이하이면 pass', () => {
    const cond: BadgeCondition = { temperature_max_c: -10 }
    const acts = [
      makeActivity({ weatherTempC: 5 }),
      makeActivity({ weatherTempC: -12 }),
    ]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  it('날씨 데이터 없으면 fail', () => {
    const cond: BadgeCondition = { temperature_max_c: 0 }
    const acts = [makeActivity({ weatherTempC: null })]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(false)
  })
})

// ── time_range (시간대 배지) ──────────────────────────────────────────────

describe('time_range', () => {
  it('새벽(04:00~07:00) — 범위 내 시각이면 pass', () => {
    const cond: BadgeCondition = { time_range: { start: '04:00', end: '07:00' } }
    const acts = [makeActivity({ startDateLocal: '2026-07-20T05:30:00' })]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  it('범위 시작 경계값 pass', () => {
    const cond: BadgeCondition = { time_range: { start: '04:00', end: '07:00' } }
    const acts = [makeActivity({ startDateLocal: '2026-07-20T04:00:00' })]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  it('범위 종료 경계값 pass', () => {
    const cond: BadgeCondition = { time_range: { start: '04:00', end: '07:00' } }
    const acts = [makeActivity({ startDateLocal: '2026-07-20T07:00:00' })]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  it('범위 외 시각이면 fail', () => {
    const cond: BadgeCondition = { time_range: { start: '04:00', end: '07:00' } }
    const acts = [makeActivity({ startDateLocal: '2026-07-20T10:00:00' })]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('시간대 불일치')
  })

  it('자정 걸치는 범위(22:00~02:00) — 23:00 활동은 pass', () => {
    const cond: BadgeCondition = { time_range: { start: '22:00', end: '02:00' } }
    const acts = [makeActivity({ startDateLocal: '2026-07-20T23:30:00' })]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  it('자정 걸치는 범위(22:00~02:00) — 01:00 활동은 pass', () => {
    const cond: BadgeCondition = { time_range: { start: '22:00', end: '02:00' } }
    const acts = [makeActivity({ startDateLocal: '2026-07-21T01:00:00' })]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  it('자정 걸치는 범위(22:00~02:00) — 10:00 활동은 fail', () => {
    const cond: BadgeCondition = { time_range: { start: '22:00', end: '02:00' } }
    const acts = [makeActivity({ startDateLocal: '2026-07-20T10:00:00' })]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(false)
  })

  it('startDateLocal 없으면 startDate(UTC)로 폴백', () => {
    const cond: BadgeCondition = { time_range: { start: '04:00', end: '07:00' } }
    const acts = [makeActivity({ startDateLocal: undefined, startDate: '2026-07-20T05:00:00Z' })]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  it('여러 활동 중 하나라도 범위 내이면 pass', () => {
    const cond: BadgeCondition = { time_range: { start: '04:00', end: '07:00' } }
    const acts = [
      makeActivity({ startDateLocal: '2026-07-20T10:00:00' }),
      makeActivity({ startDateLocal: '2026-07-21T06:00:00' }),
    ]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })
})

// ── poi_id (스켈레톤) ─────────────────────────────────────────────────────

describe('poi_id', () => {
  it('poi_id 조건은 항상 false (GPS 경로 매칭으로 별도 발급)', () => {
    const cond: BadgeCondition = { poi_id: 'some-poi-uuid' }
    const acts = [makeActivity()]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('GPS 경로 매칭')
  })
})

// ── prerequisite_badge_names (엔진 레벨 처리 검증) ───────────────────────
// prerequisite_badge_names는 evaluateConditionDetailed 바깥(엔진 Step 1)에서 처리됨.
// condition 평가 자체에는 영향을 미치지 않아야 한다.

describe('prerequisite_badge_names (condition 평가 영향 없음)', () => {
  it('prerequisite_badge_names가 있어도 다른 조건이 충족되면 pass', () => {
    const cond: BadgeCondition = {
      activity_type: 'running',
      distance_km: 5,
      prerequisite_badge_names: ['첫 페달', '아스팔트 입문'],
    }
    const acts = [makeActivity({ distanceKm: 10, jamActivityType: 'running' })]
    // 조건(거리) 충족 → evaluateConditionDetailed는 pass (prerequisite는 엔진에서 별도 체크)
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  it('prerequisite_badge_names만 있고 다른 조건이 없으면 pass (빈 조건과 동일 처리 제외)', () => {
    // prerequisite_badge_names 외 평가할 조건이 있어야 pass 가능
    const cond: BadgeCondition = {
      distance_km: 3,
      prerequisite_badge_names: ['선행 배지'],
    }
    const acts = [makeActivity({ distanceKm: 5 })]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  it('prerequisite_badge_names가 있어도 조건 미달이면 fail', () => {
    const cond: BadgeCondition = {
      distance_km: 50,
      prerequisite_badge_names: ['선행 배지'],
    }
    const acts = [makeActivity({ distanceKm: 10 })]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('거리 부족')
  })
})
