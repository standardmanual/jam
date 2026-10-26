/**
 * GET /api/admin/item-paths (티켓 20261004_1641, 상위 20260930_1503 ⑦b, 운영툴 PRD §11.11)
 *
 * 인증은 실제 `@/lib/admin/auth`를 쓰고(세션만 모의한다), 읽기(`itemPaths/load.ts`)와 계산(`itemPaths/compute.ts`)도 모의하지 않는다. 서비스 클라이언트만
 * 메모리 안의 가짜 테이블로 바꿔서 라우트 → 읽기 → 계산 → 응답 본문까지 실제 코드로 지나가게 한다. 읽기 범위·1,000행 쪽 읽기는 `itemPaths/__tests__/load.test.ts`가,
 * 길 판정은 `compute.test.ts`가 지킨다. 여기서는 라우트가 맡은 것만 본다:
 * - 읽기 토큰만으로(세션 없이) 200이고 관리자 세션으로도 된다. 토큰이 틀리거나 없고 세션도 없으면 403이고 표를 읽지 않는다
 * - 토큰으로 POST하면 403이고 표를 읽지 않는다. 라우트는 GET만 export한다
 * - 쪽 나누기: 기본 10개, `limit`·`offset` 경계, `nextOffset`, 범위를 넘은 `offset`은 빈 쪽 200, 형식이나 범위가 틀린 값은 400(읽지 않는다)
 * - `onlyBlocked=true`: 막힘 아이템이 있는 컬렉션만, 그 안에서도 막힘 아이템만 싣는다. 개수 칸은 컬렉션 전체 기준이고 「드랍 제외」는 막힘이 아니다
 * - 원천 표 하나라도 읽기에 실패하면 고정 문장 500이고 원문은 싣지 않는다
 * - 응답 본문 어디에도 `updated_by`와 관리자 ID 값이 없다
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  type Result = { data: Row[] | null; error: { message: string } | null }
  const db = {
    user: null as { id: string; email: string } | null,
    tables: {} as Record<string, Row[]>,
    failTable: null as string | null,
    /** 원천 표를 `select`한 횟수. 인증·쿼리 검사에서 거절되면 0이어야 한다. */
    reads: 0,
  }
  function parseOr(expr: string): (row: Row) => boolean {
    const conditions = expr.split(',').map((part) => {
      const [column, op, ...rest] = part.split('.')
      const value = rest.join('.')
      return (row: Row): boolean => {
        const cell = row[column]
        if (op === 'is') return value === 'null' && cell === null
        if (cell === null || cell === undefined) return false
        const left = new Date(cell as string).getTime()
        const right = new Date(value).getTime()
        return op === 'lte' ? left <= right : op === 'gte' ? left >= right : false
      }
    })
    return (row) => conditions.some((test) => test(row))
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
    in(column: string, values: unknown[]) {
      this.filters.push((row) => values.includes(row[column]))
      return this
    }
    or(expr: string) {
      this.filters.push(parseOr(expr))
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
const ADMIN_ID_VALUE = 'secret-admin-user-id'
const ENV_KEYS = ['ADMIN_API_READ_TOKEN', 'ADMIN_EMAILS'] as const
const AUTH = { 'x-admin-read-token': TOKEN }
const FAILED_MESSAGE = '아이템 얻을 길을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'

const NOW = new Date('2026-10-04T00:00:00.000Z')
const PAST = '2026-09-01T00:00:00.000Z'

type Row = Record<string, unknown>

function bookRow(id: string, over: Row = {}): Row {
  return {
    id,
    tribe_id: 'tribe-1',
    is_active: true,
    valid_from: null,
    valid_until: null,
    drop_excluded: false,
    updated_by: ADMIN_ID_VALUE,
    ...over,
  }
}

function itemRow(id: string, bookId: string, over: Row = {}): Row {
  return {
    id,
    type: 'item',
    item_book_id: bookId,
    deleted_at: null,
    drop_excluded: false,
    valid_from: null,
    valid_until: null,
    rarity: 'common',
    always_locked: false,
    unlock_required: null,
    updated_by: ADMIN_ID_VALUE,
    ...over,
  }
}

/**
 * 컬렉션 셋(id 순서대로 c1 → c2 → c3):
 * - c1-ended: 기간이 끝났다. e1은 얻을 길이 없어 막힘, e2는 진행 중 미션의 보상이라 열림
 * - c2-excl: 컬렉션이 드랍 제외다. x1은 다른 길이 없어 드랍 제외
 * - c3-open: 노출 중이다. o1은 드랍으로 열림
 */
function fillTables() {
  h.db.tables.item_books = [
    bookRow('c3-open'),
    bookRow('c1-ended', { valid_until: PAST }),
    bookRow('c2-excl', { drop_excluded: true }),
  ]
  h.db.tables.badges = [itemRow('e1', 'c1-ended'), itemRow('e2', 'c1-ended'), itemRow('x1', 'c2-excl'), itemRow('o1', 'c3-open')]
  h.db.tables.combination_recipes = []
  h.db.tables.missions = [
    {
      id: 'm1',
      reward_badge_ids: ['e2'],
      starts_at: PAST,
      ends_at: null,
      exposure_mode: 'start_date',
      exposure_at: null,
      created_by: ADMIN_ID_VALUE,
    },
  ]
}

/** 아이템 하나씩 가진 컬렉션 n개(전부 노출 중이라 열림) */
function fillManyCollections(n: number) {
  const ids = Array.from({ length: n }, (_, i) => `c${String(i + 1).padStart(3, '0')}`)
  h.db.tables.item_books = ids.map((id) => bookRow(id))
  h.db.tables.badges = ids.map((id) => itemRow(`i-${id}`, id))
}

function request(query = '', headers: Record<string, string> = {}, method = 'GET') {
  return new Request(`http://localhost/api/admin/item-paths${query}`, { method, headers })
}

type CollectionBody = {
  collectionId: string
  total: number
  open: number
  blocked: number
  dropExcluded: number
  items: Array<{ itemId: string; status: string }>
}

const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  for (const key of ENV_KEYS) saved[key] = process.env[key]
  process.env.ADMIN_API_READ_TOKEN = TOKEN
  process.env.ADMIN_EMAILS = ADMIN.email
  h.db.user = null
  h.db.tables = {}
  h.db.failTable = null
  h.db.reads = 0
  fillTables()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('GET /api/admin/item-paths — 인증', () => {
  it('읽기 토큰만으로(세션 없음) 200이다. 컬렉션은 id 순서이고 계산 결과가 실린다', async () => {
    const res = await GET(request('', AUTH))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['collections', 'limit', 'nextOffset', 'now', 'offset', 'total'])
    expect(body).toMatchObject({ now: NOW.toISOString(), total: 3, limit: 10, offset: 0, nextOffset: null })
    const collections = body.collections as CollectionBody[]
    expect(collections.map((c) => c.collectionId)).toEqual(['c1-ended', 'c2-excl', 'c3-open'])
    expect(collections[0]).toMatchObject({ total: 2, open: 1, blocked: 1, dropExcluded: 0 })
    expect(collections[0].items.map((i) => `${i.itemId}:${i.status}`)).toEqual(['e1:blocked', 'e2:open'])
    expect(collections[1]).toMatchObject({ total: 1, open: 0, blocked: 0, dropExcluded: 1 })
    expect(collections[1].items.map((i) => `${i.itemId}:${i.status}`)).toEqual(['x1:drop_excluded'])
    expect(collections[2].items.map((i) => `${i.itemId}:${i.status}`)).toEqual(['o1:open'])
  })

  it('아이템마다 다섯 길(drop·mix·mission·syncCapsule·tierUp)과 잠긴 채 받는 모습(lock)이 실린다 — 티켓 20261022_1136 2회', async () => {
    h.db.tables.item_books = [bookRow('c1'), bookRow('c2-no-tribe', { tribe_id: null })]
    h.db.tables.badges = [
      itemRow('a', 'c1', { rarity: 'common', always_locked: true, unlock_required: 8 }),
      itemRow('b', 'c1', { rarity: 'rare' }),
      itemRow('c', 'c2-no-tribe', { rarity: 'common' }),
    ]
    h.db.tables.missions = []
    const body = await (await GET(request('', AUTH))).json()
    const items = (body.collections as Array<{ items: Array<Record<string, unknown>> }>).flatMap((c) => c.items)
    const byId = Object.fromEntries(items.map((i) => [i.itemId as string, i]))

    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(
        ['collectionId', 'drop', 'itemId', 'lock', 'mission', 'mix', 'rarity', 'status', 'syncCapsule', 'tierUp'].sort(),
      )
    }
    expect(byId.a).toMatchObject({
      status: 'open',
      syncCapsule: { open: true, reasons: [] },
      tierUp: { open: true, reasons: [] },
      lock: { receivedLocked: true, unlockRequired: 8 },
    })
    expect(byId.b).toMatchObject({ tierUp: { open: true }, lock: { receivedLocked: false, unlockRequired: null } })
    // 소속 트라이브가 없는 컬렉션은 동기화·캡슐·등급 올리기가 닫히지만 드랍 길이 열려 있어 아이템은 열림이다
    expect(byId.c).toMatchObject({
      status: 'open',
      drop: { open: true },
      syncCapsule: { open: false, reasons: ['collection_no_tribe'] },
      tierUp: { open: false, reasons: ['collection_no_tribe'] },
    })
  })

  it('관리자 세션으로도 200이다', async () => {
    h.db.user = ADMIN
    expect((await GET(request())).status).toBe(200)
  })

  it('토큰이 틀리거나 없고 세션도 없으면 403이고 표를 읽지 않는다', async () => {
    expect((await GET(request('', { 'x-admin-read-token': 'wrong' }))).status).toBe(403)
    expect((await GET(request())).status).toBe(403)
    expect(h.db.reads).toBe(0)
  })

  it('환경변수에 토큰이 없으면 토큰으로 읽을 수 없다', async () => {
    delete process.env.ADMIN_API_READ_TOKEN
    expect((await GET(request('', AUTH))).status).toBe(403)
    expect(h.db.reads).toBe(0)
  })

  it('토큰으로 POST하면 거부되고 표를 읽지 않는다(세션이 있어야 한다)', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect((await GET(request('', AUTH, method))).status).toBe(403)
    }
    expect(h.db.reads).toBe(0)
  })

  it('쓰기 메서드를 두지 않는다 — GET만 export한다', () => {
    expect(Object.keys(route)).toEqual(['GET'])
  })
})

describe('GET /api/admin/item-paths — 쪽 나누기', () => {
  it('limit 안쪽에서는 한 쪽에 다 싣고 nextOffset은 null이다', async () => {
    const body = await (await GET(request('?limit=3', AUTH))).json()
    expect(body.collections).toHaveLength(3)
    expect(body.nextOffset).toBeNull()
  })

  it('limit·offset으로 컬렉션 단위로 자르고 nextOffset으로 이어 읽는다', async () => {
    const first = await (await GET(request('?limit=2', AUTH))).json()
    expect(first).toMatchObject({ total: 3, limit: 2, offset: 0, nextOffset: 2 })
    expect(first.collections.map((c: CollectionBody) => c.collectionId)).toEqual(['c1-ended', 'c2-excl'])

    const second = await (await GET(request(`?limit=2&offset=${first.nextOffset}`, AUTH))).json()
    expect(second).toMatchObject({ total: 3, limit: 2, offset: 2, nextOffset: null })
    expect(second.collections.map((c: CollectionBody) => c.collectionId)).toEqual(['c3-open'])
  })

  it('쪽을 이어 붙이면 컬렉션이 겹치거나 빠지지 않는다', async () => {
    fillManyCollections(25)
    const seen: string[] = []
    let offset: number | null = 0
    while (offset !== null) {
      const body: { collections: CollectionBody[]; nextOffset: number | null } = await (
        await GET(request(`?limit=7&offset=${offset}`, AUTH))
      ).json()
      seen.push(...body.collections.map((c) => c.collectionId))
      offset = body.nextOffset
    }
    expect(seen).toHaveLength(25)
    expect(new Set(seen).size).toBe(25)
    expect(seen).toEqual([...seen].sort())
  })

  it('limit이 없으면 10개씩이고, 50개까지 한 번에 읽을 수 있다', async () => {
    fillManyCollections(12)
    const byDefault = await (await GET(request('', AUTH))).json()
    expect(byDefault).toMatchObject({ total: 12, limit: 10, nextOffset: 10 })
    expect(byDefault.collections).toHaveLength(10)

    const max = await (await GET(request('?limit=50', AUTH))).json()
    expect(max.collections).toHaveLength(12)
    expect(max.nextOffset).toBeNull()
  })

  it('끝을 넘은 offset은 빈 쪽 200이고 total은 그대로다', async () => {
    for (const offset of [3, 100]) {
      const res = await GET(request(`?offset=${offset}`, AUTH))
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ total: 3, offset, collections: [], nextOffset: null })
    }
  })

  it('정확히 끝에 닿는 쪽은 nextOffset이 null이다', async () => {
    const body = await (await GET(request('?limit=1&offset=2', AUTH))).json()
    expect(body.collections.map((c: CollectionBody) => c.collectionId)).toEqual(['c3-open'])
    expect(body.nextOffset).toBeNull()
  })

  it('형식이나 범위가 틀린 limit·offset은 400이고 읽지 않는다', async () => {
    for (const query of ['?limit=0', '?limit=51', '?limit=abc', '?limit=', '?limit=1.5', '?limit=-1', '?offset=-1', '?offset=1.5', '?offset=x']) {
      const res = await GET(request(query, AUTH))
      expect(res.status, query).toBe(400)
      expect((await res.json()).error).toBe('limit은 1부터 50까지, offset은 0 이상의 정수로 보내 주세요.')
    }
    expect(h.db.reads).toBe(0)
  })

  it('컬렉션이 하나도 없으면 빈 목록 200이다(오류 아님)', async () => {
    h.db.tables = {}
    const res = await GET(request('', AUTH))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ total: 0, collections: [], nextOffset: null })
  })
})

describe('GET /api/admin/item-paths — onlyBlocked', () => {
  it('막힘 아이템이 있는 컬렉션만, 그 안에서도 막힘 아이템만 싣는다', async () => {
    const body = await (await GET(request('?onlyBlocked=true', AUTH))).json()
    expect(body.total).toBe(1)
    const [only] = body.collections as CollectionBody[]
    expect(only.collectionId).toBe('c1-ended')
    expect(only.items.map((i) => i.itemId)).toEqual(['e1'])
    expect(only.items[0].status).toBe('blocked')
  })

  it('개수 칸은 컬렉션 전체 기준 그대로다', async () => {
    const body = await (await GET(request('?onlyBlocked=true', AUTH))).json()
    expect(body.collections[0]).toMatchObject({ total: 2, open: 1, blocked: 1, dropExcluded: 0 })
  })

  it('드랍 제외는 막힘이 아니라 싣지 않는다', async () => {
    const body = await (await GET(request('?onlyBlocked=true', AUTH))).json()
    expect(body.collections.map((c: CollectionBody) => c.collectionId)).not.toContain('c2-excl')
  })

  it('쪽 나누기는 걸러낸 뒤의 컬렉션 수 기준이다', async () => {
    const body = await (await GET(request('?onlyBlocked=true&limit=1&offset=1', AUTH))).json()
    expect(body).toMatchObject({ total: 1, collections: [], nextOffset: null })
  })

  it('true가 아닌 값은 거르지 않는다', async () => {
    for (const query of ['?onlyBlocked=false', '?onlyBlocked=1', '?onlyBlocked=']) {
      const body = await (await GET(request(query, AUTH))).json()
      expect(body.total, query).toBe(3)
    }
  })

  it('막힘이 없으면 빈 목록 200이다', async () => {
    h.db.tables.missions = []
    h.db.tables.badges = [itemRow('o1', 'c3-open')]
    const res = await GET(request('?onlyBlocked=true', AUTH))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ total: 0, collections: [] })
  })
})

describe('GET /api/admin/item-paths — 오류와 비노출', () => {
  it.each(['item_books', 'badges', 'combination_recipes', 'missions'])(
    '%s를 읽지 못하면 고정 문장 500이고 원문은 싣지 않는다',
    async (table) => {
      h.db.failTable = table
      const res = await GET(request('', AUTH))
      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body).toEqual({ error: FAILED_MESSAGE })
      expect(JSON.stringify(body)).not.toContain('secret')
    }
  )

  it('읽기가 실패해도 막힘으로 바뀐 부분 결과를 돌려주지 않는다', async () => {
    h.db.failTable = 'missions'
    const res = await GET(request('?onlyBlocked=true', AUTH))
    expect(res.status).toBe(500)
    expect((await res.json()).collections).toBeUndefined()
  })

  it('응답 본문 어디에도 updated_by·created_by 칸과 관리자 ID 값이 없다', async () => {
    for (const query of ['', '?onlyBlocked=true']) {
      const text = JSON.stringify(await (await GET(request(query, AUTH))).json())
      for (const forbidden of ['updated_by', 'created_by', 'updatedBy', 'createdBy', ADMIN_ID_VALUE]) {
        expect(text).not.toContain(forbidden)
      }
    }
  })
})
