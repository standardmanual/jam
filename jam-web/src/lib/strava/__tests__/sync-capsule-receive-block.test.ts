/**
 * strava/sync — 캡슐이 가득 차고 인벤토리 빈칸이 모자라면 입구에서 막힌다 (티켓 20261105_0101, 상위 20261105_0100)
 *
 * 고정하는 것:
 * - 막히면 Strava 조회·토큰 갱신·`last_synced_at` 잠금 없이 `CapsuleInventoryBlockedError`(빈칸·필요 칸수)를 던진다.
 * - 보류 고르기 대기(`SyncPendingItemsError`)와 겹치면 이번 막힘이 먼저다(보류 개수도 읽지 않는다).
 * - 막힘 판정을 읽지 못하면 «막히지 않음»으로 보지 않고 던진다.
 * - 이용 정지가 먼저 적용된다(정지 중이면 막힘 판정을 읽지 않는다).
 * - 막히지 않으면 평소대로 보류 확인으로 이어진다.
 * - 막힘을 읽기 전에 대기 보상 자동 지급(`settleAfterSlotsFreed`)을 한 번 시도한다. 지급 뒤에 막힘을 읽으므로 풀린 유저는 막히지 않는다 (티켓 20261105_1438 R2).
 *
 * 실제 Strava·공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/sync-capsule-receive-block.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { createServiceClientMock, getAllActivitiesMock, refreshMock, readBlockedMock, assertNotSuspendedMock, countPendingMock, settleMock } = vi.hoisted(() => ({
  settleMock: vi.fn(async () => {}),
  createServiceClientMock: vi.fn(),
  getAllActivitiesMock: vi.fn(),
  refreshMock: vi.fn(),
  readBlockedMock: vi.fn(),
  assertNotSuspendedMock: vi.fn(async () => {}),
  countPendingMock: vi.fn(async () => 0),
}))

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: createServiceClientMock }))
vi.mock('@/lib/utils', () => ({
  decrypt: vi.fn(async (v: string) => v),
  encrypt: vi.fn(async (v: string) => v),
}))
vi.mock('@/lib/strava/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/strava/api')>('@/lib/strava/api')
  return { ...actual, getAllActivities: getAllActivitiesMock, refreshStravaToken: refreshMock }
})
vi.mock('@/lib/tribe/gate', () => ({ assertHasTribe: async () => {} }))
vi.mock('@/lib/suspension/suspension', async () => {
  const actual = await vi.importActual<typeof import('@/lib/suspension/suspension')>('@/lib/suspension/suspension')
  return { ...actual, assertNotSuspended: assertNotSuspendedMock }
})
vi.mock('@/lib/strava/pending-items', async () => {
  const actual = await vi.importActual<typeof import('@/lib/strava/pending-items')>('@/lib/strava/pending-items')
  return { ...actual, countPendingItems: countPendingMock }
})
vi.mock('@/lib/capsule/settle-pending', () => ({ settleAfterSlotsFreed: settleMock }))
vi.mock('@/lib/capsule/receive-block', async () => {
  const actual = await vi.importActual<typeof import('@/lib/capsule/receive-block')>('@/lib/capsule/receive-block')
  return { ...actual, readCapsuleReceiveBlocked: readBlockedMock }
})

import { syncStravaActivities } from '../sync'
import { CapsuleInventoryBlockedError } from '@/lib/capsule/receive-block'
import { SyncPendingItemsError } from '../pending-items'
import { UserSuspendedError } from '@/lib/suspension/suspension'

const USER_ID = 'user-capsule-block'

interface FakeRecord {
  connectionUpdates: unknown[]
  tablesTouched: string[]
}

function makeFake(): { supabase: SupabaseClient; record: FakeRecord } {
  const record: FakeRecord = { connectionUpdates: [], tablesTouched: [] }
  const connection = {
    id: 'conn-1',
    user_id: USER_ID,
    strava_athlete_id: 1,
    access_token: 'enc-access',
    refresh_token: 'enc-refresh',
    token_expires_at: '2099-01-01T00:00:00.000Z',
    last_synced_at: null,
    backfill_completed: true,
    first_sync_pending: false,
    disconnected_at: null,
    disconnect_reason: null,
  }
  const from = (table: string) => {
    record.tablesTouched.push(table)
    if (table === 'strava_connections') {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: connection, error: null }) }) }),
        update: (payload: unknown) => {
          record.connectionUpdates.push(payload)
          throw new Error('잠금 update가 호출됨 — 막혔으면 동기화를 시작하면 안 된다')
        },
      }
    }
    throw new Error(`makeFake: 예상치 못한 테이블 — ${table}`)
  }
  return { supabase: { from } as unknown as SupabaseClient, record }
}

beforeEach(() => {
  vi.clearAllMocks()
  assertNotSuspendedMock.mockImplementation(async () => {})
  countPendingMock.mockImplementation(async () => 0)
  settleMock.mockImplementation(async () => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('syncStravaActivities — 캡슐이 가득 차고 빈칸이 모자라면 막힌다', () => {
  it('빈칸·필요 칸수를 담은 CapsuleInventoryBlockedError를 던지고 Strava 조회·토큰 갱신·잠금을 하지 않는다', async () => {
    const { supabase, record } = makeFake()
    createServiceClientMock.mockReturnValue(supabase)
    readBlockedMock.mockResolvedValue({ blocked: true, free: 1, needed: 2 })

    const run = syncStravaActivities(USER_ID)

    await expect(run).rejects.toBeInstanceOf(CapsuleInventoryBlockedError)
    await expect(run).rejects.toMatchObject({ free: 1, needed: 2 })
    expect(readBlockedMock).toHaveBeenCalledWith(supabase, USER_ID)
    expect(getAllActivitiesMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
    expect(record.connectionUpdates).toEqual([])
    expect(record.tablesTouched).toEqual(['strava_connections'])
  })

  it('막힘을 읽기 전에 대기 보상 자동 지급을 시도하고, 지급 뒤의 판정으로 막힘을 정한다', async () => {
    const { supabase } = makeFake()
    createServiceClientMock.mockReturnValue(supabase)
    readBlockedMock.mockResolvedValue({ blocked: true, free: 1, needed: 2 })

    await expect(syncStravaActivities(USER_ID)).rejects.toBeInstanceOf(CapsuleInventoryBlockedError)

    expect(settleMock).toHaveBeenCalledTimes(1)
    expect(settleMock).toHaveBeenCalledWith(supabase, USER_ID)
    expect(settleMock.mock.invocationCallOrder[0]).toBeLessThan(readBlockedMock.mock.invocationCallOrder[0])
  })

  it('지급으로 풀렸으면(지급 뒤 판정이 막히지 않음) 막지 않고 보류 확인으로 이어진다', async () => {
    const { supabase } = makeFake()
    createServiceClientMock.mockReturnValue(supabase)
    settleMock.mockImplementation(async () => {
      readBlockedMock.mockResolvedValue({ blocked: false, free: 3, needed: 0 })
    })
    readBlockedMock.mockResolvedValue({ blocked: true, free: 2, needed: 2 })
    countPendingMock.mockResolvedValue(1)

    await expect(syncStravaActivities(USER_ID)).rejects.toBeInstanceOf(SyncPendingItemsError)
  })

  it('보류 고르기 대기와 겹치면 이번 막힘이 먼저다(보류 개수를 읽지 않는다)', async () => {
    const { supabase } = makeFake()
    createServiceClientMock.mockReturnValue(supabase)
    readBlockedMock.mockResolvedValue({ blocked: true, free: 0, needed: 2 })
    countPendingMock.mockResolvedValue(3)

    const run = syncStravaActivities(USER_ID)

    await expect(run).rejects.toBeInstanceOf(CapsuleInventoryBlockedError)
    await expect(run).rejects.not.toBeInstanceOf(SyncPendingItemsError)
    expect(countPendingMock).not.toHaveBeenCalled()
  })

  it('막히지 않으면 보류 확인으로 이어진다', async () => {
    const { supabase } = makeFake()
    createServiceClientMock.mockReturnValue(supabase)
    readBlockedMock.mockResolvedValue({ blocked: false, free: 5, needed: 2 })
    countPendingMock.mockResolvedValue(1)

    await expect(syncStravaActivities(USER_ID)).rejects.toBeInstanceOf(SyncPendingItemsError)
    expect(countPendingMock).toHaveBeenCalledTimes(1)
  })

  it('막힘 판정을 읽지 못하면 «막히지 않음»으로 보지 않고 던져 동기화하지 않는다', async () => {
    const { supabase, record } = makeFake()
    createServiceClientMock.mockReturnValue(supabase)
    readBlockedMock.mockRejectedValue(new Error('capsule_receive_blocked 호출 실패: db down'))

    const run = syncStravaActivities(USER_ID)

    await expect(run).rejects.toThrow('capsule_receive_blocked 호출 실패')
    await expect(run).rejects.not.toBeInstanceOf(CapsuleInventoryBlockedError)
    expect(getAllActivitiesMock).not.toHaveBeenCalled()
    expect(record.connectionUpdates).toEqual([])
  })

  it('이용 정지가 먼저 적용된다(정지 중이면 막힘 판정을 읽지 않는다)', async () => {
    const { supabase } = makeFake()
    createServiceClientMock.mockReturnValue(supabase)
    assertNotSuspendedMock.mockRejectedValue(new UserSuspendedError({ reason: '', suspendedAt: '2026-10-10T00:00:00.000Z' }))
    readBlockedMock.mockResolvedValue({ blocked: true, free: 0, needed: 2 })

    await expect(syncStravaActivities(USER_ID)).rejects.toBeInstanceOf(UserSuspendedError)
    expect(readBlockedMock).not.toHaveBeenCalled()
  })
})
