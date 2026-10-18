/**
 * PATCH /api/admin/recipes/[id] — 공개 시각(valid_from) 변경 가드 (티켓 20261001_1158)
 * 예약 중인 레시피는 시각 변경·바로 공개 전환이 되고, 이미 공개된 레시피의 시각 변경은 409다.
 * 종료 시각(valid_until, 티켓 20261002_0710)은 공개 뒤에도 바꾸고 지울 수 있으며, 공개 시각 이하이면 400이다.
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
  /** 기존 행의 종료 시각 */
  existingValidUntil: null as string | null,
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
                    : {
                        id: '11111111-1111-4111-8111-111111111111',
                        valid_from: state.existingValidFrom,
                        valid_until: state.existingValidUntil,
                      },
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
  state.existingValidUntil = null
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

describe('PATCH /api/admin/recipes/[id] — 종료 시각 (티켓 20261002_0710)', () => {
  it('이미 공개된 레시피에도 종료 시각을 정할 수 있다 — UTC ISO로 저장된다', async () => {
    state.existingValidFrom = inDays(-3)
    const until = inDays(5)

    const res = await patch({ valid_until: until })

    expect(res.status).toBe(200)
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].valid_until).toBe(until)
    expect('valid_from' in state.updates[0]).toBe(false)
  })

  it('처음부터 공개된 레시피(valid_from 없음)에도 종료 시각을 정할 수 있다', async () => {
    state.existingValidFrom = null

    const res = await patch({ valid_until: inDays(5) })

    expect(res.status).toBe(200)
    expect(state.updates).toHaveLength(1)
  })

  it('이미 공개된 레시피의 종료 시각을 null로 지울 수 있다(상시로 돌린다)', async () => {
    state.existingValidFrom = inDays(-3)
    state.existingValidUntil = inDays(2)

    const res = await patch({ valid_until: null })

    expect(res.status).toBe(200)
    expect(state.updates[0].valid_until).toBeNull()
  })

  it('종료 시각을 보내지 않으면 기존 값을 건드리지 않는다', async () => {
    state.existingValidFrom = inDays(-3)
    state.existingValidUntil = inDays(2)

    const res = await patch({ name: '이름만 바꿈' })

    expect(res.status).toBe(200)
    expect('valid_until' in state.updates[0]).toBe(false)
  })

  it('지난 시각으로 바꾸면 받아서 저장한다 — 곧바로 내려간다(공개 시각 이후일 때)', async () => {
    state.existingValidFrom = inDays(-3)
    const until = inDays(-1)

    const res = await patch({ valid_until: until })

    expect(res.status).toBe(200)
    expect(state.updates[0].valid_until).toBe(until)
  })

  it('종료된 레시피의 종료 시각을 늦추면 다시 공개 중이 되도록 저장된다', async () => {
    state.existingValidFrom = inDays(-10)
    state.existingValidUntil = inDays(-1)
    const until = inDays(4)

    const res = await patch({ valid_until: until })

    expect(res.status).toBe(200)
    expect(state.updates[0].valid_until).toBe(until)
  })

  it('종료 시각이 기존 공개 시각보다 앞서면 400이고 저장하지 않는다', async () => {
    state.existingValidFrom = inDays(-3)

    const res = await patch({ valid_until: inDays(-5) })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('종료 시각은 공개 시각보다 늦어야 해요')
    expect(state.updates).toHaveLength(0)
    expect(state.slotInserts).toBe(0)
  })

  it('종료 시각이 기존 공개 시각과 같으면 400이다', async () => {
    const from = inDays(-3)
    state.existingValidFrom = from

    const res = await patch({ valid_until: from })

    expect(res.status).toBe(400)
    expect(state.updates).toHaveLength(0)
  })

  it('예약 중인 레시피의 공개 시각을 기존 종료 시각 뒤로 옮기면 400이다(제출하지 않은 종료 시각은 기존 값으로 비교)', async () => {
    state.existingValidFrom = inDays(3)
    state.existingValidUntil = inDays(6)

    const res = await patch({ valid_from: inDays(9) })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('종료 시각은 공개 시각보다 늦어야 해요')
    expect(state.updates).toHaveLength(0)
  })

  it('예약 중인 레시피에 공개·종료 시각을 함께 보내면 둘 다 저장한다', async () => {
    state.existingValidFrom = inDays(3)
    const from = inDays(4)
    const until = inDays(8)

    const res = await patch({ valid_from: from, valid_until: until })

    expect(res.status).toBe(200)
    expect(state.updates[0].valid_from).toBe(from)
    expect(state.updates[0].valid_until).toBe(until)
  })

  it('종료된 레시피의 공개 시각 변경은 409다(한 번 공개된 레시피는 공개 시각을 바꿀 수 없다)', async () => {
    state.existingValidFrom = inDays(-10)
    state.existingValidUntil = inDays(-1)

    const res = await patch({ valid_from: inDays(7), valid_until: null })

    expect(res.status).toBe(409)
    expect(state.updates).toHaveLength(0)
  })

  it('형식이 올바르지 않은 종료 시각은 400이고 저장하지 않는다', async () => {
    state.existingValidFrom = inDays(-3)

    const res = await patch({ valid_until: '2026-10-12 09:00' })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('종료 시각 형식이 올바르지 않아요')
    expect(state.updates).toHaveLength(0)
  })
})

describe('PATCH /api/admin/recipes/[id] — 설명·결과 잠김·보상 없음 허용 (티켓 20261018_0055)', () => {
  it('새 칸 세 개를 update 행에 싣는다', async () => {
    state.existingValidFrom = inDays(-3)

    const res = await patch({ description: '설명이에요', reward_locked: true, allow_no_reward: true, reward_points: 0 })

    expect(res.status).toBe(200)
    expect(state.updates[0].description).toBe('설명이에요')
    expect(state.updates[0].reward_locked).toBe(true)
    expect(state.updates[0].allow_no_reward).toBe(true)
  })

  it('새 칸을 보내지 않으면 update 행에 넣지 않는다(옛 어드민 요청은 기존 값을 건드리지 않는다)', async () => {
    state.existingValidFrom = inDays(-3)

    const res = await patch()

    expect(res.status).toBe(200)
    expect('description' in state.updates[0]).toBe(false)
    expect('reward_locked' in state.updates[0]).toBe(false)
    expect('allow_no_reward' in state.updates[0]).toBe(false)
  })

  it('보상이 없는데 allow_no_reward가 없으면 옛 검증대로 400이고 저장하지 않는다', async () => {
    state.existingValidFrom = inDays(-3)

    const res = await patch({ reward_points: 0 })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('보상을 하나 이상')
    expect(state.updates).toHaveLength(0)
  })

  it('500자를 넘는 설명은 400이고 저장하지 않는다', async () => {
    state.existingValidFrom = inDays(-3)

    const res = await patch({ description: 'ㄱ'.repeat(501) })

    expect(res.status).toBe(400)
    expect(state.updates).toHaveLength(0)
  })
})
