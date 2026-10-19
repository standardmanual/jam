/**
 * 미션 조건 키 화이트리스트 검증 — 순수 로직 유닛 테스트 (티켓 20260905_1141)
 *
 * 검증 범위:
 *   - 오타 키 거부 + 문제 키·교정 제안이 문구에 나오는지
 *   - 미션 고유 키(count·badge_id)와 배지 조건 키가 모두 통과하는지
 *   - pending 키: 엔진 위임 타입은 거부 / 그 외 타입은 통과 + 고지
 *   - condition_json 부재(PATCH 부분 갱신) 통과, 배열·스칼라·null 거부(터지지 않음)
 *   - 프로덕션 45건(2026-09-05 실측)의 9개 조건 조합이 전부 통과하는지
 *   - 저장 허용 목록 ↔ checker.ts의 fail-closed 통과 목록이 같은 값인지
 *   - 순위형 금지(밤 조건·캡슐 연 횟수)·기온 키 거부·판정하지 않는 키 경고 (티켓 20261019_1312)
 *   - DB 기록 키 14개의 판정 가능 집합 편입, 기간을 걸 수 없는 키 5개의 저장 거절 (티켓 20261019_1445)
 *
 * `MissionCondition`에 필드를 추가했을 때 허용 키 누락이 «컴파일 에러»로 드러나는지는
 * 런타임에서 확인할 수 없다(타입은 런타임에 없다). `condition-keys.ts` 끝의
 * `AssertAllMissionConditionKeysCovered`가 그 역할을 하며, 검증 절차는 아래와 같다 —
 * `MissionCondition`에 `pace_bonus?: number`를 임시로 추가하고 `npx tsc --noEmit`을 돌리면
 * 「Type 'pace_bonus' does not satisfy the constraint 'never'」가 난다(2026-09-05 실측).
 *
 * 실행: `npx tsx src/lib/missions/__tests__/condition-keys.test.ts` (node assert — 러너 불필요)
 */
import assert from 'node:assert'
import {
  DEFAULT_MISSION_STATUS_DISPLAY_TYPE,
  ENGINE_CONDITION_JUDGED_KEYS,
  ENGINE_DELEGATED_CONDITION_KEY_LIST,
  ENGINE_DELEGATED_DB_CONDITION_KEY_LIST,
  ENGINE_DELEGATED_MISSION_TYPES,
  MISSION_ALLOWED_CONDITION_KEYS,
  MISSION_FORBIDDEN_CONDITION_KEYS,
  MISSION_ONLY_CONDITION_KEYS,
  MISSION_PERIOD_UNSUPPORTED_CONDITION_KEYS,
  checkMissionCondition,
  dbConditionKeysIn,
  rankingConditionError,
  suggestMissionConditionKey,
  usesNightCondition,
} from '../condition-keys'
import { ALL_CONDITION_KEYS, findBlockingConditionKeys } from '@/lib/badge-engine/conditionRegistry'
import { inTimeRange } from '@/lib/badge-engine/activityFilters'
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeCondition, MissionCondition, MissionType } from '@/types/database'

/**
 * 프로덕션 실측(2026-09-05, `missions` 45행)의 mission_type × condition_json 조합 9종.
 * 건수 내림차순 — 주석의 숫자는 그 조합을 쓰는 미션 수다.
 *
 * `activity_type`이 있는 조합과 없는 조합이 같은 mission_type 안에 공존한다
 * (`activity_count`·`distance`) — 필터 키는 선택이므로 둘 다 통과해야 한다.
 */
const PRODUCTION_FIXTURES: Array<[MissionType, MissionCondition]> = [
  ['distance', { activity_type: 'cycling', distance_km: 100 }], // 9
  ['duration_minutes', { activity_type: 'running', duration_minutes: 60 }], // 9
  ['item_collect', { badge_id: '00000000-0000-0000-0000-000000000001' }], // 6
  ['activity_count', { count: 3 }], // 5 — activity_type 없음
  ['activity_count', { activity_type: 'running', count: 5 }], // 5
  ['checkin', { poi_id: '00000000-0000-0000-0000-000000000002' }], // 4
  ['elevation_gain_m', { activity_type: 'cycling', elevation_gain_m: 500 }], // 3
  ['streak_days', { activity_type: 'running', streak_days: 7 }], // 3
  ['distance', { distance_km: 30 }], // 1 — activity_type 없음
]

/** 레지스트리에 있으나 아직 아무도 평가하지 않는 키 — fail-closed 대상 */
const PENDING_KEY = 'route'

const cases: Array<[string, () => void]> = [
  // ── 오타 키 ──────────────────────────────────────────────────
  ['오타 키는 거부하고 문제 키를 문구에 넣는다', () => {
    const { error } = checkMissionCondition('distance', { distnace_km: 50 })
    assert.ok(error, '오타 키가 통과됐다')
    assert.ok(error!.includes('distnace_km'), `문제 키가 문구에 없다: ${error}`)
  }],
  ['오타 키에는 교정 제안을 함께 준다', () => {
    const { error } = checkMissionCondition('distance', { distnace_km: 50 })
    assert.ok(error!.includes('distance_km'), `교정 제안이 문구에 없다: ${error}`)
  }],
  ['가까운 후보가 없는 키는 제안 없이 거부한다', () => {
    const { error } = checkMissionCondition('distance', { totally_made_up_field: 1 })
    assert.ok(error!.includes('totally_made_up_field'))
    assert.ok(error!.includes('오타가 없는지'), `대체 문구가 아니다: ${error}`)
  }],
  ['suggestMissionConditionKey: 편집거리 2 이하만 제안한다', () => {
    assert.strictEqual(suggestMissionConditionKey('distnace_km'), 'distance_km')
    assert.strictEqual(suggestMissionConditionKey('badge_di'), 'badge_id')
    assert.strictEqual(suggestMissionConditionKey('totally_made_up_field'), null)
    // 정확히 일치하는 키는 「제안」이 아니다
    assert.strictEqual(suggestMissionConditionKey('distance_km'), null)
  }],

  // ── 허용 키 ──────────────────────────────────────────────────
  ['미션 고유 키(count·badge_id)는 배지 레지스트리에 없어도 통과한다', () => {
    assert.ok(!ALL_CONDITION_KEYS.includes('count' as never), 'count가 배지 레지스트리에 있다 — 전제가 바뀌었다')
    assert.ok(!ALL_CONDITION_KEYS.includes('badge_id' as never), 'badge_id가 배지 레지스트리에 있다 — 전제가 바뀌었다')
    assert.deepStrictEqual(checkMissionCondition('activity_count', { activity_type: 'running', count: 3 }), { error: null, warning: null })
    assert.deepStrictEqual(checkMissionCondition('item_collect', { badge_id: 'abc' }), { error: null, warning: null })
  }],
  ['배지 조건 키는 그대로 통과한다', () => {
    for (const condition of [
      { distance_km: 10 },
      { activity_type: 'running' },
      { streak_days: 5 },
      { duration_minutes: 30 },
      { elevation_gain_m: 300 },
      { poi_id: 'poi-1' },
    ] as MissionCondition[]) {
      const { error } = checkMissionCondition('distance', condition)
      assert.strictEqual(error, null, `거부됐다: ${JSON.stringify(condition)} → ${error}`)
    }
  }],

  // ── pending 키 ───────────────────────────────────────────────
  ['엔진 위임 타입 + pending 키 → 거부', () => {
    for (const type of ENGINE_DELEGATED_MISSION_TYPES) {
      const { error } = checkMissionCondition(type, { activity_type: 'running', [PENDING_KEY]: 'x' })
      assert.ok(error, `${type}에서 pending 키가 통과됐다`)
      assert.ok(error!.includes(PENDING_KEY), `문제 키가 문구에 없다: ${error}`)
      assert.ok(error!.includes('달성되지 않아요'), `결과 고지가 없다: ${error}`)
    }
  }],
  ['비-엔진위임 타입 + pending 키 → 저장은 통과하되 고지한다', () => {
    for (const type of ['distance', 'activity_count', 'checkin', 'item_collect'] as MissionType[]) {
      const { error, warning } = checkMissionCondition(type, { distance_km: 10, [PENDING_KEY]: 'x' })
      assert.strictEqual(error, null, `${type}에서 막혔다: ${error}`)
      assert.ok(warning, `${type}에서 고지가 없다`)
      assert.ok(warning!.includes(PENDING_KEY), `문제 키가 고지에 없다: ${warning}`)
    }
  }],
  ['엔진 위임 타입 판정은 checker.ts와 같은 목록을 쓴다', () => {
    assert.deepStrictEqual(
      [...ENGINE_DELEGATED_MISSION_TYPES].sort(),
      ['duration_minutes', 'elevation_gain_m', 'engine_condition', 'streak_days']
    )
  }],

  // ── 형태 방어 ────────────────────────────────────────────────
  ['condition_json 부재(PATCH 부분 갱신)는 통과한다', () => {
    assert.deepStrictEqual(checkMissionCondition('distance', undefined), { error: null, warning: null })
  }],
  ['배열·스칼라·null은 터지지 않고 거부한다', () => {
    for (const value of [[1, 2], 'distance_km', 42, true, null]) {
      const { error } = checkMissionCondition('distance', value)
      assert.ok(error, `거부되지 않았다: ${JSON.stringify(value)}`)
      assert.ok(error!.includes('객체'), `형태 안내가 없다: ${error}`)
    }
  }],
  ['빈 객체는 거부하지 않는다 (조건 없는 미션은 이 검증의 범위가 아니다)', () => {
    assert.deepStrictEqual(checkMissionCondition('distance', {}), { error: null, warning: null })
  }],

  // ── 프로덕션 실데이터 ────────────────────────────────────────
  ['프로덕션 45건의 조건 조합이 전부 통과한다', () => {
    for (const [type, condition] of PRODUCTION_FIXTURES) {
      assert.deepStrictEqual(
        checkMissionCondition(type, condition),
        { error: null, warning: null },
        `막혔다: ${type} ${JSON.stringify(condition)}`
      )
    }
  }],
  ['값이 null인 키도 터지지 않고 통과한다 (키 검증이지 값 검증이 아니다)', () => {
    // 프로덕션의 item_collect 6건이 전부 `{"badge_id": null}`이다(2026-09-05 실측).
    // 목표 배지가 비어 실질 달성 불가로 보이지만 그건 «값» 문제이고, 이 검증의 대상은
    // «키»다. 여기서 막으면 기존 6건의 수정 저장이 전부 거부된다 — 통과시켜야 한다.
    assert.deepStrictEqual(
      checkMissionCondition('item_collect', { badge_id: null } as unknown as MissionCondition),
      { error: null, warning: null }
    )
  }],

  ['프로덕션 조건은 평가 경로의 fail-closed에도 걸리지 않는다', () => {
    // 저장 검증과 checker.ts의 fail-closed가 같은 허용 목록을 쓰는지 — 둘이 갈리면
    // 「저장은 되는데 평가에서 막힌다」가 생긴다.
    for (const [type, condition] of PRODUCTION_FIXTURES) {
      const blocking = findBlockingConditionKeys(condition as BadgeCondition, MISSION_ONLY_CONDITION_KEYS)
      assert.deepStrictEqual(
        { unknown: blocking.unknown, pending: blocking.pending },
        { unknown: [], pending: [] },
        `평가 경로에서 막힌다: ${type} ${JSON.stringify(condition)}`
      )
    }
  }],

  // ── 단일 출처 ────────────────────────────────────────────────
  ['허용 키 = 배지 레지스트리 ∪ 미션 고유 키', () => {
    for (const key of ALL_CONDITION_KEYS) {
      assert.ok(MISSION_ALLOWED_CONDITION_KEYS.has(key), `배지 조건 키가 빠졌다: ${key}`)
    }
    for (const key of MISSION_ONLY_CONDITION_KEYS) {
      assert.ok(MISSION_ALLOWED_CONDITION_KEYS.has(key), `미션 고유 키가 빠졌다: ${key}`)
    }
    assert.strictEqual(
      MISSION_ALLOWED_CONDITION_KEYS.size,
      ALL_CONDITION_KEYS.length + MISSION_ONLY_CONDITION_KEYS.size
    )
  }],
  ['미션 고유 키는 배지 레지스트리와 겹치지 않는다', () => {
    for (const key of MISSION_ONLY_CONDITION_KEYS) {
      assert.ok(!ALL_CONDITION_KEYS.includes(key as never), `중복 선언: ${key}`)
    }
  }],
  ['MissionCondition의 모든 필드가 전부 허용 키에 들어 있다', () => {
    // 타입 단언(AssertAllMissionConditionKeysCovered)의 런타임 대응물 — 아래 객체는
    // MissionCondition으로 타입이 붙어 있어 필드명이 바뀌면 컴파일 단계에서 먼저 걸린다.
    const everyField: Required<MissionCondition> = {
      distance_km: 1,
      activity_type: 'running',
      poi_id: 'poi',
      count: 1,
      badge_id: 'badge',
      streak_days: 1,
      duration_minutes: 1,
      elevation_gain_m: 1,
      // 티켓 20260906_2231 — engine_condition 전용 위임 필드
      single_distance_km: 1,
      single_elevation_m: 1,
      max_elevation_m: 1,
      max_pace_sec_per_km: 1,
      min_speed_kmh: 1,
      same_activity: true,
      repeat_count: 1,
      rest_after_long: 1,
      weekly_streak: 1,
      // 티켓 20261019_1312 — engine_condition 전용 위임 필드(시간대·요일·계절·운동 속성)
      time_range: { start: '05:00', end: '08:00' },
      distinct_time_bands: 1,
      day_of_week: 'monday',
      season: 'summer',
      season_count: 1,
      season_count_all: 1,
      max_speed_kmh: 1,
      avg_heartrate_bpm: 1,
      avg_watts: 1,
      avg_cadence: 1,
      cumulative_duration_hours: 1,
      weekend_duration_hours: 1,
      // 티켓 20260906_2231 — engine_condition 전용 미션 고유 어휘
      weekly_streak_min_count: 1,
      monthly_streak: 1,
      monthly_streak_min_count: 1,
      streak_subset: { day_of_week: ['saturday', 'sunday'], min_count: 1 },
      distinct_weekday_count: 1,
      distinct_months_required: 1,
      distinct_months_metric: 'distance_km',
      distinct_months_threshold: 1,
      time_band_counts: [{ start: '05:00', end: '08:00', count: 1 }],
      // 티켓 20261019_1445 — engine_condition 전용 DB 기록 키 19종(1회 14종 + 2회 날짜·체크인 5종)
      combine_attempt_count: 1,
      combine_success_count: 1,
      combine_fail_count: 1,
      recipe_first_success: { recipe_id: 'recipe' },
      drop_item_count: 1,
      pickup_item_count: 1,
      pickup_from_user_count: 1,
      picked_up_by_user_count: 1,
      mission_complete_count: 1,
      collection_complete_count: 1,
      capsule_open_count: 1,
      locked_item_open_count: 1,
      locked_item_pickup_count: 1,
      cross_tribe_combine_success_count: 1,
      weekly_active_days: 1,
      same_spot_checkin_days: 1,
      new_checkin_badge_count: 1,
      checkin_category_count: { category: 'train_subway', count: 1 },
      checkin_badge_count: { checkin_badge_names: ['성수역'], count: 1 },
    }
    for (const key of Object.keys(everyField)) {
      assert.ok(MISSION_ALLOWED_CONDITION_KEYS.has(key), `허용 키에 없다: ${key}`)
    }
    assert.deepStrictEqual(checkMissionCondition('distance', everyField), { error: null, warning: null })
  }],

  // ── 위임 키 정본 (티켓 20261019_1312) ─────────────────────────────────
  ['위임 키 정본: 시간대·요일·계절·운동 속성 12개를 포함하고 기온 키는 없다', () => {
    const added = [
      'time_range', 'distinct_time_bands', 'day_of_week', 'season', 'season_count', 'season_count_all',
      'max_speed_kmh', 'avg_heartrate_bpm', 'avg_watts', 'avg_cadence', 'cumulative_duration_hours', 'weekend_duration_hours',
    ]
    for (const key of added) {
      assert.ok((ENGINE_DELEGATED_CONDITION_KEY_LIST as readonly string[]).includes(key), `위임 키에 없다: ${key}`)
    }
    assert.strictEqual(ENGINE_DELEGATED_CONDITION_KEY_LIST.length, 14 + added.length)
    for (const key of MISSION_FORBIDDEN_CONDITION_KEYS) {
      assert.ok(!(ENGINE_DELEGATED_CONDITION_KEY_LIST as readonly string[]).includes(key), `기온 키가 위임된다: ${key}`)
    }
  }],
  ['판정 가능 키 = 위임 키 26개 + 복합 조건 전용 키 9개 + DB 기록 키 19개 (count·badge_id는 다른 타입의 목표 값이라 뺀다)', () => {
    for (const key of ENGINE_DELEGATED_CONDITION_KEY_LIST) assert.ok(ENGINE_CONDITION_JUDGED_KEYS.has(key), key)
    for (const key of ENGINE_DELEGATED_DB_CONDITION_KEY_LIST) assert.ok(ENGINE_CONDITION_JUDGED_KEYS.has(key), key)
    const engineOnly = [...MISSION_ONLY_CONDITION_KEYS].filter((key) => key !== 'count' && key !== 'badge_id')
    assert.strictEqual(engineOnly.length, 9)
    for (const key of engineOnly) assert.ok(ENGINE_CONDITION_JUDGED_KEYS.has(key), key)
    assert.ok(!ENGINE_CONDITION_JUDGED_KEYS.has('count'))
    assert.ok(!ENGINE_CONDITION_JUDGED_KEYS.has('badge_id'))
    assert.strictEqual(ENGINE_DELEGATED_CONDITION_KEY_LIST.length, 26)
    assert.strictEqual(ENGINE_DELEGATED_DB_CONDITION_KEY_LIST.length, 19)
    assert.strictEqual(ENGINE_CONDITION_JUDGED_KEYS.size, 26 + 9 + 19, '위임 키·복합 조건 전용 키·DB 기록 키가 겹치거나 빠졌다')
  }],
  ['DB 기록 키 19개: 믹스 4·드랍·픽업 4·완료 수 2·새 키 4·날짜·체크인 5이고 위임 키·기간 불가 키와 겹치지 않는다', () => {
    assert.deepStrictEqual([...ENGINE_DELEGATED_DB_CONDITION_KEY_LIST].sort(), [
      'capsule_open_count', 'checkin_badge_count', 'checkin_category_count', 'collection_complete_count', 'combine_attempt_count',
      'combine_fail_count', 'combine_success_count', 'cross_tribe_combine_success_count', 'drop_item_count', 'locked_item_open_count',
      'locked_item_pickup_count', 'mission_complete_count', 'new_checkin_badge_count', 'picked_up_by_user_count',
      'pickup_from_user_count', 'pickup_item_count', 'recipe_first_success', 'same_spot_checkin_days', 'weekly_active_days',
    ])
    for (const key of ENGINE_DELEGATED_DB_CONDITION_KEY_LIST) {
      assert.ok(ALL_CONDITION_KEYS.includes(key as never), `배지 레지스트리에 없다: ${key}`)
      assert.ok(!(ENGINE_DELEGATED_CONDITION_KEY_LIST as readonly string[]).includes(key), `배지엔진 위임 키와 겹친다: ${key}`)
      assert.ok(!(key in MISSION_PERIOD_UNSUPPORTED_CONDITION_KEYS), `기간 불가 키와 겹친다: ${key}`)
    }
  }],
  ['dbConditionKeysIn: 값이 있는 DB 키만 돌려주고 객체가 아니면 빈 배열', () => {
    assert.deepStrictEqual(
      dbConditionKeysIn({ distance_km: 10, combine_success_count: 3, capsule_open_count: 0, jam_total_earned: 5 }),
      ['combine_success_count', 'capsule_open_count']
    )
    assert.deepStrictEqual(dbConditionKeysIn({ combine_success_count: undefined }), [])
    assert.deepStrictEqual(dbConditionKeysIn(null), [])
    assert.deepStrictEqual(dbConditionKeysIn([1]), [])
    assert.deepStrictEqual(dbConditionKeysIn('x'), [])
  }],

  // ── 기온 키 ──────────────────────────────────────────────────
  ['기온 키는 어떤 미션 타입에서도 저장하지 못한다', () => {
    for (const type of ['engine_condition', 'distance', 'streak_days'] as MissionType[]) {
      for (const key of MISSION_FORBIDDEN_CONDITION_KEYS) {
        const { error, warning } = checkMissionCondition(type, { distance_km: 10, [key]: 30 })
        assert.ok(error, `${type}에서 ${key}가 통과됐다`)
        assert.strictEqual(warning, null)
        assert.ok(error!.includes(key), `문제 키가 문구에 없다: ${error}`)
        assert.ok(error!.includes('날씨와 기온'), `원인이 없다: ${error}`)
        assert.ok(error!.includes('빼고 다시 저장'), `해결책이 없다: ${error}`)
      }
    }
  }],

  // ── 순위형 금지 ──────────────────────────────────────────────
  ['usesNightCondition: 22:00~05:00과 겹치는 time_range·time_band_counts·부분집합 시간대만 밤이다', () => {
    const night = (start: string, end: string) => usesNightCondition({ time_range: { start, end } })
    assert.ok(night('22:00', '05:00'), '22~05')
    assert.ok(night('23:00', '02:00'), '자정을 넘기는 구간')
    assert.ok(night('20:00', '23:00'), '저녁에서 밤으로 걸치는 구간')
    assert.ok(night('04:00', '08:00'), '새벽 4시대를 포함하는 구간')
    assert.ok(night('00:00', '03:00'), '자정 이후')
    assert.ok(night('22:00', '22:00'), '시작과 끝이 같은 밤의 한 분')
    // 엔진(inTimeRange)처럼 양 끝을 포함한다 — 22:00에 시작한 활동도 `18:00~22:00`에 센다
    assert.ok(night('18:00', '22:00'), '끝이 22:00인 저녁 구간은 22:00 한 분을 센다')
    // 밤 시각(22:00 이후, 05:00 전)을 하나도 건드리지 않는 구간은 밤이 아니다
    assert.ok(!night('18:00', '21:59'), '저녁 구간(22:00 전에 끝남)')
    assert.ok(!night('05:00', '08:00'), '새벽~오전')
    assert.ok(!night('07:00', '11:00'), '오전')
    assert.ok(!night('11:00', '14:00'), '점심')
    assert.ok(usesNightCondition({ time_band_counts: [{ start: '05:00', end: '08:00', count: 1 }, { start: '22:00', end: '03:00', count: 1 }] }))
    assert.ok(!usesNightCondition({ time_band_counts: [{ start: '05:00', end: '08:00', count: 1 }] }))
    assert.ok(usesNightCondition({ weekly_streak: 2, streak_subset: { time_range: { start: '23:00', end: '04:00' }, min_count: 1 } }))
    assert.ok(!usesNightCondition({ weekly_streak: 2, streak_subset: { time_range: { start: '06:00', end: '09:00' }, min_count: 1 } }))
    // 서로 다른 시간대 «수»만 세는 조건, 형태가 깨진 값, 객체가 아닌 값은 밤 조건이 아니다
    assert.ok(!usesNightCondition({ distinct_time_bands: 6 }))
    assert.ok(!usesNightCondition({ time_range: { start: 'abc', end: '??' } }))
    assert.ok(!usesNightCondition(null))
    assert.ok(!usesNightCondition([]))
  }],
  // 티켓 20261019_1312 2회 — 시각 해석은 엔진 `inTimeRange`와 같은 함수다(1회 게이트 우려 1·2)
  ['usesNightCondition: 24:00·HH:MM:SS 형식과 22:00 끝도 밤 조건으로 읽는다 (엔진과 같은 시각 해석)', () => {
    const night = (start: string, end: string) => usesNightCondition({ time_range: { start, end } })
    assert.ok(night('20:00', '24:00'), '끝이 24:00 — 엔진은 23:00 활동을 센다')
    assert.ok(night('22:00:00', '05:00:00'), 'HH:MM:SS 형식')
    assert.ok(night('18:00', '22:00'), '끝이 22:00 — 엔진은 22:00 활동을 센다')
    assert.ok(night('18:00:00', '22:00:00'), 'HH:MM:SS 형식의 저녁~22:00')
    assert.ok(night('00:00', '24:00'), '하루 전체')
    assert.ok(night('24:00', '03:00'), '시작이 24:00이면 자정 이후까지 넘어가는 구간')
    // 밤 시각을 하나도 건드리지 않는 형식은 그대로 밤이 아니다
    assert.ok(!night('18:00:00', '21:59:59'), '초 단위로 쓴 저녁 구간(22:00 전에 끝남)')
    assert.ok(!night('05:00:00', '08:00:00'), '초 단위로 쓴 새벽~오전')
    assert.ok(!night('24:00', '24:00'), '24:00 한 점은 하루 중 어떤 분에도 맞지 않는다')
    assert.ok(usesNightCondition({ time_band_counts: [{ start: '20:00', end: '24:00', count: 1 }] }))
    assert.ok(usesNightCondition({ weekly_streak: 2, streak_subset: { time_range: { start: '22:00:00', end: '05:00:00' }, min_count: 1 } }))
  }],
  ['usesNightCondition은 엔진 inTimeRange와 같은 판정을 한다 — 밤 22:00~04:59의 어느 분이든 세는 구간이면 밤 조건이다', () => {
    const activityAtKstMinute = (minute: number): NormalizedActivity => ({
      // 2026-01-05(월) 00:00 KST = 2026-01-04T15:00:00Z 부터 `minute`분 뒤
      startDate: new Date(Date.UTC(2026, 0, 4, 15, 0) + minute * 60_000).toISOString(),
    }) as NormalizedActivity
    const nightMinutes = Array.from({ length: 24 * 60 }, (_, m) => m).filter((m) => m >= 22 * 60 || m < 5 * 60)
    const ranges: Array<[string, string]> = [
      ['22:00', '05:00'], ['20:00', '24:00'], ['22:00:00', '05:00:00'], ['18:00', '22:00'], ['18:00', '21:59'],
      ['05:00', '08:00'], ['04:59', '05:00'], ['05:00', '05:00'], ['00:00', '24:00'], ['24:00', '03:00'],
      ['24:00', '24:00'], ['23:59', '00:00'], ['07:00', '11:00'], ['14:00', '18:00'], ['abc', '??'], ['22', '23'],
    ]
    for (const [start, end] of ranges) {
      const engineCounts = nightMinutes.some((m) => inTimeRange(activityAtKstMinute(m), { start, end }))
      assert.strictEqual(usesNightCondition({ time_range: { start, end } }), engineCounts, `${start}~${end}: 엔진과 판정이 다르다`)
    }
  }],
  ['순위형 + 24:00·HH:MM:SS 밤 조건 → 거절 (직접 입력한 형식으로 우회하지 못한다)', () => {
    const conditions: Array<[string, MissionCondition]> = [
      ['time_range', { time_range: { start: '20:00', end: '24:00' } }],
      ['time_range', { time_range: { start: '22:00:00', end: '05:00:00' } }],
      ['time_range', { time_range: { start: '18:00', end: '22:00' } }],
      ['time_band_counts', { activity_type: 'running', time_band_counts: [{ start: '20:00', end: '24:00', count: 2 }] }],
    ]
    for (const [name, condition] of conditions) {
      const { error } = checkMissionCondition('engine_condition', condition, 'ranking')
      assert.ok(error, `${name}: ${JSON.stringify(condition)}가 통과됐다`)
      assert.ok(error!.includes(name), `문제 키가 문구에 없다: ${error}`)
    }
    // 같은 조건을 달성형·개인형에는 저장할 수 있다
    for (const frame of ['achievement', 'individual']) {
      assert.strictEqual(checkMissionCondition('engine_condition', conditions[0][1], frame).error, null)
    }
  }],
  ['순위형 + 밤 조건 → 거절(현상·원인·해결책)', () => {
    const conditions: Array<[string, MissionCondition]> = [
      ['time_range', { time_range: { start: '22:00', end: '05:00' } }],
      ['time_band_counts', { activity_type: 'running', time_band_counts: [{ start: '20:00', end: '05:00', count: 2 }] }],
      ['streak_subset.time_range', { weekly_streak: 2, weekly_streak_min_count: 1, streak_subset: { time_range: { start: '23:00', end: '03:00' }, min_count: 1 } }],
    ]
    for (const [name, condition] of conditions) {
      const { error, warning } = checkMissionCondition('engine_condition', condition, 'ranking')
      assert.ok(error, `${name}: 순위형 밤 조건이 통과됐다`)
      assert.strictEqual(warning, null)
      assert.ok(error!.startsWith('조건 JSON을 저장하지 못했어요.'), `현상이 없다: ${error}`)
      assert.ok(error!.includes('늦은 밤'), `원인이 없다: ${error}`)
      assert.ok(error!.includes('달성형이나 개인형'), `해결책이 없다: ${error}`)
      assert.ok(error!.includes(name), `문제 키가 문구에 없다: ${error}`)
    }
  }],
  ['순위형 + capsule_open_count → 거절', () => {
    const { error } = checkMissionCondition('engine_condition', { capsule_open_count: 3 } as unknown as MissionCondition, 'ranking')
    assert.ok(error, '순위형 캡슐 횟수가 통과됐다')
    assert.ok(error!.includes('capsule_open_count'), `문제 키가 문구에 없다: ${error}`)
    assert.ok(error!.includes('순위에서 유리'), `원인이 없다: ${error}`)
    assert.ok(error!.includes('달성형이나 개인형'), `해결책이 없다: ${error}`)
  }],
  ['순위형 + 밤 조건과 캡슐 횟수가 함께 있으면 두 이유를 모두 알린다', () => {
    const { error } = checkMissionCondition(
      'engine_condition',
      { time_range: { start: '23:00', end: '04:00' }, capsule_open_count: 1 } as unknown as MissionCondition,
      'ranking'
    )
    assert.ok(error!.includes('늦은 밤') && error!.includes('순위에서 유리'), error!)
  }],
  ['달성형·개인형은 밤 조건과 캡슐 횟수를 저장할 수 있다', () => {
    const condition = {
      time_range: { start: '22:00', end: '05:00' },
      time_band_counts: [{ start: '20:00', end: '05:00', count: 2 }],
      capsule_open_count: 3,
    } as unknown as MissionCondition
    for (const frame of ['achievement', 'individual']) {
      const { error } = checkMissionCondition('engine_condition', condition, frame)
      assert.strictEqual(error, null, `${frame}에서 막혔다: ${error}`)
    }
  }],
  ['틀을 넘기지 않으면 순위형 검사를 건너뛴다 (어드민 폼 미리보기)', () => {
    const { error } = checkMissionCondition('engine_condition', { time_range: { start: '22:00', end: '05:00' } })
    assert.strictEqual(error, null)
  }],
  ['순위형이어도 밤이 아닌 시간대·잼 조건·시간대 수 조건은 저장된다', () => {
    const ok: MissionCondition[] = [
      { time_range: { start: '05:00', end: '08:00' }, distance_km: 10 },
      { distinct_time_bands: 3 },
      { time_band_counts: [{ start: '18:00', end: '21:59', count: 2 }] },
    ]
    for (const condition of ok) {
      const { error } = checkMissionCondition('engine_condition', condition, 'ranking')
      assert.strictEqual(error, null, `막혔다: ${JSON.stringify(condition)} → ${error}`)
    }
    // 모은 잼은 순위 기준으로 쓸 수 있다 — 잼 조건 키는 순위형 금지 대상이 아니다
    assert.strictEqual(rankingConditionError({ jam_total_earned: 100 }, 'ranking'), null)
  }],
  ['틀을 비워 만들면 DB 기본값(순위형)과 같다', () => {
    assert.strictEqual(DEFAULT_MISSION_STATUS_DISPLAY_TYPE, 'ranking')
  }],
  ['rankingConditionError: 순위형이 아니거나 객체가 아니면 항상 null', () => {
    const night = { time_range: { start: '22:00', end: '05:00' } }
    assert.strictEqual(rankingConditionError(night, 'achievement'), null)
    assert.strictEqual(rankingConditionError(night, null), null)
    assert.strictEqual(rankingConditionError(night, undefined), null)
    assert.strictEqual(rankingConditionError(null, 'ranking'), null)
    assert.strictEqual(rankingConditionError([night], 'ranking'), null)
    assert.ok(rankingConditionError(night, 'ranking'))
  }],

  // ── 판정하지 않는 키 경고 ─────────────────────────────────────
  // 5-2b 1회(티켓 20261019_1445)로 DB 기록 키 14개가 판정 가능해졌고 기간 불가 키 5개는 저장 거절이 됐다. 지금 경고 대상은
  // 이번 범위 밖 키(`active_week_streak`·`jam_week_count` 등)와 `total_count`·`count`·`badge_id`다.
  ['engine_condition + 판정하지 않는 키 → 저장은 허용하고 경고한다', () => {
    for (const key of ['active_week_streak', 'jam_week_count', 'dropped_item_picked_up_count', 'total_count', 'count', 'badge_id']) {
      const { error, warning } = checkMissionCondition('engine_condition', { distance_km: 10, [key]: 3 } as unknown as MissionCondition)
      assert.strictEqual(error, null, `${key}: 저장이 막혔다 — ${error}`)
      assert.ok(warning, `${key}: 경고가 없다`)
      assert.ok(warning!.includes(key), `문제 키가 경고에 없다: ${warning}`)
      assert.ok(warning!.includes('판정하지 않는'), `경고 취지가 없다: ${warning}`)
      assert.ok(warning!.includes('완료되지 않을 수'), `결과 고지가 없다: ${warning}`)
    }
  }],
  ['engine_condition + 판정 가능한 키만 → 경고 없음', () => {
    const condition: MissionCondition = {
      activity_type: 'running', distance_km: 10, time_range: { start: '05:00', end: '08:00' }, day_of_week: 'sunday',
      season: 'summer', season_count: 3, max_speed_kmh: 20, distinct_weekday_count: 3, weekly_streak: 2, weekly_streak_min_count: 2,
    }
    assert.deepStrictEqual(checkMissionCondition('engine_condition', condition, 'achievement'), { error: null, warning: null })
  }],
  ['판정하지 않는 키 경고는 engine_condition에서만 낸다', () => {
    const { error, warning } = checkMissionCondition('distance', { distance_km: 10, active_week_streak: 3 } as unknown as MissionCondition)
    assert.strictEqual(error, null)
    assert.strictEqual(warning, null)
  }],
  ['engine_condition + DB 기록 키 19개 → 경고도 오류도 없다 (판정하는 키가 됐다)', () => {
    const valueOf = (key: string): unknown => {
      if (key === 'recipe_first_success') return { recipe_id: 'recipe' }
      if (key === 'checkin_category_count') return { category: 'train_subway', count: 3 }
      if (key === 'checkin_badge_count') return { checkin_badge_names: ['성수역'], count: 1 }
      return 3
    }
    for (const key of ENGINE_DELEGATED_DB_CONDITION_KEY_LIST) {
      const result = checkMissionCondition('engine_condition', { distance_km: 10, [key]: valueOf(key) } as unknown as MissionCondition, 'achievement')
      assert.deepStrictEqual(result, { error: null, warning: null }, `${key}: ${JSON.stringify(result)}`)
    }
  }],
  ['2회로 판정하게 된 날짜·체크인 5개는 더 이상 «판정하지 않는 조건» 경고에 나오지 않는다', () => {
    const condition = {
      weekly_active_days: 3,
      same_spot_checkin_days: 2,
      new_checkin_badge_count: 4,
      checkin_category_count: { category: 'train_subway', count: 2 },
      checkin_badge_count: { checkin_badge_names: ['성수역', '왕십리역'], count: 1 },
    } as unknown as MissionCondition
    assert.deepStrictEqual(checkMissionCondition('engine_condition', condition, 'achievement'), { error: null, warning: null })
    // 아직 판정하지 않는 키 9개는 계속 경고한다
    const stillUnjudged = checkMissionCondition('engine_condition', { weekly_active_days: 3, active_week_streak: 3 } as unknown as MissionCondition, 'achievement')
    assert.ok(stillUnjudged.warning?.includes('active_week_streak'), String(stillUnjudged.warning))
    assert.ok(!stillUnjudged.warning?.includes('weekly_active_days'), String(stillUnjudged.warning))
  }],

  // ── 기간을 걸 수 없는 키 (티켓 20261019_1445 사용자 결정 1) ──────────────
  ['기간을 걸 수 없는 키 5개는 어떤 미션 타입에서도 저장하지 못한다', () => {
    assert.deepStrictEqual(Object.keys(MISSION_PERIOD_UNSUPPORTED_CONDITION_KEYS).sort(), [
      'chapter_reached', 'days_since_signup', 'jam_total_earned', 'other_tribe_item_kinds_count', 'signup_recent_active_days',
    ])
    const types: MissionType[] = ['engine_condition', 'distance', 'streak_days', 'item_collect']
    for (const key of Object.keys(MISSION_PERIOD_UNSUPPORTED_CONDITION_KEYS)) {
      for (const type of types) {
        const { error, warning } = checkMissionCondition(type, { distance_km: 10, [key]: 3 } as unknown as MissionCondition, 'achievement')
        assert.ok(error, `${type}/${key}: 저장이 막히지 않았다`)
        assert.strictEqual(warning, null)
        assert.ok(error!.includes(key), `문제 키가 문구에 없다: ${error}`)
      }
    }
  }],
  ['기간 불가 키 오류 문구는 [현상] → [원인] → [해결책] 순서이고 기온 키 문구와 다르다', () => {
    const { error } = checkMissionCondition('engine_condition', { jam_total_earned: 100 } as unknown as MissionCondition, 'achievement')
    assert.ok(error)
    const symptom = error!.indexOf('저장하지 못했어요')
    const cause = error!.indexOf('평생 쌓인 누계')
    const fix = error!.indexOf('다시 저장해주세요')
    assert.ok(symptom >= 0 && cause > symptom && fix > cause, `3단계 순서가 아니다: ${error}`)
    assert.ok(error!.includes('기간 안에 쌓이는 조건'), `대안 안내가 없다: ${error}`)
    assert.ok(!error!.includes('날씨와 기온'), `기온 키 문구가 섞였다: ${error}`)
    // 키마다 자기 이유를 말한다
    const chapter = checkMissionCondition('engine_condition', { chapter_reached: 2 } as unknown as MissionCondition, 'achievement').error
    assert.ok(chapter!.includes('지금 도달한 챕터'), chapter!)
  }],
  ['기간 불가 키와 같이 쓴 판정 가능 키도 저장은 막힌다 (한 키라도 있으면 거절)', () => {
    const { error } = checkMissionCondition(
      'engine_condition',
      { combine_success_count: 3, days_since_signup: 30, signup_recent_active_days: 10 } as unknown as MissionCondition,
      'achievement'
    )
    assert.ok(error)
    assert.ok(error!.includes('days_since_signup') && error!.includes('signup_recent_active_days'))
    assert.ok(!error!.includes('combine_success_count'), `판정하는 키까지 문제로 적었다: ${error}`)
  }],
  ['pending 키는 engine_condition에서 여전히 거부한다 (경고로 낮추지 않는다)', () => {
    const { error } = checkMissionCondition('engine_condition', { distance_km: 10, [PENDING_KEY]: 'x' } as unknown as MissionCondition)
    assert.ok(error, 'pending 키가 통과됐다')
    assert.ok(error!.includes(PENDING_KEY))
  }],
]

let passed = 0
for (const [name, fn] of cases) {
  fn()
  passed++
  console.info(`  ✓ ${name}`)
}
console.info(`\n[condition-keys] ${passed}/${cases.length} passed`)
