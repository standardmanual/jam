/**
 * deleteAccount — 계정을 지우는 규칙 하나의 순서와 실패 처리 (티켓 20261021_1249 1회, 운영 로직 17장)
 * DB·스토리지·Auth는 모두 가짜다 — 공용 DB를 부르지 않는다. 준비 함수(SQL) 자체의 동작은 이 시험이 아니라 카리나가 롤백 트랜잭션으로 실측한다.
 *
 * 고정하는 것: 어드민 계정은 거절 · 순서는 «유저 조회 → 준비 RPC → 아바타 삭제 → 계정 삭제» · 준비가 실패하면 계정을 지우지 않는다 ·
 * 아바타 삭제가 실패해도 계정 삭제는 계속한다 · 계정 삭제 실패는 오류 원문 없이 고정 코드(`delete_failed`)로만 돌려준다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/account/__tests__/delete-account.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { createServiceClient } from '@/lib/supabase/server'

const mocks = vi.hoisted(() => ({
  removeAvatarFiles: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}), createClient: async () => ({}) }))
vi.mock('../avatar-cleanup', () => ({ removeAvatarFiles: mocks.removeAvatarFiles }))

const { deleteAccount, parsePrepareResult } = await import('../delete-account')

type ServiceClient = ReturnType<typeof createServiceClient>

const USER_ID = '00000000-0000-4000-8000-000000000001'

const PREPARED = {
  found: true,
  retained: { checkin_earn: 3, poi_view: 2, poi_drop: 1, poi_pickup: 4, abuse_log: 0 },
  custody_rows_cleared: 5,
  vanished_items: 7,
}

interface Setup {
  user?: { id: string; email: string; is_admin: boolean } | null
  userError?: { message: string } | null
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
            maybeSingle: async () => ({ data: user, error: setup.userError ?? null }),
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
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('deleteAccount — 순서', () => {
  it('유저 조회 → 준비 RPC → 아바타 삭제 → 계정 삭제 순서로 하고 건수 요약을 돌려준다', async () => {
    const { client, calls, rpcArgs } = makeSupabase()
    mocks.removeAvatarFiles.mockImplementation(async () => {
      calls.push('avatar')
      return 1
    })

    const result = await deleteAccount(client, USER_ID)

    expect(calls).toEqual(['from:users', 'rpc:prepare_account_deletion', 'avatar', `deleteUser:${USER_ID}`])
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
    expect(calls).toEqual(['from:users', 'rpc:prepare_account_deletion'])
    expect(mocks.removeAvatarFiles).not.toHaveBeenCalled()
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
    expect(mocks.removeAvatarFiles).not.toHaveBeenCalled()
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
