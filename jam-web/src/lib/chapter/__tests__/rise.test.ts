/**
 * lib/chapter/rise — 챕터 오름 처리 (티켓 20261019_1316, 운영 로직 12.1~12.3절)
 *
 * 고정하는 것:
 * - 오른 챕터가 없으면 아무것도 하지 않는다. 챕터 1만 오르면 소식은 없고 챕터 배지 판정은 있다.
 * - 소식은 오른 챕터 가운데 가장 높은 챕터(2 이상)로 한 건만 보낸다. 묶음 키는 `chapter_up:{챕터}` + `once`라 같은 오름을 두 번 처리해도 소식은 한 건이다.
 * - 챕터 배지 판정은 `runJamActionEvaluation(userId, ['chapter_reached'])`이다. `skipBadgeEvaluation`이면 건너뛴다(소식은 보낸다).
 * - 판정이 실패해도 소식은 보내고, 소식이 실패해도 판정은 한다. 어떤 경우에도 던지지 않고 실패는 `chapter_rise_failed`로 남긴다.
 * - 챕터 배지가 다시 챕터 점수를 올리는 고리는 5-5의 제외 규칙이 막는다(`chapter_reached` 조건 배지는 «배지 받기» 점수에서 뺀다).
 * 공용 DB와 실제 RPC는 호출하지 않는다 — 소식·판정·엔진 로그는 가짜다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/__tests__/rise.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { createNotificationMock, runEvaluationMock, logMock } = vi.hoisted(() => ({
  createNotificationMock: vi.fn(),
  runEvaluationMock: vi.fn(),
  logMock: vi.fn(),
}))

vi.mock('@/lib/notifications', async () => {
  // 묶음 키 빌더는 실제 구현을 쓴다 — 키 모양까지 고정하려는 것이다
  const groupKey = await vi.importActual<typeof import('@/lib/notifications/groupKey')>('@/lib/notifications/groupKey')
  return {
    createNotification: (...args: unknown[]) => createNotificationMock(...args),
    scopedGroupKey: groupKey.scopedGroupKey,
  }
})
vi.mock('@/lib/badge-engine/jamActionRoute', () => ({
  runJamActionEvaluation: (...args: unknown[]) => runEvaluationMock(...args),
}))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: (...args: unknown[]) => logMock(...args) }))

import { awardBadgeReceiveScore } from '../badgeReceive'
import { processChapterRise } from '../rise'

const USER = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  createNotificationMock.mockReset()
  runEvaluationMock.mockReset()
  logMock.mockReset()
  createNotificationMock.mockResolvedValue({ id: 'n1' })
  runEvaluationMock.mockResolvedValue(undefined)
  logMock.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('processChapterRise — 오른 챕터가 없을 때', () => {
  it('빈 목록이면 소식도 판정도 기록도 하지 않는다', async () => {
    await processChapterRise({ userId: USER, reachedChapters: [] })

    expect(createNotificationMock).not.toHaveBeenCalled()
    expect(runEvaluationMock).not.toHaveBeenCalled()
    expect(logMock).not.toHaveBeenCalled()
  })

  it('챕터 번호가 아닌 값(0·음수·소수·NaN)만 있으면 빈 목록과 같다', async () => {
    await processChapterRise({ userId: USER, reachedChapters: [0, -1, 1.5, Number.NaN] })

    expect(createNotificationMock).not.toHaveBeenCalled()
    expect(runEvaluationMock).not.toHaveBeenCalled()
  })
})

describe('processChapterRise — 소식', () => {
  it('챕터 1만 오르면(챕터 1 시작) 소식은 보내지 않고 챕터 배지는 판정한다', async () => {
    await processChapterRise({ userId: USER, reachedChapters: [1] })

    expect(createNotificationMock).not.toHaveBeenCalled()
    expect(runEvaluationMock).toHaveBeenCalledTimes(1)
    expect(runEvaluationMock).toHaveBeenCalledWith(USER, ['chapter_reached'])
  })

  it('챕터 2 이상으로 오르면 chapter_up 한 건을 챕터 번호·묶음 키·once로 보낸다', async () => {
    await processChapterRise({ userId: USER, reachedChapters: [2] })

    expect(createNotificationMock).toHaveBeenCalledTimes(1)
    expect(createNotificationMock).toHaveBeenCalledWith({
      userId: USER,
      type: 'chapter_up',
      payload: { chapter_no: 2 },
      groupKey: 'chapter_up:2',
      mode: 'once',
    })
  })

  it('한 번에 여러 챕터를 넘으면 가장 높은 챕터로 한 건만 보낸다 — 챕터 1 시작과 함께 오른 경우 포함', async () => {
    await processChapterRise({ userId: USER, reachedChapters: [1, 2, 3] })
    await processChapterRise({ userId: USER, reachedChapters: [5, 3, 4] })

    expect(createNotificationMock).toHaveBeenCalledTimes(2)
    expect(createNotificationMock.mock.calls[0][0]).toMatchObject({ payload: { chapter_no: 3 }, groupKey: 'chapter_up:3' })
    expect(createNotificationMock.mock.calls[1][0]).toMatchObject({ payload: { chapter_no: 5 }, groupKey: 'chapter_up:5' })
  })

  it('같은 오름을 두 번 처리해도 소식은 한 건이다 — 같은 묶음 키 + once가 DB에서 한 행으로 막는다', async () => {
    // create_notification(once)의 의미를 옮긴 가짜: 같은 (유저, 묶음 키)가 있으면 아무것도 하지 않고 기존 행을 돌려준다
    const rows = new Map<string, { id: string }>()
    createNotificationMock.mockImplementation(async (input: { userId: string; groupKey: string; mode: string }) => {
      const key = `${input.userId}:${input.groupKey}`
      const existing = rows.get(key)
      if (existing && input.mode === 'once') return existing
      const row = { id: `n${rows.size + 1}` }
      rows.set(key, row)
      return row
    })

    await processChapterRise({ userId: USER, reachedChapters: [2, 3] })
    await processChapterRise({ userId: USER, reachedChapters: [2, 3] })

    expect(createNotificationMock.mock.calls[0][0].groupKey).toBe(createNotificationMock.mock.calls[1][0].groupKey)
    expect(createNotificationMock.mock.calls.every((call) => call[0].mode === 'once')).toBe(true)
    expect(rows.size).toBe(1)
    expect(logMock).not.toHaveBeenCalled() // 이미 있는 행을 돌려받은 것은 실패가 아니다
  })

  it('챕터가 다르면 묶음 키도 달라 새 소식이 만들어진다', async () => {
    await processChapterRise({ userId: USER, reachedChapters: [2] })
    await processChapterRise({ userId: USER, reachedChapters: [3] })

    const keys = createNotificationMock.mock.calls.map((call) => call[0].groupKey)
    expect(new Set(keys).size).toBe(2)
  })
})

describe('processChapterRise — 챕터 배지 판정', () => {
  it('오름이 있으면 chapter_reached만 판정한다 — 여러 챕터를 넘어도 한 번이다', async () => {
    await processChapterRise({ userId: USER, reachedChapters: [2, 3, 4] })

    expect(runEvaluationMock).toHaveBeenCalledTimes(1)
    expect(runEvaluationMock).toHaveBeenCalledWith(USER, ['chapter_reached'])
  })

  it('skipBadgeEvaluation이면 판정은 건너뛰고 소식은 보낸다(동기화 끝 판정이 이어서 읽는다)', async () => {
    await processChapterRise({ userId: USER, reachedChapters: [2] }, { skipBadgeEvaluation: true })

    expect(runEvaluationMock).not.toHaveBeenCalled()
    expect(createNotificationMock).toHaveBeenCalledTimes(1)
  })

  it('skipBadgeEvaluation이 거짓이거나 없으면 판정한다', async () => {
    await processChapterRise({ userId: USER, reachedChapters: [2] }, { skipBadgeEvaluation: false })
    await processChapterRise({ userId: USER, reachedChapters: [2] }, {})

    expect(runEvaluationMock).toHaveBeenCalledTimes(2)
  })
})

describe('processChapterRise — 서로 막지 않고 던지지 않는다', () => {
  it('판정이 실패해도 소식은 보내고, 실패를 chapter_rise_failed로 남긴다', async () => {
    runEvaluationMock.mockRejectedValue(new Error('판정 장애'))

    await expect(processChapterRise({ userId: USER, reachedChapters: [3] })).resolves.toBeUndefined()

    expect(createNotificationMock).toHaveBeenCalledTimes(1)
    expect(logMock).toHaveBeenCalledTimes(1)
    expect(logMock).toHaveBeenCalledWith('points', 'chapter_rise_failed', USER, {
      step: 'badge_evaluation',
      reachedChapters: [3],
      error: '챕터 배지 판정 예외: 판정 장애',
    })
    expect(console.error).toHaveBeenCalled()
  })

  it('소식이 실패해도(null) 판정은 하고, 실패를 남긴다', async () => {
    createNotificationMock.mockResolvedValue(null)

    await expect(processChapterRise({ userId: USER, reachedChapters: [3] })).resolves.toBeUndefined()

    expect(runEvaluationMock).toHaveBeenCalledTimes(1)
    expect(logMock).toHaveBeenCalledTimes(1)
    expect(logMock.mock.calls[0][1]).toBe('chapter_rise_failed')
    expect(logMock.mock.calls[0][3]).toMatchObject({ step: 'notification', reachedChapters: [3] })
  })

  it('소식이 예외를 던져도 판정은 한다', async () => {
    createNotificationMock.mockRejectedValue(new Error('소식 장애'))

    await expect(processChapterRise({ userId: USER, reachedChapters: [3] })).resolves.toBeUndefined()

    expect(runEvaluationMock).toHaveBeenCalledTimes(1)
    expect(logMock.mock.calls[0][3]).toMatchObject({ step: 'notification', error: '소식 생성 예외: 소식 장애' })
  })

  it('둘 다 실패하고 기록마저 던져도 던지지 않는다 — 각각 한 번씩 기록을 시도한다', async () => {
    createNotificationMock.mockResolvedValue(null)
    runEvaluationMock.mockRejectedValue(new Error('판정 장애'))
    logMock.mockRejectedValue(new Error('로그 장애'))

    await expect(processChapterRise({ userId: USER, reachedChapters: [4] })).resolves.toBeUndefined()

    expect(createNotificationMock).toHaveBeenCalledTimes(1)
    expect(runEvaluationMock).toHaveBeenCalledTimes(1)
    expect(logMock).toHaveBeenCalledTimes(2)
  })

  it('챕터 1 시작에서 판정이 실패해도 던지지 않는다(소식은 원래 없다)', async () => {
    runEvaluationMock.mockRejectedValue(new Error('판정 장애'))

    await expect(processChapterRise({ userId: USER, reachedChapters: [1] })).resolves.toBeUndefined()

    expect(createNotificationMock).not.toHaveBeenCalled()
    expect(logMock.mock.calls[0][3]).toMatchObject({ step: 'badge_evaluation' })
  })
})

describe('챕터 배지가 다시 챕터 점수를 올리지 않는다 (5-5의 제외 규칙)', () => {
  it('chapter_reached 조건 배지는 «배지 받기» 점수에서 빠지고 chapter_add_score를 부르지 않는다', async () => {
    const rpc = vi.fn()
    const supabase = { rpc } as unknown as SupabaseClient

    // 오름 처리가 판정하는 배지의 발급 경로(`issueQualifyingBadges`)가 새 행을 넣은 뒤 부르는 공용 함수와 같은 호출이다
    const outcome = await awardBadgeReceiveScore(supabase, {
      userId: USER,
      badge: { id: 'chapter-badge', type: 'activity', is_hidden: false, condition_json: { chapter_reached: 3 } },
      origin: { triggeredBy: 'jam_action:chapter_reached' },
    })

    expect(outcome).toEqual({ status: 'skipped', reason: 'excluded_condition' })
    expect(rpc).not.toHaveBeenCalled()
  })
})
