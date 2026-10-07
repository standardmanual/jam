/**
 * GET /api/admin/ops-patterns/draw (티켓 20261007_2221, 상위 20260930_1503 ④, 운영툴 PRD §11.14)
 *
 * 인증은 실제 `@/lib/admin/auth`를 쓰고(세션만 모의한다), 계산·읽기 함수(`lib/admin/opsPatterns/draw.ts`)도 모의하지 않는다. 서비스 클라이언트만
 * 메모리 안의 가짜 테이블 넷(`ops_bundle_items`·`ops_patterns`·`tribes`·`poi_categories`)으로 바꿔서, 라우트 → 읽기 → 계산 → 응답 본문까지 실제
 * 코드로 지나가게 한다. 가짜는 `eq`·`neq`·`in`·`!inner` 조인을 실제로 걸러서, 조건이 빠지면 결과가 달라진다. 정렬·경계·칸 읽기의 세부는
 * `opsPatterns/__tests__/draw.test.ts`가 지킨다. 여기서는 라우트가 맡은 것만 본다:
 * - 읽기 토큰만으로도, 관리자 세션으로도 200이다. 토큰이 틀리거나 없고 세션도 없으면 403이고 어느 테이블도 읽지 않는다
 * - `limit`이 없으면 목록마다 5개, 주면 그 개수다. 0·51·abc·2.5면 400이고 아무것도 읽지 않는다
 * - 시험 묶음·승인 전 항목은 uses에 안 들어가고, 쉬는 중·보관 패턴·비활성 트라이브·delete·unassigned는 응답에 없다
 * - 응답 본문 어디에도 `author`·`actor`·`raw`·`updated_by`와 그 값(관리자 ID)이 없고, select에서도 그 칸을 읽지 않는다
 * - 같은 데이터·같은 시각이면 응답이 같다. 조회가 실패하면 고정 문장 500이고 원문은 싣지 않는다. GET만 export한다
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  type Result = { data: unknown; error: { message: string } | null }
  type Embed = { inner: boolean; columns: string[] }
  const db = {
    user: null as { id: string; email: string } | null,
    tables: {} as Record<string, Row[]>,
    error: null as string | null,
    /** 어느 테이블이든 `select`를 호출한 횟수. 인증·형식 검사에서 거절되면 0이어야 한다. */
    reads: 0,
    /** 호출마다 `{ table, columns }`. */
    selects: [] as Array<{ table: string; columns: string }>,
  }
  function valueAt(row: Row, column: string): unknown {
    const [head, tail] = column.split('.')
    if (tail === undefined) return row[head]
    const embedded = row[head] as Row | null | undefined
    return embedded ? embedded[tail] : undefined
  }
  class Query implements PromiseLike<Result> {
    private predicates: Array<(row: Row) => boolean> = []
    private top: string[] = []
    private embeds: Record<string, Embed> = {}
    private orders: string[] = []
    private window: [number, number] | null = null
    constructor(private table: string) {}
    select(columns: string) {
      db.reads += 1
      db.selects.push({ table: this.table, columns })
      const embeds: Record<string, Embed> = {}
      const rest = columns.replace(/(\w+)(!inner)?\(([^)]*)\)/g, (_all, name: string, inner: string | undefined, list: string) => {
        embeds[name] = { inner: inner !== undefined, columns: list.split(',').map((c) => c.trim()) }
        return ''
      })
      this.top = rest.split(',').map((c) => c.trim()).filter(Boolean)
      this.embeds = embeds
      return this
    }
    eq(column: string, value: unknown) {
      this.predicates.push((row) => valueAt(row, column) === value)
      return this
    }
    neq(column: string, value: unknown) {
      this.predicates.push((row) => valueAt(row, column) !== value)
      return this
    }
    in(column: string, values: readonly unknown[]) {
      this.predicates.push((row) => values.includes(valueAt(row, column)))
      return this
    }
    order(column: string) {
      this.orders.push(column)
      return this
    }
    range(from: number, to: number) {
      this.window = [from, to]
      return this
    }
    private run(): Result {
      if (db.error) return { data: null, error: { message: db.error } }
      let rows = (db.tables[this.table] ?? []).filter((row) => this.predicates.every((p) => p(row)))
      for (const [name, embed] of Object.entries(this.embeds)) {
        if (embed.inner) rows = rows.filter((row) => row[name] !== null && row[name] !== undefined)
      }
      if (this.orders.length > 0) {
        rows = [...rows].sort((a, b) => {
          for (const column of this.orders) {
            const x = String(a[column])
            const y = String(b[column])
            if (x !== y) return x < y ? -1 : 1
          }
          return 0
        })
      }
      if (this.window) rows = rows.slice(this.window[0], this.window[1] + 1)
      const projected = rows.map((row) => {
        const out: Row = Object.fromEntries(this.top.map((c) => [c, row[c]]))
        for (const [name, embed] of Object.entries(this.embeds)) {
          const source = row[name] as Row | null | undefined
          out[name] = source ? Object.fromEntries(embed.columns.map((c) => [c, source[c]])) : null
        }
        return out
      })
      return { data: projected, error: null }
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

import * as route from '../draw/route'

const { GET } = route

const NOW = new Date('2026-10-07T03:00:00.000Z')
const TOKEN = 'test-admin-read-token-abcdef'
const ADMIN = { id: 'admin-1', email: 'admin@example.com' }
const AUTHOR_SECRET = 'secret-author-admin-id'
const RAW_SECRET = 'raw-secret-body'
const ACTOR_SECRET = 'secret-actor-id'
const UPDATED_BY_SECRET = 'secret-updated-by-id'
const ENV_KEYS = ['ADMIN_API_READ_TOKEN', 'ADMIN_EMAILS'] as const
const AUTH = { 'x-admin-read-token': TOKEN }

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
}

const TRIBE_ACTIVE_1 = uuid(901)
const TRIBE_ACTIVE_2 = uuid(902)
const TRIBE_INACTIVE = uuid(903)

function itemRow(n: number, extra: Record<string, unknown> = {}, bundle: Record<string, unknown> = {}) {
  return {
    id: uuid(n),
    kind: 'home_feed_card',
    status: 'approved',
    starts_at: '2026-10-01T00:00:00.000Z',
    original: { pattern_no: 'P01', tribe_id: TRIBE_ACTIVE_1, knobs: { place_category: ['cafe'] } },
    edited: null,
    ops_bundles: { is_sample: false, received_at: '2026-09-30T00:00:00.000Z', author: AUTHOR_SECRET, raw: { secret: RAW_SECRET } },
    actor: ACTOR_SECRET,
    ...extra,
    ...(Object.keys(bundle).length > 0 ? { ops_bundles: { is_sample: false, received_at: '2026-09-30T00:00:00.000Z', author: AUTHOR_SECRET, raw: { secret: RAW_SECRET }, ...bundle } } : {}),
  }
}

function patternRow(patternNo: string, status: string) {
  return { pattern_no: patternNo, name: `패턴 ${patternNo}`, status, updated_by: UPDATED_BY_SECRET, confirmed_by: UPDATED_BY_SECRET }
}

function fillTables() {
  h.db.tables = {
    ops_bundle_items: [
      itemRow(1), // P01·트라이브1·cafe, 승인됨 → 센다
      itemRow(2, { status: 'live', original: { pattern_no: 'P02', tribe_id: TRIBE_ACTIVE_2, knobs: { place_category: ['park', 'delete'] } } }),
      itemRow(3, { status: 'rejected', original: { pattern_no: 'P03', tribe_id: TRIBE_ACTIVE_2, knobs: { place_category: ['museum'] } } }), // 읽기 조건에서 빠진다
      itemRow(4, { original: { pattern_no: 'P03', tribe_id: TRIBE_ACTIVE_2, knobs: { place_category: ['museum'] } } }, { is_sample: true }), // 시험 묶음
    ],
    ops_patterns: [patternRow('P01', 'active'), patternRow('P02', 'active'), patternRow('P03', 'active'), patternRow('P04', 'paused'), patternRow('P05', 'archived')],
    tribes: [
      { id: TRIBE_ACTIVE_1, name: '트라이브 하나', sort_order: 1, is_active: true },
      { id: TRIBE_ACTIVE_2, name: '트라이브 둘', sort_order: 2, is_active: true },
      { id: TRIBE_INACTIVE, name: '트라이브 쉼', sort_order: 3, is_active: false },
    ],
    poi_categories: ['cafe', 'park', 'museum', 'library', 'gym', 'bar', 'delete', 'unassigned'].map((slug) => ({ slug })),
  }
}

function request(query = '', headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/admin/ops-patterns/draw${query}`, { method: 'GET', headers })
}

const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key]
  process.env.ADMIN_API_READ_TOKEN = TOKEN
  process.env.ADMIN_EMAILS = ADMIN.email
  h.db.user = null
  h.db.error = null
  h.db.reads = 0
  h.db.selects = []
  fillTables()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
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

/** 응답 본문을 문자열로 보고 관리자 ID·제출 원본 칸과 그 값이 없는지 확인한다. */
function expectNoSecrets(body: unknown) {
  const text = JSON.stringify(body)
  for (const forbidden of ['"author"', '"actor"', '"raw"', 'updated_by', 'confirmed_by', 'updatedBy', 'confirmedBy', AUTHOR_SECRET, ACTOR_SECRET, RAW_SECRET, UPDATED_BY_SECRET]) {
    expect(text).not.toContain(forbidden)
  }
}

describe('GET /api/admin/ops-patterns/draw', () => {
  it('읽기 토큰만으로 읽힌다(세션 없음). 응답 머리와 세 목록이 온다', async () => {
    const res = await GET(request('', AUTH))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['countedItems', 'limit', 'now', 'patterns', 'placeCategories', 'since', 'tribes', 'windowDays'])
    expect(body).toMatchObject({ now: NOW.toISOString(), since: '2026-09-09T03:00:00.000Z', windowDays: 28, limit: 5, countedItems: 2 })
  })

  it('관리자 세션으로도 읽힌다', async () => {
    h.db.user = ADMIN
    expect((await GET(request())).status).toBe(200)
  })

  it('limit이 없으면 목록마다 5개이고 덜 쓴 순이다', async () => {
    const body = await (await GET(request('', AUTH))).json()
    // 패턴: P03 0회(반려·시험은 안 센다) → P01·P02 1회. 사용 중만이라 P04(쉼)·P05(보관)는 없다.
    expect(body.patterns.map((p: { patternNo: string; uses: number }) => [p.patternNo, p.uses])).toEqual([['P03', 0], ['P01', 1], ['P02', 1]])
    // 카테고리 6개(delete·unassigned 제외) 중 5개: 0회(bar·gym·library·museum) → 1회(cafe·park) 중 앞 5개
    expect(body.placeCategories).toHaveLength(5)
    expect(body.placeCategories.map((c: { slug: string }) => c.slug)).toEqual(['bar', 'gym', 'library', 'museum', 'cafe'])
  })

  it('limit을 주면 그 개수다', async () => {
    const body = await (await GET(request('?limit=1', AUTH))).json()
    expect(body.limit).toBe(1)
    expect(body.patterns).toHaveLength(1)
    expect(body.tribes).toHaveLength(1)
    expect(body.placeCategories).toHaveLength(1)
    const wide = await (await GET(request('?limit=50', AUTH))).json()
    expect(wide.placeCategories).toHaveLength(6)
  })

  it('시험 묶음과 승인 전 항목은 uses에 들어가지 않는다', async () => {
    const body = await (await GET(request('', AUTH))).json()
    const p03 = body.patterns.find((p: { patternNo: string }) => p.patternNo === 'P03')
    expect(p03).toMatchObject({ uses: 0, lastUsedAt: null })
    expect(body.placeCategories.find((c: { slug: string }) => c.slug === 'museum')).toMatchObject({ uses: 0, lastUsedAt: null })
  })

  it('쉬는 중·보관 패턴, 비활성 트라이브, delete·unassigned는 응답에 없다', async () => {
    const body = await (await GET(request('?limit=50', AUTH))).json()
    expect(body.patterns.map((p: { patternNo: string }) => p.patternNo)).toEqual(['P03', 'P01', 'P02'])
    expect(body.tribes.map((t: { tribeId: string }) => t.tribeId)).toEqual([TRIBE_ACTIVE_1, TRIBE_ACTIVE_2])
    expect(JSON.stringify(body)).not.toContain(TRIBE_INACTIVE)
    const slugs = body.placeCategories.map((c: { slug: string }) => c.slug)
    expect(slugs).not.toContain('delete')
    expect(slugs).not.toContain('unassigned')
  })

  it('트라이브와 카테고리의 횟수·마지막 사용을 싣는다', async () => {
    const body = await (await GET(request('?limit=50', AUTH))).json()
    // 둘 다 1회·같은 마지막 사용이라 sort_order 순이다.
    expect(body.tribes).toEqual([
      { tribeId: TRIBE_ACTIVE_1, name: '트라이브 하나', uses: 1, lastUsedAt: '2026-10-01T00:00:00.000Z' },
      { tribeId: TRIBE_ACTIVE_2, name: '트라이브 둘', uses: 1, lastUsedAt: '2026-10-01T00:00:00.000Z' },
    ])
    expect(body.placeCategories.find((c: { slug: string }) => c.slug === 'cafe')).toEqual({ slug: 'cafe', uses: 1, lastUsedAt: '2026-10-01T00:00:00.000Z' })
    expect(body.placeCategories.find((c: { slug: string }) => c.slug === 'park')).toEqual({ slug: 'park', uses: 1, lastUsedAt: '2026-10-01T00:00:00.000Z' })
  })

  it('쓴 기록이 없으면 모두 0회이고 마지막 사용은 null이다', async () => {
    h.db.tables.ops_bundle_items = []
    const body = await (await GET(request('', AUTH))).json()
    expect(body.countedItems).toBe(0)
    for (const line of [...body.patterns, ...body.tribes, ...body.placeCategories]) {
      expect(line).toMatchObject({ uses: 0, lastUsedAt: null })
    }
  })

  it('테이블이 비어 있어도 200이고 빈 목록이다(오류 아님)', async () => {
    h.db.tables = {}
    const res = await GET(request('', AUTH))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ countedItems: 0, patterns: [], tribes: [], placeCategories: [] })
  })

  it('응답 본문 어디에도 author·actor·raw·updated_by와 그 값이 없다', async () => {
    expectNoSecrets(await (await GET(request('?limit=50', AUTH))).json())
  })

  it('select 목록에 관리자 ID·제출 원본 칸이 없다', async () => {
    await GET(request('', AUTH))
    expect(h.db.selects.map((s) => s.table).sort()).toEqual(['ops_bundle_items', 'ops_patterns', 'poi_categories', 'tribes'])
    for (const { columns } of h.db.selects) {
      for (const forbidden of ['author', 'raw', 'actor', 'updated_by', 'confirmed_by']) {
        expect(columns, columns).not.toContain(forbidden)
      }
    }
  })

  it('같은 데이터와 같은 시각이면 두 번 불러도 응답이 같다', async () => {
    const first = await (await GET(request('', AUTH))).json()
    const second = await (await GET(request('', AUTH))).json()
    expect(second).toEqual(first)
  })

  it('토큰이 틀리거나 없고 세션도 없으면 403이고 아무것도 읽지 않는다', async () => {
    expect((await GET(request('', { 'x-admin-read-token': 'wrong' }))).status).toBe(403)
    expect((await GET(request())).status).toBe(403)
    expect(h.db.reads).toBe(0)
  })

  it('환경변수에 토큰이 없으면 토큰으로 읽을 수 없다', async () => {
    delete process.env.ADMIN_API_READ_TOKEN
    expect((await GET(request('', AUTH))).status).toBe(403)
    expect(h.db.reads).toBe(0)
  })

  it('limit이 0·51·abc·2.5면 400이고 아무것도 읽지 않는다', async () => {
    for (const query of ['?limit=0', '?limit=51', '?limit=abc', '?limit=2.5', '?limit=-1']) {
      const res = await GET(request(query, AUTH))
      expect(res.status, query).toBe(400)
      expect(typeof (await res.json()).error).toBe('string')
    }
    expect(h.db.reads).toBe(0)
  })

  it('기준 시각을 바꾸는 쿼리는 받지 않는다', async () => {
    const body = await (await GET(request('?now=2026-01-01T00:00:00Z&since=2026-01-01&until=2026-01-02&asOf=2026-01-01', AUTH))).json()
    expect(body.now).toBe(NOW.toISOString())
  })

  it('조회가 실패하면 고정 문장 500이고 원문은 싣지 않는다', async () => {
    h.db.error = 'relation "ops_bundle_items" does not exist (원문 오류)'
    const res = await GET(request('', AUTH))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: '조합 뽑기 결과를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.' })
    expect(JSON.stringify(body)).not.toContain('원문')
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[admin/ops-patterns/draw]'), expect.anything())
  })

  it('GET만 export한다', () => {
    expect(Object.keys(route)).toEqual(['GET'])
  })
})
