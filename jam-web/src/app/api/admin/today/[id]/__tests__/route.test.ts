/**
 * PATCH /api/admin/today/[id] — 비문자열 cover_image_url은 400으로 거절한다(티켓 20260926_1455).
 * 이 라우트의 이미지 컬럼은 `cover_image_url`이다. DB는 기록형 스텁이고 실제 조회는 하지 않는다.
 * 실행: cd jam-web && npx vitest run "src/app/api/admin/today/[id]/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  existing: { cover_image_url: 'https://cdn.test.jam.app/old.png' } as Record<string, unknown>,
  reads: 0,
  updates: [] as Record<string, unknown>[],
}))

const fakeClient = {
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => {
          state.reads += 1
          return Promise.resolve({ data: state.existing, error: null })
        },
      }),
    }),
    update: (patch: Record<string, unknown>) => {
      state.updates.push(patch)
      return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'c1', ...patch }, error: null }) }) }) }
    },
  }),
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeClient }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  requireAdmin: async () => null,
}))

const { PATCH } = await import('../route')

const patch = (body: Record<string, unknown>) =>
  PATCH(
    new NextRequest('https://j-a-m.app/api/admin/today/c1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'c1' }) }
  )

beforeEach(() => {
  state.reads = 0
  state.updates = []
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('PATCH /api/admin/today/[id] — cover_image_url 형식', () => {
  it.each([123, { url: 'x' }, ['a'], true])('비문자열 cover_image_url(%j)은 400이고 DB를 건드리지 않는다', async (bad) => {
    const res = await patch({ cover_image_url: bad })
    expect(res.status).toBe(400)
    expect(state.reads).toBe(0)
    expect(state.updates).toEqual([])
  })

  it('문자열 cover_image_url로 바꾸면 수정되고 제작 경로(image_source)가 초기화된다', async () => {
    const res = await patch({ cover_image_url: 'https://cdn.test.jam.app/new.png' })
    expect(res.status).toBe(200)
    expect(state.updates[0]).toMatchObject({ cover_image_url: 'https://cdn.test.jam.app/new.png', image_source: null })
  })

  it('cover_image_url이 본문에 없으면 기존 행을 조회하지 않고 그대로 수정한다', async () => {
    const res = await patch({ title: '새 제목' })
    expect(res.status).toBe(200)
    expect(state.reads).toBe(0)
    expect(state.updates[0]).toMatchObject({ title: '새 제목' })
  })
})
