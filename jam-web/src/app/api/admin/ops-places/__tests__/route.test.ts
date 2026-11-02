/**
 * GET /api/admin/ops-places (티켓 20261102_1602, 상위 20260930_1503)
 *
 * 인증은 실제 `@/lib/admin/auth`를 쓰고(세션만 모의), 읽기·계산도 모의하지 않는다. 서비스 클라이언트만 메모리 가짜 표로 바꾼다.
 * - 읽기 토큰만으로 200, 토큰이 없거나 틀리고 세션도 없으면 403(표를 읽지 않는다). 라우트는 GET만 export한다
 * - 쿼리 없음: 카테고리 요약, 장소 수 합계 = poi 행 수
 * - category 목록: 드랍·픽업 수, 정렬, 쪽 나누기, 잘못된 값은 400(읽지 않음), 없는 카테고리는 404
 * - 좌표·주소·유저 칸이 응답에 없다. 원천 하나라도 실패하면 고정 문장 500
 * - 티켓 20261102_2254: 기본은 활성·검수 통과만 센다(비활성·검수 대기 수는 따로), status=all 합계 = poi 행 수, sido·gu 거름과 목록의 지역 칸,
 *   groupBy=region 집계, 잘못된 status·groupBy는 400
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  type Result = { data: Row[] | null; error: { message: string } | null }
  const db = {
    user: null as { id: string; email: string } | null,
    tables: {} as Record<string, Row[]>,
    failTable: null as string | null,
    reads: 0,
    selected: {} as Record<string, string[]>,
  }
  class Query implements PromiseLike<Result> {
    private columns: string[] = []
    private orderBy: string[] = []
    private window: { from: number; to: number } | null = null
    constructor(private table: string) {}
    select(columns: string) {
      db.reads += 1
      this.columns = columns.split(',').map((c) => c.trim())
      db.selected[this.table] = this.columns
      return this
    }
    order(column: string) {
      this.orderBy.push(column)
      return this
    }
    range(from: number, to: number) {
      this.window = { from, to }
      return this
    }
    private run(): Result {
      if (db.failTable === this.table) return { data: null, error: { message: `relation ${this.table} secret` } }
      let rows = [...(db.tables[this.table] ?? [])].sort((a, b) => {
        for (const column of this.orderBy) {
          const x = String(a[column])
          const y = String(b[column])
          if (x !== y) return x < y ? -1 : 1
        }
        return 0
      })
      if (this.window) rows = rows.slice(this.window.from, this.window.to + 1)
      return { data: rows.map((row) => Object.fromEntries(this.columns.map((c) => [c, row[c]]))), error: null }
    }
    then<R1 = Result, R2 = never>(
      onfulfilled?: ((value: Result) => R1 | PromiseLike<R1>) | null,
      onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
    ): PromiseLike<R1 | R2> {
      return Promise.resolve(this.run()).then(onfulfilled, onrejected)
    }
  }
  return { db, service: { from: (table: string) => new Query(table) } }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.db.user } }) } }),
  createServiceClient: () => h.service,
}))

import * as route from '../route'

const { GET } = route

const TOKEN = 'test-admin-read-token-abcdef'
const ADMIN = { id: 'admin-1', email: 'admin@example.com' }
const ENV_KEYS = ['ADMIN_API_READ_TOKEN', 'ADMIN_EMAILS'] as const
const AUTH = { 'x-admin-read-token': TOKEN }
const FAILED_MESSAGE = '장소 정보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'

type Row = Record<string, unknown>

function place(
  id: string,
  name: string,
  category: string,
  linked: string | null = null,
  over: Row = { sido: '서울특별시', gu: '관악구' }
): Row {
  return {
    id,
    name,
    category,
    linked_badge_id: linked,
    is_active: true,
    pending_review: false,
    sido: null,
    gu: null,
    ...over,
    lat: 37.5,
    lng: 127.0,
    address: '서울시 비밀구 1-1',
    naver_place_id: 'naver-secret',
  }
}

function drop(id: string, poiId: string, pickedUp: string | null = null): Row {
  return { id, poi_id: poiId, picked_up_at: pickedUp, dropper_user_id: 'secret-user', picked_up_by: 'secret-picker' }
}

function fillTables() {
  h.db.tables.poi_categories = [
    { slug: 'mountain', label: '산' },
    { slug: 'subway', label: '지하철역' },
  ]
  h.db.tables.poi = [
    place('p1', '관악산', 'mountain', 'b1'),
    place('p2', '북한산', 'mountain', 'b2'),
    place('p3', '가야산', 'mountain'),
    place('p4', '강남역', 'subway', 'b4', { sido: '서울특별시', gu: '강남구' }),
    place('p5', '닫힌 산', 'mountain', null, { is_active: false, sido: '경기도', gu: '성남시' }),
    place('p6', '검수 대기 역', 'subway', null, { pending_review: true, is_active: false, sido: '서울특별시', gu: '강남구' }),
  ]
  h.db.tables.poi_drops = [
    drop('d1', 'p2'),
    drop('d2', 'p2', '2026-10-01T00:00:00.000Z'),
    drop('d3', 'p1'),
    drop('d4', 'p4'),
  ]
}

function request(query = '', headers: Record<string, string> = {}, method = 'GET') {
  return new Request(`http://localhost/api/admin/ops-places${query}`, { method, headers })
}

type PlaceBody = { id: string; sido: string | null; gu: string | null; dropCount: number; pickupCount: number; hasCheckinBadge: boolean }

const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key]
  process.env.ADMIN_API_READ_TOKEN = TOKEN
  process.env.ADMIN_EMAILS = ADMIN.email
  h.db.user = null
  h.db.tables = {}
  h.db.failTable = null
  h.db.reads = 0
  h.db.selected = {}
  fillTables()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  vi.restoreAllMocks()
})

describe('GET /api/admin/ops-places — 인증', () => {
  it('읽기 토큰만으로 200이고 관리자 세션으로도 200이다', async () => {
    expect((await GET(request('', AUTH))).status).toBe(200)
    h.db.user = ADMIN
    expect((await GET(request())).status).toBe(200)
  })

  it('토큰이 틀리거나 없고 세션도 없으면 403이고 표를 읽지 않는다', async () => {
    expect((await GET(request('', { 'x-admin-read-token': 'wrong' }))).status).toBe(403)
    expect((await GET(request())).status).toBe(403)
    expect(h.db.reads).toBe(0)
  })

  it('토큰으로 쓰기 메서드를 보내면 403이고 라우트는 GET만 export한다', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect((await GET(request('', AUTH, method))).status).toBe(403)
    }
    expect(h.db.reads).toBe(0)
    expect(Object.keys(route)).toEqual(['GET'])
  })
})

describe('GET /api/admin/ops-places — 카테고리 요약', () => {
  it('카테고리별 장소·체크인 배지·드랍·픽업 수를 싣고 장소 수 합계가 poi 행 수와 같다', async () => {
    const body = await (await GET(request('', AUTH))).json()
    expect(body).toMatchObject({ totalPlaces: 4, inactiveCount: 1, pendingReviewCount: 1 })
    expect(body.categories).toEqual([
      {
        slug: 'mountain',
        label: '산',
        placeCount: 3,
        inactiveCount: 1,
        pendingReviewCount: 0,
        checkinBadgeCount: 2,
        dropCount: 3,
        pickupCount: 1,
      },
      {
        slug: 'subway',
        label: '지하철역',
        placeCount: 1,
        inactiveCount: 0,
        pendingReviewCount: 1,
        checkinBadgeCount: 1,
        dropCount: 1,
        pickupCount: 0,
      },
    ])
  })

  it('status=all의 장소 수 합계는 poi 전체 행 수와 같다. inactive·pending은 그 상태만 센다', async () => {
    const all = await (await GET(request('?status=all', AUTH))).json()
    expect(all.totalPlaces).toBe(h.db.tables.poi.length)
    const sum = (all.categories as Array<{ placeCount: number }>).reduce((n, c) => n + c.placeCount, 0)
    expect(sum).toBe(h.db.tables.poi.length)
    const inactive = await (await GET(request('?status=inactive', AUTH))).json()
    expect(inactive.totalPlaces).toBe(1)
    const pending = await (await GET(request('?status=pending', AUTH))).json()
    expect(pending.totalPlaces).toBe(1)
  })

  it('sido·gu로 거르면 그 지역의 수만 센다', async () => {
    const body = await (await GET(request(`?sido=${encodeURIComponent('서울특별시')}&gu=${encodeURIComponent('강남구')}`, AUTH))).json()
    expect(body).toMatchObject({ totalPlaces: 1, inactiveCount: 0, pendingReviewCount: 1 })
  })
})

describe('GET /api/admin/ops-places — 지역별 집계', () => {
  it('groupBy=region은 시·도, 시·군·구별 수를 싣고 좌표·주소·동이 없다', async () => {
    const res = await GET(request('?groupBy=region', AUTH))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.totalPlaces).toBe(4)
    expect(body.groups).toEqual([
      { sido: '서울특별시', gu: '관악구', placeCount: 3, checkinBadgeCount: 2, dropCount: 3, pickupCount: 1 },
      { sido: '서울특별시', gu: '강남구', placeCount: 1, checkinBadgeCount: 1, dropCount: 1, pickupCount: 0 },
    ])
    const text = JSON.stringify(body)
    for (const secret of ['secret-user', 'naver-secret', '비밀구', '37.5']) expect(text).not.toContain(secret)
  })

  it('category를 함께 주면 그 카테고리만 세고, 없는 카테고리는 404다', async () => {
    const body = await (await GET(request('?groupBy=region&category=subway', AUTH))).json()
    expect(body.groups).toEqual([
      { sido: '서울특별시', gu: '강남구', placeCount: 1, checkinBadgeCount: 1, dropCount: 1, pickupCount: 0 },
    ])
    expect((await GET(request('?groupBy=region&category=nowhere', AUTH))).status).toBe(404)
  })

  it('status=all이면 비활성·검수 대기 장소도 센다', async () => {
    const body = await (await GET(request('?groupBy=region&status=all', AUTH))).json()
    expect(body.totalPlaces).toBe(6)
  })
})

describe('GET /api/admin/ops-places — 카테고리 장소 목록', () => {
  it('그 카테고리 장소를 드랍 많은 순으로 싣고 limit만큼 자른다', async () => {
    const body = await (await GET(request('?category=mountain&limit=2', AUTH))).json()
    expect(body).toMatchObject({
      category: { slug: 'mountain', label: '산' },
      total: 3,
      limit: 2,
      offset: 0,
      nextOffset: 2,
    })
    const places = body.places as PlaceBody[]
    expect(places.map((p) => p.id)).toEqual(['p2', 'p1'])
    expect(places[0]).toMatchObject({ dropCount: 2, pickupCount: 1, hasCheckinBadge: true, sido: '서울특별시', gu: '관악구' })

    const next = await (await GET(request('?category=mountain&limit=2&offset=2', AUTH))).json()
    expect((next.places as PlaceBody[]).map((p) => p.id)).toEqual(['p3'])
    expect(next.nextOffset).toBeNull()
  })

  it('sort=name은 이름순이고 q는 이름 포함 검색이다', async () => {
    const byName = await (await GET(request('?category=mountain&sort=name', AUTH))).json()
    expect((byName.places as PlaceBody[]).map((p) => p.id)).toEqual(['p3', 'p1', 'p2'])
    const found = await (await GET(request(`?category=mountain&q=${encodeURIComponent('북한')}`, AUTH))).json()
    expect((found.places as PlaceBody[]).map((p) => p.id)).toEqual(['p2'])
  })

  it('잘못된 limit·sort·category 모양은 400이고 표를 읽지 않는다', async () => {
    for (const bad of [
      '?category=mountain&limit=0',
      '?category=mountain&limit=101',
      '?category=mountain&sort=random',
      '?category=Mountain',
      '?limit=5',
      '?status=deleted',
      '?groupBy=gu',
      '?groupBy=region&limit=5',
      '?sido=',
    ]) {
      expect((await GET(request(bad, AUTH))).status, bad).toBe(400)
    }
    expect(h.db.reads).toBe(0)
  })

  it('기본 목록에는 비활성이 없고 status=all이면 지역 칸과 함께 나온다', async () => {
    const def = await (await GET(request('?category=mountain', AUTH))).json()
    expect(def.total).toBe(3)
    const all = await (await GET(request('?category=mountain&status=all', AUTH))).json()
    expect(all.total).toBe(4)
    const closed = (all.places as PlaceBody[]).find((p) => p.id === 'p5')
    expect(closed).toMatchObject({ sido: '경기도', gu: '성남시' })
    const gyeonggi = await (await GET(request(`?category=mountain&status=all&sido=${encodeURIComponent('경기도')}`, AUTH))).json()
    expect((gyeonggi.places as PlaceBody[]).map((p) => p.id)).toEqual(['p5'])
  })

  it('없는 카테고리는 404다', async () => {
    expect((await GET(request('?category=nowhere', AUTH))).status).toBe(404)
  })
})

describe('GET /api/admin/ops-places — 노출 범위와 실패', () => {
  it('좌표·주소·유저 칸을 읽지도 싣지도 않는다', async () => {
    const summary = JSON.stringify(await (await GET(request('', AUTH))).json())
    const list = JSON.stringify(await (await GET(request('?category=mountain', AUTH))).json())
    for (const secret of ['secret-user', 'secret-picker', 'naver-secret', '비밀구', '37.5', '127']) {
      expect(summary).not.toContain(secret)
      expect(list).not.toContain(secret)
    }
    expect(h.db.selected.poi).toEqual([
      'id', 'name', 'category', 'linked_badge_id', 'is_active', 'pending_review', 'sido', 'gu',
    ])
    expect(h.db.selected.poi_drops).toEqual(['id', 'poi_id', 'picked_up_at'])
  })

  it('원천 표 하나라도 읽기에 실패하면 고정 문장 500이고 원문은 싣지 않는다', async () => {
    for (const table of ['poi_categories', 'poi', 'poi_drops']) {
      h.db.failTable = table
      const res = await GET(request('', AUTH))
      expect(res.status, table).toBe(500)
      const body = await res.json()
      expect(body).toEqual({ error: FAILED_MESSAGE })
    }
  })
})
