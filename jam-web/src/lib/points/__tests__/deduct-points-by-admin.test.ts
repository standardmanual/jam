/**
 * points/index — deductPointsByAdmin() (티켓 20261019_1314, 마이그레이션 252)
 *
 * 어드민 회수가 admin_deduct_points RPC를 부르고, DB 응답을 그대로 따르는지만 본다.
 * 동시 회수 때 음수가 안 되는 것은 DB 롤백 실측(마이그레이션 252)에서 확인했다.
 *
 * - 성공: admin_points_changed 알림(deduct)을 지금처럼 보낸다.
 * - 거절(insufficient_balance): 알림 없이 결과로 돌려준다.
 * - RPC 오류·계약 밖 응답·invalid_amount: null, 알림 없음, engine_decision_log에 point_award_failed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const rpcMock = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ rpc: rpcMock }),
}))

const createNotificationMock = vi.fn()
vi.mock('@/lib/notifications', () => ({
  createNotification: (input: unknown) => createNotificationMock(input),
  dailyGroupKey: (type: string) => `${type}:2026-10-20`,
}))

const logEngineDecisionMock = vi.fn()
vi.mock('@/lib/engine-log', () => ({
  logEngineDecision: (...args: unknown[]) => logEngineDecisionMock(...args),
}))

import { deductPointsByAdmin } from '../index'

const USER = '00000000-0000-0000-0000-0000000000aa'

beforeEach(() => {
  rpcMock.mockReset()
  createNotificationMock.mockReset().mockResolvedValue(null)
  logEngineDecisionMock.mockReset().mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('deductPointsByAdmin — 성공', () => {
  it('admin_deduct_points를 양수 금액과 사유로 부르고 결과를 돌려준다', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, transactionId: 'tx-1', balance: 700 }, error: null })

    const result = await deductPointsByAdmin(USER, 300, { label: 'error_correction', note: null })

    expect(result).toEqual({ ok: true, transactionId: 'tx-1', balance: 700 })
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith('admin_deduct_points', {
      p_user_id: USER,
      p_amount: 300,
      p_admin_reason_label: 'error_correction',
      p_admin_reason_note: undefined,
    })
  })

  it('회수 알림(admin_points_changed, direction=deduct)을 지금처럼 보낸다', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, transactionId: 'tx-1', balance: 700 }, error: null })

    await deductPointsByAdmin(USER, 300, { label: 'error_correction' })

    expect(createNotificationMock).toHaveBeenCalledTimes(1)
    expect(createNotificationMock).toHaveBeenCalledWith({
      userId: USER,
      type: 'admin_points_changed',
      payload: { amount: 300, direction: 'deduct', reason: 'error_correction' },
    })
    expect(logEngineDecisionMock).not.toHaveBeenCalled()
  })
})

describe('deductPointsByAdmin — 거절', () => {
  it('잔액 부족은 알림 없이 거절 결과(현재 잔액·요청 금액)로 돌려준다', async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, error: 'insufficient_balance', balance: 40, requested: 300 },
      error: null,
    })

    const result = await deductPointsByAdmin(USER, 300, { label: 'error_correction' })

    expect(result).toEqual({ ok: false, error: 'insufficient_balance', balance: 40, requested: 300 })
    expect(createNotificationMock).not.toHaveBeenCalled()
    // 거절은 오류가 아니다 — 실패 로그를 남기지 않는다
    expect(logEngineDecisionMock).not.toHaveBeenCalled()
  })
})

describe('deductPointsByAdmin — 실패(null)', () => {
  it('RPC 오류면 null, 알림 없음, point_award_failed 기록', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'connection reset' } })

    expect(await deductPointsByAdmin(USER, 300, { label: 'error_correction' })).toBeNull()

    expect(createNotificationMock).not.toHaveBeenCalled()
    expect(logEngineDecisionMock).toHaveBeenCalledWith('points', 'point_award_failed', USER, {
      amount: -300,
      reason: 'admin_deduct',
      dbError: 'connection reset',
    })
  })

  it.each([
    ['null', null],
    ['빈 객체', {}],
    ['ok:true인데 transactionId 없음', { ok: true, balance: 10 }],
    ['모르는 거절 코드', { ok: false, error: 'wallet_locked' }],
  ])('계약 밖 응답(%s)은 성공으로 보지 않는다 — null, 알림 없음, 기록', async (_label, data) => {
    rpcMock.mockResolvedValue({ data, error: null })

    expect(await deductPointsByAdmin(USER, 300, { label: 'error_correction' })).toBeNull()

    expect(createNotificationMock).not.toHaveBeenCalled()
    expect(logEngineDecisionMock).toHaveBeenCalledWith('points', 'point_award_failed', USER, {
      amount: -300,
      reason: 'admin_deduct',
      contractViolation: true,
    })
  })

  it('invalid_amount 응답은 null로 돌려주고 기록한다', async () => {
    rpcMock.mockResolvedValue({ data: { ok: false, error: 'invalid_amount' }, error: null })

    expect(await deductPointsByAdmin(USER, 300)).toBeNull()

    expect(createNotificationMock).not.toHaveBeenCalled()
    expect(logEngineDecisionMock).toHaveBeenCalledWith('points', 'point_award_failed', USER, {
      amount: -300,
      reason: 'admin_deduct',
      rpcError: 'invalid_amount',
    })
  })

  it.each([0, -5, 1.5, Number.NaN])('회수 금액이 양의 정수가 아니면(%s) RPC를 부르지 않고 null', async (amount) => {
    expect(await deductPointsByAdmin(USER, amount)).toBeNull()
    expect(rpcMock).not.toHaveBeenCalled()
  })
})
