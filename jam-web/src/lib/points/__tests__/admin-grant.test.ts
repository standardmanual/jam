/**
 * points/admin-grant — 어드민 포인트 지급/회수 검증·실행 (티켓 20260924_0951)
 *
 * 단건 라우트(`api/admin/points/grant`)와 유저 일괄 라우트가 같은 규칙을 쓰는지 고정한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const awardPoints = vi.fn()
const getWallet = vi.fn()

vi.mock('@/lib/points', () => ({
  awardPoints: (...args: unknown[]) => awardPoints(...args),
  getWallet: (...args: unknown[]) => getWallet(...args),
}))

import { validateAdminGrantInput, executeAdminGrant } from '../admin-grant'

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
    getWallet.mockReset()
  })

  it('양수는 admin_grant, 음수는 admin_deduct 사유로 실행하고 잔액을 돌려준다', async () => {
    awardPoints.mockResolvedValue({ id: 'tx-1' })
    getWallet.mockResolvedValue(700)

    const granted = await executeAdminGrant('u1', { amount: 300, reasonLabel: 'cs_compensation', note: null })
    expect(awardPoints).toHaveBeenLastCalledWith('u1', 300, 'admin_grant', {
      adminReasonLabel: 'cs_compensation',
      adminReasonNote: null,
    })
    expect(granted).toEqual({ transaction: { id: 'tx-1' }, balance: 700 })

    await executeAdminGrant('u1', { amount: -300, reasonLabel: 'other', note: '회수 사유' })
    expect(awardPoints).toHaveBeenLastCalledWith('u1', -300, 'admin_deduct', {
      adminReasonLabel: 'other',
      adminReasonNote: '회수 사유',
    })
  })

  it('원장 기록에 실패(null)하면 null을 돌려주고 잔액을 조회하지 않는다', async () => {
    awardPoints.mockResolvedValue(null)
    expect(await executeAdminGrant('u1', { amount: 10, reasonLabel: 'cs_compensation', note: null })).toBeNull()
    expect(getWallet).not.toHaveBeenCalled()
  })
})
