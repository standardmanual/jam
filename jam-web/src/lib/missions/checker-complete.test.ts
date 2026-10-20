/**
 * checkMissions 완료 처리 시험 — `mission_complete` RPC 연결 (티켓 20261019_1311, 마이그레이션 249)
 *
 * 검증 대상:
 *  - 응답이 completed이면 보상·피드·소식으로 이어지고, `completedMissions`에 미션 id와 완료 기록 id가 담긴다(기존 `completedMissionIds`도 그대로)
 *  - mission_full·tribe_not_allowed·not_participating·user_suspended·already_completed는 보상·피드·소식 없이 조용히 건너뛴다
 *  - 예상 밖 거절(mission_not_found 등), RPC 호출 오류, 계약 밖 응답은 완료시키지 않고 `console.error`를 남긴다(fail-closed)
 *  - 앱이 더는 `user_mission_completions`에 직접 INSERT하지 않고 개수도 세지 않는다(상한 검사는 DB 함수 안에서 잠금과 함께)
 *  - 한 미션이 거절돼도 다음 미션의 완료는 이어진다
 *  - `parseMissionCompleteResult`가 응답 계약을 읽는 규칙
 *  - 챕터 점수 «미션 완료»(티켓 20261019_1315 3회) — 완료되면 완료 기록 id를 원천 id로 `mission_complete`를 한 번 세고, 보상 지급 앞에서 센다.
 *    `already_completed`·거절·계약 밖 응답에서는 세지 않는다. 점수 실패와 보상 지급 실패는 서로의 몫을 바꾸지 않는다
 *
 * 위치: `__tests__/`는 vitest에서 제외돼 있어(node assert 시험 전용, `checker-logic.test.ts`) 모킹이 필요한 이 파일은 옆에 둔다.
 * 실행: cd jam-web && npx vitest run src/lib/missions/checker-complete.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NormalizedActivity } from '@/types/strava'

const USER = 'user-1'

const state = vi.hoisted(() => ({
  missions: [] as Record<string, unknown>[],
  participations: [] as { mission_id: string; joined_at: string }[],
  rpcResults: new Map<string, { data: unknown; error: unknown }>(),
  rpcCalls: [] as { fn: string; args: unknown }[],
  completionInserts: 0,
  completionCountReads: 0,
}))

const defaultReward = vi.hoisted(() => ({
  awardedBadgeIds: ['badge-1'],
  awardedBadgeNames: ['배지'],
  totalAwardedPoints: 10,
  pendingItemBadgeIds: [] as string[],
  pendingLockedBadgeIds: [] as string[],
}))
const grantMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<typeof defaultReward>>(async () => defaultReward))
const recordFeedEventMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}))
const createNotificationMock = vi.hoisted(() => vi.fn(async () => {}))
/** 챕터 점수 연결(`awardChapterScore`) — 호출 인자와 보상 지급과의 순서를 본다. 실제 RPC는 부르지 않는다 */
const awardScoreMock = vi.hoisted(() =>
  vi.fn<(supabase: unknown, input: { userId: string; kind: string; sourceId: string }) => Promise<{ ok: boolean }>>(async () => ({ ok: true })),
)
/** 점수 호출과 보상 지급이 불린 순서 */
const callOrder = vi.hoisted(() => [] as string[])

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const builder: Record<string, unknown> = {}
      for (const method of ['select', 'lte', 'or', 'eq', 'in', 'order', 'maybeSingle']) {
        builder[method] = (...args: unknown[]) => {
          // 예전 선착순 검사가 쓰던 개수 조회(head: true) — 더는 일어나면 안 된다
          if (table === 'user_mission_completions' && method === 'select' && (args[1] as { head?: boolean } | undefined)?.head) {
            state.completionCountReads += 1
          }
          return builder
        }
      }
      builder.update = () => builder
      builder.insert = () => {
        if (table === 'user_mission_completions') state.completionInserts += 1
        return builder
      }
      builder.then = (resolve: (v: unknown) => unknown) => {
        const data =
          table === 'missions' ? state.missions : table === 'user_mission_participations' ? state.participations : []
        return resolve({ data, error: null })
      }
      return builder
    },
    rpc: async (fn: string, args: { p_mission_id: string }) => {
      state.rpcCalls.push({ fn, args })
      return state.rpcResults.get(args.p_mission_id) ?? { data: null, error: { message: '응답 없음' } }
    },
  }),
}))

vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: recordFeedEventMock }))
vi.mock('@/lib/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/notifications')>()
  return { ...actual, createNotification: createNotificationMock }
})
vi.mock('@/lib/missions/rewards', () => ({ grantMissionRewards: grantMock }))
vi.mock('@/lib/chapter/score', () => ({ awardChapterScore: awardScoreMock }))
vi.mock('@/lib/strava/activity-history', () => ({
  getSignupAnchorDate: async () => null,
  getActivityHistory: async () => [],
  mergeActivityHistory: (_history: unknown, activities: unknown) => activities,
}))

import { checkMissions, parseMissionCompleteResult } from '@/lib/missions/checker'

function distanceMission(id: string): Record<string, unknown> {
  return {
    id,
    title: `미션 ${id}`,
    mission_type: 'distance',
    condition_json: { distance_km: 5 },
    max_completions: null,
    reward_badge_ids: [],
    starts_at: '2026-01-01T00:00:00Z',
    ends_at: null,
  }
}

const ACTIVITY = {
  stravaId: 1,
  name: 'Test',
  distanceKm: 10,
  movingTimeSec: 3600,
  elevationGainM: 100,
  jamActivityType: 'running',
  startDate: '2026-07-20T05:30:00Z',
  startDateLocal: '2026-07-20T05:30:00',
  averageSpeedKmh: 10,
  startLatLng: null,
} as unknown as NormalizedActivity

function setMissions(ids: string[]) {
  state.missions = ids.map(distanceMission)
  state.participations = ids.map((id) => ({ mission_id: id, joined_at: '2026-01-01T00:00:00Z' }))
}

function rpcReturns(missionId: string, data: unknown) {
  state.rpcResults.set(missionId, { data, error: null })
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  state.missions = []
  state.participations = []
  state.rpcResults = new Map()
  state.rpcCalls = []
  state.completionInserts = 0
  state.completionCountReads = 0
  callOrder.length = 0
  grantMock.mockReset()
  grantMock.mockImplementation(async () => {
    callOrder.push('grantMissionRewards')
    return defaultReward
  })
  awardScoreMock.mockReset()
  awardScoreMock.mockImplementation(async () => {
    callOrder.push('awardChapterScore')
    return { ok: true }
  })
  recordFeedEventMock.mockClear()
  createNotificationMock.mockClear()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

function expectNotCompleted(result: Awaited<ReturnType<typeof checkMissions>>) {
  expect(result.completedMissionIds).toEqual([])
  expect(result.completedMissions).toEqual([])
  expect(result.awardedBadgeIds).toEqual([])
  expect(grantMock).not.toHaveBeenCalled()
  expect(recordFeedEventMock).not.toHaveBeenCalled()
  expect(createNotificationMock).not.toHaveBeenCalled()
  // 완료되지 않았으니 챕터 점수도 세지 않는다(already_completed·거절·계약 밖 응답 모두)
  expect(awardScoreMock).not.toHaveBeenCalled()
}

describe('checkMissions — mission_complete 연결', () => {
  it('completed이면 보상·피드·소식으로 이어지고 완료 기록 id를 돌려준다', async () => {
    setMissions(['m1'])
    rpcReturns('m1', { ok: true, status: 'completed', completion_id: 'c1' })

    const result = await checkMissions(USER, [ACTIVITY])

    expect(state.rpcCalls).toEqual([{ fn: 'mission_complete', args: { p_user_id: USER, p_mission_id: 'm1' } }])
    expect(result.completedMissionIds).toEqual(['m1'])
    expect(result.completedMissions).toEqual([{ missionId: 'm1', completionId: 'c1' }])
    expect(result.awardedBadgeIds).toEqual(['badge-1'])
    expect(grantMock).toHaveBeenCalledTimes(1)
    expect(recordFeedEventMock).toHaveBeenCalledTimes(1)
    expect(createNotificationMock).toHaveBeenCalledTimes(1)
  })

  it('앱이 user_mission_completions에 직접 INSERT하거나 개수를 세지 않는다', async () => {
    setMissions(['m1'])
    rpcReturns('m1', { ok: true, status: 'completed', completion_id: 'c1' })
    await checkMissions(USER, [ACTIVITY])
    expect(state.completionInserts).toBe(0)
    expect(state.completionCountReads).toBe(0)
  })

  it.each(['mission_full', 'tribe_not_allowed', 'not_participating', 'user_suspended'])(
    '%s 거절은 완료시키지 않고 조용히 건너뛴다',
    async (reason) => {
      setMissions(['m1'])
      rpcReturns('m1', { ok: false, error: reason })
      expectNotCompleted(await checkMissions(USER, [ACTIVITY]))
      expect(errorSpy).not.toHaveBeenCalled()
    },
  )

  it('already_completed는 보상·피드를 다시 하지 않고 조용히 건너뛴다', async () => {
    setMissions(['m1'])
    rpcReturns('m1', { ok: true, status: 'already_completed' })
    expectNotCompleted(await checkMissions(USER, [ACTIVITY]))
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it.each(['mission_not_found', '모르는_오류'])('예상 밖 거절(%s)은 완료시키지 않고 오류를 남긴다', async (reason) => {
    setMissions(['m1'])
    rpcReturns('m1', { ok: false, error: reason })
    expectNotCompleted(await checkMissions(USER, [ACTIVITY]))
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('RPC 호출 자체가 실패하면 완료시키지 않고 오류를 남긴다(상한 검사를 건너뛰지 않는다)', async () => {
    setMissions(['m1'])
    state.rpcResults.set('m1', { data: null, error: { message: 'connection reset' } })
    expectNotCompleted(await checkMissions(USER, [ACTIVITY]))
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['null', null],
    ['문자열', 'ok'],
    ['배열', []],
    ['status 없음', { ok: true }],
    ['completion_id 없음', { ok: true, status: 'completed' }],
    ['completion_id 빈 문자열', { ok: true, status: 'completed', completion_id: '' }],
    ['모르는 status', { ok: true, status: 'pending' }],
    ['ok 없음', { status: 'completed', completion_id: 'c1' }],
    ['error 없는 거절', { ok: false }],
  ])('계약 밖 응답(%s)은 완료시키지 않고 오류를 남긴다', async (_name, raw) => {
    setMissions(['m1'])
    rpcReturns('m1', raw)
    expectNotCompleted(await checkMissions(USER, [ACTIVITY]))
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('한 미션이 거절돼도 다음 미션의 완료는 이어진다', async () => {
    setMissions(['m1', 'm2'])
    rpcReturns('m1', { ok: false, error: 'mission_full' })
    rpcReturns('m2', { ok: true, status: 'completed', completion_id: 'c2' })

    const result = await checkMissions(USER, [ACTIVITY])

    expect(result.completedMissionIds).toEqual(['m2'])
    expect(result.completedMissions).toEqual([{ missionId: 'm2', completionId: 'c2' }])
    expect(grantMock).toHaveBeenCalledTimes(1)
  })

  it('조건을 채우지 못한 미션은 RPC를 부르지 않는다', async () => {
    setMissions(['m1'])
    rpcReturns('m1', { ok: true, status: 'completed', completion_id: 'c1' })
    const short = { ...ACTIVITY, distanceKm: 1 } as unknown as NormalizedActivity
    const result = await checkMissions(USER, [short])
    expect(state.rpcCalls).toHaveLength(0)
    expect(result.completedMissions).toEqual([])
  })

  it('활성 미션이 없으면 빈 결과다', async () => {
    const result = await checkMissions(USER, [ACTIVITY])
    expect(result).toEqual({ completedMissionIds: [], completedMissions: [], awardedBadgeIds: [], pendingItemBadgeIds: [] })
  })
})

describe('checkMissions — 챕터 점수 «미션 완료» (티켓 20261019_1315 3회)', () => {
  it('완료되면 완료 기록 id를 원천 id로 mission_complete를 1회 센다 — 날짜는 넘기지 않는다', async () => {
    setMissions(['m1'])
    rpcReturns('m1', { ok: true, status: 'completed', completion_id: 'c1' })

    await checkMissions(USER, [ACTIVITY])

    expect(awardScoreMock).toHaveBeenCalledTimes(1)
    const [, input] = awardScoreMock.mock.calls[0]
    expect(input).toEqual({ userId: USER, kind: 'mission_complete', sourceId: 'c1' })
    expect(input).not.toHaveProperty('occurredOn')
    expect(input).not.toHaveProperty('amount')
  })

  it('점수는 보상 지급 앞에서 센다 — 보상 지급이 던져 건너뛰어도 점수는 이미 셌다', async () => {
    setMissions(['m1'])
    rpcReturns('m1', { ok: true, status: 'completed', completion_id: 'c1' })

    await checkMissions(USER, [ACTIVITY])
    expect(callOrder).toEqual(['awardChapterScore', 'grantMissionRewards'])

    callOrder.length = 0
    awardScoreMock.mockClear()
    grantMock.mockRejectedValueOnce(new Error('지급 실패'))
    await checkMissions(USER, [ACTIVITY])
    expect(awardScoreMock).toHaveBeenCalledTimes(1)
  })

  it('미션마다 자기 완료 기록 id로 센다 — 서로 다른 키다', async () => {
    setMissions(['m1', 'm2'])
    rpcReturns('m1', { ok: true, status: 'completed', completion_id: 'c1' })
    rpcReturns('m2', { ok: true, status: 'completed', completion_id: 'c2' })

    await checkMissions(USER, [ACTIVITY])

    const sources = awardScoreMock.mock.calls.map(([, input]) => input.sourceId)
    expect(sources).toEqual(['c1', 'c2'])
  })

  it('같은 미션의 완료를 다시 판정하면 already_completed라 다시 세지 않는다', async () => {
    setMissions(['m1'])
    rpcReturns('m1', { ok: true, status: 'completed', completion_id: 'c1' })
    await checkMissions(USER, [ACTIVITY])
    expect(awardScoreMock).toHaveBeenCalledTimes(1)

    rpcReturns('m1', { ok: true, status: 'already_completed' })
    await checkMissions(USER, [ACTIVITY])
    expect(awardScoreMock).toHaveBeenCalledTimes(1)
  })

  it('점수가 실패해도 완료 기록·보상 지급·피드·소식은 그대로다', async () => {
    setMissions(['m1'])
    rpcReturns('m1', { ok: true, status: 'completed', completion_id: 'c1' })
    awardScoreMock.mockImplementation(async () => {
      callOrder.push('awardChapterScore')
      return { ok: false }
    })

    const result = await checkMissions(USER, [ACTIVITY])

    expect(result.completedMissionIds).toEqual(['m1'])
    expect(result.completedMissions).toEqual([{ missionId: 'm1', completionId: 'c1' }])
    expect(result.awardedBadgeIds).toEqual(['badge-1'])
    expect(grantMock).toHaveBeenCalledTimes(1)
    expect(recordFeedEventMock).toHaveBeenCalledTimes(1)
    expect(createNotificationMock).toHaveBeenCalledTimes(1)
  })
})

describe('checkMissions — 받지 않은 아이템 배지 보상 (티켓 20261019_1313)', () => {
  it('받지 않은 보상 배지 id를 결과에 싣고, 피드에는 잠긴 배지를 뺀 id만 싣는다', async () => {
    setMissions(['m1'])
    rpcReturns('m1', { ok: true, status: 'completed', completion_id: 'c1' })
    grantMock.mockResolvedValueOnce({
      awardedBadgeIds: [],
      awardedBadgeNames: [],
      totalAwardedPoints: 0,
      pendingItemBadgeIds: ['item-open', 'item-locked'],
      pendingLockedBadgeIds: ['item-locked'],
    })

    const result = await checkMissions(USER, [ACTIVITY])

    expect(result.pendingItemBadgeIds).toEqual(['item-open', 'item-locked'])
    expect(result.awardedBadgeIds).toEqual([])
    expect(recordFeedEventMock).toHaveBeenCalledWith(
      USER,
      'mission_completed',
      expect.objectContaining({ mission_id: 'm1', pending_item_badge_ids: ['item-open'] }),
    )
  })

  it('받지 않은 보상이 없으면 피드에 pending_item_badge_ids 필드를 만들지 않는다', async () => {
    setMissions(['m1'])
    rpcReturns('m1', { ok: true, status: 'completed', completion_id: 'c1' })

    const result = await checkMissions(USER, [ACTIVITY])

    expect(result.pendingItemBadgeIds).toEqual([])
    const meta = recordFeedEventMock.mock.calls[0][2] as Record<string, unknown>
    expect(meta).not.toHaveProperty('pending_item_badge_ids')
  })

  it('잠긴 보상만 받지 않은 상태면 피드에 id를 싣지 않는다', async () => {
    setMissions(['m1'])
    rpcReturns('m1', { ok: true, status: 'completed', completion_id: 'c1' })
    grantMock.mockResolvedValueOnce({
      awardedBadgeIds: [],
      awardedBadgeNames: [],
      totalAwardedPoints: 0,
      pendingItemBadgeIds: ['item-locked'],
      pendingLockedBadgeIds: ['item-locked'],
    })

    await checkMissions(USER, [ACTIVITY])

    const meta = recordFeedEventMock.mock.calls[0][2] as Record<string, unknown>
    expect(meta).not.toHaveProperty('pending_item_badge_ids')
  })

  it('보상 지급이 던지면 오류를 남기고 다음 미션을 이어 판정한다(완료 기록은 이미 남았다)', async () => {
    setMissions(['m1', 'm2'])
    rpcReturns('m1', { ok: true, status: 'completed', completion_id: 'c1' })
    rpcReturns('m2', { ok: true, status: 'completed', completion_id: 'c2' })
    grantMock.mockRejectedValueOnce(new Error('지급 실패'))

    const result = await checkMissions(USER, [ACTIVITY])

    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(result.completedMissionIds).toEqual(['m1', 'm2'])
    expect(grantMock).toHaveBeenCalledTimes(2)
    // 지급이 실패한 m1은 피드에 «보상을 받았다»고 쓰지 않는다. m2만 기록한다.
    expect(recordFeedEventMock).toHaveBeenCalledTimes(1)
    expect(recordFeedEventMock).toHaveBeenCalledWith(USER, 'mission_completed', expect.objectContaining({ mission_id: 'm2' }))
  })
})

describe('parseMissionCompleteResult', () => {
  it('completed·already_completed·rejected·invalid를 계약대로 가른다', () => {
    expect(parseMissionCompleteResult({ ok: true, status: 'completed', completion_id: 'c1' })).toEqual({
      kind: 'completed',
      completionId: 'c1',
    })
    expect(parseMissionCompleteResult({ ok: true, status: 'already_completed' })).toEqual({ kind: 'already_completed' })
    expect(parseMissionCompleteResult({ ok: false, error: 'mission_full' })).toEqual({ kind: 'rejected', reason: 'mission_full' })
    expect(parseMissionCompleteResult(undefined)).toEqual({ kind: 'invalid' })
    expect(parseMissionCompleteResult({ ok: 'true', status: 'completed', completion_id: 'c1' })).toEqual({ kind: 'invalid' })
  })
})
