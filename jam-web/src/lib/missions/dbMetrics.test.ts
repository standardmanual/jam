/**
 * 미션 DB 기록 조건 로더(`loadMissionDbMetrics`) 시험 (티켓 20261019_1445 1·2회)
 *
 * 검증 대상:
 *  - 조건에 든 DB 키만 읽는다(키가 없으면 아무 표도 읽지 않는다)
 *  - 기간 하한 = max(참가 시각, 미션 시작), 상한 = 미션 종료(없으면 상한 없음) — 참가 전·기간 밖 기록은 세지 않는다
 *  - 14개 키(1회)와 날짜·체크인 5개 키(2회)가 각자 알맞은 값을 돌려준다(recipe_first_success는 1/0)
 *  - 읽지 못하면 던진다(0으로 폴백하지 않는다) — 하한을 정할 수 없을 때도 마찬가지
 *  - 미션 전용 DB 키 `jam_period_earned`(3-A회): 정산된 활동의 시작 시각이 기간 안인 활동의 잼만 센다(정산 시각이 아니다)
 *
 * 위치: `__tests__/`는 vitest에서 제외돼 있어(node assert 시험 전용) 모조 DB를 쓰는 이 파일은 옆에 둔다.
 * 실행: cd jam-web && npx vitest run src/lib/missions/dbMetrics.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import type { MissionCondition } from '@/types/database'
import { ENGINE_DELEGATED_DB_CONDITION_KEY_LIST } from '@/lib/missions/condition-keys'
import { loadMissionDbMetrics } from '@/lib/missions/dbMetrics'
import { makeFakeDb } from '@/lib/badge-engine/__tests__/fakeSupabase'

// 활동일 지표가 차량 속도 상한을 정책 표에서 읽는다 — 이 시험은 정책 값이 아니라 «어떤 활동을 세는가»를 보므로 기본 정책으로 고정한다
vi.mock('@/lib/abusing/policy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/abusing/policy')>()
  return { ...actual, getAbusingPolicy: vi.fn(async () => actual.DEFAULT_POLICY) }
})

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

/** 2회에 더한 날짜·체크인 5개 키 — 아래 «14개 키» 블록은 이 5개를 뺀 1회 키만 다룬다 */
const DATE_AND_CHECKIN_KEYS = [
  'weekly_active_days',
  'same_spot_checkin_days',
  'new_checkin_badge_count',
  'checkin_category_count',
  'checkin_badge_count',
]

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
    // 1회 키 14개 + 아래 «날짜·체크인 5개 키» 블록의 5개 = 정본 목록 19개 전부 (키를 더하고 시험을 빠뜨리면 여기서 걸린다)
    const firstStageKeys = ENGINE_DELEGATED_DB_CONDITION_KEY_LIST.filter((key) => !DATE_AND_CHECKIN_KEYS.includes(key))
    expect(Object.keys(condition).sort()).toEqual([...firstStageKeys].sort())
    expect(firstStageKeys.length + DATE_AND_CHECKIN_KEYS.length).toBe(19)
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

// ═══════════════════════════════════════════════════════════════════════
// 날짜·체크인 5개 키 (2회)
// ═══════════════════════════════════════════════════════════════════════

describe('loadMissionDbMetrics — 날짜·체크인 5개 키', () => {
  // 하한 = 미션 시작(2026-10-10 00:00Z = KST 09:00), 상한 = 2026-10-20 00:00Z. 월요일은 10-05·10-12·10-19
  const window = { joinedAt: JOINED_EARLY, startsAt: STARTS, endsAt: ENDS }
  const RUN = { jamActivityType: 'running', distanceKm: 5, movingTimeSec: 1800, averageSpeedKmh: 10 }
  const at = (day: string) => `2026-10-${day}T03:00:00.000Z` // KST 낮 12시 — UTC 날짜와 KST 날짜가 같다

  const activity = (id: string, day: string) => ({ id, user_id: U, start_date: at(day), normalized: RUN, filter_reason: null })
  const earn = (id: string, badgeId: string, day: string, poiId = `poi-${badgeId}`) => ({
    id,
    user_id: U,
    badge_id: badgeId,
    poi_id: poiId,
    triggered_by_activity_date: at(day),
    earned_at: '2026-10-31T00:00:00Z',
  })

  const tables = () => ({
    users: [{ id: U, created_at: '2026-09-01T00:00:00Z' }],
    strava_activities: [
      // 기간 전 주(월 10-05 ~ 금 10-09) 5일 — 기간 밖이라 세지 않는다 (세면 최고 주가 5가 된다)
      activity('a1', '05'), activity('a2', '06'), activity('a3', '07'), activity('a4', '08'), activity('a9', '09'),
      // 기간 안 월·화 2일
      activity('a5', '12'), activity('a6', '13'),
      // 기간 뒤
      activity('a8', '25'),
    ],
    user_checkin_badge_earns: [
      // 같은 지점 p1: 기간 전 2일, 기간 안 2일, 기간 뒤 1일
      earn('c1', 'old', '06', 'p1'), earn('c2', 'old', '07', 'p1'),
      earn('c3', 'old', '15', 'p1'), // 'old'는 기간 전(10-06)에 처음 받았다 — 기간 안에 다시 받은 것
      earn('c4', 'fresh', '16', 'p1'), // 'fresh'는 기간 안에 처음 받음
      earn('c5', 'late', '25', 'p1'),
    ],
    badges: [
      { id: 'old', type: 'checkin', name: '왕십리역', category: 'train_subway' },
      { id: 'fresh', type: 'checkin', name: '성수역', category: 'train_subway' },
      { id: 'late', type: 'checkin', name: '건대입구역', category: 'michelin' },
    ],
  })

  it('weekly_active_days: 기간 안의 활동일이 가장 많은 주의 날 수 — 활동 2일(월·화)과 체크인 2일(목·금)이고, 기간 전 주의 5일은 세지 않는다', async () => {
    const db = makeFakeDb(tables())
    const result = await loadMissionDbMetrics(db.client, U, { weekly_active_days: 3 }, window)
    expect(result).toEqual({ weekly_active_days: 4 })
  })

  it('same_spot_checkin_days: 기간 안의 체크인만 보고 지점별 서로 다른 날의 최댓값 (p1: 15일·16일)', async () => {
    const db = makeFakeDb(tables())
    const result = await loadMissionDbMetrics(db.client, U, { same_spot_checkin_days: 2 }, window)
    expect(result).toEqual({ same_spot_checkin_days: 2 })
  })

  it('new_checkin_badge_count: 처음 받은 시각이 기간 안인 배지만 센다 (old는 기간 전에 처음 받았고, late는 기간 뒤다)', async () => {
    const db = makeFakeDb(tables())
    const result = await loadMissionDbMetrics(db.client, U, { new_checkin_badge_count: 1 }, window)
    expect(result).toEqual({ new_checkin_badge_count: 1 })
  })

  it('checkin_category_count: 기간 안에 처음 받은 배지 가운데 지정한 장소 종류의 수 (old는 다시 받아도 세지 않는다)', async () => {
    const db = makeFakeDb(tables())
    const subway = await loadMissionDbMetrics(db.client, U, { checkin_category_count: { category: 'train_subway', count: 1 } }, window)
    expect(subway).toEqual({ checkin_category_count: 1 })
    const michelin = await loadMissionDbMetrics(db.client, U, { checkin_category_count: { category: 'michelin', count: 1 } }, window)
    expect(michelin).toEqual({ checkin_category_count: 0 }) // late는 기간 뒤
  })

  it('checkin_badge_count: 기간 안에 처음 받은 배지 가운데 지정한 이름의 수 (왕십리역은 기간 전에 처음 받았다)', async () => {
    const db = makeFakeDb(tables())
    const result = await loadMissionDbMetrics(
      db.client,
      U,
      { checkin_badge_count: { checkin_badge_names: ['성수역', '왕십리역', '건대입구역'], count: 1 } },
      window
    )
    expect(result).toEqual({ checkin_badge_count: 1 })
  })

  it('다섯 키를 함께 쓰면 한 번에 모두 읽는다', async () => {
    const db = makeFakeDb(tables())
    const condition: MissionCondition = {
      weekly_active_days: 3,
      same_spot_checkin_days: 2,
      new_checkin_badge_count: 1,
      checkin_category_count: { category: 'train_subway', count: 1 },
      checkin_badge_count: { checkin_badge_names: ['성수역'], count: 1 },
    }
    expect(Object.keys(condition).sort()).toEqual([...DATE_AND_CHECKIN_KEYS].sort())
    expect(await loadMissionDbMetrics(db.client, U, condition, window)).toEqual({
      weekly_active_days: 4,
      same_spot_checkin_days: 2,
      new_checkin_badge_count: 1,
      checkin_category_count: 1,
      checkin_badge_count: 1,
    })
  })

  it('시작 뒤에 참가했으면 하한은 참가 시각이다 — 참가 전(기간 안이지만 참가 전) 체크인은 세지 않는다', async () => {
    const db = makeFakeDb(tables())
    // 참가 시각 10-16 00:00Z — 10-15 체크인('old'의 두 번째)과 10-12·10-13 활동은 참가 전이다
    const lateJoin = { joinedAt: '2026-10-16T00:00:00.000Z', startsAt: STARTS, endsAt: ENDS }
    const result = await loadMissionDbMetrics(
      db.client,
      U,
      { weekly_active_days: 1, same_spot_checkin_days: 1, new_checkin_badge_count: 1 },
      lateJoin
    )
    expect(result).toEqual({ weekly_active_days: 1, same_spot_checkin_days: 1, new_checkin_badge_count: 1 })
  })

  it('값 모양이 틀린 checkin_category_count·checkin_badge_count는 읽지 않고 0이다 (비교 쪽도 충족하지 못한다)', async () => {
    const db = makeFakeDb(tables())
    const result = await loadMissionDbMetrics(
      db.client,
      U,
      { checkin_category_count: {}, checkin_badge_count: { checkin_badge_names: '성수역', count: 1 } } as unknown as MissionCondition,
      window
    )
    expect(result).toEqual({ checkin_category_count: 0, checkin_badge_count: 0 })
    expect(db.queried).toEqual([])
  })

  it('문자열이 아닌 이름은 거르고 나머지 이름으로 센다', async () => {
    const db = makeFakeDb(tables())
    const result = await loadMissionDbMetrics(
      db.client,
      U,
      { checkin_badge_count: { checkin_badge_names: ['성수역', 3, null], count: 1 } } as unknown as MissionCondition,
      window
    )
    expect(result).toEqual({ checkin_badge_count: 1 })
  })

  it('읽기 오류는 0으로 바꾸지 않고 던진다 (체크인 표·활동 표 각각)', async () => {
    const earnsFail = makeFakeDb(tables(), { errors: { user_checkin_badge_earns: '체크인 장애' } })
    await expect(loadMissionDbMetrics(earnsFail.client, U, { new_checkin_badge_count: 1 }, window)).rejects.toThrow('체크인 장애')
    await expect(loadMissionDbMetrics(earnsFail.client, U, { weekly_active_days: 1 }, window)).rejects.toThrow('체크인 장애')

    const activitiesFail = makeFakeDb(tables(), { errors: { strava_activities: '활동 장애' } })
    await expect(loadMissionDbMetrics(activitiesFail.client, U, { weekly_active_days: 1 }, window)).rejects.toThrow('활동 장애')
  })

  it('가입 시각을 읽지 못하면 날짜 지표는 던진다 (가입한 날 하한을 정할 수 없다)', async () => {
    const db = makeFakeDb({ ...tables(), users: [] })
    await expect(loadMissionDbMetrics(db.client, U, { weekly_active_days: 1 }, window)).rejects.toThrow('가입 시각')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 기간 동안 모은 잼 — 미션 전용 DB 키 (3-A회)
// ═══════════════════════════════════════════════════════════════════════

describe('loadMissionDbMetrics — jam_period_earned (기간 동안 모은 잼)', () => {
  const SYNCED_AT = '2026-10-16T05:00:00.000Z' // 모든 정산이 기간 안의 같은 시각에 이뤄졌다 — 정산 시각으로는 구분되지 않는다
  const activity = (id: string, startDate: string, userId = U) => ({ id, user_id: userId, start_date: startDate })
  const settlement = (activityId: string, amount: number, userId = U) => ({
    id: `tx-${activityId}`,
    user_id: userId,
    amount,
    reason: 'activity_settlement',
    source_activity_id: activityId,
    created_at: SYNCED_AT,
  })

  const tables = () => ({
    strava_activities: [
      activity('a-before-start', T_BEFORE_START), // 미션 시작 전
      activity('a-before-join', T_AFTER_START_BEFORE_LATE_JOIN), // 시작 뒤지만 참가 전
      activity('a-inside', T_INSIDE),
      activity('a-after-end', T_AFTER_END), // 종료 뒤
      activity('a-other-user', T_INSIDE, OTHER),
    ],
    jam_transactions: [
      settlement('a-before-start', 1000),
      settlement('a-before-join', 100), // 참가 전 활동을 늦게(기간 안에) 정산했다 — 세면 안 된다
      settlement('a-inside', 10),
      settlement('a-after-end', 10000),
      settlement('a-other-user', 99999, OTHER),
      { id: 'fill', user_id: U, amount: -4, reason: 'capsule_fill', source_activity_id: null, created_at: SYNCED_AT },
      { id: 'grant', user_id: U, amount: 500, reason: 'admin_grant', source_activity_id: null, created_at: SYNCED_AT },
    ],
  })

  it('늦게 참가했으면 하한은 참가 시각이다 — 참가 전 활동의 잼은 늦게 정산돼도 세지 않고, 종료 뒤 활동과 채움·운영자 지급도 뺀다', async () => {
    const db = makeFakeDb(tables())
    const result = await loadMissionDbMetrics(db.client, U, { jam_period_earned: 10 }, { joinedAt: JOINED_LATE, startsAt: STARTS, endsAt: ENDS })
    expect(result).toEqual({ jam_period_earned: 10 })
  })

  it('시작 전에 참가했으면 하한은 미션 시작이다 — 시작 뒤 활동은 센다', async () => {
    const db = makeFakeDb(tables())
    const result = await loadMissionDbMetrics(db.client, U, { jam_period_earned: 1 }, { joinedAt: JOINED_EARLY, startsAt: STARTS, endsAt: ENDS })
    expect(result.jam_period_earned).toBe(110) // a-before-join(100) + a-inside(10). 시작 전(1000)·종료 뒤(10000)는 뺀다
  })

  it('종료가 없으면(상시 미션) 상한 없이 센다', async () => {
    const db = makeFakeDb(tables())
    const result = await loadMissionDbMetrics(db.client, U, { jam_period_earned: 1 }, { joinedAt: JOINED_LATE, startsAt: STARTS, endsAt: null })
    expect(result.jam_period_earned).toBe(10010) // a-inside + a-after-end
  })

  it('이 키만 든 조건은 활동 표와 잼 원장만 읽는다', async () => {
    const db = makeFakeDb(tables())
    await loadMissionDbMetrics(db.client, U, { jam_period_earned: 10 }, { joinedAt: JOINED_LATE, startsAt: STARTS, endsAt: ENDS })
    expect(new Set(db.queried)).toEqual(new Set(['strava_activities', 'jam_transactions']))
  })

  it('배지 조건과 이름이 같은 DB 키와 함께 쓰면 한 번에 읽는다', async () => {
    const db = makeFakeDb({ ...tables(), user_combine_success_logs: successLogs([T_INSIDE]) })
    const result = await loadMissionDbMetrics(
      db.client,
      U,
      { jam_period_earned: 10, combine_success_count: 1 },
      { joinedAt: JOINED_LATE, startsAt: STARTS, endsAt: ENDS }
    )
    expect(result).toEqual({ jam_period_earned: 10, combine_success_count: 1 })
  })

  it('정산된 활동이 없으면 0이다', async () => {
    const db = makeFakeDb({ strava_activities: [activity('a1', T_INSIDE)], jam_transactions: [] })
    const result = await loadMissionDbMetrics(db.client, U, { jam_period_earned: 1 }, { joinedAt: JOINED_LATE, startsAt: STARTS, endsAt: ENDS })
    expect(result).toEqual({ jam_period_earned: 0 })
  })

  it('읽지 못하면 0으로 바꾸지 않고 던진다 (잼 원장·활동 표 각각, 하한을 정할 수 없을 때도)', async () => {
    const window = { joinedAt: JOINED_LATE, startsAt: STARTS, endsAt: ENDS }
    const ledgerFail = makeFakeDb({ strava_activities: [activity('a1', T_INSIDE)] }, { errors: { jam_transactions: '원장 장애' } })
    await expect(loadMissionDbMetrics(ledgerFail.client, U, { jam_period_earned: 1 }, window)).rejects.toThrow('원장 장애')
    const activityFail = makeFakeDb({}, { errors: { strava_activities: '활동 장애' } })
    await expect(loadMissionDbMetrics(activityFail.client, U, { jam_period_earned: 1 }, window)).rejects.toThrow('활동 장애')
    const noLower = makeFakeDb(tables())
    await expect(
      loadMissionDbMetrics(noLower.client, U, { jam_period_earned: 1 }, { joinedAt: null, startsAt: '깨진 값', endsAt: null })
    ).rejects.toThrow('시작 시각을 정하지 못해')
    expect(noLower.queried).toEqual([])
  })
})
