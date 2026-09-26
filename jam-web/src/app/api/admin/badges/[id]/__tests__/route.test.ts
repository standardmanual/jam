/**
 * PATCH /api/admin/badges/[id] 비활성화 — 이미 비활성인 배지의 `deleted_at`을 다시 쓰지 않는다
 * (티켓 20260924_1404). DB는 기록형 스텁이다.
 * 실행: cd jam-web && npx vitest run "src/app/api/admin/badges/[id]/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const ORIGINAL_DELETED_AT = '2026-09-01T00:00:00.000Z'

const state = vi.hoisted(() => ({
  row: null as { id: string; deleted_at: string | null } | null,
  updates: [] as Record<string, unknown>[],
  sideEffectIds: [] as string[][],
}))

const fakeClient = {
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: state.row, error: null }) }) }),
    update: (patch: Record<string, unknown>) => {
      state.updates.push(patch)
      return {
        eq: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({ data: state.row ? { ...state.row, ...patch } : null, error: state.row ? null : { message: 'none' } }),
          }),
        }),
      }
    },
  }),
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

const { PATCH } = await import('../route')

const patch = (active: boolean) =>
  PATCH(
    new NextRequest('https://j-a-m.app/api/admin/badges/b1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    }),
    { params: Promise.resolve({ id: 'b1' }) }
  )

beforeEach(() => {
  state.row = null
  state.updates = []
  state.sideEffectIds = []
})

describe('PATCH /api/admin/badges/[id] — 비활성화', () => {
  it('이미 비활성이면 갱신·부수효과 없이 원래 deleted_at 그대로 돌려준다', async () => {
    state.row = { id: 'b1', deleted_at: ORIGINAL_DELETED_AT }
    const res = await patch(false)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.alreadyInactive).toBe(true)
    expect(data.badge.deleted_at).toBe(ORIGINAL_DELETED_AT)
    expect(state.updates).toEqual([])
    expect(state.sideEffectIds).toEqual([])
  })

  it('활성 배지는 deleted_at을 쓰고 부수효과를 실행한다', async () => {
    state.row = { id: 'b1', deleted_at: null }
    const res = await patch(false)
    expect(res.status).toBe(200)
    expect(state.updates).toHaveLength(1)
    expect(typeof state.updates[0].deleted_at).toBe('string')
    expect(state.sideEffectIds).toEqual([['b1']])
  })

  it('없는 배지는 404다', async () => {
    const res = await patch(false)
    expect(res.status).toBe(404)
    expect(state.updates).toEqual([])
  })

  it('되살리기(active: true)는 조회 없이 deleted_at을 null로 되돌린다', async () => {
    state.row = { id: 'b1', deleted_at: ORIGINAL_DELETED_AT }
    const res = await patch(true)
    expect(res.status).toBe(200)
    expect(state.updates).toEqual([{ deleted_at: null }])
    expect(state.sideEffectIds).toEqual([])
  })
})
