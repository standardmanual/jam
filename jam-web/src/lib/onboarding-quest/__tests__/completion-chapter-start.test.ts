/**
 * `recordOnboardingQuestCompletion`의 챕터 1 시작 연결 (티켓 20261019_1316, 운영 로직 2.2절·12.1절, 사용자 결정 4)
 *
 * 고정하는 것:
 * - 이번 호출에서 완료가 확정되면(`completed_at` 조건부 갱신이 행을 바꿨을 때) 보상 지급 **앞에서** `chapter_start`를 부른다. 건너뛴 유저도 받는다(보상은 없다).
 * - 시작 응답의 `reached_chapters`는 오름 처리로 넘어간다(챕터 1 포함).
 * - 재시도 경로: 완료 기록(`completed_at`)이 이미 있는 유저(보상 재시도 분기, 완료 있음 분기)가 들어오면 `user_chapters.chapter_no`를 읽어 **비어 있을 때만** 다시 시작한다.
 *   이미 챕터가 있으면 RPC를 부르지 않는다.
 * - 행이 없거나 연출 도중이거나 활동이 없거나 동시 호출에 진 경우, 기능 스위치가 꺼진 경우는 부르지 않는다.
 * - 시작이 실패해도(RPC 오류·조회 오류) 완료 보상과 반환값(지급한 완료 배지 id)은 그대로고 던지지 않는다.
 * 공용 DB와 실제 RPC는 호출하지 않는다 — 가짜 클라이언트만 쓴다. 오름 처리의 내용은 `lib/chapter/__tests__/rise.test.ts`가 고정한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/onboarding-quest/__tests__/completion-chapter-start.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { riseMock, logMock, order } = vi.hoisted(() => ({
  riseMock: vi.fn(),
  logMock: vi.fn(),
  /** 부수효과가 일어난 순서 — 'chapter_start' → 'rise' → 'reward_insert' */
  order: [] as string[],
}))

vi.mock('@/lib/chapter/rise', () => ({
  processChapterRise: (...args: unknown[]) => {
    order.push('rise')
    return riseMock(...args)
  },
}))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: (...args: unknown[]) => logMock(...args) }))
vi.mock('@/lib/chapter/badgeReceive', () => ({ awardBadgeReceiveScore: vi.fn(async () => ({ status: 'scored' })) }))
vi.mock('@/lib/points', () => ({ awardPoints: vi.fn(async () => null) }))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/onboarding-quest/config', () => ({
  ONBOARDING_QUEST_ENABLED: true,
  ONBOARDING_QUEST_STEPS: ['sync', 'bag', 'pickup', 'mix_fail', 'mix_success', 'drop', 'browse'],
  ONBOARDING_COMPLETION_BADGE_ID: 'cd20f271-9445-42cc-ac51-d8a96b25e1c3',
}))

import { recordOnboardingQuestCompletion } from '../completion'
import { ONBOARDING_COMPLETION_BADGE_ID } from '../config'

const USER_ID = 'user-chapter-start-test'
const ALL_STEPS_DONE = { sync: '1', bag: '1', pickup: '1', mix_fail: '1', mix_success: '1', drop: '1', browse: '1' }
const BADGE_ROW = { name: '퀘스트 클리어', image_url: null, rarity: null, point_reward: 0, type: 'activity', is_hidden: false, condition_json: {} }

interface QuestRow {
  step_progress: Record<string, string>
  skipped_at: string | null
  completed_at: string | null
  reward_granted_at: string | null
}

interface FakeOptions {
  /** `null`이면 퀘스트 행이 없다 */
  questRow: QuestRow | null
  hasActivity?: boolean
  /** `user_chapters`의 행. `null`이면 행 없음, `{ chapter_no: null }`은 퀘스트 전 점수만 쌓인 상태 */
  chapterRow?: { chapter_no: number | null } | null
  chapterReadError?: boolean
  /** `chapter_start`의 응답 */
  startResult?: { data: unknown; error: unknown }
  /** 선조회에서는 완료 전으로 보이지만 조건부 갱신이 바꾼 행이 없다(동시 호출에 졌다) */
  raceLost?: boolean
}

function makeFake(opts: FakeOptions) {
  const state = opts.questRow ? { ...opts.questRow } : null
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    order.push(name)
    expect(name).toBe('chapter_start')
    expect(args).toEqual({ p_user_id: USER_ID })
    return opts.startResult ?? { data: [{ score_added: 0, current_chapter: 1, reached_chapters: [1] }], error: null }
  })
  const chapterReads: unknown[] = []

  const from = (table: string) => {
    if (table === 'user_onboarding_quests') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state ? { ...state } : null, error: null }) }) }),
        update: (payload: Record<string, unknown>) => {
          if (payload.reward_granted_at === null) {
            return {
              eq: async () => {
                if (state) state.reward_granted_at = null
                return { error: null }
              },
            }
          }
          return {
            eq: () => ({
              is: (col: string, val: unknown) => ({
                select: async () => {
                  const current = state ? (state as unknown as Record<string, unknown>)[col] : undefined
                  if (opts.raceLost || !state || (val === null ? current !== null : current !== val)) return { data: [], error: null }
                  Object.assign(state, payload)
                  return { data: [{ user_id: USER_ID }], error: null }
                },
              }),
            }),
          }
        },
      }
    }
    if (table === 'strava_activities') {
      return {
        select: () => ({
          eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: async () => ({ data: opts.hasActivity ? { id: 1 } : null, error: null }) }) }) }),
        }),
      }
    }
    if (table === 'user_chapters') {
      return {
        select: (columns: string) => {
          chapterReads.push(columns)
          return {
            eq: () => ({
              maybeSingle: async () =>
                opts.chapterReadError ? { data: null, error: { message: 'chapters read failed' } } : { data: opts.chapterRow ?? null, error: null },
            }),
          }
        },
      }
    }
    if (table === 'user_activity_badges') {
      return {
        insert: async () => {
          order.push('reward_insert')
          return { error: null }
        },
      }
    }
    if (table === 'badges') {
      return { select: () => ({ eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: BADGE_ROW, error: null }) }) }) }) }
    }
    throw new Error(`makeFake: 예상치 못한 테이블 — ${table}`)
  }

  return { supabase: { from, rpc } as unknown as SupabaseClient, rpc, state, chapterReads }
}

const FRESH: QuestRow = { step_progress: ALL_STEPS_DONE, skipped_at: null, completed_at: null, reward_granted_at: null }
const SKIPPED: QuestRow = { step_progress: { sync: '1' }, skipped_at: '2026-10-20T00:00:00Z', completed_at: null, reward_granted_at: null }
const COMPLETED_NO_REWARD: QuestRow = { ...FRESH, completed_at: '2026-10-19T00:00:00Z' }
const COMPLETED_REWARDED: QuestRow = { ...FRESH, completed_at: '2026-10-19T00:00:00Z', reward_granted_at: '2026-10-19T00:00:01Z' }

beforeEach(() => {
  order.length = 0
  riseMock.mockReset()
  riseMock.mockResolvedValue(undefined)
  logMock.mockReset()
  logMock.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {}).mockClear()
})

describe('완료가 이번 호출에서 확정됐을 때', () => {
  it('챕터 1을 시작한 뒤에 보상을 지급한다 — 시작 → 오름 처리 → 배지 발급 순서', async () => {
    const { supabase, rpc, chapterReads } = makeFake({ questRow: FRESH, hasActivity: true })

    const result = await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(result).toBe(ONBOARDING_COMPLETION_BADGE_ID)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['chapter_start', 'rise', 'reward_insert'])
    expect(riseMock).toHaveBeenCalledWith({ userId: USER_ID, reachedChapters: [1] })
    // 막 완료된 유저는 챕터가 비어 있다고 알고 있으므로 조회 없이 시작한다
    expect(chapterReads).toEqual([])
  })

  it('쌓인 점수로 한 번에 오른 챕터도 같은 오름 처리 경로를 탄다', async () => {
    const { supabase } = makeFake({
      questRow: FRESH,
      hasActivity: true,
      startResult: { data: [{ score_added: 0, current_chapter: 2, reached_chapters: [1, 2] }], error: null },
    })

    await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(riseMock).toHaveBeenCalledWith({ userId: USER_ID, reachedChapters: [1, 2] })
  })

  it('건너뛴 유저도 챕터 1을 시작한다 — 보상은 없다', async () => {
    const { supabase, rpc } = makeFake({ questRow: SKIPPED, hasActivity: true })

    const result = await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(result).toBeNull()
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['chapter_start', 'rise'])
  })

  it('동시 호출에 져서 바뀐 행이 없으면 시작하지 않는다(이긴 호출이 시작한다)', async () => {
    const { supabase, rpc } = makeFake({ questRow: FRESH, hasActivity: true, raceLost: true })

    const result = await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(result).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('시작이 실패해도(RPC 오류) 완료 보상과 반환값은 그대로이고 실패를 기록한다', async () => {
    const { supabase } = makeFake({ questRow: FRESH, hasActivity: true, startResult: { data: null, error: { message: 'check_violation' } } })

    const result = await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(result).toBe(ONBOARDING_COMPLETION_BADGE_ID)
    expect(order).toEqual(['chapter_start', 'reward_insert'])
    expect(riseMock).not.toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledWith('points', 'chapter_start_failed', USER_ID, { error: expect.stringContaining('check_violation') })
  })
})

describe('완료 기록이 이미 있는 유저 — 챕터가 비어 있을 때만 다시 시작한다 (사용자 결정 4)', () => {
  it('보상 재시도 분기: 챕터가 비어 있으면 시작한 뒤 보상을 다시 지급한다', async () => {
    const { supabase, rpc, chapterReads } = makeFake({ questRow: COMPLETED_NO_REWARD, chapterRow: null })

    const result = await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(result).toBe(ONBOARDING_COMPLETION_BADGE_ID)
    expect(chapterReads).toEqual(['chapter_no'])
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['chapter_start', 'rise', 'reward_insert'])
  })

  it('보상 재시도 분기: 이미 챕터가 있으면 RPC를 부르지 않고 보상만 다시 지급한다', async () => {
    const { supabase, rpc } = makeFake({ questRow: COMPLETED_NO_REWARD, chapterRow: { chapter_no: 3 } })

    const result = await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(result).toBe(ONBOARDING_COMPLETION_BADGE_ID)
    expect(rpc).not.toHaveBeenCalled()
    expect(riseMock).not.toHaveBeenCalled()
    expect(order).toEqual(['reward_insert'])
  })

  it('완료 있음 분기(옛 퀘스트 완료자): 챕터가 비어 있으면 시작하고 반환은 null이다', async () => {
    const { supabase, rpc } = makeFake({ questRow: COMPLETED_REWARDED, chapterRow: null })

    const result = await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(result).toBeNull()
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['chapter_start', 'rise'])
  })

  it('완료 있음 분기: user_chapters 행은 있지만 chapter_no가 NULL(퀘스트 전 점수만 쌓임)이어도 시작한다', async () => {
    const { supabase, rpc } = makeFake({ questRow: COMPLETED_REWARDED, chapterRow: { chapter_no: null } })

    await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('완료 있음 분기: 이미 챕터가 있으면 RPC도 오름 처리도 부르지 않는다 — 동기화마다 불필요한 호출이 없다', async () => {
    const { supabase, rpc, chapterReads } = makeFake({ questRow: COMPLETED_REWARDED, chapterRow: { chapter_no: 1 } })

    const result = await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(result).toBeNull()
    expect(chapterReads).toEqual(['chapter_no'])
    expect(rpc).not.toHaveBeenCalled()
    expect(riseMock).not.toHaveBeenCalled()
    expect(order).toEqual([])
  })

  it('건너뛰고 완료된 유저(보상 없음)도 챕터가 비어 있으면 다시 시작한다', async () => {
    const { supabase, rpc } = makeFake({ questRow: { ...SKIPPED, completed_at: '2026-10-19T00:00:00Z' }, chapterRow: null })

    const result = await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(result).toBeNull()
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('챕터 조회가 실패하면 시작하지 않고 기록만 남긴다 — 반환값은 그대로다', async () => {
    const { supabase, rpc } = makeFake({ questRow: COMPLETED_NO_REWARD, chapterReadError: true })

    const result = await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(result).toBe(ONBOARDING_COMPLETION_BADGE_ID)
    expect(rpc).not.toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledWith('points', 'chapter_start_failed', USER_ID, { error: expect.stringContaining('user_chapters 조회 오류') })
  })

  it('재시도 시작이 던져도 던지지 않고 보상 재시도 결과는 그대로다', async () => {
    const { supabase, rpc } = makeFake({ questRow: COMPLETED_NO_REWARD, chapterRow: null })
    rpc.mockRejectedValue(new Error('network down'))

    await expect(recordOnboardingQuestCompletion(supabase, USER_ID)).resolves.toBe(ONBOARDING_COMPLETION_BADGE_ID)
    expect(logMock).toHaveBeenCalledWith('points', 'chapter_start_failed', USER_ID, { error: expect.stringContaining('network down') })
  })
})

describe('시작하지 않는 경우', () => {
  it('퀘스트 행이 없으면 아무것도 부르지 않는다', async () => {
    const { supabase, rpc, chapterReads } = makeFake({ questRow: null })

    expect(await recordOnboardingQuestCompletion(supabase, USER_ID)).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
    expect(chapterReads).toEqual([])
  })

  it('연출 도중(7단계를 안 마쳤고 건너뛰지도 않음)이면 부르지 않는다', async () => {
    const { supabase, rpc, chapterReads } = makeFake({
      questRow: { ...FRESH, step_progress: { sync: '1', bag: '1' } },
      hasActivity: true,
      chapterRow: null,
    })

    expect(await recordOnboardingQuestCompletion(supabase, USER_ID)).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
    expect(chapterReads).toEqual([])
  })

  it('처리된 활동이 없으면 완료가 기록되지 않아 시작하지 않는다', async () => {
    const { supabase, rpc } = makeFake({ questRow: FRESH, hasActivity: false })

    expect(await recordOnboardingQuestCompletion(supabase, USER_ID)).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('기능 스위치가 꺼져 있으면 조회도 시작도 하지 않는다', async () => {
    vi.resetModules()
    vi.doMock('@/lib/onboarding-quest/config', () => ({
      ONBOARDING_QUEST_ENABLED: false,
      ONBOARDING_QUEST_STEPS: [],
      ONBOARDING_COMPLETION_BADGE_ID: ONBOARDING_COMPLETION_BADGE_ID,
    }))
    const { recordOnboardingQuestCompletion: disabled } = await import('../completion')
    const { supabase, rpc, chapterReads } = makeFake({ questRow: COMPLETED_REWARDED, chapterRow: null })

    expect(await disabled(supabase, USER_ID)).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
    expect(chapterReads).toEqual([])
    vi.doUnmock('@/lib/onboarding-quest/config')
  })
})
