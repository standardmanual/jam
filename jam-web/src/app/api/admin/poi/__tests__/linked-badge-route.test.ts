/**
 * 장소 저장 API의 연결 배지 검증 (티켓 20261018_1813)
 *
 * POST `/api/admin/poi`와 PUT `/api/admin/poi/[id]`가 체크인이 아닌 배지 연결을 400으로 거절하고,
 * 거절한 요청은 장소 표에 아무것도 쓰지 않는다. 체크인 배지·연결 없음은 그대로 저장된다.
 *
 * 실행: `npx vitest run src/app/api/admin/poi/__tests__/linked-badge-route.test.ts`
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  admin: { id: 'admin-1', email: 'admin@example.com' } as { id: string; email: string } | null,
  badgeType: 'checkin' as string | null,
  currentLinked: null as string | null,
  writes: [] as string[],
}))

vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  getAdminUser: async () => state.admin,
}))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        maybeSingle: async () => {
          if (table === 'poi_categories') return { data: { slug: 'cafe' }, error: null }
          if (table === 'badges') return { data: state.badgeType ? { id: 'b1', type: state.badgeType } : null, error: null }
          if (table === 'poi') return { data: { linked_badge_id: state.currentLinked }, error: null }
          return { data: null, error: null }
        },
        single: async () => ({ data: { id: 'p1' }, error: null }),
        insert: () => {
          state.writes.push(`${table}.insert`)
          return chain
        },
        update: () => {
          state.writes.push(`${table}.update`)
          return chain
        },
      }
      return chain
    },
  }),
}))

import { POST } from '../route'
import { PUT } from '../[id]/route'

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/poi', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const POI_BODY = { name: '성수 카페', latitude: 37.5, longitude: 127.0, radius_meters: 100, category: 'cafe' }

beforeEach(() => {
  state.admin = { id: 'admin-1', email: 'admin@example.com' }
  state.badgeType = 'checkin'
  state.currentLinked = null
  state.writes = []
})

describe('POST /api/admin/poi', () => {
  it('체크인이 아닌 배지를 연결하면 400이고 장소를 만들지 않는다', async () => {
    state.badgeType = 'activity'
    const res = await POST(req({ ...POI_BODY, linked_badge_id: 'b1' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('체크인 배지만')
    expect(state.writes).toEqual([])
  })

  it('없는 배지를 연결하면 400이다', async () => {
    state.badgeType = null
    const res = await POST(req({ ...POI_BODY, linked_badge_id: 'ghost' }))
    expect(res.status).toBe(400)
    expect(state.writes).toEqual([])
  })

  it('체크인 배지는 저장한다', async () => {
    const res = await POST(req({ ...POI_BODY, linked_badge_id: 'b1' }))
    expect(res.status).toBe(201)
    expect(state.writes).toEqual(['poi.insert'])
  })

  it('연결 배지가 없어도 저장한다', async () => {
    const res = await POST(req(POI_BODY))
    expect(res.status).toBe(201)
  })
})

describe('PUT /api/admin/poi/[id]', () => {
  const ctx = { params: Promise.resolve({ id: 'p1' }) }

  it('체크인이 아닌 배지로 바꾸면 400이고 장소를 고치지 않는다', async () => {
    state.badgeType = 'item'
    const res = await PUT(req({ ...POI_BODY, linked_badge_id: 'b1', is_active: true }), ctx)
    expect(res.status).toBe(400)
    expect(state.writes).toEqual([])
  })

  it('체크인 배지로 바꾸면 저장한다', async () => {
    const res = await PUT(req({ ...POI_BODY, linked_badge_id: 'b1', is_active: true }), ctx)
    expect(res.status).toBe(200)
    expect(state.writes).toEqual(['poi.update'])
  })

  it('연결을 비우는 저장은 통과한다', async () => {
    const res = await PUT(req({ ...POI_BODY, linked_badge_id: null, is_active: true }), ctx)
    expect(res.status).toBe(200)
  })

  it('예전부터 연결돼 있던 배지를 그대로 두는 저장은 막지 않는다', async () => {
    state.badgeType = 'activity'
    state.currentLinked = 'b1'
    const res = await PUT(req({ ...POI_BODY, linked_badge_id: 'b1', is_active: true }), ctx)
    expect(res.status).toBe(200)
  })

  it('관리자가 아니면 403이다', async () => {
    state.admin = null
    const res = await PUT(req({ ...POI_BODY, linked_badge_id: 'b1' }), ctx)
    expect(res.status).toBe(403)
  })
})
