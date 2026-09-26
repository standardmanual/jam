/**
 * PUT /api/admin/itembooks/[id] — 비문자열 image_url은 400으로 거절한다(티켓 20260926_1455).
 * DB는 기록형 스텁이고 실제 조회는 하지 않는다.
 * 실행: cd jam-web && npx vitest run "src/app/api/admin/itembooks/[id]/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  existing: { id: 'ib1', image_url: 'https://cdn.test.jam.app/old.png', reward_points: 10 } as Record<string, unknown>,
  reads: 0,
  updates: [] as Record<string, unknown>[],
}))

const fakeClient = {
  from: () => ({
    select: () => ({
      eq: () => ({
        single: () => {
          state.reads += 1
          return Promise.resolve({ data: state.existing, error: null })
        },
      }),
    }),
    update: (patch: Record<string, unknown>) => {
      state.updates.push(patch)
      return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: { ...state.existing, ...patch }, error: null }) }) }) }
    },
  }),
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeClient }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  getAdminUser: async () => ({ id: 'admin-1', email: 'me@jam.app' }),
}))

const { PUT } = await import('../route')

const put = (body: Record<string, unknown>) =>
  PUT(
    new NextRequest('https://j-a-m.app/api/admin/itembooks/ib1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'ib1' }) }
  )

beforeEach(() => {
  state.reads = 0
  state.updates = []
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('PUT /api/admin/itembooks/[id] — image_url 형식', () => {
  it.each([123, { url: 'x' }, ['a'], true])('비문자열 image_url(%j)은 400이고 DB를 건드리지 않는다', async (bad) => {
    const res = await put({ image_url: bad })
    expect(res.status).toBe(400)
    expect(state.reads).toBe(0)
    expect(state.updates).toEqual([])
  })

  it('문자열 image_url로 바꾸면 수정되고 제작 경로(image_source)가 초기화된다', async () => {
    const res = await put({ image_url: 'https://cdn.test.jam.app/new.png' })
    expect(res.status).toBe(200)
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0]).toMatchObject({ image_url: 'https://cdn.test.jam.app/new.png', image_source: null })
  })

  it('image_url이 본문에 없으면 기존 값을 유지한다', async () => {
    const res = await put({ name: '새 이름' })
    expect(res.status).toBe(200)
    expect(state.updates[0]).toMatchObject({ name: '새 이름', image_url: 'https://cdn.test.jam.app/old.png' })
    expect(state.updates[0]).not.toHaveProperty('image_source')
  })
})
