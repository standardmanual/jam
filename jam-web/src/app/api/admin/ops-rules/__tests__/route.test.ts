/**
 * GET·PATCH /api/admin/ops-rules (티켓 20260930_1459 조각 B·C)
 *
 * 규칙 저장·검증의 처리는 `opsInbox/balance/__tests__/save.test.ts`가 지킨다. 여기서는 라우트가 맡은 것만 본다. 인증은 실제 `@/lib/admin/auth`를
 * 쓰고(세션·읽기 토큰만 모의한다), 처리 함수(`listOpsRules`·`saveOpsRule`·`listSignalThresholds`)는 모의한다:
 * - GET: 읽기 토큰만으로도 읽힌다(관리자 세션도 된다). 토큰이 틀리거나 없고 세션도 없으면 403. `group`은 balance(기본)·signal만, 그 밖은 400.
 *   `group=signal`은 기준값 25개의 현재 값을 돌려주고(조각 C) 응답에 관리자 사용자 ID가 없다. 조회가 실패하면 고정 문장 500이고 원문은 싣지 않는다
 * - PATCH: 읽기 토큰만으로는 막힌다(403, 처리 함수를 부르지 않는다). 관리자 세션만 통과하고 행위자는 관리자 ID다. 본문 형식 오류는 400,
 *   처리 실패(400 칸별 오류·404·409·500)는 상태와 본문을 그대로 돌려준다
 * 두 파일이 각자 GET만, PATCH만 export하는지는 `admin/__tests__/token-write-contract.test.ts`가 소스로 지킨다.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  listOpsRules: vi.fn(),
  saveOpsRule: vi.fn(),
  listSignalThresholds: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
  createServiceClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }),
}))
vi.mock('@/lib/admin/opsInbox/balance/save', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/opsInbox/balance/save')>()
  return { ...actual, listOpsRules: h.listOpsRules, saveOpsRule: h.saveOpsRule }
})

vi.mock('@/lib/admin/opsSignals/saveThresholds', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/opsSignals/saveThresholds')>()
  return { ...actual, listSignalThresholds: h.listSignalThresholds }
})

import { GET } from '../route'
import { PATCH } from '../[ruleKey]/route'

const TOKEN = 'test-admin-read-token-abcdef'
const ADMIN = { id: 'admin-1', email: 'admin@example.com' }
const ENV_KEYS = ['ADMIN_API_READ_TOKEN', 'ADMIN_EMAILS'] as const
const RULES = [{ ruleKey: 'open_collections_max', group: 'balance', value: { max: 6, provisional: true }, level: 'warn', enabled: true }]
const THRESHOLDS = [
  {
    ruleKey: 'approvalDeadlineHours',
    group: 'signal',
    signal: 'approval_deadline',
    readOnly: false,
    value: 36,
    defaultValue: 48,
    changed: true,
    unreadable: false,
    previousValue: 48,
    updatedAt: '2026-10-01T06:20:00+00:00',
  },
]

function getRequest(query = '', headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/admin/ops-rules${query}`, { method: 'GET', headers })
}

function patchRequest(body: unknown, headers: Record<string, string> = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return new Request('http://localhost/api/admin/ops-rules/open_collections_max', { method: 'PATCH', headers, body: text })
}

const params = (ruleKey = 'open_collections_max') => ({ params: Promise.resolve({ ruleKey }) })

const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key]
  process.env.ADMIN_API_READ_TOKEN = TOKEN
  process.env.ADMIN_EMAILS = ADMIN.email
  h.user = null
  h.listOpsRules.mockReset()
  h.listOpsRules.mockResolvedValue(RULES)
  h.saveOpsRule.mockReset()
  h.saveOpsRule.mockResolvedValue({ ok: true, rule: RULES[0], changed: true })
  h.listSignalThresholds.mockReset()
  h.listSignalThresholds.mockResolvedValue(THRESHOLDS)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  vi.restoreAllMocks()
})

describe('GET /api/admin/ops-rules', () => {
  it('읽기 토큰만으로 읽힌다(세션 없음)', async () => {
    const res = await GET(getRequest('', { 'x-admin-read-token': TOKEN }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ group: 'balance', rules: RULES })
    expect(h.listOpsRules).toHaveBeenCalledWith(expect.anything(), 'balance')
  })

  it('관리자 세션으로도 읽힌다', async () => {
    h.user = ADMIN
    const res = await GET(getRequest())
    expect(res.status).toBe(200)
  })

  it('토큰이 틀리거나 없고 세션도 없으면 403이고 읽지 않는다', async () => {
    expect((await GET(getRequest('', { 'x-admin-read-token': 'wrong' }))).status).toBe(403)
    expect((await GET(getRequest())).status).toBe(403)
    expect(h.listOpsRules).not.toHaveBeenCalled()
  })

  it('환경변수에 토큰이 없으면 토큰으로 읽을 수 없다', async () => {
    delete process.env.ADMIN_API_READ_TOKEN
    expect((await GET(getRequest('', { 'x-admin-read-token': TOKEN }))).status).toBe(403)
  })

  it('group은 balance(기본)·signal만 받는다', async () => {
    const signal = await GET(getRequest('?group=signal', { 'x-admin-read-token': TOKEN }))
    expect(signal.status).toBe(200)
    expect(h.listSignalThresholds).toHaveBeenCalledTimes(1)
    expect(h.listOpsRules).not.toHaveBeenCalled()
    const bad = await GET(getRequest('?group=drop', { 'x-admin-read-token': TOKEN }))
    expect(bad.status).toBe(400)
    expect(h.listOpsRules).not.toHaveBeenCalled()
    expect(h.listSignalThresholds).toHaveBeenCalledTimes(1)
  })

  it('group=signal은 읽기 토큰으로 읽히고 기준값 25개의 현재 값을 돌려주며 관리자 사용자 ID가 없다(조각 C)', async () => {
    const res = await GET(getRequest('?group=signal', { 'x-admin-read-token': TOKEN }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ group: 'signal', rules: THRESHOLDS })
    expect(Object.keys(body.rules[0])).not.toContain('updatedBy')
    expect(Object.keys(body.rules[0])).not.toContain('updated_by')
    // 세션 없이 토큰도 없으면 막힌다
    expect((await GET(getRequest('?group=signal'))).status).toBe(403)
  })

  it('group=signal 조회가 실패해도 고정 문장 500이고 원문은 싣지 않는다', async () => {
    h.listSignalThresholds.mockRejectedValue(new Error('기준값 조회 실패: relation secret'))
    const res = await GET(getRequest('?group=signal', { 'x-admin-read-token': TOKEN }))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret')
  })

  it('조회가 실패하면 고정 문장 500이고 원문은 싣지 않는다', async () => {
    h.listOpsRules.mockRejectedValue(new Error('규칙 조회 실패: relation secret'))
    const res = await GET(getRequest('', { 'x-admin-read-token': TOKEN }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('규칙을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.')
    expect(JSON.stringify(body)).not.toContain('secret')
  })
})

describe('PATCH /api/admin/ops-rules/[ruleKey]', () => {
  it('읽기 토큰만으로는 막힌다(403, 저장하지 않는다)', async () => {
    const res = await PATCH(patchRequest({ enabled: false, expectedUpdatedAt: 't' }, { 'x-admin-read-token': TOKEN }), params())
    expect(res.status).toBe(403)
    expect(h.saveOpsRule).not.toHaveBeenCalled()
  })

  it('세션이 없으면 403이다', async () => {
    expect((await PATCH(patchRequest({ enabled: false, expectedUpdatedAt: 't' }), params())).status).toBe(403)
    expect(h.saveOpsRule).not.toHaveBeenCalled()
  })

  it('관리자 세션이어도 이메일·is_admin 권한이 없으면 403이다', async () => {
    h.user = { id: 'user-2', email: 'someone@example.com' }
    expect((await PATCH(patchRequest({ enabled: false, expectedUpdatedAt: 't' }), params())).status).toBe(403)
    expect(h.saveOpsRule).not.toHaveBeenCalled()
  })

  it('관리자는 규칙 키와 본문 칸을 처리 함수에 넘기고(행위자는 관리자 ID) 200 { rule, changed }를 받는다', async () => {
    h.user = ADMIN
    const res = await PATCH(
      patchRequest({ value: { max: 9, provisional: false }, level: 'info', enabled: false, expectedUpdatedAt: '2026-10-01T05:00:00+00:00' }),
      params()
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ rule: RULES[0], changed: true })
    expect(h.saveOpsRule).toHaveBeenCalledWith(expect.anything(), {
      ruleKey: 'open_collections_max',
      value: { max: 9, provisional: false },
      level: 'info',
      enabled: false,
      expectedUpdatedAt: '2026-10-01T05:00:00+00:00',
      actor: ADMIN.id,
    })
  })

  it('본문에 없는 칸은 undefined로 넘긴다(값은 그대로 둔다)', async () => {
    h.user = ADMIN
    await PATCH(patchRequest({ enabled: false, expectedUpdatedAt: 't' }), params())
    const input = h.saveOpsRule.mock.calls[0][1]
    expect(input.value).toBeUndefined()
    expect(input.level).toBeUndefined()
  })

  it('JSON이 아니거나 객체가 아니거나 너무 크면 400이다', async () => {
    h.user = ADMIN
    expect((await PATCH(patchRequest('{not json'), params())).status).toBe(400)
    expect((await PATCH(patchRequest('[1,2]'), params())).status).toBe(400)
    expect((await PATCH(patchRequest('null'), params())).status).toBe(400)
    expect((await PATCH(patchRequest({ enabled: true, expectedUpdatedAt: 'x'.repeat(20_000) }), params())).status).toBe(400)
    expect(h.saveOpsRule).not.toHaveBeenCalled()
  })

  it('처리 실패는 상태와 본문(error, fieldErrors)을 그대로 돌려준다', async () => {
    h.user = ADMIN
    h.saveOpsRule.mockResolvedValueOnce({ ok: false, status: 400, error: '값을 확인해 주세요.', fieldErrors: { max: '값을 적어 주세요' } })
    const bad = await PATCH(patchRequest({ value: {}, expectedUpdatedAt: 't' }), params())
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: '값을 확인해 주세요.', fieldErrors: { max: '값을 적어 주세요' } })

    h.saveOpsRule.mockResolvedValueOnce({ ok: false, status: 409, error: '그사이 바뀌었어요' })
    const conflict = await PATCH(patchRequest({ enabled: false, expectedUpdatedAt: 'old' }), params())
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toEqual({ error: '그사이 바뀌었어요' })

    h.saveOpsRule.mockResolvedValueOnce({ ok: false, status: 404, error: '찾을 수 없는 규칙이에요.' })
    expect((await PATCH(patchRequest({ enabled: false, expectedUpdatedAt: 't' }), params('nope'))).status).toBe(404)
    expect(h.saveOpsRule.mock.calls.at(-1)?.[1].ruleKey).toBe('nope')

    h.saveOpsRule.mockResolvedValueOnce({ ok: false, status: 500, error: '규칙을 저장하지 못했어요.' })
    expect((await PATCH(patchRequest({ enabled: false, expectedUpdatedAt: 't' }), params())).status).toBe(500)
  })
})
