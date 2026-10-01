/**
 * GET /api/admin/ops-patterns, GET /api/admin/ops-patterns/[patternNo] (티켓 20261001_2134, 상위 20260930_1503 ②)
 *
 * 인증은 실제 `@/lib/admin/auth`를 쓰고(세션만 모의한다), 읽기 함수(`lib/admin/opsPatterns/read.ts`)도 모의하지 않는다. 서비스 클라이언트만 메모리
 * 안의 가짜 테이블로 바꿔서, 라우트 → 읽기 함수 → 응답 본문까지 실제 코드로 지나가게 한다(관리자 ID가 본문에 없는지를 본문 문자열로 확인하려는 것이다).
 * 읽기 함수 자체의 정렬·거르기는 `opsPatterns/__tests__/read.test.ts`가 지킨다. 여기서는 라우트가 맡은 것만 본다:
 * - 읽기 토큰만으로 목록·상세가 읽힌다(관리자 세션도 된다). 토큰이 틀리거나 없고 세션도 없으면 403이고 사전 테이블을 읽지 않는다
 * - 목록: 기본은 보관 패턴을 빼고 `includeArchived=true`일 때만 싣는다. 취향 신호는 보관 패턴 것까지, 공통 규칙은 전부 싣는다. 비어 있으면 빈 목록이다
 * - 상세: 형식이 틀린 번호는 400(읽지 않는다), 없는 번호는 404, 보관 패턴도 번호로 읽으면 200이다. 취향 신호는 그 패턴 것만 싣는다
 * - 응답 본문 어디에도 `updated_by`·`confirmed_by`·`updatedBy`·`confirmedBy`와 그 값(관리자 ID)이 없다
 * - 조회가 실패하면 고정 문장 500이고 원문은 싣지 않는다
 * - 두 라우트 모두 GET만 export한다(쓰기 메서드 없음)
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  type Result = { data: unknown; error: { message: string } | null }
  const db = {
    user: null as { id: string; email: string } | null,
    tables: {} as Record<string, Row[]>,
    error: null as string | null,
    /** 사전 테이블(`ops_pattern*`)을 읽은 횟수. 인증에서 거절되면 0이어야 한다. */
    patternReads: 0,
  }
  class Query implements PromiseLike<Result> {
    private filters: Array<(row: Row) => boolean> = []
    private columns: string[] = []
    private single = false
    constructor(private table: string) {}
    select(columns: string) {
      if (this.table.startsWith('ops_pattern')) db.patternReads += 1
      this.columns = columns.split(',').map((c) => c.trim())
      return this
    }
    eq(column: string, value: unknown) {
      this.filters.push((row) => row[column] === value)
      return this
    }
    neq(column: string, value: unknown) {
      this.filters.push((row) => row[column] !== value)
      return this
    }
    maybeSingle() {
      this.single = true
      return this
    }
    private run(): Result {
      if (db.error && this.table.startsWith('ops_pattern')) return { data: null, error: { message: db.error } }
      const rows = (db.tables[this.table] ?? [])
        .filter((row) => this.filters.every((f) => f(row)))
        .map((row) => Object.fromEntries(this.columns.map((c) => [c, row[c]])))
      return { data: this.single ? (rows[0] ?? null) : rows, error: null }
    }
    then<R1 = Result, R2 = never>(
      onfulfilled?: ((value: Result) => R1 | PromiseLike<R1>) | null,
      onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
    ): PromiseLike<R1 | R2> {
      return Promise.resolve(this.run()).then(onfulfilled, onrejected)
    }
  }
  return { db, service: { from: (table: string) => new Query(table) } }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.db.user } }) } }),
  createServiceClient: () => h.service,
}))

import * as listRoute from '../route'
import * as detailRoute from '../[patternNo]/route'

const { GET } = listRoute
const { GET: GET_DETAIL } = detailRoute

const TOKEN = 'test-admin-read-token-abcdef'
const ADMIN = { id: 'admin-1', email: 'admin@example.com' }
const ADMIN_ID_VALUE = 'secret-admin-user-id'
const ENV_KEYS = ['ADMIN_API_READ_TOKEN', 'ADMIN_EMAILS'] as const
const AUTH = { 'x-admin-read-token': TOKEN }

function patternRow(patternNo: string, extra: Record<string, unknown> = {}) {
  return {
    pattern_no: patternNo,
    name: `패턴 ${patternNo}`,
    principle: '원리',
    user_experience: '유저 경험',
    menus: ['메뉴'],
    samples: [{ role: 'main', title: '샘플' }],
    card_shapes: [],
    knobs: {},
    pitfalls: '',
    status: 'active',
    pause_reason: null,
    origin: 'seed',
    origin_item_id: null,
    created_at: '2026-10-01T00:00:00+00:00',
    updated_at: '2026-10-01T01:00:00+00:00',
    updated_by: ADMIN_ID_VALUE,
    ...extra,
  }
}

function signalRow(id: string, patternNo: string | null, sortOrder: number) {
  return {
    id,
    pattern_no: patternNo,
    name: `신호 ${id}`,
    reason: '이유',
    basis: 'estimate',
    evidence_decision_id: null,
    confirmed_at: null,
    confirmed_by: ADMIN_ID_VALUE,
    sort_order: sortOrder,
  }
}

function fillTables() {
  h.db.tables.ops_patterns = [
    patternRow('P10'),
    patternRow('P09', { status: 'paused', pause_reason: '기능 대기' }),
    patternRow('P11', { status: 'archived' }),
  ]
  h.db.tables.ops_pattern_taste_signals = [
    signalRow('s-p11', 'P11', 1),
    signalRow('s-p10-2', 'P10', 2),
    signalRow('s-p10-1', 'P10', 1),
    signalRow('s-common', null, 1),
  ]
  h.db.tables.ops_pattern_common_rules = [
    { rule_no: 2, title: '둘', body: '본문', updated_at: 't', updated_by: ADMIN_ID_VALUE },
    { rule_no: 1, title: '하나', body: '본문', updated_at: 't', updated_by: ADMIN_ID_VALUE },
  ]
}

function listRequest(query = '', headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/admin/ops-patterns${query}`, { method: 'GET', headers })
}

function detailRequest(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/admin/ops-patterns/P10', { method: 'GET', headers })
}

const params = (patternNo: string) => ({ params: Promise.resolve({ patternNo }) })

const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key]
  process.env.ADMIN_API_READ_TOKEN = TOKEN
  process.env.ADMIN_EMAILS = ADMIN.email
  h.db.user = null
  h.db.tables = {}
  h.db.error = null
  h.db.patternReads = 0
  fillTables()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  vi.restoreAllMocks()
})

/** 응답 본문을 문자열로 보고 관리자 ID 칸·값이 없는지 확인한다. */
function expectNoAdminId(body: unknown) {
  const text = JSON.stringify(body)
  for (const forbidden of ['updated_by', 'confirmed_by', 'updatedBy', 'confirmedBy', ADMIN_ID_VALUE]) {
    expect(text).not.toContain(forbidden)
  }
}

describe('GET /api/admin/ops-patterns', () => {
  it('읽기 토큰만으로 읽힌다(세션 없음). 기본은 보관 패턴을 빼고 번호의 숫자 순서로 싣는다', async () => {
    const res = await GET(listRequest('', AUTH))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['commonRules', 'patterns', 'tasteSignals'])
    expect(body.patterns.map((p: { patternNo: string }) => p.patternNo)).toEqual(['P09', 'P10'])
    expect(body.patterns[0]).toMatchObject({ statusLabel: '쉬는 중', pauseReason: '기능 대기' })
    expect(body.commonRules.map((r: { ruleNo: number }) => r.ruleNo)).toEqual([1, 2])
  })

  it('취향 신호는 보관 패턴 것까지 전부 싣고 공통이 먼저다', async () => {
    const body = await (await GET(listRequest('', AUTH))).json()
    expect(body.tasteSignals.map((s: { id: string }) => s.id)).toEqual(['s-common', 's-p10-1', 's-p10-2', 's-p11'])
    expect(body.tasteSignals[0].patternNo).toBeNull()
  })

  it('includeArchived=true일 때만 보관 패턴을 싣는다', async () => {
    const withArchived = await (await GET(listRequest('?includeArchived=true', AUTH))).json()
    expect(withArchived.patterns.map((p: { patternNo: string }) => p.patternNo)).toEqual(['P09', 'P10', 'P11'])
    expect(withArchived.patterns[2].statusLabel).toBe('보관')
    for (const query of ['?includeArchived=false', '?includeArchived=1', '?includeArchived=']) {
      const body = await (await GET(listRequest(query, AUTH))).json()
      expect(body.patterns.map((p: { patternNo: string }) => p.patternNo)).toEqual(['P09', 'P10'])
    }
  })

  it('관리자 세션으로도 읽힌다', async () => {
    h.db.user = ADMIN
    expect((await GET(listRequest())).status).toBe(200)
  })

  it('토큰이 틀리거나 없고 세션도 없으면 403이고 사전을 읽지 않는다', async () => {
    expect((await GET(listRequest('', { 'x-admin-read-token': 'wrong' }))).status).toBe(403)
    expect((await GET(listRequest())).status).toBe(403)
    expect(h.db.patternReads).toBe(0)
  })

  it('환경변수에 토큰이 없으면 토큰으로 읽을 수 없다', async () => {
    delete process.env.ADMIN_API_READ_TOKEN
    expect((await GET(listRequest('', AUTH))).status).toBe(403)
    expect(h.db.patternReads).toBe(0)
  })

  it('테이블이 비어 있으면 빈 목록 200이다(오류 아님)', async () => {
    h.db.tables = {}
    const res = await GET(listRequest('?includeArchived=true', AUTH))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ patterns: [], commonRules: [], tasteSignals: [] })
  })

  it('응답 본문 어디에도 관리자 ID 칸과 값이 없다', async () => {
    expectNoAdminId(await (await GET(listRequest('?includeArchived=true', AUTH))).json())
  })

  it('조회가 실패하면 고정 문장 500이고 원문은 싣지 않는다', async () => {
    h.db.error = 'relation ops_patterns secret'
    const res = await GET(listRequest('', AUTH))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('패턴 사전을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.')
    expect(JSON.stringify(body)).not.toContain('secret')
  })
})

describe('GET /api/admin/ops-patterns/[patternNo]', () => {
  it('읽기 토큰만으로 읽힌다. 취향 신호는 그 패턴 것만 sort_order 순서로 싣는다', async () => {
    const res = await GET_DETAIL(detailRequest(AUTH), params('P10'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['pattern', 'tasteSignals'])
    expect(body.pattern).toMatchObject({ patternNo: 'P10', statusLabel: '사용 중' })
    expect(body.tasteSignals.map((s: { id: string }) => s.id)).toEqual(['s-p10-1', 's-p10-2'])
  })

  it('보관한 패턴도 번호로 직접 읽으면 200이다', async () => {
    const res = await GET_DETAIL(detailRequest(AUTH), params('P11'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pattern.statusLabel).toBe('보관')
    expect(body.tasteSignals.map((s: { id: string }) => s.id)).toEqual(['s-p11'])
  })

  it('관리자 세션으로도 읽힌다', async () => {
    h.db.user = ADMIN
    expect((await GET_DETAIL(detailRequest(), params('P10'))).status).toBe(200)
  })

  it('토큰이 틀리거나 없고 세션도 없으면 403이고 사전을 읽지 않는다', async () => {
    expect((await GET_DETAIL(detailRequest({ 'x-admin-read-token': 'wrong' }), params('P10'))).status).toBe(403)
    expect((await GET_DETAIL(detailRequest(), params('P10'))).status).toBe(403)
    expect(h.db.patternReads).toBe(0)
  })

  it('형식이 틀린 번호는 400이고 읽지 않는다', async () => {
    for (const bad of ['p10', 'P1', 'T01', 'P1a', 'P', '10']) {
      expect((await GET_DETAIL(detailRequest(AUTH), params(bad))).status).toBe(400)
    }
    expect(h.db.patternReads).toBe(0)
  })

  it('없는 번호는 404다', async () => {
    const res = await GET_DETAIL(detailRequest(AUTH), params('P99'))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('찾을 수 없는 패턴이에요.')
  })

  it('응답 본문 어디에도 관리자 ID 칸과 값이 없다', async () => {
    expectNoAdminId(await (await GET_DETAIL(detailRequest(AUTH), params('P09'))).json())
    expectNoAdminId(await (await GET_DETAIL(detailRequest(AUTH), params('P10'))).json())
  })

  it('조회가 실패하면 고정 문장 500이고 원문은 싣지 않는다', async () => {
    h.db.error = 'relation ops_patterns secret'
    const res = await GET_DETAIL(detailRequest(AUTH), params('P10'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('패턴 사전을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.')
    expect(JSON.stringify(body)).not.toContain('secret')
  })
})

describe('쓰기 메서드를 두지 않는다', () => {
  it('두 라우트 모두 GET만 export한다', () => {
    expect(Object.keys(listRoute)).toEqual(['GET'])
    expect(Object.keys(detailRoute)).toEqual(['GET'])
  })
})
