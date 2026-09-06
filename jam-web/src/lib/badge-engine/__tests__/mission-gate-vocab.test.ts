/**
 * 티켓 20260906_2231 — 미션 게이트 확장 어휘 4종 회귀 테스트
 *
 * `period_streak` · `time_bands_requirement` · `distinct_days_of_week_count` ·
 * `distinct_months_threshold`. 게이트 미션 40종(걷기 8 + 4종목 32)이 `MissionCondition`
 * → `BadgeCondition` 캐스팅 통로(`missions/checker.ts`, 티켓 20260813_001)로 그대로
 * 넘기는 조건이라, 여기서는 `evaluateConditionDetailed`(엔진)만 직접 검증한다.
 * 미션 타입(`engine_condition`) 결선은 `missions/__tests__/checker-logic.test.ts`가 본다.
 *
 * 실행: `npx vitest run src/lib/badge-engine/__tests__/mission-gate-vocab.test.ts`
 */
import { evaluateConditionDetailed, checkCondition } from '../index'
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeCondition } from '@/types/database'

function act(overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  return {
    stravaId: Math.floor(Math.random() * 1_000_000),
    name: 'act',
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

/** 주어진 로컬 날짜(YYYY-MM-DD)와 시각(HH:MM)으로 활동 하나를 만든다 */
function actAt(dateLocal: string, timeLocal = '10:00', overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  return act({
    startDate: `${dateLocal}T${timeLocal}:00Z`,
    startDateLocal: `${dateLocal}T${timeLocal}:00`,
    ...overrides,
  })
}

// ── period_streak — 걷기 M2 "3주(월~일) 연속 주 3회" 형태 ──────────────────

describe('period_streak — 연속 기간(주/월)별 최소 활동 수', () => {
  it('3주 연속 매주 3회 이상이면 pass', () => {
    const cond: BadgeCondition = {
      activity_type: 'walking',
      period_streak: { unit: 'week', length: 3, min_count: 3 },
    }
    // 월요일 기준 3주(각 주 3회) — 걷기 게이트를 통과하도록 거리·시간·속도 채움
    const walk = (d: string) => actAt(d, '09:00', { jamActivityType: 'walking', distanceKm: 2, movingTimeSec: 1800, averageSpeedKmh: 4 })
    const acts = [
      walk('2026-06-01'), walk('2026-06-02'), walk('2026-06-03'), // 1주차(월~수) 3회
      walk('2026-06-08'), walk('2026-06-09'), walk('2026-06-10'), // 2주차 3회
      walk('2026-06-15'), walk('2026-06-16'), walk('2026-06-17'), // 3주차 3회
    ]
    expect(checkCondition(cond, acts)).toBe(true)
  })

  it('한 주라도 임계값 미달이면 스트릭이 끊긴다 — fail', () => {
    const cond: BadgeCondition = {
      activity_type: 'walking',
      period_streak: { unit: 'week', length: 3, min_count: 3 },
    }
    const walk = (d: string) => actAt(d, '09:00', { jamActivityType: 'walking', distanceKm: 2, movingTimeSec: 1800, averageSpeedKmh: 4 })
    const acts = [
      walk('2026-06-01'), walk('2026-06-02'), walk('2026-06-03'), // 1주차 3회
      walk('2026-06-08'), walk('2026-06-09'), // 2주차 2회 — 임계값 미달, 스트릭 끊김
      walk('2026-06-15'), walk('2026-06-16'), walk('2026-06-17'), // 3주차 3회 (다시 1로 시작)
    ]
    const r = evaluateConditionDetailed(cond, acts)
    expect(r.pass).toBe(false)
    expect(r.reason).toBe('주기 연속 부족')
    expect(r.actual).toBe('1주')
  })

  it('기존 weekly_streak(기간당 활동 1건이면 충분)와 다른 값을 낸다 — 근사가 아님을 확인', () => {
    // weekly_streak 3이면 주 1회씩만 있어도 통과하지만, period_streak(min_count:3)는
    // 통과하지 못해야 한다 — 두 필드가 서로 다른 요구를 표현한다는 것을 직접 증명한다.
    const weeklyOnce = (d: string) => actAt(d, '09:00', { jamActivityType: 'walking', distanceKm: 2, movingTimeSec: 1800, averageSpeedKmh: 4 })
    const acts = [weeklyOnce('2026-06-01'), weeklyOnce('2026-06-08'), weeklyOnce('2026-06-15')]
    expect(checkCondition({ activity_type: 'walking', weekly_streak: 3 }, acts)).toBe(true)
    expect(checkCondition({ activity_type: 'walking', period_streak: { unit: 'week', length: 3, min_count: 3 } }, acts)).toBe(false)
  })

  it('subset_day_of_week — 자전거 Q5 "3주 연속 주 3회, 매주 주말 1회 이상" 형태', () => {
    const cond: BadgeCondition = {
      activity_type: 'cycling',
      period_streak: {
        unit: 'week',
        length: 2,
        min_count: 3,
        subset_day_of_week: ['saturday', 'sunday'],
        subset_min_count: 1,
      },
    }
    const ride = (d: string) => actAt(d, '09:00', { jamActivityType: 'cycling' })
    // 1주차: 월(6/1)·화(6/2)·토(6/6) — 주말 1회 포함, 3회
    // 2주차: 월(6/8)·화(6/9)·수(6/10) — 3회지만 주말 0회 → subset 미달
    const passing = [ride('2026-06-01'), ride('2026-06-02'), ride('2026-06-06')]
    const failingWeek = [ride('2026-06-08'), ride('2026-06-09'), ride('2026-06-10')]
    expect(checkCondition({ ...cond, period_streak: { ...cond.period_streak!, length: 1 } }, passing)).toBe(true)
    expect(checkCondition(cond, [...passing, ...failingWeek])).toBe(false)
  })

  it('unit: month — 등산 Q6 "6개월 연속 한 달에 2회 이상" 형태', () => {
    const cond: BadgeCondition = {
      activity_type: 'hiking',
      period_streak: { unit: 'month', length: 3, min_count: 2 },
    }
    const hike = (d: string) => actAt(d, '09:00', { jamActivityType: 'hiking', distanceKm: 8, movingTimeSec: 14400 })
    const acts = [
      hike('2026-04-05'), hike('2026-04-20'),
      hike('2026-05-05'), hike('2026-05-20'),
      hike('2026-06-05'), hike('2026-06-20'),
    ]
    expect(checkCondition(cond, acts)).toBe(true)
    expect(checkCondition({ ...cond, period_streak: { ...cond.period_streak!, length: 4 } }, acts)).toBe(false)
  })

  it('형태 오류(subset_min_count 없이 subset_day_of_week만) — fail-closed', () => {
    const cond = {
      activity_type: 'walking',
      period_streak: { unit: 'week', length: 1, min_count: 1, subset_day_of_week: ['sunday'] },
    } as BadgeCondition
    const r = evaluateConditionDetailed(cond, [actAt('2026-06-07', '09:00', { jamActivityType: 'walking', distanceKm: 2, movingTimeSec: 1800, averageSpeedKmh: 4 })])
    expect(r.pass).toBe(false)
    expect(r.reason).toBe('주기 조건 짝 필드 없음')
  })
})

// ── time_bands_requirement — 걷기 M3 "새벽·낮·밤 각 2회" 형태 ───────────────

describe('time_bands_requirement — 시간대별 각 최소 활동 수', () => {
  const BANDS = [
    { start: '05:00', end: '08:00' }, // 새벽
    { start: '11:00', end: '14:00' }, // 낮
    { start: '20:00', end: '23:00' }, // 밤
  ]

  it('모든 시간대가 각 min_count 이상이면 pass', () => {
    const cond: BadgeCondition = { activity_type: 'walking', time_bands_requirement: { bands: BANDS, min_count: 2 } }
    const walk = (d: string, t: string) => actAt(d, t, { jamActivityType: 'walking', distanceKm: 2, movingTimeSec: 1800, averageSpeedKmh: 4 })
    const acts = [
      walk('2026-06-01', '06:00'), walk('2026-06-02', '06:30'), // 새벽 2회
      walk('2026-06-03', '12:00'), walk('2026-06-04', '12:30'), // 낮 2회
      walk('2026-06-05', '21:00'), walk('2026-06-06', '21:30'), // 밤 2회
    ]
    expect(checkCondition(cond, acts)).toBe(true)
  })

  it('한 시간대라도 미달이면 fail', () => {
    const cond: BadgeCondition = { activity_type: 'walking', time_bands_requirement: { bands: BANDS, min_count: 2 } }
    const walk = (d: string, t: string) => actAt(d, t, { jamActivityType: 'walking', distanceKm: 2, movingTimeSec: 1800, averageSpeedKmh: 4 })
    const acts = [
      walk('2026-06-01', '06:00'), // 새벽 1회뿐
      walk('2026-06-03', '12:00'), walk('2026-06-04', '12:30'),
      walk('2026-06-05', '21:00'), walk('2026-06-06', '21:30'),
    ]
    const r = evaluateConditionDetailed(cond, acts)
    expect(r.pass).toBe(false)
    expect(r.reason).toBe('시간대별 활동 횟수 부족')
  })

  it('형태 오류(bands 1개뿐) — fail-closed', () => {
    const cond = { activity_type: 'walking', time_bands_requirement: { bands: [BANDS[0]], min_count: 1 } } as BadgeCondition
    const r = evaluateConditionDetailed(cond, [])
    expect(r.pass).toBe(false)
    expect(r.reason).toBe('시간대별 조건 형태 오류')
  })

  it('distinct_days_of_week_count와 조합 — 러닝 R-Q5 "새벽·밤 각 2회, 서로 다른 5개 요일" 형태', () => {
    const cond: BadgeCondition = {
      activity_type: 'running',
      time_bands_requirement: { bands: [{ start: '05:00', end: '08:00' }, { start: '20:00', end: '05:00' }], min_count: 2 },
      distinct_days_of_week_count: 5,
    }
    const run = (d: string, t: string) => actAt(d, t, { jamActivityType: 'running' })
    const acts = [
      run('2026-06-01', '06:00'), run('2026-06-02', '06:30'), // 새벽 2회 (월·화)
      run('2026-06-03', '21:00'), run('2026-06-04', '21:30'), // 밤 2회 (수·목)
      run('2026-06-05', '10:00'), // 낮 활동 1건 — 5번째 요일(금)만 채우는 용도
    ]
    expect(checkCondition(cond, acts)).toBe(true)
    // 요일이 4개뿐이면(마지막 활동을 월요일로 겹치게) fail
    const overlapping = acts.slice(0, 4)
    expect(checkCondition(cond, overlapping)).toBe(false)
  })
})

// ── distinct_days_of_week_count — 걷기 M4 "서로 다른 5개 요일" 형태 ─────────

describe('distinct_days_of_week_count — 서로 다른 요일 수', () => {
  it('서로 다른 요일이 임계값 이상이면 pass (같은 요일 중복은 1로 묶인다)', () => {
    const cond: BadgeCondition = { activity_type: 'walking', distinct_days_of_week_count: 5 }
    const walk = (d: string) => actAt(d, '09:00', { jamActivityType: 'walking', distanceKm: 2, movingTimeSec: 1800, averageSpeedKmh: 4 })
    // 월·화·수·목·금 (5개) + 같은 주 월요일 중복 1건
    const acts = [
      walk('2026-06-01'), walk('2026-06-01'), // 월요일 중복
      walk('2026-06-02'), walk('2026-06-03'), walk('2026-06-04'), walk('2026-06-05'),
    ]
    expect(checkCondition(cond, acts)).toBe(true)
  })

  it('서로 다른 요일이 4개뿐이면 fail', () => {
    const cond: BadgeCondition = { activity_type: 'walking', distinct_days_of_week_count: 5 }
    const walk = (d: string) => actAt(d, '09:00', { jamActivityType: 'walking', distanceKm: 2, movingTimeSec: 1800, averageSpeedKmh: 4 })
    const acts = [walk('2026-06-01'), walk('2026-06-02'), walk('2026-06-03'), walk('2026-06-04')]
    const r = evaluateConditionDetailed(cond, acts)
    expect(r.pass).toBe(false)
    expect(r.reason).toBe('서로 다른 요일 수 부족')
    expect(r.actual).toBe('4개')
  })
})

// ── distinct_months_threshold — 걷기 M8 "서로 다른 두 달에 각각 30km" 형태 ──

describe('distinct_months_threshold — 서로 다른 달 개수(각각 임계값)', () => {
  it('두 달 모두 임계값 이상이면 pass', () => {
    const cond: BadgeCondition = {
      activity_type: 'walking',
      distinct_months_threshold: { metric: 'distance_km', value: 30, count: 2 },
    }
    const walk = (d: string, km: number) => actAt(d, '09:00', { jamActivityType: 'walking', distanceKm: km, movingTimeSec: 1800, averageSpeedKmh: 4 })
    const acts = [walk('2026-05-05', 20), walk('2026-05-15', 15), walk('2026-06-05', 30)]
    expect(checkCondition(cond, acts)).toBe(true)
  })

  it('한 달만 임계값을 넘으면 fail — month+monthly_km(최댓값 1개만 봄)와 다른 값을 낸다', () => {
    const cond: BadgeCondition = {
      activity_type: 'walking',
      distinct_months_threshold: { metric: 'distance_km', value: 30, count: 2 },
    }
    const walk = (d: string, km: number) => actAt(d, '09:00', { jamActivityType: 'walking', distanceKm: km, movingTimeSec: 1800, averageSpeedKmh: 4 })
    const acts = [walk('2026-05-05', 10), walk('2026-06-05', 35)]
    const r = evaluateConditionDetailed(cond, acts)
    expect(r.pass).toBe(false)
    expect(r.reason).toBe('서로 다른 달 개수 부족')
    expect(r.actual).toBe('1개')
    // 기존 month+monthly_km는 "달 중 하나가 임계값을 넘기만 하면" pass — 두 필드가 다른 값
    expect(checkCondition({ activity_type: 'walking', monthly_km: 30 }, acts)).toBe(true)
  })

  it('elevation_gain_m 지표도 지원 — 등산 Q8 형태', () => {
    const cond: BadgeCondition = {
      activity_type: 'hiking',
      distinct_months_threshold: { metric: 'elevation_gain_m', value: 1800, count: 2 },
    }
    const hike = (d: string, elev: number) => actAt(d, '09:00', { jamActivityType: 'hiking', elevationGainM: elev })
    const acts = [hike('2026-05-05', 1000), hike('2026-05-15', 900), hike('2026-06-05', 1800)]
    expect(checkCondition(cond, acts)).toBe(true)
  })

  it('형태 오류(count < 1) — fail-closed', () => {
    const cond = { activity_type: 'walking', distinct_months_threshold: { metric: 'distance_km', value: 30, count: 0 } } as BadgeCondition
    const r = evaluateConditionDetailed(cond, [])
    expect(r.pass).toBe(false)
    expect(r.reason).toBe('서로 다른 달 조건 형태 오류')
  })
})
