/**
 * GET·POST /api/admin/ops-trend-sources, PATCH /api/admin/ops-trend-sources/[id] (티켓 20261026_2033 1회차)
 *
 * 저장소(`sourceStore`)는 메모리 안의 가짜로 바꾸고(저장소 자체는 `sourceStore.test.ts`가 시험한다) 인증·응답 모양만 시험한다.
 * 지키는 것:
 * - GET: 읽기 토큰은 켜진 출처만·`no/name/kind/location`만(`id`·`enabled` 없음), 세션은 includeDisabled로 전부·`created_by` 없음
 * - POST·PATCH: 읽기 토큰으로는 거부(403), 세션으로는 201·200, 400·404·409, 저장소 실패 500(내부 메시지 없음)
 * - 저장소 폴더 종류: POST는 허용 폴더면 201·목록 밖이면 400, PATCH는 저장소의 `folder_not_allowed`를 400으로 바꾼다
 *
 * 실행: cd jam-web && npx vitest run src/app/api/admin/ops-trend-sources/__tests__/route.test.ts
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

type Source = {
  id: string
  no: number
  name: string
  kind: string
  location: string
  enabled: boolean
  createdAt: string
  lastReadAt: string | null
}

const h = vi.hoisted(() => ({
  sources: [] as Array<Record<string, unknown>>,
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

vi.mock('@/lib/admin/opsTrends/sourceStore', () => ({
  listTrendSources: async (_service: unknown, options: { includeDisabled: boolean; withLastReadAt?: boolean }) => {
    h.listCalls.push(options)
    if (h.failList) throw new Error('relation secret_table exploded')
    return h.sources.filter((s) => options.includeDisabled || s.enabled)
  },
  createTrendSource: async () => {
    if (h.failWrite) throw new Error('relation secret_table exploded')
    return h.createResult
  },
  updateTrendSource: async () => {
    if (h.failWrite) throw new Error('relation secret_table exploded')
    return h.updateResult
  },
}))

import { GET, POST } from '../route'
import { PATCH } from '../[id]/route'
import { OPS_TREND_SOURCE_MAX_BODY_BYTES } from '@/lib/admin/opsTrends/constants'

const TOKEN = 'test-admin-read-token-abcdef'
const URL_BASE = 'http://localhost/api/admin/ops-trend-sources'
const ID = '11111111-1111-4111-8111-111111111111'
const ENV_KEYS = ['ADMIN_API_READ_TOKEN', 'ADMIN_EMAILS'] as const

const SAVED: Source = {
  id: ID,
  no: 1,
  name: '러닝 해시태그',
  kind: 'hashtag',
  location: '#러닝',
  enabled: true,
  createdAt: '2026-10-27T00:00:00.000Z',
  lastReadAt: null,
}

function row(overrides: Partial<Source> = {}) {
  return { ...SAVED, created_by: 'admin-1', ...overrides }
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

describe('/api/admin/ops-trend-sources', () => {
  const saved: Record<string, string | undefined> = {}
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    for (const key of ENV_KEYS) saved[key] = process.env[key]
    process.env.ADMIN_API_READ_TOKEN = TOKEN
    process.env.ADMIN_EMAILS = 'admin@example.com'
    h.sources = [row({ no: 1 }), row({ id: 'other', no: 2, name: '꺼진 출처', enabled: false })]
    h.user = null
    h.listCalls = []
    h.failList = false
    h.failWrite = false
    h.createResult = { ok: true, source: { ...SAVED, lastReadAt: undefined } }
    h.updateResult = { ok: true, source: { ...SAVED, enabled: false } }
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

    it('읽기 토큰은 켜진 출처만, no·name·kind·location만 받는다', async () => {
      const res = await GET(request('GET', { token: true }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ sources: [{ no: 1, name: '러닝 해시태그', kind: 'hashtag', location: '#러닝' }] })
      expect(h.listCalls[0]).toMatchObject({ includeDisabled: false, withLastReadAt: false })
    })

    it('읽기 토큰은 includeDisabled=true를 보내도 무시된다', async () => {
      const res = await GET(request('GET', { token: true, query: '?includeDisabled=true' }))
      const body = await res.json()
      expect(body.sources).toHaveLength(1)
      expect(body.sources[0]).not.toHaveProperty('id')
      expect(body.sources[0]).not.toHaveProperty('enabled')
      expect(h.listCalls[0].includeDisabled).toBe(false)
    })

    it('관리자 세션은 기본이 켜진 출처이고 전체 칸을 받는다(created_by 없음)', async () => {
      h.user = { id: 'admin-1', email: 'admin@example.com' }
      const res = await GET(request('GET'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.sources).toEqual([SAVED])
      expect(JSON.stringify(body)).not.toContain('created_by')
      expect(h.listCalls[0]).toMatchObject({ includeDisabled: false, withLastReadAt: true })
    })

    it('관리자 세션은 includeDisabled=true로 꺼진 출처까지 받는다', async () => {
      h.user = { id: 'admin-1', email: 'admin@example.com' }
      const body = await (await GET(request('GET', { query: '?includeDisabled=true' }))).json()
      expect(body.sources).toHaveLength(2)
    })

    it('읽기 실패는 500이고 내부 메시지를 싣지 않는다', async () => {
      h.failList = true
      const res = await GET(request('GET', { token: true }))
      expect(res.status).toBe(500)
      expect(JSON.stringify(await res.json())).not.toContain('secret_table')
    })
  })

  describe('POST', () => {
    const BODY = { name: '러닝 해시태그', kind: 'hashtag', location: '#러닝' }

    it('읽기 토큰만으로는 403', async () => {
      expect((await POST(request('POST', { token: true, body: BODY }))).status).toBe(403)
    })

    it('세션이 없으면 403', async () => {
      expect((await POST(request('POST', { body: BODY }))).status).toBe(403)
    })

    it('세션으로 등록하면 201 { source }', async () => {
      h.user = { id: 'admin-1', email: 'admin@example.com' }
      const res = await POST(request('POST', { body: BODY }))
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.source).toMatchObject({ no: 1, name: '러닝 해시태그' })
      expect(JSON.stringify(body)).not.toContain('created_by')
    })

    it('형식이 틀리면 400 + details', async () => {
      h.user = { id: 'admin-1', email: 'admin@example.com' }
      const res = await POST(request('POST', { body: { name: '', kind: 'x' } }))
      expect(res.status).toBe(400)
      expect((await res.json()).details.length).toBeGreaterThan(0)
    })

    it('저장소 폴더는 허용 폴더면 201', async () => {
      h.user = { id: 'admin-1', email: 'admin@example.com' }
      const body = { name: '트렌드 리서치', kind: 'repo_folder', location: 'docs/operations/trendresearch/' }
      h.createResult = { ok: true, source: { ...SAVED, ...body } }
      const res = await POST(request('POST', { body }))
      expect(res.status).toBe(201)
      expect((await res.json()).source).toMatchObject({ kind: 'repo_folder', location: 'docs/operations/trendresearch/' })
    })

    it.each(['', 'docs/tickets/', '../x/', '/etc/', 'docs\\operations\\trendresearch\\'])(
      '저장소 폴더의 위치가 「%s」이면 400이고 details에 위치 오류가 든다',
      async (location) => {
        h.user = { id: 'admin-1', email: 'admin@example.com' }
        const res = await POST(request('POST', { body: { name: '트렌드 리서치', kind: 'repo_folder', location } }))
        expect(res.status).toBe(400)
        expect((await res.json()).details).toEqual(['location: 정해 둔 폴더 중에서 골라 주세요.'])
      }
    )

    it('JSON이 아니거나 8KB를 넘으면 400', async () => {
      h.user = { id: 'admin-1', email: 'admin@example.com' }
      expect((await POST(request('POST', { raw: '{not json' }))).status).toBe(400)
      const big = { ...BODY, pad: 'x'.repeat(OPS_TREND_SOURCE_MAX_BODY_BYTES) }
      expect((await POST(request('POST', { body: big }))).status).toBe(400)
    })

    it('이름이 겹치면 409', async () => {
      h.user = { id: 'admin-1', email: 'admin@example.com' }
      h.createResult = { ok: false, code: 'duplicate' }
      expect((await POST(request('POST', { body: BODY }))).status).toBe(409)
    })

    it('저장 실패는 500이고 내부 메시지를 싣지 않는다', async () => {
      h.user = { id: 'admin-1', email: 'admin@example.com' }
      h.failWrite = true
      const res = await POST(request('POST', { body: BODY }))
      expect(res.status).toBe(500)
      expect(JSON.stringify(await res.json())).not.toContain('secret_table')
    })
  })

  describe('PATCH', () => {
    it('읽기 토큰만으로는 403', async () => {
      expect((await patch(ID, { token: true, body: { enabled: false } })).status).toBe(403)
    })

    it('세션이 없으면 403', async () => {
      expect((await patch(ID, { body: { enabled: false } })).status).toBe(403)
    })

    it('UUID가 아닌 id는 404', async () => {
      h.user = { id: 'admin-1', email: 'admin@example.com' }
      expect((await patch('not-a-uuid', { body: { enabled: false } })).status).toBe(404)
    })

    it('세션으로 끄면 200 { source }', async () => {
      h.user = { id: 'admin-1', email: 'admin@example.com' }
      const res = await patch(ID, { body: { enabled: false } })
      expect(res.status).toBe(200)
      expect((await res.json()).source).toMatchObject({ id: ID, enabled: false })
    })

    it('본문이 비었거나 틀리면 400', async () => {
      h.user = { id: 'admin-1', email: 'admin@example.com' }
      expect((await patch(ID, { body: {} })).status).toBe(400)
      expect((await patch(ID, { body: { enabled: 'yes' } })).status).toBe(400)
      expect((await patch(ID, { raw: '{not json' })).status).toBe(400)
    })

    it('이름이 겹치면 409, 없는 행이면 404', async () => {
      h.user = { id: 'admin-1', email: 'admin@example.com' }
      h.updateResult = { ok: false, code: 'duplicate' }
      expect((await patch(ID, { body: { name: '겹침' } })).status).toBe(409)
      h.updateResult = { ok: false, code: 'not_found' }
      expect((await patch(ID, { body: { enabled: false } })).status).toBe(404)
    })

    it('종류에 비해 위치가 비면 400', async () => {
      h.user = { id: 'admin-1', email: 'admin@example.com' }
      h.updateResult = { ok: false, code: 'location_required' }
      const res = await patch(ID, { body: { location: '' } })
      expect(res.status).toBe(400)
      expect((await res.json()).details[0]).toContain('location')
    })

    it('저장소 폴더 출처의 위치가 허용 폴더 밖이면 400이고 details에 위치 오류가 든다', async () => {
      h.user = { id: 'admin-1', email: 'admin@example.com' }
      h.updateResult = { ok: false, code: 'folder_not_allowed' }
      const res = await patch(ID, { body: { location: 'docs/tickets/' } })
      expect(res.status).toBe(400)
      expect((await res.json()).details).toEqual(['location: 정해 둔 폴더 중에서 골라 주세요.'])
    })

    it('저장소 폴더 출처의 위치를 허용 폴더로 바꾸면 200', async () => {
      h.user = { id: 'admin-1', email: 'admin@example.com' }
      const saved = { ...SAVED, kind: 'repo_folder', location: 'docs/operations/trendresearch/' }
      h.updateResult = { ok: true, source: saved }
      const res = await patch(ID, { body: { location: 'docs/operations/trendresearch/' } })
      expect(res.status).toBe(200)
      expect((await res.json()).source).toMatchObject({ kind: 'repo_folder', location: 'docs/operations/trendresearch/' })
    })

    it('저장 실패는 500이고 내부 메시지를 싣지 않는다', async () => {
      h.user = { id: 'admin-1', email: 'admin@example.com' }
      h.failWrite = true
      const res = await patch(ID, { body: { enabled: false } })
      expect(res.status).toBe(500)
      expect(JSON.stringify(await res.json())).not.toContain('secret_table')
    })
  })
})
