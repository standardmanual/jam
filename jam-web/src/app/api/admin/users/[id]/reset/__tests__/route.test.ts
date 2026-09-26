/**
 * POST /api/admin/users/[id]/reset — 본인·어드민 계정 초기화 거부 (티켓 20260926_1413)
 * DB 접근은 가짜로 바꿔, 라우트가 "본인·어드민은 403, 일반 유저는 초기화 함수 호출"을 지키는지만 본다.
 * 실행: cd jam-web && npx vitest run "src/app/api/admin/users/[id]/reset/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const ADMIN_ID = '00000000-0000-4000-8000-0000000000aa'
const OTHER_ADMIN = '00000000-0000-4000-8000-0000000000bb'
const USER_A = '00000000-0000-4000-8000-000000000001'

const mocks = vi.hoisted(() => ({
  target: null as { id: string; email: string; is_admin: boolean } | null,
  targetError: null as { message: string } | null,
  resetUserData: vi.fn(),
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
vi.mock('@/lib/admin/user-actions', () => ({ resetUserData: mocks.resetUserData }))

const { POST } = await import('../route')

function call(userId: string) {
  return POST(new NextRequest(`https://j-a-m.app/api/admin/users/${userId}/reset`, { method: 'POST' }), {
    params: Promise.resolve({ id: userId }),
  })
}

beforeEach(() => {
  mocks.target = null
  mocks.targetError = null
  mocks.resetUserData.mockReset().mockResolvedValue({ ok: true, deletedActivityBadges: 2, deletedInventoryItems: 3 })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/admin/users/[id]/reset', () => {
  it('본인 계정은 403으로 막고 초기화하지 않는다', async () => {
    mocks.target = { id: ADMIN_ID, email: 'me@jam.app', is_admin: true }
    const res = await call(ADMIN_ID)
    expect(res.status).toBe(403)
    expect(mocks.resetUserData).not.toHaveBeenCalled()
  })

  it('다른 어드민 계정은 403으로 막고 초기화하지 않는다', async () => {
    mocks.target = { id: OTHER_ADMIN, email: 'boss@x.com', is_admin: true }
    const res = await call(OTHER_ADMIN)
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('어드민 계정은 초기화할 수 없습니다.')
    expect(mocks.resetUserData).not.toHaveBeenCalled()
  })

  it('일반 유저는 초기화하고 결과를 돌려준다', async () => {
    mocks.target = { id: USER_A, email: 'a@x.com', is_admin: false }
    const res = await call(USER_A)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deletedActivityBadges: 2, deletedInventoryItems: 3 })
    expect(mocks.resetUserData).toHaveBeenCalledWith(expect.anything(), USER_A, 'me@jam.app')
  })
})
