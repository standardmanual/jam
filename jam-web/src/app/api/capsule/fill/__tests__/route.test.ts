/**
 * POST /api/capsule/fill — 캡슐 채우기 (티켓 20261018_0052 1회)
 *
 * 고정하는 것:
 * - 비로그인은 401이고 채우지 않는다.
 * - 입력 검증: 본문이 비었거나 `amount`가 없으면 기본값(남은 양)이고, `amount`는 양의 정수(상한 이하)만 받는다. 어기면 400 `invalid_amount`이고
 *   채우지 않는다. 본문의 `userId`는 무시하고 세션 유저로만 채운다.
 * - 정상은 200과 채운 양·캡슐 상태다.
 * - 이용 정지는 403(`code: 'user_suspended'`, `d.suspension.capsuleBlocked`, 2-6과 같은 모양)이다. 앱 코드가 던진 경우와 DB 함수가 거절한 경우 모두다.
 * - DB 거절 코드: `already_full`·`exceeds_remaining`(남은 양 포함)·`invalid_amount` 400, `insufficient_jam`·`capsule_changed` 409(문구는 «캡슐이 방금 바뀌었어요. 다시 시도해 주세요.»). 그 밖의 오류는 500(`d.capsule.fillFailed`).
 *
 * 실행: cd jam-web && npx vitest run src/app/api/capsule/fill/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { d } from '@/lib/i18n'
import { CAPSULE_AMOUNT_MAX } from '@/lib/capsule/capsule-contract'
import { UserSuspendedError } from '@/lib/suspension/suspension'
import { USER_SUSPENDED_CODE } from '@/lib/suspension/suspension-contract'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '99999999-9999-4999-8999-999999999999'

const state = vi.hoisted(() => ({ authenticated: true }))
const fillMock = vi.hoisted(() => vi.fn())
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
vi.mock('@/lib/capsule/capsule', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/capsule/capsule')>()
  return { ...actual, fillCapsule: (...args: unknown[]) => fillMock(...args) }
})

import { CapsuleError } from '@/lib/capsule/capsule'
import { POST } from '../route'

const post = (body?: unknown) =>
  POST(
    new Request('http://localhost/api/capsule/fill', {
      method: 'POST',
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    })
  )

const FILLED = { applied: 30, required: 110, filled: 60, remaining: 50, balance: 12, openable: false, notOpenableReason: 'not_full' }

beforeEach(() => {
  state.authenticated = true
  fillMock.mockReset()
  fillMock.mockResolvedValue(FILLED)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/capsule/fill — 인증과 입력', () => {
  it('비로그인은 401이고 채우지 않는다', async () => {
    state.authenticated = false

    const res = await post({ amount: 10 })

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: d.common.authRequired })
    expect(fillMock).not.toHaveBeenCalled()
  })

  it.each([
    ['본문 없음', undefined],
    ['빈 객체', {}],
    ['amount 생략과 userId만', { userId: OTHER_USER_ID }],
  ])('%s는 기본값(남은 양)으로 채우고 세션 유저만 대상이다', async (_label, body) => {
    const res = await post(body)

    expect(res.status).toBe(200)
    expect(fillMock).toHaveBeenCalledWith(serviceClient, USER_ID, undefined)
  })

  it('양의 정수 amount는 그대로 넘긴다', async () => {
    const res = await post({ amount: 30 })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(FILLED)
    expect(fillMock).toHaveBeenCalledWith(serviceClient, USER_ID, 30)
  })

  it.each([
    ['0', { amount: 0 }],
    ['음수', { amount: -5 }],
    ['소수', { amount: 1.5 }],
    ['문자열', { amount: '10' }],
    ['null', { amount: null }],
    ['상한 초과', { amount: CAPSULE_AMOUNT_MAX + 1 }],
    ['배열 본문', [10]],
    ['JSON이 아닌 본문', 'not json'],
  ])('amount가 %s이면 400 invalid_amount이고 채우지 않는다', async (_label, body) => {
    const res = await post(body)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: d.capsule.invalidAmount, code: 'invalid_amount' })
    expect(fillMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/capsule/fill — 거절과 오류', () => {
  it('앱 코드의 이용 정지는 403 user_suspended다(2-6과 같은 모양)', async () => {
    fillMock.mockRejectedValue(new UserSuspendedError({ reason: '어뷰징', suspendedAt: '2026-10-18T00:00:00Z' }))

    const res = await post({ amount: 10 })

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.suspension.capsuleBlocked, code: USER_SUSPENDED_CODE })
  })

  it('DB 함수가 이용 정지로 거절해도 403 user_suspended다', async () => {
    fillMock.mockRejectedValue(new CapsuleError('user_suspended'))

    const res = await post()

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.suspension.capsuleBlocked, code: USER_SUSPENDED_CODE })
  })

  it.each([
    ['already_full', 400, d.capsule.alreadyFull],
    ['invalid_amount', 400, d.capsule.invalidAmount],
    ['insufficient_jam', 409, d.capsule.insufficientJam],
    ['capsule_changed', 409, '캡슐이 방금 바뀌었어요. 다시 시도해 주세요.'],
  ] as const)('DB 거절 %s는 %i와 정해진 문구다', async (code, status, message) => {
    fillMock.mockRejectedValue(new CapsuleError(code))

    const res = await post({ amount: 10 })

    expect(res.status).toBe(status)
    expect(await res.json()).toEqual({ error: message, code })
  })

  it('exceeds_remaining은 400이고 남은 양을 함께 내려준다', async () => {
    fillMock.mockRejectedValue(new CapsuleError('exceeds_remaining', 40))

    const res = await post({ amount: 999 })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: d.capsule.exceedsRemaining, code: 'exceeds_remaining', remaining: 40 })
  })

  it('열기 전용 거절 코드가 채우기에서 나오면 500이다(채우기 문구로 오인하지 않는다)', async () => {
    fillMock.mockRejectedValue(new CapsuleError('not_full'))

    const res = await post({ amount: 10 })

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.capsule.fillFailed })
  })

  it('그 밖의 오류는 500이고 원문 오류를 내려보내지 않는다', async () => {
    fillMock.mockRejectedValue(new Error('capsule_fill RPC 오류: secret detail'))

    const res = await post({ amount: 10 })

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.capsule.fillFailed })
  })
})
