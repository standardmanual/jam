/**
 * POST /api/admin/ops-inbox — 제출 라우트 (티켓 20260930_1816)
 *
 * 서비스 클라이언트는 메모리 안의 가짜 DB로 바꾼다(실 DB에 접속하지 않는다). 지키는 것:
 * - 읽기 토큰 제출: 묶음·항목이 저장되고 결정 기록에 `submit` 1행이 남는다
 * - 인증: 토큰이 없거나 틀리거나 제출 경로가 아니면 세션 검사로 넘어가 거부된다
 * - 재제출: 같은 내용 200(슬랙 없음) / 다른 내용 409(덮어쓰지 않음), 동시 제출은 유일 제약으로 같은 처리
 * - 400(JSON 아님·필수 형식·1MB·항목 60개), 429(시간당 20회), 저장 중 실패는 되돌림(500)
 * - 슬랙: 응답 뒤에 게시하고, 실패하거나 환경변수가 없어도 제출은 성공이며 결과가 결정 기록에 남는다
 * - 카드 칸(티켓 20261001_1152): 옛 형식 묶음도 201(오류 문장 포함, 원본 보존), 뺀 항목 사유 없음은 묶음 오류만,
 *   없는 tribe_id는 항목 오류, 트라이브 조회가 실패하면 500이고 아무것도 저장하지 않는다
 * - 패턴 번호·지점 카테고리(티켓 20261007_1745): 형식이 틀린 번호는 열을 비워 저장하고 사전에 없는 번호는 열에 남기며 둘 다 201이다,
 *   없는 카테고리 slug는 항목 오류, 패턴 번호·카테고리 조회가 실패하면 500이고 아무것도 저장하지 않는다
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  type Result = { data?: unknown; count?: number | null; error: { code?: string; message: string } | null }

  const state = {
    tables: {
      ops_bundles: [],
      ops_bundle_items: [],
      ops_decisions: [],
      users: [],
      tribes: [],
      ops_patterns: [],
      poi_categories: [],
    } as Record<string, Row[]>,
    failInsert: new Set<string>(),
    failCount: false,
    failTribes: false,
    failPatterns: false,
    failCategories: false,
    hideExistingOnce: false,
    seq: 0,
    afterCallbacks: [] as Array<() => unknown>,
    user: null as { id: string; email: string } | null,
  }

  const DEFAULTS: Record<string, () => Row> = {
    ops_bundles: () => ({ received_at: new Date().toISOString() }),
    ops_bundle_items: () => ({ created_at: new Date().toISOString() }),
    ops_decisions: () => ({ item_id: null, batch_id: null, diff: null, reason: null, slack_result: null }),
  }

  class Query implements PromiseLike<Result> {
    private mode: 'select' | 'insert' | 'update' | 'delete' = 'select'
    private payload: Row | Row[] = {}
    private filters: Array<(row: Row) => boolean> = []
    private countMode = false
    private returning = false

    constructor(private table: string) {}

    select(_cols?: string, opts?: { count?: string; head?: boolean }) {
      if (this.mode === 'insert') this.returning = true
      else this.countMode = Boolean(opts?.count)
      return this
    }
    insert(payload: Row | Row[]) {
      this.mode = 'insert'
      this.payload = payload
      return this
    }
    update(payload: Row) {
      this.mode = 'update'
      this.payload = payload
      return this
    }
    delete() {
      this.mode = 'delete'
      return this
    }
    eq(col: string, val: unknown) {
      this.filters.push((row) => row[col] === val)
      return this
    }
    gte(col: string, val: string) {
      this.filters.push((row) => String(row[col]) >= val)
      return this
    }
    async single() {
      return this.run(true)
    }
    async maybeSingle() {
      return this.run(true)
    }
    then<T1 = Result, T2 = never>(
      onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
    ): PromiseLike<T1 | T2> {
      return Promise.resolve(this.run(false)).then(onfulfilled, onrejected)
    }

    private run(single: boolean): Result {
      const rows = state.tables[this.table]
      const matches = () => rows.filter((row) => this.filters.every((f) => f(row)))

      if (this.mode === 'insert') {
        if (state.failInsert.has(this.table)) return { data: null, error: { message: 'boom' } }
        const list = Array.isArray(this.payload) ? this.payload : [this.payload]
        const inserted: Row[] = []
        for (const item of list) {
          if (this.table === 'ops_bundles' && rows.some((r) => r.bundle_id === item.bundle_id)) {
            return { data: null, error: { code: '23505', message: 'duplicate key value' } }
          }
          const row = { id: `id-${++state.seq}`, ...DEFAULTS[this.table](), ...item }
          rows.push(row)
          inserted.push(row)
        }
        if (!this.returning) return { data: null, error: null }
        return { data: single ? { id: inserted[0].id } : inserted.map((r) => ({ id: r.id })), error: null }
      }

      if (this.mode === 'update') {
        for (const row of matches()) Object.assign(row, this.payload)
        return { data: null, error: null }
      }

      if (this.mode === 'delete') {
        const gone = new Set(matches())
        state.tables[this.table] = rows.filter((r) => !gone.has(r))
        if (this.table === 'ops_bundles') {
          const ids = new Set([...gone].map((r) => r.id))
          state.tables.ops_bundle_items = state.tables.ops_bundle_items.filter((r) => !ids.has(r.bundle_id))
          state.tables.ops_decisions = state.tables.ops_decisions.filter((r) => !ids.has(r.bundle_id))
        }
        return { data: null, error: null }
      }

      if (this.table === 'tribes' && state.failTribes) return { data: null, error: { message: 'tribes boom secret detail' } }
      if (this.table === 'ops_patterns' && state.failPatterns) return { data: null, error: { message: 'patterns boom secret detail' } }
      if (this.table === 'poi_categories' && state.failCategories) return { data: null, error: { message: 'categories boom secret detail' } }
      if (this.countMode) {
        if (state.failCount) return { count: null, error: { message: 'count failed' } }
        return { count: matches().length, error: null }
      }
      if (state.hideExistingOnce) {
        state.hideExistingOnce = false
        return { data: null, error: null }
      }
      const found = matches()
      return { data: single ? (found[0] ?? null) : found, error: null }
    }
  }

  return { state, Query, postOpsSlack: vi.fn() }
})

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: (table: string) => new h.Query(table) }),
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.state.user } }) } }),
}))

// after()는 요청 범위 밖에서 부를 수 없다. 콜백을 모아 두었다가 테스트가 「응답이 끝난 뒤」를 직접 흉내 낸다.
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (cb: () => unknown) => void h.state.afterCallbacks.push(cb) }
})

vi.mock('@/lib/admin/opsInbox/slack', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/opsInbox/slack')>()
  return { ...actual, postOpsSlack: h.postOpsSlack }
})

import { POST } from '../route'
import { computeRawHash } from '@/lib/admin/opsInbox/rawHash'
import { MAX_ITEMS, MAX_SUBMISSIONS_PER_HOUR } from '@/lib/admin/opsInbox/constants'

const TOKEN = 'test-admin-read-token-abcdef'
const URL_OK = 'http://localhost/api/admin/ops-inbox'
const ENV_KEYS = ['ADMIN_API_READ_TOKEN', 'ADMIN_EMAILS'] as const

const REVIEW = { world_related: false, winter_reviewed: false, reason: '운영성 카드예요' }
const TRIBE_ID = '3f2c9a10-5b7e-4d21-8a64-0c1e7b9d2f55'
const MISSING_TRIBE_ID = '9a8b7c6d-1e2f-4a3b-8c4d-5e6f7a8b9c0d'

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    item_key: 'card-1',
    kind: 'home_feed_card',
    shape: 'hero',
    exposure_tags: ['all'],
    pattern_no: 'P07',
    starts_at: '2026-10-05T09:00:00+09:00',
    ends_at: '2026-10-06T09:00:00+09:00',
    user_experience: '월요일 아침에 이번 주 미션을 한눈에 볼 수 있어요',
    world_review: REVIEW,
    ...overrides,
  }
}

function makeBundle(overrides: Record<string, unknown> = {}) {
  return {
    bundle_id: 'sample-2026-w41',
    author: '윤진',
    week: '2026-W41',
    hypothesis: '월요일 카드가 미션 참여를 늘린다',
    is_sample: true,
    items: [
      makeItem({ links: ['mission-1'] }),
      makeItem({ item_key: 'mission-1', kind: 'mission', links: ['card-1'] }),
    ],
    ...overrides,
  }
}

interface SubmitOptions {
  token?: string | null
  url?: string
  raw?: string
}

function submit(body: unknown, options: SubmitOptions = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (options.token !== null) headers['x-admin-read-token'] = options.token ?? TOKEN
  return POST(
    new Request(options.url ?? URL_OK, { method: 'POST', headers, body: options.raw ?? JSON.stringify(body) })
  )
}

/** 응답이 나간 뒤 after()에 등록된 일을 실행한다. */
async function flushAfter() {
  const callbacks = h.state.afterCallbacks.splice(0)
  for (const cb of callbacks) await cb()
}

function seedBundles(count: number, receivedAt: Date) {
  for (let i = 0; i < count; i++) {
    h.state.tables.ops_bundles.push({
      id: `seed-${i}`,
      bundle_id: `seed-bundle-${i}-${receivedAt.getTime()}`,
      raw_hash: 'seed',
      received_at: receivedAt.toISOString(),
    })
  }
}

describe('POST /api/admin/ops-inbox', () => {
  const saved: Record<string, string | undefined> = {}
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    for (const key of ENV_KEYS) saved[key] = process.env[key]
    process.env.ADMIN_API_READ_TOKEN = TOKEN
    process.env.ADMIN_EMAILS = 'admin@example.com'
    h.state.tables = {
      ops_bundles: [],
      ops_bundle_items: [],
      ops_decisions: [],
      users: [],
      tribes: [{ id: TRIBE_ID }],
      ops_patterns: [{ pattern_no: 'P07' }, { pattern_no: 'P20' }],
      poi_categories: [{ slug: 'cafe' }, { slug: 'park' }],
    }
    h.state.failInsert.clear()
    h.state.failCount = false
    h.state.failTribes = false
    h.state.failPatterns = false
    h.state.failCategories = false
    h.state.hideExistingOnce = false
    h.state.seq = 0
    h.state.afterCallbacks = []
    h.state.user = null
    h.postOpsSlack.mockReset()
    h.postOpsSlack.mockResolvedValue({ ok: true })
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
    consoleError.mockRestore()
  })

  describe('저장', () => {
    it('읽기 토큰으로 샘플 묶음을 내면 묶음·항목이 저장되고 결정 기록에 「제출」 1행이 남는다', async () => {
      const body = makeBundle()
      const res = await submit(body)

      expect(res.status).toBe(201)
      const json = await res.json()
      expect(json).toEqual({
        status: 'created',
        id: expect.any(String),
        bundle_id: 'sample-2026-w41',
        item_count: 2,
        format_errors: [],
        // 두 항목 모두 image_spec이 없어 경고만 실린다(오류 아님, 티켓 20261007_1030)
        warnings: [expect.stringMatching(/^items\[0\]\.image_spec: 비어 있어요/), expect.stringMatching(/^items\[1\]\.image_spec: 비어 있어요/)],
      })

      const { ops_bundles: bundles, ops_bundle_items: items, ops_decisions: decisions } = h.state.tables
      expect(bundles).toHaveLength(1)
      expect(bundles[0]).toMatchObject({
        id: json.id,
        bundle_id: 'sample-2026-w41',
        author: '윤진',
        week: '2026-W41',
        hypothesis: '월요일 카드가 미션 참여를 늘린다',
        is_sample: true,
        format_errors: [],
        raw: body,
        raw_hash: computeRawHash(body),
      })

      expect(items).toHaveLength(2)
      expect(items.map((i) => [i.position, i.item_key, i.kind, i.status])).toEqual([
        [0, 'card-1', 'home_feed_card', 'arrived'],
        [1, 'mission-1', 'mission', 'arrived'],
      ])
      expect(items[0]).toMatchObject({
        bundle_id: json.id,
        pattern_no: 'P07',
        starts_at: '2026-10-05T00:00:00.000Z',
        ends_at: '2026-10-06T00:00:00.000Z',
        original: body.items[0],
        format_errors: [],
      })

      expect(decisions).toHaveLength(1)
      expect(decisions[0]).toMatchObject({
        bundle_id: json.id,
        item_id: null,
        action: 'submit',
        actor: 'token:윤진',
        slack_result: null,
      })
    })

    it('형식 오류가 있어도 받아서 저장하고 「경로: 사유」 목록을 돌려준다', async () => {
      const body = makeBundle({
        week: 'bad',
        items: [makeItem({ kind: 'banner' }), makeItem({ item_key: 'b', user_experience: '' })],
      })
      const res = await submit(body)

      expect(res.status).toBe(201)
      const json = await res.json()
      expect(json.item_count).toBe(2)
      expect(json.format_errors).toHaveLength(3)
      expect(json.format_errors[0]).toMatch(/^week: /)
      expect(json.format_errors[1]).toMatch(/^items\[0\]\.kind: /)
      expect(json.format_errors[2]).toMatch(/^items\[1\]\.user_experience: /)

      expect(h.state.tables.ops_bundles[0].format_errors).toEqual(json.format_errors)
      expect(h.state.tables.ops_bundles[0].week).toBeNull()
      expect(h.state.tables.ops_bundle_items[0].format_errors).toEqual([json.format_errors[1]])
      expect(h.state.tables.ops_bundle_items[1].format_errors).toEqual([json.format_errors[2]])
      expect(h.state.tables.ops_decisions).toHaveLength(1)
    })

    it('image_spec 모양이 틀리면 201과 warnings만 돌려주고 DB에는 경고를 저장하지 않는다', async () => {
      const bad = makeItem({ image_spec: { preset_id: 1 } })
      const res = await submit(makeBundle({ items: [bad] }))
      expect(res.status).toBe(201)
      const json = await res.json()
      expect(json.format_errors).toEqual([])
      expect(json.warnings).toHaveLength(1)
      expect(json.warnings[0]).toMatch(/^items\[0\]\.image_spec\.preset_id: /)
      expect(h.state.tables.ops_bundles[0].format_errors).toEqual([])
      expect(h.state.tables.ops_bundle_items[0].format_errors).toEqual([])
    })

    it('모양이 맞는 image_spec은 경고 없이 받는다', async () => {
      const ok = makeItem({ image_spec: { preset_id: 'p1', bg: '#111111', end: '#222222', values: { title: '제목' } } })
      const res = await submit(makeBundle({ items: [ok] }))
      expect(res.status).toBe(201)
      expect((await res.json()).warnings).toEqual([])
    })

    it('항목이 없는 묶음도 받는다(항목 저장 호출 없이 결정 기록만)', async () => {
      const res = await submit(makeBundle({ items: [] }))
      expect(res.status).toBe(201)
      expect(h.state.tables.ops_bundle_items).toHaveLength(0)
      expect(h.state.tables.ops_decisions).toHaveLength(1)
    })
  })

  describe('인증', () => {
    it.each([
      ['토큰 없음', null],
      ['틀린 토큰', 'wrong-token'],
    ])('%s이고 세션도 없으면 403이며 아무것도 저장하지 않는다', async (_label, token) => {
      const res = await submit(makeBundle(), { token })
      expect(res.status).toBe(403)
      expect(h.state.tables.ops_bundles).toHaveLength(0)
      expect(h.state.afterCallbacks).toHaveLength(0)
    })

    it('환경변수가 없으면 올바른 값을 보내도 403이다', async () => {
      delete process.env.ADMIN_API_READ_TOKEN
      const res = await submit(makeBundle())
      expect(res.status).toBe(403)
      expect(h.state.tables.ops_bundles).toHaveLength(0)
    })

    it.each([
      'http://localhost/api/admin/ops-inbox/x',
      'http://localhost/api/admin/ops-inbox/',
      'http://localhost/api/admin/ops-inboxx',
      'http://localhost/api/admin/missions',
    ])('맞는 토큰이라도 경로가 %s이면(라우트가 잘못 불려도) 토큰으로 통과하지 못한다', async (url) => {
      const res = await submit(makeBundle(), { url })
      expect(res.status).toBe(403)
      expect(h.state.tables.ops_bundles).toHaveLength(0)
    })

    it('관리자 로그인 세션으로도 낼 수 있고 행위자는 관리자 ID다', async () => {
      h.state.user = { id: 'admin-user-id', email: 'admin@example.com' }
      const res = await submit(makeBundle(), { token: null })
      expect(res.status).toBe(201)
      expect(h.state.tables.ops_decisions[0].actor).toBe('admin-user-id')
    })

    it('관리자가 아닌 로그인 세션은 403이다', async () => {
      h.state.user = { id: 'someone', email: 'someone@example.com' }
      const res = await submit(makeBundle(), { token: null })
      expect(res.status).toBe(403)
      expect(h.state.tables.ops_bundles).toHaveLength(0)
    })
  })

  describe('400', () => {
    it('JSON이 아니면 400이다', async () => {
      for (const raw of ['not json', '', '{"a":']) {
        const res = await submit(null, { raw })
        expect(res.status).toBe(400)
        expect((await res.json()).error).toMatch(/JSON/)
      }
      expect(h.state.tables.ops_bundles).toHaveLength(0)
    })

    it('bundle_id가 없으면 400이고 사유를 돌려준다', async () => {
      const res = await submit(makeBundle({ bundle_id: undefined }))
      expect(res.status).toBe(400)
      expect((await res.json()).details).toEqual(['bundle_id: 필수 항목이 없어요.'])
    })

    it('author가 없으면 400이다', async () => {
      const res = await submit(makeBundle({ author: undefined }))
      expect(res.status).toBe(400)
      expect((await res.json()).details).toEqual(['author: 필수 항목이 없어요.'])
    })

    it('최상위가 객체가 아니면 400이다', async () => {
      const res = await submit([1, 2])
      expect(res.status).toBe(400)
    })

    it('items가 배열이 아니면 400이다', async () => {
      const res = await submit(makeBundle({ items: 'x' }))
      expect(res.status).toBe(400)
    })

    it(`항목이 ${MAX_ITEMS}개를 넘으면 400이다`, async () => {
      const items = Array.from({ length: MAX_ITEMS + 1 }, (_, i) => makeItem({ item_key: `k${i}` }))
      const res = await submit(makeBundle({ items }))
      expect(res.status).toBe(400)
      expect(h.state.tables.ops_bundles).toHaveLength(0)
    })

    it('본문이 1MB를 넘으면 400이다(글자 수가 아니라 바이트로 센다)', async () => {
      // '가'는 UTF-8로 3바이트 — 400,000자는 1.2MB다.
      const res = await submit(makeBundle({ hypothesis: '가'.repeat(400_000) }))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toMatch(/1MB/)
      expect(h.state.tables.ops_bundles).toHaveLength(0)
    })

    it('본문이 1MB 이하면 받는다', async () => {
      const res = await submit(makeBundle({ hypothesis: '가'.repeat(300_000) }))
      expect(res.status).toBe(201)
    })

    it('400이면 슬랙 글도 올리지 않는다', async () => {
      await submit(makeBundle({ author: undefined }))
      await flushAfter()
      expect(h.postOpsSlack).not.toHaveBeenCalled()
    })
  })

  describe('429 — 시간당 제출 수', () => {
    it(`최근 1시간에 ${MAX_SUBMISSIONS_PER_HOUR}건이 이미 있으면 429다`, async () => {
      seedBundles(MAX_SUBMISSIONS_PER_HOUR, new Date())
      const res = await submit(makeBundle())
      expect(res.status).toBe(429)
      expect((await res.json()).error).toContain(`${MAX_SUBMISSIONS_PER_HOUR}회`)
      expect(h.state.tables.ops_bundles).toHaveLength(MAX_SUBMISSIONS_PER_HOUR)
    })

    it(`${MAX_SUBMISSIONS_PER_HOUR - 1}건이면 받는다(스무 번째 제출)`, async () => {
      seedBundles(MAX_SUBMISSIONS_PER_HOUR - 1, new Date())
      const res = await submit(makeBundle())
      expect(res.status).toBe(201)
    })

    it('1시간보다 오래된 제출은 세지 않는다', async () => {
      seedBundles(MAX_SUBMISSIONS_PER_HOUR + 5, new Date(Date.now() - 2 * 60 * 60 * 1000))
      const res = await submit(makeBundle())
      expect(res.status).toBe(201)
    })

    it('제출 수를 셀 수 없으면 500이다(제한을 건너뛰고 받지 않는다)', async () => {
      h.state.failCount = true
      const res = await submit(makeBundle())
      expect(res.status).toBe(500)
      expect(h.state.tables.ops_bundles).toHaveLength(0)
    })
  })

  describe('재제출', () => {
    it('같은 bundle_id·같은 내용이면 200(이미 받았어요)이고 다시 저장하지도 슬랙에 알리지도 않는다', async () => {
      const body = makeBundle()
      const first = await submit(body)
      await flushAfter()
      expect(h.postOpsSlack).toHaveBeenCalledTimes(1)

      const second = await submit(body)
      await flushAfter()

      expect(second.status).toBe(200)
      const json = await second.json()
      expect(json).toMatchObject({
        status: 'duplicate',
        message: '이미 받았어요.',
        id: (await first.json()).id,
        bundle_id: 'sample-2026-w41',
        item_count: 2,
      })
      expect(h.state.tables.ops_bundles).toHaveLength(1)
      expect(h.state.tables.ops_bundle_items).toHaveLength(2)
      expect(h.state.tables.ops_decisions).toHaveLength(1)
      expect(h.postOpsSlack).toHaveBeenCalledTimes(1)
    })

    it('키 순서만 다른 같은 내용도 같은 제출로 본다(200)', async () => {
      await submit({ bundle_id: 'k', author: 'a', items: [{ b: 1, a: 2 }] })
      const res = await submit({ items: [{ a: 2, b: 1 }], author: 'a', bundle_id: 'k' })
      expect(res.status).toBe(200)
      expect((await res.json()).status).toBe('duplicate')
    })

    it('같은 bundle_id인데 내용이 다르면 409이고 덮어쓰지 않는다', async () => {
      const original = makeBundle()
      await submit(original)
      await flushAfter()
      h.postOpsSlack.mockClear()

      const res = await submit(makeBundle({ hypothesis: '바뀐 가설', items: [makeItem()] }))
      await flushAfter()

      expect(res.status).toBe(409)
      expect((await res.json()).error).toMatch(/새 bundle_id/)
      expect(h.state.tables.ops_bundles).toHaveLength(1)
      expect(h.state.tables.ops_bundles[0].raw).toEqual(original)
      expect(h.state.tables.ops_bundles[0].hypothesis).toBe('월요일 카드가 미션 참여를 늘린다')
      expect(h.state.tables.ops_bundle_items).toHaveLength(2)
      expect(h.state.tables.ops_decisions).toHaveLength(1)
      expect(h.postOpsSlack).not.toHaveBeenCalled()
    })

    it('같은 주차의 다른 bundle_id 묶음은 둘 이상 받는다', async () => {
      expect((await submit(makeBundle({ bundle_id: 'a' }))).status).toBe(201)
      expect((await submit(makeBundle({ bundle_id: 'b' }))).status).toBe(201)
      expect(h.state.tables.ops_bundles).toHaveLength(2)
    })

    describe('동시 제출(유일 제약 위반)', () => {
      it('먼저 들어온 묶음과 내용이 같으면 200이다', async () => {
        const body = makeBundle()
        await submit(body)
        h.state.afterCallbacks = []
        h.state.hideExistingOnce = true // 조회 시점에는 아직 안 보였다가 저장 시점에 부딪히는 상황

        const res = await submit(body)
        expect(res.status).toBe(200)
        expect((await res.json()).status).toBe('duplicate')
        expect(h.state.tables.ops_bundles).toHaveLength(1)
        expect(h.state.afterCallbacks).toHaveLength(0)
      })

      it('먼저 들어온 묶음과 내용이 다르면 409이다', async () => {
        await submit(makeBundle())
        h.state.hideExistingOnce = true

        const res = await submit(makeBundle({ hypothesis: '다른 가설' }))
        expect(res.status).toBe(409)
        expect(h.state.tables.ops_bundles).toHaveLength(1)
      })
    })
  })

  describe('저장 중 실패는 되돌린다', () => {
    it('항목 저장이 실패하면 넣은 묶음을 지우고 500이다', async () => {
      h.state.failInsert.add('ops_bundle_items')
      const res = await submit(makeBundle())
      expect(res.status).toBe(500)
      expect(h.state.tables.ops_bundles).toHaveLength(0)
      expect(h.state.tables.ops_bundle_items).toHaveLength(0)
      expect(h.state.tables.ops_decisions).toHaveLength(0)
      expect(h.state.afterCallbacks).toHaveLength(0)
    })

    it('결정 기록 저장이 실패하면 묶음과 항목을 지우고 500이다', async () => {
      h.state.failInsert.add('ops_decisions')
      const res = await submit(makeBundle())
      expect(res.status).toBe(500)
      expect(h.state.tables.ops_bundles).toHaveLength(0)
      expect(h.state.tables.ops_bundle_items).toHaveLength(0)
      expect(h.state.afterCallbacks).toHaveLength(0)
    })

    it('묶음 저장이 실패하면 500이다', async () => {
      h.state.failInsert.add('ops_bundles')
      const res = await submit(makeBundle())
      expect(res.status).toBe(500)
      expect(h.state.tables.ops_bundles).toHaveLength(0)
    })

    it('되돌린 뒤 같은 묶음을 다시 내면 받는다', async () => {
      h.state.failInsert.add('ops_bundle_items')
      await submit(makeBundle())
      h.state.failInsert.clear()
      const res = await submit(makeBundle())
      expect(res.status).toBe(201)
      expect(h.state.tables.ops_bundles).toHaveLength(1)
    })
  })

  describe('카드 칸 (티켓 20261001_1152)', () => {
    it('옛 형식 묶음(segment만 있는 항목)은 201이고 오류 문장을 돌려주며 segment를 원본에 보존한다', async () => {
      const legacy = { ...makeItem(), segment: 'new_user' } as Record<string, unknown>
      delete legacy.shape
      delete legacy.exposure_tags
      const body = makeBundle({ items: [legacy] })
      const res = await submit(body)

      expect(res.status).toBe(201)
      const json = await res.json()
      expect(json.format_errors).toHaveLength(2)
      expect(json.format_errors[0]).toMatch(/^items\[0\]\.shape: 필수 항목이 없어요/)
      expect(json.format_errors[1]).toMatch(/^items\[0\]\.exposure_tags: 필수 항목이 없어요/)
      expect(h.state.tables.ops_bundle_items[0].format_errors).toEqual(json.format_errors)
      expect(h.state.tables.ops_bundle_items[0].original).toMatchObject({ segment: 'new_user' })
      expect(h.state.tables.ops_bundles[0].raw).toEqual(body)
    })

    it('뺀 항목에 사유가 없으면 201이고 묶음 오류에만 담긴다(항목 오류에는 없다)', async () => {
      const res = await submit(makeBundle({ excluded_items: [{ item_key: 'x-1', stage: 'world_review' }] }))

      expect(res.status).toBe(201)
      const json = await res.json()
      expect(json.format_errors).toEqual(['excluded_items[0].reason: 필수 항목이 없어요(뺀 이유를 한 줄로 적어 주세요).'])
      expect(h.state.tables.ops_bundles[0].format_errors).toEqual(json.format_errors)
      for (const stored of h.state.tables.ops_bundle_items) expect(stored.format_errors).toEqual([])
    })

    it('tribes에 없는 tribe_id는 201이고 그 항목의 형식 오류다', async () => {
      const res = await submit(
        makeBundle({ items: [makeItem({ tribe_id: TRIBE_ID }), makeItem({ item_key: 'card-2', tribe_id: MISSING_TRIBE_ID })] })
      )

      expect(res.status).toBe(201)
      const json = await res.json()
      expect(json.format_errors).toHaveLength(1)
      expect(json.format_errors[0]).toMatch(/^items\[1\]\.tribe_id: 없는 트라이브예요/)
      expect(h.state.tables.ops_bundle_items[0].format_errors).toEqual([])
      expect(h.state.tables.ops_bundle_items[1].format_errors).toEqual(json.format_errors)
    })

    it('트라이브 목록을 읽지 못하면 500이고 아무것도 저장하지 않으며 슬랙 글도 없다(같은 본문을 다시 내면 받는다)', async () => {
      h.state.failTribes = true
      const res = await submit(makeBundle())

      expect(res.status).toBe(500)
      expect(JSON.stringify(await res.json())).not.toContain('secret detail')
      expect(h.state.tables.ops_bundles).toHaveLength(0)
      expect(h.state.tables.ops_bundle_items).toHaveLength(0)
      expect(h.state.tables.ops_decisions).toHaveLength(0)
      expect(h.state.afterCallbacks).toHaveLength(0)

      h.state.failTribes = false
      expect((await submit(makeBundle())).status).toBe(201)
    })
  })

  describe('패턴 번호·지점 카테고리 (티켓 20261007_1745)', () => {
    it('형식이 틀린 번호(P-07·7·p07)는 201이고 항목 형식 오류로 남으며 열은 NULL, 원본에는 그대로 있다', async () => {
      const body = makeBundle({
        items: [
          makeItem({ item_key: 'a', pattern_no: 'P-07' }),
          makeItem({ item_key: 'b', pattern_no: 7 }),
          makeItem({ item_key: 'c', pattern_no: 'p07' }),
        ],
      })
      const res = await submit(body)

      expect(res.status).toBe(201)
      const json = await res.json()
      expect(json.format_errors).toHaveLength(3)
      json.format_errors.forEach((line: string, index: number) => {
        expect(line).toMatch(new RegExp(`^items\\[${index}\\]\\.pattern_no: 패턴 번호는 P01처럼`))
      })
      const stored = h.state.tables.ops_bundle_items
      expect(stored.map((row) => row.pattern_no)).toEqual([null, null, null])
      expect(stored.map((row) => (row.original as Record<string, unknown>).pattern_no)).toEqual(['P-07', 7, 'p07'])
      expect(stored[0].format_errors).toEqual([json.format_errors[0]])
    })

    it('사전에 없는 번호(P99)는 201이고 항목 형식 오류로 남으며 열에는 값 그대로 저장된다', async () => {
      const res = await submit(makeBundle({ items: [makeItem({ pattern_no: 'P99' })] }))

      expect(res.status).toBe(201)
      const json = await res.json()
      expect(json.format_errors).toHaveLength(1)
      expect(json.format_errors[0]).toMatch(/^items\[0\]\.pattern_no: 패턴 사전에 없는 번호예요/)
      expect(h.state.tables.ops_bundle_items[0].pattern_no).toBe('P99')
      expect(h.state.tables.ops_bundle_items[0].format_errors).toEqual(json.format_errors)
    })

    it('사전에 있는 번호는 오류가 없고 번호 앞뒤 공백은 떼어 저장한다', async () => {
      const res = await submit(makeBundle({ items: [makeItem({ pattern_no: ' P20 ' })] }))

      expect(res.status).toBe(201)
      expect((await res.json()).format_errors).toEqual([])
      expect(h.state.tables.ops_bundle_items[0].pattern_no).toBe('P20')
    })

    it('pattern_no가 없으면 오류 없이 저장한다(필수 아님)', async () => {
      const item = makeItem()
      delete (item as Record<string, unknown>).pattern_no
      const res = await submit(makeBundle({ items: [item] }))

      expect(res.status).toBe(201)
      expect((await res.json()).format_errors).toEqual([])
      expect(h.state.tables.ops_bundle_items[0].pattern_no).toBeNull()
    })

    it('없는 지점 카테고리 slug는 201이고 항목 형식 오류이며, 있는 slug와 빈 배열은 오류가 없다', async () => {
      const res = await submit(
        makeBundle({
          items: [
            makeItem({ item_key: 'a', knobs: { place_category: ['cafe', 'park'] } }),
            makeItem({ item_key: 'b', knobs: { place_category: [] } }),
            makeItem({ item_key: 'c', knobs: { place_category: ['cafe', 'zoo'] } }),
          ],
        })
      )

      expect(res.status).toBe(201)
      const json = await res.json()
      expect(json.format_errors).toHaveLength(1)
      expect(json.format_errors[0]).toMatch(/^items\[2\]\.knobs\.place_category: 없는 지점 카테고리예요 — "zoo"/)
      expect(h.state.tables.ops_bundle_items.map((row) => (row.format_errors as string[]).length)).toEqual([0, 0, 1])
    })

    it('패턴 번호 목록을 읽지 못하면 500이고 아무것도 저장하지 않으며 슬랙 글도 없다(같은 본문을 다시 내면 받는다)', async () => {
      h.state.failPatterns = true
      const res = await submit(makeBundle())

      expect(res.status).toBe(500)
      expect(JSON.stringify(await res.json())).not.toContain('secret detail')
      expect(h.state.tables.ops_bundles).toHaveLength(0)
      expect(h.state.tables.ops_bundle_items).toHaveLength(0)
      expect(h.state.tables.ops_decisions).toHaveLength(0)
      expect(h.state.afterCallbacks).toHaveLength(0)

      h.state.failPatterns = false
      expect((await submit(makeBundle())).status).toBe(201)
    })

    it('지점 카테고리 목록을 읽지 못하면 500이고 아무것도 저장하지 않으며 슬랙 글도 없다(같은 본문을 다시 내면 받는다)', async () => {
      h.state.failCategories = true
      const res = await submit(makeBundle())

      expect(res.status).toBe(500)
      expect(JSON.stringify(await res.json())).not.toContain('secret detail')
      expect(h.state.tables.ops_bundles).toHaveLength(0)
      expect(h.state.tables.ops_bundle_items).toHaveLength(0)
      expect(h.state.tables.ops_decisions).toHaveLength(0)
      expect(h.state.afterCallbacks).toHaveLength(0)

      h.state.failCategories = false
      expect((await submit(makeBundle())).status).toBe(201)
    })
  })

  describe('슬랙 도착 글', () => {
    it('응답을 돌려준 뒤(after)에 게시하고 결과를 결정 기록에 적는다', async () => {
      const res = await submit(makeBundle())
      expect(res.status).toBe(201)
      // 응답 시점에는 아직 게시하지 않았다.
      expect(h.postOpsSlack).not.toHaveBeenCalled()
      expect(h.state.tables.ops_decisions[0].slack_result).toBeNull()

      await flushAfter()

      expect(h.postOpsSlack).toHaveBeenCalledTimes(1)
      const [channel, text] = h.postOpsSlack.mock.calls[0]
      expect(channel).toBe('report')
      expect(text).toBe('[시험] 기획안이 도착했어요 · 에이전트: 윤진 · 주차: 2026-W41 · 항목 2개 · 형식 오류 0건')
      expect(h.state.tables.ops_decisions[0].slack_result).toEqual({ channel: 'report', ok: true })
    })

    it('시험 묶음이 아니면 「[시험]」이 없고 형식 오류 수가 들어간다', async () => {
      await submit(makeBundle({ is_sample: false, items: [makeItem({ kind: 'banner' })] }))
      await flushAfter()
      const text = h.postOpsSlack.mock.calls[0][1] as string
      expect(text.startsWith('기획안이 도착했어요')).toBe(true)
      expect(text).toContain('항목 1개')
      expect(text).toContain('형식 오류 1건')
    })

    it('제출 문자열의 슬랙 특수문자를 이스케이프한다', async () => {
      await submit(makeBundle({ author: '<!channel> & 에이전트' }))
      await flushAfter()
      const text = h.postOpsSlack.mock.calls[0][1] as string
      expect(text).toContain('에이전트: &lt;!channel&gt; &amp; 에이전트')
      expect(text).not.toContain('<')
    })

    it('슬랙 게시가 실패해도 제출은 201이고 결정 기록에 알림 결과가 남는다', async () => {
      h.postOpsSlack.mockResolvedValue({ ok: false, error: 'channel_not_found' })
      const res = await submit(makeBundle())
      await flushAfter()

      expect(res.status).toBe(201)
      expect(h.state.tables.ops_bundles).toHaveLength(1)
      expect(h.state.tables.ops_decisions[0].slack_result).toEqual({
        channel: 'report',
        ok: false,
        error: 'channel_not_found',
      })
      expect(consoleError).toHaveBeenCalled()
    })

    it('환경변수가 없어 게시하지 못해도 제출은 201이고 not_configured가 남는다', async () => {
      h.postOpsSlack.mockResolvedValue({ ok: false, error: 'not_configured' })
      const res = await submit(makeBundle())
      await flushAfter()

      expect(res.status).toBe(201)
      expect(h.state.tables.ops_decisions[0].slack_result).toEqual({
        channel: 'report',
        ok: false,
        error: 'not_configured',
      })
    })

    it('게시 함수가 예상 밖으로 던져도 after 안에서 삼키고 제출에는 영향이 없다', async () => {
      h.postOpsSlack.mockRejectedValue(new Error('unexpected'))
      const res = await submit(makeBundle())
      await expect(flushAfter()).resolves.toBeUndefined()

      expect(res.status).toBe(201)
      expect(h.state.tables.ops_bundles).toHaveLength(1)
    })
  })
})
