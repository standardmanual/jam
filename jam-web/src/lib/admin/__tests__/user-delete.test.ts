/**
 * hardDeleteUser — 어드민 삭제가 공용 지우기 규칙(`deleteAccount`)을 쓰는지, 실패 응답에 원문이 실리지 않는지 (티켓 20261021_1249 1회)
 * DB와 지우기 규칙은 가짜다 — 공용 DB를 부르지 않는다. 지우는 순서 자체는 `lib/account/__tests__/delete-account.test.ts`가 고정한다.
 *
 * 고정하는 것: 삭제 전 집계 뒤에 `deleteAccount`를 부른다 · 성공하면 집계를 응답한다 · 실패(조회 오류·준비 실패·삭제 실패·어드민 거절)는
 * 오류 원문 없이 고정 문구만 돌려준다 · 없는 유저는 404다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/user-delete.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { createServiceClient } from '@/lib/supabase/server'

type ServiceClient = ReturnType<typeof createServiceClient>

const mocks = vi.hoisted(() => ({ deleteAccount: vi.fn() }))

vi.mock('@/lib/account/delete-account', () => ({ deleteAccount: mocks.deleteAccount }))

const { hardDeleteUser, ADMIN_DELETE_FAILED_MESSAGE } = await import('../user-actions')

const USER_ID = '00000000-0000-4000-8000-000000000001'

const SUMMARY = {
  retained: { checkin_earn: 1, poi_view: 2, poi_drop: 0, poi_pickup: 0, abuse_log: 0 },
  custodyRowsCleared: 3,
  vanishedItems: 4,
}

/** 삭제 전 집계에 쓰는 조회만 흉내 낸 가짜 클라이언트. 조회 순서를 `calls`에 남긴다 */
function makeSupabase(options: { user?: { id: string; email: string; username: string } | null; userError?: { message: string } | null } = {}) {
  const calls: string[] = []
  const user = options.user === undefined ? { id: USER_ID, email: 'a@x.com', username: 'aaa' } : options.user
  const client = {
    from: (table: string) => {
      calls.push(table)
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = () => builder
      builder.maybeSingle = async () =>
        table === 'users'
          ? { data: user, error: options.userError ?? null }
          : { data: table === 'inventory' ? { id: 'inv-1' } : null, error: null }
      builder.then = (resolve: (v: unknown) => void) => Promise.resolve({ count: 5, error: null }).then(resolve)
      return builder
    },
  } as unknown as ServiceClient
  return { client, calls }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  mocks.deleteAccount.mockReset().mockResolvedValue({ ok: true, summary: SUMMARY })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('hardDeleteUser', () => {
  it('삭제 전 집계를 읽은 뒤 공용 지우기 규칙으로 지우고 집계를 응답한다', async () => {
    const { client, calls } = makeSupabase()
    mocks.deleteAccount.mockImplementation(async () => {
      calls.push('deleteAccount')
      return { ok: true, summary: SUMMARY }
    })

    const result = await hardDeleteUser(client, USER_ID, 'admin@x.com')

    expect(calls).toEqual(['users', 'user_activity_badges', 'inventory', 'inventory_items', 'deleteAccount'])
    expect(mocks.deleteAccount).toHaveBeenCalledWith(client, USER_ID)
    expect(result).toEqual({ ok: true, deletedEmail: 'a@x.com', deletedActivityBadges: 5, deletedInventoryItems: 5 })
  })

  it('없는 유저는 404이고 지우지 않는다', async () => {
    const { client } = makeSupabase({ user: null })
    expect(await hardDeleteUser(client, USER_ID, 'admin@x.com')).toEqual({ ok: false, status: 404, error: '유저를 찾을 수 없습니다.' })
    expect(mocks.deleteAccount).not.toHaveBeenCalled()
  })

  it('유저 조회 오류는 원문 없이 고정 문구 500이고 지우지 않는다', async () => {
    const { client } = makeSupabase({ userError: { message: 'connection refused to db-host' } })
    const result = await hardDeleteUser(client, USER_ID, 'admin@x.com')
    expect(result).toEqual({ ok: false, status: 500, error: ADMIN_DELETE_FAILED_MESSAGE })
    expect(JSON.stringify(result)).not.toContain('connection refused')
    expect(mocks.deleteAccount).not.toHaveBeenCalled()
  })

  it.each(['prepare_failed', 'delete_failed', 'admin_account'] as const)(
    '지우기 규칙이 %s로 실패하면 고정 문구 500만 돌려준다',
    async (code) => {
      mocks.deleteAccount.mockResolvedValue({ ok: false, code })
      const { client } = makeSupabase()
      expect(await hardDeleteUser(client, USER_ID, 'admin@x.com')).toEqual({
        ok: false,
        status: 500,
        error: ADMIN_DELETE_FAILED_MESSAGE,
      })
    }
  )

  it('지우기 규칙이 not_found를 돌려주면 404다(조회 뒤 다른 곳에서 먼저 지워진 경우)', async () => {
    mocks.deleteAccount.mockResolvedValue({ ok: false, code: 'not_found' })
    const { client } = makeSupabase()
    expect(await hardDeleteUser(client, USER_ID, 'admin@x.com')).toEqual({ ok: false, status: 404, error: '유저를 찾을 수 없습니다.' })
  })

  it('고정 문구가 합의한 문장이다', () => {
    expect(ADMIN_DELETE_FAILED_MESSAGE).toBe('계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.')
  })
})
