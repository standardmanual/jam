/**
 * /api/admin/activity-badge-image/search 분류 필터 (티켓 20261116_1442)
 * Supabase와 권한만 흉내 낸다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/activity-badge-image
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let adminUser: { id: string } | null = { id: 'admin-1' }
let dbRows: Record<string, unknown>[] = []
let dbError: { message: string } | null = null
let dbCount = 0
const ranges: [number, number][] = []

function makeBuilder() {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'or', 'ilike', 'not', 'contains', 'order']) b[m] = vi.fn(() => b)
  b.range = vi.fn(async (from: number, to: number) => {
    ranges.push([from, to])
    if (dbError) return { data: null, error: dbError, count: null }
    return { data: dbRows.slice(from, to + 1), error: null, count: dbCount }
  })
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: () => makeBuilder() }),
}))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  getAdminUser: vi.fn(async () => adminUser),
}))

const { POST } = await import('../route')

const row = (i: number, cond: Record<string, unknown>) => ({
  id: `id-${i}`, name: `배지 ${i}`, description: '', rarity: 'common', level: null, activity_types: [],
  image_url: null, image_gen_params: null, condition_json: cond, is_hidden: false, family_key: null,
})
const call = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/admin/activity-badge-image/search', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => {
  adminUser = { id: 'admin-1' }
  dbError = null
  ranges.length = 0
})

describe('검색 API 분류 필터', () => {
  it('권한이 없으면 403', async () => {
    adminUser = null
    expect((await call({})).status).toBe(403)
  })

  it('분류 조건이 없으면 range로 한 페이지만 읽고 DB count가 total', async () => {
    dbRows = Array.from({ length: 5 }, (_, i) => row(i, { single_distance_km: 5 }))
    dbCount = 390
    const json = await (await call({ page: 2 })).json()
    expect(ranges).toEqual([[50, 99]])
    expect(json.total).toBe(390)
    expect(json.totalPages).toBe(8)
  })

  it('분류 조건이 있으면 걸러 낸 뒤의 수로 total·totalPages를 낸다', async () => {
    dbRows = [
      ...Array.from({ length: 60 }, (_, i) => row(i, { single_distance_km: 5 })),
      ...Array.from({ length: 30 }, (_, i) => row(100 + i, { streak_days: 3 })),
    ]
    const json = await (await call({ templateClass: 'metric' })).json()
    expect(json.badges).toHaveLength(50)
    expect(json.badges.every((b: { templateClass: string }) => b.templateClass === 'metric')).toBe(true)
    expect(json.total).toBe(60)
    expect(json.totalPages).toBe(2)
  })

  it('etc로 부르면 기타 분류 배지만 돌려준다', async () => {
    dbRows = [
      row(1, { total_count: 30, activity_type: 'running' }),
      row(2, { weekly_count: 3 }),
      row(3, { single_distance_km: 5 }),
    ]
    const json = await (await call({ templateClass: 'etc' })).json()
    expect(json.total).toBe(2)
    expect(json.badges.every((b: { templateClass: string }) => b.templateClass === 'etc')).toBe(true)
  })

  it('1,000줄을 넘으면 두 번 읽어 모두 거른다', async () => {
    dbRows = Array.from({ length: 1200 }, (_, i) => row(i, i % 2 === 0 ? { single_distance_km: 5 } : { streak_days: 3 }))
    const json = await (await call({ templateClass: 'metric', page: 12 })).json()
    expect(ranges).toEqual([[0, 999], [1000, 1999]])
    expect(json.total).toBe(600)
    expect(json.badges).toHaveLength(50)
  })

  it('이미지가 있는 배지는 imageUrl을 싣고 없는 배지는 null이며 hasImage는 그대로다', async () => {
    dbRows = [
      { ...row(1, { single_distance_km: 5 }), image_url: 'https://cdn.example.com/b.png?v=3' },
      row(2, { single_distance_km: 5 }),
    ]
    const json = await (await call({})).json()
    expect(json.badges[0]).toMatchObject({ imageUrl: 'https://cdn.example.com/b.png?v=3', hasImage: true })
    expect(json.badges[1]).toMatchObject({ imageUrl: null, hasImage: false })
  })

  it('DB 오류면 500', async () => {
    dbError = { message: 'RAW' }
    const res = await call({ templateClass: 'metric' })
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('배지를 검색하지 못했어요. 잠시 후 다시 시도해 주세요.')
  })
})
