/**
 * 어드민 자동화 읽기 토큰 인증 (티켓 20260918_1149)
 *
 * 클라우드 예약 작업이 관리자 로그인 쿠키 없이 어드민 GET API를 읽을 수 있도록 추가한
 * `isValidAdminReadToken`/`requireAdminRead`가 지켜야 할 계약:
 * 1. 올바른 토큰 + GET → 통과(null)
 * 2. 틀린 토큰 / 토큰 없음 / 환경변수 미설정 → 기존처럼 거부(세션 검사로 폴백, 세션도
 *    없으므로 403)
 * 3. 올바른 토큰이라도 GET이 아니면(POST/PUT/PATCH/DELETE) 절대 통과하지 못한다
 */
import { vi, beforeEach, afterEach } from 'vitest'

// requireAdmin()이 폴백 시 타는 getAdminUser() → createClient().auth.getUser()를
// 항상 "로그인 없음"으로 고정해, 토큰 실패 시 세션으로도 우회되지 않음을 함께 보장한다.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
  createServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  }),
}))

import { isValidAdminReadToken, requireAdminRead } from '../auth'

const TOKEN = 'test-admin-read-token-abcdef'

function makeRequest(method: string, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/admin/missions', { method, headers })
}

describe('isValidAdminReadToken', () => {
  const original = process.env.ADMIN_API_READ_TOKEN

  beforeEach(() => {
    process.env.ADMIN_API_READ_TOKEN = TOKEN
  })

  afterEach(() => {
    if (original === undefined) delete process.env.ADMIN_API_READ_TOKEN
    else process.env.ADMIN_API_READ_TOKEN = original
  })

  it('환경변수와 일치하는 토큰이면 true', () => {
    expect(isValidAdminReadToken(TOKEN)).toBe(true)
  })

  it('틀린 토큰이면 false', () => {
    expect(isValidAdminReadToken('wrong-token')).toBe(false)
  })

  it('빈 토큰이면 false', () => {
    expect(isValidAdminReadToken('')).toBe(false)
    expect(isValidAdminReadToken(null)).toBe(false)
    expect(isValidAdminReadToken(undefined)).toBe(false)
  })

  it('환경변수 자체가 없으면(미설정) 항상 false', () => {
    delete process.env.ADMIN_API_READ_TOKEN
    expect(isValidAdminReadToken(TOKEN)).toBe(false)
  })
})

describe('requireAdminRead', () => {
  const original = process.env.ADMIN_API_READ_TOKEN

  beforeEach(() => {
    process.env.ADMIN_API_READ_TOKEN = TOKEN
  })

  afterEach(() => {
    if (original === undefined) delete process.env.ADMIN_API_READ_TOKEN
    else process.env.ADMIN_API_READ_TOKEN = original
  })

  it('GET + 올바른 토큰이면 통과(null)한다', async () => {
    const req = makeRequest('GET', { 'x-admin-read-token': TOKEN })
    expect(await requireAdminRead(req)).toBeNull()
  })

  it('GET + 틀린 토큰이면 거부한다(403)', async () => {
    const req = makeRequest('GET', { 'x-admin-read-token': 'wrong-token' })
    const res = await requireAdminRead(req)
    expect(res).not.toBeNull()
    expect(res?.status).toBe(403)
  })

  it('GET + 토큰 없음이면 거부한다(403)', async () => {
    const req = makeRequest('GET')
    const res = await requireAdminRead(req)
    expect(res).not.toBeNull()
    expect(res?.status).toBe(403)
  })

  it('환경변수 미설정이면 올바른 값을 보내도 거부한다(403)', async () => {
    delete process.env.ADMIN_API_READ_TOKEN
    const req = makeRequest('GET', { 'x-admin-read-token': TOKEN })
    const res = await requireAdminRead(req)
    expect(res).not.toBeNull()
    expect(res?.status).toBe(403)
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    '올바른 토큰이라도 %s(쓰기 메서드)는 통과시키지 않는다',
    async (method) => {
      const req = makeRequest(method, { 'x-admin-read-token': TOKEN })
      const res = await requireAdminRead(req)
      expect(res).not.toBeNull()
      expect(res?.status).toBe(403)
    }
  )
})
