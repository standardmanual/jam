/**
 * `evaluateJamActionBadges` — 활동 기반 새 지표 5종이 판정되는지 (티켓 20261019_0542 1회)
 *
 * 값 계산은 `jam-action-activity-metrics.test.ts`가 고정한다. 여기서는 «계산 함수가 불리고, 그 값이 배지의 조건값과 비교되며,
 * `triggered_by`가 `jam_action:<키>`로 남는다»는 연결과, `active_week_streak`의 보조 키(`active_week_min_days`)별 판정을 본다.
 * 계산 모듈과 발급 정책(`issueQualifyingBadges`)은 대체한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/jam-action-activity-keys-evaluate.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BadgeRow } from '@/types/database'

const mocks = vi.hoisted(() => ({
  issue: vi.fn(),
  computers: {
    countReturnStreakWeeks: vi.fn(),
    countFullWeekCount: vi.fn(),
    countFullSeasonYearCount: vi.fn(),
    countDistinctActivityTypeCount: vi.fn(),
  },
  fetchRecognizedActivities: vi.fn(),
  badges: [] as unknown[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))
vi.mock('../usageBadges', () => ({ issueQualifyingBadges: mocks.issue }))
vi.mock('../jamActionActivityMetrics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../jamActionActivityMetrics')>()
  return {
    ...actual,
    countReturnStreakWeeks: mocks.computers.countReturnStreakWeeks,
    countFullWeekCount: mocks.computers.countFullWeekCount,
    countFullSeasonYearCount: mocks.computers.countFullSeasonYearCount,
    countDistinctActivityTypeCount: mocks.computers.countDistinctActivityTypeCount,
    fetchRecognizedActivities: mocks.fetchRecognizedActivities,
  }
})

import { evaluateJamActionBadges, JAM_ACTION_CONDITION_KEYS, JAM_ACTION_MODIFIER_KEYS } from '../jamActionBadges'

/** 수치형 키 → 그 키의 계산 함수 */
const COMPUTER_OF = {
  return_streak_weeks: 'countReturnStreakWeeks',
  full_week_count: 'countFullWeekCount',
  full_season_year_count: 'countFullSeasonYearCount',
  distinct_activity_type_count: 'countDistinctActivityTypeCount',
} as const
const METRIC_KEYS = Object.keys(COMPUTER_OF) as (keyof typeof COMPUTER_OF)[]

function badgesQuery() {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'or']) builder[m] = () => builder
  builder.then = (resolve: (v: unknown) => void) => Promise.resolve({ data: mocks.badges, error: null }).then(resolve)
  return builder
}

const supabase = { from: () => badgesQuery() } as unknown as SupabaseClient

/** 주(월요일 키) 하나에 활동한 날 n일(월요일부터)을 만든다 */
function week(monday: string, days: number): { dayKey: string; type: string }[] {
  const [y, m, d] = monday.split('-').map(Number)
  return Array.from({ length: days }, (_, i) => ({
    dayKey: new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10),
    type: 'running',
  }))
}

beforeEach(() => {
  mocks.issue.mockReset()
  mocks.issue.mockResolvedValue([])
  for (const fn of Object.values(mocks.computers)) {
    fn.mockReset()
    fn.mockResolvedValue(7)
  }
  mocks.fetchRecognizedActivities.mockReset()
  mocks.fetchRecognizedActivities.mockResolvedValue([])
  mocks.badges = []
})

describe('키 목록', () => {
  it('주 키 5개는 JAM_ACTION_CONDITION_KEYS에, 보조 키 active_week_min_days는 JAM_ACTION_MODIFIER_KEYS에 있다', () => {
    for (const key of [...METRIC_KEYS, 'active_week_streak']) {
      expect(JAM_ACTION_CONDITION_KEYS as readonly string[], key).toContain(key)
    }
    expect(JAM_ACTION_MODIFIER_KEYS as readonly string[]).toContain('active_week_min_days')
    expect(JAM_ACTION_CONDITION_KEYS as readonly string[]).not.toContain('active_week_min_days')
  })
})

describe('evaluateJamActionBadges — 수치형 4키', () => {
  it.each(METRIC_KEYS)('%s: 계산 함수 값을 현재값으로, 배지의 조건값을 임계로, triggered_by는 jam_action:%s로 발급을 맡긴다', async (key) => {
    const badge = { id: 'b1', type: 'activity', condition_json: { [key]: 5 } } as unknown as BadgeRow
    mocks.badges = [badge]

    await evaluateJamActionBadges('user-1', [key], supabase)

    expect(mocks.computers[COMPUTER_OF[key]]).toHaveBeenCalledTimes(1)
    expect(mocks.computers[COMPUTER_OF[key]]).toHaveBeenCalledWith(supabase, 'user-1')
    expect(mocks.issue).toHaveBeenCalledTimes(1)
    const [, userId, candidates, thresholdOf, currentValueOf, triggeredByOf] = mocks.issue.mock.calls[0]
    expect(userId).toBe('user-1')
    expect(candidates).toEqual([badge])
    expect(thresholdOf(badge)).toBe(5)
    expect(currentValueOf(badge)).toBe(7)
    expect(triggeredByOf(badge)).toBe(`jam_action:${key}`)
  })

  it.each(METRIC_KEYS)('%s: 그 키를 조건으로 가진 배지가 없으면 값 계산 없이 끝난다', async (key) => {
    mocks.badges = [{ id: 'b1', type: 'activity', condition_json: { distance_km: 5 } }]

    await evaluateJamActionBadges('user-1', [key], supabase)

    expect(mocks.computers[COMPUTER_OF[key]]).not.toHaveBeenCalled()
    expect(mocks.issue).not.toHaveBeenCalled()
  })

  it('계산이 던지면 그 지표만 건너뛰고 다른 지표는 계속한다(fail-closed)', async () => {
    mocks.badges = [
      { id: 'b1', type: 'activity', condition_json: { full_week_count: 1 } },
      { id: 'b2', type: 'activity', condition_json: { distinct_activity_type_count: 2 } },
    ]
    mocks.computers.countFullWeekCount.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await evaluateJamActionBadges('user-1', ['full_week_count', 'distinct_activity_type_count'], supabase)

    expect(mocks.issue).toHaveBeenCalledTimes(1)
    expect(mocks.issue.mock.calls[0][2]).toEqual([mocks.badges[1]])
  })
})

describe('evaluateJamActionBadges — active_week_streak (보조 키 active_week_min_days)', () => {
  it('후보마다 «채운 주» 기준이 다르다 — 3일 이상인 주의 연속과 1일 이상인 주의 연속을 따로 센다', async () => {
    // 9/14 주 3일, 9/21 주 3일, 9/28 주 1일 → 3일 이상 연속 2주, 1일 이상 연속 3주
    mocks.fetchRecognizedActivities.mockResolvedValue([...week('2026-09-14', 3), ...week('2026-09-21', 3), ...week('2026-09-28', 1)])
    const strict = { id: 'strict', type: 'activity', condition_json: { active_week_streak: 2, active_week_min_days: 3 } } as unknown as BadgeRow
    const loose = { id: 'loose', type: 'activity', condition_json: { active_week_streak: 3 } } as unknown as BadgeRow
    mocks.badges = [strict, loose]

    await evaluateJamActionBadges('user-1', ['active_week_streak'], supabase)

    expect(mocks.fetchRecognizedActivities).toHaveBeenCalledTimes(1) // 활동은 한 번만 읽는다
    expect(mocks.issue).toHaveBeenCalledTimes(1)
    const [, userId, candidates, thresholdOf, currentValueOf, triggeredByOf] = mocks.issue.mock.calls[0]
    expect(userId).toBe('user-1')
    expect(candidates).toEqual([strict, loose])
    expect(thresholdOf(strict)).toBe(2)
    expect(currentValueOf(strict)).toBe(2)
    expect(thresholdOf(loose)).toBe(3)
    expect(currentValueOf(loose)).toBe(3) // 보조 키가 없으면 1일
    expect(triggeredByOf(strict)).toBe('jam_action:active_week_streak')
  })

  it('기준이 7일인 주(1-4가 아니라도 허용되는 값)는 7일을 채운 주만 센다', async () => {
    mocks.fetchRecognizedActivities.mockResolvedValue([...week('2026-09-14', 7), ...week('2026-09-21', 6)])
    const badge = { id: 'b', type: 'activity', condition_json: { active_week_streak: 2, active_week_min_days: 7 } } as unknown as BadgeRow
    mocks.badges = [badge]

    await evaluateJamActionBadges('user-1', ['active_week_streak'], supabase)

    expect(mocks.issue.mock.calls[0][4](badge)).toBe(1)
  })

  it('그 키를 조건으로 가진 배지가 없으면 활동을 읽지 않는다', async () => {
    mocks.badges = [{ id: 'b1', type: 'activity', condition_json: { active_week_min_days: 3 } }]

    await evaluateJamActionBadges('user-1', ['active_week_streak'], supabase)

    expect(mocks.fetchRecognizedActivities).not.toHaveBeenCalled()
    expect(mocks.issue).not.toHaveBeenCalled()
  })

  it('활동 조회가 던지면 이 지표만 건너뛴다(fail-closed)', async () => {
    mocks.badges = [
      { id: 'b1', type: 'activity', condition_json: { active_week_streak: 2 } },
      { id: 'b2', type: 'activity', condition_json: { full_week_count: 1 } },
    ]
    mocks.fetchRecognizedActivities.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await evaluateJamActionBadges('user-1', ['active_week_streak', 'full_week_count'], supabase)

    expect(mocks.issue).toHaveBeenCalledTimes(1)
    expect(mocks.issue.mock.calls[0][2]).toEqual([mocks.badges[1]])
  })
})
