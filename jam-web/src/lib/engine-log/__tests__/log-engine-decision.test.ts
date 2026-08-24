/**
 * logEngineDecision() — insert 계약 + 실패 관측
 * 티켓 20260824_023
 *
 * 이 함수가 지켜야 할 것은 두 가지다.
 * 1. `{ user_id, engine, event, payload }` 계약대로 row를 만든다 (컬럼명이 어긋나면 전량 유실).
 * 2. **실패해도 예외를 던지지 않되, 조용히 사라지지도 않는다.** `supabase-js`는 실패해도
 *    throw하지 않고 `{ error }`를 반환하므로, error를 검사하지 않으면 try/catch는 무용지물이다
 *    (실제로 이 티켓 이전까지 `points` 로그가 CHECK 제약에 막혀 전량 무성 유실됐다).
 *
 * CHECK 제약 자체(`engine IN ('badge','drop','points')`)는 마이그레이션 097 적용 후
 * 실 DB에서 확인한다 — 목킹된 클라이언트로는 검증할 수 없다.
 */
import { vi, beforeEach, afterEach } from 'vitest'

const insertMock = vi.fn()
const fromMock = vi.fn(() => ({ insert: insertMock }))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: fromMock }),
}))

import { logEngineDecision } from '../index'

describe('logEngineDecision — insert row 계약', () => {
  beforeEach(() => {
    insertMock.mockReset()
    fromMock.mockClear()
    insertMock.mockResolvedValue({ error: null })
  })

  it('engine_decision_log 테이블에 { user_id, engine, event, payload }로 기록한다', async () => {
    await logEngineDecision('points', 'point_award_failed', 'u-1', {
      amount: 250,
      reason: 'badge_point_reward',
    })

    expect(fromMock).toHaveBeenCalledWith('engine_decision_log')
    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(insertMock.mock.calls[0][0]).toEqual({
      user_id: 'u-1',
      engine: 'points',
      event: 'point_award_failed',
      payload: { amount: 250, reason: 'badge_point_reward' },
    })
  })

  it('userId가 null인 판정(엔진 전역 경고)도 그대로 기록한다', async () => {
    await logEngineDecision('drop', 'faction_constant_missing', null, { missing: ['x'] })

    expect(insertMock.mock.calls[0][0]).toEqual({
      user_id: null,
      engine: 'drop',
      event: 'faction_constant_missing',
      payload: { missing: ['x'] },
    })
  })

  it('badge·drop·points 3종 engine을 모두 그대로 넘긴다 (CHECK 제약과 맞물리는 값)', async () => {
    await logEngineDecision('badge', 'sync_result', 'u-1', {})
    await logEngineDecision('drop', 'drop_attempt', 'u-1', {})
    await logEngineDecision('points', 'point_award_failed', 'u-1', {})

    expect(insertMock.mock.calls.map((call) => call[0].engine)).toEqual([
      'badge',
      'drop',
      'points',
    ])
  })
})

describe('logEngineDecision — 실패가 본 흐름으로 새어나가지 않는다', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    insertMock.mockReset()
    fromMock.mockClear()
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('insert가 { error }를 반환하면 예외 없이 반환하되 console.error를 남긴다', async () => {
    insertMock.mockResolvedValue({
      error: { message: 'new row violates check constraint "engine_decision_log_engine_check"' },
    })

    await expect(
      logEngineDecision('points', 'point_award_failed', 'u-1', { amount: 250 })
    ).resolves.toBeUndefined()

    expect(errorSpy).toHaveBeenCalledTimes(1)
    // 어느 호출부가 유실됐는지 로그만 보고 식별할 수 있어야 한다
    const message = String(errorSpy.mock.calls[0][0])
    expect(message).toContain('points')
    expect(message).toContain('point_award_failed')
    expect(message).toContain('u-1')
  })

  it('insert가 throw해도 삼키고 로그를 남긴다 (기존 try/catch 경로 회귀 방지)', async () => {
    insertMock.mockRejectedValue(new Error('network down'))

    await expect(
      logEngineDecision('drop', 'drop_attempt', 'u-2', { outcome: 'no_inventory' })
    ).resolves.toBeUndefined()

    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(String(errorSpy.mock.calls[0][0])).toContain('drop_attempt')
  })

  it('정상 기록(error: null)에는 로그를 남기지 않는다', async () => {
    insertMock.mockResolvedValue({ error: null })

    await logEngineDecision('badge', 'sync_result', 'u-3', {})

    expect(errorSpy).not.toHaveBeenCalled()
  })
})
