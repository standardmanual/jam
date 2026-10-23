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
  missionConditionRangeError,
  readDayOfWeek,
  writeDayOfWeek,
  MISSION_ENGINE_DB_PRESERVED_KEYS,
  MISSION_ENGINE_DELEGATED_KEYS,
  MISSION_ENGINE_PRESERVED_KEYS,
  MISSION_RANGE_CHECKED_KEYS,
  type MissionConditionFormFields,
} from '../missionConditionFields'
import {
  ENGINE_DELEGATED_CONDITION_KEY_LIST,
  ENGINE_DELEGATED_DB_CONDITION_KEY_LIST,
  MISSION_DB_CONDITION_KEY_LIST,
  MISSION_FORBIDDEN_CONDITION_KEYS,
  checkMissionCondition,
  checkMissionConditionValue,
} from '@/lib/missions/condition-keys'
import { getConditionField } from '@/lib/badge-engine/conditionRegistry'
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
  ['elevation_gain_m: 누적 고도', () => {
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
    assert.strictEqual(Object.keys(cond).length, 14)
    for (const key of Object.keys(cond)) {
      assert.ok((MISSION_ENGINE_DELEGATED_KEYS as readonly string[]).includes(key), `폼 목록에 없는 키: ${key}`)
    }
    const f = missionConditionFieldsFrom(cond)
    const rebuilt = buildMissionConditionJson('engine_condition', f, cond)
    assert.deepStrictEqual(rebuilt, cond)
  }],

  // ── 거울 목록 ↔ 정본 (티켓 20261019_1312) ────────────────────────────────
  ['폼 위임 키 + 보존 키 = 정본(ENGINE_DELEGATED_CONDITION_KEY_LIST)', () => {
    const canonical = [...ENGINE_DELEGATED_CONDITION_KEY_LIST].sort()
    const mirrored = [...MISSION_ENGINE_DELEGATED_KEYS, ...MISSION_ENGINE_PRESERVED_KEYS].sort()
    assert.deepStrictEqual(mirrored, canonical, '폼이 다루는 키와 판정에 위임되는 키가 어긋났다')
    // 두 목록은 겹치지 않는다
    assert.strictEqual(
      new Set([...MISSION_ENGINE_DELEGATED_KEYS, ...MISSION_ENGINE_PRESERVED_KEYS]).size,
      MISSION_ENGINE_DELEGATED_KEYS.length + MISSION_ENGINE_PRESERVED_KEYS.length
    )
  }],
  ['폼이 입력 칸을 그리는 위임 키는 day_of_week만 빼고 전부 레지스트리에 폼 정의가 있다', () => {
    for (const key of MISSION_ENGINE_DELEGATED_KEYS) {
      if (key === 'day_of_week') {
        // 레지스트리에 입력 칸 정의가 없는 유일한 키 — 미션 쪽이 읽기·쓰기를 정한다. 레지스트리를 고치지 않았는지도 고정한다
        assert.strictEqual(getConditionField(key)?.form, undefined, 'day_of_week에 레지스트리 폼 정의가 생겼다 — 미션 쪽 정의를 걷어낼 수 있는지 본다')
        continue
      }
      assert.ok(getConditionField(key)?.form, `레지스트리에 폼 정의가 없다: ${key}`)
    }
  }],
  ['위임 키 26개가 전부 폼 목록에 있고 보존 목록은 비었으며 기온 키는 없다 (20261021_1114 1회)', () => {
    assert.strictEqual(MISSION_ENGINE_DELEGATED_KEYS.length, 26)
    assert.deepStrictEqual([...MISSION_ENGINE_DELEGATED_KEYS].sort(), [...ENGINE_DELEGATED_CONDITION_KEY_LIST].sort())
    assert.deepStrictEqual([...MISSION_ENGINE_PRESERVED_KEYS], [])
    for (const key of MISSION_FORBIDDEN_CONDITION_KEYS) {
      assert.ok(!(MISSION_ENGINE_DELEGATED_KEYS as readonly string[]).includes(key), `기온 키가 폼 목록에 있다: ${key}`)
    }
  }],
  ['engine_condition: 시간대·요일·계절·운동 속성 12개를 모두 채워도 그대로 되돌아오고 보존 안내 대상이 아니다', () => {
    const cond: MissionCondition = {
      activity_type: 'running',
      distance_km: 20,
      time_range: { start: '05:00', end: '08:00' },
      distinct_time_bands: 2,
      day_of_week: 'sunday',
      season: 'summer',
      season_count: 3,
      season_count_all: 2,
      max_speed_kmh: 30.5,
      avg_heartrate_bpm: 150,
      avg_watts: 200,
      avg_cadence: 80,
      cumulative_duration_hours: 10.5,
      weekend_duration_hours: 2,
    }
    const f = missionConditionFieldsFrom(cond)
    assert.strictEqual(f.timeStart, '05:00')
    assert.strictEqual(f.timeEnd, '08:00')
    assert.strictEqual(f.dayOfWeek, 'sunday')
    assert.strictEqual(f.season, 'summer')
    const rebuilt = buildMissionConditionJson('engine_condition', f, cond)
    assert.deepStrictEqual(rebuilt, cond, '12개 키 왕복이 어긋났다')
    // 원본 없이도(보존에 기대지 않고) 폼 값만으로 같은 조건이 만들어진다
    assert.deepStrictEqual(buildMissionConditionJson('engine_condition', f, null), cond, '보존 목록이 아니라 입력 칸이 값을 만들어야 한다')
    assert.deepStrictEqual(unsupportedMissionConditionKeys(cond), [])
    assert.deepStrictEqual(checkMissionCondition('engine_condition', rebuilt), { error: null, warning: null })
  }],
  ['engine_condition: 새 12개 키는 입력 칸에서 하나씩 채워도 그 키 하나만 조립된다', () => {
    const cases: Array<[Partial<MissionConditionFormFields>, MissionCondition]> = [
      [{ timeStart: '22:00', timeEnd: '05:00' }, { time_range: { start: '22:00', end: '05:00' } }],
      [{ dayOfWeek: 'monday' }, { day_of_week: 'monday' }],
      [{ season: 'winter' }, { season: 'winter' }],
      [{ seasonCount: '5' }, { season_count: 5 }],
      [{ seasonCountAll: '3' }, { season_count_all: 3 }],
      [{ distinctTimeBands: '3' }, { distinct_time_bands: 3 }],
      [{ weekendDurationHours: '2.5' }, { weekend_duration_hours: 2.5 }],
      [{ cumulativeDurationHours: '120' }, { cumulative_duration_hours: 120 }],
      [{ maxSpeedKmh: '60' }, { max_speed_kmh: 60 }],
      [{ avgHeartrateBpm: '150' }, { avg_heartrate_bpm: 150 }],
      [{ avgWatts: '200' }, { avg_watts: 200 }],
      [{ avgCadence: '180' }, { avg_cadence: 180 }],
    ]
    assert.strictEqual(cases.length, 12)
    for (const [input, expected] of cases) {
      assert.deepStrictEqual(buildMissionConditionJson('engine_condition', fields(input)), expected)
    }
  }],
  ['time_range는 시작·끝 둘 다 있어야 만들어진다', () => {
    assert.strictEqual(buildMissionConditionJson('engine_condition', fields({ timeStart: '05:00' })), null)
    assert.strictEqual(buildMissionConditionJson('engine_condition', fields({ timeEnd: '08:00' })), null)
  }],
  ['day_of_week: 한 요일은 문자열, 여러 요일은 배열, 없으면 키를 넣지 않는다', () => {
    assert.strictEqual(readDayOfWeek('saturday'), 'saturday')
    assert.deepStrictEqual(readDayOfWeek('saturday, sunday'), ['saturday', 'sunday'])
    assert.strictEqual(readDayOfWeek(''), undefined)
    assert.strictEqual(readDayOfWeek('funday'), undefined, '모르는 요일은 버린다')
    assert.deepStrictEqual(readDayOfWeek('friday, funday'), 'friday')
    assert.strictEqual(writeDayOfWeek('sunday'), 'sunday')
    assert.strictEqual(writeDayOfWeek(['saturday', 'sunday']), 'saturday, sunday')
  }],
  ['day_of_week: 한 요일만 든 배열도 열었다 저장하면 배열 그대로 남는다', () => {
    const init: MissionCondition = { weekly_streak: 4, day_of_week: ['saturday'] }
    const rebuilt = buildMissionConditionJson('engine_condition', missionConditionFieldsFrom(init), init)
    assert.deepStrictEqual(rebuilt, init)
    // 원본이 문자열이거나 새 미션이면 한 요일은 문자열이다
    const single: MissionCondition = { distance_km: 10, day_of_week: 'saturday' }
    assert.deepStrictEqual(buildMissionConditionJson('engine_condition', missionConditionFieldsFrom(single), single), single)
  }],
  ['day_of_week 배열(주 단위 연속)도 저장 검증을 통과한다', () => {
    const init: MissionCondition = { weekly_streak: 4, day_of_week: ['saturday', 'sunday'] }
    const rebuilt = buildMissionConditionJson('engine_condition', missionConditionFieldsFrom(init), init)
    assert.deepStrictEqual(rebuilt, init)
    assert.deepStrictEqual(checkMissionCondition('engine_condition', rebuilt), { error: null, warning: null })
  }],

  // ── 입력 범위 ↔ 저장 검증 (20261021_1114 1회) ───────────────────────────
  ['입력 범위를 검사하는 수치 키 9개는 레지스트리에 min·max가 있고, 경계 값은 저장 검증을 통과한다', () => {
    assert.strictEqual(MISSION_RANGE_CHECKED_KEYS.length, 9)
    for (const key of MISSION_RANGE_CHECKED_KEYS) {
      assert.ok((MISSION_ENGINE_DELEGATED_KEYS as readonly string[]).includes(key), `폼 목록에 없는 키: ${key}`)
      const meta = getConditionField(key)
      assert.ok(meta && meta.min !== undefined && meta.max !== undefined, `레지스트리에 범위가 없다: ${key}`)
      for (const edge of [meta.min!, meta.max!]) {
        const cond = { [key]: edge } as MissionCondition
        assert.strictEqual(missionConditionRangeError(cond), null, `${key} 경계 값 ${edge}가 막힌다`)
        assert.deepStrictEqual(checkMissionCondition('engine_condition', cond).error, null, `${key} ${edge}가 서버 키 검사에서 막힌다`)
        assert.deepStrictEqual(checkMissionConditionValue('engine_condition', cond), { error: null, warning: null })
      }
    }
  }],
  ['입력 범위 밖의 값은 키마다 막힌다 — 상한 위, 하한 아래', () => {
    for (const key of MISSION_RANGE_CHECKED_KEYS) {
      const meta = getConditionField(key)!
      const label = meta.label
      for (const bad of [meta.max! + 1, meta.min! - 1]) {
        const error = missionConditionRangeError({ [key]: bad })
        assert.ok(error, `${key} ${bad}가 통과했다`)
        assert.ok(error.includes(label), `${key} 오류에 라벨이 없다`)
        assert.ok(error.includes(String(bad)), `${key} 오류에 입력값이 없다`)
      }
    }
  }],
  ['입력 범위 오류는 문제 키를 한 번에 모두 알리고 단위를 붙인다', () => {
    const error = missionConditionRangeError({ avg_watts: 5000, distinct_time_bands: 9, distance_km: 10 })
    assert.ok(error)
    assert.ok(error.includes('평균 파워 5000W(허용 범위 0~2000W)'), error)
    assert.ok(error.includes('서로 다른 시간대 9개(허용 범위 2~6개)'), error)
    assert.ok(!error.includes('distance_km'), '범위 검사 대상이 아닌 키가 섞였다')
    // 케이던스는 단위가 없다
    assert.ok(missionConditionRangeError({ avg_cadence: 300 })!.includes('평균 케이던스 300(허용 범위 0~250)'))
  }],
  ['입력 범위 검사는 조건이 없거나 대상 키가 없으면 null이다', () => {
    assert.strictEqual(missionConditionRangeError(null), null)
    assert.strictEqual(missionConditionRangeError(undefined), null)
    assert.strictEqual(missionConditionRangeError([]), null)
    assert.strictEqual(missionConditionRangeError({ distance_km: 9999999 }), null)
  }],
  ['engine_condition: 원본이 없으면(새 미션) 보존 키를 만들지 않는다', () => {
    const cond = buildMissionConditionJson('engine_condition', fields({ distanceKm: '10' }))
    assert.deepStrictEqual(cond, { distance_km: 10 })
  }],

  // ── DB 기록 키 20개 보존 (티켓 20261019_1445 1회 14개 + 2회 날짜·체크인 5개 + 3-A회 미션 전용 jam_period_earned 1개) ──────────
  ['DB 기록 보존 키 = 정본 합집합(MISSION_DB_CONDITION_KEY_LIST) 20개 = 배지 쪽 19개 + jam_period_earned이고 배지엔진 위임 키와 겹치지 않는다', () => {
    assert.deepStrictEqual([...MISSION_ENGINE_DB_PRESERVED_KEYS].sort(), [...MISSION_DB_CONDITION_KEY_LIST].sort())
    assert.deepStrictEqual(
      [...MISSION_ENGINE_DB_PRESERVED_KEYS].sort(),
      [...ENGINE_DELEGATED_DB_CONDITION_KEY_LIST, 'jam_period_earned'].sort(),
      '배지 쪽 DB 키 목록만 별칭으로 쓰면 미션 전용 키가 빠져 저장 때 사라진다'
    )
    assert.strictEqual(MISSION_ENGINE_DB_PRESERVED_KEYS.length, 20)
    for (const key of MISSION_ENGINE_DB_PRESERVED_KEYS) {
      assert.ok(!(ENGINE_DELEGATED_CONDITION_KEY_LIST as readonly string[]).includes(key), `위임 키와 겹친다: ${key}`)
      assert.ok(!(MISSION_ENGINE_DELEGATED_KEYS as readonly string[]).includes(key as never), `폼 입력 칸 키와 겹친다: ${key}`)
    }
  }],
  ['engine_condition: DB 기록 키 20개도 열었다 저장하면 그대로 남고 저장 검증을 통과한다', () => {
    const init: MissionCondition = {
      activity_type: 'running',
      distance_km: 20,
      combine_attempt_count: 5,
      combine_success_count: 3,
      combine_fail_count: 2,
      recipe_first_success: { recipe_id: '00000000-0000-0000-0000-0000000000aa' },
      drop_item_count: 4,
      pickup_item_count: 4,
      pickup_from_user_count: 2,
      picked_up_by_user_count: 2,
      mission_complete_count: 3,
      collection_complete_count: 1,
      capsule_open_count: 6,
      locked_item_open_count: 1,
      locked_item_pickup_count: 1,
      cross_tribe_combine_success_count: 2,
      // 2회(티켓 20261019_1445) — 날짜·체크인 5개. 객체 값(장소 종류·이름 목록)도 모양 그대로 남아야 한다
      weekly_active_days: 3,
      same_spot_checkin_days: 2,
      new_checkin_badge_count: 4,
      checkin_category_count: { category: 'train_subway', count: 2 },
      checkin_badge_count: { checkin_badge_names: ['성수역', '왕십리역'], count: 1 },
      // 3-A회 — 미션 전용 키(배지 레지스트리에 없다)도 사라지지 않아야 한다
      jam_period_earned: 300,
    }
    const f = missionConditionFieldsFrom(init)
    const rebuilt = buildMissionConditionJson('engine_condition', f, init)
    assert.deepStrictEqual(rebuilt, init, 'DB 기록 키가 저장 중에 사라졌다')
    assert.deepStrictEqual(checkMissionCondition('engine_condition', rebuilt, 'achievement'), { error: null, warning: null })
    assert.deepStrictEqual(unsupportedMissionConditionKeys(init).sort(), [...MISSION_ENGINE_DB_PRESERVED_KEYS].sort())
  }],
  ['engine_condition: DB 기록 키만 든 미션을 열어 다른 칸을 고쳐도 DB 키는 남는다', () => {
    const init: MissionCondition = { combine_success_count: 3, mission_complete_count: 1 }
    const f = { ...missionConditionFieldsFrom(init), distanceKm: '15' }
    assert.deepStrictEqual(buildMissionConditionJson('engine_condition', f, init), { distance_km: 15, combine_success_count: 3, mission_complete_count: 1 })
  }],
  ['engine_condition: 날짜·체크인 키만 든 미션을 열어 다른 칸을 고쳐도 그 키들은 남는다 (2회)', () => {
    const init: MissionCondition = {
      weekly_active_days: 3,
      checkin_category_count: { category: 'train_subway', count: 2 },
      checkin_badge_count: { checkin_badge_names: ['성수역'], count: 1 },
    }
    const f = { ...missionConditionFieldsFrom(init), distanceKm: '15' }
    assert.deepStrictEqual(buildMissionConditionJson('engine_condition', f, init), { distance_km: 15, ...init })
  }],
  ['engine_condition: jam_period_earned만 든 미션을 열어 다른 칸을 고쳐도 모은 잼 조건은 남고, 순위형으로도 저장 검증을 통과한다 (3-A회)', () => {
    const init: MissionCondition = { jam_period_earned: 300 }
    const f = { ...missionConditionFieldsFrom(init), distanceKm: '15' }
    const rebuilt = buildMissionConditionJson('engine_condition', f, init)
    assert.deepStrictEqual(rebuilt, { distance_km: 15, jam_period_earned: 300 })
    assert.deepStrictEqual(checkMissionCondition('engine_condition', rebuilt, 'ranking'), { error: null, warning: null })
    assert.deepStrictEqual(unsupportedMissionConditionKeys(init), ['jam_period_earned'])
  }],
  ['engine_condition: 원본이 없으면(새 미션) DB 기록 키를 만들지 않는다', () => {
    assert.deepStrictEqual(buildMissionConditionJson('engine_condition', fields({ distanceKm: '10' }), null), { distance_km: 10 })
    assert.deepStrictEqual(buildMissionConditionJson('engine_condition', fields()), null)
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
