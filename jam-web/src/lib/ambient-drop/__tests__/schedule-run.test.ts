/**
 * 앰비언트 드랍 예약 실행기 (티켓 20261001_2051)
 *
 *  - 도래 전에는 아무것도 놓지 않고, 도래하면 지정한 (지점, 아이템)으로 `mint_and_place_ambient_drop`을 부른다
 *  - 실행 때 대상을 다시 판정해 걸린 것은 놓지 않고 사유를 남긴다(fail-closed)
 *  - 같은 예약은 한 번만 실행하고, 3시간을 넘기면 `missed`로 두고 놓지 않는다
 *  - 어떤 단계에서도 `ambient_drop_config`에 쓰지 않는다(읽기만)
 *
 * `batch-collection-target.test.ts`와 같은 방식으로 Supabase를 가짜로 바꾸되, 정기 배포 설정은 모킹하지 않고
 * 가짜 DB의 `ambient_drop_config` 행을 실제로 읽게 해서 「읽기만 한다」를 증명한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/ambient-drop/__tests__/schedule-run.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakeDb, uuid, type FakeDb, type Row } from './schedule-test-db'
import {
  BOOK_ENDING,
  BOOK_LATE,
  BOOK_LIVE,
  BOOK_PRELAUNCH,
  B_DELETED,
  B_LIVE,
  P1,
  P2,
  P_INACTIVE,
  badge,
  world,
} from './schedule-fixtures'

const ctx = vi.hoisted(() => ({ db: null as unknown as FakeDb }))
const logMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ctx.db.client }))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: logMock }))
vi.mock('@/lib/notifications/batch/shared', async () => (await import('./schedule-test-db')).sharedMock)
vi.mock('@/lib/jam/policy', () => ({
  getJamPolicy: async () => ({
    locked_min_common: 3,
    locked_min_rare: 5,
    locked_min_epic: 8,
    locked_min_mystic: 12,
    locked_roll_probability: 0,
  }),
}))

import { runAmbientDropSpec, runDueAmbientDropSchedules } from '../scheduleRun'
import { AMBIENT_SCHEDULE_LATE_WINDOW_MS } from '../scheduleSpec'
import type { AmbientDropScheduleSpec } from '../scheduleSpec'

/** 예정 시각(2026-10-05 09:00 KST = 00:00Z)에서 30분 지난 실행 시각 */
const RUN_AT = new Date('2026-10-05T00:30:00.000Z')
const SCHEDULED_AT = '2026-10-05T00:00:00.000Z'

const SCHEDULE_ID = uuid(900)

let db: FakeDb
/** 테스트가 시작할 때의 정기 배포 설정 행 — 실행기가 이 행을 바꾸지 않았는지 대조한다 */
let configBaseline: Row[]
const sb = () => db.client as Parameters<typeof runAmbientDropSpec>[0]

/** 테스트 준비 단계에서 설정 값을 바꾼다. 기준 행도 함께 갱신해 「실행기가 바꾸지 않았다」만 단언한다 */
function setConfig(overrides: Row): void {
  Object.assign(db.tables.ambient_drop_config[0], overrides)
  configBaseline = structuredClone(db.tables.ambient_drop_config)
}

function insertSchedule(overrides: Row = {}): Row {
  const row: Row = {
    id: SCHEDULE_ID,
    title: null,
    scheduled_at: SCHEDULED_AT,
    status: 'scheduled',
    poi_mode: 'list',
    poi_ids: [P1, P2],
    poi_category: null,
    item_mode: 'items',
    badge_ids: [B_LIVE],
    collection_ids: [],
    per_poi_count: 1,
    total_count: null,
    created_by: 'admin@example.com',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    claimed_at: null,
    finished_at: null,
    canceled_at: null,
    result: null,
    ...overrides,
  }
  db.tables.ambient_drop_schedules.push(row)
  return row
}

function scheduleRow(id = SCHEDULE_ID): Row {
  const row = db.tables.ambient_drop_schedules.find((r) => r.id === id)
  if (!row) throw new Error('예약 행이 없어요')
  return row
}

function placed(): { poi: string; badge: string }[] {
  return db.rpcCalls.map((c) => ({ poi: c.args.p_poi_id, badge: c.args.p_badge_id }))
}

/** 마지막으로 남긴 `ambient_batch_result` 로그의 페이로드 */
function lastLogged(): Record<string, unknown> {
  const calls = logMock.mock.calls
  return calls[calls.length - 1][3] as Record<string, unknown>
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(RUN_AT)
  vi.clearAllMocks()
  db = createFakeDb(world())
  configBaseline = structuredClone(db.tables.ambient_drop_config)
  ctx.db = db
})

afterEach(() => {
  // 예약 처리는 정기 배포 설정을 읽기만 한다 — 쓰기 0회, 행 그대로
  expect(db.writesTo('ambient_drop_config')).toEqual([])
  expect(db.tables.ambient_drop_config).toEqual(configBaseline)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('runDueAmbientDropSchedules — 도래 전후', () => {
  it('예정 시각 전에는 RPC를 한 번도 부르지 않고 예약은 scheduled로 남는다', async () => {
    insertSchedule({ scheduled_at: '2026-10-05T01:00:00.000Z' }) // 실행 시각보다 30분 뒤
    const summary = await runDueAmbientDropSchedules(RUN_AT)
    expect(summary).toEqual({ due: 0, done: 0, skipped: 0, failed: 0, missed: 0 })
    expect(db.rpcCalls).toHaveLength(0)
    expect(scheduleRow().status).toBe('scheduled')
  })

  it('도래하면 지정한 (지점, 아이템)으로 mint_and_place_ambient_drop을 부르고 done으로 끝낸다', async () => {
    insertSchedule()
    const summary = await runDueAmbientDropSchedules(RUN_AT)
    expect(summary).toEqual({ due: 1, done: 1, skipped: 0, failed: 0, missed: 0 })
    expect(placed()).toEqual([
      { poi: P1, badge: B_LIVE },
      { poi: P2, badge: B_LIVE },
    ])
    expect(db.rpcCalls.every((c) => c.name === 'mint_and_place_ambient_drop')).toBe(true)
    expect(scheduleRow()).toMatchObject({
      status: 'done',
      claimed_at: RUN_AT.toISOString(),
      finished_at: RUN_AT.toISOString(),
      result: { requested: 2, spawned: 2, failed: 0, reason: null, error: null, dropIds: ['drop-1', 'drop-2'] },
    })
  })

  it('지점 직접 × 컬렉션 — 그 컬렉션의 노출 중 아이템을 지정한 지점에 놓는다', async () => {
    db.tables.badges.push(badge(uuid(41), BOOK_LIVE))
    insertSchedule({ item_mode: 'collections', badge_ids: [], collection_ids: [BOOK_LIVE], poi_ids: [P1], per_poi_count: 3 })
    await runDueAmbientDropSchedules(RUN_AT)
    expect(placed()).toHaveLength(3)
    expect(placed().every((p) => p.poi === P1)).toBe(true)
    // BOOK_LIVE의 노출 중 아이템(삭제된 B_DELETED 제외)에서만 고른다
    expect(placed().every((p) => [B_LIVE, uuid(41)].includes(p.badge))).toBe(true)
    expect(scheduleRow().status).toBe('done')
  })

  it('종류+개수 × 아이템 — 활성 드랍이 0인 지점에 지점당 한도(읽기 전용 설정)로 흩어 놓는다', async () => {
    // P1에는 이미 활성 시스템 드랍이 1개, 설정 한도는 1 → P1은 후보가 아니라 P2에만 놓인다
    insertSchedule({ poi_mode: 'category', poi_ids: [], poi_category: 'cafe', per_poi_count: null, total_count: 3 })
    await runDueAmbientDropSchedules(RUN_AT)
    expect(placed()).toEqual([{ poi: P2, badge: B_LIVE }]) // 자리가 모자라 있는 만큼만
    expect(scheduleRow()).toMatchObject({ status: 'done', result: { requested: 3, spawned: 1 } })
  })

  it('종류+개수 × 컬렉션 — 설정의 등급 분포(읽기 전용)로 추첨한다', async () => {
    db.tables.badges.push(badge(uuid(42), BOOK_LIVE, { rarity: 'rare' }))
    setConfig({ rarity_common: 0, rarity_rare: 1, max_active_per_poi: 5 })
    insertSchedule({
      poi_mode: 'category',
      poi_ids: [],
      poi_category: 'cafe',
      item_mode: 'collections',
      badge_ids: [],
      collection_ids: [BOOK_LIVE],
      per_poi_count: null,
      total_count: 4,
    })
    await runDueAmbientDropSchedules(RUN_AT)
    expect(placed()).toHaveLength(4)
    expect(placed().every((p) => p.badge === uuid(42))).toBe(true)
  })

  it('종류+개수 × 컬렉션 — all_random이 켜져 있어도 설정의 등급 분포를 따른다 (티켓 20261018_1813)', async () => {
    db.tables.badges.push(badge(uuid(42), BOOK_LIVE, { rarity: 'rare' }))
    setConfig({ all_random: true, rarity_common: 0, rarity_rare: 1, max_active_per_poi: 5 })
    insertSchedule({
      poi_mode: 'category',
      poi_ids: [],
      poi_category: 'cafe',
      item_mode: 'collections',
      badge_ids: [],
      collection_ids: [BOOK_LIVE],
      per_poi_count: null,
      total_count: 4,
    })
    await runDueAmbientDropSchedules(RUN_AT)
    expect(placed()).toHaveLength(4)
    expect(placed().every((p) => p.badge === uuid(42))).toBe(true)
  })

  it('행사 지정 — 잠김으로 만든 배지는 잠긴 채 놓고 필요한 양을 고정한다 (티켓 20261018_1813)', async () => {
    const lockedId = uuid(43)
    db.tables.badges.push(badge(lockedId, BOOK_LIVE, { always_locked: true, unlock_required: 6 }))
    insertSchedule({ badge_ids: [B_LIVE, lockedId], poi_ids: [P1, P2], per_poi_count: 1 })
    const summary = await runDueAmbientDropSchedules(RUN_AT)
    expect(summary.done).toBe(1)
    const byBadge = Object.fromEntries(db.rpcCalls.map((c) => [c.args.p_badge_id, c]))
    expect(byBadge[B_LIVE].name).toBe('mint_and_place_ambient_drop')
    expect(byBadge[lockedId]).toEqual({
      name: 'mint_and_place_ambient_drop_locked',
      args: { p_poi_id: expect.any(String), p_badge_id: lockedId, p_lock_reason: 'badge_locked', p_unlock_required: 6 },
    })
  })

  it('지점 직접은 활성 드랍이 있어도 지정 개수만큼 놓고 겹친 지점 수를 결과에 남긴다', async () => {
    // P1에는 활성 시스템 드랍이 이미 있고 설정 한도는 1이지만 지점 직접은 한도를 쓰지 않는다
    insertSchedule({ poi_ids: [P1], per_poi_count: 3 })
    await runDueAmbientDropSchedules(RUN_AT)
    expect(placed()).toHaveLength(3)
    expect(scheduleRow().result).toMatchObject({ requested: 3, spawned: 3, overlappedPoiCount: 1 })
  })

  it('같은 예약은 한 번만 실행한다 — 다시 불러도 놓지 않고, 동시에 불러도 한 번이다', async () => {
    insertSchedule()
    await Promise.all([
      runDueAmbientDropSchedules(RUN_AT),
      runDueAmbientDropSchedules(RUN_AT),
      runDueAmbientDropSchedules(RUN_AT),
    ])
    expect(db.rpcCalls).toHaveLength(2) // 지점 2곳 × 1개, 한 번의 실행분
    await runDueAmbientDropSchedules(RUN_AT)
    expect(db.rpcCalls).toHaveLength(2)
    expect(scheduleRow().status).toBe('done')
  })

  it('실패한 예약은 재시도하지 않는다', async () => {
    db.rpcResult = () => ({ data: null, error: { message: 'boom' } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    insertSchedule()
    await runDueAmbientDropSchedules(RUN_AT)
    expect(scheduleRow().status).toBe('failed')
    const callsAfterFirst = db.rpcCalls.length
    await runDueAmbientDropSchedules(RUN_AT)
    expect(db.rpcCalls).toHaveLength(callsAfterFirst)
  })
})

describe('runDueAmbientDropSchedules — 실행 때 다시 판정 (fail-closed)', () => {
  it('삭제된 아이템은 놓지 않고 excluded에 사유를 남기며 나머지는 놓는다', async () => {
    insertSchedule({ badge_ids: [B_LIVE, B_DELETED], poi_ids: [P1] })
    await runDueAmbientDropSchedules(RUN_AT)
    expect(placed()).toEqual([{ poi: P1, badge: B_LIVE }])
    expect(scheduleRow().result).toMatchObject({
      excluded: { badges: [{ id: B_DELETED, reason: 'badge_deleted' }], pois: [], collections: [] },
    })
  })

  it('비활성 지점은 놓지 않고 사유를 남긴다', async () => {
    insertSchedule({ poi_ids: [P1, P_INACTIVE] })
    await runDueAmbientDropSchedules(RUN_AT)
    expect(placed()).toEqual([{ poi: P1, badge: B_LIVE }])
    expect(scheduleRow().result).toMatchObject({ excluded: { pois: [{ id: P_INACTIVE, reason: 'poi_inactive' }] } })
  })

  it('실행 시각에 공개 전이거나 기간이 끝난 컬렉션은 빼고, 노출 중인 컬렉션에만 놓는다', async () => {
    insertSchedule({
      item_mode: 'collections',
      badge_ids: [],
      collection_ids: [BOOK_LIVE, BOOK_LATE, BOOK_ENDING],
      poi_ids: [P1],
    })
    await runDueAmbientDropSchedules(RUN_AT)
    expect(placed().map((p) => p.badge)).toEqual([B_LIVE])
    expect(scheduleRow().result).toMatchObject({
      excluded: {
        collections: [
          { id: BOOK_LATE, reason: 'collection_not_exposed' },
          { id: BOOK_ENDING, reason: 'collection_not_exposed' },
        ],
      },
    })
    expect(lastLogged()).toMatchObject({ excludedCollectionIds: [BOOK_LATE, BOOK_ENDING] })
  })

  it('실행 시각에 유효기간이 끝난 아이템은 놓지 않는다 (등록 때는 통과했어도)', async () => {
    db.tables.badges.push(badge(uuid(43), BOOK_LIVE, { valid_until: '2026-10-05T00:10:00+00:00' }))
    insertSchedule({ badge_ids: [B_LIVE, uuid(43)], poi_ids: [P1] })
    await runDueAmbientDropSchedules(RUN_AT)
    expect(placed()).toEqual([{ poi: P1, badge: B_LIVE }])
    expect(scheduleRow().result).toMatchObject({ excluded: { badges: [{ id: uuid(43), reason: 'badge_expired' }] } })
  })

  it('대상이 모두 걸러지면 skipped이고 RPC를 한 번도 부르지 않는다', async () => {
    insertSchedule({ badge_ids: [B_DELETED], poi_ids: [P1] })
    const summary = await runDueAmbientDropSchedules(RUN_AT)
    expect(summary).toMatchObject({ due: 1, skipped: 1, done: 0, failed: 0 })
    expect(db.rpcCalls).toHaveLength(0)
    expect(scheduleRow()).toMatchObject({ status: 'skipped', result: { reason: 'no_candidate_badges', spawned: 0 } })
    expect(lastLogged()).toMatchObject({ reason: 'no_candidate_badges', spawned: 0 })
  })

  it('모든 컬렉션이 노출 중이 아니면 no_eligible_collection으로 skipped다', async () => {
    insertSchedule({ item_mode: 'collections', badge_ids: [], collection_ids: [BOOK_LATE, BOOK_ENDING] })
    await runDueAmbientDropSchedules(RUN_AT)
    expect(db.rpcCalls).toHaveLength(0)
    expect(scheduleRow()).toMatchObject({ status: 'skipped', result: { reason: 'no_eligible_collection' } })
  })

  it('종류+개수에서 모든 지점이 한도에 찼으면 no_eligible_poi로 skipped다', async () => {
    db.tables.poi_drops.push({ id: 'drop-existing-2', poi_id: P2, source: 'system', is_available: true })
    insertSchedule({ poi_mode: 'category', poi_ids: [], poi_category: 'cafe', per_poi_count: null, total_count: 2 })
    await runDueAmbientDropSchedules(RUN_AT)
    expect(db.rpcCalls).toHaveLength(0)
    expect(scheduleRow()).toMatchObject({ status: 'skipped', result: { reason: 'no_eligible_poi' } })
  })

  it('대상 조회가 실패하면 놓지 않고 failed로 기록한다 (던지지 않는다)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.failReads.add('poi')
    insertSchedule()
    const summary = await runDueAmbientDropSchedules(RUN_AT)
    expect(summary).toMatchObject({ due: 1, failed: 1 })
    expect(db.rpcCalls).toHaveLength(0)
    expect(scheduleRow()).toMatchObject({ status: 'failed' })
    expect((scheduleRow().result as { error: string }).error).toContain('대상 조회 실패')
  })
})

describe('runDueAmbientDropSchedules — RPC 결과별 상태', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('일부 RPC가 실패하면 done이고 실패 수를 남긴다', async () => {
    db.rpcResult = (_call, i) =>
      i === 0 ? { data: null, error: { message: 'boom' } } : { data: { ok: true, drop_id: `d-${i}`, inventory_item_id: `i-${i}` }, error: null }
    insertSchedule()
    const summary = await runDueAmbientDropSchedules(RUN_AT)
    expect(summary).toMatchObject({ due: 1, done: 1, failed: 0 })
    expect(scheduleRow()).toMatchObject({ status: 'done', result: { requested: 2, spawned: 1, failed: 1, dropIds: ['d-1'] } })
  })

  it('전부 실패하면 failed + insert_failed다', async () => {
    db.rpcResult = () => ({ data: { ok: false }, error: null })
    insertSchedule()
    const summary = await runDueAmbientDropSchedules(RUN_AT)
    expect(summary).toMatchObject({ due: 1, failed: 1, done: 0 })
    expect(scheduleRow()).toMatchObject({ status: 'failed', result: { reason: 'insert_failed', spawned: 0, failed: 2 } })
    expect(logMock).toHaveBeenCalledWith('drop', 'ambient_batch_result', null, expect.objectContaining({ error: '개체 선발급+배치 전부 실패' }))
  })
})

describe('runDueAmbientDropSchedules — 3시간 놓침', () => {
  it('3시간을 넘긴 예약은 missed로 표시하고 놓지 않는다', async () => {
    insertSchedule({ scheduled_at: new Date(RUN_AT.getTime() - AMBIENT_SCHEDULE_LATE_WINDOW_MS - 1).toISOString() })
    const summary = await runDueAmbientDropSchedules(RUN_AT)
    expect(summary).toEqual({ due: 0, done: 0, skipped: 0, failed: 0, missed: 1 })
    expect(db.rpcCalls).toHaveLength(0)
    expect(scheduleRow()).toMatchObject({ status: 'missed', result: { reason: 'missed' } })
  })

  it('정확히 3시간째까지는 아직 실행한다', async () => {
    insertSchedule({ scheduled_at: new Date(RUN_AT.getTime() - AMBIENT_SCHEDULE_LATE_WINDOW_MS).toISOString() })
    const summary = await runDueAmbientDropSchedules(RUN_AT)
    expect(summary).toMatchObject({ due: 1, done: 1, missed: 0 })
  })

  it('놓친 표시가 실패해도 도래한 예약은 실행한다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    insertSchedule({ id: uuid(901), scheduled_at: new Date(RUN_AT.getTime() - AMBIENT_SCHEDULE_LATE_WINDOW_MS - 1).toISOString() })
    insertSchedule({ id: uuid(902) })
    // 놓친 표시(첫 갱신)만 실패하고 이후 쓰기는 정상이다
    let failedOnce = false
    db.beforeExecute = (call) => {
      if (call.table !== 'ambient_drop_schedules') return
      if (!failedOnce && call.op === 'update') {
        failedOnce = true
        db.failWrites.add('ambient_drop_schedules')
      } else {
        db.failWrites.delete('ambient_drop_schedules')
      }
    }
    const summary = await runDueAmbientDropSchedules(RUN_AT)
    expect(summary).toMatchObject({ done: 1, missed: 0 })
    expect(scheduleRow(uuid(902)).status).toBe('done')
  })
})

describe('runDueAmbientDropSchedules — 격리와 예산', () => {
  it('한 예약이 던져도 다음 예약은 실행한다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // 행이 DB CHECK를 어긴 상태(지점 직접인데 지점당 개수 없음) — 읽는 단계에서 던진다
    insertSchedule({ id: uuid(901), scheduled_at: '2026-10-05T00:00:00.000Z', per_poi_count: null })
    insertSchedule({ id: uuid(902), scheduled_at: '2026-10-05T00:10:00.000Z' })
    const summary = await runDueAmbientDropSchedules(RUN_AT)
    expect(summary).toMatchObject({ due: 2, failed: 1, done: 1 })
    expect(scheduleRow(uuid(901))).toMatchObject({ status: 'failed' })
    expect((scheduleRow(uuid(901)).result as { error: string }).error).toContain('per_poi_count')
    expect(scheduleRow(uuid(902)).status).toBe('done')
  })

  it('시간 예산을 넘기면 남은 예약은 건드리지 않고 scheduled로 남긴다', async () => {
    insertSchedule({ id: uuid(901), scheduled_at: '2026-10-05T00:00:00.000Z' })
    insertSchedule({ id: uuid(902), scheduled_at: '2026-10-05T00:10:00.000Z' })
    // 첫 예약을 놓는 동안 50초가 흐른다
    db.rpcResult = (_call, i) => {
      vi.setSystemTime(new Date(Date.now() + 50_000))
      return { data: { ok: true, drop_id: `d-${i}`, inventory_item_id: `i-${i}` }, error: null }
    }
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const summary = await runDueAmbientDropSchedules(RUN_AT, 40_000)
    expect(summary).toMatchObject({ due: 1, done: 1 })
    expect(scheduleRow(uuid(901)).status).toBe('done')
    expect(scheduleRow(uuid(902))).toMatchObject({ status: 'scheduled', claimed_at: null })
  })

  it('예약을 하나도 못 쓰는 예산 0이면 아무것도 선점하지 않는다', async () => {
    insertSchedule()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const summary = await runDueAmbientDropSchedules(RUN_AT, 0)
    expect(summary.due).toBe(0)
    expect(scheduleRow().status).toBe('scheduled')
  })
})

describe('결과 로그', () => {
  it("engine_decision_log에 trigger: 'scheduled'와 scheduleId를 남긴다", async () => {
    insertSchedule()
    await runDueAmbientDropSchedules(RUN_AT)
    expect(logMock).toHaveBeenCalledTimes(1)
    expect(logMock).toHaveBeenCalledWith('drop', 'ambient_batch_result', null, expect.any(Object))
    expect(lastLogged()).toMatchObject({
      trigger: 'scheduled',
      scheduleId: SCHEDULE_ID,
      ranAt: RUN_AT.toISOString(),
      effectiveCategorySlug: null,
      effectiveCollectionIds: [BOOK_LIVE],
      eligiblePoiCount: 2,
      spawned: 2,
      requested: 2,
    })
  })

  it('종류 조건이 있으면 effectiveCategorySlug에 남는다', async () => {
    insertSchedule({ poi_mode: 'category', poi_ids: [], poi_category: 'cafe', per_poi_count: null, total_count: 1 })
    await runDueAmbientDropSchedules(RUN_AT)
    expect(lastLogged()).toMatchObject({ effectiveCategorySlug: 'cafe', trigger: 'scheduled' })
  })
})

describe('runAmbientDropSpec — 행 없이 부르는 실행기 (「지금」 1회 배포용)', () => {
  const spec: AmbientDropScheduleSpec = {
    poiMode: 'list',
    poiIds: [P1],
    perPoiCount: 2,
    itemMode: 'items',
    badgeIds: [B_LIVE],
  }

  it('예약 행 없이 바로 놓고, 예약 테이블과 정기 배포 설정에 쓰지 않는다', async () => {
    const outcome = await runAmbientDropSpec(sb(), spec, { ranAt: RUN_AT, trigger: 'manual' })
    expect(outcome).toMatchObject({ status: 'done', spawned: 2, requested: 2 })
    expect(placed()).toEqual([
      { poi: P1, badge: B_LIVE },
      { poi: P1, badge: B_LIVE },
    ])
    expect(db.calls.filter((c) => c.table === 'ambient_drop_schedules')).toEqual([])
    expect(lastLogged()).toMatchObject({ trigger: 'manual', spawned: 2 })
    expect(lastLogged()).not.toHaveProperty('scheduleId')
  })

  it('판정은 ranAt 기준이다 — 그 시각에 공개 전인 컬렉션은 놓지 않는다', async () => {
    const outcome = await runAmbientDropSpec(
      sb(),
      { poiMode: 'list', poiIds: [P1], perPoiCount: 1, itemMode: 'collections', collectionIds: [BOOK_PRELAUNCH] },
      { ranAt: new Date('2026-10-02T00:00:00.000Z'), trigger: 'manual' }
    )
    expect(outcome).toMatchObject({ status: 'skipped', reason: 'no_eligible_collection' })
    expect(db.rpcCalls).toHaveLength(0)
  })
})
