/**
 * 미션 상세 페이지 — 숨김·잠긴 보상 배지는 이름·그림·id를 내리지 않는다 (티켓 20261019_1313 2회, 티켓 20261019_0012, 티켓 20261019_1317 2회)
 *
 * 숨김 배지(`badges.is_hidden`)는 받기 전에 어디에도 내려가면 안 된다(운영 로직 10.3절). 미션 보상은 받기 전에 화면에 보이므로
 * 보상 카드 목록과 클라이언트로 넘기는 미션 행의 `reward_badge_ids`에서 모두 뺀다.
 * 지금은 숨김 배지를 보상으로 저장하지 못하게 막지만, 막기 전에 들어간 값이 있어도 화면에는 내리지 않는다.
 * 잠김으로 만든 아이템 배지(`badges.always_locked`)는 열기 전에 이름·그림·id를 내리지 않고 **등급만** `lockedRewardRarities`로 내린다(운영 로직 7.3절).
 *
 * 페이지 함수를 모의 Supabase로 직접 호출하고, 클라이언트 컴포넌트는 그리지 않고 넘긴 props만 본다.
 * 실행: cd jam-web && npx vitest run "src/app/(main)/missions/[id]/__tests__/page.hidden-reward.test.tsx"
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
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
}))
vi.mock('@/lib/missions/visibility-server', () => ({
  loadMissionVisibilityContext: async () => ({ completedMissionIds: new Set<string>(), tribeAccess: null }),
}))
vi.mock('@/lib/missions/visibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/missions/visibility')>()),
  resolveMissionVisibility: () => ({ visibility: 'open', requiredBadge: null }),
}))
vi.mock('../MissionDetailClient', () => ({ default: () => null }))

import MissionDetailPage from '../page'

const OPEN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const HIDDEN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

type DetailProps = {
  mission: { reward_badge_ids: string[] | null; title: string }
  rewardBadges: Row[]
  lockedRewardRarities: (string | null)[]
}

async function render(): Promise<DetailProps> {
  const element = (await MissionDetailPage({ params: Promise.resolve({ id: 'm1' }) })) as { props: DetailProps }
  return element.props
}

describe('미션 상세 페이지 — 숨김 보상 배지', () => {
  let errorSpy: MockInstance

  beforeEach(() => {
    state.tables = {
      missions: [
        { id: 'm1', title: '주말 러닝', starts_at: '2026-01-01T00:00:00Z', ends_at: null, exposure_mode: null, exposure_at: null, reward_badge_ids: [OPEN, HIDDEN] },
      ],
      badges: [
        { id: OPEN, name: '주말 러너', image_url: 'https://cdn.example/open.png', rarity: 'rare', is_hidden: false },
        { id: HIDDEN, name: '비밀 배지', image_url: 'https://cdn.example/hidden.png', rarity: 'common', is_hidden: true },
      ],
    }
    state.errors = {}
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('숨김 보상 배지는 보상 카드 목록에서 뺀다. 이름·그림이 어디에도 없다', async () => {
    const props = await render()

    expect(props.rewardBadges).toEqual([{ id: OPEN, name: '주말 러너', image_url: 'https://cdn.example/open.png', rarity: 'rare' }])
    const serialized = JSON.stringify(props)
    expect(serialized).not.toContain('비밀 배지')
    expect(serialized).not.toContain('hidden.png')
  })

  it('클라이언트로 넘기는 미션 행의 reward_badge_ids에서도 숨김 id를 뺀다(id·개수를 알리지 않는다)', async () => {
    const props = await render()

    expect(props.mission.reward_badge_ids).toEqual([OPEN])
    expect(JSON.stringify(props)).not.toContain(HIDDEN)
  })

  it('보상 카드에 is_hidden 칸을 싣지 않는다', async () => {
    const props = await render()

    expect(props.rewardBadges.every((badge) => !('is_hidden' in badge))).toBe(true)
  })

  it('보상 배지가 모두 숨김이면 보상 카드가 없고 id도 비어 있다', async () => {
    state.tables.missions = [{ ...state.tables.missions[0], reward_badge_ids: [HIDDEN] }]
    // 모의 DB는 `.in()` 필터를 따지지 않으므로 이 미션이 가리키는 배지만 둔다
    state.tables.badges = state.tables.badges.filter((badge) => badge.id === HIDDEN)

    const props = await render()

    expect(props.rewardBadges).toEqual([])
    expect(props.mission.reward_badge_ids).toEqual([])
  })

  it('숨김 배지가 없으면 모두 그대로 싣는다', async () => {
    state.tables.missions = [{ ...state.tables.missions[0], reward_badge_ids: [OPEN] }]
    state.tables.badges = state.tables.badges.filter((badge) => badge.id === OPEN)

    const props = await render()

    expect(props.rewardBadges).toHaveLength(1)
    expect(props.mission.reward_badge_ids).toEqual([OPEN])
  })

  it('숨김 여부를 읽지 못하면 어느 배지가 숨김인지 모르므로 보상 배지를 내리지 않는다', async () => {
    state.errors.badges = { message: 'boom' }

    const props = await render()

    expect(props.rewardBadges).toEqual([])
    expect(props.mission.reward_badge_ids).toEqual([])
    expect(errorSpy).toHaveBeenCalled()
  })
})

describe('미션 상세 페이지 — 잠긴 보상 배지', () => {
  const LOCKED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  let errorSpy: MockInstance

  beforeEach(() => {
    state.tables = {
      missions: [
        { id: 'm1', title: '주말 러닝', starts_at: '2026-01-01T00:00:00Z', ends_at: null, exposure_mode: null, exposure_at: null, reward_badge_ids: [OPEN, LOCKED, HIDDEN] },
      ],
      badges: [
        { id: OPEN, name: '주말 러너', image_url: 'https://cdn.example/open.png', rarity: 'rare', is_hidden: false, always_locked: false },
        { id: LOCKED, name: '비밀 장갑', image_url: 'https://cdn.example/locked.png', rarity: 'epic', is_hidden: false, always_locked: true },
        { id: HIDDEN, name: '비밀 배지', image_url: 'https://cdn.example/hidden.png', rarity: 'mystic', is_hidden: true, always_locked: true },
      ],
    }
    state.errors = {}
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('잠긴 보상은 보상 카드 목록에서 빼고 등급만 내린다. 이름·그림·id가 어디에도 없다', async () => {
    const props = await render()

    expect(props.rewardBadges).toEqual([{ id: OPEN, name: '주말 러너', image_url: 'https://cdn.example/open.png', rarity: 'rare' }])
    expect(props.lockedRewardRarities).toEqual(['epic'])
    const serialized = JSON.stringify(props)
    expect(serialized).not.toContain('비밀 장갑')
    expect(serialized).not.toContain('locked.png')
    expect(serialized).not.toContain(LOCKED)
  })

  it('미션 행의 reward_badge_ids에서도 잠긴 id와 숨김 id를 뺀다', async () => {
    const props = await render()

    expect(props.mission.reward_badge_ids).toEqual([OPEN])
  })

  it('숨김이면서 잠긴 배지는 등급도 내리지 않는다', async () => {
    const props = await render()

    expect(props.lockedRewardRarities).not.toContain('mystic')
    const serialized = JSON.stringify(props)
    expect(serialized).not.toContain('비밀 배지')
    expect(serialized).not.toContain(HIDDEN)
  })

  it('잠긴 보상이 없으면 등급 목록이 비어 있다', async () => {
    state.tables.missions = [{ ...state.tables.missions[0], reward_badge_ids: [OPEN] }]
    state.tables.badges = state.tables.badges.filter((badge) => badge.id === OPEN)

    const props = await render()

    expect(props.lockedRewardRarities).toEqual([])
  })

  it('잠김 여부를 읽지 못하면 등급도 내리지 않고 모든 id를 가린다', async () => {
    state.errors.badges = { message: 'boom' }

    const props = await render()

    expect(props.rewardBadges).toEqual([])
    expect(props.lockedRewardRarities).toEqual([])
    expect(props.mission.reward_badge_ids).toEqual([])
    expect(errorSpy).toHaveBeenCalled()
  })
})
