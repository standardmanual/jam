/**
 * `recordOnboardingQuestCompletion`의 완료 보상 지급 경로 통합 테스트
 * (티켓 20260927_2130 T7b, 상위 20260927_2123).
 *
 * `shouldRecordQuestCompletion`/`shouldGrantQuestReward` 두 순수 함수 뒤에서 실제로
 * `user_activity_badges` insert → `awardPoints` → `recordFeedEvent` 순서로 지급이
 * 일어나는지, 멱등(`reward_granted_at` 선점)과 실패 롤백이 제대로 동작하는지를 고정한다.
 *
 * 챕터 점수 «배지 받기»(티켓 20261019_1315 2a회, 운영 로직 12.2절): 배지를 **새로 넣은 경우에만** 공용 함수 `awardBadgeReceiveScore`를 부른다.
 * 23505(이미 보유)·건너뛴 유저·`reward_granted_at` 선점 실패·배지 정보 조회 실패는 부르지 않는다. 배지 정보 조회는 유형·숨김·제외 조건 판별에 쓰는
 * `type`·`is_hidden`·`condition_json`을 함께 읽는다. 점수 쪽이 실패해도 완료 보상(포인트·피드)은 그대로다. 거르는 규칙은 `lib/chapter/__tests__/badge-receive.test.ts`가 고정한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/onboarding-quest/__tests__/completion-reward.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { awardPointsMock, recordFeedEventMock, awardBadgeReceiveScoreMock, badgeSelects } = vi.hoisted(() => ({
  awardPointsMock: vi.fn(async () => null),
  recordFeedEventMock: vi.fn(async () => {}),
  awardBadgeReceiveScoreMock: vi.fn(async () => ({ status: 'scored' })),
  /** `badges` 표 조회의 컬럼 선택 기록 */
  badgeSelects: [] as string[],
}))

vi.mock('@/lib/points', () => ({ awardPoints: awardPointsMock }))
vi.mock('@/lib/chapter/badgeReceive', () => ({ awardBadgeReceiveScore: awardBadgeReceiveScoreMock }))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: recordFeedEventMock }))
// 기능 스위치가 꺼져 있으면(config.ts 기본값) recordOnboardingQuestCompletion이 조회 없이
// 즉시 null을 반환한다 — 이 파일은 그 뒤 지급 로직을 보므로 스위치를 켠 채로 고정한다.
vi.mock('@/lib/onboarding-quest/config', () => ({
  ONBOARDING_QUEST_ENABLED: true,
  ONBOARDING_QUEST_STEPS: ['sync', 'bag', 'pickup', 'mix_fail', 'mix_success', 'drop', 'browse'],
  ONBOARDING_COMPLETION_BADGE_ID: 'cd20f271-9445-42cc-ac51-d8a96b25e1c3',
}))

import { recordOnboardingQuestCompletion } from '../completion'
import { ONBOARDING_COMPLETION_BADGE_ID } from '../config'

const USER_ID = 'user-quest-reward-test'
const BADGE_ROW = {
  name: '퀘스트 클리어',
  image_url: 'https://example.com/badge.png',
  rarity: null,
  point_reward: 100,
  type: 'activity',
  is_hidden: false,
  condition_json: { mission_reward: true },
}
// 7단계를 모두 마친 진행 상태 — `nextStepOf`가 null을 반환하려면 전 단계가 다 채워져야 한다.
const ALL_STEPS_DONE = {
  sync: '1',
  bag: '1',
  pickup: '1',
  mix_fail: '1',
  mix_success: '1',
  drop: '1',
  browse: '1',
}

/** `user_onboarding_quests`(행 상태 가변)·`strava_activities`·`user_activity_badges`·
 *  `badges` 4개 테이블만 지원하는 최소 페이크 supabase. */
function makeFakeSupabase(opts: {
  questRow: { step_progress: Record<string, string>; skipped_at: string | null; completed_at: string | null; reward_granted_at: string | null }
  hasActivity: boolean
  badgeInsertError?: { code: string; message: string }
  /** 지정하면 그 횟수만큼만 배지 insert가 실패하고 이후엔 성공한다(재시도 검증용). */
  badgeInsertFailTimes?: number
  badgeRowMissing?: boolean
}): SupabaseClient {
  const state = { ...opts.questRow }
  const insertCalls: unknown[] = []

  const from = (table: string) => {
    if (table === 'user_onboarding_quests') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                step_progress: state.step_progress,
                skipped_at: state.skipped_at,
                completed_at: state.completed_at,
                reward_granted_at: state.reward_granted_at,
              },
              error: null,
            }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          // 롤백 경로(`{ reward_granted_at: null }`)는 `.eq()`만 붙이고 곧장 await한다 —
          // 실제 코드(`grantOnboardingQuestReward`)의 호출 모양 그대로.
          const isRollback = 'reward_granted_at' in payload && payload.reward_granted_at === null

          if (isRollback) {
            return {
              eq: async (col: string, val: unknown) => {
                if (col === 'user_id' && val === USER_ID) state.reward_granted_at = null
                return { error: null }
              },
            }
          }

          // 조건부 갱신(`.is(col, null).select()`) — completed_at 최초 기록·
          // reward_granted_at 선점이 둘 다 이 모양이다.
          return {
            eq: () => ({
              is: (col: string, val: unknown) => {
                const current = (state as Record<string, unknown>)[col]
                const matches = val === null ? current === null : current === val
                return {
                  select: async () => {
                    if (!matches) return { data: [], error: null }
                    Object.assign(state, payload)
                    return { data: [{ user_id: USER_ID }], error: null }
                  },
                }
              },
            }),
          }
        },
      }
    }
    if (table === 'strava_activities') {
      return {
        select: () => ({
          eq: () => ({
            // 걸러진 활동은 «실제 첫 활동»이 아니다 — `filter_reason IS NULL` 조건이 붙는다(티켓 20261017_1421)
            is: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: opts.hasActivity ? { id: 1 } : null, error: null }),
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'user_activity_badges') {
      return {
        insert: (payload: unknown) => {
          insertCalls.push(payload)
          if (opts.badgeInsertError && insertCalls.length <= (opts.badgeInsertFailTimes ?? Infinity)) return Promise.resolve({ error: opts.badgeInsertError })
          return Promise.resolve({ error: null })
        },
      }
    }
    if (table === 'badges') {
      return {
        select: (columns: string) => {
          badgeSelects.push(columns)
          return {
            eq: () => ({
              is: () => ({
                maybeSingle: async () =>
                  opts.badgeRowMissing
                    ? { data: null, error: null }
                    : { data: BADGE_ROW, error: null },
              }),
            }),
          }
        },
      }
    }
    throw new Error(`makeFakeSupabase: 예상치 못한 테이블 — ${table}`)
  }

  return { from, __state: state, __insertCalls: insertCalls } as unknown as SupabaseClient
}

beforeEach(() => {
  vi.clearAllMocks()
  badgeSelects.length = 0
  awardBadgeReceiveScoreMock.mockResolvedValue({ status: 'scored' })
})

describe('recordOnboardingQuestCompletion — 완료 보상 지급(T7b)', () => {
  it('완료가 확정되면 완료 배지를 지급하고 point_reward만큼 포인트·피드 이벤트를 기록한다', async () => {
    const supabase = makeFakeSupabase({
      questRow: { step_progress: ALL_STEPS_DONE, skipped_at: null, completed_at: null, reward_granted_at: null },
      hasActivity: true,
    })

    const result = await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(result).toBe(ONBOARDING_COMPLETION_BADGE_ID)
    expect(awardPointsMock).toHaveBeenCalledWith(USER_ID, 100, 'badge_point_reward', {
      sourceBadgeId: ONBOARDING_COMPLETION_BADGE_ID,
    })
    expect(recordFeedEventMock).toHaveBeenCalledWith(
      USER_ID,
      'badge_earned',
      expect.objectContaining({ badge_id: ONBOARDING_COMPLETION_BADGE_ID, point_reward: 100 })
    )
  })

  it('건너뛴 유저는 completed_at만 기록되고 보상은 지급하지 않는다', async () => {
    const supabase = makeFakeSupabase({
      questRow: {
        step_progress: { sync: '1' },
        skipped_at: '2026-09-28T00:00:00Z',
        completed_at: null,
        reward_granted_at: null,
      },
      hasActivity: true,
    })

    const result = await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(result).toBeNull()
    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(recordFeedEventMock).not.toHaveBeenCalled()
  })

  it('배지 insert가 23505(이미 보유)면 포인트·피드를 건너뛰고 null을 반환한다', async () => {
    const supabase = makeFakeSupabase({
      questRow: { step_progress: ALL_STEPS_DONE, skipped_at: null, completed_at: null, reward_granted_at: null },
      hasActivity: true,
      badgeInsertError: { code: '23505', message: 'duplicate key' },
    })

    const result = await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(result).toBeNull()
    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(recordFeedEventMock).not.toHaveBeenCalled()
  })

  it('배지 행이 아직 없어 insert가 실패해도 동기화가 죽지 않고 null을 반환한다', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const supabase = makeFakeSupabase({
      questRow: { step_progress: ALL_STEPS_DONE, skipped_at: null, completed_at: null, reward_granted_at: null },
      hasActivity: true,
      badgeInsertError: { code: '23503', message: 'foreign key violation — 배지 행 없음' },
    })

    const result = await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(result).toBeNull()
    expect(awardPointsMock).not.toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })
  it('배지 insert 실패로 롤백된 뒤 다음 호출에서 지급을 다시 시도해 배지·포인트를 준다', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const supabase = makeFakeSupabase({
      questRow: { step_progress: ALL_STEPS_DONE, skipped_at: null, completed_at: null, reward_granted_at: null },
      hasActivity: true,
      badgeInsertError: { code: '23503', message: 'foreign key violation' },
      badgeInsertFailTimes: 1,
    })

    expect(await recordOnboardingQuestCompletion(supabase, USER_ID)).toBeNull()
    expect(awardPointsMock).not.toHaveBeenCalled()

    expect(await recordOnboardingQuestCompletion(supabase, USER_ID)).toBe(ONBOARDING_COMPLETION_BADGE_ID)
    expect(awardPointsMock).toHaveBeenCalledTimes(1)
    consoleErrorSpy.mockRestore()
  })

  it('completed_at만 있고 reward_granted_at이 NULL이면(기존 유실 유저) 지급한다', async () => {
    const supabase = makeFakeSupabase({
      questRow: {
        step_progress: ALL_STEPS_DONE,
        skipped_at: null,
        completed_at: '2026-09-28T00:00:00Z',
        reward_granted_at: null,
      },
      hasActivity: true,
    })

    expect(await recordOnboardingQuestCompletion(supabase, USER_ID)).toBe(ONBOARDING_COMPLETION_BADGE_ID)
    expect(awardPointsMock).toHaveBeenCalledTimes(1)
  })

  it('연속 2회 호출해도 배지·포인트·피드는 1회만 나간다(awardPoints가 null을 반환해도 재지급 없음)', async () => {
    const supabase = makeFakeSupabase({
      questRow: { step_progress: ALL_STEPS_DONE, skipped_at: null, completed_at: null, reward_granted_at: null },
      hasActivity: true,
    })

    expect(await recordOnboardingQuestCompletion(supabase, USER_ID)).toBe(ONBOARDING_COMPLETION_BADGE_ID)
    expect(await recordOnboardingQuestCompletion(supabase, USER_ID)).toBeNull()

    expect((supabase as unknown as { __insertCalls: unknown[] }).__insertCalls).toHaveLength(1)
    expect(awardPointsMock).toHaveBeenCalledTimes(1)
    expect(recordFeedEventMock).toHaveBeenCalledTimes(1)
  })

  it('건너뛴 유저는 completed_at이 있고 reward_granted_at이 NULL이어도 재시도하지 않는다', async () => {
    const supabase = makeFakeSupabase({
      questRow: {
        step_progress: { sync: '1' },
        skipped_at: '2026-09-28T00:00:00Z',
        completed_at: '2026-09-28T00:00:00Z',
        reward_granted_at: null,
      },
      hasActivity: true,
    })

    expect(await recordOnboardingQuestCompletion(supabase, USER_ID)).toBeNull()
    expect((supabase as unknown as { __insertCalls: unknown[] }).__insertCalls).toHaveLength(0)
    expect(awardPointsMock).not.toHaveBeenCalled()
  })
})

describe('recordOnboardingQuestCompletion — 챕터 점수 «배지 받기» (티켓 20261019_1315 2a회)', () => {
  it('완료 배지를 새로 넣으면 배지의 id·유형·숨김·조건과 출처를 넘겨 점수 함수를 한 번 부른다', async () => {
    const supabase = makeFakeSupabase({
      questRow: { step_progress: ALL_STEPS_DONE, skipped_at: null, completed_at: null, reward_granted_at: null },
      hasActivity: true,
    })

    await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(awardBadgeReceiveScoreMock).toHaveBeenCalledTimes(1)
    expect(awardBadgeReceiveScoreMock).toHaveBeenCalledWith(supabase, {
      userId: USER_ID,
      badge: { id: ONBOARDING_COMPLETION_BADGE_ID, type: 'activity', is_hidden: false, condition_json: { mission_reward: true } },
      origin: { triggeredBy: 'onboarding_quest' },
    })
  })

  it('완료 배지 정보 조회가 유형·숨김·제외 조건 판별에 쓰는 컬럼을 함께 읽는다', async () => {
    const supabase = makeFakeSupabase({
      questRow: { step_progress: ALL_STEPS_DONE, skipped_at: null, completed_at: null, reward_granted_at: null },
      hasActivity: true,
    })

    await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(badgeSelects).toHaveLength(1)
    for (const column of ['type', 'is_hidden', 'condition_json']) expect(badgeSelects[0]).toContain(column)
  })

  it('연속 2회 호출해도 점수 함수는 한 번만 부른다', async () => {
    const supabase = makeFakeSupabase({
      questRow: { step_progress: ALL_STEPS_DONE, skipped_at: null, completed_at: null, reward_granted_at: null },
      hasActivity: true,
    })

    await recordOnboardingQuestCompletion(supabase, USER_ID)
    await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(awardBadgeReceiveScoreMock).toHaveBeenCalledTimes(1)
  })

  it('배지 insert가 23505(이미 보유)면 점수를 부르지 않는다', async () => {
    const supabase = makeFakeSupabase({
      questRow: { step_progress: ALL_STEPS_DONE, skipped_at: null, completed_at: null, reward_granted_at: null },
      hasActivity: true,
      badgeInsertError: { code: '23505', message: 'duplicate key' },
    })

    await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(awardBadgeReceiveScoreMock).not.toHaveBeenCalled()
  })

  it('건너뛴 유저는 점수를 부르지 않는다', async () => {
    const supabase = makeFakeSupabase({
      questRow: { step_progress: { sync: '1' }, skipped_at: '2026-09-28T00:00:00Z', completed_at: null, reward_granted_at: null },
      hasActivity: true,
    })

    await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(awardBadgeReceiveScoreMock).not.toHaveBeenCalled()
  })

  it('배지 insert가 실패해 롤백됐다가 다음 호출에서 지급되면 그때 한 번 센다', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const supabase = makeFakeSupabase({
      questRow: { step_progress: ALL_STEPS_DONE, skipped_at: null, completed_at: null, reward_granted_at: null },
      hasActivity: true,
      badgeInsertError: { code: '23503', message: 'foreign key violation' },
      badgeInsertFailTimes: 1,
    })

    await recordOnboardingQuestCompletion(supabase, USER_ID)
    expect(awardBadgeReceiveScoreMock).not.toHaveBeenCalled()

    await recordOnboardingQuestCompletion(supabase, USER_ID)
    expect(awardBadgeReceiveScoreMock).toHaveBeenCalledTimes(1)
    consoleErrorSpy.mockRestore()
  })

  it('배지 정보 조회가 실패하면 유형·숨김·조건을 알 수 없어 점수를 부르지 않는다 (배지는 이미 발급된 상태)', async () => {
    const supabase = makeFakeSupabase({
      questRow: { step_progress: ALL_STEPS_DONE, skipped_at: null, completed_at: null, reward_granted_at: null },
      hasActivity: true,
      badgeRowMissing: true,
    })
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(result).toBe(ONBOARDING_COMPLETION_BADGE_ID)
    expect(awardBadgeReceiveScoreMock).not.toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('점수 호출이 실패(failed)여도 완료 보상(포인트·피드)은 그대로다', async () => {
    awardBadgeReceiveScoreMock.mockResolvedValue({ status: 'failed' })
    const supabase = makeFakeSupabase({
      questRow: { step_progress: ALL_STEPS_DONE, skipped_at: null, completed_at: null, reward_granted_at: null },
      hasActivity: true,
    })

    const result = await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(result).toBe(ONBOARDING_COMPLETION_BADGE_ID)
    expect(awardPointsMock).toHaveBeenCalledTimes(1)
    expect(recordFeedEventMock).toHaveBeenCalledTimes(1)
  })
})
