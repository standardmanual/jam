/**
 * DELETE /api/admin/ops-inbox/[bundleId] — 시험 묶음 지우기 (티켓 20260930_1818)
 *
 * 서비스 클라이언트는 메모리 안의 가짜 DB로 바꾼다(실 DB에 접속하지 않는다). 지키는 것:
 * - DELETE만 export하고 읽기 토큰을 다루지 않는다
 * - 비로그인 403, UUID가 아니면 400, 없는 묶음 404
 * - 시험이 아닌 묶음은 403이고 아무것도 지우지 않는다(결정 기록은 에이전트의 학습 재료다)
 * - 시험 묶음은 지워지고 항목·결정 기록이 함께 지워진다
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>

  const state = {
    admin: { id: 'admin-1', email: 'a@example.com' } as { id: string; email: string } | null,
    tables: { ops_bundles: [], ops_bundle_items: [], ops_decisions: [] } as Record<string, Row[]>,
    deletes: [] as string[],
    failDelete: false,
  }

  class Query {
    private mode: 'select' | 'delete' = 'select'
    private filters: Array<(row: Row) => boolean> = []

    constructor(private table: string) {}

    select() {
      return this
    }
    delete() {
      this.mode = 'delete'
      return this
    }
    eq(col: string, val: unknown) {
      this.filters.push((row) => row[col] === val)
      return this
    }
    async maybeSingle() {
      const found = state.tables[this.table].filter((row) => this.filters.every((f) => f(row)))
      return { data: found[0] ?? null, error: null }
    }
    then<T1, T2 = never>(
      onfulfilled?: ((value: { error: { message: string } | null }) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
    ) {
      state.deletes.push(this.table)
      if (state.failDelete) return Promise.resolve({ error: { message: 'boom' } }).then(onfulfilled, onrejected)
      const gone = new Set(state.tables[this.table].filter((row) => this.filters.every((f) => f(row))))
      state.tables[this.table] = state.tables[this.table].filter((row) => !gone.has(row))
      if (this.table === 'ops_bundles') {
        const ids = new Set([...gone].map((row) => row.id))
        state.tables.ops_bundle_items = state.tables.ops_bundle_items.filter((row) => !ids.has(row.bundle_id))
        state.tables.ops_decisions = state.tables.ops_decisions.filter((row) => !ids.has(row.bundle_id))
      }
      return Promise.resolve({ error: null }).then(onfulfilled, onrejected)
    }
  }
  return { state, Query }
})

vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => h.state.admin }))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: (table: string) => new h.Query(table) }),
}))

import { DELETE } from '../route'

const SAMPLE = '4ca7d1ad-43b2-41a3-9ed4-f03bc73604ee'
const REAL = '11111111-1111-4111-8111-111111111111'

function call(bundleId: string) {
  return DELETE(new Request(`http://localhost/api/admin/ops-inbox/${bundleId}`, { method: 'DELETE' }), {
    params: Promise.resolve({ bundleId }),
  })
}

beforeEach(() => {
  h.state.admin = { id: 'admin-1', email: 'a@example.com' }
  h.state.deletes = []
  h.state.failDelete = false
  h.state.tables = {
    ops_bundles: [
      { id: SAMPLE, is_sample: true },
      { id: REAL, is_sample: false },
    ],
    ops_bundle_items: [
      { id: 'i1', bundle_id: SAMPLE },
      { id: 'i2', bundle_id: REAL },
    ],
    ops_decisions: [
      { id: 'd1', bundle_id: SAMPLE, action: 'submit' },
      { id: 'd2', bundle_id: REAL, action: 'submit' },
    ],
  }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('인증과 입력', () => {
  it('로그인하지 않았거나 관리자가 아니면 403이고 아무것도 지우지 않는다', async () => {
    h.state.admin = null
    expect((await call(SAMPLE)).status).toBe(403)
    expect(h.state.deletes).toEqual([])
    expect(h.state.tables.ops_bundles).toHaveLength(2)
  })

  it('UUID가 아니면 400이다', async () => {
    for (const bad of ['abc', '1', "x' or '1'='1"]) expect((await call(bad)).status).toBe(400)
    expect(h.state.deletes).toEqual([])
  })

  it('없는 묶음은 404다', async () => {
    expect((await call('00000000-0000-4000-8000-000000000000')).status).toBe(404)
    expect(h.state.deletes).toEqual([])
  })
})

describe('삭제', () => {
  it('시험 묶음은 지워지고 그 항목·결정 기록이 함께 지워진다(다른 묶음은 그대로)', async () => {
    const res = await call(SAMPLE)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(h.state.tables.ops_bundles.map((row) => row.id)).toEqual([REAL])
    expect(h.state.tables.ops_bundle_items.map((row) => row.id)).toEqual(['i2'])
    expect(h.state.tables.ops_decisions.map((row) => row.id)).toEqual(['d2'])
  })

  it('시험이 아닌 묶음은 403이고 항목·결정 기록까지 그대로 남는다', async () => {
    const res = await call(REAL)
    expect(res.status).toBe(403)
    expect(((await res.json()) as { error: string }).error).toBe('시험 묶음만 지울 수 있어요.')
    expect(h.state.deletes).toEqual([])
    expect(h.state.tables.ops_bundles).toHaveLength(2)
    expect(h.state.tables.ops_bundle_items).toHaveLength(2)
    expect(h.state.tables.ops_decisions).toHaveLength(2)
  })

  it('삭제에 실패하면 500이고 오류 원문을 싣지 않는다', async () => {
    h.state.failDelete = true
    const res = await call(SAMPLE)
    expect(res.status).toBe(500)
    expect(((await res.json()) as { error: string }).error).not.toContain('boom')
  })
})

describe('라우트 계약', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/api/admin/ops-inbox/[bundleId]/route.ts'), 'utf8')

  it('DELETE만 export한다', () => {
    expect(source).toMatch(/export\s+async\s+function\s+DELETE\s*\(/)
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'HEAD', 'OPTIONS']) {
      expect(source).not.toMatch(new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\s*\\(`))
      expect(source).not.toMatch(new RegExp(`export\\s+(const|let|var)\\s+${method}\\b`))
    }
  })

  it('읽기 토큰을 다루지 않는다(관리자 로그인만)', () => {
    expect(source).not.toMatch(/x-admin-read-token|isValidAdminReadToken|requireOpsInboxSubmit|isOpsInboxTokenRequest/)
    expect(source).toMatch(/getAdminUser\(\)/)
  })

  it('토큰으로 이 경로에 DELETE를 보내도 토큰 쓰기 예외에 해당하지 않는다', async () => {
    const actual = await vi.importActual<typeof import('@/lib/admin/auth')>('@/lib/admin/auth')
    vi.stubEnv('ADMIN_API_READ_TOKEN', 'test-admin-read-token-abcdef')
    try {
      expect(actual.isOpsInboxTokenRequest('DELETE', `/api/admin/ops-inbox/${SAMPLE}`, 'test-admin-read-token-abcdef')).toBe(false)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
