/**
 * lib/capsule/settle-pending — 칸이 비면 대기 보상을 자동 지급하고 남은 잼으로 다음 캡슐을 채운다 (티켓 20261105_1438 R2)
 *
 * 고정하는 것:
 * - 대기 보상이 없으면(막힘 판정 false) 지급도 채움도 하지 않는다.
 * - 빈칸이 대기 개수보다 적으면(shortfall > 0) 지급하지 않는다(부분 지급 없음). 대기 보상은 그대로다.
 * - 빈칸이 충분하면 지급하고, 이어서 자동 채움을 한 번 돈다(지급 → 채움 순서). 대기 보상이 더 남았으면 채우지 않는다. 지급한 것이 없으면 채우지 않는다.
 * - 지급은 열기 기록이라 행동 지표(캡슐 연 횟수)를 판정한다. 채움에서 캡슐이 열리거나 챕터가 오르면 `chapter_reached`를 더한다.
 * - 이용 정지·소속 트라이브 없음이면 지급하지 않고 조용히 끝난다. 그 밖의 실패(막힘 판정·지급·채움)도 던지지 않는다.
 * - 같은 프로세스에서 같은 유저의 동시 호출은 한 번만 돈다(이중 지급은 DB 잠금이 따로 막는다).
 * 공용 DB는 호출하지 않는다 — 하위 모듈은 모두 가짜다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/capsule/__tests__/settle-pending.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { UserSuspendedError } from '@/lib/suspension/suspension'
import { CapsuleError } from '../capsule'

const USER_ID = '11111111-1111-4111-8111-111111111111'

const order = vi.hoisted(() => ({ calls: [] as string[], afterCallbacks: [] as (() => unknown)[] }))
const blockedMock = vi.hoisted(() => vi.fn())
const claimMock = vi.hoisted(() => vi.fn())
const fillMock = vi.hoisted(() => vi.fn())
const evaluateMock = vi.hoisted(() => vi.fn())

vi.mock('next/server', () => ({ after: (cb: () => unknown) => void order.afterCallbacks.push(cb) }))
vi.mock('../receive-block', () => ({
  readCapsuleReceiveBlocked: async (...args: unknown[]) => {
    order.calls.push('blocked')
    return blockedMock(...args)
  },
}))
vi.mock('../claim', () => ({
  claimPendingCapsules: async (...args: unknown[]) => {
    order.calls.push('claim')
    return claimMock(...args)
  },
}))
vi.mock('../sync-auto-fill', () => ({
  runSyncCapsuleAutoFill: async (...args: unknown[]) => {
    order.calls.push('fill')
    return fillMock(...args)
  },
}))
vi.mock('@/lib/badge-engine/jamActionRoute', () => ({
  runJamActionEvaluation: async (...args: unknown[]) => {
    order.calls.push('evaluate')
    return evaluateMock(...args)
  },
}))

import { settleAfterSlotsFreed } from '../settle-pending'

const supabase = { marker: 'service' } as unknown as SupabaseClient

const BLOCKED_ENOUGH = { blocked: true, pending: 1, free: 1, needed: 1, shortfall: 0 }
const CLAIMED_ONE = { pendingBefore: 1, claimed: [{ pendingId: 'p1', openId: 'o1', chapterNo: 2, items: [] }], remainingPending: 0, stopped: 'none' }
const FILL_NOTHING = { opened: false, chapterRose: false }

async function flushAfter() {
  const callbacks = order.afterCallbacks.splice(0)
  await Promise.allSettled(callbacks.map((cb) => cb()))
}

beforeEach(() => {
  order.calls = []
  order.afterCallbacks = []
  blockedMock.mockReset()
  claimMock.mockReset()
  fillMock.mockReset()
  evaluateMock.mockReset()
  blockedMock.mockResolvedValue(BLOCKED_ENOUGH)
  claimMock.mockResolvedValue(CLAIMED_ONE)
  fillMock.mockResolvedValue(FILL_NOTHING)
  evaluateMock.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('settleAfterSlotsFreed', () => {
  it('대기 보상이 없으면 막힘 판정 한 번으로 끝낸다 — 지급도 채움도 하지 않는다', async () => {
    blockedMock.mockResolvedValue({ blocked: false, pending: 0, free: 3, needed: 0, shortfall: 0 })

    await settleAfterSlotsFreed(supabase, USER_ID)

    expect(blockedMock).toHaveBeenCalledWith(supabase, USER_ID)
    expect(claimMock).not.toHaveBeenCalled()
    expect(fillMock).not.toHaveBeenCalled()
    expect(order.afterCallbacks).toHaveLength(0)
  })

  it('빈칸이 대기 개수보다 적으면 지급하지 않는다(부분 지급 없음)', async () => {
    blockedMock.mockResolvedValue({ blocked: true, pending: 2, free: 1, needed: 2, shortfall: 1 })

    await settleAfterSlotsFreed(supabase, USER_ID)

    expect(claimMock).not.toHaveBeenCalled()
    expect(fillMock).not.toHaveBeenCalled()
  })

  it('빈칸이 대기 개수 이상이면 지급하고, 이어서 지갑에 남은 잼으로 채운다 — 순서는 막힘 판정 → 지급 → 채움', async () => {
    await settleAfterSlotsFreed(supabase, USER_ID)

    expect(claimMock).toHaveBeenCalledWith(supabase, USER_ID)
    expect(fillMock).toHaveBeenCalledWith(supabase, USER_ID)
    expect(order.calls).toEqual(['blocked', 'claim', 'fill'])
  })

  it('지급은 열기 기록이므로 행동 지표(캡슐 열기)를 응답 뒤에 판정한다', async () => {
    await settleAfterSlotsFreed(supabase, USER_ID)

    expect(evaluateMock).not.toHaveBeenCalled()
    await flushAfter()
    expect(evaluateMock).toHaveBeenCalledTimes(1)
    const [userId, triggers] = evaluateMock.mock.calls[0] as [string, string[]]
    expect(userId).toBe(USER_ID)
    expect(triggers.length).toBeGreaterThan(0)
    expect(triggers).not.toContain('chapter_reached')
  })

  it('채움에서 캡슐이 열리거나 챕터가 오르면 chapter_reached를 더해 판정한다', async () => {
    fillMock.mockResolvedValue({ opened: true, chapterRose: false })

    await settleAfterSlotsFreed(supabase, USER_ID)
    await flushAfter()

    expect((evaluateMock.mock.calls[0] as [string, string[]])[1]).toContain('chapter_reached')
  })

  it('지급 뒤에도 대기 보상이 남았으면 채우지 않는다', async () => {
    claimMock.mockResolvedValue({ ...CLAIMED_ONE, remainingPending: 1, stopped: 'insufficient_slots' })

    await settleAfterSlotsFreed(supabase, USER_ID)

    expect(fillMock).not.toHaveBeenCalled()
    await flushAfter()
    expect(evaluateMock).toHaveBeenCalledTimes(1)
  })

  it('지급한 것이 없으면(다른 요청이 먼저 지급했다) 채우지도 판정하지도 않는다', async () => {
    claimMock.mockResolvedValue({ pendingBefore: 1, claimed: [], remainingPending: 0, stopped: 'none' })

    await settleAfterSlotsFreed(supabase, USER_ID)

    expect(fillMock).not.toHaveBeenCalled()
    expect(order.afterCallbacks).toHaveLength(0)
  })

  it.each([
    ['이용 정지(UserSuspendedError)', () => new UserSuspendedError({ reason: '어뷰징', suspendedAt: '2026-10-29T00:00:00Z' })],
    ['이용 정지(CapsuleError user_suspended)', () => new CapsuleError('user_suspended')],
    ['소속 트라이브 없음(CapsuleError no_tribe)', () => new CapsuleError('no_tribe')],
  ])('%s이면 지급하지 않고 조용히 끝난다 — 로그도 남기지 않는다', async (_label, makeError) => {
    claimMock.mockRejectedValue(makeError())

    await expect(settleAfterSlotsFreed(supabase, USER_ID)).resolves.toBeUndefined()

    expect(fillMock).not.toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('막힘 판정·지급·채움이 던져도 던지지 않고 로그만 남긴다', async () => {
    blockedMock.mockRejectedValueOnce(new Error('판정 장애'))
    await expect(settleAfterSlotsFreed(supabase, USER_ID)).resolves.toBeUndefined()

    claimMock.mockRejectedValueOnce(new Error('지급 장애'))
    await expect(settleAfterSlotsFreed(supabase, USER_ID)).resolves.toBeUndefined()

    fillMock.mockRejectedValueOnce(new Error('채움 장애'))
    await expect(settleAfterSlotsFreed(supabase, USER_ID)).resolves.toBeUndefined()

    expect(console.error).toHaveBeenCalledTimes(3)
  })

  it('행동 지표 판정이 던져도 던지지 않는다', async () => {
    evaluateMock.mockRejectedValue(new Error('판정 장애'))

    await settleAfterSlotsFreed(supabase, USER_ID)
    await expect(flushAfter()).resolves.toBeUndefined()

    expect(console.error).toHaveBeenCalled()
  })

  it('같은 유저의 동시 호출은 한 번만 돈다 — 이중 지급을 하지 않는다', async () => {
    let release: () => void = () => {}
    claimMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(CLAIMED_ONE)
        })
    )

    const first = settleAfterSlotsFreed(supabase, USER_ID)
    // 첫 호출이 지급 중일 때 두 번째 호출이 들어온다
    await vi.waitFor(() => expect(claimMock).toHaveBeenCalledTimes(1))
    await settleAfterSlotsFreed(supabase, USER_ID)
    release()
    await first

    expect(claimMock).toHaveBeenCalledTimes(1)
    expect(fillMock).toHaveBeenCalledTimes(1)

    // 끝나면 잠금이 풀려 다음 호출은 다시 돈다
    await settleAfterSlotsFreed(supabase, USER_ID)
    expect(blockedMock).toHaveBeenCalledTimes(2)
  })

  it('다른 유저는 서로 막지 않는다', async () => {
    let release: () => void = () => {}
    claimMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(CLAIMED_ONE)
        })
    )

    const first = settleAfterSlotsFreed(supabase, USER_ID)
    await vi.waitFor(() => expect(claimMock).toHaveBeenCalledTimes(1))
    await settleAfterSlotsFreed(supabase, 'other-user')
    release()
    await first

    expect(claimMock).toHaveBeenCalledTimes(2)
  })
})
