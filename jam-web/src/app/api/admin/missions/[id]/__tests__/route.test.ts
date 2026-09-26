/**
 * PATCH /api/admin/missions/[id] — `image_url` 비문자열 400의 라우트 배선(티켓 20260926_1510).
 * `imageUrlTypeError` 순수 함수 테스트만으로는 호출부가 빠져도 통과하므로 라우트 단위로 고정한다.
 * DB는 기록형 스텁이다.
 * 실행: cd jam-web && npx vitest run "src/app/api/admin/missions/[id]/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  /** 미션 행 — null이면 조회 결과 없음 */
  row: null as { id: string; image_url: string | null } | null,
  updates: [] as Record<string, unknown>[],
  selects: 0,
}))

const fakeClient = {
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => {
          state.selects += 1
          return Promise.resolve({ data: state.row, error: null })
        },
      }),
    }),
    update: (patch: Record<string, unknown>) => {
      state.updates.push(patch)
      return {
        eq: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: state.row ? { ...state.row, ...patch } : null, error: null }),
          }),
        }),
      }
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
    new NextRequest('https://j-a-m.app/api/admin/missions/m1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'm1' }) }
  )

beforeEach(() => {
  state.row = { id: 'm1', image_url: 'https://cdn.example/old.png' }
  state.updates = []
  state.selects = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('PATCH /api/admin/missions/[id] — image_url 형식 검사(라우트 배선)', () => {
  it.each([
    ['숫자', 123],
    ['객체', { url: 'x' }],
    ['배열', ['x']],
    ['불리언', true],
  ])('image_url이 %s 값이면 400과 고정 문구를 돌려주고 조회·갱신하지 않는다', async (_label, value) => {
    const res = await patch({ image_url: value })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('이미지 주소는 문자열이어야 합니다.')
    expect(state.selects).toBe(0)
    expect(state.updates).toEqual([])
  })

  it('image_url이 문자열이면 정상 수정하고 바뀐 이미지는 제작 경로를 되돌린다', async () => {
    const res = await patch({ image_url: 'https://cdn.example/new.png' })
    expect(res.status).toBe(200)
    expect(state.updates).toEqual([{ image_url: 'https://cdn.example/new.png', image_source: null }])
  })

  it('image_url이 기존과 같으면 제작 경로를 건드리지 않는다', async () => {
    const res = await patch({ image_url: 'https://cdn.example/old.png' })
    expect(res.status).toBe(200)
    expect(state.updates).toEqual([{ image_url: 'https://cdn.example/old.png' }])
  })

  it('image_url이 null이어도 형식 오류가 아니다(값 없음으로 수정한다)', async () => {
    const res = await patch({ image_url: null })
    expect(res.status).toBe(200)
    expect(state.updates).toHaveLength(1)
  })
})
