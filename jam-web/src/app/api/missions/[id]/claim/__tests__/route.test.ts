/**
 * POST /api/missions/[id]/claim — 받지 않은 미션 보상 받기 시험 (티켓 20261019_1313, 운영 로직 13.2절·6.4절)
 *
 * 검증 대상:
 *  - 로그인하지 않았으면 401, 미션 id가 UUID가 아니면 DB를 부르지 않고 404
 *  - 이용 정지 중이면 DB 함수를 부르기 전에 403 `user_suspended`. 정지 여부를 읽지 못해도 받게 하지 않는다(500)
 *  - DB 함수의 거절을 상태 코드로 옮긴다: `no_pending` 409, `insufficient_slots` 409(`free`·`needed` 포함), `inventory_not_found` 404, `user_suspended` 403
 *  - RPC 오류·계약 밖 응답은 내부 정보 없이 500
 *  - 성공하면 `{ granted, itemIds }`를 돌려주고 받은 개체의 후속(배지 포인트·남은 칸 알림)을 처리한다. 거절이면 후속을 하지 않는다
 *
 * 실행: cd jam-web && npx vitest run "src/app/api/missions/[id]/claim/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { d } from '@/lib/i18n'

const USER = 'user-1'
const MISSION_ID = '11111111-2222-4333-8444-555555555555'

const state = vi.hoisted(() => ({
  authenticated: true,
  suspended: false,
  suspensionReadFails: false,
  rpcResult: { data: null, error: null } as { data: unknown; error: unknown },
  rpcCalls: [] as { fn: string; args: unknown }[],
}))

const followUpMock = vi.hoisted(() => vi.fn(async () => ({ openBadges: [], awardedPoints: 0 })))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        state.authenticated ? { data: { user: { id: USER } }, error: null } : { data: { user: null }, error: null },
    },
  }),
  createServiceClient: () => ({
    rpc: async (fn: string, args: unknown) => {
      state.rpcCalls.push({ fn, args })
      return state.rpcResult
    },
  }),
}))

vi.mock('@/lib/suspension/suspension', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/suspension/suspension')>()
  return {
    ...actual,
    assertNotSuspended: async () => {
      if (state.suspensionReadFails) throw new Error('user_suspensions 조회 실패')
      if (state.suspended) throw new actual.UserSuspendedError({ reason: '시험', suspendedAt: '2026-10-19T00:00:00Z' })
    },
  }
})

vi.mock('@/lib/missions/itemRewardFollowUp', () => ({ followUpItemRewards: followUpMock }))

import { POST } from '../route'

function call(id = MISSION_ID) {
  return POST(new Request('http://localhost/api/missions/x/claim', { method: 'POST' }), { params: Promise.resolve({ id }) })
}

function rpcReturns(data: unknown) {
  state.rpcResult = { data, error: null }
}

beforeEach(() => {
  state.authenticated = true
  state.suspended = false
  state.suspensionReadFails = false
  state.rpcResult = { data: null, error: null }
  state.rpcCalls = []
  followUpMock.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/missions/[id]/claim — 접근 검사', () => {
  it('로그인하지 않았으면 401이다', async () => {
    state.authenticated = false
    const res = await call()
    expect(res.status).toBe(401)
    expect(state.rpcCalls).toEqual([])
  })

  it('미션 id가 UUID가 아니면 DB를 부르지 않고 404다', async () => {
    const res = await call('not-a-uuid')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: d.missions.missionNotFound })
    expect(state.rpcCalls).toEqual([])
  })

  it('이용 정지 중이면 DB 함수를 부르지 않고 403 user_suspended다', async () => {
    state.suspended = true
    const res = await call()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.suspension.missionClaimBlocked, code: 'user_suspended' })
    expect(state.rpcCalls).toEqual([])
    expect(followUpMock).not.toHaveBeenCalled()
  })

  it('정지 여부를 읽지 못하면 받게 하지 않고 500이다', async () => {
    state.suspensionReadFails = true
    const res = await call()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.missions.claim.failed })
    expect(state.rpcCalls).toEqual([])
  })
})

describe('POST /api/missions/[id]/claim — DB 함수 거절 매핑', () => {
  it('받을 보상이 없으면 409 no_pending이다', async () => {
    rpcReturns({ ok: false, error: 'no_pending' })
    const res = await call()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: d.missions.claim.noPending, code: 'no_pending' })
    expect(followUpMock).not.toHaveBeenCalled()
  })

  it('빈칸이 모자라면 409 insufficient_slots와 free·needed를 싣는다', async () => {
    rpcReturns({ ok: false, error: 'insufficient_slots', free: 1, needed: 2 })
    const res = await call()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: d.missions.claim.insufficientSlots,
      code: 'insufficient_slots',
      free: 1,
      needed: 2,
    })
    expect(followUpMock).not.toHaveBeenCalled()
  })

  it('인벤토리가 없으면 404 inventory_not_found다', async () => {
    rpcReturns({ ok: false, error: 'inventory_not_found' })
    const res = await call()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: d.missions.claim.inventoryNotFound, code: 'inventory_not_found' })
  })

  it('DB 함수가 정지를 알려 오면(검사 사이에 걸린 경우) 403 user_suspended다', async () => {
    rpcReturns({ ok: false, error: 'user_suspended' })
    const res = await call()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.suspension.missionClaimBlocked, code: 'user_suspended' })
  })

  it('RPC 오류는 내부 정보 없이 500이다', async () => {
    state.rpcResult = { data: null, error: { message: 'connection to db-internal-host refused' } }
    const res = await call()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: d.missions.claim.failed })
    expect(JSON.stringify(body)).not.toContain('db-internal-host')
  })

  it('계약 밖 응답은 성공으로 보지 않고 500이다', async () => {
    rpcReturns({ ok: false, error: 'something_new' })
    const res = await call()
    expect(res.status).toBe(500)
    expect(followUpMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/missions/[id]/claim — 받기 성공', () => {
  it('세션 유저와 URL의 미션으로 DB 함수를 부르고 받은 개체를 돌려준다', async () => {
    rpcReturns({ ok: true, granted: 2, itemIds: ['ii-1', 'ii-2'] })

    const res = await call()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ granted: 2, itemIds: ['ii-1', 'ii-2'] })
    expect(state.rpcCalls).toEqual([
      { fn: 'mission_claim_item_rewards', args: { p_user_id: USER, p_mission_id: MISSION_ID } },
    ])
  })

  it('받은 개체의 후속(배지 포인트·남은 칸 알림)을 처리한다', async () => {
    rpcReturns({ ok: true, granted: 1, itemIds: ['ii-1'] })

    await call()

    expect(followUpMock).toHaveBeenCalledTimes(1)
    expect(followUpMock).toHaveBeenCalledWith(expect.anything(), { userId: USER, missionId: MISSION_ID, itemIds: ['ii-1'] })
  })
})
