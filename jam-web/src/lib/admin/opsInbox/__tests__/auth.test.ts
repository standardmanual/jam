/**
 * 제출 인증 래퍼 requireOpsInboxSubmit (티켓 20260930_1816)
 *
 * 통과는 둘 중 하나다: (1) POST + 제출 경로 정확 일치 + 맞는 토큰 (2) 관리자 로그인 세션.
 * 토큰이 맞아도 제출 경로·POST가 아니면 세션 검사로 넘어가 세션이 없으면 거부된다.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const session = vi.hoisted(() => ({ user: null as { id: string; email: string } | null }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: session.user } }) } }),
  createServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  }),
}))

import { requireOpsInboxSubmit } from '../auth'

const TOKEN = 'test-admin-read-token-abcdef'

function makeRequest(method: string, path: string, token: string | null = TOKEN): Request {
  const headers: Record<string, string> = {}
  if (token !== null) headers['x-admin-read-token'] = token
  return new Request(`http://localhost${path}`, { method, headers })
}

describe('requireOpsInboxSubmit', () => {
  const saved = { token: process.env.ADMIN_API_READ_TOKEN, emails: process.env.ADMIN_EMAILS }

  beforeEach(() => {
    process.env.ADMIN_API_READ_TOKEN = TOKEN
    process.env.ADMIN_EMAILS = 'admin@example.com'
    session.user = null
  })

  afterEach(() => {
    if (saved.token === undefined) delete process.env.ADMIN_API_READ_TOKEN
    else process.env.ADMIN_API_READ_TOKEN = saved.token
    if (saved.emails === undefined) delete process.env.ADMIN_EMAILS
    else process.env.ADMIN_EMAILS = saved.emails
  })

  it('POST + 제출 경로 + 맞는 토큰이면 토큰 제출로 통과한다', async () => {
    expect(await requireOpsInboxSubmit(makeRequest('POST', '/api/admin/ops-inbox'))).toEqual({ ok: true, via: 'token' })
  })

  it('쿼리 문자열이 붙어도 경로가 같으면 통과한다', async () => {
    expect(await requireOpsInboxSubmit(makeRequest('POST', '/api/admin/ops-inbox?x=1'))).toEqual({
      ok: true,
      via: 'token',
    })
  })

  it.each([
    ['GET', '/api/admin/ops-inbox'],
    ['PUT', '/api/admin/ops-inbox'],
    ['PATCH', '/api/admin/ops-inbox'],
    ['DELETE', '/api/admin/ops-inbox'],
    ['POST', '/api/admin/ops-inbox/x'],
    ['POST', '/api/admin/ops-inbox/'],
    ['POST', '/api/admin/ops-inboxx'],
    ['POST', '/api/admin/missions'],
    ['POST', '/api/admin'],
  ])('맞는 토큰이라도 %s %s는 세션이 없으면 403이다', async (method, path) => {
    const result = await requireOpsInboxSubmit(makeRequest(method, path))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })

  it('틀린 토큰·토큰 없음은 세션이 없으면 403이다', async () => {
    for (const token of ['wrong', null]) {
      const result = await requireOpsInboxSubmit(makeRequest('POST', '/api/admin/ops-inbox', token))
      expect(result.ok).toBe(false)
    }
  })

  it('환경변수가 없으면 올바른 값을 보내도 403이다', async () => {
    delete process.env.ADMIN_API_READ_TOKEN
    const result = await requireOpsInboxSubmit(makeRequest('POST', '/api/admin/ops-inbox'))
    expect(result.ok).toBe(false)
  })

  it('관리자 세션이면 토큰 없이 통과하고 관리자 ID를 돌려준다', async () => {
    session.user = { id: 'admin-id', email: 'admin@example.com' }
    expect(await requireOpsInboxSubmit(makeRequest('POST', '/api/admin/ops-inbox', null))).toEqual({
      ok: true,
      via: 'admin',
      adminId: 'admin-id',
    })
  })
})
