/**
 * POST /api/admin/badges/list-bulk deactivate — 이미 비활성인 배지는 건너뛰고 `deleted_at`을 다시 쓰지
 * 않는다(티켓 20260924_1404). DB는 기록형 스텁이라 어떤 id에 어떤 갱신이 나갔는지 그대로 확인한다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/badges/list-bulk/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const ACTIVE = '00000000-0000-4000-8000-000000000001'
const INACTIVE = '00000000-0000-4000-8000-000000000002'
const ORIGINAL_DELETED_AT = '2026-09-01T00:00:00.000Z'

const state = vi.hoisted(() => ({
  updates: [] as { patch: Record<string, unknown>; ids: string[] }[],
  dropCountIds: [] as string[][],
  sideEffectIds: [] as string[][],
}))

const ROWS = [
  { id: ACTIVE, name: '활성 배지', deleted_at: null },
  { id: INACTIVE, name: '꺼진 배지', deleted_at: ORIGINAL_DELETED_AT },
]

const fakeClient = {
  from(table: string) {
    return {
      select: (_columns?: string, _options?: unknown) => ({
        in: (_column: string, ids: string[]) => {
          if (table === 'poi_drops') {
            state.dropCountIds.push(ids)
            const result = Promise.resolve({ count: 3, error: null })
            return { eq: () => ({ is: () => result }) }
          }
          return Promise.resolve({ data: ROWS.filter((r) => ids.includes(r.id)), error: null })
        },
      }),
      update: (patch: Record<string, unknown>) => ({
        in: (_column: string, ids: string[]) => {
          state.updates.push({ patch, ids })
          return { select: () => Promise.resolve({ data: ids.map((id) => ({ id })), error: null }) }
        },
      }),
    }
  },
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeClient }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  getAdminUser: async () => ({ id: 'admin-1', email: 'me@jam.app' }),
}))
vi.mock('@/lib/admin/badge-deactivate', () => ({
  runBadgeDeactivationSideEffects: async (_supabase: unknown, ids: string[]) => {
    state.sideEffectIds.push(ids)
  },
}))

const { POST } = await import('../route')

const post = (body: unknown) =>
  POST(
    new NextRequest('https://j-a-m.app/api/admin/badges/list-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  )

beforeEach(() => {
  state.updates = []
  state.dropCountIds = []
  state.sideEffectIds = []
  vi.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('deactivate — 이미 비활성인 배지', () => {
  it('실행: 활성 배지만 갱신하고 이미 비활성은 건너뜀으로 보고하며 그 배지의 deleted_at은 쓰지 않는다', async () => {
    const res = await post({ ids: [ACTIVE, INACTIVE], action: 'deactivate' })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.processed).toEqual([ACTIVE])
    expect(data.skipped).toEqual([{ id: INACTIVE, label: '꺼진 배지', reason: '이미 비활성 상태입니다.' }])

    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].ids).toEqual([ACTIVE])
    expect(state.updates[0].ids).not.toContain(INACTIVE)
    expect(state.sideEffectIds).toEqual([[ACTIVE]])
  })

  it('전부 이미 비활성이면 아무것도 갱신하지 않는다', async () => {
    const res = await post({ ids: [INACTIVE], action: 'deactivate' })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.processed).toEqual([])
    expect(data.skipped).toHaveLength(1)
    expect(state.updates).toEqual([])
  })

  it('미리보기: 건너뜀을 함께 보여 주고 드랍 수는 비활성화될 배지만 센다', async () => {
    const res = await post({ ids: [ACTIVE, INACTIVE], action: 'deactivate', dry_run: true })
    const data = await res.json()
    expect(data.dryRun).toBe(true)
    expect(data.processed).toEqual([ACTIVE])
    expect(data.skipped).toEqual([{ id: INACTIVE, label: '꺼진 배지', reason: '이미 비활성 상태입니다.' }])
    expect(data.impact).toEqual({ droppableCount: 3 })
    expect(state.dropCountIds).toEqual([[ACTIVE]])
    expect(state.updates).toEqual([])
  })
})
