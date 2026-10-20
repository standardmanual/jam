/**
 * points/admin-grant — 어드민 포인트 지급/회수 검증·실행 (티켓 20260924_0951)
 *
 * 단건 라우트(`api/admin/points/grant`)와 유저 일괄 라우트가 같은 규칙을 쓰는지 고정한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const awardPoints = vi.fn()
const deductPointsByAdmin = vi.fn()
const getWallet = vi.fn()

vi.mock('@/lib/points', () => ({
  awardPoints: (...args: unknown[]) => awardPoints(...args),
  deductPointsByAdmin: (...args: unknown[]) => deductPointsByAdmin(...args),
  getWallet: (...args: unknown[]) => getWallet(...args),
}))

import {
  validateAdminGrantInput,
  executeAdminGrant,
  isAdminGrantRejected,
  buildDeductRejectionMessage,
} from '../admin-grant'

describe('validateAdminGrantInput', () => {
  it('정상 지급은 통과하고 기타 외 사유의 메모는 null로 비운다', () => {
    const result = validateAdminGrantInput({ amount: 500, reasonLabel: 'cs_compensation', note: '무시됨' })
    expect(result).toEqual({
      ok: true,
      grant: { amount: 500, reasonLabel: 'cs_compensation', note: null },
    })
  })

  it('회수(음수)도 통과한다', () => {
    const result = validateAdminGrantInput({ amount: -200, reasonLabel: 'error_correction' })
    expect(result.ok).toBe(true)
  })

  it.each([0, 1.5, '100', null, undefined, NaN])('0이 아닌 정수가 아니면 400 — %s', (amount) => {
    const result = validateAdminGrantInput({ amount, reasonLabel: 'cs_compensation' })
    expect(result).toMatchObject({ ok: false, status: 400 })
  })

  it('허용되지 않은 사유는 400', () => {
    const result = validateAdminGrantInput({ amount: 100, reasonLabel: 'made_up' })
    expect(result).toMatchObject({ ok: false, status: 400, error: '허용되지 않은 사유입니다.' })
  })

  it('기타 사유는 메모가 비면 400, 메모가 있으면 앞뒤 공백을 지운 채 통과한다', () => {
    expect(validateAdminGrantInput({ amount: 100, reasonLabel: 'other', note: '   ' })).toMatchObject({
      ok: false,
      status: 400,
    })
    expect(validateAdminGrantInput({ amount: 100, reasonLabel: 'other', note: '  사유  ' })).toEqual({
      ok: true,
      grant: { amount: 100, reasonLabel: 'other', note: '사유' },
    })
  })

  it('1,000P 이상은 confirmed:true 없이는 422 + requiresConfirmation', () => {
    const result = validateAdminGrantInput({ amount: 1000, reasonLabel: 'cs_compensation' })
    expect(result).toMatchObject({ ok: false, status: 422, requiresConfirmation: true })
    const negative = validateAdminGrantInput({ amount: -1000, reasonLabel: 'cs_compensation', confirmed: false })
    expect(negative).toMatchObject({ ok: false, status: 422, requiresConfirmation: true })
  })

  it('1,000P 이상도 confirmed:true가 있으면 통과, 999P는 확인 없이 통과', () => {
    expect(validateAdminGrantInput({ amount: 1000, reasonLabel: 'cs_compensation', confirmed: true }).ok).toBe(true)
    expect(validateAdminGrantInput({ amount: 999, reasonLabel: 'cs_compensation' }).ok).toBe(true)
  })
})

describe('executeAdminGrant', () => {
  beforeEach(() => {
    awardPoints.mockReset()
    deductPointsByAdmin.mockReset()
    getWallet.mockReset()
  })

  it('지급(양수)은 지금처럼 awardPoints(admin_grant)로 실행하고 잔액을 조회해 돌려준다', async () => {
    awardPoints.mockResolvedValue({ id: 'tx-1' })
    getWallet.mockResolvedValue(700)

    const granted = await executeAdminGrant('u1', { amount: 300, reasonLabel: 'cs_compensation', note: null })
    expect(awardPoints).toHaveBeenCalledTimes(1)
    expect(awardPoints).toHaveBeenLastCalledWith('u1', 300, 'admin_grant', {
      adminReasonLabel: 'cs_compensation',
      adminReasonNote: null,
    })
    expect(granted).toEqual({ transaction: { id: 'tx-1' }, balance: 700 })
    expect(deductPointsByAdmin).not.toHaveBeenCalled()
  })

  it('지급이 원장 기록에 실패(null)하면 null을 돌려주고 잔액을 조회하지 않는다', async () => {
    awardPoints.mockResolvedValue(null)
    expect(await executeAdminGrant('u1', { amount: 10, reasonLabel: 'cs_compensation', note: null })).toBeNull()
    expect(getWallet).not.toHaveBeenCalled()
  })

  it('회수(음수)는 awardPoints가 아니라 deductPointsByAdmin에 양수 금액으로 맡기고, RPC가 돌려준 잔액을 쓴다', async () => {
    deductPointsByAdmin.mockResolvedValue({ ok: true, transactionId: 'tx-9', balance: 120 })

    const result = await executeAdminGrant('u1', { amount: -300, reasonLabel: 'other', note: '회수 사유' })

    expect(deductPointsByAdmin).toHaveBeenCalledTimes(1)
    expect(deductPointsByAdmin).toHaveBeenLastCalledWith('u1', 300, { label: 'other', note: '회수 사유' })
    expect(result).toEqual({ transaction: { id: 'tx-9' }, balance: 120 })
    expect(awardPoints).not.toHaveBeenCalled()
    // 동시 실행과 어긋나지 않도록 잔액을 따로 조회하지 않는다
    expect(getWallet).not.toHaveBeenCalled()
  })

  it('잔액보다 큰 회수는 거절 결과(현재 잔액·요청 금액)로 돌려준다', async () => {
    deductPointsByAdmin.mockResolvedValue({ ok: false, error: 'insufficient_balance', balance: 40, requested: 300 })

    const result = await executeAdminGrant('u1', { amount: -300, reasonLabel: 'error_correction', note: null })

    expect(result).toEqual({ rejected: true, code: 'insufficient_balance', balance: 40, requested: 300 })
    expect(result && isAdminGrantRejected(result)).toBe(true)
  })

  it('회수가 RPC 실패(null)면 null을 돌려준다', async () => {
    deductPointsByAdmin.mockResolvedValue(null)
    expect(await executeAdminGrant('u1', { amount: -10, reasonLabel: 'error_correction', note: null })).toBeNull()
  })
})

describe('isAdminGrantRejected', () => {
  it('실행 결과는 거절이 아니다', () => {
    expect(isAdminGrantRejected({ transaction: { id: 'tx' }, balance: 5 })).toBe(false)
  })
})

describe('buildDeductRejectionMessage', () => {
  it('[현상]→[원인]→[해결책] 순서로 현재 잔액과 요청 금액을 모두 담는다', () => {
    const message = buildDeductRejectionMessage({ balance: 300, requested: 1500 })
    expect(message).toBe(
      '회수하지 못했어요. 이 유저의 잔액이 300 포인트라 1,500 포인트는 회수할 수 없어요. 300 포인트 이하로 줄여서 다시 회수해 주세요.'
    )
  })

  it.each([0, -50])('잔액이 %i이면 "줄여서 다시" 대신 유저를 확인하라고 안내한다', (balance) => {
    const message = buildDeductRejectionMessage({ balance, requested: 100 })
    expect(message).toContain('회수하지 못했어요.')
    expect(message).toContain(`잔액이 ${balance} 포인트라 100 포인트는 회수할 수 없어요.`)
    expect(message).toContain('회수할 포인트가 있는 유저인지 확인해 주세요.')
    expect(message).not.toContain('줄여서')
  })
})
