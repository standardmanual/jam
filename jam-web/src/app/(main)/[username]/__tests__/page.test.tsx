/**
 * /{username} 프로필 페이지 — 클라이언트로 넘기는 prop 노출 방지 테스트 (티켓 20261008_1354)
 *
 * `ProfileClient`는 클라이언트 컴포넌트라, 페이지가 넘긴 prop 전체가 직렬화돼 브라우저로 간다.
 * 서비스 클라이언트(RLS 우회)로 읽은 대상 유저의 행을 그대로 넘기면 이메일·마지막 위치·관리자
 * 여부·Strava 토큰 행이 로그인한 아무 유저에게 전달된다.
 *
 * 검증 대상:
 *  - 다른 유저 프로필: `profile`은 화면이 쓰는 세 필드(username·display_name·avatar_url)만 담고,
 *    `strava` prop이 없고, prop 전체를 직렬화한 문자열에 민감 값이 없다
 *  - `users` 조회의 select 인자가 `*`가 아니고 민감 열을 고르지 않으며, `strava_connections`를 읽지 않는다
 *  - 본인 프로필도 같은 prop 모양이다
 *  - 캡슐(티켓 20261018_0054): 내 프로필에서만 조회해 `capsuleInitial` prop을 내리고, 타인이 보는 프로필에는 조회도 prop 자체도 없다
 *    (직렬화한 prop·RSC 페이로드에 캡슐 값이 실리지 않는다 — 클라이언트에서 숨기는 방식이 아니다)
 *
 * 모킹한 DB 가짜는 select에서 고른 열을 무시하고 행 전체를 돌려준다 — 조회가 넓어졌을 때
 * prop에서 새는지까지 잡으려는 최악의 경우 흉내다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/[username]/__tests__/page.test.tsx"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'

const LOGIN_USER_ID = 'viewer-uuid-0001'
const TARGET_USER_ID = 'target-uuid-0002'

// 대상 유저 행에 일부러 넣어 둔 민감 값
const SECRET_EMAIL = 'secret-target@example.com'
const SECRET_LAT = 37.123456
const SECRET_LNG = 127.654321
const SECRET_ACCESS_TOKEN = 'enc-access-token-xyz'
const SECRET_REFRESH_TOKEN = 'enc-refresh-token-xyz'
const SECRET_ATHLETE_ID = 99887766

function userRow(id: string) {
  return {
    id,
    email: SECRET_EMAIL,
    username: 'target',
    display_name: '타겟 러너',
    avatar_url: 'https://example.com/avatar.png',
    tribe_id: 'tribe-1',
    onboarding_completed_at: '2026-01-01T00:00:00Z',
    initial_sync_done: true,
    last_location_lat: SECRET_LAT,
    last_location_lng: SECRET_LNG,
    last_location_at: '2026-10-08T00:00:00Z',
    gps_daily_distance_km: 12.5,
    gps_daily_distance_date: '2026-10-08',
    notifications_seen_at: '2026-10-08T00:00:00Z',
    is_admin: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-10-08T00:00:00Z',
  }
}

const stravaRow = {
  user_id: TARGET_USER_ID,
  strava_athlete_id: SECRET_ATHLETE_ID,
  access_token: SECRET_ACCESS_TOKEN,
  refresh_token: SECRET_REFRESH_TOKEN,
}

const state = vi.hoisted(() => ({
  loginUserId: '' as string,
  targetRow: null as Record<string, unknown> | null,
  calls: [] as { table: string; select: string | undefined; eqs: [string, unknown][] }[],
}))

const getWalletMock = vi.hoisted(() => vi.fn<(userId: string) => Promise<number>>())
const getCapsuleStatusMock = vi.hoisted(() => vi.fn<(client: unknown, userId: string) => Promise<unknown>>())

// 테이블별 응답 — 모르는 테이블은 빈 결과. strava_connections는 읽히면 토큰 행을 돌려준다.
function singleResponse(table: string) {
  if (table === 'users') return { data: state.targetRow, error: null }
  if (table === 'inventory') return { data: { id: 'inv-target' }, error: null }
  if (table === 'strava_connections') return { data: stravaRow, error: null }
  return { data: null, error: null }
}
function listResponse(table: string) {
  if (table === 'strava_connections') return { data: [stravaRow], count: 1, error: null }
  return { data: [], count: 0, error: null }
}

function makeQuery(table: string) {
  const call = { table, select: undefined as string | undefined, eqs: [] as [string, unknown][] }
  state.calls.push(call)
  const query: Record<string, unknown> = {}
  const chain = () => query
  for (const name of ['in', 'is', 'not', 'or', 'order', 'limit']) query[name] = chain
  query.eq = (column: string, value: unknown) => {
    call.eqs.push([column, value])
    return query
  }
  query.select = (columns?: string) => {
    call.select = columns
    return query
  }
  query.maybeSingle = async () => singleResponse(table)
  query.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(listResponse(table)).then(resolve, reject)
  return query
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        state.loginUserId
          ? { data: { user: { id: state.loginUserId } }, error: null }
          : { data: { user: null }, error: null },
    },
  }),
  createServiceClient: () => ({ from: (table: string) => makeQuery(table) }),
}))

vi.mock('@/lib/points', () => ({
  getWallet: (userId: string) => getWalletMock(userId),
}))

vi.mock('@/lib/capsule/capsule', () => ({
  getCapsuleStatus: (client: unknown, userId: string) => getCapsuleStatusMock(client, userId),
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`)
  },
}))

// 피드 하이드레이트는 별도 DB 조회를 하므로 행을 그대로 돌려주게 갈아끼운다
vi.mock('@/lib/activity-feed/hydrate', () => ({
  hydrateFeedBadgeInfo: async (items: unknown[]) => items,
}))

// 클라이언트 컴포넌트는 실제 화면 모듈을 불러오지 않고 prop만 받는 자리표시자로 둔다
vi.mock('../../profile/ProfileClient', () => ({
  default: function ProfileClientStub() {
    return null
  },
}))

import UserProfilePage from '../page'

async function renderPage(username: string) {
  const element = (await UserProfilePage({ params: Promise.resolve({ username }) })) as ReactElement<
    Record<string, unknown>
  >
  return element.props
}

const FORBIDDEN_STRINGS = [
  SECRET_EMAIL,
  String(SECRET_LAT),
  String(SECRET_LNG),
  SECRET_ACCESS_TOKEN,
  SECRET_REFRESH_TOKEN,
  String(SECRET_ATHLETE_ID),
  'access_token',
  'refresh_token',
  'strava_athlete_id',
  'last_location',
  'is_admin',
  'email',
]

// 캡슐 값에서만 나오는 글자 — 타인 프로필의 직렬화에 이 값이 있으면 캡슐이 새는 것이다
const CAPSULE_STATUS = {
  required: 987654,
  filled: 123456,
  remaining: 864198,
  balance: 55555,
  openable: false,
  notOpenableReason: 'not_full',
}

beforeEach(() => {
  state.loginUserId = LOGIN_USER_ID
  state.targetRow = userRow(TARGET_USER_ID)
  state.calls = []
  getWalletMock.mockReset()
  getWalletMock.mockResolvedValue(1234)
  getCapsuleStatusMock.mockReset()
  getCapsuleStatusMock.mockResolvedValue(CAPSULE_STATUS)
})

describe('/{username} 프로필 페이지 — ProfileClient prop 노출 방지', () => {
  it('(a) 다른 유저 프로필: profile은 화면이 쓰는 필드만 담고 strava prop이 없다', async () => {
    const props = await renderPage('target')

    expect(Object.keys(props.profile as object).sort()).toEqual(['avatar_url', 'display_name', 'username'])
    // 화면이 보여 주던 값은 그대로 전달된다
    expect(props.profile).toEqual({
      username: 'target',
      display_name: '타겟 러너',
      avatar_url: 'https://example.com/avatar.png',
    })
    expect('strava' in props).toBe(false)
    expect(props.isOwnProfile).toBe(false)
    expect(props.targetUserId).toBe(TARGET_USER_ID)
    expect(props.pointBalance).toBeNull()
    expect(getWalletMock).not.toHaveBeenCalled()
  })

  it('(a) prop 전체를 직렬화한 문자열에 대상 유저의 민감 값이 없다', async () => {
    const props = await renderPage('target')
    const serialized = JSON.stringify(props)

    for (const forbidden of FORBIDDEN_STRINGS) {
      expect(serialized, `직렬화된 prop에 "${forbidden}"가 있다`).not.toContain(forbidden)
    }
  })

  it('(b) users 조회는 필요한 열만 고르고 strava_connections는 읽지 않는다', async () => {
    await renderPage('target')

    const usersCalls = state.calls.filter((c) => c.table === 'users')
    expect(usersCalls).toHaveLength(1)
    const selected = usersCalls[0].select ?? ''
    expect(selected).not.toBe('*')
    expect(selected).not.toContain('*')
    expect(selected).not.toContain('email')
    expect(selected).not.toContain('last_location')
    expect(selected).not.toContain('is_admin')
    const columns = selected.split(',').map((c) => c.trim()).sort()
    expect(columns).toEqual(['avatar_url', 'display_name', 'id', 'username'])

    expect(state.calls.some((c) => c.table === 'strava_connections')).toBe(false)
  })

  it('(c) 본인 프로필도 같은 prop 모양이고 민감 값이 없다', async () => {
    state.loginUserId = TARGET_USER_ID
    const props = await renderPage('target')

    expect(props.isOwnProfile).toBe(true)
    expect(props.pointBalance).toBe(1234)
    expect(getWalletMock).toHaveBeenCalledWith(TARGET_USER_ID)
    expect(Object.keys(props.profile as object).sort()).toEqual(['avatar_url', 'display_name', 'username'])
    expect('strava' in props).toBe(false)

    const serialized = JSON.stringify(props)
    for (const forbidden of FORBIDDEN_STRINGS) {
      expect(serialized, `직렬화된 prop에 "${forbidden}"가 있다`).not.toContain(forbidden)
    }
    expect(state.calls.some((c) => c.table === 'strava_connections')).toBe(false)
  })

  it('(d) 타인이 보는 프로필: 캡슐을 조회하지 않고 capsuleInitial prop 자체를 내리지 않는다', async () => {
    const props = await renderPage('target')

    expect(props.isOwnProfile).toBe(false)
    expect('capsuleInitial' in props).toBe(false)
    expect(getCapsuleStatusMock).not.toHaveBeenCalled()
    // 직렬화(= RSC 페이로드)에 캡슐 값이 없다
    const serialized = JSON.stringify(props)
    for (const secret of ['987654', '123456', '864198', '55555', 'notOpenableReason', 'capsule']) {
      expect(serialized, `타인 프로필의 직렬화된 prop에 "${secret}"가 있다`).not.toContain(secret)
    }
  })

  it('(d) 내 프로필: 캡슐을 내 계정으로 조회해 capsuleInitial로 내린다', async () => {
    state.loginUserId = TARGET_USER_ID
    const props = await renderPage('target')

    expect(props.isOwnProfile).toBe(true)
    expect(props.capsuleInitial).toEqual(CAPSULE_STATUS)
    expect(getCapsuleStatusMock).toHaveBeenCalledTimes(1)
    expect(getCapsuleStatusMock.mock.calls[0][1]).toBe(TARGET_USER_ID)
  })

  it('(d) 내 프로필에서 캡슐 조회가 실패하면 null로 접고 화면은 그대로 그려진다(위젯이 다시 가져온다)', async () => {
    state.loginUserId = TARGET_USER_ID
    getCapsuleStatusMock.mockRejectedValue(new Error('rpc 실패'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const props = await renderPage('target')

    expect('capsuleInitial' in props).toBe(true)
    expect(props.capsuleInitial).toBeNull()
    expect(props.isOwnProfile).toBe(true)
    errorSpy.mockRestore()
  })

  it('존재하지 않는 유저는 404 처리한다', async () => {
    state.targetRow = null
    await expect(renderPage('nobody')).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('로그인하지 않았으면 로그인 페이지로 보낸다', async () => {
    state.loginUserId = ''
    await expect(renderPage('target')).rejects.toThrow('NEXT_REDIRECT:/login')
  })
})

/**
 * 잠긴 개체는 컬렉션 수·레거시 피드로 새지 않는다 (티켓 20261018_0054 2회, 운영 로직 7.3절)
 *
 * 잠긴 개체의 배지 id로 아이템북을 찾아 세면 «어떤 컬렉션의 배지를 얻었는지»가 드러나고, 피드 합성이 개체 행의 배지 이름·그림을 읽으면
 * 이름이 드러난다. 두 `inventory_items` 조회 모두 `locked = false`로 걸러야 한다(서버에서 거른다 — 화면에서 가리지 않는다).
 */
describe('/{username} 프로필 페이지 — 잠긴 개체 가림', () => {
  it('(e) 인벤토리 개체를 읽는 모든 조회가 locked=false 조건을 건다(타인이 볼 때와 내가 볼 때 모두)', async () => {
    for (const viewer of [LOGIN_USER_ID, TARGET_USER_ID]) {
      state.loginUserId = viewer
      state.calls = []
      await renderPage('target')

      const itemCalls = state.calls.filter((c) => c.table === 'inventory_items')
      // 아이템북 카운트용 조회와 레거시 피드(활동 드랍)용 조회 둘이다
      expect(itemCalls.length).toBe(2)
      for (const call of itemCalls) {
        expect(call.eqs, `${call.select} 조회에 locked=false가 없다`).toContainEqual(['locked', false])
      }
    }
  })
})
