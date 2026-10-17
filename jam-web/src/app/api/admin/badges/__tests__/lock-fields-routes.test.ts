/**
 * 어드민 배지 저장 라우트(POST·PUT) — 잠금 칸 검증 (티켓 20261018_0051 2회)
 *
 * 고정하는 것
 *  - 등급 최소값(`jam_policy.locked_min_*`)보다 적은 «여는 데 필요한 양»은 400이고 저장하지 않는다.
 *  - 비우면 통과하고 null로 저장한다. 최소값 이상은 통과한다.
 *  - 아이템 배지가 아니면 입력이 실려 와도 검사하지 않고 잠금 칸을 비워 저장한다.
 *  - PUT은 부분 body에서 기존 잠금 값을 유지한다.
 * 실제 DB를 부르지 않는다: Supabase 클라이언트와 정책 읽기는 가짜다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/badges/__tests__/lock-fields-routes.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { DEFAULT_JAM_POLICY } from '@/lib/jam/policy'

const state = vi.hoisted(() => ({
  existing: null as Record<string, unknown> | null,
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  policyReads: 0,
  policy: { locked_min_common: 30, locked_min_rare: 60, locked_min_epic: 120, locked_min_mystic: 240 },
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
vi.mock('@/lib/jam/policy', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/jam/policy')>()),
  getJamPolicy: async () => {
    state.policyReads += 1
    return { ...DEFAULT_JAM_POLICY, ...state.policy }
  },
}))

const { POST } = await import('../route')
const { PUT } = await import('../[id]/route')

const BASE_BODY = {
  name: '녹슨 열쇠',
  description: '설명',
  type: 'item',
  rarity: 'rare',
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
    name: '녹슨 열쇠',
    description: '설명',
    type: 'item',
    rarity: 'rare',
    level: null,
    family_key: null,
    image_url: 'https://cdn.test/x.webp',
    condition_json: null,
    always_locked: true,
    unlock_required: 90,
  }
  state.inserts = []
  state.updates = []
  state.policyReads = 0
  state.policy = { locked_min_common: 30, locked_min_rare: 60, locked_min_epic: 120, locked_min_mystic: 240 }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/admin/badges — 잠금 칸', () => {
  it('등급 최소값보다 적은 필요한 양은 400이고 저장하지 않는다', async () => {
    const res = await post({ always_locked: true, unlock_required: 59 })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('60잼')
    expect(state.inserts).toEqual([])
  })

  it('최소값 이상이면 저장한다', async () => {
    const res = await post({ always_locked: true, unlock_required: 60 })

    expect(res.status).toBe(201)
    expect(state.inserts[0]).toMatchObject({ always_locked: true, unlock_required: 60 })
  })

  it('비우면 통과하고 null로 저장한다. 정책은 읽지 않는다', async () => {
    const res = await post({ always_locked: true, unlock_required: '' })

    expect(res.status).toBe(201)
    expect(state.inserts[0]).toMatchObject({ always_locked: true, unlock_required: null })
    expect(state.policyReads).toBe(0)
  })

  it('정책 최소값이 바뀌면 판정이 따라간다', async () => {
    state.policy.locked_min_rare = 100

    expect((await post({ unlock_required: 90 })).status).toBe(400)
    expect((await post({ unlock_required: 100 })).status).toBe(201)
  })

  it('정수가 아닌 값은 400이다', async () => {
    expect((await post({ unlock_required: 'abc' })).status).toBe(400)
    expect(state.inserts).toEqual([])
  })

  it('아이템 배지가 아니면 검사하지 않고 잠금 칸을 비워 저장한다', async () => {
    const res = await post({ type: 'activity', rarity: 'common', always_locked: true, unlock_required: 1 })

    expect(res.status).toBe(201)
    expect(state.inserts[0]).toMatchObject({ always_locked: false, unlock_required: null })
    expect(state.policyReads).toBe(0)
  })
})

describe('PUT /api/admin/badges/[id] — 잠금 칸', () => {
  it('등급 최소값보다 적은 필요한 양은 400이고 갱신하지 않는다', async () => {
    const res = await put({ unlock_required: 30 })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('Rare')
    expect(state.updates).toEqual([])
  })

  it('비우면 null로 저장하고 잠김 여부는 기존 값을 유지한다', async () => {
    const res = await put({ unlock_required: null })

    expect(res.status).toBe(200)
    expect(state.updates[0]).toMatchObject({ always_locked: true, unlock_required: null })
  })

  it('부분 body는 기존 잠금 값을 그대로 유지한다', async () => {
    const res = await put({ name: '새 이름' })

    expect(res.status).toBe(200)
    expect(state.updates[0]).toMatchObject({ always_locked: true, unlock_required: 90 })
  })

  it('등급을 올리면 기존 필요한 양도 새 등급 최소값으로 다시 판정한다', async () => {
    const res = await put({ rarity: 'epic' })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('120잼')
  })

  it('아이템 배지가 아닌 종류로 바꾸면 잠금 칸을 비운다', async () => {
    const res = await put({ type: 'activity', rarity: 'common' })

    expect(res.status).toBe(200)
    expect(state.updates[0]).toMatchObject({ always_locked: false, unlock_required: null })
  })
})
