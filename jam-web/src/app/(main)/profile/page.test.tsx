/**
 * `/profile` 경유지 — 트라이브가 없으면 /onboarding (티켓 20261021_1247 1회, 사용자 결정 1)
 *
 * 고정하는 것
 *  - 트라이브가 없으면 아이디가 있어도 `/onboarding`으로 보낸다. 트라이브와 아이디가 모두 있으면 `/{username}`으로 보내고,
 *    연동 결과 플래그(`reveal`·`strava`·`reason`)를 그대로 싣는다(기존 동작).
 *  - 아이디가 없으면 트라이브가 있어도 `/onboarding`이다(기존 동작).
 *  - 비로그인은 `/login`이고 `users`를 읽지 않는다.
 *
 * 서버 컴포넌트를 함수로 불러 `redirect`가 던지는 이동 대상을 읽는다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/profile/page.test.tsx"
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '11111111-1111-4111-8111-111111111111'

const state = vi.hoisted(() => ({
  authenticated: true,
  row: null as null | Record<string, unknown>,
  selects: [] as string[],
}))

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.authenticated ? { id: USER_ID } : null } }),
    },
  }),
  createServiceClient: () => ({
    from: () => ({
      select: (columns: string) => {
        state.selects.push(columns)
        return { eq: () => ({ maybeSingle: async () => ({ data: state.row, error: null }) }) }
      },
    }),
  }),
}))

import ProfilePage from './page'

async function redirectOf(searchParams: Record<string, string | string[] | undefined> = {}): Promise<string> {
  try {
    await ProfilePage({ searchParams: Promise.resolve(searchParams) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.startsWith('NEXT_REDIRECT:')) return message.slice('NEXT_REDIRECT:'.length)
    throw err
  }
  throw new Error('redirect가 불리지 않았다')
}

beforeEach(() => {
  state.authenticated = true
  state.row = null
  state.selects = []
})

describe('/profile 경유지', () => {
  it('트라이브가 없으면 아이디가 있어도 /onboarding으로 보낸다', async () => {
    state.row = { username: 'runner', tribe_id: null }

    await expect(redirectOf()).resolves.toBe('/onboarding')
  })

  it('트라이브와 아이디가 있으면 /{username}으로 보낸다', async () => {
    state.row = { username: 'runner', tribe_id: 'tribe-1' }

    await expect(redirectOf()).resolves.toBe('/runner')
  })

  it('연동 결과 플래그(reveal·strava·reason)를 목적지에 그대로 싣는다', async () => {
    state.row = { username: 'runner', tribe_id: 'tribe-1' }

    await expect(redirectOf({ reveal: '1', strava: 'connected', reason: 'x' })).resolves.toBe('/runner?reveal=1&strava=connected&reason=x')
  })

  it('트라이브가 없으면 연동 결과 플래그가 있어도 /onboarding이다', async () => {
    state.row = { username: 'runner', tribe_id: null }

    await expect(redirectOf({ strava: 'connected' })).resolves.toBe('/onboarding')
  })

  it('아이디가 없으면 트라이브가 있어도 /onboarding이다', async () => {
    state.row = { username: null, tribe_id: 'tribe-1' }

    await expect(redirectOf()).resolves.toBe('/onboarding')
  })

  it('users 행이 없으면 /onboarding이다', async () => {
    state.row = null

    await expect(redirectOf()).resolves.toBe('/onboarding')
  })

  it('판정을 위해 username과 tribe_id를 읽는다', async () => {
    state.row = { username: 'runner', tribe_id: 'tribe-1' }

    await redirectOf()

    expect(state.selects).toEqual(['username, tribe_id'])
  })

  it('비로그인은 /login이고 users를 읽지 않는다', async () => {
    state.authenticated = false

    await expect(redirectOf()).resolves.toBe('/login')
    expect(state.selects).toEqual([])
  })
})
