/**
 * 미션 조건 «값» 검증 — 순수 로직 유닛 테스트 (티켓 20260905_1327)
 *
 * 검증 범위:
 *   - item_collect(badge_id)/checkin(poi_id): null·부재·비-UUID 거부, 유효 UUID 통과
 *   - 수치 타입(distance/activity_count/streak_days/duration_minutes/elevation_gain_m):
 *     부재·0·음수 거부(즉시 달성되는 반대 방향 사고 방지), 양수 통과
 *   - 기존 6건("수정 저장")의 복구 경로 — 유효한 새 값으로 고치면 통과
 *   - condition_json 부재(PATCH 부분 갱신)·비-객체는 이 함수의 책임이 아니므로 통과
 *     (형태 검증은 `checkMissionCondition`이 이미 막는다)
 *   - 프로덕션 45건 중 나머지(item_collect가 아닌) 39건 대표 조합은 그대로 통과
 *   - engine_condition의 DB 기록 키 20개 기준 값(티켓 20261019_1445 4회): 0 이하·소수·NaN·숫자가 아닌 값은 거부(현상 → 원인 → 해결책 문구),
 *     객체형 두 키는 안의 count를 본다, 기준 값이 없는 recipe_first_success는 건너뛴다
 *
 * 실행: `npx tsx src/lib/missions/__tests__/condition-values.test.ts` (node assert — 러너 불필요)
 */
import assert from 'node:assert'
import { MISSION_DB_CONDITION_KEY_LIST, checkMissionConditionValue } from '../condition-keys'
import type { MissionCondition, MissionType } from '@/types/database'

const VALID_BADGE_ID = '00000000-0000-0000-0000-000000000001'
const VALID_POI_ID = '00000000-0000-0000-0000-000000000002'

/** condition-keys.test.ts의 PRODUCTION_FIXTURES와 동일 출처(2026-09-05 실측) — item_collect도
 * 값이 유효한 대표 조합(6건 전부가 실제로는 badge_id: null이지만, "형태"를 대표하는 값은 유효 UUID)*/
const PRODUCTION_FIXTURES: Array<[MissionType, MissionCondition]> = [
  ['distance', { activity_type: 'cycling', distance_km: 100 }],
  ['duration_minutes', { activity_type: 'running', duration_minutes: 60 }],
  ['item_collect', { badge_id: VALID_BADGE_ID }],
  ['activity_count', { count: 3 }],
  ['activity_count', { activity_type: 'running', count: 5 }],
  ['checkin', { poi_id: VALID_POI_ID }],
  ['elevation_gain_m', { activity_type: 'cycling', elevation_gain_m: 500 }],
  ['streak_days', { activity_type: 'running', streak_days: 7 }],
  ['distance', { distance_km: 30 }],
]

/** DB 기록 키 가운데 값 자체가 기준 값(양의 정수)인 키 17개 — 레시피 키와 객체형 두 키를 뺀다 */
const OBJECT_DB_KEYS = ['recipe_first_success', 'checkin_category_count', 'checkin_badge_count']
const NUMERIC_DB_KEYS = MISSION_DB_CONDITION_KEY_LIST.filter((key) => !OBJECT_DB_KEYS.includes(key))
/** 저장하면 안 되는 기준 값: 0 이하, 소수, NaN·무한대, 숫자가 아닌 값(글자·null·참거짓·객체·목록) */
const BAD_THRESHOLDS: unknown[] = [0, -1, 0.5, 2.5, Number.NaN, Number.POSITIVE_INFINITY, '3', '', null, true, {}, [3]]

const cases: Array<[string, () => void]> = [
  // ── item_collect (badge_id) ─────────────────────────────────
  ['item_collect + badge_id null → 거부 (프로덕션 6건 실측 상태)', () => {
    const { error } = checkMissionConditionValue('item_collect', { badge_id: null } as unknown as MissionCondition)
    assert.ok(error, 'badge_id: null이 통과됐다')
    assert.ok(error!.includes('목표 배지'), `문구에 항목명이 없다: ${error}`)
  }],
  ['item_collect + badge_id 키 자체 부재 → 거부', () => {
    const { error } = checkMissionConditionValue('item_collect', {})
    assert.ok(error, 'badge_id 부재가 통과됐다')
  }],
  ['item_collect + badge_id UUID 형태가 아님 → 거부', () => {
    const { error } = checkMissionConditionValue('item_collect', { badge_id: 'not-a-uuid' })
    assert.ok(error, 'UUID 아닌 값이 통과됐다')
  }],
  ['item_collect + 유효한 UUID → 통과 (기존 6건 복구 경로)', () => {
    assert.deepStrictEqual(
      checkMissionConditionValue('item_collect', { badge_id: VALID_BADGE_ID }),
      { error: null, warning: null }
    )
  }],

  // ── checkin (poi_id) ─────────────────────────────────────────
  ['checkin + poi_id null → 거부', () => {
    const { error } = checkMissionConditionValue('checkin', { poi_id: null } as unknown as MissionCondition)
    assert.ok(error, 'poi_id: null이 통과됐다')
  }],
  ['checkin + 유효한 UUID → 통과', () => {
    assert.deepStrictEqual(
      checkMissionConditionValue('checkin', { poi_id: VALID_POI_ID }),
      { error: null, warning: null }
    )
  }],

  // ── 수치 타입 ──────────────────────────────────────────────────
  ['수치 타입 + 목표 0 → 거부 (즉시 달성 사고 방지)', () => {
    for (const [type, key] of [
      ['distance', 'distance_km'],
      ['activity_count', 'count'],
      ['streak_days', 'streak_days'],
      ['duration_minutes', 'duration_minutes'],
      ['elevation_gain_m', 'elevation_gain_m'],
    ] as [MissionType, string][]) {
      const { error } = checkMissionConditionValue(type, { [key]: 0 })
      assert.ok(error, `${type}: 목표 0이 통과됐다`)
    }
  }],
  ['수치 타입 + 목표 음수 → 거부', () => {
    const { error } = checkMissionConditionValue('distance', { distance_km: -5 })
    assert.ok(error, '음수 목표가 통과됐다')
  }],
  ['수치 타입 + 키 자체 부재 → 거부 (`?? 0` 폴백이 목표를 0으로 만든다)', () => {
    for (const type of ['distance', 'activity_count', 'streak_days', 'duration_minutes', 'elevation_gain_m'] as MissionType[]) {
      const { error } = checkMissionConditionValue(type, { activity_type: 'running' })
      assert.ok(error, `${type}: 키 부재가 통과됐다`)
    }
  }],
  ['수치 타입 + 양수 → 통과', () => {
    assert.deepStrictEqual(checkMissionConditionValue('distance', { distance_km: 10 }), { error: null, warning: null })
    assert.deepStrictEqual(checkMissionConditionValue('activity_count', { count: 1 }), { error: null, warning: null })
    assert.deepStrictEqual(checkMissionConditionValue('streak_days', { streak_days: 1 }), { error: null, warning: null })
    assert.deepStrictEqual(checkMissionConditionValue('duration_minutes', { duration_minutes: 1 }), { error: null, warning: null })
    assert.deepStrictEqual(checkMissionConditionValue('elevation_gain_m', { elevation_gain_m: 1 }), { error: null, warning: null })
  }],

  // ── engine_condition의 DB 기록 키 기준 값 (티켓 20261019_1445 4회) ───────────
  ['DB 기록 키 20개 가운데 값 자체가 기준 값인 키는 17개, 객체형은 3개다 (키를 더하고 시험을 빠뜨리면 여기서 걸린다)', () => {
    assert.strictEqual(MISSION_DB_CONDITION_KEY_LIST.length, 20)
    assert.strictEqual(NUMERIC_DB_KEYS.length, 17)
    assert.ok(OBJECT_DB_KEYS.every((key) => (MISSION_DB_CONDITION_KEY_LIST as readonly string[]).includes(key)))
  }],
  ['engine_condition + 숫자형 DB 키 17개 × 잘못된 기준 값(0·음수·소수·NaN·무한대·글자·null·참거짓·객체·목록) → 모두 거부', () => {
    for (const key of NUMERIC_DB_KEYS) {
      for (const bad of BAD_THRESHOLDS) {
        const { error, warning } = checkMissionConditionValue('engine_condition', { [key]: bad } as unknown as MissionCondition)
        assert.ok(error, `${key}=${String(bad)}: 저장이 막히지 않았다`)
        assert.strictEqual(warning, null)
        assert.ok(error!.includes(key), `문제 키가 문구에 없다: ${error}`)
      }
    }
  }],
  ['engine_condition + 숫자형 DB 키 17개 × 1 이상의 정수 → 통과 (1, 보통 값, 큰 값)', () => {
    for (const key of NUMERIC_DB_KEYS) {
      for (const good of [1, 3, 500, 1_000_000]) {
        assert.deepStrictEqual(
          checkMissionConditionValue('engine_condition', { [key]: good } as unknown as MissionCondition),
          { error: null, warning: null },
          `${key}=${good}`
        )
      }
    }
  }],
  ['engine_condition + 객체형 checkin_category_count·checkin_badge_count는 안의 count를 본다', () => {
    const shapes = {
      checkin_category_count: (count: unknown) => ({ category: 'train_subway', count }),
      checkin_badge_count: (count: unknown) => ({ checkin_badge_names: ['성수역'], count }),
    }
    for (const [key, make] of Object.entries(shapes)) {
      for (const bad of [0, -2, 1.5, Number.NaN, '2', null, undefined]) {
        const { error } = checkMissionConditionValue('engine_condition', { [key]: make(bad) } as unknown as MissionCondition)
        assert.ok(error, `${key}.count=${String(bad)}: 저장이 막히지 않았다`)
        assert.ok(error!.includes(`${key})의 count`), `안의 count를 짚지 않았다: ${error}`)
      }
      assert.deepStrictEqual(
        checkMissionConditionValue('engine_condition', { [key]: make(3) } as unknown as MissionCondition),
        { error: null, warning: null }
      )
      // count가 아예 없거나 값이 객체가 아니면 안의 count를 읽을 수 없다
      for (const noCount of [{}, 3, 'x', null, [3]]) {
        const { error } = checkMissionConditionValue('engine_condition', { [key]: noCount } as unknown as MissionCondition)
        assert.ok(error, `${key}=${JSON.stringify(noCount)}: 저장이 막히지 않았다`)
      }
    }
  }],
  ['engine_condition + recipe_first_success는 기준 값이 없어 이 검사에서 건너뛴다', () => {
    assert.deepStrictEqual(
      checkMissionConditionValue('engine_condition', { recipe_first_success: { recipe_id: 'recipe' } }),
      { error: null, warning: null }
    )
  }],
  ['engine_condition + 문제가 있는 DB 키는 한 번에 모두 알리고, 문제 없는 키는 적지 않는다', () => {
    const { error } = checkMissionConditionValue('engine_condition', {
      combine_success_count: 0,
      jam_period_earned: 0.5,
      capsule_open_count: 3,
      checkin_category_count: { category: 'train_subway', count: 0 },
    })
    assert.ok(error)
    assert.ok(error!.includes('combine_success_count') && error!.includes('jam_period_earned') && error!.includes('checkin_category_count'), error!)
    assert.ok(!error!.includes('capsule_open_count'), `문제 없는 키까지 적었다: ${error}`)
    assert.ok(error!.includes('기간 동안 모은 잼(jam_period_earned): 0.5'), `미션 전용 키 라벨·값이 없다: ${error}`)
  }],
  ['engine_condition 기준 값 오류 문구는 [현상] → [원인] → [해결책] 순서이다', () => {
    const { error } = checkMissionConditionValue('engine_condition', { mission_complete_count: 0 })
    assert.ok(error)
    const symptom = error!.indexOf('저장하지 못했어요')
    const cause = error!.indexOf('참가하자마자 달성')
    const fix = error!.indexOf('1 이상의 정수로 고쳐서 다시 저장해주세요')
    assert.ok(symptom >= 0 && cause > symptom && fix > cause, `3단계 순서가 아니다: ${error}`)
    assert.ok(error!.includes('완료한 미션 수(mission_complete_count): 0'), `현재 값이 없다: ${error}`)
  }],
  ['engine_condition의 DB 키가 아닌 필드는 이 검사가 보지 않는다 (기존 동작 유지)', () => {
    assert.deepStrictEqual(checkMissionConditionValue('engine_condition', { distance_km: 0 }), { error: null, warning: null })
    assert.deepStrictEqual(checkMissionConditionValue('engine_condition', {}), { error: null, warning: null })
    assert.deepStrictEqual(
      checkMissionConditionValue('engine_condition', { activity_type: 'running', distance_km: 10, combine_success_count: 2 }),
      { error: null, warning: null }
    )
  }],
  ['엔진 조건이 아닌 타입은 DB 키 값을 검사하지 않는다 (그 키는 판정에 쓰이지 않아 checkMissionCondition이 고지한다)', () => {
    assert.deepStrictEqual(
      checkMissionConditionValue('distance', { distance_km: 5, combine_success_count: 0 } as unknown as MissionCondition),
      { error: null, warning: null }
    )
  }],

  // ── 형태 방어(이 함수의 책임 밖) ────────────────────────────────
  ['condition_json 부재(PATCH 부분 갱신)는 통과한다', () => {
    assert.deepStrictEqual(checkMissionConditionValue('item_collect', undefined), { error: null, warning: null })
  }],
  ['배열·스칼라·null은 이 함수 책임이 아니라 통과한다 (형태 검증은 checkMissionCondition의 몫)', () => {
    for (const value of [[1, 2], 'x', 42, true, null]) {
      assert.deepStrictEqual(checkMissionConditionValue('item_collect', value), { error: null, warning: null })
    }
  }],

  // ── 프로덕션 대표 조합 ────────────────────────────────────────
  ['프로덕션 대표 조합(값이 유효한 경우) 전부 통과한다', () => {
    for (const [type, condition] of PRODUCTION_FIXTURES) {
      assert.deepStrictEqual(
        checkMissionConditionValue(type, condition),
        { error: null, warning: null },
        `막혔다: ${type} ${JSON.stringify(condition)}`
      )
    }
  }],
]

let passed = 0
for (const [name, fn] of cases) {
  fn()
  passed++
  console.info(`  ✓ ${name}`)
}
console.info(`\n[condition-values] ${passed}/${cases.length} passed`)
