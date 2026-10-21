/**
 * deleteAccount — 계정을 지우는 규칙 하나의 순서와 실패 처리 (티켓 20261021_1249 1회, 운영 로직 17장)
 * DB·스토리지·Auth는 모두 가짜다 — 공용 DB를 부르지 않는다. 준비 함수(SQL) 자체의 동작은 이 시험이 아니라 카리나가 롤백 트랜잭션으로 실측한다.
 *
 * 고정하는 것: 어드민 계정은 거절 · 순서는 «유저 조회 → Strava 토큰 읽기 → 아바타 삭제 → 준비 RPC → 계정 삭제 → Strava 앱 해제»
 * (티켓 20261021_1249 3회: 아이템이 없어짐으로 바뀐 뒤 계정 삭제까지의 틈을 좁히려고 아바타를 준비 앞으로 옮겼다) · 준비가 실패하면 계정을
 * 지우지 않는다 · 아바타 삭제가 실패해도 계정 삭제는 계속한다 · 계정 삭제 실패는 오류 원문 없이 고정 코드(`delete_failed`)로만 돌려준다 ·
 * Strava 앱 해제는 계정 삭제가 성공했을 때만 하고, 읽기·해제가 실패해도 탈퇴는 성공이다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/account/__tests__/delete-account.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { createServiceClient } from '@/lib/supabase/server'

const mocks = vi.hoisted(() => ({
  removeAvatarFiles: vi.fn(),
  deauthorizeStoredConnection: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}), createClient: async () => ({}) }))
vi.mock('../avatar-cleanup', () => ({ removeAvatarFiles: mocks.removeAvatarFiles }))
vi.mock('@/lib/strava/deauthorize-connection', () => ({ deauthorizeStoredConnection: mocks.deauthorizeStoredConnection }))

const { deleteAccount, parsePrepareResult } = await import('../delete-account')

type ServiceClient = ReturnType<typeof createServiceClient>

const USER_ID = '00000000-0000-4000-8000-000000000001'

const PREPARED = {
  found: true,
  retained: { checkin_earn: 3, poi_view: 2, poi_drop: 1, poi_pickup: 4, abuse_log: 0 },
  custody_rows_cleared: 5,
  vanished_items: 7,
}

const CONNECTION = {
  access_token: 'enc:ACCESS',
  refresh_token: 'enc:REFRESH',
  token_expires_at: '2099-01-01T00:00:00.000Z',
  disconnected_at: null,
}

interface Setup {
  user?: { id: string; email: string; is_admin: boolean } | null
  userError?: { message: string } | null
  /** `strava_connections` 행. 기본은 연결 중. null이면 연결 행이 없다 */
  connection?: Record<string, unknown> | null
  connectionError?: { message: string } | null
  connectionThrows?: boolean
  rpcResult?: { data: unknown; error: { message: string } | null }
  rpcThrows?: boolean
  deleteError?: { message: string } | null
  deleteThrows?: boolean
}

function makeSupabase(setup: Setup = {}) {
  const calls: string[] = []
  const rpcArgs: unknown[] = []
  const user = setup.user === undefined ? { id: USER_ID, email: 'a@x.com', is_admin: false } : setup.user
  const client = {
    from: (table: string) => {
      calls.push(`from:${table}`)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (table === 'strava_connections') {
                if (setup.connectionThrows) throw new Error('연결 조회 네트워크 오류')
                const row = setup.connection === undefined ? CONNECTION : setup.connection
                return { data: row, error: setup.connectionError ?? null }
              }
              return { data: user, error: setup.userError ?? null }
            },
          }),
        }),
      }
    },
    rpc: async (fn: string, args: unknown) => {
      calls.push(`rpc:${fn}`)
      rpcArgs.push(args)
      if (setup.rpcThrows) throw new Error('rpc 네트워크 오류')
      return setup.rpcResult ?? { data: PREPARED, error: null }
    },
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          calls.push(`deleteUser:${id}`)
          if (setup.deleteThrows) throw new Error('auth 네트워크 오류')
          return { error: setup.deleteError ?? null }
        },
      },
    },
  } as unknown as ServiceClient
  return { client, calls, rpcArgs }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.removeAvatarFiles.mockReset().mockImplementation(async () => 0)
  mocks.deauthorizeStoredConnection.mockReset().mockImplementation(async () => true)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('deleteAccount — 순서', () => {
  it('유저 조회 → Strava 토큰 읽기 → 아바타 삭제 → 준비 RPC → 계정 삭제 → Strava 앱 해제 순서로 하고 건수 요약을 돌려준다', async () => {
    const { client, calls, rpcArgs } = makeSupabase()
    mocks.removeAvatarFiles.mockImplementation(async () => {
      calls.push('avatar')
      return 1
    })
    mocks.deauthorizeStoredConnection.mockImplementation(async () => {
      calls.push('strava-deauthorize')
      return true
    })

    const result = await deleteAccount(client, USER_ID)

    expect(calls).toEqual([
      'from:users',
      'from:strava_connections',
      'avatar',
      'rpc:prepare_account_deletion',
      `deleteUser:${USER_ID}`,
      'strava-deauthorize',
    ])
    expect(rpcArgs).toEqual([{ p_user_id: USER_ID }])
    expect(mocks.removeAvatarFiles).toHaveBeenCalledWith(client, USER_ID)
    expect(result).toEqual({
      ok: true,
      summary: {
        retained: { checkin_earn: 3, poi_view: 2, poi_drop: 1, poi_pickup: 4, abuse_log: 0 },
        custodyRowsCleared: 5,
        vanishedItems: 7,
      },
    })
  })
})

describe('deleteAccount — 어드민 거절', () => {
  it('is_admin 계정은 admin_account로 거절하고 아무것도 바꾸지 않는다', async () => {
    const { client, calls } = makeSupabase({ user: { id: USER_ID, email: 'boss@x.com', is_admin: true } })
    expect(await deleteAccount(client, USER_ID)).toEqual({ ok: false, code: 'admin_account' })
    expect(calls).toEqual(['from:users'])
    expect(mocks.removeAvatarFiles).not.toHaveBeenCalled()
  })

  it('ADMIN_EMAILS 화이트리스트에만 있고 is_admin이 false인 계정도 거절한다', async () => {
    vi.stubEnv('ADMIN_EMAILS', 'boss@x.com')
    const { client, calls } = makeSupabase({ user: { id: USER_ID, email: 'boss@x.com', is_admin: false } })
    expect(await deleteAccount(client, USER_ID)).toEqual({ ok: false, code: 'admin_account' })
    expect(calls).toEqual(['from:users'])
  })
})

describe('deleteAccount — 준비 단계 실패는 계정을 지우지 않는다', () => {
  it('유저가 없으면 not_found로 멈춘다', async () => {
    const { client, calls } = makeSupabase({ user: null })
    expect(await deleteAccount(client, USER_ID)).toEqual({ ok: false, code: 'not_found' })
    expect(calls).toEqual(['from:users'])
  })

  it('유저 조회가 실패하면 어드민인지 알 수 없으므로 prepare_failed로 멈춘다', async () => {
    const { client, calls } = makeSupabase({ userError: { message: 'db down' } })
    expect(await deleteAccount(client, USER_ID)).toEqual({ ok: false, code: 'prepare_failed' })
    expect(calls).toEqual(['from:users'])
  })

  it('준비 RPC 오류면 prepare_failed로 멈추고 아바타·계정을 지우지 않는다', async () => {
    const { client, calls } = makeSupabase({ rpcResult: { data: null, error: { message: 'function failed' } } })
    expect(await deleteAccount(client, USER_ID)).toEqual({ ok: false, code: 'prepare_failed' })
    expect(calls).toEqual(['from:users', 'from:strava_connections', 'rpc:prepare_account_deletion'])
    expect(calls).not.toContain(`deleteUser:${USER_ID}`)
    expect(mocks.deauthorizeStoredConnection).not.toHaveBeenCalled()
  })

  it('준비 RPC가 던져도 prepare_failed로 멈춘다', async () => {
    const { client, calls } = makeSupabase({ rpcThrows: true })
    expect(await deleteAccount(client, USER_ID)).toEqual({ ok: false, code: 'prepare_failed' })
    expect(calls).not.toContain(`deleteUser:${USER_ID}`)
  })

  it('준비 RPC가 {found:false}를 돌려주면 not_found로 멈춘다', async () => {
    const { client, calls } = makeSupabase({ rpcResult: { data: { found: false }, error: null } })
    expect(await deleteAccount(client, USER_ID)).toEqual({ ok: false, code: 'not_found' })
    expect(calls).not.toContain(`deleteUser:${USER_ID}`)
  })

  it('준비 RPC가 계약 밖 모양을 돌려주면 성공으로 보지 않고 멈춘다', async () => {
    const { client, calls } = makeSupabase({ rpcResult: { data: { found: true, retained: {} }, error: null } })
    expect(await deleteAccount(client, USER_ID)).toEqual({ ok: false, code: 'prepare_failed' })
    expect(calls).not.toContain(`deleteUser:${USER_ID}`)
    expect(mocks.deauthorizeStoredConnection).not.toHaveBeenCalled()
  })
})

describe('deleteAccount — 아바타와 계정 삭제', () => {
  it('아바타 삭제가 실패해도 계정 삭제는 계속하고 오류는 서버 로그에만 남긴다', async () => {
    const { client, calls } = makeSupabase()
    mocks.removeAvatarFiles.mockRejectedValue(new Error('storage down'))

    const result = await deleteAccount(client, USER_ID)

    expect(result.ok).toBe(true)
    expect(calls).toContain(`deleteUser:${USER_ID}`)
    expect(console.error).toHaveBeenCalled()
  })

  it('계정 삭제가 실패하면 오류 원문 없이 delete_failed만 돌려주고 원문은 서버 로그에 남긴다', async () => {
    const { client } = makeSupabase({ deleteError: { message: 'update or delete violates foreign key constraint' } })

    const result = await deleteAccount(client, USER_ID)

    expect(result).toEqual({ ok: false, code: 'delete_failed' })
    expect(JSON.stringify(result)).not.toContain('foreign key')
    expect((console.error as unknown as ReturnType<typeof vi.fn>).mock.calls.flat().join(' ')).toContain('foreign key')
  })

  it('계정 삭제가 던져도 delete_failed다', async () => {
    const { client } = makeSupabase({ deleteThrows: true })
    expect(await deleteAccount(client, USER_ID)).toEqual({ ok: false, code: 'delete_failed' })
  })
})

describe('deleteAccount — Strava 앱 해제', () => {
  it('연결 중이면 계정 삭제가 끝난 뒤에 읽어 둔 토큰으로 해제한다', async () => {
    const { client } = makeSupabase()

    await deleteAccount(client, USER_ID)

    expect(mocks.deauthorizeStoredConnection).toHaveBeenCalledTimes(1)
    expect(mocks.deauthorizeStoredConnection).toHaveBeenCalledWith(
      { access_token: 'enc:ACCESS', refresh_token: 'enc:REFRESH', token_expires_at: '2099-01-01T00:00:00.000Z' },
      { userId: USER_ID }
    )
  })

  it.each([
    ['연결 행이 없으면', { connection: null }],
    ['이미 끊긴 연결이면', { connection: { ...CONNECTION, disconnected_at: '2026-10-10T00:00:00.000Z' } }],
    ['토큰이 비어 있으면', { connection: { ...CONNECTION, access_token: '', refresh_token: '' } }],
  ])('%s 해제하지 않고 탈퇴는 성공한다', async (_label, setup) => {
    const { client, calls } = makeSupabase(setup)

    const result = await deleteAccount(client, USER_ID)

    expect(result.ok).toBe(true)
    expect(calls).toContain(`deleteUser:${USER_ID}`)
    expect(mocks.deauthorizeStoredConnection).not.toHaveBeenCalled()
  })

  it('연결 조회가 실패하거나 던져도 계정은 지우고 해제만 건너뛴다', async () => {
    const failed = makeSupabase({ connectionError: { message: 'db down' }, connection: null })
    expect((await deleteAccount(failed.client, USER_ID)).ok).toBe(true)
    expect(failed.calls).toContain(`deleteUser:${USER_ID}`)

    const thrown = makeSupabase({ connectionThrows: true })
    expect((await deleteAccount(thrown.client, USER_ID)).ok).toBe(true)
    expect(thrown.calls).toContain(`deleteUser:${USER_ID}`)

    expect(mocks.deauthorizeStoredConnection).not.toHaveBeenCalled()
  })

  it('계정 삭제가 실패하면 승인을 해제하지 않는다(계정이 남아 있으므로)', async () => {
    const { client } = makeSupabase({ deleteError: { message: 'auth down' } })

    expect(await deleteAccount(client, USER_ID)).toEqual({ ok: false, code: 'delete_failed' })
    expect(mocks.deauthorizeStoredConnection).not.toHaveBeenCalled()
  })

  it('해제가 실패하거나 던져도 이미 지워진 계정에는 성공을 돌려준다', async () => {
    mocks.deauthorizeStoredConnection.mockImplementation(async () => false)
    expect((await deleteAccount(makeSupabase().client, USER_ID)).ok).toBe(true)

    mocks.deauthorizeStoredConnection.mockRejectedValue(new Error('예상 밖 예외'))
    expect((await deleteAccount(makeSupabase().client, USER_ID)).ok).toBe(true)
    expect(console.error).toHaveBeenCalled()
  })
})

describe('parsePrepareResult', () => {
  it('계약에 맞는 응답을 건수 요약으로 읽는다', () => {
    expect(parsePrepareResult(PREPARED)).toEqual({
      found: true,
      summary: {
        retained: { checkin_earn: 3, poi_view: 2, poi_drop: 1, poi_pickup: 4, abuse_log: 0 },
        custodyRowsCleared: 5,
        vanishedItems: 7,
      },
    })
    expect(parsePrepareResult({ found: false })).toEqual({ found: false })
  })

  it.each([
    ['null', null],
    ['문자열', 'ok'],
    ['found 없음', { retained: PREPARED.retained }],
    ['종류 하나 빠짐', { ...PREPARED, retained: { checkin_earn: 1, poi_view: 1, poi_drop: 1, poi_pickup: 1 } }],
    ['음수 건수', { ...PREPARED, vanished_items: -1 }],
    ['소수 건수', { ...PREPARED, custody_rows_cleared: 1.5 }],
    ['문자열 건수', { ...PREPARED, retained: { ...PREPARED.retained, abuse_log: '0' } }],
  ])('계약 밖 모양(%s)은 null이다', (_label, data) => {
    expect(parsePrepareResult(data)).toBeNull()
  })
})
