/**
 * `evaluateJamActionBadges` — 체크인·드랍·잼 새 지표 5종이 판정되는지 (티켓 20261019_0542 2회)
 *
 * 값 계산은 `jam-action-checkin-drop-jam-metrics.test.ts`가 고정한다. 여기서는 «계산 함수가 불리고, 그 값이 배지의 조건값과 비교되며,
 * `triggered_by`가 `jam_action:<키>`로 남는다»는 연결과, `jam_week_count`·`jam_week_streak`의 보조 키(`jam_week_min_earned`)별 판정을 본다.
 * 계산 모듈과 발급 정책(`issueQualifyingBadges`)은 대체한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/jam-action-checkin-drop-jam-keys-evaluate.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BadgeRow } from '@/types/database'

const mocks = vi.hoisted(() => ({
  issue: vi.fn(),
  computers: {
    countNewCheckinBadgeCount: vi.fn(),
    countCheckinSeasonYearCount: vi.fn(),
    countDroppedItemPickedUpCount: vi.fn(),
  },
  fetchDailyEarnedRows: vi.fn(),
  badges: [] as unknown[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))
vi.mock('../usageBadges', () => ({ issueQualifyingBadges: mocks.issue }))
vi.mock('../jamActionCheckinMetrics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../jamActionCheckinMetrics')>()),
  countNewCheckinBadgeCount: mocks.computers.countNewCheckinBadgeCount,
  countCheckinSeasonYearCount: mocks.computers.countCheckinSeasonYearCount,
}))
vi.mock('../jamActionDropMetrics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../jamActionDropMetrics')>()),
  countDroppedItemPickedUpCount: mocks.computers.countDroppedItemPickedUpCount,
}))
vi.mock('../jamActionJamMetrics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../jamActionJamMetrics')>()),
  fetchDailyEarnedRows: mocks.fetchDailyEarnedRows,
}))

import { evaluateJamActionBadges, JAM_ACTION_CONDITION_KEYS, JAM_ACTION_MODIFIER_KEYS } from '../jamActionBadges'

/** 수치형 키 → 그 키의 계산 함수 */
const COMPUTER_OF = {
  new_checkin_badge_count: 'countNewCheckinBadgeCount',
  checkin_season_year_count: 'countCheckinSeasonYearCount',
  dropped_item_picked_up_count: 'countDroppedItemPickedUpCount',
} as const
const METRIC_KEYS = Object.keys(COMPUTER_OF) as (keyof typeof COMPUTER_OF)[]

function badgesQuery() {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'or']) builder[m] = () => builder
  builder.then = (resolve: (v: unknown) => void) => Promise.resolve({ data: mocks.badges, error: null }).then(resolve)
  return builder
}

const supabase = { from: () => badgesQuery() } as unknown as SupabaseClient

beforeEach(() => {
  mocks.issue.mockReset()
  mocks.issue.mockResolvedValue([])
  for (const fn of Object.values(mocks.computers)) {
    fn.mockReset()
    fn.mockResolvedValue(7)
  }
  mocks.fetchDailyEarnedRows.mockReset()
  mocks.fetchDailyEarnedRows.mockResolvedValue([])
  mocks.badges = []
})

describe('키 목록', () => {
  it('주 키 5개는 JAM_ACTION_CONDITION_KEYS에, 보조 키 jam_week_min_earned는 JAM_ACTION_MODIFIER_KEYS에 있다', () => {
    for (const key of [...METRIC_KEYS, 'jam_week_count', 'jam_week_streak']) {
      expect(JAM_ACTION_CONDITION_KEYS as readonly string[], key).toContain(key)
    }
    expect(JAM_ACTION_MODIFIER_KEYS as readonly string[]).toContain('jam_week_min_earned')
    expect(JAM_ACTION_CONDITION_KEYS as readonly string[]).not.toContain('jam_week_min_earned')
  })
})

describe('evaluateJamActionBadges — 수치형 3키', () => {
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
      { id: 'b1', type: 'activity', condition_json: { new_checkin_badge_count: 1 } },
      { id: 'b2', type: 'activity', condition_json: { dropped_item_picked_up_count: 2 } },
    ]
    mocks.computers.countNewCheckinBadgeCount.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await evaluateJamActionBadges('user-1', ['new_checkin_badge_count', 'dropped_item_picked_up_count'], supabase)

    expect(mocks.issue).toHaveBeenCalledTimes(1)
    expect(mocks.issue.mock.calls[0][2]).toEqual([mocks.badges[1]])
  })
})

describe.each([
  ['jam_week_count', 3, 2],
  ['jam_week_streak', 3, 2],
] as const)('evaluateJamActionBadges — %s (보조 키 jam_week_min_earned)', (key, loosely, strictly) => {
  // 날짜별 모은 잼: 9/14 주 250, 9/21 주 250, 9/28 주 50 → 200 이상인 주는 2주(연속 2), 1잼 이상인 주는 3주(연속 3)
  const rows = [
    { earned_on: '2026-09-15', amount: 250 },
    { earned_on: '2026-09-22', amount: 250 },
    { earned_on: '2026-09-29', amount: 50 },
  ]

  it('후보마다 «채운 주» 기준이 다르다 — 200 이상인 주와 1잼 이상인 주를 따로 센다', async () => {
    mocks.fetchDailyEarnedRows.mockResolvedValue(rows)
    const strict = { id: 'strict', type: 'activity', condition_json: { [key]: 2, jam_week_min_earned: 200 } } as unknown as BadgeRow
    const loose = { id: 'loose', type: 'activity', condition_json: { [key]: 3 } } as unknown as BadgeRow
    mocks.badges = [strict, loose]

    await evaluateJamActionBadges('user-1', [key], supabase)

    expect(mocks.fetchDailyEarnedRows).toHaveBeenCalledTimes(1) // 날짜별 잼은 한 번만 읽는다
    expect(mocks.issue).toHaveBeenCalledTimes(1)
    const [, userId, candidates, thresholdOf, currentValueOf, triggeredByOf] = mocks.issue.mock.calls[0]
    expect(userId).toBe('user-1')
    expect(candidates).toEqual([strict, loose])
    expect(thresholdOf(strict)).toBe(2)
    expect(currentValueOf(strict)).toBe(strictly)
    expect(thresholdOf(loose)).toBe(3)
    expect(currentValueOf(loose)).toBe(loosely) // 보조 키가 없으면 1잼
    expect(triggeredByOf(strict)).toBe(`jam_action:${key}`)
  })

  it('그 키를 조건으로 가진 배지가 없으면 날짜별 잼을 읽지 않는다', async () => {
    mocks.badges = [{ id: 'b1', type: 'activity', condition_json: { jam_week_min_earned: 200 } }]

    await evaluateJamActionBadges('user-1', [key], supabase)

    expect(mocks.fetchDailyEarnedRows).not.toHaveBeenCalled()
    expect(mocks.issue).not.toHaveBeenCalled()
  })

  it('날짜별 잼 조회가 던지면 이 지표만 건너뛴다(fail-closed)', async () => {
    mocks.badges = [
      { id: 'b1', type: 'activity', condition_json: { [key]: 2 } },
      { id: 'b2', type: 'activity', condition_json: { new_checkin_badge_count: 1 } },
    ]
    mocks.fetchDailyEarnedRows.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await evaluateJamActionBadges('user-1', [key, 'new_checkin_badge_count'], supabase)

    expect(mocks.issue).toHaveBeenCalledTimes(1)
    expect(mocks.issue.mock.calls[0][2]).toEqual([mocks.badges[1]])
  })
})
