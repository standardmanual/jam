/**
 * 미션 조건 빌더 폼 — 라운드트립·저장 검증 통과 회귀 테스트 (티켓 20260911_2118)
 *
 * 배경: `admin/badges/conditionFormFields.test.ts`와 같은 이유로 존재한다 — 필드 빌더가
 * 만드는 `condition_json`이 저장 검증(`checkMissionCondition`/`checkMissionConditionValue`)을
 * 통과하는지, 기존 값을 열었을 때 폼이 원래 값으로 정확히 되돌아가는지(왕복)를 고정한다.
 * `missions/__tests__/*`와 같은 골격(node:assert + 자체 러너)을 쓴다 — 이 폴더도
 * `vitest.config.ts`의 `**\/missions/__tests__/**` 제외 대상이라 vitest로는 못 돈다.
 *
 * 실행: `npx tsx src/app/admin/missions/__tests__/missionConditionFields.test.ts`
 */
import assert from 'node:assert'
import {
  buildMissionConditionJson,
  emptyMissionConditionFields,
  missionConditionFieldsFrom,
  unsupportedMissionConditionKeys,
  MISSION_ENGINE_DELEGATED_KEYS,
  type MissionConditionFormFields,
} from '../missionConditionFields'
import { checkMissionCondition, checkMissionConditionValue } from '@/lib/missions/condition-keys'
import type { MissionCondition, MissionType } from '@/types/database'

function fields(overrides: Partial<MissionConditionFormFields> = {}): MissionConditionFormFields {
  return { ...emptyMissionConditionFields(), ...overrides }
}

const cases: Array<[string, () => void]> = [
  // ── 단순 7종 — 필드 하나만 채우면 저장 검증을 통과한다 ────────────────────
  ['distance: 거리 + 종목 필터', () => {
    const cond = buildMissionConditionJson('distance', fields({ distanceKm: '50', activityType: 'cycling' }))
    assert.deepStrictEqual(cond, { distance_km: 50, activity_type: 'cycling' })
    assert.deepStrictEqual(checkMissionCondition('distance', cond), { error: null, warning: null })
    assert.deepStrictEqual(checkMissionConditionValue('distance', cond), { error: null, warning: null })
  }],
  ['activity_count: 횟수', () => {
    const cond = buildMissionConditionJson('activity_count', fields({ count: '10' }))
    assert.deepStrictEqual(cond, { count: 10 })
    assert.deepStrictEqual(checkMissionConditionValue('activity_count', cond), { error: null, warning: null })
  }],
  ['checkin: 지점은 종목 필터를 쓰지 않는다', () => {
    const poiId = '00000000-0000-0000-0000-000000000001'
    const cond = buildMissionConditionJson('checkin', fields({ poiId, activityType: 'running' }))
    assert.deepStrictEqual(cond, { poi_id: poiId })
    assert.deepStrictEqual(checkMissionConditionValue('checkin', cond), { error: null, warning: null })
  }],
  ['item_collect: 목표 배지', () => {
    const badgeId = '00000000-0000-0000-0000-000000000002'
    const cond = buildMissionConditionJson('item_collect', fields({ badgeId }))
    assert.deepStrictEqual(cond, { badge_id: badgeId })
    assert.deepStrictEqual(checkMissionConditionValue('item_collect', cond), { error: null, warning: null })
  }],
  ['streak_days: 연속 일수', () => {
    const cond = buildMissionConditionJson('streak_days', fields({ streakDays: '7', activityType: 'walking' }))
    assert.deepStrictEqual(cond, { streak_days: 7, activity_type: 'walking' })
  }],
  ['duration_minutes: 단일 활동 시간', () => {
    const cond = buildMissionConditionJson('duration_minutes', fields({ durationMinutes: '60' }))
    assert.deepStrictEqual(cond, { duration_minutes: 60 })
  }],
  ['elevation_gain_m: 단일 활동 고도', () => {
    const cond = buildMissionConditionJson('elevation_gain_m', fields({ elevationM: '500' }))
    assert.deepStrictEqual(cond, { elevation_gain_m: 500 })
  }],
  ['필드를 하나도 채우지 않으면 null', () => {
    assert.strictEqual(buildMissionConditionJson('distance', fields()), null)
  }],

  // ── engine_condition — 다중 조건(AND) 조립 ────────────────────────────
  ['engine_condition: 배지엔진 위임 필드 다중 조합', () => {
    const cond = buildMissionConditionJson(
      'engine_condition',
      fields({ activityType: 'running', singleDistanceKm: '10', sameActivity: true, repeatCount: '3' })
    )
    assert.deepStrictEqual(cond, {
      activity_type: 'running',
      single_distance_km: 10,
      same_activity: true,
      repeat_count: 3,
    })
    assert.deepStrictEqual(checkMissionCondition('engine_condition', cond), { error: null, warning: null })
  }],
  ['engine_condition: weekly_streak + min_count + streak_subset', () => {
    const cond = buildMissionConditionJson(
      'engine_condition',
      fields({
        weeklyStreak: '4',
        weeklyStreakMinCount: '2',
        streakSubsetDayOfWeek: 'saturday, sunday',
        streakSubsetMinCount: '1',
      })
    )
    assert.deepStrictEqual(cond, {
      weekly_streak: 4,
      weekly_streak_min_count: 2,
      streak_subset: { day_of_week: ['saturday', 'sunday'], min_count: 1 },
    })
    assert.deepStrictEqual(checkMissionCondition('engine_condition', cond), { error: null, warning: null })
  }],
  ['engine_condition: streak_subset은 weekly_streak/monthly_streak 없이는 만들어지지 않는다', () => {
    const cond = buildMissionConditionJson(
      'engine_condition',
      fields({ streakSubsetDayOfWeek: 'saturday', streakSubsetMinCount: '1' })
    )
    assert.strictEqual(cond, null)
  }],
  ['engine_condition: distinct_months 3종 묶음', () => {
    const cond = buildMissionConditionJson(
      'engine_condition',
      fields({ distinctMonthsRequired: '2', distinctMonthsMetric: 'elevation_gain_m', distinctMonthsThreshold: '300' })
    )
    assert.deepStrictEqual(cond, {
      distinct_months_required: 2,
      distinct_months_metric: 'elevation_gain_m',
      distinct_months_threshold: 300,
    })
  }],
  ['engine_condition: distinct_weekday_count 단독', () => {
    const cond = buildMissionConditionJson('engine_condition', fields({ distinctWeekdayCount: '3' }))
    assert.deepStrictEqual(cond, { distinct_weekday_count: 3 })
  }],
  ['engine_condition: time_band_counts는 폼에 없지만 원본을 보존한다', () => {
    const init: MissionCondition = {
      activity_type: 'running',
      time_band_counts: [{ start: '05:00', end: '08:00', count: 3 }],
    }
    const f = missionConditionFieldsFrom(init)
    const cond = buildMissionConditionJson('engine_condition', f, init)
    assert.deepStrictEqual(cond, init)
  }],

  // ── 왕복(round trip) — missionConditionFieldsFrom ↔ buildMissionConditionJson ──
  ['왕복: 단순 타입 조건을 열었다 그대로 저장해도 값이 안 바뀐다', () => {
    const missionsToFixtures: Array<[MissionType, MissionCondition]> = [
      ['distance', { activity_type: 'cycling', distance_km: 100 }],
      ['activity_count', { count: 5 }],
      ['checkin', { poi_id: '00000000-0000-0000-0000-000000000003' }],
      ['item_collect', { badge_id: '00000000-0000-0000-0000-000000000004' }],
      ['streak_days', { activity_type: 'running', streak_days: 7 }],
      ['duration_minutes', { duration_minutes: 60 }],
      ['elevation_gain_m', { activity_type: 'hiking', elevation_gain_m: 500 }],
    ]
    for (const [type, cond] of missionsToFixtures) {
      const f = missionConditionFieldsFrom(cond)
      const rebuilt = buildMissionConditionJson(type, f, cond)
      assert.deepStrictEqual(rebuilt, cond, `${type} 왕복 실패`)
    }
  }],
  ['왕복: engine_condition 위임 14종을 모두 채워도 그대로 되돌아온다', () => {
    const cond: MissionCondition = {
      activity_type: 'running',
      distance_km: 10,
      elevation_gain_m: 100,
      single_distance_km: 5,
      single_elevation_m: 50,
      max_elevation_m: 1000,
      max_pace_sec_per_km: 330,
      min_speed_kmh: 10,
      duration_minutes: 30,
      same_activity: true,
      repeat_count: 3,
      rest_after_long: 2,
      streak_days: 7,
      weekly_streak: 4,
    }
    assert.strictEqual(Object.keys(cond).length, MISSION_ENGINE_DELEGATED_KEYS.length)
    const f = missionConditionFieldsFrom(cond)
    const rebuilt = buildMissionConditionJson('engine_condition', f, cond)
    assert.deepStrictEqual(rebuilt, cond)
  }],

  // ── 이 폼이 만드는 값은 전부 저장 검증을 통과해야 한다 ─────────────────────
  ['unsupportedMissionConditionKeys: time_band_counts만 잡는다', () => {
    assert.deepStrictEqual(unsupportedMissionConditionKeys(null), [])
    assert.deepStrictEqual(unsupportedMissionConditionKeys({ distance_km: 1 }), [])
    assert.deepStrictEqual(
      unsupportedMissionConditionKeys({ time_band_counts: [{ start: '05:00', end: '06:00', count: 1 }] }),
      ['time_band_counts']
    )
  }],
]

let passed = 0
for (const [name, fn] of cases) {
  fn()
  passed++
  console.info(`  ✓ ${name}`)
}
console.info(`\n[missionConditionFields] ${passed}/${cases.length} passed`)
