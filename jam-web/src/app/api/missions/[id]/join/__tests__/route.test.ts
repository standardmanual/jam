/**
 * POST /api/missions/[id]/join — 이용 정지·트라이브 제한 시험 (티켓 20261019_1311, 운영 로직 13.2절)
 *
 * 검증 대상:
 *  - 이용 정지 중이면 403 `user_suspended`이고 미션을 읽지도 참가 기록을 만들지도 않는다. 정지 여부를 읽지 못해도 참가시키지 않는다(500)
 *  - 참가할 수 있는 트라이브가 아니면 «없는 미션»과 같은 404다(존재를 알리지 않는다). 트라이브가 아직 없는 유저도 제한 미션은 404다
 *  - 대상 트라이브이거나 공통 미션(허용 목록 없음)이면 참가한다
 *  - 이미 완료한 미션은 트라이브가 달라도 409(완료)다 — 완료 이력은 트라이브와 무관하다
 *  - 트라이브 접근을 읽지 못하면 참가시키지 않는다(500, fail-closed)
 *
 * 노출 판정(`resolveMissionVisibility`·`isMissionOpenToUser`)은 실제 함수를 쓰고, 데이터를 읽는 로더만 대신한다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/api/missions/[id]/join/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { d } from '@/lib/i18n'
import type { MissionVisibilityContext } from '@/lib/missions/visibility'

const USER = 'user-1'
const TRIBE_A = 'tribe-a'
const TRIBE_B = 'tribe-b'

const state = vi.hoisted(() => ({
  authenticated: true,
  suspended: false,
  suspensionReadFails: false,
  mission: null as Record<string, unknown> | null,
  /** 로더가 돌려줄 값. null이면 던진다 */
  context: null as unknown,
  insertError: null as { code?: string } | null,
  missionReads: 0,
  inserts: [] as unknown[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        state.authenticated ? { data: { user: { id: USER } }, error: null } : { data: { user: null }, error: null },
    },
  }),
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'missions') {
        const builder: Record<string, unknown> = {}
        builder.select = () => builder
        builder.eq = () => builder
        builder.single = async () => {
          state.missionReads += 1
          return { data: state.mission, error: null }
        }
        return builder
      }
      if (table === 'user_mission_participations') {
        return {
          insert: async (row: unknown) => {
            state.inserts.push(row)
            return { error: state.insertError }
          },
        }
      }
      throw new Error(`예상하지 못한 테이블: ${table}`)
    },
  }),
}))

vi.mock('@/lib/suspension/suspension', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/suspension/suspension')>()
  return {
    ...actual,
    assertNotSuspended: async () => {
      if (state.suspensionReadFails) throw new Error('user_suspensions 조회 실패')
      if (state.suspended) throw new actual.UserSuspendedError({ reason: '시험', suspendedAt: '2026-10-19T00:00:00Z' })
    },
  }
})

vi.mock('@/lib/missions/visibility-server', () => ({
  loadMissionVisibilityContext: async () => {
    if (state.context === null) throw new Error('mission_allowed_tribes 조회 실패')
    return state.context
  },
}))

vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: vi.fn(async () => {}) }))

import { POST } from '../route'

function mission(): Record<string, unknown> {
  return {
    id: 'm1',
    title: '시험 미션',
    starts_at: '2026-01-01T00:00:00Z',
    ends_at: null,
    exposure_mode: null,
    exposure_at: null,
    gated_badge_id: null,
    gate_axis: null,
    gate_stage: null,
    visibility_rule_json: null,
  }
}

function context(options: {
  userTribeId: string | null
  allowed?: Record<string, string[]>
  completed?: string[]
}): MissionVisibilityContext {
  return {
    completedMissionIds: new Set(options.completed ?? []),
    gatedBadges: new Map(),
    ownedTierByBadgeName: new Map(),
    ownedFamilyTiers: new Map(),
    participatedMissionIds: new Set(),
    tribeAccess: {
      userTribeId: options.userTribeId,
      allowedTribeIdsByMission: new Map(Object.entries(options.allowed ?? {})),
    },
  }
}

async function join() {
  return POST(new Request('http://localhost/api/missions/m1/join', { method: 'POST' }), {
    params: Promise.resolve({ id: 'm1' }),
  })
}

beforeEach(() => {
  state.authenticated = true
  state.suspended = false
  state.suspensionReadFails = false
  state.mission = mission()
  state.context = context({ userTribeId: TRIBE_A })
  state.insertError = null
  state.missionReads = 0
  state.inserts = []
})

describe('POST /api/missions/[id]/join — 이용 정지', () => {
  it('정지 중이면 403 user_suspended이고 미션을 읽지도 참가 기록을 만들지도 않는다', async () => {
    state.suspended = true
    const res = await join()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: d.suspension.missionJoinBlocked, code: 'user_suspended' })
    expect(state.missionReads).toBe(0)
    expect(state.inserts).toHaveLength(0)
  })

  it('정지 여부를 읽지 못하면 참가시키지 않는다(500)', async () => {
    state.suspensionReadFails = true
    const res = await join()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.missions.joinProcessError })
    expect(state.inserts).toHaveLength(0)
  })

  it('로그인하지 않았으면 401이다', async () => {
    state.authenticated = false
    expect((await join()).status).toBe(401)
    expect(state.inserts).toHaveLength(0)
  })
})

describe('POST /api/missions/[id]/join — 트라이브 제한', () => {
  it('대상이 아닌 트라이브면 404(없는 미션)이고 참가 기록을 만들지 않는다', async () => {
    state.context = context({ userTribeId: TRIBE_A, allowed: { m1: [TRIBE_B] } })
    const res = await join()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: d.missions.missionNotFound })
    expect(state.inserts).toHaveLength(0)
  })

  it('트라이브가 아직 없는 유저도 제한 미션은 404다', async () => {
    state.context = context({ userTribeId: null, allowed: { m1: [TRIBE_A] } })
    const res = await join()
    expect(res.status).toBe(404)
    expect(state.inserts).toHaveLength(0)
  })

  it('대상 트라이브면 참가한다', async () => {
    state.context = context({ userTribeId: TRIBE_A, allowed: { m1: [TRIBE_A, TRIBE_B] } })
    const res = await join()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(state.inserts).toEqual([{ user_id: USER, mission_id: 'm1' }])
  })

  it('허용 목록이 없는 공통 미션이면 트라이브가 없는 유저도 참가한다', async () => {
    state.context = context({ userTribeId: null })
    const res = await join()
    expect(res.status).toBe(200)
    expect(state.inserts).toEqual([{ user_id: USER, mission_id: 'm1' }])
  })

  it('이미 완료한 미션은 트라이브가 달라도 409(완료)다', async () => {
    state.context = context({ userTribeId: TRIBE_A, allowed: { m1: [TRIBE_B] }, completed: ['m1'] })
    const res = await join()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: d.missions.joinErrorCompleted })
    expect(state.inserts).toHaveLength(0)
  })

  it('트라이브 접근을 읽지 못하면 참가시키지 않는다(500, fail-closed)', async () => {
    state.context = null
    const res = await join()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: d.missions.joinProcessError })
    expect(state.inserts).toHaveLength(0)
  })

  it('없는 미션은 404다', async () => {
    state.mission = null
    expect((await join()).status).toBe(404)
    expect(state.inserts).toHaveLength(0)
  })
})
