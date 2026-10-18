/**
 * POST /api/capsule/open — 캡슐 열기 (티켓 20261018_0052 2회)
 *
 * 고정하는 것:
 * - 비로그인은 401이고 열지 않는다. 대상은 세션 유저뿐이다(본문은 읽지 않는다).
 * - 정상은 200과 나온 개체·다음 캡슐이다.
 * - 이용 정지는 403(`code: 'user_suspended'`, `d.suspension.capsuleOpenBlocked`, 2-6과 같은 모양)이다. 앱 코드가 던진 경우와 DB 함수가 거절한 경우 모두다.
 * - `not_full`·`no_tribe` 409, `insufficient_slots` 409(응답에 지금 빈칸 수 `freeSlots`와 필요한 빈칸 수 `neededSlots`).
 * - 그 밖의 오류(DB의 `invalid_items`·`inventory_not_found` 포함)는 500이고 내부 오류 원문을 내려보내지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/app/api/capsule/open/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { d } from '@/lib/i18n'
import { UserSuspendedError } from '@/lib/suspension/suspension'
import { USER_SUSPENDED_CODE } from '@/lib/suspension/suspension-contract'

const USER_ID = '11111111-1111-4111-8111-111111111111'

const state = vi.hoisted(() => ({ authenticated: true, afterCallbacks: [] as Array<() => unknown> }))
const runJamActionMock = vi.hoisted(() => vi.fn())
const openMock = vi.hoisted(() => vi.fn())
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
vi.mock('@/lib/capsule/open', () => ({ openCapsule: (...args: unknown[]) => openMock(...args) }))
vi.mock('@/lib/badge-engine/jamActionRoute', () => ({
  runJamActionEvaluation: (userId: string, triggers: readonly string[]) => runJamActionMock(userId, triggers),
}))
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (cb: () => unknown) => void state.afterCallbacks.push(cb) }
})

import { CapsuleError } from '@/lib/capsule/capsule'
import { POST } from '../route'

const OPENED = {
  openId: 'open-1',
  items: [
    { locked: true, inventoryItemId: 'inv-1', rarity: 'common', unlockRequired: 30 },
    { locked: false, inventoryItemId: 'inv-2', badgeId: 'b', name: '이름', imageUrl: null, rarity: 'epic', serialNumber: 7 },
  ],
  next: { required: 120, filled: 0 },
}

beforeEach(() => {
  state.authenticated = true
  state.afterCallbacks = []
  runJamActionMock.mockReset()
  openMock.mockReset()
  openMock.mockResolvedValue(OPENED)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/capsule/open', () => {
  it('비로그인은 401이고 열지 않는다', async () => {
    state.authenticated = false

    const res = await POST()

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: d.common.authRequired })
    expect(openMock).not.toHaveBeenCalled()
  })

  it('정상은 200과 개체·다음 캡슐이고, 세션 유저만 대상이다', async () => {
    const res = await POST()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(OPENED)
    expect(openMock).toHaveBeenCalledWith(serviceClient, USER_ID)
  })

  it('열기가 성공하면 응답 뒤에 캡슐 연 횟수·다른 트라이브 아이템 종류 수를 판정한다(티켓 20261018_1815)', async () => {
    const res = await POST()

    expect(res.status).toBe(200)
    expect(runJamActionMock).not.toHaveBeenCalled() // 응답을 보내기 전에는 부르지 않는다
    expect(state.afterCallbacks).toHaveLength(1)
    await state.afterCallbacks[0]()
    expect(runJamActionMock).toHaveBeenCalledWith(USER_ID, ['capsule_open_count', 'other_tribe_item_kinds_count'])
  })

  it('열기가 거절·실패하면 판정을 예약하지 않는다', async () => {
    openMock.mockRejectedValue(new CapsuleError('not_full'))

    const res = await POST()

    expect(res.status).toBe(409)
    expect(state.afterCallbacks).toHaveLength(0)
  })

  it('앱 코드의 이용 정지는 403 user_suspended다(2-6과 같은 모양)', async () => {
    openMock.mockRejectedValue(new UserSuspendedError({ reason: '어뷰징', suspendedAt: '2026-10-18T00:00:00Z' }))

    const res = await POST()

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.suspension.capsuleOpenBlocked, code: USER_SUSPENDED_CODE })
  })

  it('DB 함수가 이용 정지로 거절해도 403 user_suspended다', async () => {
    openMock.mockRejectedValue(new CapsuleError('user_suspended'))

    const res = await POST()

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.suspension.capsuleOpenBlocked, code: USER_SUSPENDED_CODE })
  })

  it.each([
    ['not_full', d.capsule.openNotFull],
    ['no_tribe', d.capsule.openNoTribe],
  ] as const)('%s는 409와 정해진 문구다', async (code, message) => {
    openMock.mockRejectedValue(new CapsuleError(code))

    const res = await POST()

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: message, code })
  })

  it('insufficient_slots는 409이고 지금 빈칸 수와 필요한 빈칸 수를 내려준다', async () => {
    openMock.mockRejectedValue(new CapsuleError('insufficient_slots', undefined, { freeSlots: 1, neededSlots: 2 }))

    const res = await POST()

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: d.capsule.openInsufficientSlots, code: 'insufficient_slots', freeSlots: 1, neededSlots: 2 })
  })

  it.each(['invalid_items', 'inventory_not_found'] as const)('DB 내부 거절 %s는 500이다', async (code) => {
    openMock.mockRejectedValue(new CapsuleError(code))

    const res = await POST()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.capsule.openFailed })
  })

  it('그 밖의 오류는 500이고 원문 오류를 내려보내지 않는다', async () => {
    openMock.mockRejectedValue(new Error('capsule_open RPC 오류: secret detail'))

    const res = await POST()

    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('secret')
    expect(JSON.parse(text)).toEqual({ error: d.capsule.openFailed })
  })
})
