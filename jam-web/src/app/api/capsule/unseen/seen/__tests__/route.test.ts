/**
 * POST /api/capsule/unseen/seen — 보지 않은 캡슐 결과 «봤어요» (티켓 20261028_1740 2회)
 *
 * 고정하는 것:
 * - 비로그인은 401이고 처리하지 않는다. 대상은 세션 유저뿐이다.
 * - 본문이 JSON이 아니거나, ids가 배열이 아니거나, 비었거나, 50개를 넘거나, UUID가 아닌 값이 섞이면 400이고 처리하지 않는다.
 * - 정상은 200과 `{ marked }`. 겹친 id는 하나로 본다. 같은 요청을 다시 보내 `marked: 0`이어도 200이다.
 * - 처리가 실패하면 500과 일반 문구이고 내부 오류 원문을 내려보내지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/app/api/capsule/unseen/seen/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { d } from '@/lib/i18n'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const ID_A = '22222222-2222-4222-8222-222222222222'
const ID_B = '33333333-3333-4333-8333-333333333333'

const state = vi.hoisted(() => ({ authenticated: true }))
const markMock = vi.hoisted(() => vi.fn())
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
vi.mock('@/lib/capsule/unseen', () => ({ markUnseenCapsuleResultsSeen: (...args: unknown[]) => markMock(...args) }))

import { POST } from '../route'

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/capsule/unseen/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  )

beforeEach(() => {
  state.authenticated = true
  markMock.mockReset()
  markMock.mockResolvedValue(1)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/capsule/unseen/seen', () => {
  it('비로그인은 401이고 처리하지 않는다', async () => {
    state.authenticated = false
    const res = await post({ ids: [ID_A] })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: d.common.authRequired })
    expect(markMock).not.toHaveBeenCalled()
  })

  it.each([
    ['JSON이 아닌 본문', 'not json'],
    ['본문이 객체가 아님', 'null'],
    ['ids 없음', {}],
    ['ids가 배열이 아님', { ids: ID_A }],
    ['빈 배열', { ids: [] }],
    ['UUID가 아닌 값', { ids: [ID_A, 'row-1'] }],
    ['문자열이 아닌 값', { ids: [ID_A, 7] }],
    ['51개', { ids: Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`) }],
  ])('%s는 400이고 처리하지 않는다', async (_name, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: d.capsule.seenInvalid })
    expect(markMock).not.toHaveBeenCalled()
  })

  it('정상은 200과 바뀐 행 수이고, 세션 유저만 대상이다', async () => {
    markMock.mockResolvedValue(2)
    const res = await post({ ids: [ID_A, ID_B] })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ marked: 2 })
    expect(markMock).toHaveBeenCalledWith(serviceClient, USER_ID, [ID_A, ID_B])
  })

  it('50개까지는 받고, 겹친 id는 하나로 본다', async () => {
    const fifty = Array.from({ length: 50 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    expect((await post({ ids: fifty })).status).toBe(200)
    await post({ ids: [ID_A, ID_A, ID_B] })
    expect(markMock).toHaveBeenLastCalledWith(serviceClient, USER_ID, [ID_A, ID_B])
  })

  it('같은 요청을 다시 보내 바뀐 행이 없어도 200이다 (marked 0)', async () => {
    markMock.mockResolvedValue(0)
    const res = await post({ ids: [ID_A] })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ marked: 0 })
  })

  it('처리가 실패하면 500과 일반 문구이고 내부 오류 원문을 싣지 않는다', async () => {
    markMock.mockRejectedValue(new Error('permission denied secret detail'))
    const res = await post({ ids: [ID_A] })
    expect(res.status).toBe(500)
    const text = JSON.stringify(await res.json())
    expect(text).toContain(d.capsule.seenFailed)
    expect(text).not.toContain('secret detail')
  })
})
