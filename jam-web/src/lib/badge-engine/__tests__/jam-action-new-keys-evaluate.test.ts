/**
 * `evaluateJamActionBadges` — 새 JAM 조건 5종과 잼·챕터 3종이 수치형 지표로 판정되는지 (티켓 20261018_1815 2회)
 *
 * 값 계산은 `jam-action-new-metrics.test.ts`가 고정한다. 여기서는 키마다 «그 키의 계산 함수가 불리고, 그 값이 배지의 조건값과
 * 비교되며, `triggered_by`가 `jam_action:<키>`로 남는다»는 연결만 본다. 계산 모듈과 발급 정책(`issueQualifyingBadges`)은 대체한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/jam-action-new-keys-evaluate.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BadgeRow } from '@/types/database'

const mocks = vi.hoisted(() => ({
  issue: vi.fn(),
  computers: {
    countCapsuleOpens: vi.fn(),
    countLockedItemOpens: vi.fn(),
    countLockedItemPickups: vi.fn(),
    countOtherTribeItemKinds: vi.fn(),
    countCrossTribeCombineSuccess: vi.fn(),
    readJamTotalEarned: vi.fn(),
    readJamWeeklyEarned: vi.fn(),
    readChapterReached: vi.fn(),
  },
  badges: [] as unknown[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))
vi.mock('../usageBadges', () => ({ issueQualifyingBadges: mocks.issue }))
vi.mock('../jamActionItemMetrics', () => ({
  countCapsuleOpens: mocks.computers.countCapsuleOpens,
  countLockedItemOpens: mocks.computers.countLockedItemOpens,
  countLockedItemPickups: mocks.computers.countLockedItemPickups,
  countOtherTribeItemKinds: mocks.computers.countOtherTribeItemKinds,
  countCrossTribeCombineSuccess: mocks.computers.countCrossTribeCombineSuccess,
}))
vi.mock('../jamActionJamMetrics', () => ({
  readJamTotalEarned: mocks.computers.readJamTotalEarned,
  readJamWeeklyEarned: mocks.computers.readJamWeeklyEarned,
  readChapterReached: mocks.computers.readChapterReached,
}))

import { evaluateJamActionBadges, JAM_ACTION_CONDITION_KEYS } from '../jamActionBadges'

/** 조건 키 → 그 키의 계산 함수 */
const COMPUTER_OF = {
  capsule_open_count: 'countCapsuleOpens',
  locked_item_open_count: 'countLockedItemOpens',
  locked_item_pickup_count: 'countLockedItemPickups',
  other_tribe_item_kinds_count: 'countOtherTribeItemKinds',
  cross_tribe_combine_success_count: 'countCrossTribeCombineSuccess',
  jam_total_earned: 'readJamTotalEarned',
  jam_weekly_earned: 'readJamWeeklyEarned',
  chapter_reached: 'readChapterReached',
} as const

const NEW_KEYS = Object.keys(COMPUTER_OF) as (keyof typeof COMPUTER_OF)[]

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
  mocks.badges = []
})

describe('새 8키는 JAM_ACTION_CONDITION_KEYS에 있다', () => {
  it.each(NEW_KEYS)('%s', (key) => {
    expect(JAM_ACTION_CONDITION_KEYS as readonly string[]).toContain(key)
  })
})

describe('evaluateJamActionBadges — 새 8키', () => {
  it.each(NEW_KEYS)('%s: 계산 함수 값을 현재값으로, 배지의 조건값을 임계로, triggered_by는 jam_action:%s로 발급을 맡긴다', async (key) => {
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

  it.each(NEW_KEYS)('%s: 그 키를 조건으로 가진 배지가 없으면 값 계산 없이 끝난다', async (key) => {
    mocks.badges = [{ id: 'b1', type: 'activity', condition_json: { distance_km: 5 } }]

    await evaluateJamActionBadges('user-1', [key], supabase)

    expect(mocks.computers[COMPUTER_OF[key]]).not.toHaveBeenCalled()
    expect(mocks.issue).not.toHaveBeenCalled()
  })

  it('계산이 던지면 그 지표만 건너뛰고 다른 지표는 계속한다(fail-closed)', async () => {
    mocks.badges = [
      { id: 'b1', type: 'activity', condition_json: { chapter_reached: 3 } },
      { id: 'b2', type: 'activity', condition_json: { capsule_open_count: 3 } },
    ]
    mocks.computers.readChapterReached.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await evaluateJamActionBadges('user-1', ['chapter_reached', 'capsule_open_count'], supabase)

    expect(mocks.issue).toHaveBeenCalledTimes(1)
    expect(mocks.issue.mock.calls[0][2]).toEqual([mocks.badges[1]])
  })
})
