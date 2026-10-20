/**
 * points/deduct-contract — admin_deduct_points 반환 계약 파서 (티켓 20261019_1314, 마이그레이션 252)
 *
 * 계약 안의 세 모양만 인정하고, 그 밖의 응답은 null(성공으로 보지 않음)인지 고정한다.
 */
import { describe, it, expect } from 'vitest'
import { parseAdminDeductResult } from '../deduct-contract'

describe('parseAdminDeductResult — 계약 안의 응답', () => {
  it('성공: transactionId와 회수 뒤 잔액을 읽는다', () => {
    expect(parseAdminDeductResult({ ok: true, transactionId: 'tx-1', balance: 120 })).toEqual({
      ok: true,
      transactionId: 'tx-1',
      balance: 120,
    })
  })

  it('전액 회수(잔액 0)도 성공이다', () => {
    expect(parseAdminDeductResult({ ok: true, transactionId: 'tx-1', balance: 0 })).toEqual({
      ok: true,
      transactionId: 'tx-1',
      balance: 0,
    })
  })

  it('잔액 부족 거절: 현재 잔액과 요청 금액을 읽는다', () => {
    expect(
      parseAdminDeductResult({ ok: false, error: 'insufficient_balance', balance: 40, requested: 300 })
    ).toEqual({ ok: false, error: 'insufficient_balance', balance: 40, requested: 300 })
  })

  it('잔액 부족 거절: 옛 경로로 이미 음수가 된 지갑의 잔액도 읽는다', () => {
    expect(
      parseAdminDeductResult({ ok: false, error: 'insufficient_balance', balance: -20, requested: 10 })
    ).toEqual({ ok: false, error: 'insufficient_balance', balance: -20, requested: 10 })
  })

  it('금액 오류 거절', () => {
    expect(parseAdminDeductResult({ ok: false, error: 'invalid_amount' })).toEqual({
      ok: false,
      error: 'invalid_amount',
    })
  })
})

describe('parseAdminDeductResult — 계약 밖 응답은 null (성공으로 보지 않는다)', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['문자열', 'ok'],
    ['숫자', 1],
    ['배열', [{ ok: true }]],
    ['ok 없음', { transactionId: 'tx-1', balance: 1 }],
    ['ok가 문자열', { ok: 'true', transactionId: 'tx-1', balance: 1 }],
    ['성공인데 transactionId 없음', { ok: true, balance: 1 }],
    ['성공인데 transactionId가 빈 문자열', { ok: true, transactionId: '', balance: 1 }],
    ['성공인데 transactionId가 숫자', { ok: true, transactionId: 7, balance: 1 }],
    ['성공인데 balance 없음', { ok: true, transactionId: 'tx-1' }],
    ['성공인데 balance가 문자열', { ok: true, transactionId: 'tx-1', balance: '1' }],
    ['성공인데 balance가 소수', { ok: true, transactionId: 'tx-1', balance: 1.5 }],
    ['성공인데 회수 뒤 잔액이 음수', { ok: true, transactionId: 'tx-1', balance: -1 }],
    ['실패인데 error 없음', { ok: false }],
    ['실패인데 모르는 error 코드', { ok: false, error: 'wallet_locked' }],
    ['잔액 부족인데 balance 없음', { ok: false, error: 'insufficient_balance', requested: 10 }],
    ['잔액 부족인데 requested 없음', { ok: false, error: 'insufficient_balance', balance: 5 }],
    ['잔액 부족인데 balance가 문자열', { ok: false, error: 'insufficient_balance', balance: '5', requested: 10 }],
    ['잔액 부족인데 requested가 0', { ok: false, error: 'insufficient_balance', balance: 5, requested: 0 }],
    ['잔액 부족인데 requested가 소수', { ok: false, error: 'insufficient_balance', balance: 5, requested: 1.5 }],
  ])('%s', (_label, raw) => {
    expect(parseAdminDeductResult(raw)).toBeNull()
  })
})
