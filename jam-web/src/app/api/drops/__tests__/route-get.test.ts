/**
 * GET /api/drops?lat=&lng= — 지도의 장소별 드랍 개수 (티켓 20261018_1812)
 *
 * 고정하는 것: 꺼진 장소(`poi.is_active = false`)는 지도 목록에 없고 드랍 개수 조회 대상에도 들지 않는다.
 * 드랍 데이터는 지우지 않으므로 장소가 다시 켜지면 개수가 돌아온다.
 *
 * 실행: cd jam-web && npx vitest run src/app/api/drops/__tests__/route-get.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  pois: [] as { id: string; is_active: boolean }[],
  countedPoiIds: [] as string[],
  dropRows: [] as { poi_id: string }[],
}))

function poi(id: string, isActive: boolean) {
  return {
    id,
    naver_id: null,
    name: id,
    latitude: 37.5,
    longitude: 127.0,
    poi_tier: 1,
    is_active: isActive,
    category: 'cafe',
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) } }),
  createServiceClient: () => ({
    from: (table: string) => {
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.gte = () => builder
      builder.lte = () => builder
      builder.eq = () => builder
      builder.in = (_col: string, ids: string[]) => {
        if (table === 'poi_drops') state.countedPoiIds = ids
        return builder
      }
      builder.then = (resolve: (v: unknown) => unknown) =>
        resolve(
          table === 'poi'
            ? { data: state.pois, error: null }
            : { data: state.dropRows.filter((r) => state.countedPoiIds.includes(r.poi_id)), error: null }
        )
      return builder
    },
  }),
}))
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: () => {} }
})

import { GET } from '../route'

const get = () => GET(new NextRequest('http://localhost/api/drops?lat=37.5&lng=127.0'))

beforeEach(() => {
  state.countedPoiIds = []
  state.pois = [poi('on', true), poi('off', false)] as unknown as typeof state.pois
  state.dropRows = [{ poi_id: 'on' }, { poi_id: 'on' }, { poi_id: 'off' }]
})

describe('GET /api/drops — 꺼진 장소', () => {
  it('꺼진 장소는 지도 목록에 없고 드랍 개수 조회 대상에도 들지 않는다', async () => {
    const res = await get()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.pois.map((p: { id: string }) => p.id)).toEqual(['on'])
    expect(state.countedPoiIds).toEqual(['on'])
    expect(body.pois[0].available_drops_count).toBe(2)
  })

  it('장소가 다시 켜지면 남아 있던 드랍 개수가 돌아온다', async () => {
    state.pois = [poi('off', true)] as unknown as typeof state.pois

    const body = await (await get()).json()

    expect(body.pois.map((p: { id: string }) => p.id)).toEqual(['off'])
    expect(body.pois[0].available_drops_count).toBe(1)
  })
})
