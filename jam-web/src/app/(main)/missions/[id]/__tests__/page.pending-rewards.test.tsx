/**
 * 미션 상세 페이지 — 내가 받지 않은 아이템 보상 (티켓 20261019_1313 3회, 운영 로직 7.3절)
 *
 * 서버가 `mission_item_rewards`에서 내 `pending` 행을 읽어 `pendingRewards`로 내린다. 열린 보상은 이름·그림을 싣고,
 * **잠긴 보상은 이름·그림·설명·배지 id 없이 등급과 `locked`만** 싣는다 — 받기 전에 어떤 아이템 배지인지 알 수 있는 값이
 * 클라이언트로 내려가면 안 된다. 화면은 5-7이라 여기서는 페이지가 넘긴 props만 본다.
 *
 * 페이지 함수를 모의 Supabase로 직접 호출하고, 클라이언트 컴포넌트는 그리지 않는다.
 * 실행: cd jam-web && npx vitest run "src/app/(main)/missions/[id]/__tests__/page.pending-rewards.test.tsx"
 */
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  errors: {} as Record<string, { message: string }>,
  calls: [] as { table: string; method: string; args: unknown[] }[],
}))

/** 어떤 필터 체인이든 받고 호출을 기록한다. 끝(await·`.single()`·`.maybeSingle()`)에서 테이블 행을 돌려준다. */
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
        return (...args: unknown[]) => {
          state.calls.push({ table, method, args })
          return makeBuilder(table)
        }
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
const LOCKED = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

type DetailProps = { pendingRewards?: Record<string, unknown>[] }

async function render(): Promise<DetailProps> {
  const element = (await MissionDetailPage({ params: Promise.resolve({ id: 'm1' }) })) as { props: DetailProps }
  return element.props
}

describe('미션 상세 페이지 — 받지 않은 보상(pendingRewards)', () => {
  let errorSpy: MockInstance

  beforeEach(() => {
    state.tables = {
      missions: [
        { id: 'm1', title: '주말 러닝', starts_at: '2026-01-01T00:00:00Z', ends_at: null, exposure_mode: null, exposure_at: null, reward_badge_ids: [] },
      ],
      mission_item_rewards: [
        { badge_id: OPEN, locked: false },
        { badge_id: LOCKED, locked: true },
      ],
      badges: [
        { id: OPEN, name: '한강 러너 캡', image_url: 'https://cdn.example/open.png', rarity: 'rare' },
        { id: LOCKED, name: '비밀 장갑', image_url: 'https://cdn.example/locked.png', rarity: 'epic' },
      ],
    }
    state.errors = {}
    state.calls = []
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('열린 보상은 이름·그림·등급을 싣는다', async () => {
    const props = await render()

    expect(props.pendingRewards?.[0]).toEqual({
      locked: false,
      id: OPEN,
      name: '한강 러너 캡',
      image_url: 'https://cdn.example/open.png',
      rarity: 'rare',
    })
  })

  it('잠긴 보상은 등급과 locked만 싣는다. 이름·그림·배지 id가 어디에도 없다', async () => {
    const props = await render()

    expect(props.pendingRewards?.[1]).toEqual({ locked: true, rarity: 'epic' })
    // 열린 보상의 값은 직렬화에 있지만 잠긴 보상의 값은 어디에도 없어야 한다
    const serialized = JSON.stringify(props)
    expect(serialized).toContain('한강 러너 캡')
    expect(serialized).not.toContain('비밀 장갑')
    expect(serialized).not.toContain('locked.png')
    expect(serialized).not.toContain(LOCKED)
  })

  it('보상이 기록된 순서를 지킨다', async () => {
    const props = await render()

    expect(props.pendingRewards?.map((reward) => reward.locked)).toEqual([false, true])
  })

  it('내 이 미션의 받지 않은(pending) 행만 읽는다', async () => {
    await render()

    const calls = state.calls.filter((call) => call.table === 'mission_item_rewards')
    const filters = calls.filter((call) => call.method === 'eq').map((call) => call.args)
    expect(filters).toEqual(expect.arrayContaining([['user_id', 'user-1'], ['mission_id', 'm1'], ['status', 'pending']]))
  })

  it('받지 않은 보상이 없으면 빈 배열이고 배지를 따로 읽지 않는다', async () => {
    state.tables.mission_item_rewards = []

    const props = await render()

    expect(props.pendingRewards).toEqual([])
    expect(state.calls.some((call) => call.table === 'badges')).toBe(false)
  })

  it('보상 기록을 읽지 못하면 빈 배열로 두고 로그를 남긴다', async () => {
    state.errors.mission_item_rewards = { message: 'boom' }

    const props = await render()

    expect(props.pendingRewards).toEqual([])
    expect(errorSpy).toHaveBeenCalled()
  })

  it('배지를 읽지 못하면 열린 보상은 빠지고, 잠긴 보상은 등급 없이 남는다 — 이름은 어디에도 없다', async () => {
    state.errors.badges = { message: 'boom' }

    const props = await render()

    expect(props.pendingRewards).toEqual([{ locked: true, rarity: null }])
    expect(JSON.stringify(props)).not.toContain('비밀 장갑')
    expect(errorSpy).toHaveBeenCalled()
  })

  it('등급이 없는 배지는 등급을 null로 싣는다 — Common으로 접지 않는다', async () => {
    state.tables.mission_item_rewards = [{ badge_id: OPEN, locked: false }]
    state.tables.badges = [{ id: OPEN, name: '한강 러너 캡', image_url: null, rarity: null }]

    const props = await render()

    expect(props.pendingRewards).toEqual([{ locked: false, id: OPEN, name: '한강 러너 캡', image_url: null, rarity: null }])
  })
})
