/**
 * BadgeForm 조건 빌더 — 라운드트립·유실 방지 회귀 테스트
 * (티켓 20260825_031 / 20260825_032 / 20260905_0032)
 *
 * 배경: buildConditionJson(현 buildConditionJsonFromFields)이 빈 객체에서 시작해
 * 하드코딩된 필드만 조립하는데 mission_reward용 입력 state가 없었다. 그 결과 미션보상배지
 * 15종 중 하나를 어드민에서 열어 그대로 저장하면 mission_reward 플래그가 조용히 유실되는
 * 회귀가 있었다(084_badge_condition_cleanup.sql과 같은 유형의 사고가 어드민 경로로 재발
 * 가능했음).
 *
 * 티켓 20260905_0032에서 폼이 레지스트리 기반으로 바뀌면서 위험 지점이 «state 키 오타»로
 * 옮겨갔다 — `form.read`가 받는 값이 `Record<string, string | boolean>`이라 컴파일이 오타를
 * 잡지 못하고 그 필드가 조용히 유실된다. 아래 「모든 form.fields가 state 키에 존재한다」가
 * 그 대응을 기계적으로 고정한다.
 *
 * 실행: `npx vitest run src/app/admin/badges/__tests__/conditionFormFields.test.ts`
 */

import {
  buildConditionJsonFromFields,
  conditionFormFieldsFrom,
  emptyConditionFormFields,
  findUnrepresentableConditionKeys,
  parsePaceToSec,
  getUnsupportedConditionKeys,
  FORM_UNSUPPORTED_CONDITION_KEYS,
  FORM_COVERED_CONDITION_KEYS,
  type ConditionFormFields,
} from '../conditionFormFields'
import {
  ALL_CONDITION_FORM_FIELDS,
  CONDITION_FIELDS,
  CONDITION_FORM_ENTRIES,
} from '@/lib/badge-engine/conditionRegistry'
import type { BadgeCondition } from '@/types/database'

/** BadgeForm의 조건 빌더 state 초기값(빈 폼)과 동일한 기본값 */
function emptyFields(overrides: Partial<ConditionFormFields> = {}): ConditionFormFields {
  return { ...emptyConditionFormFields(), ...overrides }
}

describe('폼 state 키 ↔ 레지스트리 form.fields 대응 (티켓 20260905_0032)', () => {
  it('모든 form.fields 항목이 emptyConditionFormFields()의 키에 존재한다 — 조용한 유실 방지', () => {
    const stateKeys = new Set(Object.keys(emptyConditionFormFields()))
    const missing = ALL_CONDITION_FORM_FIELDS.filter((f) => !stateKeys.has(f))
    expect(missing).toEqual([])
  })

  it('반대로, 쓰이지 않는 state 키가 남아 있지 않다', () => {
    const declared = new Set<string>(ALL_CONDITION_FORM_FIELDS)
    const unused = Object.keys(emptyConditionFormFields()).filter((k) => !declared.has(k))
    expect(unused).toEqual([])
  })

  it('form.fields에 중복된 state 키가 없다 — 두 필드가 한 입력을 공유하면 서로를 덮어쓴다', () => {
    const seen = new Set<string>()
    const duplicated = ALL_CONDITION_FORM_FIELDS.filter((f) => (seen.has(f) ? true : (seen.add(f), false)))
    expect(duplicated).toEqual([])
  })

  it('입력 UI를 그리는 컨트롤의 field는 모두 state 키다', () => {
    const stateKeys = new Set(Object.keys(emptyConditionFormFields()))
    const missing = CONDITION_FORM_ENTRIES.filter((e) => !stateKeys.has(e.control.field)).map(
      (e) => e.control.field
    )
    expect(missing).toEqual([])
  })

  it('form이 선언된 필드는 write도 함께 갖는다 — 없으면 폼을 열어 저장하는 것만으로 값이 사라진다', () => {
    const missingWrite = CONDITION_FIELDS.filter((f) => f.form && typeof f.form.write !== 'function').map(
      (f) => f.key
    )
    expect(missingWrite).toEqual([])
  })
})

describe('condition_json ↔ 폼 라운드트립 (티켓 20260905_0032)', () => {
  /** 폼이 다루는 모든 필드를 한 번에 담은 표본 — 하나라도 왕복이 깨지면 여기서 걸린다 */
  const sample: BadgeCondition = {
    distance_km: 30.5,
    total_count: 10,
    streak_days: 7,
    active_days_count: 100,
    elevation_gain_m: 500,
    min_speed_kmh: 25,
    max_pace_sec_per_km: 330,
    duration_minutes: 60,
    activity_type: 'running',
    same_activity: true,
    weekend_duration_hours: 2,
    weekly_count: 3,
    month: 8,
    monthly_km: 100,
    season: 'winter',
    season_count: 5,
    season_count_all: 3,
    weekly_streak: 12,
    day_of_month: 1,
    temperature_min_c: 30,
    temperature_max_c: 0,
    time_range: { start: '22:00', end: '05:00' },
    distinct_time_bands: 3,
    max_elevation_m: 1200,
    max_speed_kmh: 60,
    single_distance_km: 100,
    single_elevation_m: 1000,
    avg_heartrate_bpm: 150,
    avg_watts: 200,
    avg_cadence: 90,
    negative_split: true,
    rest_after_streak: 2,
    rest_after_long: 3,
    return_gap_days: 90,
    interval_days: 90,
    daily_once_count: 30,
    activities_within_hours: { hours: 24, count: 3 },
    personal_record_break: 3,
    month_over_month_ratio: 1.5,
    vs_personal_average: 2,
    repeat_count: 5,
    prerequisite_badge_names: ['첫 페달', '아스팔트 입문'],
    cross_in_axis: { family_keys: ['running:tempo'] },
    cross_between_axis: { family_keys: ['running:streak'], min_rarity: 'rare' },
    gate_mission_badge: { family_keys: ['running:oath'], min_count: 1 },
    mission_reward: true,
  }

  it('표본이 폼 지원 필드를 전부 덮는다 — 새 필드를 추가하면 여기도 채워야 한다', () => {
    const covered = new Set(Object.keys(sample))
    expect(FORM_COVERED_CONDITION_KEYS.filter((k) => !covered.has(k))).toEqual([])
  })

  it('폼으로 되돌렸다가 다시 조립해도 값이 그대로다', () => {
    expect(buildConditionJsonFromFields(conditionFormFieldsFrom(sample))).toEqual(sample)
  })

  it('왕복이 깨지는 필드가 하나도 없다', () => {
    expect(findUnrepresentableConditionKeys(sample)).toEqual([])
  })

  it('여러 달(month 배열)도 유실 없이 왕복한다 — 예전에는 첫 달로 접혔다', () => {
    const cond: BadgeCondition = { month: [6, 7], monthly_km: 100 }
    expect(buildConditionJsonFromFields(conditionFormFieldsFrom(cond))).toEqual(cond)
  })

  it('쉼표가 든 선행 배지 이름은 「재현 불가」로 잡힌다 (저장은 막지 않고 경고한다)', () => {
    const cond: BadgeCondition = { prerequisite_badge_names: ['첫 페달, 두 번째'] }
    expect(findUnrepresentableConditionKeys(cond)).toEqual(['prerequisite_badge_names'])
  })

  it('형태가 깨진 교차 게이트도 「재현 불가」로 잡힌다', () => {
    const cond = { cross_in_axis: { family_keys: 'running:tempo' } } as unknown as BadgeCondition
    expect(findUnrepresentableConditionKeys(cond)).toEqual(['cross_in_axis'])
  })
})

describe('buildConditionJsonFromFields — mission_reward 라운드트립', () => {
  it('미션 보상 배지를 로드 후 그대로 저장하면(다른 필드 변경 없음) mission_reward가 유실 없이 보존된다', () => {
    // BadgeForm이 condition_json = {mission_reward: true}인 배지를 열면 initCond.mission_reward
    // === true → condFields.missionReward가 true로 초기화되고, 다른 필드는 전부 빈 값이다.
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

  it('교차 게이트는 계열 키가 있을 때만 만들어진다 (티켓 20260905_0032 A-4)', () => {
    expect(buildConditionJsonFromFields(emptyFields({ crossInAxisMinRarity: 'rare' }))).toBeNull()
    expect(
      buildConditionJsonFromFields(
        emptyFields({ crossInAxisFamilyKeys: 'running:tempo, running:interval', crossInAxisMinCount: '2' })
      )
    ).toEqual({
      cross_in_axis: { family_keys: ['running:tempo', 'running:interval'], min_count: 2 },
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

  it('route·poi_id도 원본 그대로 보존된다', () => {
    const initCond = { route: 'hangang', poi_id: 'poi-uuid' }
    const saved = buildConditionJsonFromFields(emptyFields(), initCond)
    expect(saved).toEqual({ route: 'hangang', poi_id: 'poi-uuid' })
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

  it('FORM_UNSUPPORTED_CONDITION_KEYS는 day_of_week·route·poi_id 3종만 남았다', () => {
    // 티켓 20260905_0032 A-2에서 v5 신규 20종 + repeat_count + 교차 게이트 3종 + 기존 3종
    // (active_days_count·same_activity·season_count_all)에 입력 UI가 생겼다.
    // 남은 셋은 전용 UI가 필요하거나(day_of_week: 요일 다중 선택) 엔진 평가가 없어
    // (route) 이번 범위 밖이거나, 다른 경로로 관리된다(poi_id: 지점 연결 UI).
    expect([...FORM_UNSUPPORTED_CONDITION_KEYS].sort()).toEqual(['day_of_week', 'poi_id', 'route'])
  })

  it('getUnsupportedConditionKeys는 값이 있는 미지원 필드만 돌려준다', () => {
    expect(getUnsupportedConditionKeys(null)).toEqual([])
    expect(getUnsupportedConditionKeys({ distance_km: 10 })).toEqual([])
    expect(getUnsupportedConditionKeys({ distance_km: 10, route: 'hangang' })).toEqual(['route'])
  })
})
