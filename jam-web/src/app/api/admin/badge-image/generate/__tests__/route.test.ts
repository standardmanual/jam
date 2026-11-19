/**
 * /api/admin/badge-image/generate — 대표색 배선 (티켓 20261119_1652)
 * 렌더링 엔진·Storage·DB는 흉내 낸다. 확인하는 것은 image_url과 bg_colors가 같은 update에 들어가는지다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/badge-image/generate
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { BADGE_IMAGE_DESIGNS } from '@/lib/admin/badgeImageDesigns'

const state = vi.hoisted(() => ({
  updates: [] as Record<string, unknown>[],
}))
const bgColorsMock = vi.hoisted(() => vi.fn<(url: string | null) => Promise<{ bg_colors?: string[] }>>(async () => ({})))

const fakeEngine = {
  prepareRenderContext: async () => ({ fontData: null, backgroundSvg: '', widthOf: () => 0 }),
  renderBadgeWithText: async () => Buffer.from('png'),
}

function makeBuilder(isUpdate = false) {
  const b: Record<string, unknown> = {}
  b.select = vi.fn(() => b)
  b.eq = vi.fn(() => b)
  b.is = vi.fn(() => b)
  b.maybeSingle = vi.fn(async () => ({ data: { id: 'badge-1', name: '체크인 배지' }, error: null }))
  b.update = vi.fn((payload: Record<string, unknown>) => {
    state.updates.push(payload)
    return makeBuilder(true)
  })
  if (isUpdate) {
    ;(b as { then: PromiseLike<unknown>['then'] }).then = (resolve, reject) =>
      Promise.resolve({ error: null }).then(resolve, reject)
  }
  return b
}

vi.mock('node:module', async (importActual) => ({
  ...(await importActual<typeof import('node:module')>()),
  createRequire: () => (id: string) => (id.includes('engine') ? fakeEngine : {}),
}))
vi.mock('next/og', () => ({ ImageResponse: class {} }))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => makeBuilder(),
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/images/${p}` } }),
      }),
    },
  }),
}))
vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => ({ id: 'admin-1' }) }))
vi.mock('@/lib/admin/badgeBgColors', () => ({ badgeBgColorsFields: bgColorsMock }))
vi.mock('@/lib/images/warmImageVariants', () => ({ warmImageVariants: vi.fn() }))
vi.mock('next/server', async (importActual) => ({
  ...(await importActual<typeof import('next/server')>()),
  after: vi.fn(),
}))

const { POST } = await import('../route')

const req = () =>
  new NextRequest('https://j-a-m.app/api/admin/badge-image/generate', {
    method: 'POST',
    body: JSON.stringify({ badgeId: 'badge-1', designId: BADGE_IMAGE_DESIGNS[0].configId, text: '체크인' }),
  })

beforeEach(() => {
  state.updates = []
  bgColorsMock.mockReset()
  bgColorsMock.mockResolvedValue({})
})

describe('badge-image/generate — 대표색', () => {
  it('새 이미지의 대표색을 image_url과 같은 update에 담는다', async () => {
    bgColorsMock.mockResolvedValue({ bg_colors: ['#ff8800'] })
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].bg_colors).toEqual(['#ff8800'])
    expect(bgColorsMock).toHaveBeenCalledWith(state.updates[0].image_url)
  })

  it('추출이 실패해도 저장은 성공하고 bg_colors는 담지 않는다', async () => {
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(state.updates[0]).toHaveProperty('image_url')
    expect(state.updates[0]).not.toHaveProperty('bg_colors')
  })
})
