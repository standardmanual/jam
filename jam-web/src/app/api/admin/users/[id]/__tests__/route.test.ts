/**
 * DELETE /api/admin/users/[id] — 본인·다른 어드민 계정 삭제 거부 (티켓 20260926_1413)
 * DB 접근은 가짜로 바꿔, 라우트가 "본인·어드민은 403, 일반 유저는 삭제 함수 호출"을 지키는지만 본다.
 * 실행: cd jam-web && npx vitest run "src/app/api/admin/users/[id]/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const ADMIN_ID = '00000000-0000-4000-8000-0000000000aa'
const OTHER_ADMIN = '00000000-0000-4000-8000-0000000000bb'
const USER_A = '00000000-0000-4000-8000-000000000001'

const mocks = vi.hoisted(() => ({
  target: null as { id: string; email: string; is_admin: boolean } | null,
  targetError: null as { message: string } | null,
  hardDeleteUser: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: mocks.target, error: mocks.targetError }) }),
      }),
    }),
  }),
}))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  getAdminUser: async () => ({ id: ADMIN_ID, email: 'me@jam.app' }),
}))
vi.mock('@/lib/admin/user-actions', () => ({ hardDeleteUser: mocks.hardDeleteUser }))

const { DELETE } = await import('../route')

function call(userId: string) {
  return DELETE(new NextRequest(`https://j-a-m.app/api/admin/users/${userId}`, { method: 'DELETE' }), {
    params: Promise.resolve({ id: userId }),
  })
}

beforeEach(() => {
  mocks.target = null
  mocks.targetError = null
  mocks.hardDeleteUser.mockReset().mockResolvedValue({
    ok: true,
    deletedEmail: 'a@x.com',
    deletedActivityBadges: 2,
    deletedInventoryItems: 3,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('DELETE /api/admin/users/[id]', () => {
  it('본인 계정은 403으로 막고 삭제하지 않는다 — 어드민 분기가 아니라 본인 분기가 막는다', async () => {
    // 대상을 일반 유저 계정(is_admin false, 화이트리스트 밖)으로 둬서 `admin.id === userId`
    // 분기만 403을 낼 수 있게 한다. 대상이 어드민이면 어드민 분기도 403을 내 본인 분기를 지워도 통과한다.
    mocks.target = { id: ADMIN_ID, email: 'me@jam.app', is_admin: false }
    const res = await call(ADMIN_ID)
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('자기 자신의 계정은 삭제할 수 없습니다.')
    expect(mocks.hardDeleteUser).not.toHaveBeenCalled()
  })

  it('다른 어드민 계정은 403으로 막고 삭제하지 않는다', async () => {
    mocks.target = { id: OTHER_ADMIN, email: 'boss@x.com', is_admin: true }
    const res = await call(OTHER_ADMIN)
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('어드민 계정은 삭제할 수 없습니다.')
    expect(mocks.hardDeleteUser).not.toHaveBeenCalled()
  })

  it('ADMIN_EMAILS 화이트리스트에만 있고 is_admin이 false인 다른 어드민도 403으로 막는다', async () => {
    vi.stubEnv('ADMIN_EMAILS', 'boss@x.com, other@x.com')
    mocks.target = { id: OTHER_ADMIN, email: 'boss@x.com', is_admin: false }
    const res = await call(OTHER_ADMIN)
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('어드민 계정은 삭제할 수 없습니다.')
    expect(mocks.hardDeleteUser).not.toHaveBeenCalled()
  })

  it('화이트리스트에 없고 is_admin도 false인 유저는 어드민으로 보지 않는다', async () => {
    vi.stubEnv('ADMIN_EMAILS', 'boss@x.com')
    mocks.target = { id: USER_A, email: 'a@x.com', is_admin: false }
    expect((await call(USER_A)).status).toBe(200)
    expect(mocks.hardDeleteUser).toHaveBeenCalledTimes(1)
  })

  it('삭제 함수가 ok:false를 돌려주면 그 상태 코드와 문구를 그대로 응답한다', async () => {
    mocks.target = { id: USER_A, email: 'a@x.com', is_admin: false }
    mocks.hardDeleteUser.mockResolvedValue({ ok: false, status: 409, error: '삭제할 수 없어요.' })
    const res = await call(USER_A)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: '삭제할 수 없어요.' })
  })

  it('일반 유저는 삭제하고 결과를 돌려준다', async () => {
    mocks.target = { id: USER_A, email: 'a@x.com', is_admin: false }
    const res = await call(USER_A)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deletedEmail: 'a@x.com', deletedActivityBadges: 2, deletedInventoryItems: 3 })
    expect(mocks.hardDeleteUser).toHaveBeenCalledWith(expect.anything(), USER_A, 'me@jam.app')
  })

  it('없는 유저는 404, 조회 오류는 500이고 삭제하지 않는다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await call(USER_A)).status).toBe(404)
    mocks.targetError = { message: 'db down' }
    expect((await call(USER_A)).status).toBe(500)
    expect(mocks.hardDeleteUser).not.toHaveBeenCalled()
  })

  it('조회 오류의 DB 원문은 응답에 싣지 않고 console.error로만 남긴다(티켓 20260926_1602)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.targetError = { message: 'connection refused to db-host' }
    const res = await call(USER_A)
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('connection refused')
    expect(errorSpy.mock.calls.some((c) => String(c[0]).startsWith('[users DELETE'))).toBe(true)
  })

  it('앱이 만든 「유저를 찾을 수 없습니다.」 문구는 그대로다(티켓 20260926_1602)', async () => {
    const res = await call(USER_A)
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('유저를 찾을 수 없습니다.')
  })
})
