/**
 * strava/activity-history — 걸러진 활동은 이력 조회에서 빠지고, «이미 처리한 id» 조회에는 포함된다
 * (티켓 20261017_1421)
 *
 * 이력을 읽는 곳(배지 엔진·미션·계열 진행·랭킹·배지 트리·조건 시뮬레이션)은 모두
 * `getActivityHistory` 한 함수로 읽는다 — 그래서 이 함수가 걸러진 행을 반환하지 않으면 모든 곳에서 빠진다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/activity-history.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// sync.ts가 끌어오는 무거운 모듈은 이 시험과 무관하다 — getProcessedStravaIds만 쓴다
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/badge-engine/index', () => ({ evaluateBadges: vi.fn() }))
vi.mock('@/lib/drop-engine/syncIssueRun', () => ({ issueSyncItemBadges: vi.fn(async () => []) }))
vi.mock('@/lib/poi/matcher', () => ({ matchPoisForActivity: vi.fn() }))
vi.mock('@/lib/itembook/checker', () => ({ checkItemBookCompletion: vi.fn() }))
vi.mock('@/lib/itembook/completable', () => ({ findCompletableItemBooks: vi.fn() }))
vi.mock('@/lib/missions/checker', () => ({ checkMissions: vi.fn() }))
vi.mock('@/lib/strava/api', () => ({ getAllActivities: vi.fn(), getActivityStreams: vi.fn(), refreshStravaToken: vi.fn() }))

import { getActivityHistory } from '../activity-history'
import { getProcessedStravaIds } from '../sync'

interface Row {
  user_id: string
  strava_id: number
  start_date: string
  filter_reason?: string | null
  normalized: { stravaId: number }
}

/** `.is('filter_reason', null)`이 실제로 행을 거르는 최소 스텁 */
function makeFakeSupabase(rows: Row[], calls: { is: [string, unknown][] }): SupabaseClient {
  const from = () => {
    const eqs: [string, unknown][] = []
    const iss: [string, unknown][] = []
    let inFilter: [string, number[]] | null = null
    let since: string | null = null
    const run = () => {
      const data = rows
        .filter(
          (r) =>
            eqs.every(([c, v]) => (r as unknown as Record<string, unknown>)[c] === v) &&
            iss.every(([c, v]) => ((r as unknown as Record<string, unknown>)[c] ?? null) === v) &&
            (!inFilter || inFilter[1].includes(r.strava_id)) &&
            (!since || r.start_date >= since)
        )
        .sort((a, b) => a.start_date.localeCompare(b.start_date))
      return { data, error: null }
    }
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (c: string, v: unknown) => {
        eqs.push([c, v])
        return builder
      },
      is: (c: string, v: unknown) => {
        calls.is.push([c, v])
        iss.push([c, v])
        return builder
      },
      in: (c: string, v: number[]) => {
        inFilter = [c, v]
        return builder
      },
      gte: (_c: string, v: string) => {
        since = v
        return builder
      },
      order: () => Promise.resolve(run()),
      then: (resolve: (v: unknown) => void) => Promise.resolve(run()).then(resolve),
    }
    return builder
  }
  return { from } as unknown as SupabaseClient
}

const row = (id: number, filterReason: string | null): Row => ({
  user_id: 'u1',
  strava_id: id,
  start_date: `2026-09-0${id}T00:00:00Z`,
  filter_reason: filterReason,
  normalized: { stravaId: id },
})

describe('getActivityHistory — 걸러진 활동은 읽지 않는다', () => {
  it('filter_reason이 있는 행(가상·수동·차량 속도 등)은 반환하지 않는다', async () => {
    const calls = { is: [] as [string, unknown][] }
    const supabase = makeFakeSupabase(
      [row(1, null), row(2, 'manual_entry'), row(3, 'vehicle_speed'), row(4, null)],
      calls
    )

    const history = await getActivityHistory(supabase, 'u1')

    expect(history.map((a) => a.stravaId)).toEqual([1, 4])
    expect(calls.is).toEqual([['filter_reason', null]])
  })

  it('칸이 없는 옛 행(undefined)은 인정으로 읽힌다 — 옛 행의 뜻을 바꾸지 않는다', async () => {
    const legacy = row(1, null)
    delete legacy.filter_reason
    const supabase = makeFakeSupabase([legacy], { is: [] })

    expect((await getActivityHistory(supabase, 'u1')).map((a) => a.stravaId)).toEqual([1])
  })
})

describe('getProcessedStravaIds — 걸러진 행도 처리한 것으로 포함한다', () => {
  it('걸러진 활동도 이미 처리한 id로 돌려줘 같은 활동을 다시 거르거나 정산하지 않는다', async () => {
    const calls = { is: [] as [string, unknown][] }
    const supabase = makeFakeSupabase([row(1, null), row(2, 'manual_entry'), row(3, 'vehicle_speed')], calls)

    const processed = await getProcessedStravaIds(supabase, 'u1', [1, 2, 3, 4])

    expect([...processed].sort()).toEqual([1, 2, 3])
    // 걸러짐 조건을 걸지 않는다
    expect(calls.is).toEqual([])
  })
})
