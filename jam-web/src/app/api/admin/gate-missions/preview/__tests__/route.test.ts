/**
 * POST /api/admin/gate-missions/preview — 읽기 실패를 JSON 오류로 돌려준다 (티켓 20261019_1318 1회)
 * 5-1 이후 `loadMissionVisibilityContext`는 트라이브 조회에 실패하면 던진다(fail-closed). 라우트가 잡지 않으면 Next가 HTML
 * 오류 화면을 내려 미리보기 화면이 JSON 해석에서 깨진다. DB 오류 원문도 응답에 싣지 않는다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/gate-missions/preview/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SECRET = 'relation "mission_allowed_tribes" permission denied'

const state = vi.hoisted(() => ({
  missions: [] as Record<string, unknown>[],
  missionsError: null as { message: string } | null,
  loadError: null as Error | null,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      select: () =>
        table === 'users'
          ? {
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: { id: USER_ID, display_name: '테스트 유저', email: 't@example.com' }, error: null }),
              }),
            }
          : Promise.resolve({ data: state.missionsError ? null : state.missions, error: state.missionsError }),
    }),
  }),
}))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  requireAdmin: async () => null,
}))
vi.mock('@/lib/missions/visibility-server', () => ({
  loadMissionVisibilityContext: async () => {
    if (state.loadError) throw state.loadError
    return {
      completedMissionIds: new Set<string>(),
      gatedBadges: new Map(),
      ownedTierByBadgeName: new Map(),
      ownedFamilyTiers: new Map(),
      participatedMissionIds: new Set<string>(),
    }
  },
}))

const { POST } = await import('../route')

const post = (body: Record<string, unknown>) =>
  POST(
    new NextRequest('https://j-a-m.app/api/admin/gate-missions/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  )

const GATE_MISSION = { id: 'm1', title: '게이트 미션', gate_axis: 'running', gate_stage: 1, gated_badge_id: null, visibility_rule_json: null }

beforeEach(() => {
  state.missions = [GATE_MISSION]
  state.missionsError = null
  state.loadError = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/admin/gate-missions/preview', () => {
  it('게이트 미션이 없으면 빈 결과를 돌려준다', async () => {
    state.missions = []
    const res = await post({ userId: USER_ID })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ userLabel: '테스트 유저', results: [], ownedFamilies: [] })
  })

  it('노출 판정 컨텍스트를 읽지 못하면 JSON 오류(고정 문구, 500)로 돌려주고 원문은 로그에만 남긴다', async () => {
    state.loadError = new Error(`mission_allowed_tribes 조회 실패: ${SECRET}`)
    const res = await post({ userId: USER_ID })
    expect(res.status).toBe(500)
    expect(res.headers.get('content-type')).toContain('application/json')
    const body = await res.json()
    expect(body.error).toContain('미리보기 정보를 불러오지 못했어요')
    expect(JSON.stringify(body)).not.toContain(SECRET)
    expect(console.error).toHaveBeenCalled()
  })

  it('미션 목록을 읽지 못해도 DB 오류 원문 대신 같은 고정 문구를 돌려준다', async () => {
    state.missionsError = { message: SECRET }
    const res = await post({ userId: USER_ID })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('미리보기 정보를 불러오지 못했어요')
    expect(JSON.stringify(body)).not.toContain(SECRET)
  })

  it('컨텍스트를 읽었으면 게이트 미션의 노출 판정을 돌려준다', async () => {
    const res = await post({ userId: USER_ID })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results).toHaveLength(1)
    expect(body.results[0]).toMatchObject({ id: 'm1', title: '게이트 미션', gate_axis: 'running' })
  })
})
