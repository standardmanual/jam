/**
 * strava/sync — 보류가 있는 동안 동기화는 막힌다 (티켓 20261017_1425, 운영 로직 6.4절)
 *
 * 고정하는 것:
 * - 고르지 않은 보류(`sync_pending_items`의 pending)가 있으면 Strava 조회·잠금·정산 없이 `SyncPendingItemsError`(보류 개수 포함)를 던진다.
 * - 보류 개수를 읽지 못하면 «보류 없음»으로 보지 않고 던져 동기화하지 않는다(새 보류가 쌓이면 한 번의 고르기가 그것까지 닫아 버린다).
 * - 보류 확인은 대기 중(status pending)인 이 유저의 행만 센다.
 *
 * 실제 Strava·공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/sync-pending-block.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { createServiceClientMock, getAllActivitiesMock, refreshMock } = vi.hoisted(() => ({
  createServiceClientMock: vi.fn(),
  getAllActivitiesMock: vi.fn(),
  refreshMock: vi.fn(),
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

import { syncStravaActivities } from '../sync'
import { SyncPendingItemsError } from '../pending-items'

const USER_ID = 'user-pending-block'

interface FakeRecord {
  connectionUpdates: unknown[]
  pendingQueries: { head?: boolean; count?: string; eqs: Record<string, unknown> }[]
}

function makeFake(pending: { count: number | null; error?: { message: string } }): { supabase: SupabaseClient; record: FakeRecord } {
  const record: FakeRecord = { connectionUpdates: [], pendingQueries: [] }
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
    if (table === 'strava_connections') {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: connection, error: null }) }) }),
        update: (payload: unknown) => {
          record.connectionUpdates.push(payload)
          throw new Error('잠금 update가 호출됨 — 보류가 있으면 동기화를 시작하면 안 된다')
        },
      }
    }
    if (table === 'sync_pending_items') {
      return {
        select: (_cols: string, opts?: { head?: boolean; count?: string }) => {
          const query = { ...opts, eqs: {} as Record<string, unknown> }
          record.pendingQueries.push(query)
          const chain: Record<string, unknown> = {
            eq: (col: string, val: unknown) => {
              query.eqs[col] = val
              return chain
            },
            then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
              Promise.resolve({ count: pending.count, error: pending.error ?? null }).then(onFulfilled, onRejected),
          }
          return chain
        },
      }
    }
    throw new Error(`makeFake: 예상치 못한 테이블 — ${table}`)
  }
  return { supabase: { from } as unknown as SupabaseClient, record }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('syncStravaActivities — 고르지 않은 보류가 있으면 막힌다', () => {
  it('보류 개수를 담은 SyncPendingItemsError를 던지고 Strava 조회·토큰 갱신·잠금을 하지 않는다', async () => {
    const { supabase, record } = makeFake({ count: 3 })
    createServiceClientMock.mockReturnValue(supabase)

    const run = syncStravaActivities(USER_ID)

    await expect(run).rejects.toBeInstanceOf(SyncPendingItemsError)
    await expect(run).rejects.toMatchObject({ pendingCount: 3 })
    expect(getAllActivitiesMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
    expect(record.connectionUpdates).toEqual([])
  })

  it('이 유저의 대기 중(pending) 행만 센다', async () => {
    const { supabase, record } = makeFake({ count: 1 })
    createServiceClientMock.mockReturnValue(supabase)

    await expect(syncStravaActivities(USER_ID)).rejects.toBeInstanceOf(SyncPendingItemsError)

    expect(record.pendingQueries).toEqual([
      { head: true, count: 'exact', eqs: { user_id: USER_ID, status: 'pending' } },
    ])
  })

  it('보류 개수를 읽지 못하면 «보류 없음»으로 보지 않고 던져 동기화하지 않는다', async () => {
    const { supabase, record } = makeFake({ count: null, error: { message: 'db down' } })
    createServiceClientMock.mockReturnValue(supabase)

    const run = syncStravaActivities(USER_ID)

    await expect(run).rejects.toThrow('sync_pending_items 개수 조회 실패')
    await expect(run).rejects.not.toBeInstanceOf(SyncPendingItemsError)
    expect(getAllActivitiesMock).not.toHaveBeenCalled()
    expect(record.connectionUpdates).toEqual([])
  })
})
