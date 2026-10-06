/**
 * GET /api/badges/[id]/share-data — 공개 전 배지(정책 0행)는 404다 (티켓 20261006_1530)
 *
 * 마이그레이션 216 정책이 공개 전 활동 배지·비공개 컬렉션 소속 배지를 0행으로 돌려준다.
 * 라우트의 `badges` 조회는 `.maybeSingle()`이라 0행이 오류가 아니라 `badge_not_found` 404다.
 * `.single()`로 되돌리면 같은 0행이 PGRST116 오류가 되므로, 모킹은 `.single()` 0행에 그 오류를 내고
 * 테스트는 `badges`에 `.single()`이 불리지 않았는지도 확인한다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/api/badges/[id]/share-data/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  calls: [] as { table: string; method: string }[],
}))

/** 어떤 필터 체인이든 받는다. 끝(await·`.single()`·`.maybeSingle()`)에서 테이블 행을 돌려준다. */
function makeBuilder(table: string): unknown {
  const rows = state.tables[table] ?? []
  const builder: unknown = new Proxy(
    {},
    {
      get(_target, method) {
        if (typeof method !== 'string') return undefined
        if (method === 'then') {
          return (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null })
        }
        return () => {
          state.calls.push({ table, method })
          if (method === 'maybeSingle') return Promise.resolve({ data: rows[0] ?? null, error: null })
          if (method === 'single') {
            return Promise.resolve({
              data: rows[0] ?? null,
              error: rows.length === 0 ? { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } : null,
            })
          }
          return builder
        }
      },
    }
  )
  return builder
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from: (table: string) => makeBuilder(table),
  }),
  createServiceClient: () => ({ from: (table: string) => makeBuilder(table) }),
}))

import { GET } from '../route'

async function callGet() {
  const request = new NextRequest('http://localhost/api/badges/badge-1/share-data')
  const response = await GET(request, { params: Promise.resolve({ id: 'badge-1' }) })
  return { status: response.status, body: await response.json() }
}

describe('GET /api/badges/[id]/share-data — 공개 전 배지', () => {
  beforeEach(() => {
    state.tables = {}
    state.calls = []
  })

  it('정책이 배지를 0행으로 돌려주면 badge_not_found 404이고 .single()은 부르지 않는다', async () => {
    state.tables.badges = []

    const { status, body } = await callGet()

    expect(status).toBe(404)
    expect(body).toEqual({ error: 'badge_not_found' })
    expect(state.calls.filter((c) => c.table === 'badges' && c.method === 'maybeSingle')).toHaveLength(1)
    expect(state.calls.filter((c) => c.table === 'badges' && c.method === 'single')).toHaveLength(0)
  })

  it('대조: 정책에 걸리지 않는 배지는 404가 아니라 다음 판정으로 넘어간다(item 배지 400)', async () => {
    state.tables.badges = [{ id: 'badge-1', type: 'item' }]

    const { status, body } = await callGet()

    expect(status).toBe(400)
    expect(body).toEqual({ error: 'not_activity_or_poi' })
  })
})
