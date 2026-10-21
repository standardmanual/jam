/**
 * 미션 상세 페이지 — 내가 받지 않은 아이템 보상 (티켓 20261019_1313 3회, 티켓 20261019_1317 2회, 운영 로직 7.3절·10.3절)
 *
 * 서버가 `mission_item_rewards`에서 내 `pending` 행을 읽어 `pendingRewards`로 내린다. 열린 보상은 이름·그림을 싣고,
 * **잠긴 보상은 이름·그림·설명·배지 id 없이 등급과 `locked`만** 싣는다 — 받기 전에 어떤 아이템 배지인지 알 수 있는 값이
 * 클라이언트로 내려가면 안 된다. 숨김 배지(`is_hidden`)는 어느 쪽으로도 싣지 않는다(이름·그림·id·등급·개수).
 * 기록이나 배지를 읽지 못하면 빈 배열이 아니라 `null`이다 — 화면이 «받을 보상 없음»과 구분해 읽지 못했다고 알린다.
 * 밤 조건 미션이면 `nightNotice`가 true다. 화면은 클라이언트 시험이 맡고 여기서는 페이지가 넘긴 props만 본다.
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

type DetailProps = { pendingRewards?: Record<string, unknown>[] | null; nightNotice?: boolean }

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

  it('보상 기록을 읽지 못하면 «받을 보상 없음»(빈 배열)이 아니라 null로 내리고 로그를 남긴다', async () => {
    state.errors.mission_item_rewards = { message: 'boom' }

    const props = await render()

    expect(props.pendingRewards).toBeNull()
    expect(errorSpy).toHaveBeenCalled()
  })

  it('보상 기록을 읽지 못하면 배지를 따로 읽지 않는다', async () => {
    state.errors.mission_item_rewards = { message: 'boom' }

    await render()

    expect(state.calls.some((call) => call.table === 'badges')).toBe(false)
  })

  it('배지를 읽지 못해도 null이다. 열린 보상만 빠진 채 «일부만 받을 보상»처럼 보이지 않는다 — 이름은 어디에도 없다', async () => {
    state.errors.badges = { message: 'boom' }

    const props = await render()

    expect(props.pendingRewards).toBeNull()
    expect(JSON.stringify(props)).not.toContain('비밀 장갑')
    expect(JSON.stringify(props)).not.toContain('한강 러너 캡')
    expect(errorSpy).toHaveBeenCalled()
  })

  it('숨김 배지는 받을 보상으로 싣지 않는다 — 이름·그림·id·등급·개수가 어디에도 없다', async () => {
    const HIDDEN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    state.tables.mission_item_rewards = [
      { badge_id: OPEN, locked: false },
      { badge_id: HIDDEN, locked: false },
      { badge_id: HIDDEN, locked: true },
    ]
    state.tables.badges = [
      { id: OPEN, name: '한강 러너 캡', image_url: 'https://cdn.example/open.png', rarity: 'rare', is_hidden: false },
      { id: HIDDEN, name: '숨김 모자', image_url: 'https://cdn.example/hidden.png', rarity: 'mystic', is_hidden: true },
    ]

    const props = await render()

    expect(props.pendingRewards).toEqual([
      { locked: false, id: OPEN, name: '한강 러너 캡', image_url: 'https://cdn.example/open.png', rarity: 'rare' },
    ])
    const serialized = JSON.stringify(props)
    expect(serialized).not.toContain('숨김 모자')
    expect(serialized).not.toContain('hidden.png')
    expect(serialized).not.toContain(HIDDEN)
    expect(serialized).not.toContain('mystic')
  })

  it('배지를 읽을 때 숨김 칸(is_hidden)을 함께 읽는다', async () => {
    await render()

    const selects = state.calls.filter((call) => call.table === 'badges' && call.method === 'select')
    expect(selects.some((call) => String(call.args[0]).includes('is_hidden'))).toBe(true)
  })

  it('등급이 없는 배지는 등급을 null로 싣는다 — Common으로 접지 않는다', async () => {
    state.tables.mission_item_rewards = [{ badge_id: OPEN, locked: false }]
    state.tables.badges = [{ id: OPEN, name: '한강 러너 캡', image_url: null, rarity: null }]

    const props = await render()

    expect(props.pendingRewards).toEqual([{ locked: false, id: OPEN, name: '한강 러너 캡', image_url: null, rarity: null }])
  })
})

describe('미션 상세 페이지 — 밤 조건 안내(nightNotice)', () => {
  let errorSpy: MockInstance

  beforeEach(() => {
    state.tables = { missions: [], mission_item_rewards: [], badges: [] }
    state.errors = {}
    state.calls = []
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  const withCondition = (condition: unknown) => {
    state.tables.missions = [
      { id: 'm1', title: '야간 러닝', starts_at: '2026-01-01T00:00:00Z', ends_at: null, exposure_mode: null, exposure_at: null, reward_badge_ids: [], condition_json: condition },
    ]
  }

  it('22:00~05:00과 겹치는 시간대 조건이 있으면 true다', async () => {
    withCondition({ time_range: { start: '22:00', end: '23:30' } })

    expect((await render()).nightNotice).toBe(true)
  })

  it('낮 시간대 조건이면 false다', async () => {
    withCondition({ time_range: { start: '06:00', end: '09:00' } })

    expect((await render()).nightNotice).toBe(false)
  })

  it('시간대 조건이 없으면 false다', async () => {
    withCondition({ distance_km: 5 })

    expect((await render()).nightNotice).toBe(false)
  })
})
