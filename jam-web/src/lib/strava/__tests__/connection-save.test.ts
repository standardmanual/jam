/**
 * Strava 연결 저장 공용 함수 (티켓 20261021_1249 4회) — 콜백과 «그래도 연결하기»(`api/strava/replace`)가 같이 쓴다
 *
 * 고정하는 것
 *  - `saveStravaConnection`: 새 Strava 계정은 insert(first_sync_pending=true, last_synced_at=null)한 뒤 이 유저의 이전 연결 행을 지운다 ·
 *    같은 계정 재연결은 토큰만 갱신하고 끊김을 지우며 first_sync_pending을 건드리지 않는다 · DB 쓰기가 실패하면 false이고,
 *    이전 연결 삭제가 실패하면 방금 넣은 새 행을 되돌린다(update 경로는 되돌릴 행이 없다) · 암호화가 실패하면 던지고 DB를 건드리지 않는다 ·
 *    로그에 토큰이 없다
 *  - `syncAfterConnect`: 던지지 않는다 · 이용 정지·트라이브 없음은 오류가 아니라 건너뜀으로 남긴다
 *  - `assessDuplicateOwner`: 일반·정상 → replaceable · 어드민(is_admin·화이트리스트)·이용 정지·유저 행 없음 → blocked · 읽지 못함 → unknown
 *
 * 공용 DB와 Strava는 부르지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/connection-save.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { createServiceClient } from '@/lib/supabase/server'

const mocks = vi.hoisted(() => ({
  encrypt: vi.fn<(text: string) => Promise<string>>(),
  sync: vi.fn<(userId: string) => Promise<void>>(),
}))

vi.mock('@/lib/utils', () => ({ encrypt: (text: string) => mocks.encrypt(text) }))
vi.mock('@/lib/strava/sync', () => ({ syncStravaActivities: (userId: string) => mocks.sync(userId) }))

import { assessDuplicateOwner, saveStravaConnection, syncAfterConnect } from '../connection-save'
import { UserSuspendedError } from '@/lib/suspension/suspension'
import { TribeRequiredError } from '@/lib/tribe/gate'

type ServiceClient = ReturnType<typeof createServiceClient>
type Row = Record<string, unknown>

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OWNER_ID = '99999999-9999-4999-8999-999999999999'
const ATHLETE = 424242
const TOKENS = { accessToken: 'ACCESS-SECRET', refreshToken: 'REFRESH-SECRET', expiresAtSec: 1_800_000_000 }

type Failure = 'update' | 'insert' | 'delete_old' | 'rollback'

/** strava_connections 쓰기만 기록하는 가짜. 실패시킬 쓰기를 하나 또는 여럿 고른다(rollback은 delete_old와 함께 골라야 닿는다) */
function makeConnectionClient(failOn: Failure | Failure[] = []) {
  const fails = new Set<Failure>(Array.isArray(failOn) ? failOn : [failOn])
  const writes: { op: string; payload?: Row; filters: { op: string; col: string; val: unknown }[] }[] = []
  const client = {
    from: (table: string) => {
      if (table !== 'strava_connections') throw new Error(`예상치 못한 테이블 — ${table}`)
      const chain = (op: string, payload?: Row) => {
        const entry = { op, payload, filters: [] as { op: string; col: string; val: unknown }[] }
        writes.push(entry)
        const self: Record<string, unknown> = {
          eq: (col: string, val: unknown) => (entry.filters.push({ op: 'eq', col, val }), self),
          neq: (col: string, val: unknown) => (entry.filters.push({ op: 'neq', col, val }), self),
          then: (onFulfilled: (v: { error: unknown }) => unknown) => {
            const isOld = entry.filters.some((f) => f.op === 'neq')
            const failed =
              (op === 'update' && fails.has('update')) ||
              (op === 'delete' && isOld && fails.has('delete_old')) ||
              (op === 'delete' && !isOld && fails.has('rollback'))
            return Promise.resolve({ error: failed ? { message: 'db down' } : null }).then(onFulfilled)
          },
        }
        return self
      }
      return {
        update: (payload: Row) => chain('update', payload),
        delete: () => chain('delete'),
        insert: async (payload: Row) => {
          writes.push({ op: 'insert', payload, filters: [] })
          return { error: fails.has('insert') ? { message: 'db down' } : null }
        },
      }
    },
  } as unknown as ServiceClient
  return { client, writes }
}

let errorSpy: ReturnType<typeof vi.spyOn>
let infoSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  mocks.encrypt.mockReset().mockImplementation(async (text) => `enc:${text}`)
  mocks.sync.mockReset().mockResolvedValue(undefined)
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('saveStravaConnection — 새 Strava 계정', () => {
  it('암호화한 토큰으로 첫 동기화 대기 행을 넣고 이 유저의 이전 연결 행을 지운다', async () => {
    const { client, writes } = makeConnectionClient()

    const saved = await saveStravaConnection(client, { userId: USER_ID, athleteId: ATHLETE, tokens: TOKENS, hasSameAthleteRow: false })

    expect(saved).toBe(true)
    expect(writes.map((w) => w.op)).toEqual(['insert', 'delete'])
    expect(writes[0].payload).toMatchObject({
      user_id: USER_ID,
      strava_athlete_id: ATHLETE,
      access_token: 'enc:ACCESS-SECRET',
      refresh_token: 'enc:REFRESH-SECRET',
      token_expires_at: new Date(1_800_000_000 * 1000).toISOString(),
      backfill_completed: true,
      last_synced_at: null,
      first_sync_pending: true,
      disconnected_at: null,
      disconnect_reason: null,
    })
    expect(writes[1].filters).toEqual([
      { op: 'eq', col: 'user_id', val: USER_ID },
      { op: 'neq', col: 'strava_athlete_id', val: ATHLETE },
    ])
  })

  it('insert가 실패하면 false이고 이전 연결을 지우지 않는다', async () => {
    const { client, writes } = makeConnectionClient('insert')

    expect(await saveStravaConnection(client, { userId: USER_ID, athleteId: ATHLETE, tokens: TOKENS, hasSameAthleteRow: false })).toBe(false)
    expect(writes.map((w) => w.op)).toEqual(['insert'])
  })

  it('이전 연결 삭제가 실패하면 방금 넣은 새 행을 되돌리고 false다', async () => {
    const { client, writes } = makeConnectionClient('delete_old')

    expect(await saveStravaConnection(client, { userId: USER_ID, athleteId: ATHLETE, tokens: TOKENS, hasSameAthleteRow: false })).toBe(false)
    expect(writes.map((w) => w.op)).toEqual(['insert', 'delete', 'delete'])
    // 되돌림은 새 행(같은 athlete)만 지운다 — neq가 없다
    expect(writes[2].filters).toEqual([
      { op: 'eq', col: 'user_id', val: USER_ID },
      { op: 'eq', col: 'strava_athlete_id', val: ATHLETE },
    ])
  })

  it('되돌림까지 실패해도 false를 돌려주고 두 오류를 서버 로그에 남긴다', async () => {
    const { client, writes } = makeConnectionClient(['delete_old', 'rollback'])

    expect(await saveStravaConnection(client, { userId: USER_ID, athleteId: ATHLETE, tokens: TOKENS, hasSameAthleteRow: false })).toBe(false)
    expect(writes.map((w) => w.op)).toEqual(['insert', 'delete', 'delete'])
    const logged = errorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n')
    expect(logged).toContain('이전 연결 삭제 오류')
    expect(logged).toContain('새 연결 되돌림 실패')
  })
})

describe('saveStravaConnection — 같은 Strava 계정 재연결', () => {
  it('토큰을 갱신하고 끊김을 지우되 first_sync_pending·last_synced_at은 건드리지 않고 새 행을 넣지 않는다', async () => {
    const { client, writes } = makeConnectionClient()

    const saved = await saveStravaConnection(client, { userId: USER_ID, athleteId: ATHLETE, tokens: TOKENS, hasSameAthleteRow: true })

    expect(saved).toBe(true)
    expect(writes.map((w) => w.op)).toEqual(['update', 'delete'])
    expect(writes[0].payload).toMatchObject({
      access_token: 'enc:ACCESS-SECRET',
      refresh_token: 'enc:REFRESH-SECRET',
      disconnected_at: null,
      disconnect_reason: null,
    })
    expect(writes[0].payload).not.toHaveProperty('first_sync_pending')
    expect(writes[0].payload).not.toHaveProperty('last_synced_at')
    expect(writes[0].filters).toEqual([
      { op: 'eq', col: 'user_id', val: USER_ID },
      { op: 'eq', col: 'strava_athlete_id', val: ATHLETE },
    ])
  })

  it('갱신이 실패하면 false이고, 이전 연결 삭제가 실패해도 되돌릴 새 행이 없으므로 되돌림 삭제를 하지 않는다', async () => {
    const updateFail = makeConnectionClient('update')
    expect(await saveStravaConnection(updateFail.client, { userId: USER_ID, athleteId: ATHLETE, tokens: TOKENS, hasSameAthleteRow: true })).toBe(false)
    expect(updateFail.writes.map((w) => w.op)).toEqual(['update'])

    const deleteFail = makeConnectionClient('delete_old')
    expect(await saveStravaConnection(deleteFail.client, { userId: USER_ID, athleteId: ATHLETE, tokens: TOKENS, hasSameAthleteRow: true })).toBe(false)
    expect(deleteFail.writes.map((w) => w.op)).toEqual(['update', 'delete'])
  })
})

describe('saveStravaConnection — 암호화와 로그', () => {
  it('암호화가 실패하면 던지고 DB를 건드리지 않는다', async () => {
    mocks.encrypt.mockRejectedValue(new Error('ENCRYPTION_KEY 없음'))
    const { client, writes } = makeConnectionClient()

    await expect(
      saveStravaConnection(client, { userId: USER_ID, athleteId: ATHLETE, tokens: TOKENS, hasSameAthleteRow: false })
    ).rejects.toThrow()
    expect(writes).toHaveLength(0)
  })

  it('실패 로그에 토큰이 들어가지 않는다', async () => {
    for (const failOn of ['insert', ['delete_old', 'rollback']] as const) {
      const { client } = makeConnectionClient(failOn as Failure | Failure[])
      await saveStravaConnection(client, { userId: USER_ID, athleteId: ATHLETE, tokens: TOKENS, hasSameAthleteRow: false })
    }
    const logged = JSON.stringify(errorSpy.mock.calls)
    expect(logged).not.toContain('ACCESS-SECRET')
    expect(logged).not.toContain('REFRESH-SECRET')
  })
})

describe('syncAfterConnect', () => {
  it('동기화를 한 번 부르고 던지지 않는다', async () => {
    await syncAfterConnect(USER_ID)
    expect(mocks.sync).toHaveBeenCalledWith(USER_ID)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('이용 정지·트라이브 없음은 오류가 아니라 건너뜀으로 남긴다', async () => {
    mocks.sync.mockRejectedValueOnce(new UserSuspendedError({ reason: 'abuse', suspendedAt: '2026-10-01T00:00:00.000Z' }))
    await syncAfterConnect(USER_ID)
    mocks.sync.mockRejectedValueOnce(new TribeRequiredError())
    await syncAfterConnect(USER_ID)

    expect(errorSpy).not.toHaveBeenCalled()
    expect(infoSpy).toHaveBeenCalledTimes(2)
  })

  it('그 밖의 실패는 오류로 남기되 던지지 않는다(연결은 이미 끝났다)', async () => {
    mocks.sync.mockRejectedValue(new Error('strava 500'))
    await expect(syncAfterConnect(USER_ID)).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })
})

describe('assessDuplicateOwner', () => {
  interface OwnerSetup {
    owner?: { id: string; email: string | null; is_admin: boolean } | null
    ownerError?: boolean
    suspended?: boolean
    suspensionError?: boolean
  }

  function makeOwnerClient(setup: OwnerSetup = {}) {
    const owner = setup.owner === undefined ? { id: OWNER_ID, email: 'owner@example.com', is_admin: false } : setup.owner
    return {
      from: (table: string) => ({
        select: () => {
          const chain: Record<string, unknown> = {
            eq: () => chain,
            is: () => chain,
            maybeSingle: async () => {
              if (table === 'users') return { data: owner, error: setup.ownerError ? { message: 'db down' } : null }
              if (table === 'user_suspensions') {
                return {
                  data: setup.suspended ? { id: 's1', reason: 'abuse', suspended_at: '2026-10-01T00:00:00.000Z' } : null,
                  error: setup.suspensionError ? { message: 'db down' } : null,
                }
              }
              throw new Error(`예상치 못한 테이블 — ${table}`)
            },
          }
          return chain
        },
      }),
    } as unknown as ServiceClient
  }

  it('일반·정상 계정은 replaceable이다', async () => {
    expect(await assessDuplicateOwner(makeOwnerClient(), OWNER_ID)).toBe('replaceable')
  })

  it('is_admin 계정과 ADMIN_EMAILS 화이트리스트 이메일은 blocked다', async () => {
    expect(await assessDuplicateOwner(makeOwnerClient({ owner: { id: OWNER_ID, email: 'a@example.com', is_admin: true } }), OWNER_ID)).toBe('blocked')

    vi.stubEnv('ADMIN_EMAILS', 'owner@example.com')
    expect(await assessDuplicateOwner(makeOwnerClient(), OWNER_ID)).toBe('blocked')
  })

  it('이용 정지 중이거나 유저 행이 없으면 blocked다', async () => {
    expect(await assessDuplicateOwner(makeOwnerClient({ suspended: true }), OWNER_ID)).toBe('blocked')
    expect(await assessDuplicateOwner(makeOwnerClient({ owner: null }), OWNER_ID)).toBe('blocked')
  })

  it('읽지 못하면 unknown이고 오류 원문은 서버 로그에만 남는다', async () => {
    expect(await assessDuplicateOwner(makeOwnerClient({ ownerError: true }), OWNER_ID)).toBe('unknown')
    expect(await assessDuplicateOwner(makeOwnerClient({ suspensionError: true }), OWNER_ID)).toBe('unknown')
    expect(errorSpy).toHaveBeenCalledTimes(2)
  })
})
