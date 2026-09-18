/**
 * 주간 집계 API 계산 로직 — 순수 로직 회귀 (티켓 20260918_1150)
 *
 * 지키는 것:
 * 1. `resolveKpiWeeklyRange`가 기본 7일이고 `days` 파라미터로 바뀐다
 * 2. 잘못된 `days`(음수·0·문자·상한 초과)는 기본값으로 폴백한다 — 조용히 이상한
 *    범위로 집계되지 않는다
 * 3. 미션 달성자 수는 distinct user_id, 배지 발급량은 기간 내 건수로 집계된다
 * 4. 원천 데이터가 없는 3개 서브지표(배지 중복 발급·Strava 동기화 실패·앰비언트 드랍
 *    만료)는 추측 없이 `null` + `reason`을 반환한다
 * 5. 응답 어디에도 user_id 같은 개인 식별 값이 그대로 실리지 않는다(개수만 남는다)
 */
import { vi } from 'vitest'

const mockMissionRows = vi.fn()
const mockBadgeCount = vi.fn()

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

  it('미션 달성자 수는 distinct user_id 개수다', async () => {
    mockMissionRows.mockResolvedValue({
      data: [{ user_id: 'u1' }, { user_id: 'u1' }, { user_id: 'u2' }],
      error: null,
    })
    mockBadgeCount.mockResolvedValue({ count: 5, error: null })

    const metrics = await computeKpiWeeklyMetrics(range)
    expect(metrics.missionAchievers.value).toBe(2)
  })

  it('배지 발급량은 기간 내 건수를 그대로 담는다', async () => {
    mockMissionRows.mockResolvedValue({ data: [], error: null })
    mockBadgeCount.mockResolvedValue({ count: 7, error: null })

    const metrics = await computeKpiWeeklyMetrics(range)
    expect(metrics.badgeIssuance.issued.value).toBe(7)
  })

  it('원천 데이터가 없는 3개 서브지표는 null + reason이다', async () => {
    mockMissionRows.mockResolvedValue({ data: [], error: null })
    mockBadgeCount.mockResolvedValue({ count: 0, error: null })

    const metrics = await computeKpiWeeklyMetrics(range)
    expect(metrics.badgeIssuance.duplicate.value).toBeNull()
    expect(metrics.badgeIssuance.duplicate.reason).toMatch(/원천 데이터 없음/)
    expect(metrics.stravaSyncFailures.value).toBeNull()
    expect(metrics.stravaSyncFailures.reason).toMatch(/원천 데이터 없음/)
    expect(metrics.ambientDropExpired.value).toBeNull()
    expect(metrics.ambientDropExpired.reason).toMatch(/원천 데이터 없음/)
  })

  it('응답에 user_id 원본 값이 실리지 않는다(개수만 남는다)', async () => {
    mockMissionRows.mockResolvedValue({
      data: [{ user_id: 'sensitive-user-id-abc' }],
      error: null,
    })
    mockBadgeCount.mockResolvedValue({ count: 1, error: null })

    const metrics = await computeKpiWeeklyMetrics(range)
    expect(JSON.stringify(metrics)).not.toContain('sensitive-user-id-abc')
  })

  it('쿼리 오류는 예외로 전파한다(라우트가 500 처리)', async () => {
    mockMissionRows.mockResolvedValue({ data: null, error: { message: 'db down' } })
    mockBadgeCount.mockResolvedValue({ count: 0, error: null })

    await expect(computeKpiWeeklyMetrics(range)).rejects.toBeTruthy()
  })
})
