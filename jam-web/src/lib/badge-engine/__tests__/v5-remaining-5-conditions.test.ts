/**
 * 티켓 20260908_1318 — v5 잔여 5종 조건 필드 평가 로직 회귀 테스트
 * (`distinct_time_bands`·`day_of_month`·`activities_within_hours`·`month_over_month_ratio`·
 * `vs_personal_average`)
 *
 * 대상 배지 계열(모두 이 티켓 이전엔 fail-closed로 막혀 있었다):
 *   - walking:A3 「리듬 브레이커」 — streak_days + distinct_time_bands + repeat_count
 *   - walking:A4 「스물넷의 산책」 — activities_within_hours + repeat_count
 *   - walking:A6 「초하루의 사람」 — day_of_month + total_count
 *   - walking:B3/B4 · running:R3 · cycling:R2 — month_over_month_ratio / vs_personal_average
 *     + personal_record_break
 *
 * 실행: `npx vitest run src/lib/badge-engine/__tests__/v5-remaining-5-conditions.test.ts`
 */
import { evaluateConditionDetailed, checkCondition } from '../index'
import { classifyBadgeProgressKind } from '../badgeProgress'
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeCondition } from '@/types/database'

function act(overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  return {
    stravaId: Math.floor(Math.random() * 1_000_000),
    name: 'act',
    distanceKm: 3,
    movingTimeSec: 1800,
    elevationGainM: 20,
    jamActivityType: 'walking',
    startDate: '2026-07-20T05:30:00Z',
    startDateLocal: '2026-07-20T05:30:00',
    averageSpeedKmh: 5,
    startLatLng: null,
    endLatLng: null,
    weatherTempC: null,
    ...overrides,
  }
}

describe('distinct_time_bands — 단독(이력 전체 독립 평가)', () => {
  it('시간대 6구간 중 2개(새벽·저녁)만 쓰면 3개 요구는 미달', () => {
    const cond: BadgeCondition = { activity_type: 'walking', distinct_time_bands: 3 }
    const acts = [
      act({ startDate: '2026-07-01T05:00:00Z', startDateLocal: '2026-07-01T05:00:00' }), // 새벽
      act({ startDate: '2026-07-02T19:00:00Z', startDateLocal: '2026-07-02T19:00:00' }), // 저녁
    ]
    const r = evaluateConditionDetailed(cond, acts)
    expect(r.pass).toBe(false)
    expect(r.reason).toBe('서로 다른 시간대 부족')
    expect(r.actual).toBe('2개')
  })

  it('새벽·아침·저녁 3개를 쓰면 통과', () => {
    const cond: BadgeCondition = { activity_type: 'walking', distinct_time_bands: 3 }
    const acts = [
      act({ startDate: '2026-07-01T05:00:00Z', startDateLocal: '2026-07-01T05:00:00' }), // 새벽
      act({ startDate: '2026-07-02T09:00:00Z', startDateLocal: '2026-07-02T09:00:00' }), // 아침
      act({ startDate: '2026-07-03T19:00:00Z', startDateLocal: '2026-07-03T19:00:00' }), // 저녁
    ]
    expect(checkCondition(cond, acts)).toBe(true)
  })
})

describe('distinct_time_bands + streak_days + repeat_count — walking:A3 「리듬 브레이커」 형태', () => {
  const cond: BadgeCondition = { activity_type: 'walking', streak_days: 3, distinct_time_bands: 3, repeat_count: 1 }

  it('3일 연속이어도 그 3일 안에서 시간대가 2개뿐이면 회차로 세지 않는다', () => {
    const acts = [
      act({ startDate: '2026-07-01T05:00:00Z', startDateLocal: '2026-07-01T05:00:00' }), // 새벽
      act({ startDate: '2026-07-02T05:30:00Z', startDateLocal: '2026-07-02T05:30:00' }), // 새벽
      act({ startDate: '2026-07-03T09:00:00Z', startDateLocal: '2026-07-03T09:00:00' }), // 아침
    ]
    expect(checkCondition(cond, acts)).toBe(false)
  })

  it('3일 연속 + 그 3일이 전부 다른 시간대면 회차 1로 통과', () => {
    const acts = [
      act({ startDate: '2026-07-01T05:00:00Z', startDateLocal: '2026-07-01T05:00:00' }), // 새벽
      act({ startDate: '2026-07-02T09:00:00Z', startDateLocal: '2026-07-02T09:00:00' }), // 아침
      act({ startDate: '2026-07-03T19:00:00Z', startDateLocal: '2026-07-03T19:00:00' }), // 저녁
    ]
    expect(checkCondition(cond, acts)).toBe(true)
    expect(classifyBadgeProgressKind(cond)).toBe('repeat')
  })

  it('연속은 끊겼지만 시간대만 다양하면 통과하지 않는다 (스트릭 자체가 없음)', () => {
    const acts = [
      act({ startDate: '2026-07-01T05:00:00Z', startDateLocal: '2026-07-01T05:00:00' }), // 새벽
      act({ startDate: '2026-07-03T09:00:00Z', startDateLocal: '2026-07-03T09:00:00' }), // 아침 (하루 공백)
      act({ startDate: '2026-07-05T19:00:00Z', startDateLocal: '2026-07-05T19:00:00' }), // 저녁 (하루 공백)
    ]
    expect(checkCondition(cond, acts)).toBe(false)
  })
})

describe('day_of_month + total_count — walking:A6 「초하루의 사람」 형태', () => {
  it('매달 1일에 걸은 횟수만 센다 — 다른 날 활동은 카운트되지 않는다', () => {
    const cond: BadgeCondition = { activity_type: 'walking', day_of_month: 1, total_count: 2 }
    const acts = [
      act({ startDate: '2026-06-01T05:00:00Z', startDateLocal: '2026-06-01T05:00:00' }), // 1일
      act({ startDate: '2026-06-15T05:00:00Z', startDateLocal: '2026-06-15T05:00:00' }), // 15일 — 카운트 안 됨
      act({ startDate: '2026-07-01T05:00:00Z', startDateLocal: '2026-07-01T05:00:00' }), // 1일
    ]
    expect(checkCondition(cond, acts)).toBe(true)
  })

  it('같은 1일에 여러 번 걸어도 걷기 하루 1회 상한으로 1회만 센다', () => {
    const cond: BadgeCondition = { activity_type: 'walking', day_of_month: 1, total_count: 2 }
    const acts = [
      act({ startDate: '2026-07-01T05:00:00Z', startDateLocal: '2026-07-01T05:00:00' }),
      act({ startDate: '2026-07-01T19:00:00Z', startDateLocal: '2026-07-01T19:00:00' }), // 같은 날 — 중복 상한
    ]
    const r = evaluateConditionDetailed(cond, acts)
    expect(r.pass).toBe(false)
    expect(r.actual).toContain('1회')
  })
})

describe('activities_within_hours — 단독(이력 전체 독립 평가)', () => {
  it('24시간 안에 2회 미만이면 미달', () => {
    const cond: BadgeCondition = { activity_type: 'walking', activities_within_hours: { hours: 24, count: 3 } }
    const acts = [
      act({ startDate: '2026-07-01T00:00:00Z', startDateLocal: '2026-07-01T00:00:00' }),
      act({ startDate: '2026-07-01T12:00:00Z', startDateLocal: '2026-07-01T12:00:00' }),
    ]
    const r = evaluateConditionDetailed(cond, acts)
    expect(r.pass).toBe(false)
    expect(r.reason).toBe('지정 시간 내 활동 횟수 부족')
    expect(r.actual).toBe('2회')
  })

  it('24시간 창 안에 3회가 들어오면 통과 (창 경계 안쪽)', () => {
    const cond: BadgeCondition = { activity_type: 'walking', activities_within_hours: { hours: 24, count: 3 } }
    const acts = [
      act({ startDate: '2026-07-01T00:00:00Z', startDateLocal: '2026-07-01T00:00:00' }),
      act({ startDate: '2026-07-01T12:00:00Z', startDateLocal: '2026-07-01T12:00:00' }),
      act({ startDate: '2026-07-01T23:59:00Z', startDateLocal: '2026-07-01T23:59:00' }),
    ]
    expect(checkCondition(cond, acts)).toBe(true)
  })

  it('24시간을 넘겨 흩어지면(창을 벗어남) 통과하지 못한다', () => {
    const cond: BadgeCondition = { activity_type: 'walking', activities_within_hours: { hours: 24, count: 3 } }
    const acts = [
      act({ startDate: '2026-07-01T00:00:00Z', startDateLocal: '2026-07-01T00:00:00' }),
      act({ startDate: '2026-07-02T06:00:00Z', startDateLocal: '2026-07-02T06:00:00' }), // 30시간 뒤
      act({ startDate: '2026-07-03T12:00:00Z', startDateLocal: '2026-07-03T12:00:00' }), // 또 30시간 뒤
    ]
    expect(checkCondition(cond, acts)).toBe(false)
  })
})

describe('activities_within_hours + repeat_count — walking:A4 「스물넷의 산책」 형태', () => {
  const cond: BadgeCondition = { activity_type: 'walking', activities_within_hours: { hours: 24, count: 3 }, repeat_count: 2 }

  it('24시간 안 3회를 두 번 채우면 회차 2로 통과 — 첫 창을 채운 뒤 다음 회차는 새 창에서 센다', () => {
    const acts = [
      // 1회차: 7/1 00:00~23:59 안에 3회
      act({ startDate: '2026-07-01T00:00:00Z', startDateLocal: '2026-07-01T00:00:00' }),
      act({ startDate: '2026-07-01T08:00:00Z', startDateLocal: '2026-07-01T08:00:00' }),
      act({ startDate: '2026-07-01T20:00:00Z', startDateLocal: '2026-07-01T20:00:00' }),
      // 2회차: 7/10 00:00~23:59 안에 3회 (별도 창)
      act({ startDate: '2026-07-10T00:00:00Z', startDateLocal: '2026-07-10T00:00:00' }),
      act({ startDate: '2026-07-10T08:00:00Z', startDateLocal: '2026-07-10T08:00:00' }),
      act({ startDate: '2026-07-10T20:00:00Z', startDateLocal: '2026-07-10T20:00:00' }),
    ]
    expect(checkCondition(cond, acts)).toBe(true)
    expect(classifyBadgeProgressKind(cond)).toBe('repeat')
  })

  it('한 번만 채우면 회차 1이라 repeat_count:2 미달', () => {
    const acts = [
      act({ startDate: '2026-07-01T00:00:00Z', startDateLocal: '2026-07-01T00:00:00' }),
      act({ startDate: '2026-07-01T08:00:00Z', startDateLocal: '2026-07-01T08:00:00' }),
      act({ startDate: '2026-07-01T20:00:00Z', startDateLocal: '2026-07-01T20:00:00' }),
    ]
    const r = evaluateConditionDetailed(cond, acts)
    expect(r.pass).toBe(false)
    expect(r.reason).toBe('충족 횟수 부족')
    expect(r.actual).toBe('1회')
  })

  it('하루 여러 번 걸어도 걷기 하루 1회 상한을 적용하지 않는다 (배지 의도상 예외)', () => {
    // 같은 날 3회를 걸어도(하루 1회 상한이 걸리면 이 조건은 영원히 회차가 안 나온다)
    // activities_within_hours는 dedupeOnePerDay를 적용하지 않아야 한다
    const dailyBurst: BadgeCondition = { activity_type: 'walking', activities_within_hours: { hours: 24, count: 3 }, repeat_count: 1 }
    const acts = [
      act({ startDate: '2026-07-01T00:00:00Z', startDateLocal: '2026-07-01T00:00:00' }),
      act({ startDate: '2026-07-01T08:00:00Z', startDateLocal: '2026-07-01T08:00:00' }),
      act({ startDate: '2026-07-01T20:00:00Z', startDateLocal: '2026-07-01T20:00:00' }),
    ]
    expect(checkCondition(dailyBurst, acts)).toBe(true)
  })
})

describe('month_over_month_ratio — 지표는 거리(km)로 고정', () => {
  it('전월 대비 1.2배 이상이면 통과', () => {
    const cond: BadgeCondition = { activity_type: 'running', month_over_month_ratio: 1.2 }
    const acts = [
      act({ jamActivityType: 'running', distanceKm: 10, startDate: '2026-06-05T00:00:00Z', startDateLocal: '2026-06-05T00:00:00' }),
      act({ jamActivityType: 'running', distanceKm: 13, startDate: '2026-07-05T00:00:00Z', startDateLocal: '2026-07-05T00:00:00' }),
    ]
    expect(checkCondition(cond, acts)).toBe(true)
  })

  it('전월 대비 1.1배로는 1.2배 미달', () => {
    const cond: BadgeCondition = { activity_type: 'running', month_over_month_ratio: 1.2 }
    const acts = [
      act({ jamActivityType: 'running', distanceKm: 10, startDate: '2026-06-05T00:00:00Z', startDateLocal: '2026-06-05T00:00:00' }),
      act({ jamActivityType: 'running', distanceKm: 11, startDate: '2026-07-05T00:00:00Z', startDateLocal: '2026-07-05T00:00:00' }),
    ]
    expect(checkCondition(cond, acts)).toBe(false)
  })

  it('전월 실적이 0(활동 없음)이면 그 달 쌍은 판정에서 제외 — 자동 통과하지 않는다', () => {
    const cond: BadgeCondition = { activity_type: 'running', month_over_month_ratio: 1.2 }
    // 6월은 활동 없음, 7월만 있음 — 비교할 전월 실적이 없다
    const acts = [act({ jamActivityType: 'running', distanceKm: 10, startDate: '2026-07-05T00:00:00Z', startDateLocal: '2026-07-05T00:00:00' })]
    const r = evaluateConditionDetailed(cond, acts)
    expect(r.pass).toBe(false)
    expect(r.actual).toContain('전월 대비 비교 불가')
  })
})

describe('vs_personal_average — 지표는 거리(km)로 고정, 직전까지의 평균과 비교', () => {
  it('평소(5km) 대비 2배(10km)를 넘으면 통과', () => {
    const cond: BadgeCondition = { activity_type: 'walking', vs_personal_average: 2 }
    const acts = [
      act({ distanceKm: 5, startDate: '2026-07-01T00:00:00Z', startDateLocal: '2026-07-01T00:00:00' }),
      act({ distanceKm: 5, startDate: '2026-07-02T00:00:00Z', startDateLocal: '2026-07-02T00:00:00' }),
      act({ distanceKm: 12, startDate: '2026-07-03T00:00:00Z', startDateLocal: '2026-07-03T00:00:00' }),
    ]
    expect(checkCondition(cond, acts)).toBe(true)
  })

  it('평소 대비 1.5배로는 2배 미달', () => {
    const cond: BadgeCondition = { activity_type: 'walking', vs_personal_average: 2 }
    const acts = [
      act({ distanceKm: 5, startDate: '2026-07-01T00:00:00Z', startDateLocal: '2026-07-01T00:00:00' }),
      act({ distanceKm: 5, startDate: '2026-07-02T00:00:00Z', startDateLocal: '2026-07-02T00:00:00' }),
      act({ distanceKm: 7.5, startDate: '2026-07-03T00:00:00Z', startDateLocal: '2026-07-03T00:00:00' }),
    ]
    expect(checkCondition(cond, acts)).toBe(false)
  })

  it('비교할 이전 활동이 없는 최초 활동은 판정에서 제외한다', () => {
    const cond: BadgeCondition = { activity_type: 'walking', vs_personal_average: 2 }
    const acts = [act({ distanceKm: 100, startDate: '2026-07-01T00:00:00Z', startDateLocal: '2026-07-01T00:00:00' })]
    const r = evaluateConditionDetailed(cond, acts)
    expect(r.pass).toBe(false)
    expect(r.actual).toContain('평균 비교 불가')
  })
})

describe('진행 계산 — 축이 없는 5종 조합은 정직하게 unsupported로 떨어진다', () => {
  it('month_over_month_ratio가 다른 축(personal_record_break)과 섞이면 그 축을 숨기지 않는다', () => {
    // 게이트 실측 재현 방지 회귀 — 이 조합이 그냥 'cumulative'로 분류되면 personal_record_break
    // 축만 100%로 그려지고 month_over_month_ratio 요구는 화면에서 사라진다(walking:B3 형태).
    const cond: BadgeCondition = {
      activity_type: 'walking',
      personal_record_break: 3,
      personal_record_break_metric: 'single_distance_km',
      month_over_month_ratio: 1.2,
    }
    expect(classifyBadgeProgressKind(cond)).toBe('unsupported')
  })
})
