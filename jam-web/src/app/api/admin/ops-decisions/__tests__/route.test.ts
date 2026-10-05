/**
 * GET /api/admin/ops-decisions (티켓 20261004_1639, 상위 20260930_1503 ⑤)
 *
 * 인증은 실제 `@/lib/admin/auth`를 쓰고(세션만 모의한다), 읽기 함수(`lib/admin/opsDecisions/read.ts`)도 모의하지 않는다. 서비스 클라이언트만 메모리
 * 안의 가짜 테이블로 바꿔서, 라우트 → 읽기 함수 → 응답 본문까지 실제 코드로 지나가게 한다(관리자 ID·슬랙 결과가 본문에 없는지를 본문 문자열로 확인하려는 것이다).
 * 읽기 함수 자체의 변환·집계·커서는 `opsDecisions/__tests__/read.test.ts`가 지킨다. 여기서는 라우트가 맡은 것만 본다:
 * - 읽기 토큰만으로 읽힌다(관리자 세션도 된다). 토큰이 틀리거나 없고 세션도 없으면 403이고 결정 기록 테이블을 읽지 않는다
 * - 시험 묶음 조건이 쿼리에 걸리고, 요청으로 끌 수 없다(`includeSample` 같은 쿼리는 무시한다)
 * - 기간(기본 4주)·패턴 번호·행동·커서가 틀리면 400이고 읽지 않는다. 기간이 92일을 넘어도 400이다
 * - 응답 본문 어디에도 `actor` 칸·관리자 ID·`slack_result`·`raw`가 없다
 * - 한 쪽이 넘치면 `nextCursor`가 오고 그 값으로 이어 읽힌다
 * - 조회가 실패하면 고정 문장 500이고 원문은 싣지 않는다. GET만 export한다
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  type Result = { data: unknown; error: { message: string } | null }
  type Embed = { inner: boolean; columns: string[] }
  const db = {
    user: null as { id: string; email: string } | null,
    rows: [] as Row[],
    error: null as string | null,
    /** 결정 기록을 읽은 횟수(`select` 호출 수). 인증·형식 검사에서 거절되면 0이어야 한다. */
    reads: 0,
    filters: [] as string[],
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
    private orders: Array<{ column: string; ascending: boolean }> = []
    private window: [number, number] | null = null
    select(columns: string) {
      db.reads += 1
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
      db.filters.push(`eq ${column}=${String(value)}`)
      this.predicates.push((row) => valueAt(row, column) === value)
      return this
    }
    gte(column: string, value: string) {
      this.predicates.push((row) => Date.parse(String(row[column])) >= Date.parse(value))
      return this
    }
    lt(column: string, value: string) {
      this.predicates.push((row) => Date.parse(String(row[column])) < Date.parse(value))
      return this
    }
    or(filter: string) {
      const match = /^created_at\.lt\.([^,()]+),and\(created_at\.eq\.([^,()]+),id\.lt\.([^,()]+)\)$/.exec(filter)
      if (!match) throw new Error(`가짜가 모르는 or 필터: ${filter}`)
      const [, before, same, id] = match
      this.predicates.push((row) => {
        const at = Date.parse(String(row.created_at))
        return at < Date.parse(before) || (at === Date.parse(same) && String(row.id) < id)
      })
      return this
    }
    order(column: string, options?: { ascending?: boolean }) {
      this.orders.push({ column, ascending: options?.ascending ?? true })
      return this
    }
    range(from: number, to: number) {
      this.window = [from, to]
      return this
    }
    private run(): Result {
      if (db.error) return { data: null, error: { message: db.error } }
      let rows = db.rows.filter((row) => this.predicates.every((p) => p(row)))
      for (const [name, embed] of Object.entries(this.embeds)) {
        if (embed.inner) rows = rows.filter((row) => row[name] !== null && row[name] !== undefined)
      }
      rows = [...rows].sort((a, b) => {
        for (const { column, ascending } of this.orders) {
          const x = String(a[column])
          const y = String(b[column])
          if (x === y) continue
          return (x < y ? -1 : 1) * (ascending ? 1 : -1)
        }
        return 0
      })
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
  return { db, service: { from: () => new Query() } }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.db.user } }) } }),
  createServiceClient: () => h.service,
}))

import * as route from '../route'

const { GET } = route

const NOW = new Date('2026-10-04T03:00:00.000Z')
const TOKEN = 'test-admin-read-token-abcdef'
const ADMIN = { id: 'admin-1', email: 'admin@example.com' }
const ADMIN_ID_VALUE = 'secret-admin-user-id'
const SLACK_SECRET = 'slack-secret-channel'
const RAW_SECRET = 'raw-secret-body'
const ENV_KEYS = ['ADMIN_API_READ_TOKEN', 'ADMIN_EMAILS'] as const
const AUTH = { 'x-admin-read-token': TOKEN }

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
}

function decisionRow(n: number, extra: Record<string, unknown> = {}) {
  return {
    id: uuid(n),
    created_at: '2026-10-03T00:00:00.000Z',
    action: 'approve',
    actor: ADMIN_ID_VALUE,
    item_id: uuid(1000 + n),
    batch_id: null,
    diff: null,
    reason: null,
    slack_result: { channel: SLACK_SECRET, ok: true },
    raw: { secret: RAW_SECRET },
    ops_bundles: { bundle_id: 'bundle-1', week: '2026-W40', is_sample: false },
    ops_bundle_items: { item_key: `card-${n}`, kind: 'home_feed_card', pattern_no: 'P01', status: 'approved' },
    ...extra,
  }
}

function fillRows() {
  h.db.rows = [
    decisionRow(1, { created_at: '2026-10-01T00:00:00.000Z' }),
    decisionRow(2, { created_at: '2026-10-02T00:00:00.000Z', actor: 'token:윤진', action: 'submit' }),
    decisionRow(3, { created_at: '2026-10-03T00:00:00.000Z', actor: 'system:reconcile', action: 'end', ops_bundle_items: { item_key: 'k3', kind: 'mission', pattern_no: null, status: 'ended' } }),
    decisionRow(4, { ops_bundles: { bundle_id: 'bundle-sample', week: '2026-W40', is_sample: true } }),
  ]
}

function request(query = '', headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/admin/ops-decisions${query}`, { method: 'GET', headers })
}

const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key]
  process.env.ADMIN_API_READ_TOKEN = TOKEN
  process.env.ADMIN_EMAILS = ADMIN.email
  h.db.user = null
  h.db.rows = []
  h.db.error = null
  h.db.reads = 0
  h.db.filters = []
  fillRows()
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

/** 응답 본문을 문자열로 보고 `actor` 칸·관리자 ID·슬랙 결과·제출 원본이 없는지 확인한다(`actorType`은 이름이 달라 걸리지 않는다). */
function expectNoSecrets(body: unknown) {
  const text = JSON.stringify(body)
  for (const forbidden of ['"actor"', ADMIN_ID_VALUE, 'slack_result', 'slackResult', SLACK_SECRET, '"raw"', RAW_SECRET, 'reconcile']) {
    expect(text).not.toContain(forbidden)
  }
}

describe('GET /api/admin/ops-decisions', () => {
  it('읽기 토큰만으로 읽힌다(세션 없음). 기본은 최근 4주이고 최신순으로 싣는다', async () => {
    const res = await GET(request('', AUTH))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['byPattern', 'decisions', 'nextCursor', 'range'])
    expect(body.range).toEqual({ since: '2026-09-06T03:00:00.000Z', until: '2026-10-04T03:00:00.000Z' })
    expect(body.decisions.map((d: { id: string }) => d.id)).toEqual([uuid(3), uuid(2), uuid(1)])
    expect(body.nextCursor).toBeNull()
  })

  it('행위자는 종류와 에이전트 이름으로만 나간다', async () => {
    const body = await (await GET(request('', AUTH))).json()
    const byId = Object.fromEntries(body.decisions.map((d: { id: string; actorType: string; agentName: string | null }) => [d.id, d]))
    expect(byId[uuid(1)]).toMatchObject({ actorType: 'admin', agentName: null })
    expect(byId[uuid(2)]).toMatchObject({ actorType: 'agent', agentName: '윤진' })
    expect(byId[uuid(3)]).toMatchObject({ actorType: 'system', agentName: null })
  })

  it('결정 한 건은 정해진 칸만 싣는다', async () => {
    const body = await (await GET(request('', AUTH))).json()
    expect(Object.keys(body.decisions[0]).sort()).toEqual(
      ['action', 'actorType', 'agentName', 'batchId', 'bundleId', 'createdAt', 'diff', 'id', 'itemId', 'itemKey', 'itemStatus', 'kind', 'patternNo', 'reason', 'week'].sort()
    )
  })

  it('집계 byPattern을 함께 싣는다(패턴 없는 항목은 patternNo null이 맨 끝)', async () => {
    const body = await (await GET(request('', AUTH))).json()
    expect(body.byPattern).toEqual([
      { patternNo: 'P01', items: 2, actions: { approve: 1, submit: 1 } },
      { patternNo: null, items: 1, actions: { end: 1 } },
    ])
  })

  it('시험 묶음의 기록은 목록과 집계 어디에도 없고 조건이 쿼리에 걸린다', async () => {
    const body = await (await GET(request('', AUTH))).json()
    expect(h.db.filters.filter((f) => f === 'eq ops_bundles.is_sample=false')).toHaveLength(2)
    expect(body.decisions.map((d: { id: string }) => d.id)).not.toContain(uuid(4))
    expect(JSON.stringify(body)).not.toContain('bundle-sample')
    expect(body.byPattern.reduce((sum: number, line: { items: number }) => sum + line.items, 0)).toBe(3)
  })

  it('시험 묶음을 켜는 쿼리는 받지 않는다', async () => {
    for (const query of ['?includeSample=true', '?is_sample=true', '?sample=1', '?includeSample=true&isSample=true']) {
      h.db.filters = []
      const body = await (await GET(request(query, AUTH))).json()
      expect(h.db.filters.filter((f) => f === 'eq ops_bundles.is_sample=false')).toHaveLength(2)
      expect(body.decisions.map((d: { id: string }) => d.id)).not.toContain(uuid(4))
    }
  })

  it('기간·패턴·행동 조건이 목록에 걸린다', async () => {
    const body = await (await GET(request('?since=2026-10-02&until=2026-10-03&patternNo=P01&action=submit', AUTH))).json()
    expect(body.decisions.map((d: { id: string }) => d.id)).toEqual([uuid(2)])
    expect(body.range).toEqual({ since: '2026-10-01T15:00:00.000Z', until: '2026-10-03T15:00:00.000Z' })
  })

  it('응답 본문 어디에도 actor·관리자 ID·slack_result·raw가 없다', async () => {
    expectNoSecrets(await (await GET(request('', AUTH))).json())
  })

  it('관리자 세션으로도 읽힌다', async () => {
    h.db.user = ADMIN
    expect((await GET(request())).status).toBe(200)
  })

  it('토큰이 틀리거나 없고 세션도 없으면 403이고 결정 기록을 읽지 않는다', async () => {
    expect((await GET(request('', { 'x-admin-read-token': 'wrong' }))).status).toBe(403)
    expect((await GET(request())).status).toBe(403)
    expect(h.db.reads).toBe(0)
  })

  it('환경변수에 토큰이 없으면 토큰으로 읽을 수 없다', async () => {
    delete process.env.ADMIN_API_READ_TOKEN
    expect((await GET(request('', AUTH))).status).toBe(403)
    expect(h.db.reads).toBe(0)
  })

  it('기록이 없으면 빈 목록 200이다(오류 아님)', async () => {
    h.db.rows = []
    const res = await GET(request('', AUTH))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ decisions: [], nextCursor: null, byPattern: [] })
  })

  it('기간·패턴 번호·행동·커서가 틀리면 400이고 읽지 않는다', async () => {
    const bads = [
      '?since=abc',
      '?until=2026-02-31',
      '?since=2026-10-03&until=2026-10-01',
      '?patternNo=P1',
      '?patternNo=p01',
      '?action=delete',
      '?cursor=garbage',
      `?cursor=2026-10-03T00:00:00Z|not-a-uuid`,
    ]
    for (const query of bads) {
      const res = await GET(request(query, AUTH))
      expect(res.status, query).toBe(400)
      expect(typeof (await res.json()).error).toBe('string')
    }
    expect(h.db.reads).toBe(0)
  })

  it('기간이 92일을 넘으면 400이고 92일까지는 200이다', async () => {
    const over = await GET(request('?since=2026-07-03T23:59:59Z&until=2026-10-04T00:00:00Z', AUTH))
    expect(over.status).toBe(400)
    expect(h.db.reads).toBe(0)
    const ok = await GET(request('?since=2026-07-04T00:00:00Z&until=2026-10-04T00:00:00Z', AUTH))
    expect(ok.status).toBe(200)
  })

  it('한 쪽이 넘치면 nextCursor가 오고 그 값으로 이어 읽으면 빠짐없이 한 번씩 읽힌다', async () => {
    h.db.rows = Array.from({ length: 205 }, (_, i) => decisionRow(i + 1, { created_at: new Date(Date.parse('2026-10-01T00:00:00.000Z') + Math.floor(i / 7) * 60_000).toISOString() }))
    const first = await (await GET(request('', AUTH))).json()
    expect(first.decisions).toHaveLength(200)
    expect(typeof first.nextCursor).toBe('string')
    const second = await (await GET(request(`?cursor=${encodeURIComponent(first.nextCursor)}`, AUTH))).json()
    expect(second.decisions).toHaveLength(5)
    expect(second.nextCursor).toBeNull()
    const ids = [...first.decisions, ...second.decisions].map((d: { id: string }) => d.id)
    expect(new Set(ids).size).toBe(205)
    expect(second.byPattern).toEqual(first.byPattern)
    expect(first.byPattern).toEqual([{ patternNo: 'P01', items: 205, actions: { approve: 205 } }])
  })

  it('주소에 +를 그대로 써서 공백으로 읽혀도 커서가 통한다', async () => {
    h.db.rows = [decisionRow(1, { created_at: '2026-10-02T00:00:00.000Z' }), decisionRow(2, { created_at: '2026-10-01T00:00:00.000Z' })]
    const cursor = `2026-10-02T00:00:00+00:00|${uuid(1)}`
    const res = await GET(request(`?cursor=${cursor}`, AUTH))
    expect(res.status).toBe(200)
    expect((await res.json()).decisions.map((d: { id: string }) => d.id)).toEqual([uuid(2)])
  })

  it('조회가 실패하면 고정 문장 500이고 원문은 싣지 않는다', async () => {
    h.db.error = 'relation ops_decisions secret'
    const res = await GET(request('', AUTH))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('결정 기록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.')
    expect(JSON.stringify(body)).not.toContain('secret')
  })
})

describe('쓰기 메서드를 두지 않는다', () => {
  it('GET만 export한다', () => {
    expect(Object.keys(route)).toEqual(['GET'])
  })
})
