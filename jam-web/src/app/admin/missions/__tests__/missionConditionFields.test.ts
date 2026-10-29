/**
 * 미션 조건 빌더 폼 — 라운드트립·저장 검증 통과 회귀 테스트 (티켓 20260911_2118)
 *
 * 배경: `admin/badges/conditionFormFields.test.ts`와 같은 이유로 존재한다 — 필드 빌더가
 * 만드는 `condition_json`이 저장 검증(`checkMissionCondition`/`checkMissionConditionValue`)을
 * 통과하는지, 기존 값을 열었을 때 폼이 원래 값으로 정확히 되돌아가는지(왕복)를 고정한다.
 * `missions/__tests__/*`와 같은 골격(node:assert + 자체 러너)을 쓴다 — 이 파일도
 * `vitest.config.ts`의 제외 목록에 파일 이름으로 올라 있어 vitest로는 못 돈다.
 *
 * 실행: `npx tsx src/app/admin/missions/__tests__/missionConditionFields.test.ts`
 */
import assert from 'node:assert'
import {
  buildMissionConditionJson,
  emptyMissionConditionFields,
  filledMissionDbKeys,
  findMissionNonIntegerInputs,
  missionConditionFieldsFrom,
  missionIntegerInputError,
  unsupportedMissionConditionKeys,
  missionConditionRangeError,
  readDayOfWeek,
  writeDayOfWeek,
  JAM_PERIOD_EARNED_INPUT,
  MISSION_DB_FORM_GROUPS,
  MISSION_DB_FORM_KEYS,
  MISSION_DB_HELP_OVERRIDES,
  MISSION_DB_OBJECT_COUNT_FIELDS,
  MISSION_DB_OBJECT_COUNT_RANGE,
  MISSION_DB_RANGE_CHECKED_KEYS,
  MISSION_ENGINE_DB_PRESERVED_KEYS,
  MISSION_ENGINE_DELEGATED_KEYS,
  MISSION_ENGINE_PRESERVED_KEYS,
  MISSION_RANGE_CHECKED_KEYS,
  selectOptionsWithCurrent,
  type MissionConditionFormFields,
} from '../missionConditionFields'
import {
  ENGINE_DELEGATED_CONDITION_KEY_LIST,
  ENGINE_DELEGATED_DB_CONDITION_KEY_LIST,
  MISSION_DB_CONDITION_KEY_LIST,
  MISSION_FORBIDDEN_CONDITION_KEYS,
  MISSION_PERIOD_UNSUPPORTED_CONDITION_KEYS,
  checkMissionCondition,
  checkMissionConditionValue,
} from '@/lib/missions/condition-keys'
import { describeNonIntegerInputs, getConditionField } from '@/lib/badge-engine/conditionRegistry'
import type { MissionCondition, MissionType } from '@/types/database'

function fields(overrides: Partial<MissionConditionFormFields> = {}): MissionConditionFormFields {
  return { ...emptyMissionConditionFields(), ...overrides }
}

/** 범위를 검사하는 DB 기록 키 하나의 입력 범위 [하한, 상한]. 레지스트리 정의를 읽고, 레지스트리에 범위가 없는 키는 이 폼이 정한 범위다 */
function dbBounds(key: string): [number, number] {
  if (key === 'jam_period_earned') return [JAM_PERIOD_EARNED_INPUT.min, JAM_PERIOD_EARNED_INPUT.max]
  const meta = getConditionField(key)!
  if (meta.min !== undefined && meta.max !== undefined) return [meta.min, meta.max]
  return [MISSION_DB_OBJECT_COUNT_RANGE.min, MISSION_DB_OBJECT_COUNT_RANGE.max]
}

function dbEdges(key: string): number[] {
  return dbBounds(key)
}

function dbLabel(key: string): string {
  return key === 'jam_period_earned' ? JAM_PERIOD_EARNED_INPUT.label : getConditionField(key)!.label
}

/** DB 기록 키 하나에 숫자를 넣은 조건 — 객체형 두 키는 안쪽 `count`에 넣는다 */
function dbCondition(key: string, value: number): MissionCondition {
  if (key === 'checkin_category_count') return { checkin_category_count: { category: 'train_subway', count: value } }
  if (key === 'checkin_badge_count') return { checkin_badge_count: { checkin_badge_names: ['성수역'], count: value } }
  return { [key]: value } as MissionCondition
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

  // ── DB 기록 키 20개 입력 칸 (티켓 20261019_1445가 판정을 만들고 20261021_1114 2회가 입력 칸을 만들었다) ──────────
  ['DB 기록 키 20개가 전부 폼 목록에 있고 보존 목록은 비었다 — 폼 목록 = 정본 합집합 = 배지 쪽 19개 + jam_period_earned', () => {
    assert.deepStrictEqual([...MISSION_DB_FORM_KEYS].sort(), [...MISSION_DB_CONDITION_KEY_LIST].sort())
    assert.deepStrictEqual(
      [...MISSION_DB_FORM_KEYS].sort(),
      [...ENGINE_DELEGATED_DB_CONDITION_KEY_LIST, 'jam_period_earned'].sort(),
      '배지 쪽 DB 키 목록만 쓰면 미션 전용 키가 빠져 입력 칸이 없어진다'
    )
    assert.strictEqual(MISSION_DB_FORM_KEYS.length, 20)
    assert.strictEqual(new Set(MISSION_DB_FORM_KEYS).size, 20, '키가 두 번 들어 있다')
    assert.deepStrictEqual([...MISSION_ENGINE_DB_PRESERVED_KEYS], [], 'DB 기록 키가 보존 목록에 남아 있다')
    for (const key of MISSION_DB_FORM_KEYS) {
      assert.ok(!(ENGINE_DELEGATED_CONDITION_KEY_LIST as readonly string[]).includes(key), `위임 키와 겹친다: ${key}`)
      assert.ok(!(MISSION_ENGINE_DELEGATED_KEYS as readonly string[]).includes(key), `위임 키 입력 칸과 겹친다: ${key}`)
    }
    for (const key of MISSION_FORBIDDEN_CONDITION_KEYS) {
      assert.ok(!(MISSION_DB_FORM_KEYS as readonly string[]).includes(key), `기온 키가 DB 기록 폼 목록에 있다: ${key}`)
    }
  }],
  ['기록으로 세는 조건은 소제목 6개로 나뉜다 — 믹스 5, 드랍·픽업 4, 완료 수 2, 캡슐·잠긴 아이템 배지 3, 날짜·체크인 5, 잼 1', () => {
    assert.deepStrictEqual(
      MISSION_DB_FORM_GROUPS.map((g) => [g.title, g.keys.length]),
      [['믹스', 5], ['드랍·픽업', 4], ['완료 수', 2], ['캡슐·잠긴 아이템 배지', 3], ['날짜·체크인', 5], ['잼', 1]]
    )
    assert.deepStrictEqual(MISSION_DB_FORM_GROUPS[0]!.keys, [
      'combine_attempt_count', 'combine_success_count', 'combine_fail_count', 'recipe_first_success', 'cross_tribe_combine_success_count',
    ])
    assert.deepStrictEqual(MISSION_DB_FORM_GROUPS[5]!.keys, ['jam_period_earned'])
  }],
  ['기간을 걸 수 없는 키 5개는 입력 칸 목록에 없고 어느 칸 이름과도 이어지지 않으며, 서버는 저장 단계에서 거절한다', () => {
    const unsupported = Object.keys(MISSION_PERIOD_UNSUPPORTED_CONDITION_KEYS)
    assert.deepStrictEqual(
      [...unsupported].sort(),
      ['chapter_reached', 'days_since_signup', 'jam_total_earned', 'other_tribe_item_kinds_count', 'signup_recent_active_days']
    )
    const fieldNames = new Set(Object.keys(emptyMissionConditionFields()))
    const controlFields = new Set(
      [...MISSION_DB_FORM_KEYS, ...MISSION_ENGINE_DELEGATED_KEYS].flatMap((key) =>
        (getConditionField(key)?.form?.controls ?? []).map((c) => c.field)
      )
    )
    for (const key of unsupported) {
      assert.ok(!(MISSION_DB_FORM_KEYS as readonly string[]).includes(key), `DB 기록 폼 목록에 있다: ${key}`)
      assert.ok(!(MISSION_ENGINE_DELEGATED_KEYS as readonly string[]).includes(key), `위임 키 폼 목록에 있다: ${key}`)
      // 레지스트리가 이 키에 붙인 폼 칸 이름이 미션 폼 state에도 컨트롤에도 없어야 한다
      for (const field of getConditionField(key)?.form?.fields ?? []) {
        assert.ok(!fieldNames.has(field), `${key}의 칸 ${field}이 미션 폼 state에 있다`)
        assert.ok(!controlFields.has(field), `${key}의 칸 ${field}을 폼이 그린다`)
      }
      const cond = { [key]: 5 } as MissionCondition
      assert.ok(checkMissionCondition('engine_condition', cond).error, `서버가 ${key}를 거절하지 않는다`)
    }
  }],
  ['DB 기록 키 19개는 레지스트리의 폼 정의를 쓰고(라벨·단위·범위 그대로), jam_period_earned만 레지스트리에 없다', () => {
    const fieldNames = new Set(Object.keys(emptyMissionConditionFields()))
    for (const key of MISSION_DB_FORM_KEYS) {
      if (key === 'jam_period_earned') {
        assert.strictEqual(getConditionField(key), undefined, 'jam_period_earned가 레지스트리에 생겼다 — 미션 쪽 정의를 걷어낼 수 있는지 본다')
        assert.ok(fieldNames.has(JAM_PERIOD_EARNED_INPUT.field))
        continue
      }
      const meta = getConditionField(key)
      assert.ok(meta?.form?.controls?.length, `레지스트리에 폼 정의가 없다: ${key}`)
      for (const field of meta.form.fields) assert.ok(fieldNames.has(field), `${key}의 칸 ${field}이 미션 폼 state에 없다`)
    }
  }],
  ['jam_period_earned 입력 칸 정의: 기간 동안 모은 잼, 단위 잼, 1~1,000,000 정수, 도움말은 사용자가 정한 문구', () => {
    assert.strictEqual(JAM_PERIOD_EARNED_INPUT.label, '기간 동안 모은 잼')
    assert.strictEqual(JAM_PERIOD_EARNED_INPUT.unit, '잼')
    assert.strictEqual(JAM_PERIOD_EARNED_INPUT.min, 1)
    assert.strictEqual(JAM_PERIOD_EARNED_INPUT.max, 1000000)
    assert.strictEqual(JAM_PERIOD_EARNED_INPUT.step, 1)
    assert.strictEqual(JAM_PERIOD_EARNED_INPUT.help, '참가한 뒤 미션 기간 안에 받은 잼(움직여서 받은 잼 + 서비스에서 한 일로 받은 잼)을 합해요. 참가 전에 받은 잼과 사라진 잼은 포함되지 않아요.')
  }],
  ['입력 범위: 수치 키 16개 가운데 13개는 1~1,000,000, 주간 활동일 1~7, 같은 장소 체크인 일수 1~3650, 새 체크인 배지 수 1~100000', () => {
    const range = (key: string) => [getConditionField(key)?.min, getConditionField(key)?.max]
    assert.deepStrictEqual(range('weekly_active_days'), [1, 7])
    assert.deepStrictEqual(range('same_spot_checkin_days'), [1, 3650])
    assert.deepStrictEqual(range('new_checkin_badge_count'), [1, 100000])
    const scalarKeys = MISSION_DB_RANGE_CHECKED_KEYS.filter(
      (key) => key !== 'jam_period_earned' && key !== 'checkin_category_count' && key !== 'checkin_badge_count'
    )
    assert.strictEqual(scalarKeys.length, 16)
    const million = scalarKeys.filter((key) => range(key)[0] === 1 && range(key)[1] === 1000000)
    assert.strictEqual(million.length, 13, '1~1,000,000인 수치 키 수가 달라졌다')
    // 범위 검사 대상 19개 = 수치 16개 + 미션 전용 1개 + 객체형 두 키의 안쪽 count. 숫자가 없는 레시피 지정은 대상이 아니다
    assert.strictEqual(MISSION_DB_RANGE_CHECKED_KEYS.length, 19)
    assert.ok(!(MISSION_DB_RANGE_CHECKED_KEYS as readonly string[]).includes('recipe_first_success'))
    // 객체형 두 키는 레지스트리에 범위가 없어 이 폼이 정한다
    for (const key of ['checkin_category_count', 'checkin_badge_count']) {
      assert.deepStrictEqual(range(key), [undefined, undefined], `${key}에 레지스트리 범위가 생겼다 — 이 폼의 범위를 걷어낼 수 있는지 본다`)
    }
  }],
  ['engine_condition: DB 기록 키 20개를 입력 칸에서 하나씩 채워도 그 키 하나만 조립되고 저장 검증을 통과한다', () => {
    const recipe = '00000000-0000-0000-0000-0000000000aa'
    const cases: Array<[Partial<MissionConditionFormFields>, MissionCondition]> = [
      [{ combineAttemptCount: '10' }, { combine_attempt_count: 10 }],
      [{ combineSuccessCount: '5' }, { combine_success_count: 5 }],
      [{ combineFailCount: '3' }, { combine_fail_count: 3 }],
      [{ recipeFirstSuccessRecipeId: ` ${recipe} ` }, { recipe_first_success: { recipe_id: recipe } }],
      [{ crossTribeCombineSuccessCount: '3' }, { cross_tribe_combine_success_count: 3 }],
      [{ dropItemCount: '5' }, { drop_item_count: 5 }],
      [{ pickupItemCount: '20' }, { pickup_item_count: 20 }],
      [{ pickupFromUserCount: '3' }, { pickup_from_user_count: 3 }],
      [{ pickedUpByUserCount: '3' }, { picked_up_by_user_count: 3 }],
      [{ missionCompleteCount: '3' }, { mission_complete_count: 3 }],
      [{ collectionCompleteCount: '2' }, { collection_complete_count: 2 }],
      [{ capsuleOpenCount: '5' }, { capsule_open_count: 5 }],
      [{ lockedItemOpenCount: '3' }, { locked_item_open_count: 3 }],
      [{ lockedItemPickupCount: '3' }, { locked_item_pickup_count: 3 }],
      [{ weeklyActiveDays: '3' }, { weekly_active_days: 3 }],
      [{ sameSpotCheckinDays: '10' }, { same_spot_checkin_days: 10 }],
      [{ newCheckinBadgeCount: '3' }, { new_checkin_badge_count: 3 }],
      [
        { checkinCategoryCountCategory: 'train_subway', checkinCategoryCountCount: '2' },
        { checkin_category_count: { category: 'train_subway', count: 2 } },
      ],
      [
        { checkinBadgeCountNames: '성수역, 왕십리역', checkinBadgeCountCount: '1' },
        { checkin_badge_count: { checkin_badge_names: ['성수역', '왕십리역'], count: 1 } },
      ],
      [{ jamPeriodEarned: '300' }, { jam_period_earned: 300 }],
    ]
    assert.strictEqual(cases.length, 20)
    assert.deepStrictEqual(
      cases.map(([, expected]) => Object.keys(expected)[0]).sort(),
      [...MISSION_DB_FORM_KEYS].sort(),
      '20개 키가 한 번씩 시험되지 않았다'
    )
    for (const [input, expected] of cases) {
      const cond = buildMissionConditionJson('engine_condition', fields(input))
      assert.deepStrictEqual(cond, expected)
      assert.deepStrictEqual(checkMissionCondition('engine_condition', cond), { error: null, warning: null })
      assert.deepStrictEqual(checkMissionConditionValue('engine_condition', cond), { error: null, warning: null })
      assert.strictEqual(missionConditionRangeError(cond), null)
      assert.deepStrictEqual(filledMissionDbKeys(fields(input)), [Object.keys(expected)[0]])
    }
  }],
  ['engine_condition: DB 기록 키 20개를 모두 채워도 그대로 되돌아오고 원본 없이도 입력 칸이 값을 만들며, 보존 안내 대상이 아니다', () => {
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
      // 객체 값(장소 종류·이름 목록)도 모양 그대로 남아야 한다
      weekly_active_days: 3,
      same_spot_checkin_days: 2,
      new_checkin_badge_count: 4,
      checkin_category_count: { category: 'train_subway', count: 2 },
      checkin_badge_count: { checkin_badge_names: ['성수역', '왕십리역'], count: 1 },
      // 미션 전용 키(배지 레지스트리에 없다)도 사라지지 않아야 한다
      jam_period_earned: 300,
    }
    const f = missionConditionFieldsFrom(init)
    assert.strictEqual(f.checkinCategoryCountCategory, 'train_subway')
    assert.strictEqual(f.checkinBadgeCountNames, '성수역, 왕십리역')
    assert.strictEqual(f.jamPeriodEarned, '300')
    const rebuilt = buildMissionConditionJson('engine_condition', f, init)
    assert.deepStrictEqual(rebuilt, init, 'DB 기록 키가 저장 중에 사라졌다')
    assert.deepStrictEqual(buildMissionConditionJson('engine_condition', f, null), init, '보존이 아니라 입력 칸이 값을 만들어야 한다')
    assert.deepStrictEqual(checkMissionCondition('engine_condition', rebuilt, 'achievement'), { error: null, warning: null })
    assert.deepStrictEqual(checkMissionConditionValue('engine_condition', rebuilt), { error: null, warning: null })
    assert.deepStrictEqual(unsupportedMissionConditionKeys(init), [])
    assert.strictEqual(filledMissionDbKeys(f).length, 20)
  }],
  ['engine_condition: DB 기록 키만 든 미션을 열어 다른 칸을 고쳐도 DB 키는 남는다', () => {
    const init: MissionCondition = { combine_success_count: 3, mission_complete_count: 1 }
    const f = { ...missionConditionFieldsFrom(init), distanceKm: '15' }
    assert.deepStrictEqual(buildMissionConditionJson('engine_condition', f, init), { distance_km: 15, combine_success_count: 3, mission_complete_count: 1 })
  }],
  ['engine_condition: 날짜·체크인 키만 든 미션을 열어 다른 칸을 고쳐도 그 키들은 남는다', () => {
    const init: MissionCondition = {
      weekly_active_days: 3,
      checkin_category_count: { category: 'train_subway', count: 2 },
      checkin_badge_count: { checkin_badge_names: ['성수역'], count: 1 },
    }
    const f = { ...missionConditionFieldsFrom(init), distanceKm: '15' }
    assert.deepStrictEqual(buildMissionConditionJson('engine_condition', f, init), { distance_km: 15, ...init })
  }],
  ['engine_condition: jam_period_earned만 든 미션을 열어 다른 칸을 고쳐도 모은 잼 조건은 남고, 순위형으로도 저장 검증을 통과한다', () => {
    const init: MissionCondition = { jam_period_earned: 300 }
    const f = { ...missionConditionFieldsFrom(init), distanceKm: '15' }
    const rebuilt = buildMissionConditionJson('engine_condition', f, init)
    assert.deepStrictEqual(rebuilt, { distance_km: 15, jam_period_earned: 300 })
    assert.deepStrictEqual(checkMissionCondition('engine_condition', rebuilt, 'ranking'), { error: null, warning: null })
    assert.deepStrictEqual(unsupportedMissionConditionKeys(init), [])
  }],
  ['칸을 비우면 그 DB 기록 키는 조건에서 빠진다 — 보존이 지우려는 값을 되살리지 않는다', () => {
    const init: MissionCondition = { distance_km: 10, capsule_open_count: 3, jam_period_earned: 300 }
    const f = { ...missionConditionFieldsFrom(init), capsuleOpenCount: '', jamPeriodEarned: '' }
    assert.deepStrictEqual(buildMissionConditionJson('engine_condition', f, init), { distance_km: 10 })
  }],
  ['객체형 DB 기록 키는 두 칸이 모두 있어야 만들어진다 (장소 카테고리+개수, 배지 이름+개수)', () => {
    assert.strictEqual(buildMissionConditionJson('engine_condition', fields({ checkinCategoryCountCategory: 'train_subway' })), null)
    assert.strictEqual(buildMissionConditionJson('engine_condition', fields({ checkinCategoryCountCount: '2' })), null)
    assert.strictEqual(buildMissionConditionJson('engine_condition', fields({ checkinBadgeCountNames: '성수역' })), null)
    assert.strictEqual(buildMissionConditionJson('engine_condition', fields({ checkinBadgeCountCount: '1' })), null)
    assert.strictEqual(buildMissionConditionJson('engine_condition', fields({ recipeFirstSuccessRecipeId: '   ' })), null)
    assert.strictEqual(buildMissionConditionJson('engine_condition', fields({ jamPeriodEarned: '' })), null)
  }],
  ['주입한 선택지(장소 카테고리)에 없는 저장값은 값 그대로 덧붙이고, 비어 있으면 덧붙이지 않는다', () => {
    const options = [{ value: 'train_subway', label: '지하철역' }]
    assert.deepStrictEqual(selectOptionsWithCurrent(options, 'train_subway'), options)
    assert.deepStrictEqual(selectOptionsWithCurrent(options, ''), options)
    assert.deepStrictEqual(selectOptionsWithCurrent(options, 'removed'), [...options, { value: 'removed', label: 'removed' }])
    assert.deepStrictEqual(selectOptionsWithCurrent([], 'removed'), [{ value: 'removed', label: 'removed' }])
    // 원본 배열을 바꾸지 않는다
    assert.strictEqual(options.length, 1)
  }],
  ['도움말을 바꾸는 칸 이름은 모두 DB 기록 키의 레지스트리 컨트롤에 실제로 있다 (낡은 이름이 남지 않는다)', () => {
    const controlFields = new Set(
      MISSION_DB_FORM_KEYS.flatMap((key) => (getConditionField(key)?.form?.controls ?? []).map((c) => c.field))
    )
    for (const field of Object.keys(MISSION_DB_HELP_OVERRIDES)) {
      assert.ok(controlFields.has(field), `레지스트리 컨트롤에 없는 칸: ${field}`)
    }
    for (const field of MISSION_DB_OBJECT_COUNT_FIELDS) {
      assert.ok(controlFields.has(field), `레지스트리 컨트롤에 없는 칸: ${field}`)
    }
    // 배지 기준 말(«발급»)과 가입일 기준 말이 미션 도움말에 남지 않는다
    for (const text of Object.values(MISSION_DB_HELP_OVERRIDES)) {
      assert.ok(!text.includes('발급'), `미션 도움말에 «발급»이 있다: ${text}`)
      assert.ok(!text.includes('가입한 날'), `미션 도움말에 가입일 기준 말이 있다: ${text}`)
    }
  }],

  // ── 미션 타입을 바꿀 때 (20261021_1114 2회) ──────────────────────────────
  ['타입을 바꾸면 DB 기록 조건은 저장되지 않지만 입력 칸 값은 그대로라, 되돌리면 같은 조건이 돌아온다', () => {
    const f = fields({ capsuleOpenCount: '5', jamPeriodEarned: '300', distanceKm: '10', count: '4' })
    assert.deepStrictEqual(filledMissionDbKeys(f), ['capsule_open_count', 'jam_period_earned'])
    // 복합 조건이 아닌 타입은 DB 기록 키를 조립하지 않는다
    assert.deepStrictEqual(buildMissionConditionJson('distance', f), { distance_km: 10 })
    assert.deepStrictEqual(buildMissionConditionJson('activity_count', f), { count: 4 })
    // 같은 입력 상태로 복합 조건으로 되돌리면 값이 돌아온다
    assert.deepStrictEqual(buildMissionConditionJson('engine_condition', f), {
      distance_km: 10,
      capsule_open_count: 5,
      jam_period_earned: 300,
    })
  }],
  ['복합 조건이 아닌 미션에 남은 DB 기록 키는 열 때 입력 칸에 채워져 경고 대상이 된다', () => {
    const init: MissionCondition = { distance_km: 10, drop_item_count: 3 }
    assert.deepStrictEqual(filledMissionDbKeys(missionConditionFieldsFrom(init)), ['drop_item_count'])
    assert.deepStrictEqual(filledMissionDbKeys(emptyMissionConditionFields()), [])
    assert.deepStrictEqual(buildMissionConditionJson('distance', missionConditionFieldsFrom(init), init), { distance_km: 10 })
  }],

  // ── DB 기록 키 입력 범위 ↔ 서버 저장 검증 (20261021_1114 2회) ──────────────
  ['범위를 검사하는 DB 기록 키 19개: 경계 값은 폼과 서버 검사를 모두 통과한다', () => {
    for (const key of MISSION_DB_RANGE_CHECKED_KEYS) {
      for (const edge of dbEdges(key)) {
        const cond = dbCondition(key, edge)
        assert.strictEqual(missionConditionRangeError(cond), null, `${key} 경계 값 ${edge}가 폼에서 막힌다`)
        assert.deepStrictEqual(checkMissionCondition('engine_condition', cond), { error: null, warning: null }, `${key} ${edge}`)
        assert.deepStrictEqual(checkMissionConditionValue('engine_condition', cond), { error: null, warning: null }, `${key} ${edge}가 서버 값 검사에서 막힌다`)
      }
    }
  }],
  ['범위를 검사하는 DB 기록 키 19개: 하한 아래(0)는 폼과 서버가 같이 막고, 상한 위는 폼만 막는다', () => {
    for (const key of MISSION_DB_RANGE_CHECKED_KEYS) {
      const [min, max] = dbBounds(key)
      const below = dbCondition(key, min - 1)
      assert.ok(missionConditionRangeError(below), `${key} ${min - 1}이 폼을 통과했다`)
      assert.ok(checkMissionConditionValue('engine_condition', below).error, `${key} ${min - 1}이 서버 값 검사를 통과했다 — 폼과 서버 기준이 어긋났다`)

      const above = dbCondition(key, max + 1)
      const error = missionConditionRangeError(above)
      assert.ok(error, `${key} ${max + 1}이 폼을 통과했다`)
      assert.ok(error.includes(String(max + 1)), `${key} 오류에 입력값이 없다`)
      assert.ok(error.includes(dbLabel(key)), `${key} 오류에 라벨이 없다`)
      // 서버는 위쪽 한계를 보지 않는다 — 폼이 막지 않으면 도달할 수 없는 값이 저장된다 (서버 쪽 범위 검사는 티켓 20261023_1613)
      assert.strictEqual(checkMissionConditionValue('engine_condition', above).error, null, `${key} 서버가 상한을 보기 시작했다 — 폼 검사와 합치는지 본다`)
    }
  }],
  ['DB 기록 키는 소수도 막는다 (서버 기준 값 검사와 같은 «1 이상의 정수»)', () => {
    for (const key of MISSION_DB_RANGE_CHECKED_KEYS) {
      const cond = dbCondition(key, 2.5)
      assert.ok(missionConditionRangeError(cond), `${key} 2.5가 폼을 통과했다`)
      assert.ok(checkMissionConditionValue('engine_condition', cond).error, `${key} 2.5가 서버 값 검사를 통과했다`)
    }
  }],
  ['DB 기록 키 범위 오류: 주간 활동일 8일, 모은 잼 0잼, 체크인 카테고리 개수를 한 번에 모두 알리고 단위를 붙인다', () => {
    const error = missionConditionRangeError({
      weekly_active_days: 8,
      jam_period_earned: 0,
      checkin_category_count: { category: 'train_subway', count: 1000001 },
      capsule_open_count: 3,
    })
    assert.ok(error)
    assert.ok(error.includes('주간 활동일 8일(허용 범위 1~7일의 정수)'), error)
    assert.ok(error.includes('기간 동안 모은 잼 0잼(허용 범위 1~1000000잼의 정수)'), error)
    assert.ok(error.includes('체크인 카테고리 보유 개수 1000001개(허용 범위 1~1000000개의 정수)'), error)
    assert.ok(!error.includes('캡슐'), '범위 안의 키가 섞였다')
    assert.ok(error.startsWith('저장하지 못했어요.'))
  }],
  ['객체형 두 키의 안쪽 count 범위는 1~1,000,000이고 칸에도 같은 범위를 건다', () => {
    assert.deepStrictEqual({ ...MISSION_DB_OBJECT_COUNT_RANGE }, { min: 1, max: 1000000, step: 1 })
    assert.deepStrictEqual([...MISSION_DB_OBJECT_COUNT_FIELDS], ['checkinCategoryCountCount', 'checkinBadgeCountCount'])
    assert.strictEqual(missionConditionRangeError({ checkin_badge_count: { checkin_badge_names: ['성수역'], count: 0 } })?.includes('지정 체크인 배지 보유 개수 0개'), true)
    assert.strictEqual(missionConditionRangeError({ checkin_badge_count: { checkin_badge_names: ['성수역'], count: 1 } }), null)
    // 모양이 틀린 객체는 이 검사의 대상이 아니다(서버 값 검사가 막는다)
    assert.strictEqual(missionConditionRangeError({ checkin_badge_count: 5 }), null)
    assert.strictEqual(missionConditionRangeError({ recipe_first_success: { recipe_id: 'x' } }), null)
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

  // ── 정수 칸의 소수·지수 표기는 저장 전에 막는다 (티켓 20261023_1748) ─────────────
  ['정수 검사(단순 타입): 입력 글자 «2.5»는 읽기에서 2로 잘리지만 검사가 칸 이름과 함께 짚는다', () => {
    const f = fields({ count: '2.5' })
    assert.deepStrictEqual(buildMissionConditionJson('activity_count', f), { count: 2 }) // 읽기는 그대로다
    assert.deepStrictEqual(findMissionNonIntegerInputs('activity_count', f), [
      { field: 'count', label: '목표 활동 횟수', raw: '2.5' },
    ])
    const exp = fields({ streakDays: '1e3' })
    assert.deepStrictEqual(buildMissionConditionJson('streak_days', exp), { streak_days: 1 })
    assert.deepStrictEqual(findMissionNonIntegerInputs('streak_days', exp), [
      { field: 'streakDays', label: '목표 연속 활동 일수', raw: '1e3' },
    ])
    const fraction = fields({ durationMinutes: '7.9' })
    assert.deepStrictEqual(buildMissionConditionJson('duration_minutes', fraction), { duration_minutes: 7 })
    assert.deepStrictEqual(findMissionNonIntegerInputs('duration_minutes', fraction), [
      { field: 'durationMinutes', label: '목표 단일 활동 시간', raw: '7.9' },
    ])
  }],
  ['정수 검사(단순 타입): 소수를 받는 타입과 정수 칸이 없는 타입, 정수·빈 칸은 통과한다', () => {
    assert.deepStrictEqual(findMissionNonIntegerInputs('distance', fields({ distanceKm: '12.5' })), [])
    assert.deepStrictEqual(findMissionNonIntegerInputs('elevation_gain_m', fields({ elevationM: '500.5' })), [])
    assert.deepStrictEqual(findMissionNonIntegerInputs('checkin', fields({ poiId: 'x' })), [])
    assert.deepStrictEqual(findMissionNonIntegerInputs('item_collect', fields({ badgeId: 'x' })), [])
    assert.deepStrictEqual(findMissionNonIntegerInputs('activity_count', fields({ count: '10' })), [])
    assert.deepStrictEqual(findMissionNonIntegerInputs('activity_count', fields({ count: '+10' })), [])
    assert.deepStrictEqual(findMissionNonIntegerInputs('activity_count', fields()), [])
  }],
  ['정수 검사: 다른 타입으로 바꾸기 전에 남은 글자는 저장되지 않는 값이라 막지 않는다', () => {
    const stale = fields({ count: '2.5', streakDays: '1e3', distinctTimeBands: '2.5', weeklyActiveDays: '7.9' })
    assert.deepStrictEqual(findMissionNonIntegerInputs('distance', stale), [])
    assert.deepStrictEqual(findMissionNonIntegerInputs('checkin', stale), [])
    assert.deepStrictEqual(findMissionNonIntegerInputs('duration_minutes', stale), [])
    assert.strictEqual(findMissionNonIntegerInputs('activity_count', stale).length, 1) // 그 타입의 칸 하나만 본다
    assert.strictEqual(findMissionNonIntegerInputs('streak_days', stale).length, 1)
  }],
  ['정수 검사(engine_condition): 위임 키·미션 전용 칸·기록으로 세는 키·잼 칸을 모두 짚는다', () => {
    const cases: Array<[Partial<MissionConditionFormFields>, string, string]> = [
      [{ distinctTimeBands: '2.5' }, 'distinctTimeBands', '서로 다른 시간대'],
      [{ repeatCount: '1e3' }, 'repeatCount', '충족 횟수'],
      [{ weeklyStreak: '3.5' }, 'weeklyStreak', '연속 주(월~일) 수'],
      [{ monthlyStreak: '1e3' }, 'monthlyStreak', '연속 개월 수'],
      [{ distinctWeekdayCount: '2.5' }, 'distinctWeekdayCount', '서로 다른 요일 수'],
      [{ distinctMonthsRequired: '2.5' }, 'distinctMonthsRequired', '서로 다른 달 수'],
      [{ weeklyActiveDays: '7.9' }, 'weeklyActiveDays', getConditionField('weekly_active_days')!.label],
      [{ checkinBadgeCountNames: '성수역', checkinBadgeCountCount: '1.5' }, 'checkinBadgeCountCount', '보유 개수'],
      [{ jamPeriodEarned: '2.5' }, 'jamPeriodEarned', JAM_PERIOD_EARNED_INPUT.label],
    ]
    for (const [overrides, field, label] of cases) {
      const found = findMissionNonIntegerInputs('engine_condition', fields(overrides))
      assert.strictEqual(found.length, 1, field)
      assert.strictEqual(found[0].field, field)
      assert.strictEqual(found[0].label, label)
      assert.strictEqual(found[0].raw, (overrides as Record<string, string>)[field])
    }
  }],
  ['정수 검사(engine_condition): 소수를 받는 칸은 막지 않는다', () => {
    const decimals = fields({
      distanceKm: '12.5',
      elevationM: '500.5',
      minSpeedKmh: '8.5',
      weekendDurationHours: '1.5',
      distinctMonthsRequired: '2',
      distinctMonthsThreshold: '30.5',
      maxSpeedKmh: '31.5',
    })
    assert.deepStrictEqual(findMissionNonIntegerInputs('engine_condition', decimals), [])
  }],
  ['정수 검사(engine_condition): 안 읽히는 칸의 남은 글자는 막지 않는다 (연속 주·개월 수가 비면 최소 횟수 칸이 꺼진다)', () => {
    assert.deepStrictEqual(findMissionNonIntegerInputs('engine_condition', fields({ weeklyStreakMinCount: '1.5' })), [])
    assert.deepStrictEqual(findMissionNonIntegerInputs('engine_condition', fields({ monthlyStreakMinCount: '1.5' })), [])
    assert.deepStrictEqual(findMissionNonIntegerInputs('engine_condition', fields({ streakSubsetMinCount: '1.5' })), [])
    // 읽히면 막는다
    const weekly = findMissionNonIntegerInputs('engine_condition', fields({ weeklyStreak: '3', weeklyStreakMinCount: '1.5' }))
    assert.deepStrictEqual(weekly.map((i) => i.field), ['weeklyStreakMinCount'])
    const monthly = findMissionNonIntegerInputs('engine_condition', fields({ monthlyStreak: '3', monthlyStreakMinCount: '1.5' }))
    assert.deepStrictEqual(monthly.map((i) => i.field), ['monthlyStreakMinCount'])
    const subset = findMissionNonIntegerInputs('engine_condition', fields({ monthlyStreak: '3', streakSubsetMinCount: '1.5' }))
    assert.deepStrictEqual(subset.map((i) => i.field), ['streakSubsetMinCount'])
  }],
  ['정수 검사: 여러 칸이면 화면 순서대로 모으고, 문구는 배지 양식과 같은 함수가 만든다', () => {
    const f = fields({ distinctTimeBands: '2.5', monthlyStreak: '1e3', jamPeriodEarned: '3.5', weeklyActiveDays: '7.9' })
    const found = findMissionNonIntegerInputs('engine_condition', f)
    assert.deepStrictEqual(found.map((i) => i.field), ['distinctTimeBands', 'monthlyStreak', 'weeklyActiveDays', 'jamPeriodEarned'])
    const message = missionIntegerInputError('engine_condition', f)
    assert.strictEqual(message, describeNonIntegerInputs(found))
    assert.strictEqual(
      message,
      '서로 다른 시간대에는 정수만 쓸 수 있어요. 소수나 e가 든 값은 정수로 고쳐 주세요. (입력한 값: 2.5) 이 밖에 3칸에도 정수가 아닌 값이 있어요.'
    )
    assert.ok(!/[—–]/.test(message ?? ''), '엠대시를 쓰지 않는다')
    assert.strictEqual(missionIntegerInputError('engine_condition', fields({ distinctTimeBands: '3' })), null)
  }],
  ['정수 검사 누락 방지: 각 폼 state 키에 «2.5»를 넣었을 때 읽은 값이 «2»를 넣었을 때와 같으면 그 타입의 검사가 그 칸을 짚는다', () => {
    const missionTypes: MissionType[] = [
      'distance', 'checkin', 'activity_count', 'item_collect', 'streak_days', 'duration_minutes', 'elevation_gain_m', 'engine_condition',
    ]
    // 다른 칸을 모두 «2»로 채워 연속 주·개월 수가 있어야 읽히는 칸도 읽히게 한다
    const base = Object.fromEntries(
      Object.entries(emptyMissionConditionFields()).map(([key, value]) => [key, typeof value === 'string' ? '2' : value])
    ) as MissionConditionFormFields
    const stringKeys = Object.entries(emptyMissionConditionFields())
      .filter(([, value]) => typeof value === 'string')
      .map(([key]) => key as keyof MissionConditionFormFields)

    const truncated = new Set<string>()
    for (const missionType of missionTypes) {
      for (const key of stringKeys) {
        const build = (value: string) => JSON.stringify(buildMissionConditionJson(missionType, { ...base, [key]: value }))
        if (build('2') === build('') || build('2.5') !== build('2')) continue
        truncated.add(key)
        const flagged = findMissionNonIntegerInputs(missionType, { ...base, [key]: '2.5' }).map((i) => i.field)
        assert.ok(flagged.includes(key), `${missionType}의 ${key}: «2.5»가 2로 잘리는데 검사가 짚지 않는다`)
      }
    }
    // 빈 표본으로 통과하지 않는다 — 단순 타입 칸, 레지스트리 위임 칸, 미션 전용 칸, 기록으로 세는 칸, 잼 칸이 모두 들어온다
    for (const key of ['count', 'streakDays', 'durationMinutes', 'distinctTimeBands', 'weeklyStreakMinCount', 'monthlyStreak',
      'monthlyStreakMinCount', 'streakSubsetMinCount', 'distinctWeekdayCount', 'distinctMonthsRequired', 'weeklyActiveDays',
      'checkinBadgeCountCount', 'jamPeriodEarned']) {
      assert.ok(truncated.has(key), `표본에 ${key}가 없다`)
    }
  }],
]

let passed = 0
for (const [name, fn] of cases) {
  fn()
  passed++
  console.info(`  ✓ ${name}`)
}
console.info(`\n[missionConditionFields] ${passed}/${cases.length} passed`)
