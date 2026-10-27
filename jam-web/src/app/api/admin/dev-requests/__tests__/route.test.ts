/**
 * GET·POST /api/admin/dev-requests, PATCH /api/admin/dev-requests/[id] (티켓 20261026_2027 1회차)
 *
 * 저장소(`store`)는 메모리 안의 가짜로 바꾸고(저장소 자체는 `store.test.ts`가 시험한다) 인증·응답 모양만 시험한다.
 * 지키는 것:
 * - GET: 읽기 토큰·세션 모두 통과, 기본은 requested, status 쿼리 전달, 잘못된 status는 400, `created_by` 없음, `id`는 세션 응답에만, 캐시 안 함
 * - POST·PATCH: 읽기 토큰으로는 거부(403), 세션으로는 201·200, 400·404·409, 저장소 실패 500(내부 메시지 없음)
 *
 * 실행: cd jam-web && npx vitest run src/app/api/admin/dev-requests/__tests__/route.test.ts
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  requests: [] as Array<Record<string, unknown>>,
  user: null as { id: string; email: string } | null,
  listCalls: [] as Array<Record<string, unknown>>,
  failList: false,
  failWrite: false,
  createResult: null as Record<string, unknown> | null,
  updateResult: null as Record<string, unknown> | null,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({}),
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
}))

vi.mock('@/lib/admin/devRequests/store', () => ({
  listDevRequests: async (_service: unknown, options: { status: string }) => {
    h.listCalls.push(options)
    if (h.failList) throw new Error('relation secret_table exploded')
    return h.requests
  },
  createDevRequest: async () => {
    if (h.failWrite) throw new Error('relation secret_table exploded')
    return h.createResult
  },
  updateDevRequest: async () => {
    if (h.failWrite) throw new Error('relation secret_table exploded')
    return h.updateResult
  },
}))

import { GET, POST } from '../route'
import { PATCH } from '../[id]/route'
import { DEV_REQUEST_MAX_BODY_BYTES } from '@/lib/admin/devRequests/constants'

const TOKEN = 'test-admin-read-token-abcdef'
const URL_BASE = 'http://localhost/api/admin/dev-requests'
const ID = '11111111-1111-4111-8111-111111111111'
const ENV_KEYS = ['ADMIN_API_READ_TOKEN', 'ADMIN_EMAILS'] as const

const SAVED = {
  id: ID,
  no: 1,
  title: '확률 고정값을 설정으로',
  detail: '',
  origin: 'eco',
  policyId: 'ch19-kpi-1',
  status: 'requested',
  ticketId: null,
  createdAt: '2026-10-27T00:00:00.000Z',
}

function request(method: string, options: { token?: boolean; query?: string; body?: unknown; raw?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (options.token) headers['x-admin-read-token'] = TOKEN
  const hasBody = method !== 'GET'
  return new Request(`${URL_BASE}${options.query ?? ''}`, {
    method,
    headers,
    body: hasBody ? (options.raw ?? JSON.stringify(options.body ?? {})) : undefined,
  })
}

function patch(id: string, options: Parameters<typeof request>[1] = {}) {
  return PATCH(request('PATCH', options), { params: Promise.resolve({ id }) })
}

const ADMIN = { id: 'admin-1', email: 'admin@example.com' }

describe('/api/admin/dev-requests', () => {
  const saved: Record<string, string | undefined> = {}
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    for (const key of ENV_KEYS) saved[key] = process.env[key]
    process.env.ADMIN_API_READ_TOKEN = TOKEN
    process.env.ADMIN_EMAILS = 'admin@example.com'
    h.requests = [{ ...SAVED, created_by: 'admin-1' }]
    h.user = null
    h.listCalls = []
    h.failList = false
    h.failWrite = false
    h.createResult = { ok: true, request: SAVED }
    h.updateResult = { ok: true, request: { ...SAVED, status: 'dismissed' } }
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  })

  describe('GET', () => {
    it('토큰도 세션도 없으면 403', async () => {
      expect((await GET(request('GET'))).status).toBe(403)
    })

    it('틀린 토큰이면 403', async () => {
      const req = new Request(URL_BASE, { headers: { 'x-admin-read-token': 'wrong' } })
      expect((await GET(req)).status).toBe(403)
    })

    it('읽기 토큰은 통과하고 created_by·id 없이 정해진 칸만 받는다', async () => {
      const res = await GET(request('GET', { token: true }))
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toBe('no-store')
      const body = await res.json()
      expect(body).toEqual({
        requests: [
          {
            no: 1,
            title: '확률 고정값을 설정으로',
            detail: '',
            origin: 'eco',
            policyId: 'ch19-kpi-1',
            status: 'requested',
            ticketId: null,
            createdAt: '2026-10-27T00:00:00.000Z',
          },
        ],
      })
      expect(JSON.stringify(body)).not.toContain('created_by')
      expect(h.listCalls[0]).toEqual({ status: 'requested' })
    })

    it('관리자 세션 응답에는 id가 있고, 읽기 토큰 응답에는 없다', async () => {
      h.user = ADMIN
      const session = await (await GET(request('GET'))).json()
      expect(session.requests[0].id).toBe(ID)
      expect(JSON.stringify(session)).not.toContain('created_by')

      h.user = null
      const token = await (await GET(request('GET', { token: true }))).json()
      expect(token.requests[0]).not.toHaveProperty('id')
    })

    it('관리자 세션도 통과하고 status 쿼리를 저장소에 넘긴다', async () => {
      h.user = ADMIN
      for (const status of ['requested', 'ticketed', 'dismissed', 'all']) {
        expect((await GET(request('GET', { query: `?status=${status}` }))).status).toBe(200)
      }
      expect(h.listCalls.map((c) => c.status)).toEqual(['requested', 'ticketed', 'dismissed', 'all'])
    })

    it('허용되지 않은 status는 400', async () => {
      const res = await GET(request('GET', { token: true, query: '?status=done' }))
      expect(res.status).toBe(400)
      expect(h.listCalls).toHaveLength(0)
    })

    it('읽기 실패는 500이고 내부 메시지를 싣지 않는다', async () => {
      h.failList = true
      const res = await GET(request('GET', { token: true }))
      expect(res.status).toBe(500)
      expect(JSON.stringify(await res.json())).not.toContain('secret_table')
    })
  })

  describe('POST', () => {
    const BODY = { title: '확률 고정값을 설정으로', origin: 'eco', policyId: 'ch19-kpi-1' }

    it('읽기 토큰만으로는 403', async () => {
      expect((await POST(request('POST', { token: true, body: BODY }))).status).toBe(403)
    })

    it('세션이 없으면 403', async () => {
      expect((await POST(request('POST', { body: BODY }))).status).toBe(403)
    })

    it('세션으로 등록하면 201 { request }', async () => {
      h.user = ADMIN
      const res = await POST(request('POST', { body: BODY }))
      expect(res.status).toBe(201)
      expect(res.headers.get('cache-control')).toBe('no-store')
      const body = await res.json()
      expect(body.request).toMatchObject({ no: 1, policyId: 'ch19-kpi-1' })
      expect(JSON.stringify(body)).not.toContain('created_by')
    })

    it('형식이 틀리면 400 + details', async () => {
      h.user = ADMIN
      const res = await POST(request('POST', { body: { title: '', origin: 'x' } }))
      expect(res.status).toBe(400)
      expect((await res.json()).details.length).toBeGreaterThan(0)
    })

    it('JSON이 아니거나 16KB를 넘으면 400', async () => {
      h.user = ADMIN
      expect((await POST(request('POST', { raw: '{not json' }))).status).toBe(400)
      const big = { ...BODY, pad: 'x'.repeat(DEV_REQUEST_MAX_BODY_BYTES) }
      expect((await POST(request('POST', { body: big }))).status).toBe(400)
    })

    it('같은 정책의 열린 요청이 있으면 409와 그 번호', async () => {
      h.user = ADMIN
      h.createResult = { ok: false, code: 'duplicate_open', existingNo: 7 }
      const res = await POST(request('POST', { body: BODY }))
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.existingNo).toBe(7)
      expect(body.error).toContain('7번')
    })

    it('저장 실패는 500이고 내부 메시지를 싣지 않는다', async () => {
      h.user = ADMIN
      h.failWrite = true
      const res = await POST(request('POST', { body: BODY }))
      expect(res.status).toBe(500)
      expect(JSON.stringify(await res.json())).not.toContain('secret_table')
    })
  })

  describe('PATCH', () => {
    it('읽기 토큰만으로는 403', async () => {
      expect((await patch(ID, { token: true, body: { status: 'dismissed' } })).status).toBe(403)
    })

    it('세션이 없으면 403', async () => {
      expect((await patch(ID, { body: { status: 'dismissed' } })).status).toBe(403)
    })

    it('UUID가 아닌 id는 404', async () => {
      h.user = ADMIN
      expect((await patch('not-a-uuid', { body: { status: 'dismissed' } })).status).toBe(404)
    })

    it('세션으로 접으면 200 { request }', async () => {
      h.user = ADMIN
      const res = await patch(ID, { body: { status: 'dismissed' } })
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect((await res.json()).request).toMatchObject({ id: ID, status: 'dismissed' })
    })

    it('본문이 비었거나 ticketed거나 JSON이 아니면 400', async () => {
      h.user = ADMIN
      expect((await patch(ID, { body: {} })).status).toBe(400)
      expect((await patch(ID, { body: { status: 'ticketed' } })).status).toBe(400)
      expect((await patch(ID, { raw: '{not json' })).status).toBe(400)
    })

    it('없는 행이면 404', async () => {
      h.user = ADMIN
      h.updateResult = { ok: false, code: 'not_found' }
      expect((await patch(ID, { body: { status: 'dismissed' } })).status).toBe(404)
    })

    it('저장 실패는 500이고 내부 메시지를 싣지 않는다', async () => {
      h.user = ADMIN
      h.failWrite = true
      const res = await patch(ID, { body: { status: 'dismissed' } })
      expect(res.status).toBe(500)
      expect(JSON.stringify(await res.json())).not.toContain('secret_table')
    })
  })
})
