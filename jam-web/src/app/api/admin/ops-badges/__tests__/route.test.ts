/**
 * GET /api/admin/ops-badges (티켓 20261102_1602, 상위 20260930_1503)
 *
 * 인증은 실제 `@/lib/admin/auth`를 쓰고(세션만 모의), 읽기·계산도 모의하지 않는다. 서비스 클라이언트만 메모리 가짜 표로 바꾼다.
 * - 읽기 토큰만으로 200, 토큰이 없거나 틀리고 세션도 없으면 403(표를 읽지 않는다). 라우트는 GET만 export한다
 * - 숨김 배지·삭제 배지·액티비티가 아닌 배지는 응답에 없다. 획득 수는 계열·단계별 행 수다
 * - 응답 어디에도 유저 ID가 없고, `user_activity_badges`에서 `user_id`를 읽지도 않는다
 * - family 검색·쪽 나누기, 잘못된 값은 400(읽지 않음), 원천 실패는 고정 문장 500
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
    private filters: Array<(row: Row) => boolean> = []
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
    eq(column: string, value: unknown) {
      this.filters.push((row) => row[column] === value)
      return this
    }
    is(column: string, value: unknown) {
      this.filters.push((row) => row[column] === value)
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
      let rows = (db.tables[this.table] ?? []).filter((row) => this.filters.every((test) => test(row)))
      rows = [...rows].sort((a, b) => {
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
const FAILED_MESSAGE = '배지 정보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'
const SECRET_USER = 'secret-user-id-0001'

type Row = Record<string, unknown>

function badge(id: string, over: Row = {}): Row {
  return {
    id,
    name: '러닝 마스터',
    description: null,
    rarity: 'common',
    level: null,
    family_key: 'running_master',
    sort_order: 1,
    image_url: null,
    condition_json: { total_count: 10 },
    activity_types: ['running'],
    deleted_at: null,
    admin_category: null,
    is_hidden: false,
    type: 'activity',
    ...over,
  }
}

function earn(id: string, badgeId: string): Row {
  return { id, badge_id: badgeId, user_id: SECRET_USER }
}

function fillTables() {
  h.db.tables.badges = [
    badge('b-common'),
    badge('b-rare', { rarity: 'rare', condition_json: { total_count: 30 } }),
    badge('b-hidden', { rarity: 'epic', is_hidden: true }),
    badge('b-deleted', { rarity: 'mystic', deleted_at: '2026-10-01T00:00:00.000Z' }),
    badge('b-item', { name: '아이템', family_key: 'item_x', type: 'item' }),
    badge('s-1', { name: '스트릭', family_key: 'streak', condition_json: { streak_days: 7 } }),
  ]
  h.db.tables.user_activity_badges = [
    earn('e1', 'b-common'),
    earn('e2', 'b-common'),
    earn('e3', 'b-rare'),
    earn('e4', 'b-hidden'),
  ]
}

function request(query = '', headers: Record<string, string> = {}, method = 'GET') {
  return new Request(`http://localhost/api/admin/ops-badges${query}`, { method, headers })
}

type FamilyBody = { family: string; hidden: boolean; tiers: Array<{ badgeId: string; tier: string; conditionSummary: string; earnedCount: number }> }

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

describe('GET /api/admin/ops-badges — 인증', () => {
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

describe('GET /api/admin/ops-badges — 계열 목록', () => {
  it('숨김·삭제·액티비티가 아닌 배지를 빼고 계열별 단계와 획득 수를 싣는다', async () => {
    const body = await (await GET(request('', AUTH))).json()
    expect(body).toMatchObject({ total: 2, limit: 30, offset: 0, nextOffset: null })
    const families = body.families as FamilyBody[]
    expect(families.map((f) => f.family).sort()).toEqual(['running_master', 'streak'])
    expect(families.every((f) => f.hidden === false)).toBe(true)
    const running = families.find((f) => f.family === 'running_master')
    expect(running?.tiers).toEqual([
      { badgeId: 'b-common', tier: 'Common', conditionSummary: '10회', earnedCount: 2 },
      { badgeId: 'b-rare', tier: 'Rare', conditionSummary: '30회', earnedCount: 1 },
    ])
    expect(families.find((f) => f.family === 'streak')?.tiers[0]).toMatchObject({ badgeId: 's-1', earnedCount: 0 })
    expect(JSON.stringify(body)).not.toContain('b-hidden')
  })

  it('응답에 유저 ID가 없고 user_activity_badges에서 user_id를 읽지 않는다', async () => {
    const text = JSON.stringify(await (await GET(request('', AUTH))).json())
    expect(text).not.toContain(SECRET_USER)
    expect(text).not.toContain('user_id')
    expect(h.db.selected.user_activity_badges).toEqual(['id', 'badge_id'])
  })

  it('family는 계열 이름 포함 검색이고 limit·offset으로 이어 읽는다', async () => {
    const found = await (await GET(request(`?family=${encodeURIComponent('스트릭')}`, AUTH))).json()
    expect((found.families as FamilyBody[]).map((f) => f.family)).toEqual(['streak'])

    const first = await (await GET(request('?limit=1', AUTH))).json()
    expect(first).toMatchObject({ total: 2, limit: 1, nextOffset: 1 })
    const second = await (await GET(request('?limit=1&offset=1', AUTH))).json()
    expect(second.nextOffset).toBeNull()
    const ids = [...first.families, ...second.families].map((f: FamilyBody) => f.family)
    expect(new Set(ids).size).toBe(2)
  })

  it('잘못된 limit·offset은 400이고 표를 읽지 않는다', async () => {
    for (const bad of ['?limit=0', '?limit=101', '?limit=abc', '?offset=-1']) {
      expect((await GET(request(bad, AUTH))).status, bad).toBe(400)
    }
    expect(h.db.reads).toBe(0)
  })

  it('원천 표 하나라도 읽기에 실패하면 고정 문장 500이고 원문은 싣지 않는다', async () => {
    for (const table of ['badges', 'user_activity_badges']) {
      h.db.failTable = table
      const res = await GET(request('', AUTH))
      expect(res.status, table).toBe(500)
      expect(await res.json()).toEqual({ error: FAILED_MESSAGE })
    }
  })
})
