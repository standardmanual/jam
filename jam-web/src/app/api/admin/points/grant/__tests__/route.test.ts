/**
 * POST /api/admin/points/grant — 어드민 단건 지급/회수 (티켓 20261019_1314)
 *
 * 실행(executeAdminGrant)은 가짜로 바꿔, 라우트가 다음을 지키는지만 본다.
 *  - 어드민이 아니면 403, 본문·유저·검증이 틀리면 400, 고액이면 422 + requiresConfirmation
 *  - 회수 거절은 HTTP 409에 [현상]→[원인]→[해결책] 문구와 code·balance·requested (422와 겹치지 않는다)
 *  - 회수 성공·지급은 { transaction, balance }, 실행 실패는 500이며 내부 정보를 싣지 않는다
 * DB 쪽 음수 방지와 동시 직렬화는 마이그레이션 252 롤백 실측으로 확인했다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/points/grant/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const USER = '00000000-0000-4000-8000-000000000001'

const mocks = vi.hoisted(() => ({
  getAdminUser: vi.fn(),
  executeAdminGrant: vi.fn(),
}))

vi.mock('@/lib/admin/auth', () => ({ getAdminUser: mocks.getAdminUser }))
vi.mock('@/lib/points/admin-grant', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/points/admin-grant')>()),
  executeAdminGrant: mocks.executeAdminGrant,
}))

const { POST } = await import('../route')

function post(body: unknown): NextRequest {
  return new NextRequest('https://j-a-m.app/api/admin/points/grant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  mocks.getAdminUser.mockReset().mockResolvedValue({ id: 'admin-1', email: 'me@jam.app' })
  mocks.executeAdminGrant.mockReset().mockResolvedValue({ transaction: { id: 'tx-1' }, balance: 700 })
})

describe('접근과 검증', () => {
  it('어드민이 아니면 403이고 아무것도 실행하지 않는다', async () => {
    mocks.getAdminUser.mockResolvedValue(null)
    const res = await POST(post({ userId: USER, amount: 100, reasonLabel: 'cs_compensation' }))
    expect(res.status).toBe(403)
    expect(mocks.executeAdminGrant).not.toHaveBeenCalled()
  })

  it('본문이 JSON이 아니면 400', async () => {
    const res = await POST(post('not json'))
    expect(res.status).toBe(400)
    expect(mocks.executeAdminGrant).not.toHaveBeenCalled()
  })

  it('대상 유저가 없으면 400', async () => {
    const res = await POST(post({ amount: 100, reasonLabel: 'cs_compensation' }))
    expect(res.status).toBe(400)
    expect(mocks.executeAdminGrant).not.toHaveBeenCalled()
  })

  it('유저 id가 UUID 형식이 아니면 400으로 안내하고 실행하지 않는다(DB 형식 오류로 500이 되지 않는다)', async () => {
    for (const userId of ['not-a-uuid', '12345', '00000000-0000-4000-8000-00000000000g']) {
      const res = await POST(post({ userId, amount: -100, reasonLabel: 'cs_compensation' }))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toContain('형식이 올바르지 않아요')
    }
    expect(mocks.executeAdminGrant).not.toHaveBeenCalled()
  })

  it('금액이 0이면 400', async () => {
    const res = await POST(post({ userId: USER, amount: 0, reasonLabel: 'cs_compensation' }))
    expect(res.status).toBe(400)
    expect(mocks.executeAdminGrant).not.toHaveBeenCalled()
  })

  it('허용되지 않은 사유는 400', async () => {
    const res = await POST(post({ userId: USER, amount: -100, reasonLabel: 'made_up' }))
    expect(res.status).toBe(400)
    expect(mocks.executeAdminGrant).not.toHaveBeenCalled()
  })

  it('1,000P 이상 회수는 확인 없이는 422 + requiresConfirmation이고 실행하지 않는다', async () => {
    const res = await POST(post({ userId: USER, amount: -1000, reasonLabel: 'abuse_reclaim' }))
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ requiresConfirmation: true })
    expect(mocks.executeAdminGrant).not.toHaveBeenCalled()
  })
})

describe('회수 거절 (잔액보다 큰 회수)', () => {
  beforeEach(() => {
    mocks.executeAdminGrant.mockResolvedValue({
      rejected: true,
      code: 'insufficient_balance',
      balance: 300,
      requested: 500,
    })
  })

  it('HTTP 409에 사유 필드(code·balance·requested)와 문구를 돌려준다', async () => {
    const res = await POST(post({ userId: USER, amount: -500, reasonLabel: 'error_correction' }))

    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data).toMatchObject({ code: 'insufficient_balance', balance: 300, requested: 500 })
    expect(data.error).toBe(
      '회수하지 못했어요. 이 유저의 잔액이 300 포인트라 500 포인트는 회수할 수 없어요. 300 포인트 이하로 줄여서 다시 회수해 주세요.'
    )
    // 성공 응답의 필드가 섞이지 않는다
    expect(data.transaction).toBeUndefined()
  })

  it('고액 확인창의 422 + requiresConfirmation과 겹치지 않는다', async () => {
    const res = await POST(post({ userId: USER, amount: -500, reasonLabel: 'error_correction' }))
    const data = await res.json()

    expect(res.status).not.toBe(422)
    expect(data.requiresConfirmation).toBeUndefined()
  })

  it('고액 확인(confirmed:true)을 거친 회수가 거절돼도 409다', async () => {
    mocks.executeAdminGrant.mockResolvedValue({
      rejected: true,
      code: 'insufficient_balance',
      balance: 300,
      requested: 5000,
    })
    const res = await POST(post({ userId: USER, amount: -5000, reasonLabel: 'abuse_reclaim', confirmed: true }))

    expect(res.status).toBe(409)
    expect((await res.json()).requested).toBe(5000)
  })

  it('실행 함수에는 부호가 붙은 금액 그대로 넘긴다', async () => {
    await POST(post({ userId: USER, amount: -500, reasonLabel: 'error_correction' }))
    expect(mocks.executeAdminGrant).toHaveBeenCalledWith(USER, {
      amount: -500,
      reasonLabel: 'error_correction',
      note: null,
    })
  })
})

describe('성공과 실패', () => {
  it('회수 성공은 200에 원장 id와 회수 뒤 잔액을 돌려준다', async () => {
    mocks.executeAdminGrant.mockResolvedValue({ transaction: { id: 'tx-9' }, balance: 120 })
    const res = await POST(post({ userId: USER, amount: -180, reasonLabel: 'error_correction' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ transaction: { id: 'tx-9' }, balance: 120 })
  })

  it('지급(양수)은 지금과 같은 응답이다', async () => {
    const res = await POST(post({ userId: USER, amount: 300, reasonLabel: 'cs_compensation' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ transaction: { id: 'tx-1' }, balance: 700 })
    expect(mocks.executeAdminGrant).toHaveBeenCalledWith(USER, {
      amount: 300,
      reasonLabel: 'cs_compensation',
      note: null,
    })
  })

  it('실행이 실패(null)하면 500이고 내부 정보(DB 오류·계약 위반)를 싣지 않는다', async () => {
    mocks.executeAdminGrant.mockResolvedValue(null)
    const res = await POST(post({ userId: USER, amount: -100, reasonLabel: 'error_correction' }))

    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data).toEqual({ error: '지급/회수 처리에 실패했습니다.' })
  })
})
