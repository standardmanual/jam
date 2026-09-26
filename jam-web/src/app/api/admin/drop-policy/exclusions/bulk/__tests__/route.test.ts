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
  /** 조회 DB 오류 주입 */
  readError: null as { message: string } | null,
  /** 배지 조회가 받은 id 묶음 — ID_CHUNK_SIZE 경계 확인용 */
  readChunks: [] as string[][],
  /** 반영이 나간 id 묶음(호출 순서대로) */
  updateChunks: [] as string[][],
}))

/** select().in().eq().is() 체인이 걸린 조건대로 행을 좁혀 돌려주는 가짜 쿼리 */
function fakeSelect() {
  let rows: BadgeRow[] = state.rows
  const chain = {
    in: (_col: string, ids: string[]) => {
      state.readChunks.push(ids)
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
    then: (resolve: (v: { data: { id: string }[] | null; error: { message: string } | null }) => void) =>
      resolve(
        state.readError
          ? { data: null, error: state.readError }
          : { data: rows.map((r) => ({ id: r.id })), error: null }
      ),
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
            state.updateChunks.push(ids)
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
  state.readError = null
  state.readChunks = []
  state.updateChunks = []
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

  it('배지 조회에 DB 오류가 나면 500이고 아무것도 반영하지 않는다', async () => {
    state.readError = { message: 'connection reset' }
    const res = await POST(post({ ids: [LIVE_ITEM], action: 'exclude', payload: { entity: 'badge' } }))
    expect(res.status).toBe(500)
    expect(state.updateChunks).toEqual([])
  })

  it('조회는 200건씩 묶어 읽고 묶음이 여러 개여도 대상을 빠짐없이 모아 반영한다(201건 = 200 + 1)', async () => {
    const uuidOf = (n: number) => `00000000-0000-4000-8000-${String(n + 100).padStart(12, '0')}`
    const ids = Array.from({ length: 201 }, (_, i) => uuidOf(i))
    state.rows = ids.map((id) => ({ id, type: 'item', deleted_at: null }))
    // 묶음 경계를 넘는 위치(마지막 하나)를 삭제 배지로 만들어 두 번째 묶음의 필터도 확인한다
    state.rows[200] = { id: ids[200], type: 'item', deleted_at: '2026-09-01T00:00:00Z' }

    const res = await POST(post({ ids, action: 'exclude', payload: { entity: 'badge' } }))
    expect(res.status).toBe(200)
    expect(state.readChunks.map((c) => c.length)).toEqual([200, 1])
    const data = await res.json()
    expect(data.processed).toHaveLength(200)
    expect(data.skipped).toEqual([{ id: ids[200], reason: '아이템배지가 아닙니다' }])
    expect(state.updateChunks.flat()).toEqual(ids.slice(0, 200))
  })

  it('정확히 200건이면 한 묶음으로 읽는다', async () => {
    const ids = Array.from({ length: 200 }, (_, i) => `00000000-0000-4000-8000-${String(i + 100).padStart(12, '0')}`)
    state.rows = ids.map((id) => ({ id, type: 'item', deleted_at: null }))
    const res = await POST(post({ ids, action: 'include', payload: { entity: 'badge' } }))
    expect(res.status).toBe(200)
    expect(state.readChunks.map((c) => c.length)).toEqual([200])
  })
})
