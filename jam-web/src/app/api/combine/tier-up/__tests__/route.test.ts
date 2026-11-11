/**
 * POST /api/combine/tier-up — 등급 올리기 API (티켓 20261022_2119 2회, 20261023_1648 2회, 20261108_2321)
 *
 * 검증 대상:
 *  - 401(로그인 없음) · 400(본문이 `itemIds` 6개 문자열 배열이 아님)에서는 등급 올리기를 부르지 않는다
 *  - 로그인한 유저 id와 본문의 `itemIds`만 엔진에 넘긴다 — 확률·결과를 정하는 값은 본문에서 받지 않는다.
 *    `collectionId`를 보내도 무시한다(검사하지 않고 엔진에도 넘기지 않는다). 컬렉션은 서버가 트라이브와 무관하게 서비스 전체에서 뽑는다
 *  - 이용 정지는 엔진이 던지는 `UserSuspendedError`를 403(`code: 'user_suspended'`)으로 바꾼다
 *  - 잠긴 개체·받지 않은 결과는 `code`를 더해 409로 내리고, 그 밖의 거절은 200에 `success: false`와 사용자 문구를 싣는다 (믹스 라우트와 같은 규칙)
 *  - 성공 응답은 엔진 결과 그대로(결과 배지의 `imageUrl` 포함)고, 결과를 받지 않은 상태로 남기면(`pending`) 안내 문구가 붙는다
 *  - 엔진이 그 밖의 오류를 던지면 500이다. JAM! 행동 지표는 판정하지 않는다
 *
 * 실행: cd jam-web && npx vitest run src/app/api/combine/tier-up/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { TierUpResult } from '@/lib/combine/tierUp'
import { d } from '@/lib/i18n'
import { UserSuspendedError } from '@/lib/suspension/suspension'
import { USER_SUSPENDED_CODE } from '@/lib/suspension/suspension-contract'

const USER_ID = 'user-1'
const ITEM_IDS = ['item-1', 'item-2', 'item-3', 'item-4', 'item-5', 'item-6']

const state = vi.hoisted(() => ({ authenticated: true }))
const tierUpMock = vi.hoisted(() => vi.fn<(userId: string, itemIds: string[]) => Promise<TierUpResult>>())
const runJamActionMock = vi.hoisted(() => vi.fn())
const settleMock = vi.hoisted(() => vi.fn<(supabase: unknown, userId: string) => Promise<void>>())

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        state.authenticated
          ? { data: { user: { id: USER_ID, email: 'user@example.com' } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
  }),
  createServiceClient: () => ({}),
}))
vi.mock('@/lib/capsule/settle-pending', () => ({
  settleAfterSlotsFreed: (supabase: unknown, userId: string) => settleMock(supabase, userId),
}))
// 규칙 본체는 갈아끼운다 — 이 시험은 라우트의 입력 확인과 응답 변환만 본다
vi.mock('@/lib/combine/tierUp', () => ({
  TIER_UP_MATERIAL_COUNT: 6,
  tierUp: (userId: string, itemIds: string[]) => tierUpMock(userId, itemIds),
}))
vi.mock('@/lib/badge-engine/jamActionRoute', () => ({
  runJamActionEvaluation: (...args: unknown[]) => runJamActionMock(...args),
}))

import { POST } from '../route'

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/combine/tier-up', { method: 'POST', body: JSON.stringify(body) })
}

const VALID_BODY = { itemIds: ITEM_IDS }

const SUCCESS: TierUpResult = {
  success: true,
  path: 'tier_up',
  materialRarity: 'common',
  resultBadges: [{ id: 'b1', name: '결과 배지', rarity: 'rare', imageUrl: 'https://cdn.example/b1.png' }],
  pointsAwarded: 0,
  resultStatus: 'granted',
}

beforeEach(() => {
  vi.clearAllMocks()
  state.authenticated = true
  tierUpMock.mockResolvedValue(SUCCESS)
  settleMock.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('입력 확인', () => {
  it('로그인하지 않았으면 401이고 등급 올리기를 하지 않는다', async () => {
    state.authenticated = false

    const res = await POST(request(VALID_BODY))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: d.common.authRequired })
    expect(tierUpMock).not.toHaveBeenCalled()
  })

  it.each([
    ['본문 없음', null],
    ['itemIds 없음', {}],
    ['배열이 아님', { itemIds: 'item-1' }],
    ['5개', { itemIds: ITEM_IDS.slice(0, 5) }],
    ['7개', { itemIds: [...ITEM_IDS, 'item-7'] }],
    ['문자열이 아닌 값 포함', { itemIds: ['item-1', 2, 'item-3', 'item-4', 'item-5', 'item-6'] }],
    ['빈 문자열 포함', { itemIds: ['item-1', '', 'item-3', 'item-4', 'item-5', 'item-6'] }],
  ])('itemIds가 %s이면 400 invalid_count이고 등급 올리기를 하지 않는다', async (_label, body) => {
    const res = await POST(request(body))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      success: false,
      reason: 'invalid_count',
      pointsAwarded: 0,
      message: d.combine.tierUp.invalidCount,
    })
    expect(tierUpMock).not.toHaveBeenCalled()
  })

  it('본문에 다른 값(등급, 결과, 확률)을 실어도 엔진에는 유저 id와 itemIds만 넘긴다', async () => {
    await POST(request({ ...VALID_BODY, rarity: 'mystic', badgeId: 'b-1', probability: 1, userId: 'someone-else' }))

    expect(tierUpMock).toHaveBeenCalledTimes(1)
    expect(tierUpMock).toHaveBeenCalledWith(USER_ID, ITEM_IDS)
  })

  it.each([
    ['문자열', 'book-1'],
    ['문자열이 아님', 123],
    ['null', null],
    ['빈 문자열', ''],
  ])('collectionId가 %s이어도 무시한다 — 엔진에 넘기지 않고 응답도 같다', async (_label, collectionId) => {
    const withoutCollection = await (await POST(request(VALID_BODY))).json()
    tierUpMock.mockClear()

    const res = await POST(request({ itemIds: ITEM_IDS, collectionId }))

    expect(tierUpMock).toHaveBeenCalledTimes(1)
    expect(tierUpMock).toHaveBeenCalledWith(USER_ID, ITEM_IDS)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(withoutCollection)
  })
})

describe('성공', () => {
  it('재료 소각으로 칸이 비므로 대기 보상 자동 지급을 그 유저로 한 번 부른다 (티켓 20261105_1438 R2)', async () => {
    await POST(request(VALID_BODY))

    expect(settleMock).toHaveBeenCalledTimes(1)
    expect(settleMock.mock.calls[0][1]).toBe(USER_ID)
  })

  it('엔진 결과를 그대로 내려준다', async () => {
    const res = await POST(request(VALID_BODY))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(SUCCESS)
  })

  it('결과를 받지 않은 상태로 남기면 안내 문구가 붙는다', async () => {
    const pending: TierUpResult = {
      success: true,
      path: 'tier_up',
      materialRarity: 'rare',
      resultBadges: [],
      pointsAwarded: 0,
      resultStatus: 'pending',
      pendingCount: 1,
      freeSlots: 0,
    }
    tierUpMock.mockResolvedValue(pending)

    const res = await POST(request(VALID_BODY))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ...pending, message: d.combine.resultPending })
  })

  it('JAM! 행동 지표는 판정하지 않는다', async () => {
    await POST(request(VALID_BODY))

    expect(runJamActionMock).not.toHaveBeenCalled()
  })
})

describe('거절', () => {
  it('소각 전에 거절하면 대기 보상 자동 지급을 부르지 않는다', async () => {
    tierUpMock.mockResolvedValue({ success: false, reason: 'locked_item_not_allowed', pointsAwarded: 0 } as unknown as TierUpResult)
    await POST(request(VALID_BODY))
    expect(settleMock).not.toHaveBeenCalled()
  })

  it('이용 정지 중이면 403과 code user_suspended다', async () => {
    tierUpMock.mockRejectedValue(new UserSuspendedError({ reason: '운영 정책 위반', suspendedAt: '2026-10-01T00:00:00.000Z' }))

    const res = await POST(request(VALID_BODY))

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.suspension.combineBlocked, code: USER_SUSPENDED_CODE })
  })

  it('잠긴 개체가 섞였으면 409와 code locked_item_not_allowed다', async () => {
    tierUpMock.mockResolvedValue({ success: false, reason: 'locked_item_not_allowed', pointsAwarded: 0 })

    const res = await POST(request(VALID_BODY))

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      success: false,
      reason: 'locked_item_not_allowed',
      pointsAwarded: 0,
      code: 'locked_item_not_allowed',
      message: d.lockedItem.combine,
    })
  })

  it('받지 않은 결과가 남았으면 409와 code pending_results_exist다', async () => {
    tierUpMock.mockResolvedValue({ success: false, reason: 'pending_results_exist', pointsAwarded: 0 })

    const res = await POST(request(VALID_BODY))

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      success: false,
      reason: 'pending_results_exist',
      pointsAwarded: 0,
      code: 'pending_results_exist',
      message: d.combine.pendingResultsExist,
    })
  })

  it.each([
    ['items_not_found', d.combine.itemsNotFound],
    ['invalid_materials', d.combine.tierUp.invalidMaterials],
    ['no_candidate', d.combine.tierUp.noCandidate],
    ['invalid_count', d.combine.tierUp.invalidCount],
  ] as const)('%s는 200에 success: false와 사용자 문구를 싣는다', async (reason, message) => {
    tierUpMock.mockResolvedValue({ success: false, reason, pointsAwarded: 0 })

    const res = await POST(request(VALID_BODY))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: false, reason, pointsAwarded: 0, message })
  })

  it('후보 없음 거절 문구는 message로 내려온다', async () => {
    tierUpMock.mockResolvedValue({ success: false, reason: 'no_candidate', pointsAwarded: 0 })
    const noCandidate = await (await POST(request(VALID_BODY))).json()
    expect(noCandidate.message).toBe('지금은 받을 수 있는 아이템 배지가 없어요. 넣은 재료는 그대로 있어요. 잠시 뒤에 다시 해 보세요.')
  })

  it('엔진이 그 밖의 오류를 던지면 500이고 시스템 오류 문구를 그대로 내리지 않는다', async () => {
    tierUpMock.mockRejectedValue(new Error('combine_pending_results 개수 조회 실패: connection reset'))

    const res = await POST(request(VALID_BODY))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.combine.genericFail })
    expect(console.error).toHaveBeenCalled()
  })
})
