/**
 * POST /api/admin/ops-patterns, PATCH /api/admin/ops-patterns/[patternNo] (티켓 20261008_1545, 상위 20260930_1503 ⑩a-1)
 *
 * 인증은 실제 `@/lib/admin/auth`를 쓰고(세션만 모의한다), 쓰기 함수(`lib/admin/opsPatterns/write.ts`)도 모의하지 않는다. 서비스 클라이언트만
 * 메모리 DB(`opsPatterns/__tests__/fakePatternDb.ts`)로 바꿔서 라우트 → 쓰기 함수 → 응답 본문까지 실제 코드로 지나가게 한다.
 * 검사·번호·409 규칙 자체는 `write.test.ts`가 지킨다. 여기서는 라우트가 맡은 것만 본다:
 * - 쓰기는 관리자 세션만: 세션이 없으면 403(읽기 토큰만 있어도 403)이고 DB를 건드리지 않는다
 * - 본문 오류: JSON 아님·객체 아님·64KB 초과는 400, 내용 검사 실패는 400과 칸별 `fieldErrors`
 * - POST 201 `{ pattern }`(P19, 응답에 관리자 ID 없음), 만든 패턴이 GET 목록에 바로 나온다
 * - PATCH 내용 고치기 200 `{ pattern, changed }`, 상태 바꾸기 200, 없는 번호·형식이 틀린 번호 404, 화면이 본 시각과 다르면 409
 * - PATCH `expectedUpdatedAt` 없음 400, 상태와 내용 칸을 섞으면 400
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { fakeDb, patternRow } from '@/lib/admin/opsPatterns/__tests__/fakePatternDb'

const h = vi.hoisted(() => ({ user: null as { id: string; email: string } | null }))

vi.mock('@/lib/supabase/server', async () => {
  const { fakeService } = await import('@/lib/admin/opsPatterns/__tests__/fakePatternDb')
  return {
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
    createServiceClient: () => fakeService,
  }
})

import { GET, POST } from '../route'
import { PATCH } from '../[patternNo]/route'

const TOKEN = 'test-admin-read-token-abcdef'
const ADMIN = { id: 'admin-1', email: 'admin@example.com' }
const ENV_KEYS = ['ADMIN_API_READ_TOKEN', 'ADMIN_EMAILS'] as const
const AUTH = { 'x-admin-read-token': TOKEN }
const T1 = '2026-10-01T01:00:00+00:00'

const params = (patternNo: string) => ({ params: Promise.resolve({ patternNo }) })

function content(extra: Record<string, unknown> = {}) {
  return {
    name: '새 패턴',
    principle: '작동 원리',
    userExperience: '유저가 겪는 것',
    menus: ['홈피드'],
    samples: [{ no: 3, name: '샘플', role: 'main', impl: '지금 가능' }],
    cardShapes: [{ shape: 'hero', note: '' }],
    knobs: {},
    pitfalls: '',
    ...extra,
  }
}

function postRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/admin/ops-patterns', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function patchRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/admin/ops-patterns/P10', {
    method: 'PATCH',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key]
  process.env.ADMIN_API_READ_TOKEN = TOKEN
  process.env.ADMIN_EMAILS = ADMIN.email
  h.user = ADMIN
  fakeDb.reset()
  fakeDb.tables.ops_patterns = [patternRow('P17'), patternRow('P18'), patternRow('P10', { updated_at: T1, origin: 'manual' })]
  fakeDb.tables.ops_pattern_taste_signals = []
  fakeDb.tables.ops_pattern_common_rules = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  vi.restoreAllMocks()
})

describe('POST /api/admin/ops-patterns', () => {
  it('관리자 세션이 없으면 403이고 DB를 건드리지 않는다. 읽기 토큰만으로는 쓸 수 없다', async () => {
    h.user = null
    expect((await POST(postRequest(content()))).status).toBe(403)
    expect((await POST(postRequest(content(), AUTH))).status).toBe(403)
    expect(fakeDb.writeCalls).toBe(0)
    expect(fakeDb.tables.ops_patterns).toHaveLength(3)
  })

  it('관리자 세션이면 201로 P19를 만든다. 번호·상태·출처는 서버가 정하고 응답에 관리자 ID가 없다', async () => {
    const res = await POST(postRequest(content({ patternNo: 'P01', status: 'archived', origin: 'seed' })))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(Object.keys(body)).toEqual(['pattern'])
    expect(body.pattern).toMatchObject({ patternNo: 'P19', name: '새 패턴', status: 'active', origin: 'manual', originItemId: null })
    const text = JSON.stringify(body)
    for (const forbidden of ['updated_by', 'updatedBy', ADMIN.id]) expect(text).not.toContain(forbidden)
    expect(fakeDb.tables.ops_patterns.at(-1)).toMatchObject({ pattern_no: 'P19', updated_by: ADMIN.id })
  })

  it('만든 패턴이 GET 목록에 바로 나온다', async () => {
    await POST(postRequest(content()))
    const list = await (await GET(new Request('http://localhost/api/admin/ops-patterns', { headers: AUTH }))).json()
    expect(list.patterns.map((p: { patternNo: string }) => p.patternNo)).toEqual(['P10', 'P17', 'P18', 'P19'])
  })

  it('내용 검사에 걸리면 400과 칸별 fieldErrors이고 만들지 않는다', async () => {
    const res = await POST(postRequest(content({ name: ' ', samples: [{ no: 1, name: '샘플', role: 'boss' }] })))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.fieldErrors).toMatchObject({ name: '이름을 적어 주세요.', 'samples.0.role': expect.any(String) })
    expect(fakeDb.writeCalls).toBe(0)
  })

  it('본문이 JSON이 아니거나 객체가 아니면 400이다', async () => {
    expect((await POST(postRequest('{ 깨진'))).status).toBe(400)
    expect((await POST(postRequest(''))).status).toBe(400)
    expect((await POST(postRequest('[1]'))).status).toBe(400)
    expect((await POST(postRequest('"문자열"'))).status).toBe(400)
    expect((await POST(postRequest('null'))).status).toBe(400)
    expect(fakeDb.writeCalls).toBe(0)
  })

  it('본문이 64KB를 넘으면 400이다', async () => {
    const res = await POST(postRequest(content({ pitfalls: '가'.repeat(30_000) })))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('본문이 너무 커요.')
    expect(fakeDb.writeCalls).toBe(0)
  })

  it('번호가 그사이 겹치면 409를 그대로 전달한다', async () => {
    fakeDb.beforeWrite = () => {
      fakeDb.beforeWrite = null
      fakeDb.tables.ops_patterns.push(patternRow('P19'))
    }
    const res = await POST(postRequest(content()))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('그사이 다른 패턴이 만들어졌어요. 다시 저장해 주세요.')
  })

  it('저장이 실패하면 고정 문장 500이고 원문은 싣지 않는다', async () => {
    fakeDb.writeError = { message: 'disk secret' }
    const res = await POST(postRequest(content()))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret')
  })
})

describe('PATCH /api/admin/ops-patterns/[patternNo]', () => {
  it('관리자 세션이 없으면 403이고 DB를 건드리지 않는다. 읽기 토큰만으로는 쓸 수 없다', async () => {
    h.user = null
    const body = { ...content({ name: '고친 이름' }), expectedUpdatedAt: T1 }
    expect((await PATCH(patchRequest(body), params('P10'))).status).toBe(403)
    expect((await PATCH(patchRequest(body, AUTH), params('P10'))).status).toBe(403)
    expect((await PATCH(patchRequest({ status: 'archived', expectedUpdatedAt: T1 }, AUTH), params('P10'))).status).toBe(403)
    expect(fakeDb.writeCalls).toBe(0)
  })

  it('내용 고치기: 200 { pattern, changed:true }이고 수정 시각이 바뀐다. 응답에 관리자 ID가 없다', async () => {
    const res = await PATCH(patchRequest({ ...content({ name: '고친 이름' }), expectedUpdatedAt: T1 }), params('P10'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['changed', 'pattern'])
    expect(body.changed).toBe(true)
    expect(body.pattern).toMatchObject({ patternNo: 'P10', name: '고친 이름', status: 'active', origin: 'manual' })
    expect(body.pattern.updatedAt).not.toBe(T1)
    const text = JSON.stringify(body)
    for (const forbidden of ['updated_by', 'updatedBy', ADMIN.id]) expect(text).not.toContain(forbidden)
  })

  it('내용 고치기: 값이 같으면 200 changed:false다', async () => {
    const first = await (await PATCH(patchRequest({ ...content(), expectedUpdatedAt: T1 }), params('P10'))).json()
    const res = await PATCH(patchRequest({ ...content(), expectedUpdatedAt: first.pattern.updatedAt }), params('P10'))
    expect(res.status).toBe(200)
    expect((await res.json()).changed).toBe(false)
  })

  it('상태 바꾸기: status가 있으면 상태 바꾸기다. 쉬는 중은 이유가 필수이고 쉬는 중이 아니게 되면 이유가 지워진다', async () => {
    const noReason = await PATCH(patchRequest({ status: 'paused', expectedUpdatedAt: T1 }), params('P10'))
    expect(noReason.status).toBe(400)
    expect((await noReason.json()).fieldErrors.pauseReason).toBeDefined()

    const paused = await PATCH(patchRequest({ status: 'paused', pauseReason: '기능 대기', expectedUpdatedAt: T1 }), params('P10'))
    expect(paused.status).toBe(200)
    const pausedBody = await paused.json()
    expect(pausedBody).toMatchObject({ changed: true, pattern: { status: 'paused', pauseReason: '기능 대기', name: '패턴 P10' } })

    const active = await PATCH(patchRequest({ status: 'active', expectedUpdatedAt: pausedBody.pattern.updatedAt }), params('P10'))
    expect((await active.json()).pattern).toMatchObject({ status: 'active', pauseReason: null })
  })

  it('상태와 내용 칸을 섞으면 400이고 DB는 그대로다', async () => {
    const res = await PATCH(patchRequest({ status: 'archived', name: '섞음', expectedUpdatedAt: T1 }), params('P10'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('상태 바꾸기와 내용 고치기는 따로 저장해 주세요.')
    expect(fakeDb.writeCalls).toBe(0)
  })

  it('expectedUpdatedAt이 없거나 시각이 아니면 400이다(고치기·상태 둘 다)', async () => {
    for (const bad of [undefined, null, '', '어제', 5]) {
      expect((await PATCH(patchRequest({ ...content(), expectedUpdatedAt: bad }), params('P10'))).status).toBe(400)
      expect((await PATCH(patchRequest({ status: 'archived', expectedUpdatedAt: bad }), params('P10'))).status).toBe(400)
    }
    expect(fakeDb.writeCalls).toBe(0)
  })

  it('화면이 본 시각과 다르면 409이고 DB는 그대로다', async () => {
    const stale = '2026-09-30T00:00:00+00:00'
    const edit = await PATCH(patchRequest({ ...content({ name: '덮어쓰기' }), expectedUpdatedAt: stale }), params('P10'))
    expect(edit.status).toBe(409)
    expect((await edit.json()).error).toBe('그사이 다른 곳에서 이 패턴을 고쳤어요. 최신 내용을 불러와 주세요.')
    const status = await PATCH(patchRequest({ status: 'archived', expectedUpdatedAt: stale }), params('P10'))
    expect(status.status).toBe(409)
    expect((await status.json()).error).toBe('그사이 상태가 바뀌었어요. 최신 내용을 불러와 주세요.')
    expect(fakeDb.writeCalls).toBe(0)
    expect(fakeDb.tables.ops_patterns.find((row) => row.pattern_no === 'P10')).toMatchObject({ name: '패턴 P10', status: 'active' })
  })

  it('없는 번호와 형식이 틀린 번호는 404다', async () => {
    const body = { ...content(), expectedUpdatedAt: T1 }
    for (const patternNo of ['P99', 'p10', 'P1', 'T01']) {
      const res = await PATCH(patchRequest(body), params(patternNo))
      expect(res.status).toBe(404)
      expect((await res.json()).error).toBe('찾을 수 없는 패턴이에요.')
    }
    expect(fakeDb.writeCalls).toBe(0)
  })

  it('내용 검사에 걸리면 400과 칸별 fieldErrors이다', async () => {
    const res = await PATCH(patchRequest({ ...content({ principle: '' }), expectedUpdatedAt: T1 }), params('P10'))
    expect(res.status).toBe(400)
    expect((await res.json()).fieldErrors).toMatchObject({ principle: '작동 원리를 적어 주세요.' })
  })

  it('본문이 JSON이 아니거나 객체가 아니거나 64KB를 넘으면 400이다', async () => {
    expect((await PATCH(patchRequest('{ 깨진'), params('P10'))).status).toBe(400)
    expect((await PATCH(patchRequest('[1]'), params('P10'))).status).toBe(400)
    expect((await PATCH(patchRequest({ ...content({ pitfalls: '가'.repeat(30_000) }), expectedUpdatedAt: T1 }), params('P10'))).status).toBe(400)
    expect(fakeDb.writeCalls).toBe(0)
  })

  it('저장이 실패하면 고정 문장 500이고 원문은 싣지 않는다', async () => {
    fakeDb.writeError = { message: 'disk secret' }
    const res = await PATCH(patchRequest({ ...content({ name: '고침' }), expectedUpdatedAt: T1 }), params('P10'))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret')
  })
})
