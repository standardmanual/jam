/**
 * /api/admin/badge-image-generator/revert — 대표색 배선 (티켓 20261119_1652)
 * 되돌린 이미지의 대표색을 다시 뽑아 같은 update에 담는다(옛 색은 보관하지 않는다).
 * 실행: cd jam-web && npx vitest run src/app/api/admin/badge-image-generator/revert
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  updates: [] as Record<string, unknown>[],
  previousImageUrl: 'https://cdn.test/old.webp' as string | null,
}))
const bgColorsMock = vi.hoisted(() => vi.fn<(url: string | null) => Promise<{ bg_colors?: string[] }>>(async () => ({})))

function makeBuilder(table: string) {
  const b: Record<string, unknown> = {}
  let isUpdate = false
  let isLater = false
  b.select = vi.fn(() => b)
  b.eq = vi.fn(() => b)
  b.gt = vi.fn(() => {
    isLater = true
    return b
  })
  b.limit = vi.fn(() => b)
  b.update = vi.fn((payload: Record<string, unknown>) => {
    if (table === 'badges') state.updates.push(payload)
    isUpdate = true
    return b
  })
  b.maybeSingle = vi.fn(async () => ({
    data: {
      id: 'gen-1',
      status: 'applied',
      applied_at: '2026-11-19T00:00:00Z',
      item_book_id: 'book-1',
      item_name: '아이템',
      previous_image_url: state.previousImageUrl,
    },
    error: null,
  }))
  ;(b as { then: PromiseLike<unknown>['then'] }).then = (resolve, reject) => {
    let result: unknown = { error: null }
    if (isLater) result = { data: [], error: null }
    else if (table === 'badges' && isUpdate) result = { data: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }], error: null }
    return Promise.resolve(result).then(resolve, reject)
  }
  return b
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({ from: (t: string) => makeBuilder(t) }) }))
vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => ({ id: 'admin-1' }) }))
vi.mock('@/lib/admin/badgeBgColors', () => ({ badgeBgColorsFields: bgColorsMock }))

const { POST } = await import('../route')

const req = () =>
  new NextRequest('https://j-a-m.app/api/admin/badge-image-generator/revert', {
    method: 'POST',
    body: JSON.stringify({ generationId: 'gen-1' }),
  })

beforeEach(() => {
  state.updates = []
  state.previousImageUrl = 'https://cdn.test/old.webp'
  bgColorsMock.mockReset()
  bgColorsMock.mockResolvedValue({})
})

describe('badge-image-generator/revert — 대표색', () => {
  it('되돌린 이미지에서 대표색을 다시 뽑아 같은 update에 담는다', async () => {
    bgColorsMock.mockResolvedValue({ bg_colors: ['#00aa55'] })
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(bgColorsMock).toHaveBeenCalledWith('https://cdn.test/old.webp')
    expect(state.updates).toEqual([{ image_url: 'https://cdn.test/old.webp', bg_colors: ['#00aa55'] }])
  })

  it('추출이 실패해도 되돌리기는 성공하고 bg_colors는 담지 않는다', async () => {
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(state.updates).toEqual([{ image_url: 'https://cdn.test/old.webp' }])
  })
})
