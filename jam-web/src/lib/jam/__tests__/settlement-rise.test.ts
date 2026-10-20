/**
 * lib/jam/settlement — 잼 정산에서 난 챕터 오름의 처리 (티켓 20261019_1316)
 *
 * 고정하는 것:
 * - 정산은 동기화 끝 판정(`JAM_SYNC_TRIGGERS`의 `chapter_reached`)이 이어서 읽는 호출이라, 모은 잼 점수로 챕터가 올라도 오름 처리에 챕터 배지 판정을
 *   건너뛰라고 알린다(`skipBadgeEvaluation`). 소식은 오름 처리가 그대로 보낸다 — 이 시험은 오름 처리가 불리는 모양만 본다.
 * - 오름이 없으면 오름 처리를 부르지 않는다. 오름 처리가 던져도 정산 항목·합계는 그대로다.
 * 공용 DB와 실제 오름 처리(소식·판정)는 부르지 않는다 — 가짜 클라이언트와 가짜 오름 처리만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/jam/__tests__/settlement-rise.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { riseMock, logMock } = vi.hoisted(() => ({ riseMock: vi.fn(), logMock: vi.fn() }))

vi.mock('@/lib/chapter/rise', () => ({ processChapterRise: (...args: unknown[]) => riseMock(...args) }))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: (...args: unknown[]) => logMock(...args) }))

import { DEFAULT_JAM_POLICY } from '../policy'
import { settleActivities } from '../settlement'

const MIN = 60
const NOW = new Date('2026-10-17T03:00:00Z')

/** 활동 id 조회와 `jam_apply`, `chapter_add_score`만 받는 가짜. `reached`가 점수 RPC의 오른 챕터 목록이다 */
function makeClient(reached: number[]): SupabaseClient {
  return {
    from: () => ({
      select: () => {
        const chain = {
          eq: () => chain,
          in: async (_col: string, ids: number[]) => ({ data: ids.map((id) => ({ id: `act-${id}`, strava_id: id })), error: null }),
        }
        return chain
      },
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'chapter_add_score') {
        return { data: [{ score_added: args.p_amount as number, current_chapter: reached.length > 0 ? Math.max(...reached) : 2, reached_chapters: reached }], error: null }
      }
      return { data: { amount: args.p_amount, source_activity_id: args.p_source_activity_id }, error: null }
    },
  } as unknown as SupabaseClient
}

const RUN = { stravaId: 1, startDate: '2026-09-12T00:00:00Z', movingTimeSec: 30 * MIN, jamActivityType: 'running' as const, sportType: 'Run', type: 'Run' }

beforeEach(() => {
  riseMock.mockReset()
  riseMock.mockResolvedValue(undefined)
  logMock.mockReset()
  logMock.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('settleActivities — 챕터 오름 처리 (티켓 20261019_1316)', () => {
  it('모은 잼 점수로 챕터가 오르면 오름 처리를 부르되 챕터 배지 판정은 건너뛰라고 알린다', async () => {
    const result = await settleActivities(makeClient([2, 3]), 'user-1', [RUN], DEFAULT_JAM_POLICY, NOW)

    expect(riseMock).toHaveBeenCalledTimes(1)
    expect(riseMock).toHaveBeenCalledWith({ userId: 'user-1', reachedChapters: [2, 3] }, { skipBadgeEvaluation: true })
    expect(result.total).toBe(90)
  })

  it('오른 챕터가 없으면 오름 처리를 부르지 않는다', async () => {
    await settleActivities(makeClient([]), 'user-1', [RUN], DEFAULT_JAM_POLICY, NOW)

    expect(riseMock).not.toHaveBeenCalled()
  })

  it('오름 처리가 던져도 정산 항목과 합계는 그대로다', async () => {
    riseMock.mockRejectedValue(new Error('오름 처리 장애'))

    const result = await settleActivities(makeClient([2]), 'user-1', [RUN], DEFAULT_JAM_POLICY, NOW)

    expect(result.total).toBe(90)
    expect(result.items).toEqual([{ stravaId: 1, activityId: 'act-1', amount: 90, earnedOn: '2026-09-12' }])
  })
})
