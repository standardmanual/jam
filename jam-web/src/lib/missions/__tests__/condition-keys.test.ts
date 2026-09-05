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
  ENGINE_DELEGATED_MISSION_TYPES,
  MISSION_ALLOWED_CONDITION_KEYS,
  MISSION_ONLY_CONDITION_KEYS,
  checkMissionCondition,
  suggestMissionConditionKey,
} from '../condition-keys'
import { ALL_CONDITION_KEYS, findBlockingConditionKeys } from '@/lib/badge-engine/conditionRegistry'
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
      ['duration_minutes', 'elevation_gain_m', 'streak_days']
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
  ['MissionCondition의 8개 필드가 전부 허용 키에 들어 있다', () => {
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
    }
    for (const key of Object.keys(everyField)) {
      assert.ok(MISSION_ALLOWED_CONDITION_KEYS.has(key), `허용 키에 없다: ${key}`)
    }
    assert.deepStrictEqual(checkMissionCondition('distance', everyField), { error: null, warning: null })
  }],
]

let passed = 0
for (const [name, fn] of cases) {
  fn()
  passed++
  console.info(`  ✓ ${name}`)
}
console.info(`\n[condition-keys] ${passed}/${cases.length} passed`)
