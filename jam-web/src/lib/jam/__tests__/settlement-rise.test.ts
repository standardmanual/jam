/**
 * lib/jam/settlement — 잼 정산은 챕터 오름을 만들지 않는다 (티켓 20261019_1316 → 20261028_1733 3회에서 바뀜)
 *
 * 고정하는 것:
 * - 정산은 챕터 점수를 부르지 않으므로 챕터가 오르지 않고, 오름 처리(`processChapterRise`)도 부르지 않는다. 점수 RPC가 올림 응답을 돌려주는 가짜여도 마찬가지다.
 *   챕터 오름은 캡슐 열기(`lib/capsule/open.ts`의 `counted` 열기)가 만든다 — 그쪽 시험은 `lib/capsule/__tests__`.
 * - 정산 항목·합계는 그대로다.
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

describe('settleActivities — 챕터 오름 처리를 부르지 않는다 (티켓 20261028_1733 3회)', () => {
  it('점수 RPC가 오름을 돌려줄 수 있는 클라이언트여도 오름 처리를 부르지 않고 점수 RPC도 부르지 않는다', async () => {
    const client = makeClient([2, 3])
    const rpcSpy = vi.spyOn(client, 'rpc')

    const result = await settleActivities(client, 'user-1', [RUN], DEFAULT_JAM_POLICY, NOW)

    expect(riseMock).not.toHaveBeenCalled()
    expect(rpcSpy.mock.calls.map(([name]) => name)).toEqual(['jam_apply'])
    expect(result.total).toBe(90)
    expect(result.items).toEqual([{ stravaId: 1, activityId: 'act-1', amount: 90, earnedOn: '2026-09-12' }])
  })
})
