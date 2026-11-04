/**
 * 미션 달성 조건 불릿 생성 — 순수 로직 유닛 테스트 (티켓 20261104_2148)
 *
 * 이 폴더의 시험은 `npm run test:node`가 node assert로 돌린다(vitest 제외 목록과 짝).
 * 실행: `npx tsx src/lib/missions/__tests__/conditionBullets.test.ts`
 */
import assert from 'node:assert'
import { buildConditionBullets, conditionBulletKeys } from '../conditionBullets'

const labels = new Map([
  ['drop_item_count', { label: '아이템 배지 드랍', unit: '회' }],
  ['pickup_item_count', { label: '아이템 배지 픽업', unit: '회' }],
  ['distance_km', { label: '누적 거리', unit: 'km' }],
  ['month', { label: '해당 월', unit: null }],
])

const cases: [string, () => void][] = [
  ['드랍·픽업 미션은 라벨·값·단위를 이어 두 줄을 만든다', () => {
    assert.deepStrictEqual(
      buildConditionBullets('engine_condition', { drop_item_count: 1, pickup_item_count: 1 }, labels),
      ['아이템 배지 드랍 1회', '아이템 배지 픽업 1회'],
    )
  }],

  ['소수는 그대로, 정수는 소수점 없이 쓴다', () => {
    assert.deepStrictEqual(buildConditionBullets('engine_condition', { distance_km: 0.5 }, labels), ['누적 거리 0.5km'])
    assert.deepStrictEqual(buildConditionBullets('engine_condition', { distance_km: 5 }, labels), ['누적 거리 5km'])
  }],

  ['단위가 없으면 값만 붙인다', () => {
    assert.deepStrictEqual(buildConditionBullets('engine_condition', { month: 3 }, labels), ['해당 월 3'])
  }],

  ['조건 객체의 키 순서와 무관하게 레지스트리 선언 순서를 따른다', () => {
    assert.deepStrictEqual(
      buildConditionBullets('engine_condition', { pickup_item_count: 1, drop_item_count: 1 }, labels),
      ['아이템 배지 드랍 1회', '아이템 배지 픽업 1회'],
    )
    assert.deepStrictEqual(
      conditionBulletKeys('engine_condition', { pickup_item_count: 1, drop_item_count: 1 }),
      ['drop_item_count', 'pickup_item_count'],
    )
  }],

  ['activity_type은 불릿에 넣지 않고 막지도 않는다', () => {
    assert.deepStrictEqual(
      buildConditionBullets('engine_condition', { activity_type: 'running', drop_item_count: 1 }, labels),
      ['아이템 배지 드랍 1회'],
    )
  }],

  ['라벨이 없는 키가 하나라도 있으면 전체가 null이다', () => {
    assert.strictEqual(buildConditionBullets('engine_condition', { drop_item_count: 1, streak_days: 3 }, labels), null)
  }],

  ['빈 라벨 맵(조회 실패)이면 null이다', () => {
    assert.strictEqual(buildConditionBullets('engine_condition', { drop_item_count: 1 }, new Map()), null)
  }],

  ['값이 객체·문자열이면 null이다', () => {
    assert.strictEqual(
      buildConditionBullets('engine_condition', { drop_item_count: 1, checkin_category_count: { a: 1 } }, labels),
      null,
    )
    assert.strictEqual(buildConditionBullets('engine_condition', { drop_item_count: '1' }, labels), null)
  }],

  ['레지스트리에 없는 키가 섞이면 null이다', () => {
    const withUnknown = new Map(labels).set('totally_unknown', { label: '모름', unit: null })
    assert.strictEqual(
      buildConditionBullets('engine_condition', { drop_item_count: 1, totally_unknown: 1 }, withUnknown),
      null,
    )
  }],

  ['옛 유형은 null이다', () => {
    assert.strictEqual(buildConditionBullets('distance', { distance_km: 5 }, labels), null)
    assert.strictEqual(buildConditionBullets('activity_count', { count: 3 }, labels), null)
  }],

  ['조건이 비었거나 activity_type뿐이면 null이다', () => {
    assert.strictEqual(buildConditionBullets('engine_condition', {}, labels), null)
    assert.strictEqual(buildConditionBullets('engine_condition', { activity_type: 'running' }, labels), null)
    assert.strictEqual(buildConditionBullets('engine_condition', null, labels), null)
  }],
]

let passed = 0
for (const [name, fn] of cases) {
  fn()
  passed++
  console.info(`  ✓ ${name}`)
}
console.info(`\n[conditionBullets] ${passed}/${cases.length} passed`)
