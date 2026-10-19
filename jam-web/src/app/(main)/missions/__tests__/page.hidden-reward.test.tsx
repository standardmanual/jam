/**
 * 미션 목록 페이지 — 숨김 보상 배지는 이름·id·개수를 내리지 않는다 (티켓 20261019_1313 2회, 티켓 20261019_0012)
 *
 * 목록 화면은 보상 배지 이름을 못 찾으면 «배지 1개» 폴백을 그린다. 숨김 배지의 id를 미션 행에 그대로 두면 이 폴백이
 * 숨김 배지의 존재와 개수를 알리므로, 이름 맵에서 빼는 것과 함께 미션 행의 `reward_badge_ids`에서도 뺀다.
 *
 * 페이지 함수를 모의 Supabase로 직접 호출하고, 클라이언트 컴포넌트는 그리지 않고 넘긴 props만 본다.
 * 실행: cd jam-web && npx vitest run "src/app/(main)/missions/__tests__/page.hidden-reward.test.tsx"
 */
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  errors: {} as Record<string, { message: string }>,
}))

/** 어떤 필터 체인이든 받는다. 끝(await·`.single()`·`.maybeSingle()`)에서 테이블 행을 돌려준다. */
function makeBuilder(table: string): unknown {
  const rows = state.tables[table] ?? []
  const error = state.errors[table] ?? null
  return new Proxy(
    {},
    {
      get(_target, method) {
        if (typeof method !== 'string') return undefined
        if (method === 'then') return (resolve: (value: unknown) => unknown) => resolve({ data: error ? null : rows, error })
        if (method === 'single' || method === 'maybeSingle') return () => Promise.resolve({ data: error ? null : (rows[0] ?? null), error })
        return () => makeBuilder(table)
      },
    }
  )
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) } }),
  createServiceClient: () => ({ from: (table: string) => makeBuilder(table) }),
}))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
}))
vi.mock('@/lib/onboarding-quest/screen-gate', () => ({ getOnboardingQuestGate: async () => null }))
vi.mock('@/lib/missions/visibility-server', () => ({
  loadMissionVisibilityContext: async () => ({ completedMissionIds: new Set<string>(), tribeAccess: null }),
}))
vi.mock('@/lib/missions/visibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/missions/visibility')>()),
  resolveMissionVisibilityMap: (missions: { id: string }[]) =>
    new Map(missions.map((m) => [m.id, { visibility: 'open', requiredBadge: null }])),
}))
vi.mock('../MissionsListClient', () => ({ default: () => null }))
vi.mock('../MissionsBrowseTracker', () => ({ default: () => null }))

import MissionsPage from '../page'

const OPEN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const HIDDEN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

type ListProps = {
  ongoing: { id: string; title: string; reward_badge_ids: string[] | null }[]
  ended: { id: string; reward_badge_ids: string[] | null }[]
  rewardBadgeNames: Record<string, { name: string }>
}

const mission = (id: string, rewardBadgeIds: string[]): Row => ({
  id,
  title: `미션 ${id}`,
  starts_at: '2026-01-01T00:00:00Z',
  ends_at: null,
  exposure_mode: null,
  exposure_at: null,
  gate_axis: null,
  reward_badge_ids: rewardBadgeIds,
})

async function render(): Promise<ListProps> {
  const element = (await MissionsPage()) as { props: { children: unknown } }
  const children = (Array.isArray(element.props.children) ? element.props.children : [element.props.children]) as {
    props?: Partial<ListProps>
  }[]
  const list = children.find((child) => child && child.props && 'rewardBadgeNames' in child.props)
  return list!.props as ListProps
}

describe('미션 목록 페이지 — 숨김 보상 배지', () => {
  let errorSpy: MockInstance

  beforeEach(() => {
    state.tables = {
      missions: [mission('m1', [OPEN, HIDDEN]), mission('m2', [HIDDEN])],
      badges: [
        { id: OPEN, name: '주말 러너', rarity: 'rare', level: null, is_hidden: false },
        { id: HIDDEN, name: '비밀 배지', rarity: 'common', level: null, is_hidden: true },
      ],
      user_mission_completions: [],
      user_mission_participations: [],
    }
    state.errors = {}
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('숨김 보상 배지는 이름 맵에 없다', async () => {
    const props = await render()

    expect(Object.keys(props.rewardBadgeNames)).toEqual([OPEN])
    expect(JSON.stringify(props)).not.toContain('비밀 배지')
  })

  it('미션 행의 reward_badge_ids에서 숨김 id를 뺀다. «배지 1개» 폴백이 숨김 배지의 개수를 알리지 않는다', async () => {
    const props = await render()
    const byId = new Map(props.ongoing.map((m) => [m.id, m]))

    expect(byId.get('m1')?.reward_badge_ids).toEqual([OPEN])
    expect(byId.get('m2')?.reward_badge_ids).toEqual([])
    expect(JSON.stringify(props)).not.toContain(HIDDEN)
  })

  it('숨김 배지가 없으면 모두 그대로 싣는다', async () => {
    state.tables.missions = [mission('m1', [OPEN])]

    const props = await render()

    expect(props.ongoing[0].reward_badge_ids).toEqual([OPEN])
    expect(props.rewardBadgeNames[OPEN]).toMatchObject({ name: '주말 러너' })
  })

  it('숨김 여부를 읽지 못하면 어느 배지가 숨김인지 모르므로 보상 배지 id와 이름을 내리지 않는다', async () => {
    state.errors.badges = { message: 'boom' }

    const props = await render()

    expect(props.rewardBadgeNames).toEqual({})
    expect(props.ongoing.every((m) => (m.reward_badge_ids ?? []).length === 0)).toBe(true)
    expect(errorSpy).toHaveBeenCalled()
  })
})
