/**
 * 어드민 배지 저장 라우트(POST·PUT) — 숨김·가지 검증 (티켓 20261018_1816 1회)
 *
 * 고정하는 것
 *  - 숨김 배지는 액티비티만, 포인트 0, 등급 Common만(레벨형은 등급 없음) — 어기면 400이고 저장하지 않는다.
 *  - 일곱 가지 밖의 가지 값은 400이다. 비우면 null로 저장한다.
 *  - PUT은 부분 body에서 기존 숨김·가지 값을 유지하고, 병합한 값으로 같은 규칙을 건다.
 * 실제 DB를 부르지 않는다: Supabase 클라이언트는 가짜다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/badges/__tests__/hidden-branch-routes.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  existing: null as Record<string, unknown> | null,
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
}))

const fakeClient = {
  from: () => ({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: state.existing, error: state.existing ? null : { message: 'none' } }),
      }),
    }),
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

const BASE_BODY = {
  name: '숨은 이야기',
  description: '설명',
  type: 'activity',
  rarity: 'common',
  image_url: 'https://cdn.test/x.webp',
}

const post = (body: Record<string, unknown>) =>
  POST(
    new NextRequest('https://j-a-m.app/api/admin/badges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...BASE_BODY, ...body }),
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
    name: '숨은 이야기',
    description: '설명',
    type: 'activity',
    rarity: 'common',
    level: null,
    family_key: null,
    image_url: 'https://cdn.test/x.webp',
    condition_json: null,
    point_reward: 0,
    is_hidden: true,
    branch_key: 'milestone',
  }
  state.inserts = []
  state.updates = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/admin/badges — 숨김·가지', () => {
  it('숨김 액티비티 · Common · 포인트 0 · 가지를 저장한다', async () => {
    const res = await post({ is_hidden: true, point_reward: 0, branch_key: 'jam_activity' })

    expect(res.status).toBe(201)
    expect(state.inserts[0]).toMatchObject({ is_hidden: true, point_reward: 0, branch_key: 'jam_activity' })
  })

  it('숨김·가지를 보내지 않으면 숨김 아님·분류 없음으로 저장한다', async () => {
    const res = await post({ point_reward: 10, rarity: 'rare' })

    expect(res.status).toBe(201)
    expect(state.inserts[0]).toMatchObject({ is_hidden: false, branch_key: null, point_reward: 10 })
  })

  it('레벨형(등급 없음) 숨김 배지는 저장한다', async () => {
    const res = await post({ is_hidden: true, rarity: null, level: 1 })

    expect(res.status).toBe(201)
    expect(state.inserts[0]).toMatchObject({ is_hidden: true, rarity: null, level: 1 })
  })

  it('액티비티가 아닌 숨김 배지는 400이다', async () => {
    const res = await post({ is_hidden: true, type: 'item' })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('액티비티 배지에만')
    expect(state.inserts).toEqual([])
  })

  it('Common이 아닌 숨김 배지는 400이다', async () => {
    const res = await post({ is_hidden: true, rarity: 'rare' })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('Common')
    expect(state.inserts).toEqual([])
  })

  it('포인트가 있는 숨김 배지는 400이다', async () => {
    const res = await post({ is_hidden: true, point_reward: 10 })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('포인트 보상은 0')
    expect(state.inserts).toEqual([])
  })

  it('목록 밖의 가지 값은 400이다', async () => {
    const res = await post({ branch_key: 'running' })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('가지 값')
    expect(state.inserts).toEqual([])
  })

  it('가지를 빈 문자열로 보내면 null로 저장한다', async () => {
    const res = await post({ branch_key: '' })

    expect(res.status).toBe(201)
    expect(state.inserts[0]).toMatchObject({ branch_key: null })
  })
})

describe('PUT /api/admin/badges/[id] — 숨김·가지', () => {
  it('부분 body는 기존 숨김·가지 값을 유지한다', async () => {
    const res = await put({ description: '새 설명' })

    expect(res.status).toBe(200)
    expect(state.updates[0]).toMatchObject({ is_hidden: true, branch_key: 'milestone', point_reward: 0 })
  })

  it('숨김을 끄고 가지를 비울 수 있다', async () => {
    const res = await put({ is_hidden: false, branch_key: null, point_reward: 10 })

    expect(res.status).toBe(200)
    expect(state.updates[0]).toMatchObject({ is_hidden: false, branch_key: null, point_reward: 10 })
  })

  it('숨김 배지에 포인트를 넣으면 400이고 저장하지 않는다', async () => {
    const res = await put({ point_reward: 20 })

    expect(res.status).toBe(400)
    expect(state.updates).toEqual([])
  })

  it('숨김 배지의 등급을 Common 밖으로 바꾸면 400이다', async () => {
    const res = await put({ rarity: 'epic' })

    expect(res.status).toBe(400)
    expect(state.updates).toEqual([])
  })

  it('숨김 배지의 타입을 액티비티 밖으로 바꾸면 400이다', async () => {
    const res = await put({ type: 'item' })

    expect(res.status).toBe(400)
    expect(state.updates).toEqual([])
  })

  it('숨김이 아닌 배지를 숨김으로 바꾸려면 병합한 값이 규칙을 지켜야 한다', async () => {
    state.existing = { ...state.existing, is_hidden: false, branch_key: null, rarity: 'rare', point_reward: 20 }

    expect((await put({ is_hidden: true })).status).toBe(400)
    expect((await put({ is_hidden: true, rarity: 'common', point_reward: 0 })).status).toBe(200)
  })

  it('목록 밖의 가지 값은 400이다', async () => {
    const res = await put({ branch_key: 'running' })

    expect(res.status).toBe(400)
    expect(state.updates).toEqual([])
  })
})
