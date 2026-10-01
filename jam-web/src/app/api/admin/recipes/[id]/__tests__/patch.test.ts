/**
 * PATCH /api/admin/recipes/[id] — 공개 시각(valid_from) 변경 가드 (티켓 20261001_1158)
 * 예약 중인 레시피는 시각 변경·바로 공개 전환이 되고, 이미 공개된 레시피의 시각 변경은 409다.
 * DB는 기록형 스텁이고 검증·가드는 실제 함수를 거친다.
 * 실행: cd jam-web && npx vitest run "src/app/api/admin/recipes/[id]/__tests__/patch.test.ts"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const ID = '11111111-1111-4111-8111-111111111111'
const ITEM_A = 'badge-item-a'
const ITEM_B = 'badge-item-b'
const DAY = 24 * 60 * 60 * 1000

const state = vi.hoisted(() => ({
  /** 기존 행의 공개 시각 — undefined면 행이 없다 */
  existingValidFrom: undefined as string | null | undefined,
  /** update에 실린 행 */
  updates: [] as Record<string, unknown>[],
  slotInserts: 0,
}))

function badgesBuilder() {
  let requested: string[] = []
  const builder: Record<string, unknown> = {
    select: () => builder,
    in: (_column: string, ids: string[]) => {
      requested = ids
      return builder
    },
    is: () => builder,
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve({ data: requested.map((id) => ({ id, type: 'item' })), error: null }).then(
        onFulfilled,
        onRejected
      ),
  }
  return builder
}

const fakeClient = {
  from: (table: string) => {
    if (table === 'badges') return badgesBuilder()
    if (table === 'combination_recipes') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data:
                  state.existingValidFrom === undefined
                    ? null
                    : { id: '11111111-1111-4111-8111-111111111111', valid_from: state.existingValidFrom },
                error: null,
              }),
          }),
        }),
        update: (row: Record<string, unknown>) => {
          state.updates.push(row)
          return {
            eq: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: { id: '11111111-1111-4111-8111-111111111111', ...row }, error: null }),
              }),
            }),
          }
        },
      }
    }
    return {
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
      insert: () => {
        state.slotInserts += 1
        return Promise.resolve({ error: null })
      },
    }
  },
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeClient }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  requireAdmin: async () => null,
}))

const { PATCH } = await import('../route')

const baseBody = {
  name: '테스트 레시피',
  slots: [
    { badge_type: 'item', allowed_badge_ids: [ITEM_A] },
    { badge_type: 'item', allowed_badge_ids: [ITEM_B] },
  ],
  reward_points: 10,
}

const patch = (extra: Record<string, unknown> = {}, id = ID) =>
  PATCH(
    new NextRequest(`https://j-a-m.app/api/admin/recipes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseBody, ...extra }),
    }),
    { params: Promise.resolve({ id }) }
  )

const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString()

beforeEach(() => {
  state.existingValidFrom = undefined
  state.updates = []
  state.slotInserts = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('PATCH /api/admin/recipes/[id] — 공개 시각', () => {
  it('예약 중인 레시피는 다른 미래 시각으로 바꿀 수 있다', async () => {
    state.existingValidFrom = inDays(3)
    const next = inDays(7)

    const res = await patch({ valid_from: next })

    expect(res.status).toBe(200)
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].valid_from).toBe(next)
  })

  it('예약 중인 레시피는 null을 보내 바로 공개로 돌릴 수 있다', async () => {
    state.existingValidFrom = inDays(3)

    const res = await patch({ valid_from: null })

    expect(res.status).toBe(200)
    expect(state.updates[0].valid_from).toBeNull()
  })

  it('예약 중인 레시피도 공개 시각을 보내지 않으면 기존 값을 건드리지 않는다', async () => {
    state.existingValidFrom = inDays(3)

    const res = await patch()

    expect(res.status).toBe(200)
    expect('valid_from' in state.updates[0]).toBe(false)
  })

  it('이미 공개된 레시피(공개 시각이 지남)에 다른 시각을 보내면 409이고 저장하지 않는다', async () => {
    state.existingValidFrom = inDays(-3)

    const res = await patch({ valid_from: inDays(7) })
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toContain('이미 공개된')
    expect(state.updates).toHaveLength(0)
    expect(state.slotInserts).toBe(0)
  })

  it('처음부터 공개된 레시피(valid_from 없음)에 예약 시각을 붙이면 409이고 저장하지 않는다', async () => {
    state.existingValidFrom = null

    const res = await patch({ valid_from: inDays(7) })

    expect(res.status).toBe(409)
    expect(state.updates).toHaveLength(0)
  })

  it('이미 공개된 레시피도 공개 시각을 보내지 않으면 다른 칸은 그대로 수정된다', async () => {
    state.existingValidFrom = inDays(-3)

    const res = await patch({ name: '이름만 바꿈' })

    expect(res.status).toBe(200)
    expect(state.updates[0].name).toBe('이름만 바꿈')
    expect('valid_from' in state.updates[0]).toBe(false)
  })

  it('과거 시각은 400이고 저장하지 않는다', async () => {
    state.existingValidFrom = inDays(3)

    const res = await patch({ valid_from: inDays(-1) })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('이미 지났어요')
    expect(state.updates).toHaveLength(0)
  })

  it('없는 레시피는 404이고 저장하지 않는다', async () => {
    const res = await patch({ valid_from: inDays(7) })

    expect(res.status).toBe(404)
    expect(state.updates).toHaveLength(0)
  })
})
