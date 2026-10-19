/**
 * DB 기록 조건 20개 키 종합 시험 — «참가 전·기간 밖 기록은 세지 않는다» (티켓 20261019_1445 4회)
 *
 * 1·2·3-A회에서 키를 더할 때마다 읽기 함수·로더·판정 시험이 따로 생겼다. 이 파일은 그 시험들이 한곳에서 같은 약속을 지키는지 키마다 확인한다.
 *   A. 참가 전(시작 전, 시작 뒤 참가 전)·종료 뒤 기록만 있는 DB는 모든 키가 0이고, 그 값으로 판정하면 조건을 충족하지 못한다.
 *   B. 같은 DB에 기간 안 기록이 더해지면 그 기록만 센다 — 그 값으로 판정하면 조건을 충족한다.
 *   C. 키 목록과 시험 사례가 어긋나면(키를 더하고 사례를 빠뜨리면) 실패한다. `Record<MissionDbConditionKey, …>`라 컴파일 단계에서도 걸린다.
 * 모든 사례는 같은 기간을 쓴다: 미션 시작 10-10, 참가 10-14(시작 뒤 참가라 하한은 참가 시각), 종료 10-20. 정산·기록 시각(created_at 등)이
 * 기간 안이어도 활동·행위의 시각이 기간 밖이면 세지 않는 키(`jam_period_earned`, 체크인 «처음 받은» 키)는 그 점을 따로 고정한다.
 *
 * 위치: `__tests__/`는 vitest에서 제외돼 있어(node assert 시험 전용) 모조 DB를 쓰는 이 파일은 옆에 둔다(`dbMetrics.test.ts`와 같은 이유).
 * 실행: cd jam-web && npx vitest run src/lib/missions/db-keys-outside-window.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import type { MissionCondition } from '@/types/database'
import { MISSION_DB_CONDITION_KEY_LIST, type MissionDbConditionKey } from '@/lib/missions/condition-keys'
import { loadMissionDbMetrics } from '@/lib/missions/dbMetrics'
import { evaluateEngineMissionCondition } from '@/lib/missions/engineCondition'
import { makeFakeDb, type FakeRow } from '@/lib/badge-engine/__tests__/fakeSupabase'

// 활동일 지표가 차량 속도 상한을 정책 표에서 읽는다 — 이 시험은 정책 값이 아니라 «어떤 활동을 세는가»를 보므로 기본 정책으로 고정한다
vi.mock('@/lib/abusing/policy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/abusing/policy')>()
  return { ...actual, getAbusingPolicy: vi.fn(async () => actual.DEFAULT_POLICY) }
})

const U = 'user-1'
const OTHER = 'user-2'
const THIRD = 'user-3'

/** 미션 시작 10-10, 참가 10-14(시작 뒤 참가), 종료 10-20 → 읽는 기간은 [10-14, 10-20] */
const WINDOW = { joinedAt: '2026-10-14T00:00:00.000Z', startsAt: '2026-10-10T00:00:00.000Z', endsAt: '2026-10-20T00:00:00.000Z' }

const BEFORE_START = '2026-10-08T03:00:00.000Z' // 미션 시작 전(참가 전)
const BEFORE_JOIN = '2026-10-12T03:00:00.000Z' // 시작 뒤지만 참가 전
const INSIDE = '2026-10-16T03:00:00.000Z' // 기간 안 (KST 10-16 낮 12시)
const AFTER_END = '2026-10-25T03:00:00.000Z' // 종료 뒤
const OUTSIDE_TIMES = [BEFORE_START, BEFORE_JOIN, AFTER_END]

type Tables = Record<string, FakeRow[]>

interface MatrixCase {
  /** 조건 전체(기준 값 = `expectedInside`라 기간 안 값이면 충족하고 0이면 충족하지 못한다) */
  condition: MissionCondition
  /** 기간 밖·참가 전 기록만 든 DB */
  outside: Tables
  /** 위 DB에 기간 안 기록을 더한 DB */
  inside: Tables
  /** `inside` DB에서 이 키가 돌려줘야 하는 값 */
  expectedInside: number
}

/** 두 표 묶음을 합친다(같은 표는 행을 이어 붙인다) */
const plus = (base: Tables, extra: Tables): Tables => {
  const merged: Tables = { ...base }
  for (const [table, rows] of Object.entries(extra)) merged[table] = [...(merged[table] ?? []), ...rows]
  return merged
}

// ── 행 만들기 ──────────────────────────────────────────────────────────────
const successLog = (id: string, at: string, overrides: FakeRow = {}): FakeRow => ({
  id,
  user_id: U,
  recipe_id: 'r1',
  is_recipe_first: false,
  attempted_at: at,
  ingredient_badge_ids: [],
  ...overrides,
})
const failLog = (id: string, at: string): FakeRow => ({ id, user_id: U, fail_reason: 'no_recipe_match', attempted_at: at })
const dropped = (id: string, at: string): FakeRow => ({
  id,
  inventory_item_id: `item-${id}`,
  dropper_user_id: U,
  picked_up_by: null,
  dropped_at: at,
  picked_up_at: null,
})
const pickedUp = (id: string, at: string, dropper = OTHER): FakeRow => ({
  id,
  inventory_item_id: `item-${id}`,
  dropper_user_id: dropper,
  picked_up_by: U,
  dropped_at: BEFORE_START,
  picked_up_at: at,
})
const RUN = { jamActivityType: 'running', distanceKm: 5, movingTimeSec: 1800, averageSpeedKmh: 10 }
const activity = (id: string, at: string): FakeRow => ({ id, user_id: U, start_date: at, normalized: RUN, filter_reason: null })
const earn = (id: string, badgeId: string, at: string, poiId = 'poi-1'): FakeRow => ({
  id,
  user_id: U,
  badge_id: badgeId,
  poi_id: poiId,
  triggered_by_activity_date: at,
  earned_at: '2026-10-31T00:00:00Z', // 기록한 시각은 늘 기간 뒤 — 활동 시각(위 칸)이 기준이다
})
const SIGNUP: Tables = { users: [{ id: U, created_at: '2026-09-01T00:00:00Z' }] }
const settlement = (activityId: string, amount: number): FakeRow => ({
  id: `tx-${activityId}`,
  user_id: U,
  amount,
  reason: 'activity_settlement',
  source_activity_id: activityId,
  created_at: INSIDE, // 모든 정산이 기간 안에 이뤄졌다 — 정산 시각으로는 구분되지 않는다
})

/** 기간 밖 세 시각마다 행 하나씩 */
const outsideRows = (make: (id: string, at: string) => FakeRow, prefix = 'o'): FakeRow[] =>
  OUTSIDE_TIMES.map((at, n) => make(`${prefix}${n}`, at))

// 체크인 «처음 받은» 키 3개가 같은 방문 기록을 쓴다 — a는 기간 전에 처음 받았고 기간 안에 다시 받아도 새 배지가 아니다
const checkinOutside: Tables = {
  ...SIGNUP,
  user_checkin_badge_earns: [earn('e1', 'a', BEFORE_START), earn('e2', 'b', BEFORE_JOIN), earn('e3', 'c', AFTER_END)],
  badges: [
    { id: 'a', type: 'checkin', name: '왕십리역', category: 'train_subway' },
    { id: 'b', type: 'checkin', name: '성수역', category: 'train_subway' },
    { id: 'c', type: 'checkin', name: '건대입구역', category: 'train_subway' },
    { id: 'd', type: 'checkin', name: '서울숲역', category: 'train_subway' },
  ],
}
const checkinInside: Tables = plus(checkinOutside, {
  user_checkin_badge_earns: [earn('e4', 'a', INSIDE) /* a를 다시 받음 — 세지 않는다 */, earn('e5', 'd', INSIDE) /* d를 처음 받음 — 센다 */],
})

const CASES: Record<MissionDbConditionKey, MatrixCase> = {
  // ── 믹스 4 ──
  combine_attempt_count: {
    condition: { combine_attempt_count: 2 },
    outside: { user_combine_success_logs: outsideRows((id, at) => successLog(`s${id}`, at)), user_combine_fail_logs: outsideRows((id, at) => failLog(`f${id}`, at)) },
    inside: {
      user_combine_success_logs: [...outsideRows((id, at) => successLog(`s${id}`, at)), successLog('s-in', INSIDE)],
      user_combine_fail_logs: [...outsideRows((id, at) => failLog(`f${id}`, at)), failLog('f-in', INSIDE)],
    },
    expectedInside: 2, // 성공 1 + 실패 1
  },
  combine_success_count: {
    condition: { combine_success_count: 1 },
    outside: { user_combine_success_logs: outsideRows((id, at) => successLog(id, at)) },
    inside: { user_combine_success_logs: [...outsideRows((id, at) => successLog(id, at)), successLog('in', INSIDE)] },
    expectedInside: 1,
  },
  combine_fail_count: {
    condition: { combine_fail_count: 1 },
    outside: { user_combine_fail_logs: outsideRows((id, at) => failLog(id, at)) },
    inside: { user_combine_fail_logs: [...outsideRows((id, at) => failLog(id, at)), failLog('in', INSIDE)] },
    expectedInside: 1,
  },
  recipe_first_success: {
    condition: { recipe_first_success: { recipe_id: 'r1' } },
    // 최초 성공이 참가 전에 있었다 — 기간 안에 같은 레시피를 다시 성공해도 «최초»는 아니다
    outside: { user_combine_success_logs: [successLog('first', BEFORE_JOIN, { is_recipe_first: true }), successLog('again', INSIDE)] },
    // 최초 성공이 기간 안이다
    inside: { user_combine_success_logs: [successLog('first', INSIDE, { is_recipe_first: true })] },
    expectedInside: 1,
  },
  // ── 드랍·픽업 4 ──
  drop_item_count: {
    condition: { drop_item_count: 1 },
    outside: { poi_drops: outsideRows((id, at) => dropped(id, at)) },
    inside: { poi_drops: [...outsideRows((id, at) => dropped(id, at)), dropped('in', INSIDE)] },
    expectedInside: 1,
  },
  pickup_item_count: {
    condition: { pickup_item_count: 1 },
    outside: { poi_drops: outsideRows((id, at) => pickedUp(id, at)) },
    inside: { poi_drops: [...outsideRows((id, at) => pickedUp(id, at)), pickedUp('in', INSIDE)] },
    expectedInside: 1,
  },
  pickup_from_user_count: {
    condition: { pickup_from_user_count: 1 },
    outside: { poi_drops: outsideRows((id, at) => pickedUp(id, at, OTHER)) },
    inside: { poi_drops: [...outsideRows((id, at) => pickedUp(id, at, OTHER)), pickedUp('in', INSIDE, THIRD)] },
    expectedInside: 1, // 기간 안에 주운 드랍을 놓은 사람만 센다(THIRD)
  },
  picked_up_by_user_count: {
    condition: { picked_up_by_user_count: 1 },
    // 내가 놓은 드랍을 기간 밖에 주워 갔다. 놓은 때가 기간 안이어도 «주워진 때»가 기준이라 세지 않는다
    outside: {
      poi_drops: outsideRows((id, at) => ({
        id,
        inventory_item_id: `item-${id}`,
        dropper_user_id: U,
        picked_up_by: OTHER,
        dropped_at: INSIDE,
        picked_up_at: at,
      })),
    },
    inside: {
      poi_drops: [
        ...outsideRows((id, at) => ({
          id,
          inventory_item_id: `item-${id}`,
          dropper_user_id: U,
          picked_up_by: OTHER,
          dropped_at: INSIDE,
          picked_up_at: at,
        })),
        { id: 'in', inventory_item_id: 'item-in', dropper_user_id: U, picked_up_by: THIRD, dropped_at: BEFORE_START, picked_up_at: INSIDE },
      ],
    },
    expectedInside: 1,
  },
  // ── 완료 수 2 ──
  mission_complete_count: {
    condition: { mission_complete_count: 1 },
    outside: { user_mission_completions: outsideRows((id, at) => ({ id, user_id: U, mission_id: `m-${id}`, completed_at: at })) },
    inside: {
      user_mission_completions: [
        ...outsideRows((id, at) => ({ id, user_id: U, mission_id: `m-${id}`, completed_at: at })),
        { id: 'in', user_id: U, mission_id: 'm-in', completed_at: INSIDE },
      ],
    },
    expectedInside: 1,
  },
  collection_complete_count: {
    condition: { collection_complete_count: 1 },
    outside: { user_item_book_completions: outsideRows((id, at) => ({ user_id: U, item_book_id: `book-${id}`, completed_at: at })) },
    inside: {
      user_item_book_completions: [
        ...outsideRows((id, at) => ({ user_id: U, item_book_id: `book-${id}`, completed_at: at })),
        { user_id: U, item_book_id: 'book-in', completed_at: INSIDE },
      ],
    },
    expectedInside: 1,
  },
  // ── 새 키 4 ──
  capsule_open_count: {
    condition: { capsule_open_count: 1 },
    outside: { capsule_opens: outsideRows((id, at) => ({ id, user_id: U, opened_at: at })) },
    inside: { capsule_opens: [...outsideRows((id, at) => ({ id, user_id: U, opened_at: at })), { id: 'in', user_id: U, opened_at: INSIDE }] },
    expectedInside: 1,
  },
  locked_item_open_count: {
    condition: { locked_item_open_count: 1 },
    outside: { inventory_item_events: outsideRows((id, at) => ({ id, user_id: U, event_type: 'unlocked', created_at: at })) },
    inside: {
      inventory_item_events: [
        ...outsideRows((id, at) => ({ id, user_id: U, event_type: 'unlocked', created_at: at })),
        { id: 'in', user_id: U, event_type: 'unlocked', created_at: INSIDE },
      ],
    },
    expectedInside: 1,
  },
  locked_item_pickup_count: {
    condition: { locked_item_pickup_count: 1 },
    outside: {
      poi_drops: outsideRows((id, at) => pickedUp(id, at)),
      inventory_items: outsideRows((id) => ({ id: `item-${id}`, locked: true, unlocked_at: null })),
    },
    inside: {
      poi_drops: [...outsideRows((id, at) => pickedUp(id, at)), pickedUp('in', INSIDE)],
      inventory_items: [...outsideRows((id) => ({ id: `item-${id}`, locked: true, unlocked_at: null })), { id: 'item-in', locked: true, unlocked_at: null }],
    },
    expectedInside: 1,
  },
  cross_tribe_combine_success_count: {
    condition: { cross_tribe_combine_success_count: 1 },
    outside: {
      user_combine_success_logs: outsideRows((id, at) => successLog(id, at, { ingredient_badge_ids: ['b-red', 'b-blue'] })),
      badges: [{ id: 'b-red', tribe_id: 'tribe-a' }, { id: 'b-blue', tribe_id: 'tribe-b' }],
    },
    inside: {
      user_combine_success_logs: [
        ...outsideRows((id, at) => successLog(id, at, { ingredient_badge_ids: ['b-red', 'b-blue'] })),
        successLog('in', INSIDE, { ingredient_badge_ids: ['b-red', 'b-blue'] }),
      ],
      badges: [{ id: 'b-red', tribe_id: 'tribe-a' }, { id: 'b-blue', tribe_id: 'tribe-b' }],
    },
    expectedInside: 1,
  },
  // ── 날짜·체크인 5 ──
  weekly_active_days: {
    condition: { weekly_active_days: 1 },
    outside: { ...SIGNUP, strava_activities: outsideRows((id, at) => activity(id, at)) },
    inside: { ...SIGNUP, strava_activities: [...outsideRows((id, at) => activity(id, at)), activity('in', INSIDE)] },
    expectedInside: 1,
  },
  same_spot_checkin_days: {
    condition: { same_spot_checkin_days: 1 },
    outside: { ...SIGNUP, user_checkin_badge_earns: outsideRows((id, at) => earn(id, `badge-${id}`, at, 'poi-1')) },
    inside: { ...SIGNUP, user_checkin_badge_earns: [...outsideRows((id, at) => earn(id, `badge-${id}`, at, 'poi-1')), earn('in', 'badge-in', INSIDE, 'poi-1')] },
    expectedInside: 1,
  },
  new_checkin_badge_count: {
    condition: { new_checkin_badge_count: 1 },
    outside: checkinOutside,
    inside: checkinInside,
    expectedInside: 1, // d만 — a는 기간 전에 처음 받았다
  },
  checkin_category_count: {
    condition: { checkin_category_count: { category: 'train_subway', count: 1 } },
    outside: checkinOutside,
    inside: checkinInside,
    expectedInside: 1,
  },
  checkin_badge_count: {
    condition: { checkin_badge_count: { checkin_badge_names: ['왕십리역', '성수역', '건대입구역', '서울숲역'], count: 1 } },
    outside: checkinOutside,
    inside: checkinInside,
    expectedInside: 1,
  },
  // ── 미션 전용 DB 키 ──
  jam_period_earned: {
    condition: { jam_period_earned: 10 },
    // 시작 전·참가 전·종료 뒤 활동의 잼이 모두 기간 안에(늦게) 정산됐다. 채움·운영자 지급·회수는 합계에 들지 않는다
    outside: {
      strava_activities: [
        { id: 'a-before-start', user_id: U, start_date: BEFORE_START },
        { id: 'a-before-join', user_id: U, start_date: BEFORE_JOIN },
        { id: 'a-after-end', user_id: U, start_date: AFTER_END },
      ],
      jam_transactions: [
        settlement('a-before-start', 1000),
        settlement('a-before-join', 100),
        settlement('a-after-end', 10000),
        { id: 'fill', user_id: U, amount: -4, reason: 'capsule_fill', source_activity_id: null, created_at: INSIDE },
        { id: 'grant', user_id: U, amount: 500, reason: 'admin_grant', source_activity_id: null, created_at: INSIDE },
      ],
    },
    inside: {
      strava_activities: [
        { id: 'a-before-start', user_id: U, start_date: BEFORE_START },
        { id: 'a-before-join', user_id: U, start_date: BEFORE_JOIN },
        { id: 'a-after-end', user_id: U, start_date: AFTER_END },
        { id: 'a-inside', user_id: U, start_date: INSIDE },
      ],
      jam_transactions: [
        settlement('a-before-start', 1000),
        settlement('a-before-join', 100),
        settlement('a-after-end', 10000),
        settlement('a-inside', 10),
        { id: 'fill', user_id: U, amount: -4, reason: 'capsule_fill', source_activity_id: null, created_at: INSIDE },
        { id: 'grant', user_id: U, amount: 500, reason: 'admin_grant', source_activity_id: null, created_at: INSIDE },
      ],
    },
    expectedInside: 10,
  },
}

const KEYS = Object.keys(CASES) as MissionDbConditionKey[]

/** 조건의 기준 값이 아니라 키 하나를 읽는다 — 값은 로더가, 충족 여부는 판정 함수가 정한다 */
async function loadFor(key: MissionDbConditionKey, tables: Tables) {
  const db = makeFakeDb(tables)
  const metrics = await loadMissionDbMetrics(db.client, U, CASES[key].condition, WINDOW)
  return { metrics, value: metrics[key], db }
}

describe('DB 기록 조건 20개 키 — 사례 목록', () => {
  it('사례가 MISSION_DB_CONDITION_KEY_LIST 20개를 빠짐없이, 겹치지 않게 덮는다', () => {
    expect(KEYS).toHaveLength(20)
    expect([...KEYS].sort()).toEqual([...MISSION_DB_CONDITION_KEY_LIST].sort())
  })

  it('사례의 조건은 키 하나만 든다 (다른 키가 값을 가리지 않는다)', () => {
    for (const key of KEYS) expect(Object.keys(CASES[key].condition), key).toEqual([key])
  })
})

describe.each(KEYS)('%s', (key) => {
  const spec = CASES[key]

  it('A. 참가 전·기간 밖 기록만 있으면 0이고, 그 값으로는 조건을 충족하지 못한다', async () => {
    const { metrics, value } = await loadFor(key, spec.outside)
    expect(value).toBe(0)
    expect(evaluateEngineMissionCondition(spec.condition, [], metrics)).toBe(false)
  })

  it('B. 기간 안 기록이 더해지면 그 기록만 세고, 그 값으로는 조건을 충족한다', async () => {
    const { metrics, value } = await loadFor(key, spec.inside)
    expect(value).toBe(spec.expectedInside)
    expect(evaluateEngineMissionCondition(spec.condition, [], metrics)).toBe(true)
  })

  it('C. 기록이 하나도 없는 DB도 0이다 (읽기 오류를 0으로 바꾼 것이 아니라 센 값이 0)', async () => {
    const { value } = await loadFor(key, SIGNUP)
    expect(value).toBe(0)
  })
})

describe('DB 기록 조건 — 참가 시각과 미션 시작의 하한', () => {
  it('시작 전에 참가했으면 하한은 미션 시작이다 — 시작 전 기록(참가 뒤)은 세지 않고, 시작 뒤 기록은 센다', async () => {
    // 참가 10-05, 시작 10-10: 하한 10-10. BEFORE_START(10-08)는 참가 뒤지만 시작 전이다
    const earlyJoin = { joinedAt: '2026-10-05T00:00:00.000Z', startsAt: WINDOW.startsAt, endsAt: WINDOW.endsAt }
    const db = makeFakeDb({ capsule_opens: [{ id: 'x1', user_id: U, opened_at: BEFORE_START }, { id: 'x2', user_id: U, opened_at: BEFORE_JOIN }] })
    const metrics = await loadMissionDbMetrics(db.client, U, { capsule_open_count: 1 }, earlyJoin)
    expect(metrics.capsule_open_count).toBe(1) // BEFORE_JOIN(10-12)만 — 이 하한에서는 참가 전이 아니다
  })

  it('다른 유저의 기록은 어떤 키에서도 세지 않는다', async () => {
    const db = makeFakeDb({
      capsule_opens: [{ id: 'x', user_id: OTHER, opened_at: INSIDE }],
      user_combine_success_logs: [successLog('y', INSIDE, { user_id: OTHER })],
      user_mission_completions: [{ id: 'z', user_id: OTHER, mission_id: 'm', completed_at: INSIDE }],
    })
    const metrics = await loadMissionDbMetrics(
      db.client,
      U,
      { capsule_open_count: 1, combine_success_count: 1, mission_complete_count: 1 },
      WINDOW
    )
    expect(metrics).toEqual({ capsule_open_count: 0, combine_success_count: 0, mission_complete_count: 0 })
  })
})
