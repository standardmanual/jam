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
})

describe('DELETE /api/admin/users/[id]', () => {
  it('본인 계정은 403으로 막고 삭제하지 않는다', async () => {
    mocks.target = { id: ADMIN_ID, email: 'me@jam.app', is_admin: true }
    const res = await call(ADMIN_ID)
    expect(res.status).toBe(403)
    expect(mocks.hardDeleteUser).not.toHaveBeenCalled()
  })

  it('다른 어드민 계정은 403으로 막고 삭제하지 않는다', async () => {
    mocks.target = { id: OTHER_ADMIN, email: 'boss@x.com', is_admin: true }
    const res = await call(OTHER_ADMIN)
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('어드민 계정은 삭제할 수 없습니다.')
    expect(mocks.hardDeleteUser).not.toHaveBeenCalled()
  })

  it('일반 유저는 삭제하고 결과를 돌려준다', async () => {
    mocks.target = { id: USER_A, email: 'a@x.com', is_admin: false }
    const res = await call(USER_A)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deletedEmail: 'a@x.com', deletedActivityBadges: 2, deletedInventoryItems: 3 })
    expect(mocks.hardDeleteUser).toHaveBeenCalledWith(expect.anything(), USER_A, 'me@jam.app')
  })

  it('없는 유저는 404, 조회 오류는 500이고 삭제하지 않는다', async () => {
    expect((await call(USER_A)).status).toBe(404)
    mocks.targetError = { message: 'db down' }
    expect((await call(USER_A)).status).toBe(500)
    expect(mocks.hardDeleteUser).not.toHaveBeenCalled()
  })
})
