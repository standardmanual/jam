/**
 * GET /api/capsule — 캡슐 조회 (티켓 20261018_0052 1회)
 *
 * 고정하는 것: 비로그인은 401이고 아무것도 읽지 않는다 · 로그인하면 세션 유저의 캡슐 상태를 서비스 클라이언트로 읽어 그대로 돌려준다 ·
 * 읽기 실패는 500(`d.capsule.loadFailed`)이고 로그성 문자열을 내려보내지 않는다 · 이용 정지 확인을 하지 않는다(내 상태 보기는 막지 않는다).
 *
 * 실행: cd jam-web && npx vitest run src/app/api/capsule/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { d } from '@/lib/i18n'

const USER_ID = '11111111-1111-4111-8111-111111111111'

const state = vi.hoisted(() => ({ authenticated: true }))
const getStatusMock = vi.hoisted(() => vi.fn())
const assertNotSuspendedMock = vi.hoisted(() => vi.fn())
const serviceClient = vi.hoisted(() => ({ marker: 'service-role-client' }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        state.authenticated
          ? { data: { user: { id: USER_ID } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
  }),
  createServiceClient: () => serviceClient,
}))
vi.mock('@/lib/capsule/capsule', () => ({
  getCapsuleStatus: (...args: unknown[]) => getStatusMock(...args),
}))
vi.mock('@/lib/suspension/suspension', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/suspension/suspension')>()
  return { ...actual, assertNotSuspended: (...args: unknown[]) => assertNotSuspendedMock(...args) }
})

import { GET } from '../route'

const STATUS = {
  required: 110,
  filled: 30,
  remaining: 80,
  balance: 45,
  openable: false,
  notOpenableReason: 'not_full',
  freeSlots: 1,
  neededSlots: 2,
  pendingCount: 1,
  jamBlocked: false,
  alertStage: 80,
  claim: { available: false, blockedReason: 'no_slots', freeSlots: 1, neededSlots: 2 },
  notice: 'pending_nearly_full',
}

beforeEach(() => {
  state.authenticated = true
  getStatusMock.mockReset()
  assertNotSuspendedMock.mockReset()
})

describe('GET /api/capsule', () => {
  it('비로그인은 401이고 캡슐을 읽지 않는다', async () => {
    state.authenticated = false

    const res = await GET()

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: d.common.authRequired })
    expect(getStatusMock).not.toHaveBeenCalled()
  })

  it('세션 유저의 캡슐 상태를 서비스 클라이언트로 읽어 돌려준다', async () => {
    getStatusMock.mockResolvedValue(STATUS)

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(STATUS)
    expect(getStatusMock).toHaveBeenCalledWith(serviceClient, USER_ID)
  })

  it('보류·안내 값(pendingCount·jamBlocked·alertStage·claim·notice)을 응답 본문에 모두 싣는다', async () => {
    getStatusMock.mockResolvedValue(STATUS)

    const body = await (await GET()).json()

    expect(body).toMatchObject({
      pendingCount: 1,
      jamBlocked: false,
      alertStage: 80,
      claim: { available: false, blockedReason: 'no_slots', freeSlots: 1, neededSlots: 2 },
      notice: 'pending_nearly_full',
    })
  })

  it('이용 정지 확인을 하지 않는다', async () => {
    getStatusMock.mockResolvedValue(STATUS)

    await GET()

    expect(assertNotSuspendedMock).not.toHaveBeenCalled()
  })

  it('읽기 실패는 500이고 원문 오류를 내려보내지 않는다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getStatusMock.mockRejectedValue(new Error('capsule_get_or_create RPC 오류: secret detail'))

    const res = await GET()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.capsule.loadFailed })
  })
})
