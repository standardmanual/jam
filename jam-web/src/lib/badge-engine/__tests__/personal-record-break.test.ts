/**
 * 티켓 20260906_2055 — `personal_record_break` 지표별 평가 로직 회귀 테스트
 *
 * 선행: `20260906_0110` ③(스키마만 열고 평가는 범위 밖으로 남김) · 콘텐츠 값 확정
 * (`seed_personal_record_break_metric.sql`, 7계열 56종).
 *
 * 확인 대상:
 *   ① 새 기록 갱신 시 발급, 갱신 아닌 활동은 미발급
 *   ② 지표가 다른 형제(예: walking:B1 거리 ↔ B2 시간)가 서로 간섭하지 않는다
 *   ③ 지표 없음/미지원 지표는 fail-closed로 막힌다 — 나머지 7계열(월대비배수 등으로
 *      이미 형제와 구분된) 오발급 방지
 *   ④ 진행 계산(classifyBadgeProgressKind)이 발급과 같은 축을 그린다
 *
 * 실행: `npx vitest run src/lib/badge-engine/__tests__/personal-record-break.test.ts`
 */
import { evaluateConditionDetailed, checkCondition } from '../index'
import { classifyBadgeProgressKind } from '../badgeProgress'
import { findBlockingConditionKeys, hasBlockingConditionKeys } from '../conditionRegistry'
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeCondition } from '@/types/database'

function act(overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  return {
    stravaId: Math.floor(Math.random() * 1_000_000),
    name: 'act',
    distanceKm: 10,
    movingTimeSec: 3600,
    elevationGainM: 100,
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

describe('personal_record_break — single_distance_km 지표 (walking:B1 형태)', () => {
  it('첫 활동은 항상 기록 갱신 1회 — 직전 기록이 없으므로 자동으로 최초 기록이다', () => {
    const cond: BadgeCondition = { activity_type: 'walking', personal_record_break: 1, personal_record_break_metric: 'single_distance_km' }
    const acts = [act({ distanceKm: 3 })]
    expect(checkCondition(cond, acts)).toBe(true)
  })

  it('더 짧은 거리로 반복해도 갱신 횟수가 늘지 않는다', () => {
    const cond: BadgeCondition = { activity_type: 'walking', personal_record_break: 2, personal_record_break_metric: 'single_distance_km' }
    const acts = [
      act({ distanceKm: 5, startDate: '2026-07-01T00:00:00Z', startDateLocal: '2026-07-01T00:00:00' }),
      act({ distanceKm: 3, startDate: '2026-07-02T00:00:00Z', startDateLocal: '2026-07-02T00:00:00' }), // 짧음 — 갱신 아님
      act({ distanceKm: 4, startDate: '2026-07-03T00:00:00Z', startDateLocal: '2026-07-03T00:00:00' }), // 여전히 첫 기록보다 짧음
    ]
    const r = evaluateConditionDetailed(cond, acts)
    expect(r.pass).toBe(false)
    expect(r.reason).toBe('개인 기록 갱신 횟수 부족')
    expect(r.actual).toBe('1회')
  })

  it('더 긴 거리로 다시 갱신하면 2회로 오르고 레벨 2 조건을 통과한다', () => {
    const cond: BadgeCondition = { activity_type: 'walking', personal_record_break: 2, personal_record_break_metric: 'single_distance_km' }
    const acts = [
      act({ distanceKm: 5, startDate: '2026-07-01T00:00:00Z', startDateLocal: '2026-07-01T00:00:00' }),
      act({ distanceKm: 3, startDate: '2026-07-02T00:00:00Z', startDateLocal: '2026-07-02T00:00:00' }), // 갱신 아님
      act({ distanceKm: 8, startDate: '2026-07-03T00:00:00Z', startDateLocal: '2026-07-03T00:00:00' }), // 2번째 갱신
    ]
    expect(checkCondition(cond, acts)).toBe(true)
  })

  it('활동 순서가 뒤섞여 들어와도 시간순으로 재정렬해 판정한다', () => {
    const cond: BadgeCondition = { activity_type: 'walking', personal_record_break: 2, personal_record_break_metric: 'single_distance_km' }
    // 배열 순서는 8km(늦음) → 5km(이름) → 3km(중간)이지만 시간순은 5→3→8
    const acts = [
      act({ distanceKm: 8, startDate: '2026-07-03T00:00:00Z', startDateLocal: '2026-07-03T00:00:00' }),
      act({ distanceKm: 5, startDate: '2026-07-01T00:00:00Z', startDateLocal: '2026-07-01T00:00:00' }),
      act({ distanceKm: 3, startDate: '2026-07-02T00:00:00Z', startDateLocal: '2026-07-02T00:00:00' }),
    ]
    expect(checkCondition(cond, acts)).toBe(true)
  })

  it('종목이 다르면(activity_type 필터) 기록 갱신에 관여하지 않는다', () => {
    const cond: BadgeCondition = { activity_type: 'walking', personal_record_break: 1, personal_record_break_metric: 'single_distance_km' }
    const acts = [act({ jamActivityType: 'running', distanceKm: 100 })] // 걷기가 아님
    expect(checkCondition(cond, acts)).toBe(false)
  })
})

describe('personal_record_break — duration_minutes 지표 (walking:B2 형태)', () => {
  it('이동시간(분) 기준으로 독립 판정된다 — movingTimeSec/60으로 환산', () => {
    const cond: BadgeCondition = { activity_type: 'walking', personal_record_break: 1, personal_record_break_metric: 'duration_minutes' }
    expect(checkCondition(cond, [act({ movingTimeSec: 1800 })])).toBe(true)
  })

  it('시간은 늘었지만 거리는 줄어든 활동도 시간 지표로는 정상 갱신된다', () => {
    const cond: BadgeCondition = { activity_type: 'walking', personal_record_break: 2, personal_record_break_metric: 'duration_minutes' }
    const acts = [
      act({ distanceKm: 5, movingTimeSec: 1800, startDate: '2026-07-01T00:00:00Z', startDateLocal: '2026-07-01T00:00:00' }),
      act({ distanceKm: 2, movingTimeSec: 3600, startDate: '2026-07-02T00:00:00Z', startDateLocal: '2026-07-02T00:00:00' }), // 거리↓ 시간↑
    ]
    expect(checkCondition(cond, acts)).toBe(true)
  })
})

describe('personal_record_break — max_elevation_m 지표 (hiking:R1 형태)', () => {
  it('고도계 데이터가 없는 활동은 시퀀스에서 건너뛴다 — 기록 갱신 실패로 세지 않는다', () => {
    const cond: BadgeCondition = { activity_type: 'hiking', personal_record_break: 2, personal_record_break_metric: 'max_elevation_m' }
    const acts = [
      act({ jamActivityType: 'hiking', maxElevationM: 500, startDate: '2026-07-01T00:00:00Z', startDateLocal: '2026-07-01T00:00:00' }),
      act({ jamActivityType: 'hiking', maxElevationM: undefined, startDate: '2026-07-02T00:00:00Z', startDateLocal: '2026-07-02T00:00:00' }), // 측정 안 됨
      act({ jamActivityType: 'hiking', maxElevationM: 900, startDate: '2026-07-03T00:00:00Z', startDateLocal: '2026-07-03T00:00:00' }),
    ]
    expect(checkCondition(cond, acts)).toBe(true) // 500 → 900 두 번 갱신, 미측정 활동은 무시
  })
})

describe('personal_record_break — 지표별 형제 배지는 서로 간섭하지 않는다 (walking:B1 ↔ B2)', () => {
  const acts = [
    // 1번째 활동: 거리 최고지만 시간은 짧음
    act({ distanceKm: 10, movingTimeSec: 1800, startDate: '2026-07-01T00:00:00Z', startDateLocal: '2026-07-01T00:00:00' }),
    // 2번째 활동: 거리는 줄었지만 시간은 늘었음
    act({ distanceKm: 5, movingTimeSec: 3600, startDate: '2026-07-02T00:00:00Z', startDateLocal: '2026-07-02T00:00:00' }),
  ]

  it('B1(single_distance_km)은 1회만 갱신됐다 — 2번째 활동이 거리 기록을 갱신 못함', () => {
    const b1: BadgeCondition = { activity_type: 'walking', personal_record_break: 2, personal_record_break_metric: 'single_distance_km' }
    expect(checkCondition(b1, acts)).toBe(false)
  })

  it('B2(duration_minutes)는 2회 갱신됐다 — 같은 활동 이력, 다른 지표', () => {
    const b2: BadgeCondition = { activity_type: 'walking', personal_record_break: 2, personal_record_break_metric: 'duration_minutes' }
    expect(checkCondition(b2, acts)).toBe(true)
  })
})

describe('personal_record_break — fail-closed (지표 없음 · 미지원 지표)', () => {
  it('personal_record_break_metric이 없으면 짝 필드 없음으로 막힌다 (running:R2/R3 등 이번 범위 밖 7계열)', () => {
    const blocking = findBlockingConditionKeys({ activity_type: 'running', personal_record_break: 1 } as BadgeCondition)
    expect(hasBlockingConditionKeys(blocking)).toBe(true)
    expect(blocking.unpaired).toContain('personal_record_break')

    const r = evaluateConditionDetailed({ activity_type: 'running', personal_record_break: 1 } as BadgeCondition, [act()])
    expect(r.pass).toBe(false)
    expect(r.reason).toContain('짝 필드 없음')
  })

  it('single_distance_km 조건과 함께 있어도(running:R2 형태) 지표 없이는 발급되지 않는다', () => {
    const cond: BadgeCondition = { activity_type: 'running', single_distance_km: 5, personal_record_break: 1 }
    const many = Array.from({ length: 50 }, (_, i) => act({ jamActivityType: 'running', distanceKm: 10, stravaId: i }))
    expect(checkCondition(cond, many)).toBe(false)
  })

  it('아직 콘텐츠가 없는 지표값(예: avg_watts)은 짝 필드가 있어도 평가 미구현으로 막힌다', () => {
    const cond = {
      activity_type: 'walking',
      personal_record_break: 1,
      personal_record_break_metric: 'avg_watts',
    } as BadgeCondition
    const r = evaluateConditionDetailed(cond, [act()])
    expect(r.pass).toBe(false)
    expect(r.reason).toBe('개인 기록 지표 평가 미구현')
  })
})

describe('personal_record_break — 진행 계산이 발급과 같은 축을 그린다', () => {
  it('지원 지표가 있으면 cumulative로 분류된다 (레벨형 래핑 전 기반 유형)', () => {
    expect(
      classifyBadgeProgressKind({ activity_type: 'walking', personal_record_break: 3, personal_record_break_metric: 'single_distance_km' })
    ).toBe('cumulative')
  })

  it('레벨형 옵션을 주면 leveled로 래핑된다', () => {
    expect(
      classifyBadgeProgressKind(
        { activity_type: 'walking', personal_record_break: 3, personal_record_break_metric: 'single_distance_km' },
        { badgeKind: 'leveled', level: 3 }
      )
    ).toBe('leveled')
  })

  it('짝 필드가 없으면 unsupported다 — 발급도 막히므로 진행률도 그리지 않는다', () => {
    expect(classifyBadgeProgressKind({ activity_type: 'running', personal_record_break: 1 })).toBe('unsupported')
  })

  it('미지원 지표값도 unsupported다', () => {
    expect(
      classifyBadgeProgressKind({
        activity_type: 'walking',
        personal_record_break: 1,
        personal_record_break_metric: 'avg_watts',
      } as BadgeCondition)
    ).toBe('unsupported')
  })
})
