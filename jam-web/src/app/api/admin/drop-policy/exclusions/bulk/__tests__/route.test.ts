/**
 * POST /api/admin/drop-policy/exclusions/bulk — 배지 대상 조회의 삭제 배지 제외 (티켓 20260926_1413)
 * DB는 행 배열을 필터링하는 가짜 클라이언트로 바꿔, 라우트가 걸어 주는 조건(type·deleted_at)이
 * 실제로 대상을 좁히는지 본다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/drop-policy/exclusions/bulk/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const ADMIN_ID = '00000000-0000-4000-8000-0000000000aa'
const LIVE_ITEM = '00000000-0000-4000-8000-000000000001'
const DELETED_ITEM = '00000000-0000-4000-8000-000000000002'
const NON_ITEM = '00000000-0000-4000-8000-000000000003'

interface BadgeRow {
  id: string
  type: string
  deleted_at: string | null
}

const state = vi.hoisted(() => ({
  rows: [] as { id: string; type: string; deleted_at: string | null }[],
  updatedIds: [] as string[],
}))

/** select().in().eq().is() 체인이 걸린 조건대로 행을 좁혀 돌려주는 가짜 쿼리 */
function fakeSelect() {
  let rows: BadgeRow[] = state.rows
  const chain = {
    in: (_col: string, ids: string[]) => {
      rows = rows.filter((r) => ids.includes(r.id))
      return chain
    },
    eq: (col: string, value: string) => {
      rows = rows.filter((r) => (r as unknown as Record<string, unknown>)[col] === value)
      return chain
    },
    is: (col: string, value: null) => {
      rows = rows.filter((r) => (r as unknown as Record<string, unknown>)[col] === value)
      return chain
    },
    then: (resolve: (v: { data: { id: string }[]; error: null }) => void) =>
      resolve({ data: rows.map((r) => ({ id: r.id })), error: null }),
  }
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => fakeSelect(),
      update: () => ({
        in: (_col: string, ids: string[]) => ({
          select: async () => {
            state.updatedIds = ids
            return { data: ids.map((id) => ({ id })), error: null }
          },
        }),
      }),
    }),
  }),
}))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  getAdminUser: async () => ({ id: ADMIN_ID, email: 'me@jam.app' }),
}))

const { POST } = await import('../route')

function post(body: unknown): NextRequest {
  return new NextRequest('https://j-a-m.app/api/admin/drop-policy/exclusions/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  state.updatedIds = []
  state.rows = [
    { id: LIVE_ITEM, type: 'item', deleted_at: null },
    { id: DELETED_ITEM, type: 'item', deleted_at: '2026-09-01T00:00:00Z' },
    { id: NON_ITEM, type: 'activity', deleted_at: null },
  ]
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('배지 드랍 제외 일괄', () => {
  it('삭제된 배지 ID는 대상에서 빠지고 건너뜀으로 돌려준다', async () => {
    const res = await POST(
      post({ ids: [LIVE_ITEM, DELETED_ITEM], action: 'exclude', payload: { entity: 'badge' } })
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(state.updatedIds).toEqual([LIVE_ITEM])
    expect(data.processed).toEqual([LIVE_ITEM])
    expect(data.skipped).toEqual([{ id: DELETED_ITEM, reason: '아이템배지가 아닙니다' }])
  })

  it('삭제되지 않은 아이템배지는 그대로 반영하고, 아이템배지가 아닌 유형은 계속 제외한다', async () => {
    const res = await POST(
      post({ ids: [LIVE_ITEM, NON_ITEM], action: 'include', payload: { entity: 'badge' } })
    )
    const data = await res.json()
    expect(state.updatedIds).toEqual([LIVE_ITEM])
    expect(data.processed).toEqual([LIVE_ITEM])
    expect(data.skipped).toEqual([{ id: NON_ITEM, reason: '아이템배지가 아닙니다' }])
  })
})
