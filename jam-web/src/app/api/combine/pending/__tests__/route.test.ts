/**
 * /api/combine/pending — 받지 않은 믹스 결과 조회와 받기 (티켓 20261018_0055)
 *
 * 고정하는 것:
 * - 비로그인은 GET·POST 모두 401이고 아무것도 읽거나 쓰지 않는다.
 * - GET은 세션 유저의 받지 않은 결과 목록과 인벤토리 빈칸 수를 돌려준다. 실패는 500(`d.combine.claim.loadFailed`).
 *   이용 정지 중에도 막지 않는다(내 기록 보기).
 * - POST는 세션 유저만 대상으로 서비스 클라이언트로 `claimPendingResults`를 한 번 부른다. 본문은 쓰지 않는다.
 * - DB 함수의 거절 코드를 상태 코드와 `d.combine.claim.*` 문구로 바꾼다(`no_pending` 409, `insufficient_slots` 409+free·needed,
 *   `inventory_not_found` 404). 그 밖의 오류는 500(`d.combine.claim.failed`).
 * - POST는 이용 정지 중이면 403(`code: 'user_suspended'`, `d.suspension.combineClaimBlocked`)이고 받기를 부르지 않는다.
 *   정지 여부를 읽지 못하면 500이고 받기를 부르지 않는다. DB 함수가 `user_suspended`를 돌려줘도 403이다.
 *
 * 실행: cd jam-web && npx vitest run src/app/api/combine/pending/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { d } from '@/lib/i18n'
import { UserSuspendedError } from '@/lib/suspension/suspension'
import { USER_SUSPENDED_CODE } from '@/lib/suspension/suspension-contract'

const USER_ID = '11111111-1111-4111-8111-111111111111'

const state = vi.hoisted(() => ({ authenticated: true }))
const listMock = vi.hoisted(() => vi.fn())
const claimMock = vi.hoisted(() => vi.fn())
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
vi.mock('@/lib/combine/pending', () => ({
  listPendingResults: (...args: unknown[]) => listMock(...args),
  claimPendingResults: (...args: unknown[]) => claimMock(...args),
}))
vi.mock('@/lib/suspension/suspension', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/suspension/suspension')>()
  return { ...actual, assertNotSuspended: (...args: unknown[]) => assertNotSuspendedMock(...args) }
})

import { GET, POST } from '../route'

beforeEach(() => {
  vi.clearAllMocks()
  state.authenticated = true
  assertNotSuspendedMock.mockResolvedValue(undefined)
})

describe('GET — 목록', () => {
  it('비로그인이면 401이고 읽지 않는다', async () => {
    state.authenticated = false
    const res = await GET()
    expect(res.status).toBe(401)
    expect(listMock).not.toHaveBeenCalled()
  })

  it('세션 유저의 목록을 서비스 클라이언트로 읽어 그대로 돌려준다', async () => {
    const payload = { pendingCount: 1, freeSlots: 0, items: [{ id: 'p1', locked: true }] }
    listMock.mockResolvedValue(payload)

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(payload)
    expect(listMock).toHaveBeenCalledWith(serviceClient, USER_ID)
  })

  it('이용 정지 중에도 막지 않는다', async () => {
    listMock.mockResolvedValue({ pendingCount: 0, freeSlots: 0, items: [] })
    assertNotSuspendedMock.mockRejectedValue(new UserSuspendedError({ reason: 'x', suspendedAt: '2026-10-01T00:00:00.000Z' }))

    const res = await GET()

    expect(res.status).toBe(200)
    expect(assertNotSuspendedMock).not.toHaveBeenCalled()
  })

  it('읽기에 실패하면 500과 안내 문구다', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    listMock.mockRejectedValue(new Error('down'))

    const res = await GET()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.combine.claim.loadFailed })
    errorSpy.mockRestore()
  })
})

describe('POST — 받기', () => {
  it('비로그인이면 401이고 받지 않는다', async () => {
    state.authenticated = false
    const res = await POST()
    expect(res.status).toBe(401)
    expect(claimMock).not.toHaveBeenCalled()
  })

  it('성공하면 받은 개수와 개체 id를 돌려주고 받기는 한 번만 부른다', async () => {
    claimMock.mockResolvedValue({ ok: true, granted: 2, itemIds: ['i1', 'i2'] })

    const res = await POST()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ granted: 2, itemIds: ['i1', 'i2'] })
    expect(claimMock).toHaveBeenCalledTimes(1)
    expect(claimMock).toHaveBeenCalledWith(serviceClient, USER_ID)
    expect(assertNotSuspendedMock).toHaveBeenCalledWith(serviceClient, USER_ID)
  })

  it('빈칸이 모자라면 409와 free·needed를 내린다', async () => {
    claimMock.mockResolvedValue({ ok: false, error: 'insufficient_slots', free: 1, needed: 3 })

    const res = await POST()

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: d.combine.claim.insufficientSlots,
      code: 'insufficient_slots',
      free: 1,
      needed: 3,
    })
  })

  it('받을 결과가 없으면 409, 인벤토리가 없으면 404다', async () => {
    claimMock.mockResolvedValueOnce({ ok: false, error: 'no_pending' })
    const none = await POST()
    expect(none.status).toBe(409)
    expect(await none.json()).toEqual({ error: d.combine.claim.noPending, code: 'no_pending' })

    claimMock.mockResolvedValueOnce({ ok: false, error: 'inventory_not_found' })
    const missing = await POST()
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: d.combine.claim.inventoryNotFound, code: 'inventory_not_found' })
  })

  it('이용 정지 중이면 403이고 받기를 부르지 않는다', async () => {
    assertNotSuspendedMock.mockRejectedValue(new UserSuspendedError({ reason: 'x', suspendedAt: '2026-10-01T00:00:00.000Z' }))

    const res = await POST()

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.suspension.combineClaimBlocked, code: USER_SUSPENDED_CODE })
    expect(claimMock).not.toHaveBeenCalled()
  })

  it('정지 여부를 읽지 못하면 500이고 받기를 부르지 않는다', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    assertNotSuspendedMock.mockRejectedValue(new Error('user_suspensions 조회 실패'))

    const res = await POST()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.combine.claim.failed })
    expect(claimMock).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('DB 함수가 user_suspended를 돌려줘도 403이다(검사와 호출 사이에 정지가 걸린 경우)', async () => {
    claimMock.mockResolvedValue({ ok: false, error: 'user_suspended' })

    const res = await POST()

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.suspension.combineClaimBlocked, code: USER_SUSPENDED_CODE })
  })

  it('받기 중 예외는 500과 안내 문구다', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    claimMock.mockRejectedValue(new Error('combine_claim_pending RPC 오류'))

    const res = await POST()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.combine.claim.failed })
    errorSpy.mockRestore()
  })
})
