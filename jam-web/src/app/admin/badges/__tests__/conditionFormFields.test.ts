/**
 * BadgeForm 조건 빌더 — mission_reward 라운드트립 회귀 테스트 (티켓 20260825_029)
 *
 * 배경: buildConditionJson(현 buildConditionJsonFromFields)이 빈 객체에서 시작해
 * 하드코딩된 필드만 조립하는데 mission_reward용 입력 state가 없었다. 그 결과 미션보상배지
 * 15종 중 하나를 어드민에서 열어 그대로 저장하면 mission_reward 플래그가 조용히 유실되는
 * 회귀가 있었다(084_badge_condition_cleanup.sql과 같은 유형의 사고가 어드민 경로로 재발
 * 가능했음 — 이번 조사 중 발견).
 *
 * 실행: `npx vitest run src/app/admin/badges/__tests__/conditionFormFields.test.ts`
 */

import { buildConditionJsonFromFields, parsePaceToSec, type ConditionFormFields } from '../conditionFormFields'

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
