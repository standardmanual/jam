/**
 * 미션 달성 조건 불릿 생성 — 순수 로직 유닛 테스트 (티켓 20261104_2148)
 *
 * 이 폴더의 시험은 `npm run test:node`가 node assert로 돌린다(vitest 제외 목록과 짝).
 * 실행: `npx tsx src/lib/missions/__tests__/conditionBullets.test.ts`
 */
import assert from 'node:assert'
import { buildConditionBullets, conditionBulletKeys, needsCategoryNames } from '../conditionBullets'

const labels = new Map([
  ['drop_item_count', { label: '아이템 배지 드랍', unit: '회' }],
  ['pickup_item_count', { label: '아이템 배지 픽업', unit: '회' }],
  ['distance_km', { label: '누적 거리', unit: 'km' }],
  ['month', { label: '해당 월', unit: null }],
  ['sync_count', { label: '동기화', unit: '회' }],
  ['count', { label: '활동 횟수', unit: '회' }],
  ['repeat_count', { label: '활동 횟수', unit: '회' }],
  ['single_distance_km', { label: '한 번의 거리', unit: 'km' }],
  ['checkin_category_count', { label: '체크인 배지', unit: '개' }],
])

const categories = new Map([
  ['train_subway', '기차/지하철'],
  ['mountain', '산'],
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

  ['미션 전용 키(sync_count)는 레지스트리 키 뒤에 붙는다 — 드랍 → 픽업 → 동기화 순', () => {
    const condition = { sync_count: 1, pickup_item_count: 1, drop_item_count: 1 }
    assert.deepStrictEqual(
      buildConditionBullets('engine_condition', condition, labels),
      ['아이템 배지 드랍 1회', '아이템 배지 픽업 1회', '동기화 1회'],
    )
    assert.deepStrictEqual(conditionBulletKeys('engine_condition', condition), ['drop_item_count', 'pickup_item_count', 'sync_count'])
  }],

  ['미션 전용 키에 라벨이 없으면 불릿 전체가 null이다', () => {
    const withoutSyncLabel = new Map(labels)
    withoutSyncLabel.delete('sync_count')
    assert.strictEqual(
      buildConditionBullets('engine_condition', { drop_item_count: 1, pickup_item_count: 1, sync_count: 1 }, withoutSyncLabel),
      null,
    )
  }],

  ['라벨이 없는 미션 전용 키(jam_period_earned)가 섞이면 null이다', () => {
    assert.strictEqual(buildConditionBullets('engine_condition', { drop_item_count: 1, jam_period_earned: 300 }, labels), null)
  }],

  ['체크인 카테고리 객체는 «카테고리 이름 라벨 값단위»로 만들고 이름의 /는 ·로 바꾼다', () => {
    assert.deepStrictEqual(
      buildConditionBullets('engine_condition', { checkin_category_count: { count: 2, category: 'train_subway' } }, labels, categories),
      ['기차·지하철 체크인 배지 2개'],
    )
    assert.deepStrictEqual(
      buildConditionBullets('engine_condition', { checkin_category_count: { count: 1, category: 'mountain' } }, labels, categories),
      ['산 체크인 배지 1개'],
    )
  }],

  ['체크인 카테고리가 맵에 없거나 맵이 비어 있으면 null이다', () => {
    const condition = { checkin_category_count: { count: 2, category: 'unknown_slug' } }
    assert.strictEqual(buildConditionBullets('engine_condition', condition, labels, categories), null)
    assert.strictEqual(buildConditionBullets('engine_condition', { checkin_category_count: { count: 2, category: 'mountain' } }, labels), null)
  }],

  ['체크인 카테고리 객체의 모양이 틀리면 null이다', () => {
    assert.strictEqual(buildConditionBullets('engine_condition', { checkin_category_count: { count: '2', category: 'mountain' } }, labels, categories), null)
    assert.strictEqual(buildConditionBullets('engine_condition', { checkin_category_count: { count: 2 } }, labels, categories), null)
    assert.strictEqual(buildConditionBullets('engine_condition', { checkin_category_count: 2 }, labels, categories), null)
  }],

  ['체크인 카테고리 라벨이 없으면 null이다', () => {
    const noLabel = new Map(labels)
    noLabel.delete('checkin_category_count')
    assert.strictEqual(
      buildConditionBullets('engine_condition', { checkin_category_count: { count: 2, category: 'mountain' } }, noLabel, categories),
      null,
    )
  }],

  ['needsCategoryNames는 체크인 카테고리 객체가 있을 때만 참이다', () => {
    assert.strictEqual(needsCategoryNames('engine_condition', { checkin_category_count: { count: 1, category: 'mountain' } }), true)
    assert.strictEqual(needsCategoryNames('engine_condition', { drop_item_count: 1 }), false)
    assert.strictEqual(needsCategoryNames('distance', { distance_km: 5 }), false)
  }],

  ['걷기 미션은 레지스트리 순서대로 한 번의 거리 → 활동 횟수 두 줄이고 activity_type은 빠진다', () => {
    const walking = { repeat_count: 3, activity_type: 'walking', single_distance_km: 0.5 }
    assert.deepStrictEqual(buildConditionBullets('engine_condition', walking, labels), ['한 번의 거리 0.5km', '활동 횟수 3회'])
    assert.deepStrictEqual(conditionBulletKeys('engine_condition', walking), ['single_distance_km', 'repeat_count'])
  }],

  ['distance 유형은 «누적 거리 10km»이고 activity_type은 불릿에 들어가지 않는다', () => {
    assert.deepStrictEqual(buildConditionBullets('distance', { distance_km: 10, activity_type: 'walking' }, labels), ['누적 거리 10km'])
    assert.deepStrictEqual(conditionBulletKeys('distance', { distance_km: 10, activity_type: 'walking' }), ['distance_km'])
  }],

  ['activity_count 유형은 «활동 횟수 2회»다', () => {
    assert.deepStrictEqual(buildConditionBullets('activity_count', { count: 2 }, labels), ['활동 횟수 2회'])
  }],

  ['옛 유형의 값이 숫자가 아니거나 라벨이 없으면 null이다', () => {
    assert.strictEqual(buildConditionBullets('distance', { distance_km: '10' }, labels), null)
    assert.strictEqual(buildConditionBullets('distance', {}, labels), null)
    assert.strictEqual(buildConditionBullets('activity_count', { count: 2 }, new Map()), null)
  }],

  ['지원하지 않는 유형(checkin·item_collect·streak_days)은 null이다', () => {
    assert.strictEqual(buildConditionBullets('checkin', { count: 3 }, labels), null)
    assert.strictEqual(buildConditionBullets('item_collect', { count: 3, badge_id: 'x' }, labels), null)
    assert.strictEqual(buildConditionBullets('streak_days', { streak_days: 3 }, labels), null)
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
