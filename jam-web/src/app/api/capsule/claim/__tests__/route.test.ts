/**
 * POST /api/capsule/claim — 보류된 캡슐 보상 받기 (티켓 20261028_1734 2회)
 *
 * 고정하는 것:
 * - 비로그인은 401이고 받지 않는다. 대상은 세션 유저뿐이다(본문은 읽지 않는다).
 * - 받은 것이 있으면 200과 받은 개체·남은 보류 수·멈춘 이유. 일부만 받고 빈칸이 모자라 멈췄으면 freeSlots·neededSlots도 싣는다.
 * - 받은 것이 하나도 없고 빈칸이 모자라면 409 insufficient_slots(freeSlots·neededSlots), 보류가 없으면 409 no_pending.
 * - 이용 정지는 403(`code: 'user_suspended'`, `d.suspension.capsuleClaimBlocked`) — 앱 코드가 던진 경우와 DB 함수가 거절한 경우 모두다.
 * - no_tribe·capsule_changed 409, 그 밖의 오류는 500이고 내부 오류 원문을 내려보내지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/app/api/capsule/claim/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { d } from '@/lib/i18n'
import { UserSuspendedError } from '@/lib/suspension/suspension'
import { USER_SUSPENDED_CODE } from '@/lib/suspension/suspension-contract'

const USER_ID = '11111111-1111-4111-8111-111111111111'

const state = vi.hoisted(() => ({ authenticated: true }))
const claimMock = vi.hoisted(() => vi.fn())
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
vi.mock('@/lib/capsule/claim', () => ({ claimPendingCapsules: (...args: unknown[]) => claimMock(...args) }))

import { CapsuleError } from '@/lib/capsule/capsule'
import { POST } from '../route'

const ITEMS = [{ locked: false, inventoryItemId: 'inv-1', badgeId: 'b', name: '이름', imageUrl: null, rarity: 'epic', serialNumber: 7 }]
const CLAIMED = { pendingId: 'pending-1', openId: 'open-1', chapterNo: 2, items: ITEMS }

beforeEach(() => {
  state.authenticated = true
  claimMock.mockReset()
  claimMock.mockResolvedValue({ pendingBefore: 1, claimed: [CLAIMED], remainingPending: 0, stopped: 'none' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/capsule/claim', () => {
  it('비로그인은 401이고 받지 않는다', async () => {
    state.authenticated = false

    const res = await POST()

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: d.common.authRequired })
    expect(claimMock).not.toHaveBeenCalled()
  })

  it('정상은 200과 받은 개체·남은 보류 수이고, 세션 유저만 대상이다 (내부 pendingId는 싣지 않는다)', async () => {
    const res = await POST()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      claimed: [{ openId: 'open-1', chapterNo: 2, items: ITEMS }],
      remainingPending: 0,
      stopped: 'none',
    })
    expect(claimMock).toHaveBeenCalledWith(serviceClient, USER_ID)
  })

  it('일부만 받고 빈칸이 모자라 멈췄으면 200에 남은 보류 수와 freeSlots·neededSlots를 싣는다', async () => {
    claimMock.mockResolvedValue({
      pendingBefore: 2,
      claimed: [CLAIMED],
      remainingPending: 1,
      stopped: 'insufficient_slots',
      freeSlots: 0,
      neededSlots: 2,
    })

    const res = await POST()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      claimed: [{ openId: 'open-1', chapterNo: 2, items: ITEMS }],
      remainingPending: 1,
      stopped: 'insufficient_slots',
      freeSlots: 0,
      neededSlots: 2,
    })
  })

  it('하나도 받지 못하고 빈칸이 모자라면 409 insufficient_slots와 freeSlots·neededSlots다', async () => {
    claimMock.mockResolvedValue({ pendingBefore: 2, claimed: [], remainingPending: 2, stopped: 'insufficient_slots', freeSlots: 1, neededSlots: 2 })

    const res = await POST()

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: d.capsule.claimInsufficientSlots, code: 'insufficient_slots', freeSlots: 1, neededSlots: 2 })
  })

  it('받을 보류가 없으면 409 no_pending이다', async () => {
    claimMock.mockResolvedValue({ pendingBefore: 0, claimed: [], remainingPending: 0, stopped: 'none' })

    const res = await POST()

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: d.capsule.claimNoPending, code: 'no_pending' })
  })

  it('보류는 있었는데 다른 요청이 먼저 모두 받아 하나도 못 받았으면 409 no_pending이다', async () => {
    claimMock.mockResolvedValue({ pendingBefore: 1, claimed: [], remainingPending: 0, stopped: 'none' })

    const res = await POST()

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: d.capsule.claimNoPending, code: 'no_pending' })
  })

  it('앱 코드의 이용 정지는 403 user_suspended다', async () => {
    claimMock.mockRejectedValue(new UserSuspendedError({ reason: '어뷰징', suspendedAt: '2026-10-29T00:00:00Z' }))

    const res = await POST()

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.suspension.capsuleClaimBlocked, code: USER_SUSPENDED_CODE })
  })

  it('DB 함수가 이용 정지로 거절해도 403 user_suspended다', async () => {
    claimMock.mockRejectedValue(new CapsuleError('user_suspended'))

    const res = await POST()

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.suspension.capsuleClaimBlocked, code: USER_SUSPENDED_CODE })
  })

  it.each([
    ['no_tribe', d.capsule.claimNoTribe],
    ['capsule_changed', d.capsule.changed],
  ] as const)('%s는 409와 정해진 문구다', async (code, message) => {
    claimMock.mockRejectedValue(new CapsuleError(code))

    const res = await POST()

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: message, code })
  })

  it.each(['invalid_items', 'inventory_not_found'] as const)('DB 내부 거절 %s는 500이다', async (code) => {
    claimMock.mockRejectedValue(new CapsuleError(code))

    const res = await POST()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.capsule.claimFailed })
  })

  it('그 밖의 오류는 500이고 원문 오류를 내려보내지 않는다', async () => {
    claimMock.mockRejectedValue(new Error('capsule_claim_pending RPC 오류: secret detail'))

    const res = await POST()

    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('secret')
    expect(JSON.parse(text)).toEqual({ error: d.capsule.claimFailed })
  })
})
