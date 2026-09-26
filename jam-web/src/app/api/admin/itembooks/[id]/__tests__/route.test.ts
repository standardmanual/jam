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
  deletes: 0,
  /** 오류 주입 — 값이 있으면 해당 호출이 이 오류를 돌려준다 */
  updateError: null as { message: string } | null,
  deleteError: null as { message: string } | null,
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
      return {
        eq: () => ({
          select: () => ({
            single: () =>
              Promise.resolve(
                state.updateError
                  ? { data: null, error: state.updateError }
                  : { data: { ...state.existing, ...patch }, error: null }
              ),
          }),
        }),
      }
    },
    delete: () => ({
      eq: () => {
        state.deletes += 1
        return Promise.resolve({ error: state.deleteError })
      },
    }),
  }),
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeClient }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  getAdminUser: async () => ({ id: 'admin-1', email: 'me@jam.app' }),
}))

// 삭제 경로의 참조 집계는 이 테스트의 관심사가 아니다 — 참조가 없다고 답하게 고정한다.
vi.mock('@/lib/admin/reference-guards', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/reference-guards')>()),
  collectItemBookReferences: async (_client: unknown, ids: string[]) => ({
    counts: new Map(ids.map((id) => [id, {}])),
    error: null,
  }),
}))

const { PUT, PATCH, DELETE } = await import('../route')

const put = (body: unknown) =>
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
  state.deletes = 0
  state.updateError = null
  state.deleteError = null
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

describe('PUT /api/admin/itembooks/[id] — 이미지 필드 null·빈 문자열, null 본문(티켓 20260926_1601)', () => {
  it.each([
    ['null', null],
    ['빈 문자열', ''],
  ])('image_url이 %s이어도 400이 아니고 값 없음으로 수정되며 제작 경로가 초기화된다', async (_label, value) => {
    const res = await put({ image_url: value })
    expect(res.status).toBe(200)
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0]).toMatchObject({ image_url: value, image_source: null })
  })

  it('기존 이미지가 이미 비어 있으면 빈 문자열로 보내도 제작 경로를 건드리지 않는다', async () => {
    state.existing = { ...state.existing, image_url: null }
    const res = await put({ image_url: '' })
    expect(res.status).toBe(200)
    expect(state.updates[0]).not.toHaveProperty('image_source')
    state.existing = { ...state.existing, image_url: 'https://cdn.test.jam.app/old.png' }
  })

  it('본문이 JSON null이면 500이 아니라 400이고 DB를 건드리지 않는다', async () => {
    const res = await put(null)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('요청 형식이 올바르지 않습니다.')
    expect(state.reads).toBe(0)
    expect(state.updates).toEqual([])
  })
})

describe('/api/admin/itembooks/[id] — DB 오류 원문 미노출(티켓 20260926_1602)', () => {
  const patchActive = () =>
    PATCH(
      new NextRequest('https://j-a-m.app/api/admin/itembooks/ib1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      }),
      { params: Promise.resolve({ id: 'ib1' }) }
    )
  const del = () =>
    DELETE(new NextRequest('https://j-a-m.app/api/admin/itembooks/ib1', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'ib1' }),
    })

  async function expectFixed500(res: Response, raw: string, prefix: string) {
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain(raw)
    expect(vi.mocked(console.error).mock.calls.some((c) => String(c[0]).startsWith(prefix))).toBe(true)
  }

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('PUT 저장 오류', async () => {
    state.updateError = { message: 'put boom' }
    await expectFixed500(await put({ name: '새 이름' }), 'put boom', '[itembooks PUT')
  })

  it('PATCH 활성 전환 오류', async () => {
    state.updateError = { message: 'patch boom' }
    await expectFixed500(await patchActive(), 'patch boom', '[itembooks PATCH')
  })

  it('DELETE 삭제 오류', async () => {
    state.deleteError = { message: 'delete boom' }
    await expectFixed500(await del(), 'delete boom', '[itembooks DELETE')
  })
})
