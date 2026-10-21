/**
 * `recordOnboardingQuestCompletion`의 챕터 1 시작 연결과 실제 3단계 순서
 * (티켓 20261019_1316 운영 로직 2.2절·12.1절 사용자 결정 4, 개편 20261021_1248 6-2 사용자 결정 1)
 *
 * 고정하는 것:
 * - **챕터 1은 실제 3단계가 끝난 순간 시작한다.** 연출 7단계가 끝났는지·건너뛰었는지와 무관하다. 실제 3단계가 하나라도 남아 있으면 시작하지 않는다.
 *   ②③이 어떤 순서로 끝나도 둘이 모두 되면 시작한다.
 * - **완료(`completed_at`)와 보상은 «연출 끝 또는 건너뜀»과 «실제 3단계 완료»가 둘 다 된 뒤**에 한 번 나간다. 연출 전에 실제 3단계를 마치면 챕터 1은 바로 받고
 *   보상은 연출을 마친 뒤에 나간다. 건너뛴 유저는 챕터 1만 받는다(배지·포인트 없음).
 * - 챕터 1 시작 순서: 시작 → 오름 처리(소식) → 배지 발급. 시작 응답의 `reached_chapters`는 오름 처리로 넘어간다(챕터 1 포함).
 * - 챕터 1 소식은 한 건만 나간다: 챕터가 생긴 뒤의 호출은 DB 함수를 부르지 않고, 동시 호출에 져서 `reached_chapters`가 빈 응답을 받으면 오름 처리도 하지 않는다.
 * - 재시도 경로: 완료 기록(`completed_at`)이 이미 있는 유저(보상 재시도 분기, 완료 있음 분기)가 들어오면 `user_chapters.chapter_no`를 읽어 **비어 있을 때만** 다시 시작한다.
 *   이미 챕터가 있으면 RPC를 부르지 않는다. 완료 기록이 있는 유저는 실제 단계를 다시 읽지 않는다.
 * - 행이 없거나 기능 스위치가 꺼진 경우는 부르지 않는다. 실제 단계를 읽지 못하면 «마쳤다»로 보지 않아 시작하지 않는다.
 * - 시작이 실패해도(RPC 오류·조회 오류) 완료 보상과 반환값(지급한 완료 배지 id)은 그대로고 던지지 않는다.
 * 공용 DB와 실제 RPC는 호출하지 않는다 — 가짜 클라이언트만 쓴다. 오름 처리의 내용은 `lib/chapter/__tests__/rise.test.ts`가 고정한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/onboarding-quest/__tests__/completion-chapter-start.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RealStepsProgress } from '../real-steps'

const { riseMock, logMock, readRealStepsMock, order } = vi.hoisted(() => ({
  riseMock: vi.fn(),
  logMock: vi.fn(),
  /** 실제 3단계 읽기의 가짜 — 읽기 자체는 `real-steps.test.ts`가 고정한다 */
  readRealStepsMock: vi.fn(),
  /** 부수효과가 일어난 순서 — 'chapter_start' → 'rise' → 'reward_insert' */
  order: [] as string[],
}))

vi.mock('../real-steps', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../real-steps')>()),
  readRealSteps: (...args: unknown[]) => readRealStepsMock(...args),
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
const BADGE_ROW = { name: 'JAM!', image_url: null, rarity: null, point_reward: 0, type: 'activity', is_hidden: false, condition_json: {} }

const REAL_ALL: RealStepsProgress = { sync: true, capsuleOpened: true, lockedOpened: true }
const REAL_NONE: RealStepsProgress = { sync: false, capsuleOpened: false, lockedOpened: false }

interface QuestRow {
  step_progress: Record<string, string>
  skipped_at: string | null
  completed_at: string | null
  reward_granted_at: string | null
}

interface FakeOptions {
  /** `null`이면 퀘스트 행이 없다 */
  questRow: QuestRow | null
  /** 실제 3단계 읽기 결과. 생략하면 하나도 끝나지 않았다 */
  real?: RealStepsProgress
  /** `user_chapters`의 행. `null`이면 행 없음, `{ chapter_no: null }`은 퀘스트 전 점수만 쌓인 상태. `chapter_start` 성공 뒤에는 그 챕터로 바뀐다 */
  chapterRow?: { chapter_no: number | null } | null
  chapterReadError?: boolean
  /** `chapter_start`의 응답 */
  startResult?: { data: unknown; error: unknown }
  /** 선조회에서는 완료 전으로 보이지만 조건부 갱신이 바꾼 행이 없다(동시 호출에 졌다) */
  raceLost?: boolean
}

function makeFake(opts: FakeOptions) {
  const state = opts.questRow ? { ...opts.questRow } : null
  let chapter: { chapter_no: number | null } | null = opts.chapterRow ?? null
  readRealStepsMock.mockResolvedValue(opts.real ?? REAL_NONE)
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    order.push(name)
    expect(name).toBe('chapter_start')
    expect(args).toEqual({ p_user_id: USER_ID })
    const result = opts.startResult ?? { data: [{ score_added: 0, current_chapter: 1, reached_chapters: [1] }], error: null }
    // DB 함수처럼 성공하면 챕터가 생긴다(이후 호출은 «이미 챕터가 있음»으로 읽힌다)
    const current = (result.data as Array<{ current_chapter?: number }> | null)?.[0]?.current_chapter
    if (!result.error && typeof current === 'number') chapter = { chapter_no: current }
    return result
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
    if (table === 'user_chapters') {
      return {
        select: (columns: string) => {
          chapterReads.push(columns)
          return {
            eq: () => ({
              maybeSingle: async () => (opts.chapterReadError ? { data: null, error: { message: 'chapters read failed' } } : { data: chapter, error: null }),
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
const MID_CINEMATIC: QuestRow = { ...FRESH, step_progress: { sync: '1', bag: '1' } }
const SKIPPED: QuestRow = { step_progress: { sync: '1' }, skipped_at: '2026-10-20T00:00:00Z', completed_at: null, reward_granted_at: null }
const COMPLETED_NO_REWARD: QuestRow = { ...FRESH, completed_at: '2026-10-19T00:00:00Z' }
const COMPLETED_REWARDED: QuestRow = { ...FRESH, completed_at: '2026-10-19T00:00:00Z', reward_granted_at: '2026-10-19T00:00:01Z' }

beforeEach(() => {
  order.length = 0
  riseMock.mockReset()
  riseMock.mockResolvedValue(undefined)
  logMock.mockReset()
  logMock.mockResolvedValue(undefined)
  readRealStepsMock.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {}).mockClear()
})

describe('실제 3단계와 연출이 모두 끝났을 때', () => {
  it('챕터 1을 시작한 뒤에 보상을 지급한다 — 시작 → 오름 처리 → 배지 발급 순서', async () => {
    const { supabase, rpc, chapterReads } = makeFake({ questRow: FRESH, real: REAL_ALL })

    const result = await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(result).toBe(ONBOARDING_COMPLETION_BADGE_ID)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['chapter_start', 'rise', 'reward_insert'])
    expect(riseMock).toHaveBeenCalledWith({ userId: USER_ID, reachedChapters: [1] })
    // 챕터가 비어 있는지 한 번 읽고 시작한다(멱등 경로 `ensureChapterStarted`)
    expect(chapterReads).toEqual(['chapter_no'])
  })

  it('쌓인 점수로 한 번에 오른 챕터도 같은 오름 처리 경로를 탄다', async () => {
    const { supabase } = makeFake({
      questRow: FRESH,
      real: REAL_ALL,
      startResult: { data: [{ score_added: 0, current_chapter: 2, reached_chapters: [1, 2] }], error: null },
    })

    await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(riseMock).toHaveBeenCalledWith({ userId: USER_ID, reachedChapters: [1, 2] })
  })

  it('동시 호출에 져서 바뀐 행이 없으면 보상은 지급하지 않는다(이긴 호출이 지급한다)', async () => {
    const { supabase } = makeFake({ questRow: FRESH, real: REAL_ALL, raceLost: true })

    const result = await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(result).toBeNull()
    expect(order).not.toContain('reward_insert')
  })

  it('시작이 실패해도(RPC 오류) 완료 보상과 반환값은 그대로이고 실패를 기록한다', async () => {
    const { supabase } = makeFake({ questRow: FRESH, real: REAL_ALL, startResult: { data: null, error: { message: 'check_violation' } } })

    const result = await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(result).toBe(ONBOARDING_COMPLETION_BADGE_ID)
    expect(order).toEqual(['chapter_start', 'reward_insert'])
    expect(riseMock).not.toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledWith('points', 'chapter_start_failed', USER_ID, { error: expect.stringContaining('check_violation') })
  })
})

describe('챕터 1은 실제 3단계가 모두 끝나야 시작한다 (사용자 결정 1)', () => {
  const partial: Array<[string, RealStepsProgress]> = [
    ['아무 것도 안 함', REAL_NONE],
    ['첫 동기화만', { sync: true, capsuleOpened: false, lockedOpened: false }],
    ['첫 동기화와 캡슐 열기까지', { sync: true, capsuleOpened: true, lockedOpened: false }],
    ['첫 동기화와 잠긴 개체 열기까지', { sync: true, capsuleOpened: false, lockedOpened: true }],
    ['캡슐 열기와 잠긴 개체 열기만(동기화 기록 없음)', { sync: false, capsuleOpened: true, lockedOpened: true }],
  ]
  for (const [label, real] of partial) {
    it(`${label} — 연출을 다 마쳤어도 챕터 1도 완료도 보상도 없다`, async () => {
      const { supabase, rpc, chapterReads, state } = makeFake({ questRow: FRESH, real })

      const result = await recordOnboardingQuestCompletion(supabase, USER_ID)

      expect(result).toBeNull()
      expect(rpc).not.toHaveBeenCalled()
      expect(chapterReads).toEqual([])
      expect(riseMock).not.toHaveBeenCalled()
      expect(order).toEqual([])
      expect(state?.completed_at).toBeNull()
    })
  }

  it('건너뛴 유저도 실제 3단계가 남아 있으면 챕터 1을 받지 못한다', async () => {
    const { supabase, rpc, state } = makeFake({ questRow: SKIPPED, real: { sync: true, capsuleOpened: true, lockedOpened: false } })

    expect(await recordOnboardingQuestCompletion(supabase, USER_ID)).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
    expect(state?.completed_at).toBeNull()
  })

  it('②③ 순서가 바뀌어도 둘이 모두 되면 시작한다 — ③이 먼저, ②가 마지막', async () => {
    const { supabase, rpc } = makeFake({ questRow: FRESH })

    readRealStepsMock.mockResolvedValue({ sync: true, capsuleOpened: false, lockedOpened: true }) // 동기화로 받은 잠긴 개체를 먼저 열었다
    expect(await recordOnboardingQuestCompletion(supabase, USER_ID)).toBeNull()
    expect(rpc).not.toHaveBeenCalled()

    readRealStepsMock.mockResolvedValue(REAL_ALL) // 이어서 캡슐을 열었다
    expect(await recordOnboardingQuestCompletion(supabase, USER_ID)).toBe(ONBOARDING_COMPLETION_BADGE_ID)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('②③ 순서가 바뀌어도 둘이 모두 되면 시작한다 — ②가 먼저, ③이 마지막', async () => {
    const { supabase, rpc } = makeFake({ questRow: FRESH })

    readRealStepsMock.mockResolvedValue({ sync: true, capsuleOpened: true, lockedOpened: false })
    expect(await recordOnboardingQuestCompletion(supabase, USER_ID)).toBeNull()
    expect(rpc).not.toHaveBeenCalled()

    readRealStepsMock.mockResolvedValue(REAL_ALL)
    expect(await recordOnboardingQuestCompletion(supabase, USER_ID)).toBe(ONBOARDING_COMPLETION_BADGE_ID)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('실제 단계를 읽지 못하면 «마쳤다»로 보지 않아 시작하지 않는다 — 던지지 않고 기록만 남는다', async () => {
    const { supabase, rpc, state } = makeFake({ questRow: FRESH })
    readRealStepsMock.mockRejectedValue(new Error('실제 단계 읽기 실패 (캡슐 열기): connection reset'))

    await expect(recordOnboardingQuestCompletion(supabase, USER_ID)).resolves.toBeNull()

    expect(rpc).not.toHaveBeenCalled()
    expect(state?.completed_at).toBeNull()
    expect(console.error).toHaveBeenCalledWith('[recordOnboardingQuestCompletion] 예외:', expect.any(Error))
  })
})

describe('연출보다 실제 3단계를 먼저 마친 유저 (사용자 결정 1)', () => {
  it('연출 도중이라도 실제 3단계가 끝나면 챕터 1을 바로 받는다 — 완료와 보상은 아직이다', async () => {
    const { supabase, rpc, state } = makeFake({ questRow: MID_CINEMATIC, real: REAL_ALL })

    const result = await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(result).toBeNull()
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['chapter_start', 'rise'])
    expect(state?.completed_at).toBeNull()
    expect(state?.reward_granted_at).toBeNull()
  })

  it('연출을 끝내면 그때 완료를 기록하고 보상을 지급한다 — 챕터 1은 다시 시작하지 않는다', async () => {
    const { supabase, rpc, state } = makeFake({ questRow: MID_CINEMATIC, real: REAL_ALL })

    expect(await recordOnboardingQuestCompletion(supabase, USER_ID)).toBeNull() // 실제 3단계가 먼저 끝났다 → 챕터 1만 받는다
    expect(order).toEqual(['chapter_start', 'rise'])

    // 연출 마지막 단계(browse)를 기록한 뒤의 호출
    state!.step_progress = ALL_STEPS_DONE
    const result = await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(result).toBe(ONBOARDING_COMPLETION_BADGE_ID)
    expect(rpc).toHaveBeenCalledTimes(1) // 챕터가 이미 있어 RPC를 다시 부르지 않는다
    expect(riseMock).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['chapter_start', 'rise', 'reward_insert'])
    expect(state?.completed_at).not.toBeNull()
    expect(state?.reward_granted_at).not.toBeNull()
  })

  it('연출 중에 호출이 여러 번 와도 챕터 1 시작과 소식은 한 번이다', async () => {
    const { supabase, rpc } = makeFake({ questRow: MID_CINEMATIC, real: REAL_ALL })

    await recordOnboardingQuestCompletion(supabase, USER_ID)
    await recordOnboardingQuestCompletion(supabase, USER_ID)
    await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(riseMock).toHaveBeenCalledTimes(1)
  })

  it('연출을 먼저 마치고 실제 3단계가 마지막에 끝나는 유저는 그 호출 하나로 챕터 1·완료·보상을 받는다', async () => {
    const { supabase, state } = makeFake({ questRow: FRESH })

    readRealStepsMock.mockResolvedValue({ sync: true, capsuleOpened: true, lockedOpened: false })
    expect(await recordOnboardingQuestCompletion(supabase, USER_ID)).toBeNull()
    expect(order).toEqual([])

    readRealStepsMock.mockResolvedValue(REAL_ALL) // 잠긴 개체를 열어 마지막 단계가 끝났다
    expect(await recordOnboardingQuestCompletion(supabase, USER_ID)).toBe(ONBOARDING_COMPLETION_BADGE_ID)
    expect(order).toEqual(['chapter_start', 'rise', 'reward_insert'])
    expect(state?.completed_at).not.toBeNull()
  })
})

describe('연출을 건너뛴 유저 (사용자 결정 1)', () => {
  it('실제 3단계가 끝나면 챕터 1과 완료 기록만 받는다 — 완료 배지와 포인트는 없다', async () => {
    const { supabase, rpc, state } = makeFake({ questRow: SKIPPED, real: REAL_ALL })

    const result = await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(result).toBeNull()
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['chapter_start', 'rise'])
    expect(state?.completed_at).not.toBeNull()
    expect(state?.reward_granted_at).toBeNull()
    expect(order).not.toContain('reward_insert')
  })
})

describe('챕터 1 소식은 한 건만 나간다', () => {
  it('챕터가 생긴 뒤의 호출은 DB 함수도 오름 처리도 부르지 않는다', async () => {
    const { supabase, rpc } = makeFake({ questRow: FRESH, real: REAL_ALL })

    await recordOnboardingQuestCompletion(supabase, USER_ID) // 시작 + 완료 + 보상
    await recordOnboardingQuestCompletion(supabase, USER_ID) // 완료 있음 분기
    await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(riseMock).toHaveBeenCalledTimes(1)
  })

  it('동시 호출에 져서 이미 챕터가 있다는 응답(오른 챕터 없음)을 받으면 오름 처리를 하지 않는다', async () => {
    // 두 호출이 모두 «챕터 없음»을 읽고 들어온 경쟁 — 진 쪽의 chapter_start는 아무것도 하지 않고 reached_chapters가 비어 돌아온다
    const { supabase, rpc } = makeFake({
      questRow: MID_CINEMATIC,
      real: REAL_ALL,
      startResult: { data: [{ score_added: 0, current_chapter: 1, reached_chapters: [] }], error: null },
    })

    await recordOnboardingQuestCompletion(supabase, USER_ID)

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(riseMock).not.toHaveBeenCalled()
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
    // 완료 기록이 있는 유저는 실제 단계를 다시 읽지 않는다
    expect(readRealStepsMock).not.toHaveBeenCalled()
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

  it('실제 3단계 시작이 실패해도 완료 전 유저는 다음 호출에서 다시 시도한다', async () => {
    const { supabase, rpc } = makeFake({ questRow: MID_CINEMATIC, real: REAL_ALL })
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })

    await recordOnboardingQuestCompletion(supabase, USER_ID)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(riseMock).not.toHaveBeenCalled()

    // 두 번째 호출 — 챕터가 아직 비어 있으니 다시 시작한다(기본 응답으로 성공)
    rpc.mockImplementationOnce(async (name: string) => {
      order.push(name)
      return { data: [{ score_added: 0, current_chapter: 1, reached_chapters: [1] }], error: null }
    })
    await recordOnboardingQuestCompletion(supabase, USER_ID)
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(riseMock).toHaveBeenCalledTimes(1)
  })
})

describe('시작하지 않는 경우', () => {
  it('퀘스트 행이 없으면 아무것도 부르지 않는다', async () => {
    const { supabase, rpc, chapterReads } = makeFake({ questRow: null, real: REAL_ALL })

    expect(await recordOnboardingQuestCompletion(supabase, USER_ID)).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
    expect(chapterReads).toEqual([])
    expect(readRealStepsMock).not.toHaveBeenCalled()
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
