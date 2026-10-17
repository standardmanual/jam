/**
 * /api/strava/pending-items — 동기화 보류 조회와 고르기 (티켓 20261017_1425)
 *
 * 고정하는 것:
 * - 비로그인은 GET·POST 모두 401이고 아무것도 읽거나 쓰지 않는다.
 * - GET은 세션 유저의 대기 중 보류 목록과 골라야 할 개수를 돌려준다. 실패는 500(`d.syncPending.loadFailed`).
 * - POST는 입력을 서버가 검증한다: JSON 본문, `chosenIds`는 uuid 문자열의 중복 없는 배열(상한 이하, 빈 배열 허용). 어기면 400이고 RPC를 부르지 않는다.
 * - 고르기 대상은 세션 유저뿐이다 — 본문의 `userId`는 무시한다. RPC는 서비스 클라이언트로 부른다.
 * - DB 함수의 거절 코드를 상태 코드와 `d.syncPending.*` 문구로 바꾼다(`wrong_count` 400+expected, `invalid_selection` 400, `no_pending` 409,
 *   `inventory_not_found` 404). 그 밖의 오류는 500(`d.syncPending.resolveFailed`).
 *
 * 실행: cd jam-web && npx vitest run src/app/api/strava/pending-items/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { d } from '@/lib/i18n'
import { PENDING_CHOSEN_IDS_MAX } from '@/lib/strava/pending-items-contract'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '99999999-9999-4999-8999-999999999999'
const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const state = vi.hoisted(() => ({ authenticated: true }))
const getPendingMock = vi.hoisted(() => vi.fn())
const resolveMock = vi.hoisted(() => vi.fn())
const followUpMock = vi.hoisted(() => vi.fn())
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
vi.mock('@/lib/strava/pending-items', () => ({
  getPendingItems: (...args: unknown[]) => getPendingMock(...args),
  resolvePendingItems: (...args: unknown[]) => resolveMock(...args),
}))

vi.mock('@/lib/strava/pending-followups', () => ({
  runPendingFollowUps: (...args: unknown[]) => followUpMock(...args),
}))

import { GET, POST } from '../route'

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/strava/pending-items', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }))

beforeEach(() => {
  state.authenticated = true
  getPendingMock.mockReset()
  resolveMock.mockReset()
  followUpMock.mockReset()
  followUpMock.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/strava/pending-items', () => {
  it('비로그인이면 401이고 조회하지 않는다', async () => {
    state.authenticated = false

    const res = await GET()

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: d.common.authRequired })
    expect(getPendingMock).not.toHaveBeenCalled()
  })

  it('세션 유저의 대기 중 보류 목록과 골라야 할 개수를 돌려준다', async () => {
    const payload = {
      pendingCount: 3,
      freeSlots: 2,
      chooseCount: 2,
      items: [{ id: ID_A, badgeId: 'b1', name: '첫 숨결', imageUrl: null, rarity: 'common' }],
    }
    getPendingMock.mockResolvedValue(payload)

    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(payload)
    expect(getPendingMock).toHaveBeenCalledWith(serviceClient, USER_ID)
  })

  it('조회가 실패하면 500과 안내 문구다', async () => {
    getPendingMock.mockRejectedValue(new Error('boom'))

    const res = await GET()

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: d.syncPending.loadFailed })
  })
})

describe('POST /api/strava/pending-items — 인증과 입력 검증', () => {
  it('비로그인이면 401이고 고르기를 부르지 않는다', async () => {
    state.authenticated = false

    const res = await post({ chosenIds: [ID_A] })

    expect(res.status).toBe(401)
    expect(resolveMock).not.toHaveBeenCalled()
  })

  it.each([
    ['JSON이 아닌 본문', 'not json'],
    ['본문이 배열', [ID_A]],
    ['null 본문', null],
    ['chosenIds 없음', {}],
    ['chosenIds가 배열이 아님', { chosenIds: ID_A }],
    ['uuid가 아닌 문자열', { chosenIds: ['not-a-uuid'] }],
    ['문자열이 아닌 원소', { chosenIds: [1] }],
    ['null 원소', { chosenIds: [null] }],
    ['중복 id', { chosenIds: [ID_A, ID_A] }],
    ['대소문자만 다른 중복 id', { chosenIds: [ID_A, ID_A.toUpperCase()] }],
    ['길이 상한 초과', { chosenIds: Array.from({ length: PENDING_CHOSEN_IDS_MAX + 1 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`) }],
  ])('%s이면 400이고 고르기를 부르지 않는다', async (_name, body) => {
    const res = await post(body)

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: d.syncPending.invalidInput })
    expect(resolveMock).not.toHaveBeenCalled()
  })

  it('길이 상한 정확히는 통과한다', async () => {
    resolveMock.mockResolvedValue({ ok: true, granted: 0, discarded: 0, itemIds: [] })
    const chosenIds = Array.from({ length: PENDING_CHOSEN_IDS_MAX }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)

    const res = await post({ chosenIds })

    expect(res.status).toBe(200)
    expect(resolveMock).toHaveBeenCalledTimes(1)
  })

  it('빈 배열은 통과한다(빈칸이 0일 때 전부 고르지 않음으로 닫는다)', async () => {
    resolveMock.mockResolvedValue({ ok: true, granted: 0, discarded: 2, itemIds: [] })

    const res = await post({ chosenIds: [] })

    expect(res.status).toBe(200)
    expect(resolveMock).toHaveBeenCalledWith(serviceClient, USER_ID, [])
  })
})

describe('POST /api/strava/pending-items — 고르기', () => {
  it('세션 유저로만 고르기를 부르고 본문의 userId는 무시한다', async () => {
    resolveMock.mockResolvedValue({ ok: true, granted: 2, discarded: 1, itemIds: ['i1', 'i2'] })

    const res = await post({ chosenIds: [ID_A, ID_B], userId: OTHER_USER_ID })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ granted: 2, discarded: 1, itemIds: ['i1', 'i2'] })
    expect(resolveMock).toHaveBeenCalledWith(serviceClient, USER_ID, [ID_A, ID_B])
  })

  it('성공하면 받은 개체(itemIds)로 후속 처리(포인트·피드·결산)를 이어서 부른다', async () => {
    resolveMock.mockResolvedValue({ ok: true, granted: 2, discarded: 1, itemIds: ['i1', 'i2'] })

    await post({ chosenIds: [ID_A, ID_B] })

    expect(followUpMock).toHaveBeenCalledTimes(1)
    expect(followUpMock).toHaveBeenCalledWith(serviceClient, USER_ID, ['i1', 'i2'])
  })

  it('후속 처리가 던져도 응답은 성공 그대로다', async () => {
    resolveMock.mockResolvedValue({ ok: true, granted: 1, discarded: 0, itemIds: ['i1'] })
    followUpMock.mockRejectedValue(new Error('points down'))

    const res = await post({ chosenIds: [ID_A] })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ granted: 1, discarded: 0, itemIds: ['i1'] })
  })

  it.each([
    ['wrong_count', { ok: false, error: 'wrong_count', expected: 2 }],
    ['no_pending', { ok: false, error: 'no_pending' }],
  ])('고르기가 거절되면(%s) 후속 처리를 부르지 않는다', async (_name, result) => {
    resolveMock.mockResolvedValue(result)

    await post({ chosenIds: [ID_A] })

    expect(followUpMock).not.toHaveBeenCalled()
  })

  it('wrong_count는 400과 골라야 할 개수를 돌려준다', async () => {
    resolveMock.mockResolvedValue({ ok: false, error: 'wrong_count', expected: 2 })

    const res = await post({ chosenIds: [ID_A] })

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: d.syncPending.wrongCount, code: 'wrong_count', expected: 2 })
  })

  it.each([
    ['invalid_selection', 400, d.syncPending.invalidSelection],
    ['no_pending', 409, d.syncPending.noPending],
    ['inventory_not_found', 404, d.syncPending.inventoryNotFound],
  ] as const)('%s는 %i와 안내 문구다', async (code, status, message) => {
    resolveMock.mockResolvedValue({ ok: false, error: code })

    const res = await post({ chosenIds: [ID_A] })

    expect(res.status).toBe(status)
    await expect(res.json()).resolves.toEqual({ error: message, code })
  })

  it('RPC가 던지면 500과 안내 문구다', async () => {
    resolveMock.mockRejectedValue(new Error('rpc down'))

    const res = await post({ chosenIds: [ID_A] })

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: d.syncPending.resolveFailed })
  })
})
