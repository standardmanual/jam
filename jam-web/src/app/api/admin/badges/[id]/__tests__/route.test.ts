/**
 * PATCH /api/admin/badges/[id] 비활성화 — 이미 비활성인 배지의 `deleted_at`을 다시 쓰지 않는다
 * (티켓 20260924_1404). PUT `image_url` 비문자열 400의 라우트 배선(티켓 20260926_1510).
 * DB는 기록형 스텁이다.
 * 실행: cd jam-web && npx vitest run "src/app/api/admin/badges/[id]/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const ORIGINAL_DELETED_AT = '2026-09-01T00:00:00.000Z'

const state = vi.hoisted(() => ({
  row: null as { id: string; deleted_at: string | null; [key: string]: unknown } | null,
  /** 배지 단건 조회(`select().eq().maybeSingle()`)에 주입할 DB 오류 */
  readError: null as { message: string } | null,
  updates: [] as Record<string, unknown>[],
  sideEffectIds: [] as string[][],
}))

const fakeClient = {
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: state.readError ? null : state.row, error: state.readError }),
        // PUT은 기존 행을 `single()`로 읽는다(없으면 404).
        single: () => Promise.resolve({ data: state.row, error: state.row ? null : { message: 'none' } }),
      }),
    }),
    update: (patch: Record<string, unknown>) => {
      state.updates.push(patch)
      return {
        eq: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({ data: state.row ? { ...state.row, ...patch } : null, error: state.row ? null : { message: 'none' } }),
          }),
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
vi.mock('@/lib/admin/badge-deactivate', () => ({
  runBadgeDeactivationSideEffects: async (_supabase: unknown, ids: string[]) => {
    state.sideEffectIds.push(ids)
  },
}))

const { PATCH, PUT } = await import('../route')

const patch = (active: boolean) =>
  PATCH(
    new NextRequest('https://j-a-m.app/api/admin/badges/b1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    }),
    { params: Promise.resolve({ id: 'b1' }) }
  )

beforeEach(() => {
  state.row = null
  state.readError = null
  state.updates = []
  state.sideEffectIds = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('PATCH /api/admin/badges/[id] — 비활성화', () => {
  it('이미 비활성이면 갱신·부수효과 없이 원래 deleted_at 그대로 돌려준다', async () => {
    state.row = { id: 'b1', deleted_at: ORIGINAL_DELETED_AT }
    const res = await patch(false)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.alreadyInactive).toBe(true)
    expect(data.badge.deleted_at).toBe(ORIGINAL_DELETED_AT)
    expect(state.updates).toEqual([])
    expect(state.sideEffectIds).toEqual([])
  })

  it('활성 배지는 deleted_at을 쓰고 부수효과를 실행한다', async () => {
    state.row = { id: 'b1', deleted_at: null }
    const res = await patch(false)
    expect(res.status).toBe(200)
    expect(state.updates).toHaveLength(1)
    expect(typeof state.updates[0].deleted_at).toBe('string')
    expect(state.sideEffectIds).toEqual([['b1']])
  })

  it('없는 배지는 404다', async () => {
    const res = await patch(false)
    expect(res.status).toBe(404)
    expect(state.updates).toEqual([])
  })

  it('조회 오류면 500과 한국어 안내를 돌려주고 갱신·부수효과·DB 원문 노출이 없다', async () => {
    state.readError = { message: 'connection reset' }
    state.row = { id: 'b1', deleted_at: null }
    const res = await patch(false)
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toMatch(/^배지 상태를 확인하지 못했어요\./)
    expect(JSON.stringify(data)).not.toContain('connection reset')
    expect(state.updates).toEqual([])
    expect(state.sideEffectIds).toEqual([])
    expect(console.error).toHaveBeenCalled()
  })

  it('되살리기(active: true)는 조회 없이 deleted_at을 null로 되돌린다', async () => {
    state.row = { id: 'b1', deleted_at: ORIGINAL_DELETED_AT }
    const res = await patch(true)
    expect(res.status).toBe(200)
    expect(state.updates).toEqual([{ deleted_at: null }])
    expect(state.sideEffectIds).toEqual([])
  })
})

const put = (body: Record<string, unknown>) =>
  PUT(
    new NextRequest('https://j-a-m.app/api/admin/badges/b1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'b1' }) }
  )

describe('PUT /api/admin/badges/[id] — image_url 형식 검사(라우트 배선)', () => {
  const existing = {
    id: 'b1',
    deleted_at: null,
    name: '기존 배지',
    type: 'checkin',
    rarity: 'common',
    level: null,
    condition_json: null,
    image_url: 'https://cdn.example/old.png',
    image_source: 'generator',
  }

  it.each([
    ['숫자', 123],
    ['객체', { url: 'x' }],
    ['배열', ['x']],
    ['불리언', true],
  ])('image_url이 %s 값이면 400과 고정 문구를 돌려주고 갱신하지 않는다', async (_label, value) => {
    state.row = { ...existing }
    const res = await put({ image_url: value })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('이미지 주소는 문자열이어야 합니다.')
    expect(state.updates).toEqual([])
  })

  it('image_url이 문자열이면 정상 수정하고 바뀐 이미지는 제작 경로를 되돌린다', async () => {
    state.row = { ...existing }
    const res = await put({ image_url: 'https://cdn.example/new.png' })
    expect(res.status).toBe(200)
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].image_url).toBe('https://cdn.example/new.png')
    expect(state.updates[0].image_source).toBeNull()
  })

  it('image_url 없이 보내면 기존 이미지를 유지하고 제작 경로도 건드리지 않는다', async () => {
    state.row = { ...existing }
    const res = await put({ name: '새 이름' })
    expect(res.status).toBe(200)
    expect(state.updates[0].image_url).toBe('https://cdn.example/old.png')
    expect(state.updates[0]).not.toHaveProperty('image_source')
  })
})
