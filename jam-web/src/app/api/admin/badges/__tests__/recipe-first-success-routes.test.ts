/**
 * 어드민 배지 저장 라우트(POST·PUT) — 최초 성공 레시피 존재 검사 배선 (티켓 20261001_1415)
 *
 * `findRecipeFirstSuccessNotFoundError`는 함수 단위 테스트만 있어, 라우트에서 호출 줄이 지워져도 CI가
 * 통과하고 없는 레시피를 가리키는 배지(영원히 발급되지 않는다)가 저장될 수 있었다. 라우트를 실제로 불러
 * 없는 레시피 ID는 400이고 저장하지 않는지, 있는 레시피 ID는 저장되는지 고정한다.
 * 검증 함수는 실제 함수를 쓰고, Supabase 클라이언트만 가짜다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/badges/__tests__/recipe-first-success-routes.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const EXISTING_RECIPE_ID = '3f2a1c7e-8b4d-4e6f-9a10-2b3c4d5e6f70'
const MISSING_RECIPE_ID = '11111111-2222-4333-8444-555555555555'

const state = vi.hoisted(() => ({
  existing: null as Record<string, unknown> | null,
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  /** `combination_recipes`에 실제로 있는 레시피 ID */
  recipeIds: [] as string[],
  /** `combination_recipes`에 던진 존재 확인 질의의 레시피 ID */
  recipeQueries: [] as string[],
}))

/** 어떤 필터 체인이든 받고, 끝(await)에서는 빈 목록을 돌려준다. `.single()`은 기존 배지다. */
function readBuilder(): unknown {
  return new Proxy(
    {},
    {
      get(_target, method) {
        if (typeof method !== 'string') return undefined
        if (method === 'then') {
          return (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null })
        }
        if (method === 'single') {
          return () => Promise.resolve({ data: state.existing, error: state.existing ? null : { message: 'none' } })
        }
        if (method === 'maybeSingle') {
          return () => Promise.resolve({ data: null, error: null })
        }
        return () => readBuilder()
      },
    }
  )
}

/** 레시피 존재 확인(`select('id').eq('id', …).maybeSingle()`)만 레시피 목록에 대조해 답한다 */
function recipeReadBuilder(): unknown {
  let id = ''
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (_column: string, value: string) => {
      id = value
      state.recipeQueries.push(value)
      return builder
    },
    maybeSingle: () => Promise.resolve({ data: state.recipeIds.includes(id) ? { id } : null, error: null }),
  }
  return builder
}

const fakeClient = {
  from: (table: string) => ({
    select: () => (table === 'combination_recipes' ? recipeReadBuilder() : readBuilder()),
    insert: (payload: Record<string, unknown>) => {
      state.inserts.push(payload)
      return { select: () => ({ single: () => Promise.resolve({ data: { id: 'new-badge', ...payload }, error: null }) }) }
    },
    update: (patch: Record<string, unknown>) => {
      state.updates.push(patch)
      return {
        eq: () => ({
          select: () => ({ single: () => Promise.resolve({ data: { ...state.existing, ...patch }, error: null }) }),
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

const { POST } = await import('../route')
const { PUT } = await import('../[id]/route')

const conditionOf = (recipeId: string) => ({ recipe_first_success: { recipe_id: recipeId } })

const post = (body: Record<string, unknown>) =>
  POST(
    new NextRequest('https://j-a-m.app/api/admin/badges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '첫 조합 성공',
        description: '설명',
        type: 'activity',
        rarity: 'common',
        image_url: 'https://cdn.test/x.webp',
        ...body,
      }),
    })
  )

const put = (body: Record<string, unknown>) =>
  PUT(
    new NextRequest('https://j-a-m.app/api/admin/badges/b1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'b1' }) }
  )

beforeEach(() => {
  state.existing = {
    id: 'b1',
    name: '첫 조합 성공',
    description: '설명',
    type: 'activity',
    rarity: 'common',
    level: null,
    family_key: null,
    image_url: 'https://cdn.test/x.webp',
    condition_json: null,
    point_reward: 0,
    is_hidden: false,
    branch_key: null,
  }
  state.inserts = []
  state.updates = []
  state.recipeIds = [EXISTING_RECIPE_ID]
  state.recipeQueries = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/admin/badges — 최초 성공 레시피 존재 검사', () => {
  it('없는 레시피 ID면 400과 안내를 돌려주고 저장하지 않는다', async () => {
    const res = await post({ condition_json: conditionOf(MISSING_RECIPE_ID) })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('존재하지 않는 레시피 ID')
    expect(state.recipeQueries).toEqual([MISSING_RECIPE_ID])
    expect(state.inserts).toEqual([])
  })

  it('있는 레시피 ID면 저장한다', async () => {
    const res = await post({ condition_json: conditionOf(EXISTING_RECIPE_ID) })

    expect(res.status).toBe(201)
    expect(state.recipeQueries).toEqual([EXISTING_RECIPE_ID])
    expect(state.inserts[0]).toMatchObject({ condition_json: conditionOf(EXISTING_RECIPE_ID) })
  })
})

describe('PUT /api/admin/badges/[id] — 최초 성공 레시피 존재 검사', () => {
  it('없는 레시피 ID로 바꾸면 400과 안내를 돌려주고 갱신하지 않는다', async () => {
    const res = await put({ condition_json: conditionOf(MISSING_RECIPE_ID) })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('존재하지 않는 레시피 ID')
    expect(state.recipeQueries).toEqual([MISSING_RECIPE_ID])
    expect(state.updates).toEqual([])
  })

  it('있는 레시피 ID로 바꾸면 갱신한다', async () => {
    const res = await put({ condition_json: conditionOf(EXISTING_RECIPE_ID) })

    expect(res.status).toBe(200)
    expect(state.recipeQueries).toEqual([EXISTING_RECIPE_ID])
    expect(state.updates[0]).toMatchObject({ condition_json: conditionOf(EXISTING_RECIPE_ID) })
  })
})
