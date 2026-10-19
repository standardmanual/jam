/**
 * GET /api/missions/[id]/status — 트라이브 제한·이용 정지 순위 제외 시험 (티켓 20261019_1311, 운영 로직 13.2절)
 *
 * 검증 대상:
 *  - 참가할 수 있는 트라이브가 아닌 미션은 404(없는 미션)다. 이미 완료한 미션은 트라이브가 달라도 본다. 접근을 읽지 못하면 500이다
 *  - 이용 정지 중인 참가자는 다른 유저가 보는 순위·달성자 목록과 `totalParticipants`에서 빠진다
 *  - 정지 중인 본인에게는 본인이 계속 보이고(`me`·`entries`), 정지가 풀리면 다시 보인다
 *  - 정지 여부를 읽지 못하면 목록을 내리지 않는다(500)
 *  - 개인형은 다른 참가자를 읽지 않으므로 정지 조회를 하지 않는다
 *
 * 실행: cd jam-web && npx vitest run "src/app/api/missions/[id]/status/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { d } from '@/lib/i18n'
import type { MissionTribeAccess } from '@/lib/missions/tribe-access'

const ME = 'user-me'
const OTHER = 'user-other'
const THIRD = 'user-third'

const state = vi.hoisted(() => ({
  displayType: 'ranking' as 'ranking' | 'achievement' | 'individual',
  mine: true,
  /** 참가자 (user_mission_participations 전체) */
  participations: [] as { user_id: string; progress_value: number }[],
  /** 완료자 */
  completions: [] as { user_id: string; completed_at: string }[],
  /** 로더가 돌려줄 트라이브 접근. null이면 던진다 */
  tribeAccess: null as unknown,
  suspended: new Set<string>(),
  suspensionReadFails: false,
  suspensionLookups: 0,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: ME } }, error: null }) } }),
  createServiceClient: () => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = {}
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = (col: string, val: unknown) => {
        filters[col] = val
        return builder
      }
      builder.in = () => builder
      builder.maybeSingle = async () => {
        if (table === 'missions') {
          return { data: { id: 'm1', status_display_type: state.displayType, visible_rank_count: null }, error: null }
        }
        if (table === 'user_mission_participations') {
          const row = state.participations.find((p) => p.user_id === filters.user_id)
          return { data: state.mine ? (row ?? { user_id: ME, progress_value: 0 }) : null, error: null }
        }
        if (table === 'user_mission_completions') {
          const row = state.completions.find((c) => c.user_id === filters.user_id)
          return { data: row ?? null, error: null }
        }
        return { data: null, error: null }
      }
      builder.then = (resolve: (v: unknown) => unknown) => {
        if (table === 'user_mission_participations') return resolve({ data: state.participations, error: null })
        if (table === 'user_mission_completions') return resolve({ data: state.completions, error: null })
        if (table === 'users') {
          const all = [ME, OTHER, THIRD].map((id) => ({ id, username: id, display_name: `이름-${id}`, avatar_url: null }))
          return resolve({ data: all, error: null })
        }
        return resolve({ data: [], error: null })
      }
      return builder
    },
  }),
}))

vi.mock('@/lib/missions/visibility-server', () => ({
  loadMissionTribeAccess: async () => {
    if (state.tribeAccess === null) throw new Error('mission_allowed_tribes 조회 실패')
    return state.tribeAccess
  },
}))

vi.mock('@/lib/suspension/suspension', () => ({
  getSuspendedUserIds: async () => {
    state.suspensionLookups += 1
    if (state.suspensionReadFails) throw new Error('user_suspensions 목록 조회 실패')
    return state.suspended
  },
}))

vi.mock('@/lib/env/test-accounts', () => ({ excludedTestUserIds: () => [] as string[] }))

import { GET } from '../route'

function access(userTribeId: string | null, allowed: Record<string, string[]> = {}): MissionTribeAccess {
  return { userTribeId, allowedTribeIdsByMission: new Map(Object.entries(allowed)) }
}

/** 시험이 읽는 응답 모양만 적는다 */
interface StatusBody {
  type: string
  error?: string
  entries: { userId: string; rank: number }[]
  me: { userId: string } | null
  totalParticipants: number
}

async function getStatus() {
  const res = await GET(new Request('http://localhost/api/missions/m1/status'), { params: Promise.resolve({ id: 'm1' }) })
  return { status: res.status, body: (await res.json()) as StatusBody }
}

const ids = (entries: { userId: string }[]) => entries.map((e) => e.userId)

beforeEach(() => {
  state.displayType = 'ranking'
  state.mine = true
  state.participations = [
    { user_id: ME, progress_value: 10 },
    { user_id: OTHER, progress_value: 90 },
    { user_id: THIRD, progress_value: 50 },
  ]
  state.completions = []
  state.tribeAccess = access('tribe-a')
  state.suspended = new Set()
  state.suspensionReadFails = false
  state.suspensionLookups = 0
})

describe('GET /api/missions/[id]/status — 트라이브 제한', () => {
  it('대상이 아닌 트라이브면 404다', async () => {
    state.tribeAccess = access('tribe-a', { m1: ['tribe-b'] })
    const { status, body } = await getStatus()
    expect(status).toBe(404)
    expect(body).toEqual({ error: d.missions.missionNotFound })
  })

  it('트라이브가 없는 유저도 제한 미션은 404다', async () => {
    state.tribeAccess = access(null, { m1: ['tribe-b'] })
    expect((await getStatus()).status).toBe(404)
  })

  it('이미 완료한 미션은 트라이브가 달라도 본다', async () => {
    state.tribeAccess = access('tribe-a', { m1: ['tribe-b'] })
    state.completions = [{ user_id: ME, completed_at: '2026-10-18T00:00:00Z' }]
    expect((await getStatus()).status).toBe(200)
  })

  it('대상 트라이브이거나 공통 미션이면 본다', async () => {
    state.tribeAccess = access('tribe-a', { m1: ['tribe-a', 'tribe-b'] })
    expect((await getStatus()).status).toBe(200)
    state.tribeAccess = access(null)
    expect((await getStatus()).status).toBe(200)
  })

  it('트라이브 접근을 읽지 못하면 500이다(fail-closed)', async () => {
    state.tribeAccess = null
    const { status, body } = await getStatus()
    expect(status).toBe(500)
    expect(body).toEqual({ error: d.missions.statusLoadError })
  })

  it('미참가자는 대상 트라이브여도 403이다(기존 동작)', async () => {
    state.mine = false
    expect((await getStatus()).status).toBe(403)
  })
})

describe('GET /api/missions/[id]/status — 이용 정지 유저 순위 제외', () => {
  it('랭킹형: 정지 중인 참가자는 다른 유저가 보는 순위와 totalParticipants에서 빠진다', async () => {
    state.suspended = new Set([OTHER])
    const { status, body } = await getStatus()
    expect(status).toBe(200)
    expect(body.type).toBe('ranking')
    expect(ids(body.entries)).toEqual([THIRD, ME])
    expect(body.entries.map((e) => e.rank)).toEqual([1, 2])
    expect(body.totalParticipants).toBe(2)
    expect(body.me?.userId).toBe(ME)
  })

  it('랭킹형: 정지 중인 본인에게는 본인이 계속 보인다', async () => {
    state.suspended = new Set([ME, OTHER])
    const { body } = await getStatus()
    expect(ids(body.entries)).toEqual([THIRD, ME])
    expect(body.me?.userId).toBe(ME)
    expect(body.totalParticipants).toBe(2)
  })

  it('랭킹형: 정지가 풀리면 다시 보인다', async () => {
    state.suspended = new Set([OTHER])
    expect(ids((await getStatus()).body.entries)).toEqual([THIRD, ME])
    state.suspended = new Set()
    const { body } = await getStatus()
    expect(ids(body.entries)).toEqual([OTHER, THIRD, ME])
    expect(body.totalParticipants).toBe(3)
  })

  it('달성형: 정지 중인 달성자는 목록에서 빠진다', async () => {
    state.displayType = 'achievement'
    state.completions = [
      { user_id: OTHER, completed_at: '2026-10-17T00:00:00Z' },
      { user_id: THIRD, completed_at: '2026-10-18T00:00:00Z' },
    ]
    state.suspended = new Set([OTHER])
    const { body } = await getStatus()
    expect(body.type).toBe('achievement')
    expect(ids(body.entries)).toEqual([THIRD, ME])
    expect(body.totalParticipants).toBe(2)
  })

  it('정지 여부를 읽지 못하면 목록을 내리지 않는다(500)', async () => {
    state.suspensionReadFails = true
    const { status, body } = await getStatus()
    expect(status).toBe(500)
    expect(body).toEqual({ error: d.missions.statusLoadError })
  })

  it('개인형은 다른 참가자를 읽지 않으므로 정지 조회를 하지 않는다', async () => {
    state.displayType = 'individual'
    const { status, body } = await getStatus()
    expect(status).toBe(200)
    expect(body.type).toBe('individual')
    expect(state.suspensionLookups).toBe(0)
  })
})
