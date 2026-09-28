/**
 * `recordOnboardingQuestCompletion`의 완료 보상 지급 경로 통합 테스트
 * (티켓 20260927_2130 T7b, 상위 20260927_2123).
 *
 * `shouldRecordQuestCompletion`/`shouldGrantQuestReward` 두 순수 함수 뒤에서 실제로
 * `user_activity_badges` insert → `awardPoints` → `recordFeedEvent` 순서로 지급이
 * 일어나는지, 멱등(`reward_granted_at` 선점)과 실패 롤백이 제대로 동작하는지를 고정한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/onboarding-quest/__tests__/completion-reward.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { awardPointsMock, recordFeedEventMock } = vi.hoisted(() => ({
  awardPointsMock: vi.fn(async () => null),
  recordFeedEventMock: vi.fn(async () => {}),
}))

vi.mock('@/lib/points', () => ({ awardPoints: awardPointsMock }))
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
const BADGE_ROW = { name: '퀘스트 클리어', image_url: 'https://example.com/badge.png', rarity: null, point_reward: 100 }
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
            limit: () => ({
              maybeSingle: async () => ({ data: opts.hasActivity ? { id: 1 } : null, error: null }),
            }),
          }),
        }),
      }
    }
    if (table === 'user_activity_badges') {
      return {
        insert: (payload: unknown) => {
          insertCalls.push(payload)
          if (opts.badgeInsertError) return Promise.resolve({ error: opts.badgeInsertError })
          return Promise.resolve({ error: null })
        },
      }
    }
    if (table === 'badges') {
      return {
        select: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: async () =>
                opts.badgeRowMissing
                  ? { data: null, error: null }
                  : { data: BADGE_ROW, error: null },
            }),
          }),
        }),
      }
    }
    throw new Error(`makeFakeSupabase: 예상치 못한 테이블 — ${table}`)
  }

  return { from, __state: state, __insertCalls: insertCalls } as unknown as SupabaseClient
}

beforeEach(() => {
  vi.clearAllMocks()
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
})
