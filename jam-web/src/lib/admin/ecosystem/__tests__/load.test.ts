/**
 * loadEcosystemSnapshot — 마디 10개의 읽기와 계산 (티켓 20261026_2027 2회차)
 *
 * 밸런스 읽기(`loadBalanceDashboard`)는 따로 시험돼 있으므로 가짜로 바꾸고, 이 회차의 새 읽기(서비스 클라이언트)만 메모리 안의 가짜 테이블로 바꾼다.
 * 지키는 것:
 * 1. 읽기가 모두 성공하면 마디 10개를 순서대로 돌려주고 값이 맞다
 * 2. 읽기 하나가 실패하면 그 읽기를 쓰는 마디만 error이고 나머지는 계산된다. 던지지 않는다. 오류 원문은 싣지 않는다
 * 3. 기간 경계: 활동·실패·잼은 `gte` 시작 경계 한 번, 드랍은 놓은 시각·주운 시각 둘 중 하나가 시작 이후인 행, 지점은 개수만(head) 읽는다
 * 4. 밸런스 읽기가 던져도 마디 10개는 항상 나온다
 * 5. 목표 대비 주의 이상 개수와 읽지 못함 개수
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { METRIC_SPECS } from '@/lib/admin/balanceDashboard/targets'
import { BALANCE_METRIC_KEYS, type BalanceDashboardData, type MetricResult } from '@/lib/admin/balanceDashboard/types'
import { TEST_ACCOUNT_USER_IDS } from '@/lib/env/test-accounts'
import type { PolicyItem } from '@/lib/admin/policyDashboard/types'
import { loadBalanceDashboard } from '@/lib/admin/balanceDashboard/load'
import { ECOSYSTEM_NODES } from '../nodes'
import { ECOSYSTEM_LOAD_FAILED_MESSAGE, loadEcosystemSnapshot } from '../load'

vi.mock('@/lib/admin/balanceDashboard/load', () => ({ loadBalanceDashboard: vi.fn() }))

const NOW = new Date('2026-10-28T03:00:00.000Z')
const DAY = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString()
const START = NOW.getTime() - 7 * DAY

type Row = Record<string, unknown>
type Result = { data: Row[] | null; count: number | null; error: { message: string } | null }

interface FakeDb {
  tables: Record<string, Row[]>
  failTables: Set<string>
  gtes: Array<{ table: string; column: string; value: string }>
  ors: Array<{ table: string; expr: string }>
  heads: Array<{ table: string }>
  unordered: number
}

function parseOr(expr: string): (row: Row) => boolean {
  const conditions = expr.split(',').map((part) => {
    const [column, op, ...rest] = part.split('.')
    const value = rest.join('.')
    return (row: Row): boolean => {
      const cell = row[column]
      if (cell === null || cell === undefined) return false
      return op === 'gte' ? new Date(cell as string).getTime() >= new Date(value).getTime() : false
    }
  })
  return (row) => conditions.some((test) => test(row))
}

class Query implements PromiseLike<Result> {
  private filters: Array<(row: Row) => boolean> = []
  private columns: string[] = []
  private orderBy: string[] = []
  private window: { from: number; to: number } | null = null
  private head = false
  constructor(
    private db: FakeDb,
    private table: string
  ) {}
  select(columns: string, options?: { count?: string; head?: boolean }) {
    this.columns = columns.split(',').map((c) => c.trim())
    if (options?.head) {
      this.head = true
      this.db.heads.push({ table: this.table })
    }
    return this
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value)
    return this
  }
  not(column: string, op: string, value: unknown) {
    if (op === 'is' && value === null) this.filters.push((row) => row[column] !== null && row[column] !== undefined)
    return this
  }
  gte(column: string, value: string) {
    this.db.gtes.push({ table: this.table, column, value })
    this.filters.push((row) => new Date(row[column] as string).getTime() >= new Date(value).getTime())
    return this
  }
  or(expr: string) {
    this.db.ors.push({ table: this.table, expr })
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
    if (this.db.failTables.has(this.table)) {
      return { data: null, count: null, error: { message: `secret-db-detail ${this.table} 읽기 실패` } }
    }
    let rows = (this.db.tables[this.table] ?? []).filter((row) => this.filters.every((test) => test(row)))
    if (this.head) return { data: null, count: rows.length, error: null }
    if (this.orderBy.length === 0) this.db.unordered += 1
    rows = [...rows].sort((a, b) => {
      for (const column of this.orderBy) {
        const x = String(a[column])
        const y = String(b[column])
        if (x !== y) return x < y ? -1 : 1
      }
      return 0
    })
    if (this.window) rows = rows.slice(this.window.from, this.window.to + 1)
    return { data: rows.map((row) => Object.fromEntries(this.columns.map((c) => [c, row[c]]))), count: null, error: null }
  }
  then<R1 = Result, R2 = never>(
    onfulfilled?: ((value: Result) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected)
  }
}

function makeDb(tables: Record<string, Row[]>): FakeDb {
  return { tables, failTables: new Set(), gtes: [], ors: [], heads: [], unordered: 0 }
}

function load(db: FakeDb, policies: readonly PolicyItem[] = []) {
  const service = { from: (table: string) => new Query(db, table) }
  return loadEcosystemSnapshot(service as unknown as Parameters<typeof loadEcosystemSnapshot>[0], NOW, policies)
}

/** 모든 칸이 «부족»인 밸런스 데이터에 지표 몇 개를 바꿔 끼운다 */
function balanceWith(overrides: Partial<Record<(typeof BALANCE_METRIC_KEYS)[number], MetricResult>> = {}): BalanceDashboardData {
  return {
    generatedAt: NOW.toISOString(),
    metrics: BALANCE_METRIC_KEYS.map((key): MetricResult => {
      const given = overrides[key]
      if (given) return given
      return {
        key,
        status: 'ok',
        parts: METRIC_SPECS[key].parts.map((spec) => ({
          id: spec.id,
          measurement: {
            status: 'insufficient' as const,
            reason: 'sample' as const,
            sample: 0,
            minSample: spec.minSample,
            sampleUnit: spec.sampleUnit,
          },
        })),
      }
    }),
  }
}

const FULL_TABLES = (): Record<string, Row[]> => ({
  users: [
    { id: 'u1', is_admin: false },
    { id: 'u2', is_admin: false },
    { id: TEST_ACCOUNT_USER_IDS[0], is_admin: false },
  ],
  strava_activities: [
    { id: 'a1', user_id: 'u1', created_at: iso(START + DAY), processed_via: 'webhook' },
    { id: 'a2', user_id: 'u2', created_at: iso(START + DAY), processed_via: 'manual_backfill' },
    { id: 'a3', user_id: TEST_ACCOUNT_USER_IDS[0], created_at: iso(START + DAY), processed_via: 'webhook' },
    { id: 'a4', user_id: 'u1', created_at: iso(START - DAY), processed_via: 'webhook' },
  ],
  strava_sync_failures: [
    { id: 'f1', occurred_at: iso(START + DAY), failure_type: 'api_error' },
    { id: 'f2', occurred_at: iso(START + DAY), failure_type: 'drop_attempt_failed' },
  ],
  jam_transactions: [
    { id: 'j1', amount: 100, admin_user_id: null, created_at: iso(START + DAY) },
    { id: 'j2', amount: -40, admin_user_id: null, created_at: iso(START + DAY) },
    { id: 'j3', amount: 500, admin_user_id: 'admin-1', created_at: iso(START + DAY) },
  ],
  poi_drops: [
    { id: 'd1', source: 'system', dropper_user_id: null, picked_up_by: 'u1', dropped_at: iso(START + DAY), picked_up_at: iso(START + 2 * DAY) },
    { id: 'd2', source: 'user', dropper_user_id: 'u2', picked_up_by: null, dropped_at: iso(START + DAY), picked_up_at: null },
    { id: 'd3', source: 'user', dropper_user_id: 'u2', picked_up_by: 'u1', dropped_at: iso(START - 3 * DAY), picked_up_at: iso(START + DAY) },
    // 기간 시작 이전에 놓고 줍지도 않은 행은 읽지 않는다
    { id: 'd4', source: 'system', dropper_user_id: null, picked_up_by: null, dropped_at: iso(START - DAY), picked_up_at: null },
  ],
  poi: [
    { id: 'p1', is_active: true, pending_review: false, linked_badge_id: 'b1' },
    { id: 'p2', is_active: true, pending_review: false, linked_badge_id: null },
    { id: 'p3', is_active: false, pending_review: false, linked_badge_id: 'b2' },
    { id: 'p4', is_active: true, pending_review: true, linked_badge_id: 'b3' },
  ],
})

beforeEach(() => {
  vi.mocked(loadBalanceDashboard).mockResolvedValue(balanceWith())
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

const byId = (nodes: Awaited<ReturnType<typeof load>>['nodes']) => Object.fromEntries(nodes.map((node) => [node.id, node]))

describe('loadEcosystemSnapshot — 읽기가 모두 성공할 때', () => {
  it('마디 10개를 정의 순서대로 돌려주고 필드 마디 값이 맞다', async () => {
    const snapshot = await load(makeDb(FULL_TABLES()))
    expect(snapshot.generatedAt).toBe(NOW.toISOString())
    expect(snapshot.nodes.map((node) => node.id)).toEqual(ECOSYSTEM_NODES.map((node) => node.id))

    const nodes = byId(snapshot.nodes)
    // 활동: u1의 1건만 (backfill, 테스트 계정, 기간 밖 제외). 실패는 드랍 시도 실패를 뺀 1건
    expect(nodes.sync.headline).toMatchObject({ value: 1, unit: 'count' })
    expect(nodes.sync.sub).toMatchObject({ value: 1, unit: 'count' })
    expect(nodes.jam.headline).toMatchObject({ value: 100, unit: 'jam' })
    expect(nodes.jam.sub).toMatchObject({ value: 40, unit: 'jam' })
    // 시스템 드랍 1건(d1), 유저 드랍 1건(d2, 기간 안), 픽업 2건(d1, d3)
    expect(nodes.system_drop.headline.value).toBe(1)
    expect(nodes.user_drop.headline.value).toBe(1)
    expect(nodes.pickup.headline.value).toBe(2)
    // 켜진 지점 2곳(p1, p2), 그 중 배지 연결 1곳
    expect(nodes.checkin_point.headline.value).toBe(2)
    expect(nodes.checkin_point.sub?.value).toBe(1)
    for (const id of ['sync', 'jam', 'system_drop', 'user_drop', 'checkin_point', 'pickup'] as const) {
      expect(nodes[id].statusKind).toBe('no_target')
      expect(nodes[id].message).toBeUndefined()
    }
  })

  it('밸런스 마디는 밸런스 읽기를 그대로 쓰고 가장 나쁜 칸이 대표다', async () => {
    vi.mocked(loadBalanceDashboard).mockResolvedValue(
      balanceWith({
        inventory_full: {
          key: 'inventory_full',
          status: 'ok',
          parts: [{ id: 'full', measurement: { status: 'ready', value: 0.5, sample: 30, sampleUnit: 'user' } }],
        },
      })
    )
    const snapshot = await load(makeDb(FULL_TABLES()))
    const inventory = byId(snapshot.nodes).inventory
    expect(inventory.statusKind).toBe('stop')
    expect(inventory.headline).toMatchObject({ value: 0.5, unit: 'ratio' })
    expect(inventory.sample).toEqual({ value: 30, unit: 'user' })
    expect(byId(snapshot.nodes).capsule.statusKind).toBe('insufficient')
    expect(byId(snapshot.nodes).capsule.headline.value).toBeNull()
    expect(snapshot.attentionCount).toBe(1)
    expect(snapshot.errorCount).toBe(0)
    expect(snapshot.goalRows).toHaveLength(5)
  })

  it('마디에 걸린 정책 ID를 담는다', async () => {
    const policies: PolicyItem[] = [
      { id: 'p-inv', chapter: 8, chapterTitle: '', title: '', type: 'admin_link', currentSpec: '', userExperience: '', basisDoc: '', nodes: ['inventory', 'pickup'] },
      { id: 'p-none', chapter: 1, chapterTitle: '', title: '', type: 'code_constant', currentSpec: '', userExperience: '', basisDoc: '' },
    ]
    const nodes = byId((await load(makeDb(FULL_TABLES()), policies)).nodes)
    expect(nodes.inventory.policyIds).toEqual(['p-inv'])
    expect(nodes.pickup.policyIds).toEqual(['p-inv'])
    expect(nodes.jam.policyIds).toEqual([])
  })
})

describe('loadEcosystemSnapshot — 읽기 실패', () => {
  it('poi_drops를 못 읽으면 드랍·픽업 세 마디만 읽지 못함이고 나머지는 계산된다', async () => {
    const db = makeDb(FULL_TABLES())
    db.failTables.add('poi_drops')
    const snapshot = await load(db)
    const nodes = byId(snapshot.nodes)

    expect(snapshot.nodes).toHaveLength(10)
    for (const id of ['system_drop', 'user_drop', 'pickup'] as const) {
      expect(nodes[id].statusKind).toBe('error')
      expect(nodes[id].headline.value).toBeNull()
      expect(nodes[id].message).toBe(ECOSYSTEM_LOAD_FAILED_MESSAGE)
    }
    expect(nodes.sync.headline.value).toBe(1)
    expect(nodes.jam.headline.value).toBe(100)
    expect(nodes.checkin_point.headline.value).toBe(2)
    expect(snapshot.errorCount).toBe(3)
    // DB 오류 원문은 어디에도 싣지 않는다
    expect(JSON.stringify(snapshot)).not.toContain('secret-db-detail')
  })

  it('동기화 실패 표를 못 읽으면 활동 동기화 마디만 읽지 못함이다', async () => {
    const db = makeDb(FULL_TABLES())
    db.failTables.add('strava_sync_failures')
    const nodes = byId((await load(db)).nodes)
    expect(nodes.sync.statusKind).toBe('error')
    expect(nodes.jam.statusKind).toBe('no_target')
  })

  it('유저 표를 못 읽으면 유저 조건이 필요한 마디만 읽지 못함이고 시스템 드랍·잼·지점은 계산된다', async () => {
    const db = makeDb(FULL_TABLES())
    db.failTables.add('users')
    const nodes = byId((await load(db)).nodes)
    for (const id of ['sync', 'user_drop', 'pickup'] as const) expect(nodes[id].statusKind).toBe('error')
    expect(nodes.system_drop.headline.value).toBe(1)
    expect(nodes.jam.headline.value).toBe(100)
    expect(nodes.checkin_point.headline.value).toBe(2)
  })

  it('poi 개수를 못 읽으면 지점 마디만 읽지 못함이다', async () => {
    const db = makeDb(FULL_TABLES())
    db.failTables.add('poi')
    const nodes = byId((await load(db)).nodes)
    expect(nodes.checkin_point.statusKind).toBe('error')
    expect(nodes.system_drop.statusKind).toBe('no_target')
  })

  it('모든 읽기가 실패해도 던지지 않고 마디 10개를 돌려준다', async () => {
    vi.mocked(loadBalanceDashboard).mockRejectedValue(new Error('balance down'))
    const db = makeDb(FULL_TABLES())
    for (const table of Object.keys(db.tables)) db.failTables.add(table)
    const snapshot = await load(db)

    expect(snapshot.nodes).toHaveLength(10)
    expect(snapshot.nodes.every((node) => node.statusKind === 'error')).toBe(true)
    expect(snapshot.goalRows.every((row) => row.status === 'error')).toBe(true)
    expect(snapshot.attentionCount).toBe(0)
    // 목표 대비 5행 + 밸런스 지표를 쓰지 않는 마디 6개 (같은 실패를 두 번 세지 않는다)
    expect(snapshot.errorCount).toBe(11)
  })

  it('밸런스 지표 하나를 못 읽으면 그 지표의 마디만 읽지 못함이다', async () => {
    vi.mocked(loadBalanceDashboard).mockResolvedValue(
      balanceWith({ inventory_full: { key: 'inventory_full', status: 'error', message: '고정 문장' } })
    )
    const snapshot = await load(makeDb(FULL_TABLES()))
    const nodes = byId(snapshot.nodes)
    expect(nodes.inventory.statusKind).toBe('error')
    expect(nodes.capsule.statusKind).toBe('insufficient')
    // 부족한 마디는 사유를 싣고 값을 낸 표본은 싣지 않는다 (티켓 20261026_2027 3-1)
    expect(nodes.capsule.shortfall).toMatchObject({ reason: 'sample', sample: 0 })
    expect(nodes.capsule.sample).toBeUndefined()
    expect(snapshot.errorCount).toBe(1)
  })
})

describe('loadEcosystemSnapshot — 기간 경계 쿼리', () => {
  it('활동·실패·잼은 7×24시간 전 시각 이후만 읽는다', async () => {
    const db = makeDb(FULL_TABLES())
    await load(db)
    const since = iso(START)
    expect(db.gtes).toEqual(
      expect.arrayContaining([
        { table: 'strava_activities', column: 'created_at', value: since },
        { table: 'strava_sync_failures', column: 'occurred_at', value: since },
        { table: 'jam_transactions', column: 'created_at', value: since },
      ])
    )
  })

  it('드랍은 놓은 시각 또는 주운 시각이 시작 이후인 행만 읽는다', async () => {
    const db = makeDb(FULL_TABLES())
    await load(db)
    expect(db.ors).toEqual([
      { table: 'poi_drops', expr: `dropped_at.gte.${iso(START)},picked_up_at.gte.${iso(START)}` },
    ])
  })

  it('지점은 행을 읽지 않고 개수만 센다 (head 두 번), 나머지 읽기는 모두 정렬이 붙는다', async () => {
    const db = makeDb(FULL_TABLES())
    await load(db)
    expect(db.heads).toEqual([{ table: 'poi' }, { table: 'poi' }])
    expect(db.unordered).toBe(0)
  })
})
