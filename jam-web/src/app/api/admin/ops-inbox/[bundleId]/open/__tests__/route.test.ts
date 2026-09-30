/**
 * POST /api/admin/ops-inbox/[bundleId]/open — 도착 → 검토중 전환 (티켓 20260930_1817)
 *
 * 서비스 클라이언트는 메모리 안의 가짜 DB로 바꾼다(실 DB에 접속하지 않는다). 지키는 것:
 * - 비로그인·비관리자 403, UUID가 아니면 400, 없는 묶음 404
 * - 갱신 조건에 `status = 'arrived'`와 그 묶음이 들어간다(다른 묶음·이미 결정된 항목은 건드리지 않는다)
 * - 여러 번 불러도 결과가 같다(멱등)
 * - POST만 export한다
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  type Result = { data: unknown; error: { message: string } | null }

  const state = {
    admin: { id: 'admin-1', email: 'a@example.com' } as { id: string; email: string } | null,
    tables: { ops_bundles: [], ops_bundle_items: [], ops_decisions: [] } as Record<string, Row[]>,
    failOn: null as string | null,
    updates: [] as Array<{ table: string; payload: Row; filters: Array<[string, unknown]> }>,
    inserts: [] as string[],
  }

  class Query implements PromiseLike<Result> {
    private mode: 'select' | 'update' = 'select'
    private payload: Row = {}
    private filters: Array<[string, unknown]> = []

    constructor(private table: string) {}

    select() {
      return this
    }
    update(payload: Row) {
      this.mode = 'update'
      this.payload = payload
      return this
    }
    insert() {
      state.inserts.push(this.table)
      return this
    }
    eq(col: string, val: unknown) {
      this.filters.push([col, val])
      return this
    }
    async maybeSingle() {
      const result = this.run()
      return { data: Array.isArray(result.data) ? (result.data[0] ?? null) : null, error: result.error }
    }
    then<T1 = Result, T2 = never>(
      onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
    ): PromiseLike<T1 | T2> {
      return Promise.resolve(this.run()).then(onfulfilled, onrejected)
    }

    private run(): Result {
      if (state.failOn === `${this.table}.${this.mode}`) return { data: null, error: { message: 'boom' } }
      const matches = state.tables[this.table].filter((row) => this.filters.every(([col, val]) => row[col] === val))
      if (this.mode === 'update') {
        state.updates.push({ table: this.table, payload: this.payload, filters: this.filters })
        for (const row of matches) Object.assign(row, this.payload)
        return { data: matches.map((row) => ({ id: row.id })), error: null }
      }
      return { data: matches, error: null }
    }
  }

  return { state, Query }
})

vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => h.state.admin }))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: (table: string) => new h.Query(table) }),
}))

import { POST } from '../route'

const ID = '4ca7d1ad-43b2-41a3-9ed4-f03bc73604ee'
const OTHER = '11111111-1111-4111-8111-111111111111'

function call(bundleId: string) {
  return POST(new Request(`http://localhost/api/admin/ops-inbox/${bundleId}/open`, { method: 'POST' }), {
    params: Promise.resolve({ bundleId }),
  })
}

function statuses(bundleId: string) {
  return h.state.tables.ops_bundle_items.filter((r) => r.bundle_id === bundleId).map((r) => `${r.id}:${r.status}`)
}

beforeEach(() => {
  h.state.admin = { id: 'admin-1', email: 'a@example.com' }
  h.state.failOn = null
  h.state.updates = []
  h.state.inserts = []
  h.state.tables = {
    ops_bundles: [{ id: ID }, { id: OTHER }],
    ops_bundle_items: [
      { id: 'i1', bundle_id: ID, status: 'arrived', updated_at: 'old' },
      { id: 'i2', bundle_id: ID, status: 'arrived', updated_at: 'old' },
      { id: 'i3', bundle_id: ID, status: 'approved', updated_at: 'old' },
      { id: 'i4', bundle_id: ID, status: 'rejected', updated_at: 'old' },
      { id: 'o1', bundle_id: OTHER, status: 'arrived', updated_at: 'old' },
    ],
    ops_decisions: [],
  }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('인증과 입력', () => {
  it('로그인하지 않았거나 관리자가 아니면 403이고 아무것도 바꾸지 않는다', async () => {
    h.state.admin = null
    const res = await call(ID)
    expect(res.status).toBe(403)
    expect(h.state.updates).toEqual([])
    expect(statuses(ID)).toEqual(['i1:arrived', 'i2:arrived', 'i3:approved', 'i4:rejected'])
  })

  it('UUID가 아니면 400이다', async () => {
    for (const bad of ['abc', '1', "x' or '1'='1", '4ca7d1ad-43b2-41a3-9ed4']) {
      const res = await call(bad)
      expect(res.status).toBe(400)
    }
    expect(h.state.updates).toEqual([])
  })

  it('없는 묶음이면 404이고 아무것도 바꾸지 않는다', async () => {
    const res = await call('00000000-0000-4000-8000-000000000000')
    expect(res.status).toBe(404)
    expect(h.state.updates).toEqual([])
  })
})

describe('전환', () => {
  it('그 묶음의 도착 항목만 검토중으로 바꾸고 바뀐 개수를 돌려준다', async () => {
    const res = await call(ID)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, changed: 2 })
    expect(statuses(ID)).toEqual(['i1:reviewing', 'i2:reviewing', 'i3:approved', 'i4:rejected'])
  })

  it('갱신 조건에 status = arrived와 그 묶음이 들어가고, 다른 묶음은 건드리지 않는다', async () => {
    await call(ID)
    expect(h.state.updates).toHaveLength(1)
    const update = h.state.updates[0]
    expect(update.table).toBe('ops_bundle_items')
    expect(update.filters).toContainEqual(['status', 'arrived'])
    expect(update.filters).toContainEqual(['bundle_id', ID])
    expect(update.payload.status).toBe('reviewing')
    expect(statuses(OTHER)).toEqual(['o1:arrived'])
  })

  it('수정 시각도 갱신한다', async () => {
    await call(ID)
    const changed = h.state.tables.ops_bundle_items.filter((r) => r.bundle_id === ID && r.status === 'reviewing')
    expect(changed.every((r) => r.updated_at !== 'old')).toBe(true)
    // 바뀌지 않은 항목의 수정 시각은 그대로다
    expect(h.state.tables.ops_bundle_items.find((r) => r.id === 'i3')?.updated_at).toBe('old')
  })

  it('여러 번 불러도 결과가 같다(두 번째부터는 바뀐 개수가 0)', async () => {
    await call(ID)
    const again = await call(ID)
    expect(await again.json()).toEqual({ ok: true, changed: 0 })
    expect(statuses(ID)).toEqual(['i1:reviewing', 'i2:reviewing', 'i3:approved', 'i4:rejected'])
  })

  it('결정 기록은 남기지 않는다', async () => {
    await call(ID)
    expect(h.state.inserts).toEqual([])
    expect(h.state.tables.ops_decisions).toEqual([])
  })

  it('저장에 실패하면 500이고 오류 원문을 응답에 싣지 않는다', async () => {
    h.state.failOn = 'ops_bundle_items.update'
    const res = await call(ID)
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('검토중으로 바꾸지 못했어요')
    expect(body.error).not.toContain('boom')
  })

  it('조회에 실패해도 500이다', async () => {
    h.state.failOn = 'ops_bundles.select'
    const res = await call(ID)
    expect(res.status).toBe(500)
    expect(h.state.updates).toEqual([])
  })
})

describe('라우트 계약', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/api/admin/ops-inbox/[bundleId]/open/route.ts'), 'utf8')

  it('POST만 export한다', () => {
    expect(source).toMatch(/export\s+async\s+function\s+POST\s*\(/)
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
      expect(source).not.toMatch(new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\s*\\(`))
      expect(source).not.toMatch(new RegExp(`export\\s+(const|let|var)\\s+${method}\\b`))
    }
  })

  it('읽기 토큰을 다루지 않는다(관리자 로그인만)', () => {
    expect(source).not.toMatch(/x-admin-read-token|isValidAdminReadToken|requireOpsInboxSubmit|isOpsInboxTokenRequest/)
    expect(source).toMatch(/getAdminUser\(\)/)
  })

  it('이 경로는 토큰 쓰기 예외에 해당하지 않는다(토큰 POST는 proxy가 로그인으로 돌려보낸다)', async () => {
    const actual = await vi.importActual<typeof import('@/lib/admin/auth')>('@/lib/admin/auth')
    vi.stubEnv('ADMIN_API_READ_TOKEN', 'test-admin-read-token-abcdef')
    try {
      expect(actual.isOpsInboxTokenRequest('POST', '/api/admin/ops-inbox', 'test-admin-read-token-abcdef')).toBe(true)
      expect(actual.isOpsInboxTokenRequest('POST', `/api/admin/ops-inbox/${ID}/open`, 'test-admin-read-token-abcdef')).toBe(false)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
