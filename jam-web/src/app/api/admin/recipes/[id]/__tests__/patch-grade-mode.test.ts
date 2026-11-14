/**
 * PATCH /api/admin/recipes/[id] — 첫 성공자 보상 배지와 레시피 유형 (티켓 20261114_1705 2회차)
 * 기존 레시피의 유형·첫 성공자 보상 값을 읽어 저장 검사에 넘기는지 본다: 이미 성공 기록이 있는 레시피에 첫 성공자 보상을 켜면 400이고 저장하지 않으며,
 * 기존과 같은 배지를 다시 보내면 통과한다. 검증 자체는 `recipe-write-grade-mode.test.ts`가 본다. DB는 기록형 스텁이다.
 * 실행: cd jam-web && npx vitest run "src/app/api/admin/recipes/[id]/__tests__/patch-grade-mode.test.ts"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const ID = '11111111-1111-4111-8111-111111111111'

const state = vi.hoisted(() => ({
  existingGradeMode: 'fixed' as string,
  existingFirstSuccess: null as string | null,
  successLogCount: 0,
  updates: [] as Record<string, unknown>[],
  /** 기존 행 조회가 요청한 칸 */
  existingSelect: '',
}))

const FIRST = { id: 'first-1', type: 'item', drop_excluded: true }

function badgesBuilder() {
  let requested: string[] = []
  let single = false
  const builder: Record<string, unknown> = {
    select: () => builder,
    in: (_c: string, ids: string[]) => {
      requested = ids
      return builder
    },
    eq: () => {
      single = true
      return builder
    },
    is: () => builder,
    maybeSingle: () => Promise.resolve({ data: FIRST, error: null }),
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve({ data: single ? [FIRST] : requested.map((id) => ({ id, type: 'item' })), error: null }).then(
        onFulfilled,
        onRejected
      ),
  }
  return builder
}

const fakeClient = {
  from: (table: string) => {
    if (table === 'badges') return badgesBuilder()
    if (table === 'user_combine_success_logs') {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => Promise.resolve({ count: state.successLogCount, error: null }),
      }
      return builder
    }
    if (table === 'combination_recipes') {
      return {
        select: (columns: string) => {
          state.existingSelect = columns
          return {
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    id: ID,
                    valid_from: null,
                    valid_until: null,
                    grade_mode: state.existingGradeMode,
                    first_success_badge_id: state.existingFirstSuccess,
                  },
                  error: null,
                }),
            }),
          }
        },
        update: (row: Record<string, unknown>) => {
          state.updates.push(row)
          return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: ID, ...row }, error: null }) }) }) }
        },
      }
    }
    return { delete: () => ({ eq: () => Promise.resolve({ error: null }) }), insert: () => Promise.resolve({ error: null }) }
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
    { badge_type: 'item', allowed_badge_ids: ['badge-item-a'] },
    { badge_type: 'item', allowed_badge_ids: ['badge-item-b'] },
  ],
  reward_points: 10,
}

const patch = (extra: Record<string, unknown> = {}) =>
  PATCH(
    new NextRequest(`https://j-a-m.app/api/admin/recipes/${ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseBody, ...extra }),
    }),
    { params: Promise.resolve({ id: ID }) }
  )

beforeEach(() => {
  state.existingGradeMode = 'fixed'
  state.existingFirstSuccess = null
  state.successLogCount = 0
  state.updates = []
  state.existingSelect = ''
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('PATCH /api/admin/recipes/[id] — 첫 성공자 보상·유형', () => {
  it('기존 행에서 유형과 첫 성공자 보상 칸을 함께 읽는다', async () => {
    await patch()

    expect(state.existingSelect).toContain('grade_mode')
    expect(state.existingSelect).toContain('first_success_badge_id')
  })

  it('성공 기록이 없는 레시피에 첫 성공자 보상을 켜면 행에 실려 저장된다', async () => {
    const res = await patch({ first_success_badge_id: 'first-1' })

    expect(res.status).toBe(200)
    expect(state.updates[0].first_success_badge_id).toBe('first-1')
  })

  it('이미 성공 기록이 있는 레시피에 첫 성공자 보상을 켜면 400이고 저장하지 않는다', async () => {
    state.successLogCount = 2

    const res = await patch({ first_success_badge_id: 'first-1' })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('이미 믹스에 성공한 유저가 있는 레시피')
    expect(state.updates).toHaveLength(0)
  })

  it('성공 기록이 있어도 기존과 같은 배지를 다시 보내는 수정은 저장된다', async () => {
    state.successLogCount = 2
    state.existingFirstSuccess = 'first-1'

    const res = await patch({ first_success_badge_id: 'first-1' })

    expect(res.status).toBe(200)
    expect(state.updates).toHaveLength(1)
  })

  it('기존과 다른 유형을 보내면 400이고 저장하지 않는다', async () => {
    state.existingGradeMode = 'follow_materials'

    const res = await patch({ grade_mode: 'fixed' })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('유형은 등록한 뒤에 바꿀 수 없어요')
    expect(state.updates).toHaveLength(0)
  })

  it('유형을 보내면 행에 실린다', async () => {
    const res = await patch({ grade_mode: 'fixed' })

    expect(res.status).toBe(200)
    expect(state.updates[0].grade_mode).toBe('fixed')
  })
})
