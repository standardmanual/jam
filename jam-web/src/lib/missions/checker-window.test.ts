/**
 * checkMissions 기간 경계 연결 시험 (티켓 20261019_1312)
 *
 * `window.test.ts`는 활동 선택 함수만 본다. 이 파일은 `checkMissions`가 그 함수를 실제로 거쳐 판정하는지,
 * 곧 «시작 전에 참가한 미션이 시작 전 활동을 반영하지 않고, 종료 뒤 활동도 반영하지 않으며, 기간 안 활동은 반영한다»
 * 를 한 번에 고정한다. 시간대 조건(`time_range`)을 가진 복합 조건 미션이 판정되는 것도 함께 본다.
 *
 * 위치: `__tests__/`는 vitest에서 제외돼 있어(node assert 시험 전용) 모킹이 필요한 이 파일은 옆에 둔다
 * (`checker-complete.test.ts`와 같은 이유와 같은 모킹).
 * 실행: cd jam-web && npx vitest run src/lib/missions/checker-window.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NormalizedActivity } from '@/types/strava'

const USER = 'user-1'

const state = vi.hoisted(() => ({
  missions: [] as Record<string, unknown>[],
  participations: [] as { mission_id: string; joined_at: string }[],
  rpcCalls: [] as { fn: string; args: unknown }[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const builder: Record<string, unknown> = {}
      for (const method of ['select', 'lte', 'or', 'eq', 'in', 'order', 'maybeSingle', 'update', 'insert']) {
        builder[method] = () => builder
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
      return { data: { ok: true, status: 'completed', completion_id: `c-${args.p_mission_id}` }, error: null }
    },
  }),
}))

vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/notifications')>()
  return { ...actual, createNotification: vi.fn(async () => {}) }
})
vi.mock('@/lib/missions/rewards', () => ({
  grantMissionRewards: vi.fn(async () => ({ awardedBadgeIds: [], awardedBadgeNames: [], totalAwardedPoints: 0, pendingItemBadgeIds: [], pendingLockedBadgeIds: [] })),
}))
// 서비스 활동 잼 «미션 완료»(티켓 20261028_1735 3회)는 `checker-complete.test.ts`가 고정한다 — 이 시험은 `rpc` 호출 목록·완료 판정을 보므로 잼 지급 RPC를 섞지 않는다
vi.mock('@/lib/jam/serviceActivity', () => ({ awardServiceJam: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/lib/strava/activity-history', () => ({
  getSignupAnchorDate: async () => null,
  getActivityHistory: async () => [],
  mergeActivityHistory: (_history: unknown, activities: unknown) => activities,
}))

import { checkMissions } from '@/lib/missions/checker'

function activity(startDate: string): NormalizedActivity {
  return {
    stravaId: 1,
    name: 'Test',
    distanceKm: 10,
    movingTimeSec: 3600,
    elevationGainM: 100,
    jamActivityType: 'running',
    startDate,
    startDateLocal: startDate.replace('Z', ''),
    averageSpeedKmh: 10,
    startLatLng: null,
  } as unknown as NormalizedActivity
}

function setMission(mission: Record<string, unknown>, joinedAt: string) {
  state.missions = [
    { id: 'm1', title: '미션', max_completions: null, reward_badge_ids: [], status_display_type: 'achievement', ...mission },
  ]
  state.participations = [{ mission_id: 'm1', joined_at: joinedAt }]
}

const distanceMission = (startsAt: string, endsAt: string | null) => ({
  mission_type: 'distance',
  condition_json: { distance_km: 5 },
  starts_at: startsAt,
  ends_at: endsAt,
})

beforeEach(() => {
  state.missions = []
  state.participations = []
  state.rpcCalls = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('checkMissions — 미션 기간 경계', () => {
  it('시작 전에 참가한 미션은 시작 전 활동을 반영하지 않는다', async () => {
    // 10/10 시작인 미션에 10/05에 참가했고, 활동은 10/08(시작 전) 10km뿐이다
    setMission(distanceMission('2026-10-10T00:00:00Z', null), '2026-10-05T00:00:00+00:00')
    const result = await checkMissions(USER, [activity('2026-10-08T12:00:00Z')])
    expect(result.completedMissionIds).toEqual([])
    expect(state.rpcCalls).toEqual([])
  })

  it('같은 미션도 시작한 뒤의 활동은 반영한다', async () => {
    setMission(distanceMission('2026-10-10T00:00:00Z', null), '2026-10-05T00:00:00+00:00')
    const result = await checkMissions(USER, [activity('2026-10-08T12:00:00Z'), activity('2026-10-12T12:00:00Z')])
    expect(result.completedMissionIds).toEqual(['m1'])
    expect(state.rpcCalls).toHaveLength(1)
  })

  it('종료 뒤의 활동은 반영하지 않는다', async () => {
    setMission(distanceMission('2026-10-01T00:00:00Z', '2026-10-10T00:00:00Z'), '2026-10-01T00:00:00Z')
    const result = await checkMissions(USER, [activity('2026-10-12T12:00:00Z')])
    expect(result.completedMissionIds).toEqual([])
    expect(state.rpcCalls).toEqual([])
  })

  it('참가 전 활동은 시작 뒤여도 반영하지 않는다', async () => {
    setMission(distanceMission('2026-10-01T00:00:00Z', null), '2026-10-14T00:00:00Z')
    const result = await checkMissions(USER, [activity('2026-10-12T12:00:00Z')])
    expect(result.completedMissionIds).toEqual([])
  })

  it('복합 조건 미션: 시간대 조건(time_range)이 기간 안 활동으로 판정된다', async () => {
    const engineMission = (startsAt: string) => ({
      mission_type: 'engine_condition',
      condition_json: { activity_type: 'running', time_range: { start: '05:00', end: '08:00' } },
      starts_at: startsAt,
      ends_at: null,
    })
    // 활동은 한국 시각 오전 6시(= 전날 21:00Z)
    const morning = activity('2026-10-11T21:00:00Z')
    const noon = activity('2026-10-12T03:00:00Z') // 한국 시각 12시
    setMission(engineMission('2026-10-01T00:00:00Z'), '2026-10-01T00:00:00Z')
    expect((await checkMissions(USER, [noon])).completedMissionIds).toEqual([])
    expect((await checkMissions(USER, [noon, morning])).completedMissionIds).toEqual(['m1'])

    // 새벽 활동이 시작 전이면 시간대가 맞아도 반영하지 않는다
    state.rpcCalls = []
    setMission(engineMission('2026-10-20T00:00:00Z'), '2026-10-01T00:00:00Z')
    expect((await checkMissions(USER, [morning])).completedMissionIds).toEqual([])
  })
})
