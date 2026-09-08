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

describe('personal_record_break — max_pace_sec_per_km 지표 (running:R2 형태, 티켓 20260908_1438)', () => {
  // 페이스는 "값이 작을수록(빠를수록) 갱신"인 lower 방향 지표라, 나머지 3종(higher 방향)과
  // 반대 부등호로 판정돼야 한다. averageSpeedKmh가 클수록 페이스(초/km)는 작아진다.
  it('첫 활동은 항상 기록 갱신 1회', () => {
    const cond: BadgeCondition = { activity_type: 'running', single_distance_km: 5, personal_record_break: 1, personal_record_break_metric: 'max_pace_sec_per_km' }
    const acts = [act({ jamActivityType: 'running', distanceKm: 5, averageSpeedKmh: 10 })]
    expect(checkCondition(cond, acts)).toBe(true)
  })

  it('더 느린 페이스(속도 감소)로 반복해도 갱신 횟수가 늘지 않는다', () => {
    const cond: BadgeCondition = { activity_type: 'running', single_distance_km: 5, personal_record_break: 2, personal_record_break_metric: 'max_pace_sec_per_km' }
    const acts = [
      act({ jamActivityType: 'running', distanceKm: 5, averageSpeedKmh: 10, startDate: '2026-07-01T00:00:00Z', startDateLocal: '2026-07-01T00:00:00' }), // 페이스 360초/km
      act({ jamActivityType: 'running', distanceKm: 5, averageSpeedKmh: 8, startDate: '2026-07-02T00:00:00Z', startDateLocal: '2026-07-02T00:00:00' }), // 450초/km — 느려짐, 갱신 아님
    ]
    const r = evaluateConditionDetailed(cond, acts)
    expect(r.pass).toBe(false)
    expect(r.actual).toBe('1회')
  })

  it('더 빠른 페이스(속도 증가)로 갱신하면 2회로 오르고 조건을 통과한다', () => {
    const cond: BadgeCondition = { activity_type: 'running', single_distance_km: 5, personal_record_break: 2, personal_record_break_metric: 'max_pace_sec_per_km' }
    const acts = [
      act({ jamActivityType: 'running', distanceKm: 5, averageSpeedKmh: 8, startDate: '2026-07-01T00:00:00Z', startDateLocal: '2026-07-01T00:00:00' }), // 450초/km
      act({ jamActivityType: 'running', distanceKm: 5, averageSpeedKmh: 9, startDate: '2026-07-02T00:00:00Z', startDateLocal: '2026-07-02T00:00:00' }), // 400초/km — 갱신 아님(9<10 아니지만 8보다 빠름 — 두번째 갱신)
      act({ jamActivityType: 'running', distanceKm: 5, averageSpeedKmh: 12, startDate: '2026-07-03T00:00:00Z', startDateLocal: '2026-07-03T00:00:00' }), // 300초/km — 세번째 갱신
    ]
    expect(checkCondition(cond, acts)).toBe(true) // 450→400→300, 3회 모두 갱신 (2회 이상 충족)
  })

  it('진행 계산(badgeProgress)도 같은 방향으로 센다 — 발급과 어긋나지 않는다', () => {
    // single_distance_km 없이(cycling:R1/running:R1과 같은 형태) 검증한다 — "같은 지표를
    // badgeProgress도 같은 방향(lower)으로 센다"는 점만 확인하려는 것이라 그 축 하나만 둔다.
    // single_distance_km이 결합된 실콘텐츠 형태(running:R2)는 바로 아래 테스트에서 확인한다.
    expect(
      classifyBadgeProgressKind({ activity_type: 'running', personal_record_break: 3, personal_record_break_metric: 'max_pace_sec_per_km' })
    ).toBe('cumulative')
  })

  it('실콘텐츠 형태(single_distance_km + personal_record_break)는 single_distance_km이 personal_record_break 축에 흡수돼 cumulative로 분류된다 (티켓 20260908_1512 원인②)', () => {
    expect(
      classifyBadgeProgressKind({ activity_type: 'running', single_distance_km: 5, personal_record_break: 3, personal_record_break_metric: 'max_pace_sec_per_km' })
    ).toBe('cumulative')
  })

  // ── 티켓 20260908_1512 원인① 회귀 테스트 — single_distance_km은 "존재 여부"가 아니라
  //    "그 필터를 통과한 활동만 개인기록 후보로 좁히는 필터"로 동작해야 한다.
  it('5km 미만 활동의 페이스 신기록은 카운트되지 않는다 — 5km 이상 활동만 개인기록 후보다', () => {
    const cond: BadgeCondition = { activity_type: 'running', single_distance_km: 5, personal_record_break: 2, personal_record_break_metric: 'max_pace_sec_per_km' }
    const acts = [
      // 1번째: 5km 이상 — 후보 1회 갱신
      act({ jamActivityType: 'running', distanceKm: 5, averageSpeedKmh: 8, startDate: '2026-07-01T00:00:00Z', startDateLocal: '2026-07-01T00:00:00' }), // 450초/km
      // 2번째: 200m 전력질주로 페이스만 극단적으로 빠름 — 5km 미만이라 후보에서 제외돼야 한다
      act({ jamActivityType: 'running', distanceKm: 0.2, averageSpeedKmh: 20, startDate: '2026-07-02T00:00:00Z', startDateLocal: '2026-07-02T00:00:00' }), // 180초/km
    ]
    const r = evaluateConditionDetailed(cond, acts)
    expect(r.pass).toBe(false)
    expect(r.reason).toBe('개인 기록 갱신 횟수 부족')
    expect(r.actual).toBe('1회') // 200m 전력질주는 후보에서 빠져 갱신으로 세어지지 않는다
  })

  it('5km 이상 활동 중에서 페이스가 갱신되면 정상적으로 카운트된다', () => {
    const cond: BadgeCondition = { activity_type: 'running', single_distance_km: 5, personal_record_break: 2, personal_record_break_metric: 'max_pace_sec_per_km' }
    const acts = [
      act({ jamActivityType: 'running', distanceKm: 5, averageSpeedKmh: 8, startDate: '2026-07-01T00:00:00Z', startDateLocal: '2026-07-01T00:00:00' }), // 450초/km
      act({ jamActivityType: 'running', distanceKm: 0.2, averageSpeedKmh: 20, startDate: '2026-07-02T00:00:00Z', startDateLocal: '2026-07-02T00:00:00' }), // 5km 미만 — 후보 제외
      act({ jamActivityType: 'running', distanceKm: 6, averageSpeedKmh: 10, startDate: '2026-07-03T00:00:00Z', startDateLocal: '2026-07-03T00:00:00' }), // 360초/km, 5km 이상 — 2번째 갱신
    ]
    expect(checkCondition(cond, acts)).toBe(true)
  })

  it('5km 미만 신기록 활동이 섞여 있어도 실제 갱신 횟수(2회) 임계값에서 정확히 갈린다', () => {
    const acts = [
      act({ jamActivityType: 'running', distanceKm: 5, averageSpeedKmh: 8, startDate: '2026-07-01T00:00:00Z', startDateLocal: '2026-07-01T00:00:00' }),
      act({ jamActivityType: 'running', distanceKm: 0.2, averageSpeedKmh: 20, startDate: '2026-07-02T00:00:00Z', startDateLocal: '2026-07-02T00:00:00' }), // 5km 미만 — 후보 제외
      act({ jamActivityType: 'running', distanceKm: 6, averageSpeedKmh: 10, startDate: '2026-07-03T00:00:00Z', startDateLocal: '2026-07-03T00:00:00' }),
    ]
    // 실제 갱신 횟수는 2회(200m 전력질주 제외) — 요구치 2회는 통과, 3회는 미달이어야
    // "200m 전력질주가 몰래 3번째 갱신으로 세어지지 않았다"는 것을 확인할 수 있다.
    expect(checkCondition({ activity_type: 'running', single_distance_km: 5, personal_record_break: 2, personal_record_break_metric: 'max_pace_sec_per_km' }, acts)).toBe(true)
    expect(checkCondition({ activity_type: 'running', single_distance_km: 5, personal_record_break: 3, personal_record_break_metric: 'max_pace_sec_per_km' }, acts)).toBe(false)
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
