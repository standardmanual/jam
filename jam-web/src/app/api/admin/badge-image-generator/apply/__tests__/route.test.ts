/**
 * /api/admin/badge-image-generator/apply — 대표색 배선 (티켓 20261119_1652)
 * 아이템 배지 4행에 같은 이미지를 한 번에 쓰므로 대표색은 한 번만 뽑아 같은 update에 담는다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/badge-image-generator/apply
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const ROW_IDS = ['b1', 'b2', 'b3', 'b4']

const state = vi.hoisted(() => ({
  updates: [] as Record<string, unknown>[],
  updateIds: [] as string[][],
}))
const bgColorsMock = vi.hoisted(() => vi.fn<(url: string | null) => Promise<{ bg_colors?: string[] }>>(async () => ({})))

function makeBuilder(table: string) {
  const b: Record<string, unknown> = {}
  let isUpdate = false
  b.select = vi.fn(() => b)
  b.eq = vi.fn(() => b)
  b.in = vi.fn((_col: string, ids: string[]) => {
    state.updateIds.push(ids)
    return b
  })
  b.update = vi.fn((payload: Record<string, unknown>) => {
    if (table === 'badges') state.updates.push(payload)
    isUpdate = true
    return b
  })
  b.maybeSingle = vi.fn(async () => ({
    data: {
      id: 'gen-1',
      status: 'generated',
      candidate_urls: ['https://r.test/c0.png', 'https://r.test/c1.png'],
      item_book_id: 'book-1',
      item_name: '아이템',
    },
    error: null,
  }))
  ;(b as { then: PromiseLike<unknown>['then'] }).then = (resolve, reject) => {
    let result: unknown
    if (table === 'badges' && !isUpdate) {
      result = { data: ROW_IDS.map((id) => ({ id, image_url: 'https://cdn.test/old.webp' })), error: null }
    } else if (table === 'badges') {
      result = { data: ROW_IDS.map((id) => ({ id })), error: null }
    } else {
      result = { error: null }
    }
    return Promise.resolve(result).then(resolve, reject)
  }
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (t: string) => makeBuilder(t),
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
vi.mock('@/lib/admin/badgeImageWebp', () => ({ convertBadgeImageToWebp: async () => Buffer.from('webp') }))
vi.mock('@/lib/admin/badgeImageGenerator/claude', () => ({ checkImageHasNoText: async () => true }))
vi.mock('@/lib/admin/badgeImageGenerator/normalize', () => ({ normalizeBadgeImage: async () => Buffer.from('png') }))
vi.mock('@/lib/admin/badgeImageGenerator/recraft', () => ({
  downloadImage: async () => Buffer.from('orig'),
  removeBackground: async () => Buffer.from('transparent'),
}))
vi.mock('@/lib/images/warmImageVariants', () => ({ warmImageVariants: vi.fn() }))
vi.mock('next/server', async (importActual) => ({
  ...(await importActual<typeof import('next/server')>()),
  after: vi.fn(),
}))

const { POST } = await import('../route')

const req = () =>
  new NextRequest('https://j-a-m.app/api/admin/badge-image-generator/apply', {
    method: 'POST',
    body: JSON.stringify({ generationId: 'gen-1', index: 0 }),
  })

beforeEach(() => {
  state.updates = []
  state.updateIds = []
  bgColorsMock.mockReset()
  bgColorsMock.mockResolvedValue({})
})

describe('badge-image-generator/apply — 대표색', () => {
  it('새 이미지에서 한 번만 뽑아 4행 update에 image_url과 함께 담는다', async () => {
    bgColorsMock.mockResolvedValue({ bg_colors: ['#ff8800', '#2244aa'] })
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(bgColorsMock).toHaveBeenCalledTimes(1)
    expect(state.updates).toHaveLength(1)
    expect(state.updateIds[0]).toEqual(ROW_IDS)
    expect(state.updates[0].bg_colors).toEqual(['#ff8800', '#2244aa'])
    expect(bgColorsMock).toHaveBeenCalledWith(state.updates[0].image_url)
  })

  it('추출이 실패해도 적용은 성공하고 bg_colors는 담지 않는다', async () => {
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(state.updates[0]).toHaveProperty('image_url')
    expect(state.updates[0]).not.toHaveProperty('bg_colors')
  })
})
