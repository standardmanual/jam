/**
 * proxy 게이트 회귀 — 토큰 쓰기 예외가 제출 경로 하나에만 열리는지 (티켓 20260930_1816)
 *
 * `proxy.ts`는 모든 요청이 지나는 파일이다. 로그인 쿠키가 없는 요청이 라우트에 닿는 경우를 여기서 고정한다.
 * - 기존: GET + `/api/admin/*` + 맞는 토큰 → 통과(티켓 20260918_1149). 쿠키·토큰 없는 요청 → 로그인으로 리다이렉트
 * - 새 예외: POST + `/api/admin/ops-inbox`(정확 일치) + 맞는 토큰 → 통과
 * - 그 밖의 쓰기(다른 어드민 경로, 다른 메서드, 경로에 무언가 붙은 것)는 토큰이 맞아도 리다이렉트
 */
import { vi, beforeEach, afterEach } from 'vitest'
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

const TOKEN = 'test-admin-read-token-abcdef'
const ENV_KEYS = ['ADMIN_API_READ_TOKEN', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'STAGING_MODE'] as const

function makeRequest(method: string, pathname: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost${pathname}`, { method, headers })
}

/** 통과(NextResponse.next)면 true. 리다이렉트면 false. */
function passedThrough(res: Response): boolean {
  return res.headers.get('x-middleware-next') === '1'
}

// 요청 경로 끝에 `/`가 있으면 NextURL이 그 `/`를 리다이렉트 경로에도 남긴다(`/login/`, 기존 동작). 목적지만 본다.
function redirectPath(res: Response): string | null {
  const location = res.headers.get('location')
  return location ? new URL(location).pathname.replace(/(.)\/$/, '$1') : null
}

describe('proxy — 토큰 쓰기 예외와 기존 게이트', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) saved[key] = process.env[key]
    process.env.ADMIN_API_READ_TOKEN = TOKEN
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

  describe('새 예외: 제출 경로 하나', () => {
    it('POST + 정확한 제출 경로 + 맞는 토큰이면 통과한다', async () => {
      const res = await proxy(makeRequest('POST', '/api/admin/ops-inbox', { 'x-admin-read-token': TOKEN }))
      expect(passedThrough(res)).toBe(true)
    })

    it('토큰이 없으면 로그인으로 리다이렉트한다', async () => {
      const res = await proxy(makeRequest('POST', '/api/admin/ops-inbox'))
      expect(passedThrough(res)).toBe(false)
      expect(redirectPath(res)).toBe('/login')
    })

    it('틀린 토큰이면 로그인으로 리다이렉트한다', async () => {
      const res = await proxy(makeRequest('POST', '/api/admin/ops-inbox', { 'x-admin-read-token': 'wrong' }))
      expect(redirectPath(res)).toBe('/login')
    })

    it('환경변수가 없으면 올바른 값을 보내도 리다이렉트한다', async () => {
      delete process.env.ADMIN_API_READ_TOKEN
      const res = await proxy(makeRequest('POST', '/api/admin/ops-inbox', { 'x-admin-read-token': TOKEN }))
      expect(redirectPath(res)).toBe('/login')
    })

    it.each(['PUT', 'PATCH', 'DELETE'])('제출 경로라도 토큰 %s는 리다이렉트한다', async (method) => {
      const res = await proxy(makeRequest(method, '/api/admin/ops-inbox', { 'x-admin-read-token': TOKEN }))
      expect(redirectPath(res)).toBe('/login')
    })
  })

  describe('두 번째 예외: 루틴 시작 기록 경로 하나 (티켓 20261026_2032)', () => {
    const START = '/api/admin/ops-inbox/routine-start'

    it('POST + 정확한 경로 + 맞는 토큰이면 통과한다', async () => {
      const res = await proxy(makeRequest('POST', START, { 'x-admin-read-token': TOKEN }))
      expect(passedThrough(res)).toBe(true)
    })

    it('토큰이 없거나 틀리면 로그인으로 리다이렉트한다', async () => {
      expect(redirectPath(await proxy(makeRequest('POST', START)))).toBe('/login')
      expect(redirectPath(await proxy(makeRequest('POST', START, { 'x-admin-read-token': 'wrong' })))).toBe('/login')
    })

    it.each(['PUT', 'PATCH', 'DELETE'])('토큰 %s는 리다이렉트한다', async (method) => {
      const res = await proxy(makeRequest(method, START, { 'x-admin-read-token': TOKEN }))
      expect(redirectPath(res)).toBe('/login')
    })

    it.each([`${START}/`, `${START}/x`, `${START}x`, '/api/admin/ops-inbox/routine'])(
      'POST %s 는 토큰이 맞아도 리다이렉트한다',
      async (pathname) => {
        const res = await proxy(makeRequest('POST', pathname, { 'x-admin-read-token': TOKEN }))
        expect(passedThrough(res)).toBe(false)
        expect(redirectPath(res)).toBe('/login')
      }
    )
  })

  describe('토큰 POST·PUT·PATCH·DELETE는 제출 경로 밖의 어드민 경로에서 모두 막힌다', () => {
    const paths = [
      '/api/admin/missions',
      '/api/admin/users',
      '/api/admin/badges/bulk',
      '/api/admin/ops-inbox/x',
      '/api/admin/ops-inbox/',
      '/api/admin/ops-inboxx',
      '/api/admin/ops-inbox/bulk',
    ]
    const methods = ['POST', 'PUT', 'PATCH', 'DELETE']
    const cases = paths.flatMap((pathname) => methods.map((method) => [method, pathname] as const))

    it.each(cases)('%s %s → 로그인 리다이렉트', async (method, pathname) => {
      const res = await proxy(makeRequest(method, pathname, { 'x-admin-read-token': TOKEN }))
      expect(passedThrough(res)).toBe(false)
      expect(redirectPath(res)).toBe('/login')
    })
  })

  describe('기존 게이트는 그대로다(회귀)', () => {
    it('GET + /api/admin/* + 맞는 토큰이면 통과한다(읽기 토큰)', async () => {
      const res = await proxy(makeRequest('GET', '/api/admin/missions', { 'x-admin-read-token': TOKEN }))
      expect(passedThrough(res)).toBe(true)
    })

    it('GET이라도 토큰이 틀리면 리다이렉트한다', async () => {
      const res = await proxy(makeRequest('GET', '/api/admin/missions', { 'x-admin-read-token': 'wrong' }))
      expect(redirectPath(res)).toBe('/login')
    })

    it('GET이라도 토큰이 없으면 리다이렉트한다', async () => {
      const res = await proxy(makeRequest('GET', '/api/admin/missions'))
      expect(redirectPath(res)).toBe('/login')
    })

    it('쿠키 없는 다른 POST는 로그인으로 리다이렉트한다', async () => {
      const res = await proxy(makeRequest('POST', '/api/admin/missions'))
      expect(passedThrough(res)).toBe(false)
      expect(redirectPath(res)).toBe('/login')
    })

    it('쿠키 없는 다른 POST는 STAGING_MODE에서 /api/dev-login으로 간다', async () => {
      process.env.STAGING_MODE = 'true'
      const res = await proxy(makeRequest('POST', '/api/admin/missions'))
      expect(redirectPath(res)).toBe('/api/dev-login')
    })

    it('공개 경로는 여전히 통과한다', async () => {
      const res = await proxy(makeRequest('GET', '/login'))
      expect(passedThrough(res)).toBe(true)
    })
  })
})
