/**
 * 미션 기록 읽기 (티켓 20261019_1313 3회, 운영 로직 13.2절 «소식과 기록»)
 *
 * 참가·완료·받은 보상·받지 않은 보상·참가 취소를 한 번에 읽는지, 읽기 전용인지, 읽지 못하면 «기록 없음»으로 보지 않고 던지는지 본다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/missions/records.test.ts
 */
import { beforeEach, afterEach, describe, expect, it, vi, type MockInstance } from 'vitest'

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  errors: {} as Record<string, { message: string }>,
  calls: [] as { table: string; method: string; args: unknown[] }[],
}))

/** 어떤 필터 체인이든 받고 호출을 기록한다. 끝(await·`.maybeSingle()`)에서 테이블 행을 돌려준다. */
function makeBuilder(table: string): unknown {
  const rows = state.tables[table] ?? []
  const error = state.errors[table] ?? null
  return new Proxy(
    {},
    {
      get(_target, method) {
        if (typeof method !== 'string') return undefined
        if (method === 'then') return (resolve: (value: unknown) => unknown) => resolve({ data: error ? null : rows, error })
        if (method === 'maybeSingle') return () => Promise.resolve({ data: error ? null : (rows[0] ?? null), error })
        return (...args: unknown[]) => {
          state.calls.push({ table, method, args })
          return makeBuilder(table)
        }
      },
    }
  )
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: (table: string) => makeBuilder(table) }),
}))

import { loadMissionRecords, MissionRecordsReadError } from './records'

const B1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const B3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

describe('loadMissionRecords', () => {
  let errorSpy: MockInstance

  beforeEach(() => {
    state.tables = {
      user_mission_participations: [{ joined_at: '2026-10-01T00:00:00Z', progress_value: 42 }],
      user_mission_completions: [{ completed_at: '2026-10-10T00:00:00Z' }],
      mission_item_rewards: [
        { badge_id: B1, locked: false, status: 'claimed', created_at: '2026-10-10T00:00:00Z', resolved_at: '2026-10-10T00:00:00Z', inventory_item_id: 'item-1' },
        { badge_id: B2, locked: true, status: 'pending', created_at: '2026-10-10T00:00:01Z', resolved_at: null, inventory_item_id: null },
        { badge_id: B3, locked: false, status: 'pending', created_at: '2026-10-10T00:00:02Z', resolved_at: null, inventory_item_id: null },
      ],
      mission_participation_cancellations: [
        { cancelled_at: '2026-10-15T00:00:00Z', joined_at: '2026-10-12T00:00:00Z', progress_value: 3, was_completed: false, reason: 'tribe_changed' },
        { cancelled_at: '2026-10-11T00:00:00Z', joined_at: '2026-10-01T00:00:00Z', progress_value: 42, was_completed: true, reason: 'tribe_changed' },
      ],
    }
    state.errors = {}
    state.calls = []
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('참가·완료·받은 보상·받지 않은 보상·참가 취소를 한 번에 돌려준다', async () => {
    const records = await loadMissionRecords('user-1', 'm1')

    expect(records.participation).toEqual({ joinedAt: '2026-10-01T00:00:00Z', progressValue: 42 })
    expect(records.completion).toEqual({ completedAt: '2026-10-10T00:00:00Z' })
    expect(records.receivedRewards).toEqual([
      { badgeId: B1, locked: false, recordedAt: '2026-10-10T00:00:00Z', receivedAt: '2026-10-10T00:00:00Z', inventoryItemId: 'item-1' },
    ])
    expect(records.pendingRewards).toEqual([
      { badgeId: B2, locked: true, recordedAt: '2026-10-10T00:00:01Z', receivedAt: null, inventoryItemId: null },
      { badgeId: B3, locked: false, recordedAt: '2026-10-10T00:00:02Z', receivedAt: null, inventoryItemId: null },
    ])
    expect(records.cancellations).toEqual([
      { cancelledAt: '2026-10-15T00:00:00Z', joinedAt: '2026-10-12T00:00:00Z', progressValue: 3, wasCompleted: false, reason: 'tribe_changed' },
      { cancelledAt: '2026-10-11T00:00:00Z', joinedAt: '2026-10-01T00:00:00Z', progressValue: 42, wasCompleted: true, reason: 'tribe_changed' },
    ])
  })

  it('받은 보상과 받지 않은 보상을 상태로 가른다 — 모르는 상태는 어느 쪽에도 넣지 않는다', async () => {
    state.tables.mission_item_rewards = [
      { badge_id: B1, locked: false, status: 'claimed', created_at: 't1', resolved_at: 't1', inventory_item_id: 'i1' },
      { badge_id: B2, locked: false, status: 'pending', created_at: 't2', resolved_at: null, inventory_item_id: null },
      { badge_id: B3, locked: false, status: 'expired', created_at: 't3', resolved_at: null, inventory_item_id: null },
    ]

    const records = await loadMissionRecords('user-1', 'm1')

    expect(records.receivedRewards.map((reward) => reward.badgeId)).toEqual([B1])
    expect(records.pendingRewards.map((reward) => reward.badgeId)).toEqual([B2])
  })

  it('기록이 하나도 없으면 null과 빈 배열이다', async () => {
    state.tables = {}

    const records = await loadMissionRecords('user-1', 'm1')

    expect(records).toEqual({
      participation: null,
      completion: null,
      receivedRewards: [],
      pendingRewards: [],
      cancellations: [],
    })
  })

  it('참가 취소로 참가 행이 없어도 취소 기록은 남아 있다', async () => {
    state.tables.user_mission_participations = []

    const records = await loadMissionRecords('user-1', 'm1')

    expect(records.participation).toBeNull()
    expect(records.cancellations).toHaveLength(2)
  })

  it('다섯 가지 기록 모두 이 유저의 이 미션으로만 거른다', async () => {
    await loadMissionRecords('user-1', 'm1')

    for (const table of ['user_mission_participations', 'user_mission_completions', 'mission_item_rewards', 'mission_participation_cancellations']) {
      const filters = state.calls.filter((call) => call.table === table && call.method === 'eq').map((call) => call.args)
      expect(filters, table).toEqual(expect.arrayContaining([['user_id', 'user-1'], ['mission_id', 'm1']]))
    }
  })

  it('읽기 전용이다 — 쓰기 호출이 하나도 없다', async () => {
    await loadMissionRecords('user-1', 'm1')

    const writes = state.calls.filter((call) => ['insert', 'update', 'upsert', 'delete', 'rpc'].includes(call.method))
    expect(writes).toEqual([])
  })

  it('가장 최근 참가 취소가 앞이고, 보상은 기록한 순서다 — 조회 정렬을 요청한다', async () => {
    await loadMissionRecords('user-1', 'm1')

    const orders = state.calls.filter((call) => call.method === 'order')
    expect(orders).toContainEqual({ table: 'mission_participation_cancellations', method: 'order', args: ['cancelled_at', { ascending: false }] })
    expect(orders).toContainEqual({ table: 'mission_item_rewards', method: 'order', args: ['created_at', { ascending: true }] })
  })

  it.each([
    'user_mission_participations',
    'user_mission_completions',
    'mission_item_rewards',
    'mission_participation_cancellations',
  ])('%s를 읽지 못하면 «기록 없음»으로 보지 않고 던진다 — DB 원문은 오류 메시지에 싣지 않는다', async (table) => {
    state.errors[table] = { message: 'db-internal-host timeout' }

    const error = await loadMissionRecords('user-1', 'm1').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(MissionRecordsReadError)
    expect((error as Error).message).toBe('mission_records_read_failed')
    expect((error as Error).message).not.toContain('db-internal-host')
    expect(errorSpy).toHaveBeenCalled()
  })
})
