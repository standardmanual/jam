/**
 * BadgeForm 조건 빌더 — mission_reward 라운드트립 회귀 테스트 (티켓 20260825_031)
 *
 * 배경: buildConditionJson(현 buildConditionJsonFromFields)이 빈 객체에서 시작해
 * 하드코딩된 필드만 조립하는데 mission_reward용 입력 state가 없었다. 그 결과 미션보상배지
 * 15종 중 하나를 어드민에서 열어 그대로 저장하면 mission_reward 플래그가 조용히 유실되는
 * 회귀가 있었다(084_badge_condition_cleanup.sql과 같은 유형의 사고가 어드민 경로로 재발
 * 가능했음 — 이번 조사 중 발견).
 *
 * 실행: `npx vitest run src/app/admin/badges/__tests__/conditionFormFields.test.ts`
 */

import {
  buildConditionJsonFromFields,
  parsePaceToSec,
  getUnsupportedConditionKeys,
  FORM_UNSUPPORTED_CONDITION_KEYS,
  type ConditionFormFields,
} from '../conditionFormFields'

/** BadgeForm의 조건 빌더 state 초기값(빈 폼)과 동일한 기본값 */
function emptyFields(overrides: Partial<ConditionFormFields> = {}): ConditionFormFields {
  return {
    distanceKm: '',
    totalCount: '',
    elevationM: '',
    minSpeedKmh: '',
    maxPace: '',
    streakDays: '',
    activityType: '',
    durationMinutes: '',
    weekendDurationHours: '',
    weeklyCount: '',
    month: '',
    monthlyKm: '',
    seasonCount: '',
    season: '',
    tempMinC: '',
    tempMaxC: '',
    timeStart: '',
    timeEnd: '',
    prerequisiteNames: '',
    missionReward: false,
    ...overrides,
  }
}

describe('buildConditionJsonFromFields — mission_reward 라운드트립', () => {
  it('미션 보상 배지를 로드 후 그대로 저장하면(다른 필드 변경 없음) mission_reward가 유실 없이 보존된다', () => {
    // BadgeForm이 condition_json = {mission_reward: true}인 배지를 열면 initCond.mission_reward
    // === true → condMissionReward state가 true로 초기화되고, 다른 cond* state는 전부 빈 값이다.
    const loadedFields = emptyFields({ missionReward: true })
    const saved = buildConditionJsonFromFields(loadedFields)
    expect(saved).toEqual({ mission_reward: true })
  })

  it('mission_reward 체크를 해제하면 저장 결과에서 빠진다', () => {
    const fields = emptyFields({ missionReward: false })
    expect(buildConditionJsonFromFields(fields)).toBeNull()
  })

  it('mission_reward와 다른 조건 필드가 함께 있어도 둘 다 보존된다', () => {
    const fields = emptyFields({ missionReward: true, distanceKm: '10', activityType: 'running' })
    const saved = buildConditionJsonFromFields(fields)
    expect(saved).toEqual({ mission_reward: true, distance_km: 10, activity_type: 'running' })
  })

  it('조건 필드만 있고 mission_reward는 없으면 그 키 자체가 결과에 없다', () => {
    const fields = emptyFields({ distanceKm: '10' })
    const saved = buildConditionJsonFromFields(fields)
    expect(saved).not.toBeNull()
    expect(saved).not.toHaveProperty('mission_reward')
  })

  it('빈 폼은 null을 반환한다 (기존 동작 유지)', () => {
    expect(buildConditionJsonFromFields(emptyFields())).toBeNull()
  })
})

describe('buildConditionJsonFromFields — 기존 조건 필드 조립 (회귀 방지)', () => {
  it('숫자 필드들을 올바르게 파싱한다', () => {
    const fields = emptyFields({
      distanceKm: '30.5',
      totalCount: '10',
      elevationM: '500',
      minSpeedKmh: '25',
      streakDays: '7',
    })
    expect(buildConditionJsonFromFields(fields)).toEqual({
      distance_km: 30.5,
      total_count: 10,
      elevation_gain_m: 500,
      min_speed_kmh: 25,
      streak_days: 7,
    })
  })

  it('mm:ss 페이스 입력을 초/km로 변환한다', () => {
    expect(parsePaceToSec('5:30')).toBe(330)
    expect(parsePaceToSec('bad-input')).toBeNull()
    expect(buildConditionJsonFromFields(emptyFields({ maxPace: '5:30' }))).toEqual({ max_pace_sec_per_km: 330 })
  })

  it('선행 배지 이름을 쉼표 기준으로 분리한다', () => {
    const fields = emptyFields({ prerequisiteNames: '첫 페달, 아스팔트 입문' })
    expect(buildConditionJsonFromFields(fields)).toEqual({
      prerequisite_badge_names: ['첫 페달', '아스팔트 입문'],
    })
  })

  it('시작/종료 시각이 모두 있어야 time_range가 만들어진다', () => {
    expect(buildConditionJsonFromFields(emptyFields({ timeStart: '22:00' }))).toBeNull()
    expect(buildConditionJsonFromFields(emptyFields({ timeStart: '22:00', timeEnd: '06:00' }))).toEqual({
      time_range: { start: '22:00', end: '06:00' },
    })
  })
})

describe('buildConditionJsonFromFields — 폼 미지원 필드 보존 (티켓 20260825_032)', () => {
  it('day_of_week가 설정된 배지를 폼이 모르는 채로 그대로 저장해도 유실되지 않는다', () => {
    const initCond = { day_of_week: 'sunday' as const, total_count: 1000 }
    // BadgeForm은 total_count 입력 UI가 있으므로 폼 state에도 반영되지만, day_of_week는
    // 폼에 입력 UI가 없어 initCond를 통해서만 전달된다.
    const fields = emptyFields({ totalCount: '1000' })
    const saved = buildConditionJsonFromFields(fields, initCond)
    expect(saved).toEqual({ total_count: 1000, day_of_week: 'sunday' })
  })

  it('active_days_count·route·poi_id도 원본 그대로 보존된다', () => {
    const initCond = { active_days_count: 30, route: 'hangang', poi_id: 'poi-uuid' }
    const saved = buildConditionJsonFromFields(emptyFields(), initCond)
    expect(saved).toEqual({ active_days_count: 30, route: 'hangang', poi_id: 'poi-uuid' })
  })

  it('initCond를 넘기지 않으면(신규 등록) 기존 동작과 동일하다', () => {
    const fields = emptyFields({ distanceKm: '10' })
    expect(buildConditionJsonFromFields(fields)).toEqual({ distance_km: 10 })
  })

  it('폼이 다루는 필드는 initCond 값이 있어도 폼 입력값(state)이 우선한다', () => {
    // 관리자가 폼에서 값을 바꾼 경우, 보존 로직이 그 변경을 덮어쓰면 안 된다.
    const initCond = { distance_km: 10 }
    const saved = buildConditionJsonFromFields(emptyFields({ distanceKm: '20' }), initCond)
    expect(saved).toEqual({ distance_km: 20 })
  })

  it('FORM_UNSUPPORTED_CONDITION_KEYS는 기존 6종 + v5 신규 20종 + repeat_count다', () => {
    // season_count_all은 티켓 20260825_032 원문에 나열되지 않았으나, 폼에 입력 UI가 없으면서도
    // badge-engine이 실제로 평가하는 필드다(migration 076의 "사계절의 발걸음" 배지가 사용 중) —
    // 구현 중 발견, ALL_CONDITION_KEYS 기반 자동 진단으로 함께 잡혔다.
    // same_activity(2026-08-31, 티켓 20260831_2100)도 폼 입력 UI 없이 initCond 보존 경로로만
    // 유지된다 — T1 '야생의 첫발' 1건 외 사용처가 없어 전용 UI를 추가하지 않았다.
    // v5 신규 20종(티켓 20260905_0028)은 레지스트리에 선언만 됐고 어드민 조건 폼은 티켓
    // 20260905_0032 몫이라, 전부 "폼 미지원 = initCond 보존" 경로로 유지된다.
    // repeat_count(티켓 20260905_0030 B1)는 **평가는 구현됐지만** 어드민 입력 UI는 아직
    // 없다 — 「평가 주체」와 「폼 지원」은 별개 축이라 여기 함께 남는다.
    expect([...FORM_UNSUPPORTED_CONDITION_KEYS].sort()).toEqual(
      [
        // 기존 6종
        'active_days_count',
        'day_of_week',
        'poi_id',
        'route',
        'same_activity',
        'season_count_all',
        // v5 신규 20종 — 활동 1건의 스칼라 값 7
        'avg_cadence',
        'avg_heartrate_bpm',
        'avg_watts',
        'max_elevation_m',
        'max_speed_kmh',
        'single_distance_km',
        'single_elevation_m',
        // v5 신규 20종 — 이력 패턴 13
        'activities_within_hours',
        'daily_once_count',
        'day_of_month',
        'distinct_time_bands',
        'interval_days',
        'month_over_month_ratio',
        'negative_split',
        'personal_record_break',
        'rest_after_long',
        'rest_after_streak',
        'return_gap_days',
        'vs_personal_average',
        'weekly_streak',
        // v5 반복 획득 1종 (티켓 20260905_0030 B1)
        'repeat_count',
      ].sort()
    )
  })

  it('getUnsupportedConditionKeys는 값이 있는 미지원 필드만 돌려준다', () => {
    expect(getUnsupportedConditionKeys(null)).toEqual([])
    expect(getUnsupportedConditionKeys({ distance_km: 10 })).toEqual([])
    expect(getUnsupportedConditionKeys({ distance_km: 10, route: 'hangang' })).toEqual(['route'])
  })
})
