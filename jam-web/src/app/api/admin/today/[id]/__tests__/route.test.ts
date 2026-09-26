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
  /** 오류 주입 — 값이 있으면 해당 호출이 이 오류를 돌려준다 */
  readError: null as { message: string } | null,
  updateError: null as { message: string } | null,
  deleteError: null as { message: string } | null,
}))

const fakeClient = {
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => {
          state.reads += 1
          return Promise.resolve({ data: state.readError ? null : state.existing, error: state.readError })
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
                state.updateError ? { data: null, error: state.updateError } : { data: { id: 'c1', ...patch }, error: null }
              ),
          }),
        }),
      }
    },
    delete: () => ({ eq: () => Promise.resolve({ error: state.deleteError }) }),
  }),
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeClient }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  requireAdmin: async () => null,
}))

const { PATCH, DELETE } = await import('../route')

const patch = (body: unknown) =>
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
  state.readError = null
  state.updateError = null
  state.deleteError = null
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

describe('PATCH /api/admin/today/[id] — 이미지 필드 null·빈 문자열, null 본문(티켓 20260926_1601)', () => {
  it.each([
    ['null', null],
    ['빈 문자열', ''],
  ])('cover_image_url이 %s이어도 400이 아니고 값 없음으로 수정되며 제작 경로가 초기화된다', async (_label, value) => {
    const res = await patch({ cover_image_url: value })
    expect(res.status).toBe(200)
    expect(state.updates[0]).toMatchObject({ cover_image_url: value, image_source: null })
  })

  it('기존 커버가 이미 비어 있으면 빈 문자열로 보내도 제작 경로를 건드리지 않는다', async () => {
    state.existing = { cover_image_url: null }
    const res = await patch({ cover_image_url: '' })
    expect(res.status).toBe(200)
    expect(state.updates[0]).not.toHaveProperty('image_source')
    state.existing = { cover_image_url: 'https://cdn.test.jam.app/old.png' }
  })

  it('본문이 JSON null이면 500이 아니라 400이고 DB를 건드리지 않는다', async () => {
    const res = await patch(null)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('요청 형식이 올바르지 않습니다.')
    expect(state.reads).toBe(0)
    expect(state.updates).toEqual([])
  })
})

describe('/api/admin/today/[id] — DB 오류 원문 미노출(티켓 20260926_1602)', () => {
  const del = () =>
    DELETE(new NextRequest('https://j-a-m.app/api/admin/today/c1', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'c1' }),
    })

  async function expectFixed500(res: Response, raw: string, prefix: string) {
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain(raw)
    expect(vi.mocked(console.error).mock.calls.some((c) => String(c[0]).startsWith(prefix))).toBe(true)
  }

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('PATCH 기존 카드 조회 오류', async () => {
    state.readError = { message: 'read boom' }
    await expectFixed500(await patch({ cover_image_url: 'https://cdn.test.jam.app/new.png' }), 'read boom', '[today PATCH')
    expect(state.updates).toEqual([])
  })

  it('PATCH 저장 오류', async () => {
    state.updateError = { message: 'update boom' }
    await expectFixed500(await patch({ title: '새 제목' }), 'update boom', '[today PATCH')
  })

  it('DELETE 삭제 오류', async () => {
    state.deleteError = { message: 'delete boom' }
    await expectFixed500(await del(), 'delete boom', '[today DELETE')
  })
})
