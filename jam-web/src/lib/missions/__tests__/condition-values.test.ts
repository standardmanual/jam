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
 *
 * 실행: `npx tsx src/lib/missions/__tests__/condition-values.test.ts` (node assert — 러너 불필요)
 */
import assert from 'node:assert'
import { checkMissionConditionValue } from '../condition-keys'
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
