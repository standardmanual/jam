/**
 * 미션 DB 기록 조건 로더(`loadMissionDbMetrics`) 시험 (티켓 20261019_1445 1회)
 *
 * 검증 대상:
 *  - 조건에 든 DB 키만 읽는다(키가 없으면 아무 표도 읽지 않는다)
 *  - 기간 하한 = max(참가 시각, 미션 시작), 상한 = 미션 종료(없으면 상한 없음) — 참가 전·기간 밖 기록은 세지 않는다
 *  - 14개 키가 각자 알맞은 값을 돌려준다(recipe_first_success는 1/0)
 *  - 읽지 못하면 던진다(0으로 폴백하지 않는다) — 하한을 정할 수 없을 때도 마찬가지
 *
 * 위치: `__tests__/`는 vitest에서 제외돼 있어(node assert 시험 전용) 모조 DB를 쓰는 이 파일은 옆에 둔다.
 * 실행: cd jam-web && npx vitest run src/lib/missions/dbMetrics.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { MissionCondition } from '@/types/database'
import { ENGINE_DELEGATED_DB_CONDITION_KEY_LIST } from '@/lib/missions/condition-keys'
import { loadMissionDbMetrics } from '@/lib/missions/dbMetrics'
import { makeFakeDb } from '@/lib/badge-engine/__tests__/fakeSupabase'

const U = 'user-1'
const OTHER = 'user-2'

const STARTS = '2026-10-10T00:00:00.000Z'
const JOINED_EARLY = '2026-10-05T00:00:00+00:00' // 시작 전에 참가
const JOINED_LATE = '2026-10-14T00:00:00.000Z' // 시작 뒤에 참가
const ENDS = '2026-10-20T00:00:00.000Z'

const T_BEFORE_START = '2026-10-08T00:00:00.000Z' // 참가 뒤지만 시작 전
const T_AFTER_START_BEFORE_LATE_JOIN = '2026-10-12T00:00:00.000Z'
const T_INSIDE = '2026-10-16T00:00:00.000Z'
const T_AFTER_END = '2026-10-25T00:00:00.000Z'

const successLogs = (times: string[]) =>
  times.map((at, n) => ({ id: `s${n}`, user_id: U, recipe_id: 'r1', is_recipe_first: false, attempted_at: at }))

describe('loadMissionDbMetrics — 조건에 든 키만 읽는다', () => {
  it('DB 키가 없으면 아무 표도 읽지 않고 빈 객체를 돌려준다', async () => {
    const db = makeFakeDb({})
    const result = await loadMissionDbMetrics(db.client, U, { distance_km: 10 }, { joinedAt: JOINED_LATE, startsAt: STARTS, endsAt: null })
    expect(result).toEqual({})
    expect(db.queried).toEqual([])
  })

  it('조건에 든 키의 표만 읽는다', async () => {
    const db = makeFakeDb({ user_combine_success_logs: successLogs([T_INSIDE]) })
    const result = await loadMissionDbMetrics(db.client, U, { combine_success_count: 1 }, { joinedAt: JOINED_EARLY, startsAt: STARTS, endsAt: null })
    expect(result).toEqual({ combine_success_count: 1 })
    expect(new Set(db.queried)).toEqual(new Set(['user_combine_success_logs']))
  })
})

describe('loadMissionDbMetrics — 기간 경계', () => {
  const condition: MissionCondition = { combine_success_count: 1 }

  it('시작 전에 참가했으면 하한은 미션 시작이다 — 시작 전 기록은 세지 않는다', async () => {
    const db = makeFakeDb({ user_combine_success_logs: successLogs([T_BEFORE_START, T_INSIDE]) })
    const result = await loadMissionDbMetrics(db.client, U, condition, { joinedAt: JOINED_EARLY, startsAt: STARTS, endsAt: null })
    expect(result.combine_success_count).toBe(1)
  })

  it('시작 뒤에 참가했으면 하한은 참가 시각이다 — 참가 전 기록은 세지 않는다', async () => {
    const db = makeFakeDb({ user_combine_success_logs: successLogs([T_AFTER_START_BEFORE_LATE_JOIN, T_INSIDE]) })
    const result = await loadMissionDbMetrics(db.client, U, condition, { joinedAt: JOINED_LATE, startsAt: STARTS, endsAt: null })
    expect(result.combine_success_count).toBe(1)
  })

  it('종료 뒤 기록은 세지 않고, 종료가 없으면(상시 미션) 상한 없이 센다', async () => {
    const db = makeFakeDb({ user_combine_success_logs: successLogs([T_INSIDE, T_AFTER_END]) })
    const bounded = await loadMissionDbMetrics(db.client, U, condition, { joinedAt: JOINED_LATE, startsAt: STARTS, endsAt: ENDS })
    expect(bounded.combine_success_count).toBe(1)
    const open = await loadMissionDbMetrics(db.client, U, condition, { joinedAt: JOINED_LATE, startsAt: STARTS, endsAt: null })
    expect(open.combine_success_count).toBe(2)
  })

  it('경계 시각은 포함한다 (참가 시각 정각, 종료 정각)', async () => {
    const db = makeFakeDb({ user_combine_success_logs: successLogs([JOINED_LATE, ENDS]) })
    const result = await loadMissionDbMetrics(db.client, U, condition, { joinedAt: JOINED_LATE, startsAt: STARTS, endsAt: ENDS })
    expect(result.combine_success_count).toBe(2)
  })

  it('참가 시각을 알 수 없으면(joinedAt 없음) 미션 시작을 하한으로 쓴다', async () => {
    const db = makeFakeDb({ user_combine_success_logs: successLogs([T_BEFORE_START, T_INSIDE]) })
    const result = await loadMissionDbMetrics(db.client, U, condition, { joinedAt: null, startsAt: STARTS, endsAt: null })
    expect(result.combine_success_count).toBe(1)
  })
})

describe('loadMissionDbMetrics — 14개 키', () => {
  const window = { joinedAt: JOINED_EARLY, startsAt: STARTS, endsAt: ENDS }

  // 기간 안(T_INSIDE) 기록 1건씩과 기간 밖(T_BEFORE_START·T_AFTER_END) 기록을 섞은 한 벌의 표
  const tables = () => ({
    user_combine_success_logs: [
      { id: 's1', user_id: U, recipe_id: 'r1', is_recipe_first: true, attempted_at: T_INSIDE, ingredient_badge_ids: ['b-red', 'b-blue'] },
      { id: 's2', user_id: U, recipe_id: 'r2', is_recipe_first: true, attempted_at: T_BEFORE_START, ingredient_badge_ids: ['b-red', 'b-blue'] },
      { id: 's3', user_id: U, recipe_id: 'r3', is_recipe_first: false, attempted_at: T_AFTER_END, ingredient_badge_ids: ['b-red', 'b-blue'] },
    ],
    user_combine_fail_logs: [
      { id: 'f1', user_id: U, fail_reason: 'no_recipe_match', attempted_at: T_INSIDE },
      { id: 'f2', user_id: U, fail_reason: 'no_recipe_match', attempted_at: T_BEFORE_START },
    ],
    badges: [
      { id: 'b-red', tribe_id: 'tribe-a' },
      { id: 'b-blue', tribe_id: 'tribe-b' },
    ],
    poi_drops: [
      // 내가 놓음: 기간 안에 놓았고 기간 안에 OTHER가 주움
      { id: 'd1', inventory_item_id: 'i1', dropper_user_id: U, picked_up_by: OTHER, dropped_at: T_INSIDE, picked_up_at: T_INSIDE },
      // 내가 놓음: 기간 전에 놓고 기간 전에 주워 감
      { id: 'd2', inventory_item_id: 'i2', dropper_user_id: U, picked_up_by: OTHER, dropped_at: T_BEFORE_START, picked_up_at: T_BEFORE_START },
      // 내가 주움: 기간 안, 놓은 사람은 OTHER, 잠긴 개체
      { id: 'd3', inventory_item_id: 'i3', dropper_user_id: OTHER, picked_up_by: U, dropped_at: T_INSIDE, picked_up_at: T_INSIDE },
    ],
    inventory_items: [{ id: 'i3', locked: true, unlocked_at: null }],
    user_mission_completions: [
      { id: 'c1', user_id: U, mission_id: 'm-in', completed_at: T_INSIDE },
      { id: 'c2', user_id: U, mission_id: 'm-old', completed_at: T_BEFORE_START },
    ],
    user_item_book_completions: [
      { user_id: U, item_book_id: 'book-in', completed_at: T_INSIDE },
      { user_id: U, item_book_id: 'book-old', completed_at: T_BEFORE_START },
    ],
    capsule_opens: [
      { id: 'o1', user_id: U, opened_at: T_INSIDE },
      { id: 'o2', user_id: U, opened_at: T_AFTER_END },
    ],
    inventory_item_events: [
      { id: 'e1', user_id: U, event_type: 'unlocked', created_at: T_INSIDE },
      { id: 'e2', user_id: U, event_type: 'unlocked', created_at: T_BEFORE_START },
    ],
  })

  it('키마다 기간 안의 값을 돌려준다', async () => {
    const db = makeFakeDb(tables())
    const condition: MissionCondition = {
      combine_attempt_count: 1,
      combine_success_count: 1,
      combine_fail_count: 1,
      recipe_first_success: { recipe_id: 'r1' },
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
    }
    expect(Object.keys(condition).sort()).toEqual([...ENGINE_DELEGATED_DB_CONDITION_KEY_LIST].sort())
    const result = await loadMissionDbMetrics(db.client, U, condition, window)
    expect(result).toEqual({
      combine_attempt_count: 2, // 성공 1 + 실패 1 (기간 안)
      combine_success_count: 1,
      combine_fail_count: 1,
      recipe_first_success: 1,
      drop_item_count: 1, // d1만 (d2는 기간 전)
      pickup_item_count: 1,
      pickup_from_user_count: 1,
      picked_up_by_user_count: 1, // d1만 (d2는 기간 전에 주워 감)
      mission_complete_count: 1,
      collection_complete_count: 1,
      capsule_open_count: 1,
      locked_item_open_count: 1,
      locked_item_pickup_count: 1,
      cross_tribe_combine_success_count: 1,
    })
  })

  it('recipe_first_success: 최초 성공이 기간 밖이거나 다른 레시피면 0이다', async () => {
    const db = makeFakeDb(tables())
    const outside = await loadMissionDbMetrics(db.client, U, { recipe_first_success: { recipe_id: 'r2' } }, window) // 기간 전
    expect(outside.recipe_first_success).toBe(0)
    const missing = await loadMissionDbMetrics(db.client, U, { recipe_first_success: { recipe_id: 'none' } }, window)
    expect(missing.recipe_first_success).toBe(0)
  })

  it('recipe_first_success: 레시피를 가리키지 않으면 DB를 읽지 않고 0이다', async () => {
    const db = makeFakeDb(tables())
    const result = await loadMissionDbMetrics(db.client, U, { recipe_first_success: {} } as MissionCondition, window)
    expect(result.recipe_first_success).toBe(0)
    expect(db.queried).toEqual([])
  })
})

describe('loadMissionDbMetrics — 읽지 못하면 던진다', () => {
  it('표 조회 오류는 0으로 바꾸지 않고 던진다', async () => {
    const db = makeFakeDb({}, { errors: { capsule_opens: 'DB 장애' } })
    await expect(
      loadMissionDbMetrics(db.client, U, { capsule_open_count: 1 }, { joinedAt: JOINED_LATE, startsAt: STARTS, endsAt: null })
    ).rejects.toThrow('DB 장애')
  })

  it('여러 키 중 하나만 실패해도 던진다 (일부만 채워 돌려주지 않는다)', async () => {
    const db = makeFakeDb({ user_combine_success_logs: successLogs([T_INSIDE]) }, { errors: { capsule_opens: 'DB 장애' } })
    await expect(
      loadMissionDbMetrics(db.client, U, { combine_success_count: 1, capsule_open_count: 1 }, { joinedAt: JOINED_LATE, startsAt: STARTS, endsAt: null })
    ).rejects.toThrow()
  })

  it('참가·시작 시각이 둘 다 해석되지 않으면 하한이 없으므로 읽지 않고 던진다', async () => {
    const db = makeFakeDb({ capsule_opens: [{ id: 'o', user_id: U, opened_at: T_INSIDE }] })
    const call = loadMissionDbMetrics(db.client, U, { capsule_open_count: 1 }, { joinedAt: null, startsAt: '깨진 값', endsAt: null })
    await expect(call).rejects.toThrow('시작 시각을 정하지 못해')
    expect(db.queried).toEqual([])
  })
})
