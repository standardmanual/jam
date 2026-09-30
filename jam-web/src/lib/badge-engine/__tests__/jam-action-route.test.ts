/**
 * runJamActionEvaluation — API 라우트용 래퍼 테스트 (티켓 20261001_0631)
 *
 * 검증 대상:
 *  - 획득한 배지가 있으면 기존 `activity_recap` 결산(`notifyActivityBadgesEarned`)으로 알린다(activityIds는 빈 배열)
 *  - 획득이 없거나 트리거가 비어 있으면 알림을 만들지 않는다(트리거가 비면 판정도 하지 않는다)
 *  - 판정·알림·클라이언트 생성 어디서 던져도 래퍼는 예외를 밖으로 던지지 않는다
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/jam-action-route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const SERVICE = vi.hoisted(() => ({ marker: 'service-client' }))

const evaluateMock = vi.hoisted(() =>
  vi.fn<(userId: string, triggers: readonly string[], client?: unknown) => Promise<{ id: string; name: string }[]>>(
    async () => []
  )
)
const notifyMock = vi.hoisted(() =>
  vi.fn<(client: unknown, userId: string, badgeIds: string[], activityIds: number[]) => Promise<void>>(async () => {})
)
const createServiceClientMock = vi.hoisted(() => vi.fn<() => unknown>(() => SERVICE))

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => createServiceClientMock() }))
vi.mock('@/lib/badge-engine/jamActionBadges', () => ({
  evaluateJamActionBadges: (userId: string, triggers: readonly string[], client?: unknown) =>
    evaluateMock(userId, triggers, client),
}))
vi.mock('@/lib/strava/sync', () => ({
  notifyActivityBadgesEarned: (client: unknown, userId: string, badgeIds: string[], activityIds: number[]) =>
    notifyMock(client, userId, badgeIds, activityIds),
}))

import { runJamActionEvaluation } from '../jamActionRoute'

beforeEach(() => {
  vi.clearAllMocks()
  evaluateMock.mockResolvedValue([])
  notifyMock.mockResolvedValue(undefined)
  createServiceClientMock.mockReturnValue(SERVICE)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('runJamActionEvaluation', () => {
  it('판정에 서비스 클라이언트를 넘기고, 획득한 배지가 있으면 결산 알림을 만든다', async () => {
    evaluateMock.mockResolvedValue([
      { id: 'b1', name: '첫 믹스' },
      { id: 'b2', name: '믹스 10회' },
    ])

    await runJamActionEvaluation('user-1', ['combine_attempt_count', 'combine_success_count'])

    expect(evaluateMock).toHaveBeenCalledWith('user-1', ['combine_attempt_count', 'combine_success_count'], SERVICE)
    // 귀속시킬 Strava 활동이 없어 activityIds는 빈 배열이다
    expect(notifyMock).toHaveBeenCalledWith(SERVICE, 'user-1', ['b1', 'b2'], [])
  })

  it('획득한 배지가 없으면 알림을 만들지 않는다', async () => {
    await runJamActionEvaluation('user-1', ['combine_fail_count'])
    expect(evaluateMock).toHaveBeenCalledTimes(1)
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('트리거가 비어 있으면 판정도 알림도 하지 않는다', async () => {
    await runJamActionEvaluation('user-1', [])
    expect(createServiceClientMock).not.toHaveBeenCalled()
    expect(evaluateMock).not.toHaveBeenCalled()
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('판정이 던져도 예외를 밖으로 던지지 않고 알림도 만들지 않는다', async () => {
    evaluateMock.mockRejectedValue(new Error('판정 폭발'))
    await expect(runJamActionEvaluation('user-1', ['combine_success_count'])).resolves.toBeUndefined()
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('알림 생성이 던져도 예외를 밖으로 던지지 않는다', async () => {
    evaluateMock.mockResolvedValue([{ id: 'b1', name: '첫 믹스' }])
    notifyMock.mockRejectedValue(new Error('알림 폭발'))
    await expect(runJamActionEvaluation('user-1', ['combine_success_count'])).resolves.toBeUndefined()
  })

  it('서비스 클라이언트 생성이 던져도 예외를 밖으로 던지지 않는다', async () => {
    createServiceClientMock.mockImplementation(() => {
      throw new Error('환경 변수 없음')
    })
    await expect(runJamActionEvaluation('user-1', ['combine_success_count'])).resolves.toBeUndefined()
    expect(evaluateMock).not.toHaveBeenCalled()
  })
})
