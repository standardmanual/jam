/**
 * 운영 묶음 제출 경로의 토큰 쓰기 예외 (티켓 20260930_1816)
 *
 * `isOpsInboxTokenRequest`는 읽기 토큰으로 쓰기가 열리는 **유일한** 판정이다. 지키는 것:
 * 1. POST + 경로가 정확히 `/api/admin/ops-inbox` 또는 `/api/admin/ops-inbox/routine-start`(티켓 20261026_2032) + 맞는 토큰일 때만 true
 * 2. 다른 메서드, 다른 어드민 경로, 경로에 무언가 붙은 것(`/x`, `x`, 끝 `/`), 틀린 토큰, 환경변수 미설정은 false
 * 3. 기존 `requireAdminRead`는 여전히 토큰 POST를 거부한다(제출용 판정과 섞이지 않는다)
 */
import { vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
  createServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  }),
}))

import { isOpsInboxTokenRequest, requireAdminRead } from '../auth'
import { OPS_INBOX_METHOD, OPS_INBOX_PATH, OPS_INBOX_TOKEN_WRITE_PATHS, OPS_ROUTINE_START_PATH } from '../opsInbox/constants'

const TOKEN = 'test-admin-read-token-abcdef'

describe('isOpsInboxTokenRequest', () => {
  const original = process.env.ADMIN_API_READ_TOKEN

  beforeEach(() => {
    process.env.ADMIN_API_READ_TOKEN = TOKEN
  })

  afterEach(() => {
    if (original === undefined) delete process.env.ADMIN_API_READ_TOKEN
    else process.env.ADMIN_API_READ_TOKEN = original
  })

  it('상수가 제출 경로·메서드를 가리킨다(경로 문자열이 바뀌면 이 테스트가 먼저 알린다)', () => {
    expect(OPS_INBOX_PATH).toBe('/api/admin/ops-inbox')
    expect(OPS_INBOX_METHOD).toBe('POST')
  })

  it('토큰 쓰기가 열린 경로는 정확히 두 개다(늘리면 이 테스트가 먼저 알린다)', () => {
    expect(OPS_ROUTINE_START_PATH).toBe('/api/admin/ops-inbox/routine-start')
    expect([...OPS_INBOX_TOKEN_WRITE_PATHS]).toEqual(['/api/admin/ops-inbox', '/api/admin/ops-inbox/routine-start'])
  })

  it('POST + 정확한 경로 + 맞는 토큰이면 true', () => {
    expect(isOpsInboxTokenRequest('POST', '/api/admin/ops-inbox', TOKEN)).toBe(true)
  })

  it('POST + 루틴 시작 기록 경로 + 맞는 토큰이면 true', () => {
    expect(isOpsInboxTokenRequest('POST', '/api/admin/ops-inbox/routine-start', TOKEN)).toBe(true)
  })

  it.each(['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'post'])(
    '루틴 시작 기록 경로라도 %s는 false(토큰으로 열리는 메서드는 POST 하나)',
    (method) => {
      expect(isOpsInboxTokenRequest(method, '/api/admin/ops-inbox/routine-start', TOKEN)).toBe(false)
    }
  )

  it.each([
    '/api/admin/ops-inbox/routine-start/',
    '/api/admin/ops-inbox/routine-start/x',
    '/api/admin/ops-inbox/routine-startx',
    '/api/admin/ops-inbox/routine-star',
    '/api/admin/ops-inbox/routine-start%2Fx',
    '/api/admin/ops-inbox//routine-start',
    '/api/admin/ops-inbox/Routine-Start',
    '/api/admin/routine-start',
    '/api/admin/ops-inbox/routine-start?x=1',
    '/api/admin/ops-inbox/routine-start#x',
  ])('POST + 맞는 토큰이라도 루틴 시작 기록과 비슷한 경로 %j는 false', (pathname) => {
    expect(isOpsInboxTokenRequest('POST', pathname, TOKEN)).toBe(false)
  })

  it('루틴 시작 기록 경로도 틀린 토큰·빈 토큰·환경변수 미설정이면 false', () => {
    expect(isOpsInboxTokenRequest('POST', '/api/admin/ops-inbox/routine-start', 'wrong')).toBe(false)
    expect(isOpsInboxTokenRequest('POST', '/api/admin/ops-inbox/routine-start', null)).toBe(false)
    expect(isOpsInboxTokenRequest('POST', '/api/admin/ops-inbox/routine-start', '')).toBe(false)
    delete process.env.ADMIN_API_READ_TOKEN
    expect(isOpsInboxTokenRequest('POST', '/api/admin/ops-inbox/routine-start', TOKEN)).toBe(false)
  })

  it.each(['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'post'])(
    '제출 경로라도 %s는 false(토큰으로 열리는 메서드는 POST 하나)',
    (method) => {
      expect(isOpsInboxTokenRequest(method, '/api/admin/ops-inbox', TOKEN)).toBe(false)
    }
  )

  it.each([
    '/api/admin/missions',
    '/api/admin/users',
    '/api/admin/badges/bulk',
    '/api/admin/asset-generator/presets',
    '/api/admin',
    '/api/admin/',
    '/api/admin/ops-inbox/x',
    '/api/admin/ops-inbox/',
    '/api/admin/ops-inbox/bulk',
    '/api/admin/ops-inboxx',
    '/api/admin/ops-inbo',
    '/api/admin/ops-inbox%2Fx',
    '/api/admin//ops-inbox',
    '//api/admin/ops-inbox',
    '/API/ADMIN/OPS-INBOX',
    '/api/other/ops-inbox',
    '/admin/ops-inbox',
    '',
  ])('POST + 맞는 토큰이라도 경로 %j는 false(접두사가 아니라 정확 일치)', (pathname) => {
    expect(isOpsInboxTokenRequest('POST', pathname, TOKEN)).toBe(false)
  })

  it('틀린 토큰이면 false', () => {
    expect(isOpsInboxTokenRequest('POST', '/api/admin/ops-inbox', 'wrong-token')).toBe(false)
  })

  it('토큰이 없거나 비어 있으면 false', () => {
    expect(isOpsInboxTokenRequest('POST', '/api/admin/ops-inbox', null)).toBe(false)
    expect(isOpsInboxTokenRequest('POST', '/api/admin/ops-inbox', undefined)).toBe(false)
    expect(isOpsInboxTokenRequest('POST', '/api/admin/ops-inbox', '')).toBe(false)
  })

  it('환경변수 미설정이면 올바른 값을 보내도 false', () => {
    delete process.env.ADMIN_API_READ_TOKEN
    expect(isOpsInboxTokenRequest('POST', '/api/admin/ops-inbox', TOKEN)).toBe(false)
  })
})

describe('requireAdminRead는 제출 경로 예외에 영향받지 않는다', () => {
  const original = process.env.ADMIN_API_READ_TOKEN

  beforeEach(() => {
    process.env.ADMIN_API_READ_TOKEN = TOKEN
  })

  afterEach(() => {
    if (original === undefined) delete process.env.ADMIN_API_READ_TOKEN
    else process.env.ADMIN_API_READ_TOKEN = original
  })

  it('제출 경로로 보낸 토큰 POST도 requireAdminRead는 거부한다(403)', async () => {
    const req = new Request('http://localhost/api/admin/ops-inbox', {
      method: 'POST',
      headers: { 'x-admin-read-token': TOKEN },
    })
    const res = await requireAdminRead(req)
    expect(res?.status).toBe(403)
  })
})
