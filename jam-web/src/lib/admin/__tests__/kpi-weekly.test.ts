/**
 * 주간 집계 API 계산 로직 — 순수 로직 회귀 (티켓 20260918_1150)
 *
 * 지키는 것:
 * 1. `resolveKpiWeeklyRange`가 기본 7일이고 `days` 파라미터로 바뀐다
 * 2. 잘못된 `days`(음수·0·문자·상한 초과)는 기본값으로 폴백한다 — 조용히 이상한
 *    범위로 집계되지 않는다
 * 3. 미션 달성자 수는 distinct user_id, 배지 발급량은 기간 내 건수로 집계된다
 * 3-1. Strava 동기화 실패 건수는 strava_sync_failures 기간 내 건수로 집계된다(티켓
 *    20260918_1307 — 이전에는 원천 데이터 없음으로 null이었다)
 * 3-2. 동기화 실패 건수는 failure_type='drop_attempt_failed' 행을 세지 않고, 그 행은
 *    dropAttemptFailures로 따로 센다(티켓 20261014_1319)
 * 4. 원천 데이터가 없는 서브지표(배지 중복 발급·앰비언트 드랍 만료)는 추측 없이
 *    `null` + `reason`을 반환한다
 * 4-1. 믹스 포인트(combine_fail_reward·combine_recipe_reward)는 사유별 건수·합계로 집계된다
 *    (티켓 20260924_1455). 원장 행이 1000건을 넘으면 페이지를 이어 읽는다
 * 4-2. 결과물 배지가 삭제됐거나 없는 레시피 수를 센다(재료·보상 배지 없는 포인트 전용 레시피는 유효)
 * 5. 응답 어디에도 user_id 같은 개인 식별 값이 그대로 실리지 않는다(개수만 남는다)
 */
import { vi } from 'vitest'

const mockMissionRows = vi.fn()
const mockBadgeCount = vi.fn()
// strava_sync_failures 조회는 두 번이다 — `.neq('failure_type', …)`가 동기화 실패 건수,
// `.eq('failure_type', …)`가 드랍 시도 실패 건수다. 두 모의 함수가 받은 (컬럼, 값)이 곧 필터다.
const mockStravaSyncFailureCount = vi.fn()
const mockDropAttemptFailureCount = vi.fn()
const mockLedgerPage = vi.fn()
const mockRecipes = vi.fn()
const mockLiveBadges = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'user_mission_completions') {
        return {
          select: () => ({
            gte: () => ({
              lt: async () => mockMissionRows(),
            }),
          }),
        }
      }
      if (table === 'user_activity_badges') {
        return {
          select: () => ({
            gte: () => ({
              lt: async () => mockBadgeCount(),
            }),
          }),
        }
      }
      if (table === 'strava_sync_failures') {
        return {
          select: () => ({
            gte: () => ({
              lt: () => ({
                neq: async (column: string, value: string) => mockStravaSyncFailureCount(column, value),
                eq: async (column: string, value: string) => mockDropAttemptFailureCount(column, value),
              }),
            }),
          }),
        }
      }
      if (table === 'point_transactions') {
        return {
          select: () => ({
            in: () => ({
              gte: () => ({
                lt: () => ({
                  order: () => ({
                    order: () => ({
                      range: async (from: number) => mockLedgerPage(from),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'combination_recipes') {
        return { select: async () => mockRecipes() }
      }
      if (table === 'badges') {
        return {
          select: () => ({
            in: () => ({
              is: async () => mockLiveBadges(),
            }),
          }),
        }
      }
      throw new Error(`예상치 못한 테이블 조회: ${table}`)
    },
  }),
}))

import { computeKpiWeeklyMetrics, resolveKpiWeeklyRange, DEFAULT_KPI_WEEKLY_DAYS } from '../kpiWeekly'

describe('resolveKpiWeeklyRange', () => {
  const now = new Date('2026-09-18T00:00:00.000Z')

  it('days 파라미터가 없으면 기본 7일이다', () => {
    const range = resolveKpiWeeklyRange(null, now)
    expect(range.days).toBe(DEFAULT_KPI_WEEKLY_DAYS)
    expect(range.endIso).toBe(now.toISOString())
    expect(range.startIso).toBe(new Date('2026-09-11T00:00:00.000Z').toISOString())
  })

  it('days 파라미터로 기간을 바꿀 수 있다', () => {
    const range = resolveKpiWeeklyRange('14', now)
    expect(range.days).toBe(14)
    expect(range.startIso).toBe(new Date('2026-09-04T00:00:00.000Z').toISOString())
  })

  it.each(['0', '-3', 'abc', '9999'])('잘못된 days(%s)는 기본값으로 폴백한다', (bad) => {
    const range = resolveKpiWeeklyRange(bad, now)
    expect(range.days).toBe(DEFAULT_KPI_WEEKLY_DAYS)
  })
})

describe('computeKpiWeeklyMetrics', () => {
  const range = resolveKpiWeeklyRange(null, new Date('2026-09-18T00:00:00.000Z'))

  beforeEach(() => {
    mockStravaSyncFailureCount.mockReset().mockResolvedValue({ count: 0, error: null })
    mockDropAttemptFailureCount.mockReset().mockResolvedValue({ count: 0, error: null })
    mockLedgerPage.mockReset().mockResolvedValue({ data: [], error: null })
    mockRecipes.mockReset().mockResolvedValue({ data: [], error: null })
    mockLiveBadges.mockReset().mockResolvedValue({ data: [], error: null })
  })

  it('미션 달성자 수는 distinct user_id 개수다', async () => {
    mockMissionRows.mockResolvedValue({
      data: [{ user_id: 'u1' }, { user_id: 'u1' }, { user_id: 'u2' }],
      error: null,
    })
    mockBadgeCount.mockResolvedValue({ count: 5, error: null })
    mockStravaSyncFailureCount.mockResolvedValue({ count: 0, error: null })

    const metrics = await computeKpiWeeklyMetrics(range)
    expect(metrics.missionAchievers.value).toBe(2)
  })

  it('배지 발급량은 기간 내 건수를 그대로 담는다', async () => {
    mockMissionRows.mockResolvedValue({ data: [], error: null })
    mockBadgeCount.mockResolvedValue({ count: 7, error: null })
    mockStravaSyncFailureCount.mockResolvedValue({ count: 0, error: null })

    const metrics = await computeKpiWeeklyMetrics(range)
    expect(metrics.badgeIssuance.issued.value).toBe(7)
  })

  it('Strava 동기화 실패 건수는 기간 내 건수를 그대로 담는다', async () => {
    mockMissionRows.mockResolvedValue({ data: [], error: null })
    mockBadgeCount.mockResolvedValue({ count: 0, error: null })
    mockStravaSyncFailureCount.mockResolvedValue({ count: 3, error: null })

    const metrics = await computeKpiWeeklyMetrics(range)
    expect(metrics.stravaSyncFailures.value).toBe(3)
    expect(metrics.stravaSyncFailures.definition).not.toMatch(/원천 데이터 없음/)
    expect(metrics.stravaSyncFailures.definition).toMatch(/드랍 시도 실패는 제외/)
  })

  describe('드랍 시도 실패 분리', () => {
    // DB 필터를 흉내 낸다 — 모의 함수가 받은 (컬럼, 값)으로 행을 거르므로, 구현이 필터를
    // 빼먹거나 다른 값으로 걸면 단언이 깨진다.
    const failureRows = [
      { failure_type: 'token_refresh_failed' },
      { failure_type: 'rate_limited' },
      { failure_type: 'strava_api_error' },
      { failure_type: 'drop_attempt_failed' },
      { failure_type: 'drop_attempt_failed' },
    ]

    beforeEach(() => {
      mockMissionRows.mockResolvedValue({ data: [], error: null })
      mockBadgeCount.mockResolvedValue({ count: 0, error: null })
      mockStravaSyncFailureCount.mockImplementation(async (column: string, value: string) => ({
        count: failureRows.filter((row) => row[column as 'failure_type'] !== value).length,
        error: null,
      }))
      mockDropAttemptFailureCount.mockImplementation(async (column: string, value: string) => ({
        count: failureRows.filter((row) => row[column as 'failure_type'] === value).length,
        error: null,
      }))
    })

    it('기간 안에 drop_attempt_failed 행이 섞여 있어도 동기화 실패 건수는 그 행을 뺀 건수다', async () => {
      const metrics = await computeKpiWeeklyMetrics(range)
      expect(metrics.stravaSyncFailures.value).toBe(3)
      expect(mockStravaSyncFailureCount).toHaveBeenCalledWith('failure_type', 'drop_attempt_failed')
    })

    it('dropAttemptFailures는 같은 기간의 drop_attempt_failed 행 건수를 { value, definition }으로 담는다', async () => {
      const metrics = await computeKpiWeeklyMetrics(range)
      expect(metrics.dropAttemptFailures.value).toBe(2)
      expect(metrics.dropAttemptFailures.definition).toMatch(/drop_attempt_failed/)
      expect(mockDropAttemptFailureCount).toHaveBeenCalledWith('failure_type', 'drop_attempt_failed')
    })

    it('해당 유형의 행이 아직 없으면 dropAttemptFailures는 0이고 동기화 실패 건수는 그대로다', async () => {
      mockStravaSyncFailureCount.mockResolvedValue({ count: 4, error: null })
      mockDropAttemptFailureCount.mockResolvedValue({ count: 0, error: null })

      const metrics = await computeKpiWeeklyMetrics(range)
      expect(metrics.dropAttemptFailures.value).toBe(0)
      expect(metrics.stravaSyncFailures.value).toBe(4)
    })

    it('드랍 시도 실패 건수 조회 오류는 예외로 전파한다', async () => {
      mockDropAttemptFailureCount.mockResolvedValue({ count: null, error: { message: 'db down' } })

      await expect(computeKpiWeeklyMetrics(range)).rejects.toBeTruthy()
    })
  })

  it('원천 데이터가 없는 2개 서브지표는 null + reason이다', async () => {
    mockMissionRows.mockResolvedValue({ data: [], error: null })
    mockBadgeCount.mockResolvedValue({ count: 0, error: null })
    mockStravaSyncFailureCount.mockResolvedValue({ count: 0, error: null })

    const metrics = await computeKpiWeeklyMetrics(range)
    expect(metrics.badgeIssuance.duplicate.value).toBeNull()
    expect(metrics.badgeIssuance.duplicate.reason).toMatch(/원천 데이터 없음/)
    expect(metrics.ambientDropExpired.value).toBeNull()
    expect(metrics.ambientDropExpired.reason).toMatch(/원천 데이터 없음/)
  })

  it('응답에 user_id 원본 값이 실리지 않는다(개수만 남는다)', async () => {
    mockMissionRows.mockResolvedValue({
      data: [{ user_id: 'sensitive-user-id-abc' }],
      error: null,
    })
    mockBadgeCount.mockResolvedValue({ count: 1, error: null })
    mockStravaSyncFailureCount.mockResolvedValue({ count: 0, error: null })

    const metrics = await computeKpiWeeklyMetrics(range)
    expect(JSON.stringify(metrics)).not.toContain('sensitive-user-id-abc')
  })

  it('쿼리 오류는 예외로 전파한다(라우트가 500 처리)', async () => {
    mockMissionRows.mockResolvedValue({ data: null, error: { message: 'db down' } })
    mockBadgeCount.mockResolvedValue({ count: 0, error: null })
    mockStravaSyncFailureCount.mockResolvedValue({ count: 0, error: null })

    await expect(computeKpiWeeklyMetrics(range)).rejects.toBeTruthy()
  })

  it('믹스 포인트는 사유별 건수와 amount 합계로 집계된다', async () => {
    mockMissionRows.mockResolvedValue({ data: [], error: null })
    mockBadgeCount.mockResolvedValue({ count: 0, error: null })
    mockStravaSyncFailureCount.mockResolvedValue({ count: 0, error: null })
    mockLedgerPage.mockResolvedValue({
      data: [
        { reason: 'combine_fail_reward', amount: 10 },
        { reason: 'combine_fail_reward', amount: 10 },
        { reason: 'combine_recipe_reward', amount: 300 },
      ],
      error: null,
    })

    const metrics = await computeKpiWeeklyMetrics(range)
    expect(metrics.combinePoints.fail).toMatchObject({ count: 2, totalPoints: 20 })
    expect(metrics.combinePoints.recipe).toMatchObject({ count: 1, totalPoints: 300 })
  })

  it('원장 행이 없으면 건수·합계는 0이다', async () => {
    mockMissionRows.mockResolvedValue({ data: [], error: null })
    mockBadgeCount.mockResolvedValue({ count: 0, error: null })
    mockStravaSyncFailureCount.mockResolvedValue({ count: 0, error: null })

    const metrics = await computeKpiWeeklyMetrics(range)
    expect(metrics.combinePoints.fail).toMatchObject({ count: 0, totalPoints: 0 })
    expect(metrics.combinePoints.recipe).toMatchObject({ count: 0, totalPoints: 0 })
  })

  it('원장 행이 한 페이지(1000건)를 넘으면 다음 페이지까지 읽는다', async () => {
    mockMissionRows.mockResolvedValue({ data: [], error: null })
    mockBadgeCount.mockResolvedValue({ count: 0, error: null })
    mockStravaSyncFailureCount.mockResolvedValue({ count: 0, error: null })
    const fullPage = Array.from({ length: 1000 }, () => ({ reason: 'combine_fail_reward', amount: 5 }))
    mockLedgerPage.mockImplementation(async (from: number) =>
      from === 0
        ? { data: fullPage, error: null }
        : { data: [{ reason: 'combine_fail_reward', amount: 5 }], error: null }
    )

    const metrics = await computeKpiWeeklyMetrics(range)
    expect(mockLedgerPage).toHaveBeenCalledTimes(2)
    expect(metrics.combinePoints.fail).toMatchObject({ count: 1001, totalPoints: 5005 })
  })

  it('결과물 배지가 삭제됐거나 없는 레시피만 유효하지 않은 레시피로 센다', async () => {
    mockMissionRows.mockResolvedValue({ data: [], error: null })
    mockBadgeCount.mockResolvedValue({ count: 0, error: null })
    mockStravaSyncFailureCount.mockResolvedValue({ count: 0, error: null })
    mockRecipes.mockResolvedValue({
      data: [
        { reward_badge_ids: ['b-live'] },
        { reward_badge_ids: ['b-live', 'b-deleted'] },
        { reward_badge_ids: ['b-missing'] },
        { reward_badge_ids: [] },
      ],
      error: null,
    })
    // 삭제되지 않은 배지만 돌려준다 — b-deleted·b-missing은 조회 결과에 없다
    mockLiveBadges.mockResolvedValue({ data: [{ id: 'b-live' }], error: null })

    const metrics = await computeKpiWeeklyMetrics(range)
    expect(metrics.combineRecipeRewardBadges.totalRecipes).toBe(4)
    expect(metrics.combineRecipeRewardBadges.invalidRecipes).toBe(2)
  })

  it('결과물 배지가 하나도 없으면 배지 조회 없이 0을 반환한다', async () => {
    mockMissionRows.mockResolvedValue({ data: [], error: null })
    mockBadgeCount.mockResolvedValue({ count: 0, error: null })
    mockStravaSyncFailureCount.mockResolvedValue({ count: 0, error: null })
    mockRecipes.mockResolvedValue({ data: [{ reward_badge_ids: [] }], error: null })

    const metrics = await computeKpiWeeklyMetrics(range)
    expect(metrics.combineRecipeRewardBadges).toMatchObject({ totalRecipes: 1, invalidRecipes: 0 })
    expect(mockLiveBadges).not.toHaveBeenCalled()
  })

  it('믹스 지표 응답에 레시피 id·배지 id가 실리지 않는다', async () => {
    mockMissionRows.mockResolvedValue({ data: [], error: null })
    mockBadgeCount.mockResolvedValue({ count: 0, error: null })
    mockStravaSyncFailureCount.mockResolvedValue({ count: 0, error: null })
    mockRecipes.mockResolvedValue({ data: [{ reward_badge_ids: ['secret-badge-id'] }], error: null })

    const metrics = await computeKpiWeeklyMetrics(range)
    expect(JSON.stringify(metrics)).not.toContain('secret-badge-id')
  })

  it('원장 조회 오류는 예외로 전파한다', async () => {
    mockMissionRows.mockResolvedValue({ data: [], error: null })
    mockBadgeCount.mockResolvedValue({ count: 0, error: null })
    mockStravaSyncFailureCount.mockResolvedValue({ count: 0, error: null })
    mockLedgerPage.mockResolvedValue({ data: null, error: { message: 'db down' } })

    await expect(computeKpiWeeklyMetrics(range)).rejects.toBeTruthy()
  })
})
