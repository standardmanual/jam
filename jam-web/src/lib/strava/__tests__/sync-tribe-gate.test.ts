/**
 * strava/sync — 트라이브를 고르지 않은 유저는 동기화할 수 없다 (티켓 20261021_1247 1회, 운영 로직 2장)
 *
 * 고정하는 것:
 * - 트라이브가 없으면 Strava 연결 조회·Strava 조회·토큰 갱신·잠금 없이 `TribeRequiredError`를 던진다.
 *   연결이 아예 없는 유저도 «연동 정보 없음» 일반 오류가 아니라 트라이브 게이트로 막힌다(트라이브 검사가 연결 조회보다 앞이다).
 * - 트라이브를 읽지 못하면 «있음»으로 보지 않고 던져 동기화하지 않는다. 그 오류는 `TribeRequiredError`가 아닌 일반 오류다.
 * - 트라이브가 있으면 기존 흐름으로 넘어간다(여기서는 다음 관문인 이용 정지 검사까지 닿는 것으로 확인한다).
 * - 트라이브 확인은 이 유저의 `users.tribe_id` 한 칸만 읽는다.
 *
 * 실제 Strava·공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/sync-tribe-gate.test.ts
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
import { TribeRequiredError } from '@/lib/tribe/gate'
import { UserSuspendedError } from '@/lib/suspension/suspension'

const USER_ID = 'user-tribe-gate-sync'
const TRIBE_ID = '3f2b7c1e-0000-4000-8000-000000000001'

type TribeResult = { data: { tribe_id: string | null } | null; error: { message: string } | null }

interface FakeRecord {
  tables: string[]
  userSelects: { columns: string; eqs: Record<string, unknown> }[]
  connectionReads: number
}

/**
 * users(트라이브)·strava_connections·user_suspensions를 흉내내는 가짜 클라이언트.
 * 정지 행을 돌려줘서 트라이브가 있는 경우 «다음 관문(정지 검사)»까지 닿는지 본다.
 */
function makeFake(tribe: TribeResult, options: { connection: boolean } = { connection: true }): { supabase: SupabaseClient; record: FakeRecord } {
  const record: FakeRecord = { tables: [], userSelects: [], connectionReads: 0 }
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
    record.tables.push(table)
    if (table === 'users') {
      return {
        select: (columns: string) => {
          const query = { columns, eqs: {} as Record<string, unknown> }
          record.userSelects.push(query)
          const chain: Record<string, unknown> = {
            eq: (col: string, val: unknown) => {
              query.eqs[col] = val
              return chain
            },
            maybeSingle: async () => tribe,
          }
          return chain
        },
      }
    }
    if (table === 'strava_connections') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => {
              record.connectionReads += 1
              return options.connection
                ? { data: connection, error: null }
                : { data: null, error: { message: 'no rows' } }
            },
          }),
        }),
      }
    }
    if (table === 'user_suspensions') {
      // 정지 중으로 둬 «트라이브 통과 뒤 정지 검사에 닿았다»를 UserSuspendedError로 확인한다
      return {
        select: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: async () => ({
                data: { id: 'sus-1', reason: '메모', suspended_at: '2026-10-10T00:00:00.000Z' },
                error: null,
              }),
            }),
          }),
        }),
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

describe('syncStravaActivities — 트라이브를 고르지 않으면 막힌다', () => {
  it('트라이브가 없으면 TribeRequiredError를 던지고 Strava 연결 조회·Strava 조회·토큰 갱신을 하지 않는다', async () => {
    const { supabase, record } = makeFake({ data: { tribe_id: null }, error: null })
    createServiceClientMock.mockReturnValue(supabase)

    await expect(syncStravaActivities(USER_ID)).rejects.toBeInstanceOf(TribeRequiredError)

    expect(record.connectionReads).toBe(0)
    expect(record.tables).toEqual(['users'])
    expect(getAllActivitiesMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('Strava 연결이 없는 유저도 «연동 정보 없음»이 아니라 트라이브 게이트로 막힌다', async () => {
    const { supabase, record } = makeFake({ data: { tribe_id: null }, error: null }, { connection: false })
    createServiceClientMock.mockReturnValue(supabase)

    const error = await syncStravaActivities(USER_ID).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(TribeRequiredError)
    expect(record.connectionReads).toBe(0)
  })

  it('users 행이 없어도(온보딩 전 계정) 같다', async () => {
    const { supabase } = makeFake({ data: null, error: null })
    createServiceClientMock.mockReturnValue(supabase)

    await expect(syncStravaActivities(USER_ID)).rejects.toBeInstanceOf(TribeRequiredError)
  })

  it('트라이브를 읽지 못하면 «있음»으로 보지 않고 던져 동기화하지 않는다(TribeRequiredError가 아닌 일반 오류)', async () => {
    const { supabase, record } = makeFake({ data: null, error: { message: 'db down' } })
    createServiceClientMock.mockReturnValue(supabase)

    const run = syncStravaActivities(USER_ID)

    await expect(run).rejects.toThrow('users.tribe_id 조회 실패')
    await expect(run).rejects.not.toBeInstanceOf(TribeRequiredError)
    expect(record.connectionReads).toBe(0)
    expect(getAllActivitiesMock).not.toHaveBeenCalled()
  })

  it('트라이브가 있으면 막지 않고 기존 흐름으로 넘어간다(다음 관문인 이용 정지 검사까지 닿는다)', async () => {
    const { supabase, record } = makeFake({ data: { tribe_id: TRIBE_ID }, error: null })
    createServiceClientMock.mockReturnValue(supabase)

    await expect(syncStravaActivities(USER_ID)).rejects.toBeInstanceOf(UserSuspendedError)

    expect(record.connectionReads).toBe(1)
    expect(record.tables).toEqual(['users', 'strava_connections', 'user_suspensions'])
  })

  it('트라이브 확인은 이 유저의 users.tribe_id 한 칸만 읽는다', async () => {
    const { supabase, record } = makeFake({ data: { tribe_id: null }, error: null })
    createServiceClientMock.mockReturnValue(supabase)

    await expect(syncStravaActivities(USER_ID)).rejects.toBeInstanceOf(TribeRequiredError)

    expect(record.userSelects).toEqual([{ columns: 'tribe_id', eqs: { id: USER_ID } }])
  })
})
