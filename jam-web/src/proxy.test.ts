/**
 * proxy 공개 경로 — 확률 안내(/probability)는 로그아웃 요청도 통과한다 (티켓 20261021_1250 1회, 운영 로직 18.3절)
 *
 * `proxy.ts`의 공개 경로 목록에 `/probability`가 있어야 로그인하지 않은 사람이 확률 안내를 읽는다(`(legal)` 그룹은 인증 호출이 없다).
 * 토큰 예외 게이트는 `lib/admin/__tests__/proxy-token-gate.test.ts`가 맡는다. 여기서는 세션이 없는 요청이 307 로그인 리다이렉트를 받는지만 본다.
 *
 * 실행: cd jam-web && npx vitest run src/proxy.test.ts
 */
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'

// 세션이 없는 요청을 흉내 낸다(로그인 쿠키 없음).
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
  createServiceClient: () => ({}),
}))

import { proxy } from '@/proxy'

const ENV_KEYS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'STAGING_MODE'] as const

const get = (pathname: string) => proxy(new NextRequest(`http://localhost${pathname}`, { method: 'GET' }))
const passedThrough = (res: Response) => res.headers.get('x-middleware-next') === '1'
const redirectPath = (res: Response) => {
  const location = res.headers.get('location')
  return location ? new URL(location).pathname.replace(/(.)\/$/, '$1') : null
}

describe('proxy — 로그아웃 요청의 공개 경로', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) saved[key] = process.env[key]
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.test'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key'
    delete process.env.STAGING_MODE
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  })

  it.each(['/probability', '/probability/'])('%s는 로그인 없이 통과한다(307이 아니다)', async (pathname) => {
    const res = await get(pathname)
    expect(passedThrough(res)).toBe(true)
    expect(res.status).not.toBe(307)
    expect(res.headers.get('location')).toBeNull()
  })

  it('STAGING_MODE에서도 /api/dev-login으로 보내지 않는다', async () => {
    process.env.STAGING_MODE = 'true'
    const res = await get('/probability')
    expect(passedThrough(res)).toBe(true)
    expect(res.headers.get('location')).toBeNull()
  })

  it('같은 (legal) 그룹의 두 법 페이지도 계속 열려 있다', async () => {
    for (const pathname of ['/privacy', '/location-terms']) {
      expect(passedThrough(await get(pathname)), pathname).toBe(true)
    }
  })

  it('공개 경로는 접두사가 아니라 경로 단위다 — /probabilityx는 로그인으로 보낸다', async () => {
    const res = await get('/probabilityx')
    expect(res.status).toBe(307)
    expect(redirectPath(res)).toBe('/login')
  })

  it('공개 경로를 하나 더했을 뿐 다른 경로는 그대로 로그인으로 보낸다(/philosophy)', async () => {
    const res = await get('/philosophy')
    expect(res.status).toBe(307)
    expect(redirectPath(res)).toBe('/login')
  })
})
