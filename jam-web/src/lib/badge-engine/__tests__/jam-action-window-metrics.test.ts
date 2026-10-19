/**
 * JAM! 행동 지표 읽기 함수의 «기간 한정» 선택 인자 시험 (티켓 20261019_1445 1회)
 *
 * 미션은 «참가한 뒤, 지정한 기간 안»의 값만 센다. 지표 읽기 함수 14개(믹스 4·드랍·픽업 4·완료 수 2·새 키 4)에
 * 선택 인자 `window`를 더했고, 이 파일은 키마다
 *  ① 기간 안의 기록은 세고(하한·상한 경계는 포함)
 *  ② 기간 전·후 기록은 세지 않으며
 *  ③ 인자를 주지 않으면 예전처럼 평생값을 세는 것(배지 엔진 호출처의 회귀 방지)
 * 을 고정한다. 모조 DB는 `gte`/`lte`를 실제로 적용한다(`fakeSupabase.ts`).
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/jam-action-window-metrics.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { MetricWindow } from '../jamActionWindow'
import {
  countCombineAttempts,
  countCombineFail,
  countCombineSuccess,
  fetchFirstSuccessRecipeIds,
} from '../jamActionMetrics'
import { countDroppedItems, countPickedUpByUsers, countPickedUpItems, countPickupFromUsers } from '../jamActionDropMetrics'
import { countCollectionCompletions, countMissionCompletions } from '../jamActionCompletionMetrics'
import {
  countCapsuleOpens,
  countCrossTribeCombineSuccess,
  countLockedItemOpens,
  countLockedItemPickups,
} from '../jamActionItemMetrics'
import { makeFakeDb, type FakeRow } from './fakeSupabase'

const U = 'user-1'
const OTHER = 'user-2'
const THIRD = 'user-3'

const FROM = '2026-10-10T00:00:00.000Z'
const TO = '2026-10-20T00:00:00.000Z'
const WINDOW: MetricWindow = { fromIso: FROM, toIso: TO }

// 기간 경계를 둘러싼 시각 — 표기를 일부러 섞는다(`Z`와 `+00:00`)
const BEFORE = '2026-10-09T23:59:59.999Z'
const AT_FROM = '2026-10-10T00:00:00+00:00'
const INSIDE = '2026-10-15T12:00:00.000Z'
const AT_TO = '2026-10-20T00:00:00+00:00'
const AFTER = '2026-10-20T00:00:00.001Z'

/** 기간 밖 2건 + 기간 안 3건(하한 경계·중간·상한 경계)을 만드는 도우미 */
function rowsAround(make: (at: string, n: number) => FakeRow): FakeRow[] {
  return [BEFORE, AT_FROM, INSIDE, AT_TO, AFTER].map((at, n) => make(at, n))
}

describe('믹스 지표 — attempted_at 기준', () => {
  const tables = () => ({
    user_combine_success_logs: [
      ...rowsAround((at, n) => ({ id: `s${n}`, user_id: U, recipe_id: 'r1', is_recipe_first: false, attempted_at: at })),
      { id: 'sx', user_id: OTHER, recipe_id: 'r1', is_recipe_first: false, attempted_at: INSIDE },
    ],
    user_combine_fail_logs: [
      ...rowsAround((at, n) => ({ id: `f${n}`, user_id: U, fail_reason: 'no_recipe_match', attempted_at: at })),
      { id: 'fx', user_id: U, fail_reason: 'invalid_count', attempted_at: INSIDE },
    ],
  })

  it('성공: 기간 안 3건만 센다 / 인자가 없으면 5건', async () => {
    const { client } = makeFakeDb(tables())
    expect(await countCombineSuccess(client, U, WINDOW)).toBe(3)
    expect(await countCombineSuccess(client, U)).toBe(5)
  })

  it('실패: 기간 안의 소각된 실패(no_recipe_match)만 센다 / 인자가 없으면 5건', async () => {
    const { client } = makeFakeDb(tables())
    expect(await countCombineFail(client, U, WINDOW)).toBe(3)
    expect(await countCombineFail(client, U)).toBe(5)
  })

  it('시도: 두 표에 같은 기간을 걸어 합친다 / 인자가 없으면 10건', async () => {
    const { client } = makeFakeDb(tables())
    expect(await countCombineAttempts(client, U, WINDOW)).toBe(6)
    expect(await countCombineAttempts(client, U)).toBe(10)
  })

  it('상한이 없으면(상시 미션) 하한 이후를 전부 센다', async () => {
    const { client } = makeFakeDb(tables())
    expect(await countCombineSuccess(client, U, { fromIso: FROM })).toBe(4)
    expect(await countCombineSuccess(client, U, { fromIso: FROM, toIso: null })).toBe(4)
  })

  it('레시피 최초 성공: 기간 안의 최초 성공 행만 인정한다 / 인자가 없으면 기간과 상관없이 인정', async () => {
    const { client } = makeFakeDb({
      user_combine_success_logs: [
        { id: 'a', user_id: U, recipe_id: 'before', is_recipe_first: true, attempted_at: BEFORE },
        { id: 'b', user_id: U, recipe_id: 'inside', is_recipe_first: true, attempted_at: INSIDE },
        { id: 'c', user_id: U, recipe_id: 'after', is_recipe_first: true, attempted_at: AFTER },
        { id: 'd', user_id: U, recipe_id: 'notfirst', is_recipe_first: false, attempted_at: INSIDE },
      ],
    })
    const ids = ['before', 'inside', 'after', 'notfirst']
    expect([...(await fetchFirstSuccessRecipeIds(client, U, ids, WINDOW))]).toEqual(['inside'])
    expect([...(await fetchFirstSuccessRecipeIds(client, U, ids))].sort()).toEqual(['after', 'before', 'inside'])
  })
})

describe('드랍·픽업 지표', () => {
  // 개체 하나당 행 하나. dropped_at과 picked_up_at이 다른 시각이라 어느 시각으로 거르는지 드러난다.
  const poi = (row: FakeRow): FakeRow => ({ inventory_item_id: row.id, ...row })

  it('drop_item_count: 놓은 때(dropped_at)가 기간 안인 서로 다른 개체만 센다 / 인자가 없으면 전부', async () => {
    const { client } = makeFakeDb({
      poi_drops: rowsAround((at, n) => poi({ id: `i${n}`, dropper_user_id: U, picked_up_by: null, dropped_at: at, picked_up_at: null })),
    })
    expect(await countDroppedItems(client, U, WINDOW)).toBe(3)
    expect(await countDroppedItems(client, U)).toBe(5)
  })

  it('pickup_item_count: 주운 때(picked_up_at)가 기간 안인 개체만 센다 — 놓은 때는 상관없다', async () => {
    const { client } = makeFakeDb({
      poi_drops: [
        // 참가 전에 놓였지만 기간 안에 주운 것 → 센다
        poi({ id: 'a', dropper_user_id: OTHER, picked_up_by: U, dropped_at: BEFORE, picked_up_at: INSIDE }),
        // 기간 안에 놓였지만 참가 전에 주운 것 → 세지 않는다
        poi({ id: 'b', dropper_user_id: OTHER, picked_up_by: U, dropped_at: INSIDE, picked_up_at: BEFORE }),
        poi({ id: 'c', dropper_user_id: OTHER, picked_up_by: U, dropped_at: INSIDE, picked_up_at: AFTER }),
        poi({ id: 'd', dropper_user_id: OTHER, picked_up_by: U, dropped_at: INSIDE, picked_up_at: AT_FROM }),
        poi({ id: 'e', dropper_user_id: OTHER, picked_up_by: U, dropped_at: INSIDE, picked_up_at: AT_TO }),
      ],
    })
    expect(await countPickedUpItems(client, U, WINDOW)).toBe(3)
    expect(await countPickedUpItems(client, U)).toBe(5)
  })

  it('pickup_from_user_count: 주운 때가 기간 안인 드랍을 놓은 서로 다른 유저만 센다', async () => {
    const { client } = makeFakeDb({
      poi_drops: [
        poi({ id: 'a', dropper_user_id: OTHER, picked_up_by: U, dropped_at: BEFORE, picked_up_at: INSIDE }),
        poi({ id: 'b', dropper_user_id: THIRD, picked_up_by: U, dropped_at: BEFORE, picked_up_at: BEFORE }),
      ],
    })
    expect(await countPickupFromUsers(client, U, WINDOW)).toBe(1)
    expect(await countPickupFromUsers(client, U)).toBe(2)
  })

  it('picked_up_by_user_count: 놓은 때가 아니라 «주워진 때»가 기간 안이어야 센다', async () => {
    const { client } = makeFakeDb({
      poi_drops: [
        // 참가 전에 놓았지만 참가 뒤에 OTHER가 주워 감 → 센다
        poi({ id: 'a', dropper_user_id: U, picked_up_by: OTHER, dropped_at: BEFORE, picked_up_at: INSIDE }),
        // 기간 안에 놓았지만 아직 아무도 줍지 않음 → 세지 않는다
        poi({ id: 'b', dropper_user_id: U, picked_up_by: null, dropped_at: INSIDE, picked_up_at: null }),
        // 기간 안에 놓았고 기간이 끝난 뒤에 주워 감 → 세지 않는다
        poi({ id: 'c', dropper_user_id: U, picked_up_by: THIRD, dropped_at: INSIDE, picked_up_at: AFTER }),
        // 참가 전에 놓고 참가 전에 주워 감 → 세지 않는다
        poi({ id: 'd', dropper_user_id: U, picked_up_by: THIRD, dropped_at: BEFORE, picked_up_at: BEFORE }),
      ],
    })
    expect(await countPickedUpByUsers(client, U, WINDOW)).toBe(1)
    // 인자가 없으면 예전처럼 평생값 — 주운 사람이 둘
    expect(await countPickedUpByUsers(client, U)).toBe(2)
  })

  it('옛 행(inventory_item_id 없음)은 기간 안이어도 세지 않는다', async () => {
    const { client } = makeFakeDb({
      poi_drops: [{ id: 'old', inventory_item_id: null, dropper_user_id: U, picked_up_by: null, dropped_at: INSIDE, picked_up_at: null }],
    })
    expect(await countDroppedItems(client, U, WINDOW)).toBe(0)
  })
})

describe('완료 수 지표 — completed_at 기준', () => {
  it('mission_complete_count: 기간 안에 완료한 미션 수 / 인자가 없으면 전부', async () => {
    const { client } = makeFakeDb({
      user_mission_completions: [
        ...rowsAround((at, n) => ({ id: `m${n}`, user_id: U, mission_id: `mission-${n}`, completed_at: at })),
        { id: 'mx', user_id: OTHER, mission_id: 'mission-x', completed_at: INSIDE },
      ],
    })
    expect(await countMissionCompletions(client, U, WINDOW)).toBe(3)
    expect(await countMissionCompletions(client, U)).toBe(5)
  })

  it('collection_complete_count: 기간 안에 완성한 컬렉션 수 / 인자가 없으면 전부', async () => {
    const { client } = makeFakeDb({
      user_item_book_completions: rowsAround((at, n) => ({ user_id: U, item_book_id: `book-${n}`, completed_at: at })),
    })
    expect(await countCollectionCompletions(client, U, WINDOW)).toBe(3)
    expect(await countCollectionCompletions(client, U)).toBe(5)
  })
})

describe('새 JAM 조건 지표', () => {
  it('capsule_open_count: opened_at이 기간 안인 열기만 센다 / 인자가 없으면 전부', async () => {
    const { client } = makeFakeDb({
      capsule_opens: rowsAround((at, n) => ({ id: `c${n}`, user_id: U, opened_at: at })),
    })
    expect(await countCapsuleOpens(client, U, WINDOW)).toBe(3)
    expect(await countCapsuleOpens(client, U)).toBe(5)
  })

  it('locked_item_open_count: 개체 이력의 unlocked 행 가운데 created_at이 기간 안인 것만 센다', async () => {
    const { client } = makeFakeDb({
      inventory_item_events: [
        ...rowsAround((at, n) => ({ id: `e${n}`, user_id: U, event_type: 'unlocked', created_at: at })),
        { id: 'other-type', user_id: U, event_type: 'created', created_at: INSIDE },
      ],
    })
    expect(await countLockedItemOpens(client, U, WINDOW)).toBe(3)
    expect(await countLockedItemOpens(client, U)).toBe(5)
  })

  it('locked_item_pickup_count: 주운 때가 기간 안인 픽업 가운데 픽업 당시 잠겨 있던 개체만 센다', async () => {
    const { client } = makeFakeDb({
      poi_drops: [
        { id: 'a', inventory_item_id: 'item-in', dropper_user_id: OTHER, picked_up_by: U, picked_up_at: INSIDE },
        { id: 'b', inventory_item_id: 'item-before', dropper_user_id: OTHER, picked_up_by: U, picked_up_at: BEFORE },
        { id: 'c', inventory_item_id: 'item-after', dropper_user_id: OTHER, picked_up_by: U, picked_up_at: AFTER },
      ],
      // 셋 다 지금도 잠겨 있다 → 기간 필터가 없으면 3, 있으면 기간 안의 1
      inventory_items: [
        { id: 'item-in', locked: true, unlocked_at: null },
        { id: 'item-before', locked: true, unlocked_at: null },
        { id: 'item-after', locked: true, unlocked_at: null },
      ],
    })
    expect(await countLockedItemPickups(client, U, WINDOW)).toBe(1)
    expect(await countLockedItemPickups(client, U)).toBe(3)
  })

  it('cross_tribe_combine_success_count: attempted_at이 기간 안인 성공 기록만 센다 / 인자가 없으면 전부', async () => {
    const { client } = makeFakeDb({
      user_combine_success_logs: rowsAround((at, n) => ({
        id: `x${n}`,
        user_id: U,
        attempted_at: at,
        ingredient_badge_ids: ['badge-red', 'badge-blue'],
      })),
      badges: [
        { id: 'badge-red', tribe_id: 'tribe-a' },
        { id: 'badge-blue', tribe_id: 'tribe-b' },
      ],
    })
    expect(await countCrossTribeCombineSuccess(client, U, WINDOW)).toBe(3)
    expect(await countCrossTribeCombineSuccess(client, U)).toBe(5)
  })
})

describe('오류는 0으로 바꾸지 않고 던진다 (기간을 줘도 같다)', () => {
  it('조회 오류가 나면 던진다', async () => {
    const { client } = makeFakeDb({}, { errors: { capsule_opens: 'DB 장애', poi_drops: 'DB 장애', user_combine_success_logs: 'DB 장애' } })
    await expect(countCapsuleOpens(client, U, WINDOW)).rejects.toThrow('DB 장애')
    await expect(countDroppedItems(client, U, WINDOW)).rejects.toThrow('DB 장애')
    await expect(countCombineSuccess(client, U, WINDOW)).rejects.toThrow('DB 장애')
    await expect(countCrossTribeCombineSuccess(client, U, WINDOW)).rejects.toThrow('DB 장애')
  })
})
