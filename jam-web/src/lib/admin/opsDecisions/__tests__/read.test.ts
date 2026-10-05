/**
 * 운영툴 결정 기록 읽기 (티켓 20261004_1639, 상위 20260930_1503 ⑤)
 *
 * 서비스 클라이언트는 메모리 안의 가짜 테이블로 바꾼다(실 DB에 접속하지 않는다). 가짜는 `select`에 적은 칸과 임베드(`ops_bundles!inner(...)`)만
 * 돌려주고 `eq`·`gte`·`lt`·`or`·`order`·`range`를 적용하므로, 읽는 칸 목록과 거는 조건이 실제로 응답을 바꾸는지 본다.
 * 한계: 임베드 inner join이 PostgREST에서 실제로 행을 거르는지는 가짜로 검증할 수 없다(가짜가 같은 규칙을 흉내 낸 것이다). staging 실측이 필요하다.
 *
 * 지키는 것:
 * - 변환: 응답에 `actor`·`slack_result`·`raw`가 없고, `token:윤진` → agent/윤진, `system:reconcile` → system, 그 밖(관리자 ID) → admin
 * - 쿼리: 기간 기본 4주, 날짜만 주면 한국 시간, `since>until`·92일 초과·틀린 번호·모르는 행동·깨진 커서는 오류 문장
 * - 집계: 묶음 단위 행(항목 없음)은 세지 않고, 패턴 없는 항목은 `null` 칸이며, 쪽이 아니라 기간 전체를 센다
 * - 목록: 시험 묶음은 목록과 집계에서 빠지고(`includeSample`만 켠다), 최신순·커서 이어 읽기에서 같은 시각의 행이 겹치거나 빠지지 않는다
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  OPS_DECISION_ACTIONS,
  OPS_DECISION_ACTION_INVALID_MESSAGE,
  OPS_DECISION_AGGREGATE_COLUMNS,
  OPS_DECISION_CURSOR_INVALID_MESSAGE,
  OPS_DECISION_PAGE_SIZE,
  OPS_DECISION_PERIOD_INVALID_MESSAGE,
  OPS_DECISION_PERIOD_ORDER_MESSAGE,
  OPS_DECISION_PERIOD_TOO_LONG_MESSAGE,
  OPS_DECISION_READ_COLUMNS,
  aggregateByPattern,
  classifyActor,
  listOpsDecisions,
  parseDecisionQuery,
  toDecisionRecord,
  type OpsDecisionAggregateRow,
  type OpsDecisionQuery,
  type OpsDecisionRow,
} from '../read'
import { OPS_PATTERN_NO_INVALID_MESSAGE } from '../../opsPatterns/read'

type Row = Record<string, unknown>
type Result = { data: unknown; error: { message: string } | null }

const NOW = new Date('2026-10-04T03:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000
const ADMIN_ID_VALUE = 'secret-admin-user-id'
const SLACK_SECRET = 'slack-secret-channel'

const db = {
  rows: [] as Row[],
  error: null as string | null,
  selects: [] as string[],
  filters: [] as string[],
  ranges: [] as Array<[number, number]>,
}

/** `ops_bundles!inner(a, b)` 같은 임베드를 떼어 내고 남은 칸 목록과 임베드별 칸 목록을 돌려준다. */
function parseSelect(columns: string): { top: string[]; embeds: Record<string, { inner: boolean; columns: string[] }> } {
  const embeds: Record<string, { inner: boolean; columns: string[] }> = {}
  const rest = columns.replace(/(\w+)(!inner)?\(([^)]*)\)/g, (_all, name: string, inner: string | undefined, list: string) => {
    embeds[name] = { inner: inner !== undefined, columns: list.split(',').map((c) => c.trim()) }
    return ''
  })
  return { top: rest.split(',').map((c) => c.trim()).filter(Boolean), embeds }
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
  private embeds: Record<string, { inner: boolean; columns: string[] }> = {}
  private orders: Array<{ column: string; ascending: boolean }> = []
  private window: [number, number] | null = null
  select(columns: string) {
    db.selects.push(columns)
    const parsed = parseSelect(columns)
    this.top = parsed.top
    this.embeds = parsed.embeds
    return this
  }
  eq(column: string, value: unknown) {
    db.filters.push(`eq ${column}=${String(value)}`)
    this.predicates.push((row) => valueAt(row, column) === value)
    return this
  }
  gte(column: string, value: string) {
    db.filters.push(`gte ${column}`)
    this.predicates.push((row) => Date.parse(String(row[column])) >= Date.parse(value))
    return this
  }
  lt(column: string, value: string) {
    db.filters.push(`lt ${column}`)
    this.predicates.push((row) => Date.parse(String(row[column])) < Date.parse(value))
    return this
  }
  or(filter: string) {
    db.filters.push(`or ${filter}`)
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
    db.ranges.push([from, to])
    this.window = [from, to]
    return this
  }
  private run(): Result {
    if (db.error) return { data: null, error: { message: db.error } }
    let rows = db.rows.filter((row) => this.predicates.every((p) => p(row)))
    // inner join: 임베드가 없는 행(묶음 단위 결정의 항목 등)은 빠진다
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

const service = {
  from: (table: string) => {
    if (table !== 'ops_decisions') throw new Error(`읽으면 안 되는 테이블: ${table}`)
    return new Query()
  },
} as unknown as Parameters<typeof listOpsDecisions>[0]

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
}

function decisionRow(n: number, extra: Row = {}): Row {
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
    raw: { secret: 'raw-body' },
    ops_bundles: { bundle_id: 'bundle-1', week: '2026-W40', is_sample: false },
    ops_bundle_items: { item_key: `card-${n}`, kind: 'home_feed_card', pattern_no: 'P01', status: 'approved' },
    ...extra,
  }
}

function query(extra: Partial<OpsDecisionQuery> = {}): OpsDecisionQuery {
  return {
    since: new Date('2026-09-06T03:00:00.000Z'),
    until: NOW,
    patternNo: null,
    action: null,
    cursor: null,
    ...extra,
  }
}

function params(init: Record<string, string>): URLSearchParams {
  return new URLSearchParams(init)
}

function failure(init: Record<string, string>): string | null {
  const parsed = parseDecisionQuery(params(init), NOW)
  return parsed.ok ? null : parsed.error
}

beforeEach(() => {
  db.rows = []
  db.error = null
  db.selects = []
  db.filters = []
  db.ranges = []
})

describe('classifyActor', () => {
  it('토큰 제출은 에이전트와 이름, 시스템은 이름 없이, 그 밖(관리자 ID)은 admin이다', () => {
    expect(classifyActor('token:윤진')).toEqual({ actorType: 'agent', agentName: '윤진' })
    expect(classifyActor('token:')).toEqual({ actorType: 'agent', agentName: null })
    expect(classifyActor('system:reconcile')).toEqual({ actorType: 'system', agentName: null })
    expect(classifyActor('3f1b2c9e-0d6a-4b7e-9a51-2c8d7e6f5a40')).toEqual({ actorType: 'admin', agentName: null })
  })
})

describe('toDecisionRecord', () => {
  it('응답 칸만 싣는다 — actor 원문·slack_result·raw가 섞여 들어와도 나가지 않는다', () => {
    const record = toDecisionRecord(decisionRow(1, { diff: { title: ['a', 'b'] }, reason: '사유' }) as unknown as OpsDecisionRow)
    expect(Object.keys(record).sort()).toEqual(
      [
        'action',
        'actorType',
        'agentName',
        'batchId',
        'bundleId',
        'createdAt',
        'diff',
        'id',
        'itemId',
        'itemKey',
        'itemStatus',
        'kind',
        'patternNo',
        'reason',
        'week',
      ].sort()
    )
    expect(record).toMatchObject({
      id: uuid(1),
      actorType: 'admin',
      agentName: null,
      bundleId: 'bundle-1',
      week: '2026-W40',
      itemId: uuid(1001),
      itemKey: 'card-1',
      kind: 'home_feed_card',
      patternNo: 'P01',
      itemStatus: 'approved',
      diff: { title: ['a', 'b'] },
      reason: '사유',
    })
    const text = JSON.stringify(record)
    for (const forbidden of [ADMIN_ID_VALUE, SLACK_SECRET, 'raw-body', '"actor"', 'slack']) expect(text).not.toContain(forbidden)
  })

  it('에이전트 제출은 이름을, 시스템은 종류만 싣는다', () => {
    expect(toDecisionRecord(decisionRow(1, { actor: 'token:윤진' }) as unknown as OpsDecisionRow)).toMatchObject({ actorType: 'agent', agentName: '윤진' })
    const system = toDecisionRecord(decisionRow(2, { actor: 'system:reconcile' }) as unknown as OpsDecisionRow)
    expect(system).toMatchObject({ actorType: 'system', agentName: null })
    expect(JSON.stringify(system)).not.toContain('reconcile')
  })

  it('임베드가 배열로 와도 읽고, 없으면 칸을 null로 둔다', () => {
    const arrayEmbeds = decisionRow(1, {
      ops_bundles: [{ bundle_id: 'bundle-9', week: null }],
      ops_bundle_items: [{ item_key: 'k', kind: null, pattern_no: null, status: 'live' }],
    })
    expect(toDecisionRecord(arrayEmbeds as unknown as OpsDecisionRow)).toMatchObject({
      bundleId: 'bundle-9',
      week: null,
      itemKey: 'k',
      patternNo: null,
      itemStatus: 'live',
    })
    const bare = toDecisionRecord(decisionRow(2, { ops_bundles: null, ops_bundle_items: null }) as unknown as OpsDecisionRow)
    expect(bare).toMatchObject({ bundleId: null, week: null, itemKey: null, kind: null, patternNo: null, itemStatus: null })
  })
})

describe('parseDecisionQuery', () => {
  it('아무것도 안 주면 지금까지 최근 4주이고 나머지 조건은 없다', () => {
    const parsed = parseDecisionQuery(params({}), NOW)
    expect(parsed).toEqual({
      ok: true,
      query: { since: new Date(NOW.getTime() - 28 * DAY_MS), until: NOW, patternNo: null, action: null, cursor: null },
    })
    expect(parseDecisionQuery(params({ since: '', until: '', patternNo: '', action: '', cursor: '' }), NOW)).toEqual(parsed)
  })

  it('날짜만 주면 한국 시간이다 — since는 그날 0시, until은 그날이 끝나는 시각', () => {
    const parsed = parseDecisionQuery(params({ since: '2026-09-01', until: '2026-09-30' }), NOW)
    expect(parsed).toMatchObject({ ok: true })
    if (!parsed.ok) return
    expect(parsed.query.since.toISOString()).toBe('2026-08-31T15:00:00.000Z')
    expect(parsed.query.until.toISOString()).toBe('2026-09-30T15:00:00.000Z')
  })

  it('시각을 주면 오프셋을 따르고, until만 주면 그 앞 4주이고, since만 주면 until은 지금이다', () => {
    const withTimes = parseDecisionQuery(params({ since: '2026-09-01T09:00:00+09:00', until: '2026-09-02T00:00:00Z' }), NOW)
    expect(withTimes).toMatchObject({ ok: true })
    if (withTimes.ok) {
      expect(withTimes.query.since.toISOString()).toBe('2026-09-01T00:00:00.000Z')
      expect(withTimes.query.until.toISOString()).toBe('2026-09-02T00:00:00.000Z')
    }
    const untilOnly = parseDecisionQuery(params({ until: '2026-09-29T00:00:00Z' }), NOW)
    expect(untilOnly).toMatchObject({ ok: true })
    if (untilOnly.ok) expect(untilOnly.query.since.toISOString()).toBe('2026-09-01T00:00:00.000Z')
    const sinceOnly = parseDecisionQuery(params({ since: '2026-09-20' }), NOW)
    expect(sinceOnly).toMatchObject({ ok: true })
    if (sinceOnly.ok) expect(sinceOnly.query.until).toEqual(NOW)
  })

  it('모양이 틀린 시각·없는 날짜·오프셋 없는 시각은 오류다', () => {
    for (const bad of ['abc', '2026-02-31', '2026-09-01T00:00:00', '2026/09/01', '1700000000']) {
      expect(failure({ since: bad })).toBe(OPS_DECISION_PERIOD_INVALID_MESSAGE)
      expect(failure({ until: bad })).toBe(OPS_DECISION_PERIOD_INVALID_MESSAGE)
    }
  })

  it('since가 until보다 늦으면 오류다. 같으면 빈 기간으로 통과한다', () => {
    expect(failure({ since: '2026-09-02T00:00:00Z', until: '2026-09-01T00:00:00Z' })).toBe(OPS_DECISION_PERIOD_ORDER_MESSAGE)
    expect(failure({ since: '2099-01-01' })).toBe(OPS_DECISION_PERIOD_ORDER_MESSAGE)
    expect(failure({ since: '2026-09-01T00:00:00Z', until: '2026-09-01T00:00:00Z' })).toBeNull()
  })

  it('기간은 92일까지다 — 정확히 92일은 통과하고 1초라도 넘으면 오류다', () => {
    expect(failure({ since: '2026-07-04T00:00:00Z', until: '2026-10-04T00:00:00Z' })).toBeNull()
    expect(failure({ since: '2026-07-03T23:59:59Z', until: '2026-10-04T00:00:00Z' })).toBe(OPS_DECISION_PERIOD_TOO_LONG_MESSAGE)
    expect(failure({ since: '2026-01-01', until: '2026-10-01' })).toBe(OPS_DECISION_PERIOD_TOO_LONG_MESSAGE)
  })

  it('패턴 번호는 P 뒤에 숫자 두 자리 이상이어야 한다', () => {
    for (const bad of ['P1', 'p01', 'T01', 'P01x', 'P0A', '01']) expect(failure({ patternNo: bad })).toBe(OPS_PATTERN_NO_INVALID_MESSAGE)
    for (const good of ['P01', 'P10', 'P100']) {
      const parsed = parseDecisionQuery(params({ patternNo: good }), NOW)
      expect(parsed).toMatchObject({ ok: true, query: { patternNo: good } })
    }
  })

  it('행동은 알려진 값만 받는다', () => {
    for (const bad of ['delete', 'Approve', 'approve ', 'slack_result']) expect(failure({ action: bad })).toBe(OPS_DECISION_ACTION_INVALID_MESSAGE)
    for (const good of OPS_DECISION_ACTIONS) expect(parseDecisionQuery(params({ action: good }), NOW)).toMatchObject({ ok: true, query: { action: good } })
    expect(OPS_DECISION_ACTIONS).toEqual(
      expect.arrayContaining(['submit', 'approve', 'reject', 'edit', 'revert', 'execute', 'fail', 'cancel', 'end', 'external_change'])
    )
  })

  it('커서는 「시각|ID」 모양만 받는다. 주소의 +가 공백으로 와도 되돌린다', () => {
    const id = uuid(7)
    const parsed = parseDecisionQuery(params({ cursor: `2026-10-03T01:02:03.123456+00:00|${id}` }), NOW)
    expect(parsed).toMatchObject({ ok: true, query: { cursor: { createdAt: '2026-10-03T01:02:03.123456+00:00', id } } })
    const spaced = parseDecisionQuery(params({ cursor: `2026-10-03T01:02:03.123456 00:00|${id}` }), NOW)
    expect(spaced).toMatchObject({ ok: true, query: { cursor: { createdAt: '2026-10-03T01:02:03.123456+00:00', id } } })
    const bads = [
      'garbage',
      `|${id}`,
      '2026-10-03T01:02:03Z|',
      `2026-10-03|${id}`,
      `2026-13-03T01:02:03Z|${id}`,
      `2026-02-31T01:02:03Z|${id}`,
      '2026-10-03T01:02:03Z|not-a-uuid',
      `2026-10-03T01:02:03Z,id.eq.1|${id}`,
      `2026-10-03T01:02:03Z)|${id}`,
    ]
    for (const bad of bads) expect(failure({ cursor: bad })).toBe(OPS_DECISION_CURSOR_INVALID_MESSAGE)
  })
})

describe('aggregateByPattern', () => {
  function agg(n: number, patternNo: string | null, action = 'approve', itemId: string | null = uuid(1000 + n)): OpsDecisionAggregateRow {
    return { id: uuid(n), action, item_id: itemId, ops_bundle_items: itemId === null ? null : { pattern_no: patternNo } }
  }

  it('패턴별로 행동별 결정 행 수와 결정이 있었던 항목 수를 센다', () => {
    const rows = [
      agg(1, 'P01', 'approve', uuid(1001)),
      agg(2, 'P01', 'edit', uuid(1001)),
      agg(3, 'P01', 'approve', uuid(1002)),
      agg(4, 'P01', 'reject', uuid(1003)),
      agg(5, 'P02', 'approve', uuid(1004)),
    ]
    expect(aggregateByPattern(rows)).toEqual([
      { patternNo: 'P01', items: 3, actions: { approve: 2, edit: 1, reject: 1 } },
      { patternNo: 'P02', items: 1, actions: { approve: 1 } },
    ])
  })

  it('묶음 단위 행(항목 없음)은 세지 않는다', () => {
    const rows = [agg(1, 'P01'), agg(2, null, 'submit', null), agg(3, null, 'approve', null)]
    expect(aggregateByPattern(rows)).toEqual([{ patternNo: 'P01', items: 1, actions: { approve: 1 } }])
    expect(aggregateByPattern([agg(1, null, 'submit', null)])).toEqual([])
  })

  it('패턴 없는 항목은 patternNo null 한 줄이고 맨 끝이다. 나머지는 번호의 숫자 순서다', () => {
    const rows = [agg(1, null), agg(2, 'P100'), agg(3, 'P10'), agg(4, 'P09'), agg(5, null, 'reject')]
    const result = aggregateByPattern(rows)
    expect(result.map((line) => line.patternNo)).toEqual(['P09', 'P10', 'P100', null])
    expect(result[3]).toEqual({ patternNo: null, items: 2, actions: { approve: 1, reject: 1 } })
  })

  it('행이 없으면 빈 목록이다', () => {
    expect(aggregateByPattern([])).toEqual([])
  })
})

describe('listOpsDecisions', () => {
  it('기록이 없으면 빈 목록이고, 범위는 읽은 기간이다', async () => {
    const result = await listOpsDecisions(service, query())
    expect(result).toEqual({
      range: { since: '2026-09-06T03:00:00.000Z', until: '2026-10-04T03:00:00.000Z' },
      decisions: [],
      nextCursor: null,
      byPattern: [],
    })
  })

  it('읽는 칸에 raw·slack_result가 없고 묶음·항목 inner join이 걸린다', async () => {
    db.rows = [decisionRow(1)]
    const { decisions } = await listOpsDecisions(service, query())
    expect(db.selects).toEqual([OPS_DECISION_READ_COLUMNS, OPS_DECISION_AGGREGATE_COLUMNS])
    for (const columns of db.selects) {
      expect(columns).not.toContain('raw')
      expect(columns).not.toContain('slack_result')
      expect(columns).toContain('ops_bundles!inner')
      expect(columns).toContain('ops_bundle_items!inner')
    }
    expect(JSON.stringify(decisions)).not.toContain(SLACK_SECRET)
    expect(JSON.stringify(decisions)).not.toContain(ADMIN_ID_VALUE)
  })

  it('시험 묶음의 기록은 목록과 집계에서 빠진다', async () => {
    db.rows = [
      decisionRow(1),
      decisionRow(2, { ops_bundles: { bundle_id: 'bundle-sample', week: '2026-W40', is_sample: true } }),
    ]
    const result = await listOpsDecisions(service, query())
    expect(db.filters.filter((f) => f === 'eq ops_bundles.is_sample=false')).toHaveLength(2) // 목록 + 집계
    expect(result.decisions.map((d) => d.id)).toEqual([uuid(1)])
    expect(result.byPattern).toEqual([{ patternNo: 'P01', items: 1, actions: { approve: 1 } }])
  })

  it('includeSample을 켜면(서버 컴포넌트용) 시험 묶음도 싣고 조건이 걸리지 않는다', async () => {
    db.rows = [decisionRow(1), decisionRow(2, { ops_bundles: { bundle_id: 'bundle-sample', week: null, is_sample: true } })]
    const result = await listOpsDecisions(service, query(), { includeSample: true })
    expect(db.filters.some((f) => f.includes('is_sample'))).toBe(false)
    expect(result.decisions).toHaveLength(2)
    expect(result.byPattern).toEqual([{ patternNo: 'P01', items: 2, actions: { approve: 2 } }])
  })

  it('항목 없는 결정(묶음 단위 행)은 inner join으로 빠진다', async () => {
    db.rows = [decisionRow(1), decisionRow(2, { item_id: null, ops_bundle_items: null, action: 'submit' })]
    const result = await listOpsDecisions(service, query())
    expect(result.decisions.map((d) => d.id)).toEqual([uuid(1)])
    expect(result.byPattern).toEqual([{ patternNo: 'P01', items: 1, actions: { approve: 1 } }])
  })

  it('기간 안만 싣는다 — since는 포함, until은 미포함', async () => {
    db.rows = [
      decisionRow(1, { created_at: '2026-09-06T02:59:59.000Z' }), // since 직전
      decisionRow(2, { created_at: '2026-09-06T03:00:00.000Z' }), // since 정각
      decisionRow(3, { created_at: '2026-10-04T02:59:59.000Z' }),
      decisionRow(4, { created_at: '2026-10-04T03:00:00.000Z' }), // until 정각
    ]
    const result = await listOpsDecisions(service, query())
    expect(result.decisions.map((d) => d.id)).toEqual([uuid(3), uuid(2)])
    expect(result.byPattern[0].items).toBe(2)
  })

  it('최신순이고 같은 시각이면 id 내림차순이다. 쪽은 200건 + 1건을 읽는다', async () => {
    db.rows = [
      decisionRow(1, { created_at: '2026-10-01T00:00:00.000Z' }),
      decisionRow(2, { created_at: '2026-10-02T00:00:00.000Z' }),
      decisionRow(3, { created_at: '2026-10-02T00:00:00.000Z' }),
    ]
    const { decisions } = await listOpsDecisions(service, query())
    expect(decisions.map((d) => d.id)).toEqual([uuid(3), uuid(2), uuid(1)])
    expect(db.ranges[0]).toEqual([0, OPS_DECISION_PAGE_SIZE])
  })

  it('패턴·행동 조건은 목록에만 걸고, 집계는 같은 기간 전체다', async () => {
    db.rows = [
      decisionRow(1),
      decisionRow(2, { action: 'reject' }),
      decisionRow(3, { ops_bundle_items: { item_key: 'k3', kind: 'mission', pattern_no: 'P02', status: 'approved' } }),
    ]
    const result = await listOpsDecisions(service, query({ patternNo: 'P01', action: 'reject' }))
    expect(db.filters).toContain('eq ops_bundle_items.pattern_no=P01')
    expect(db.filters).toContain('eq action=reject')
    expect(result.decisions.map((d) => d.id)).toEqual([uuid(2)])
    expect(result.byPattern).toEqual([
      { patternNo: 'P01', items: 2, actions: { approve: 1, reject: 1 } },
      { patternNo: 'P02', items: 1, actions: { approve: 1 } },
    ])
  })

  describe('쪽 나누기', () => {
    /** 205건. 7건씩 같은 시각을 써서 쪽 경계(200번째와 201번째)가 같은 시각에 걸리게 한다(200번째는 마지막 묶음 7건 중 둘째다). */
    function fillPaged() {
      db.rows = Array.from({ length: 205 }, (_, i) =>
        decisionRow(i + 1, { created_at: new Date(Date.parse('2026-10-01T00:00:00.000Z') + Math.floor(i / 7) * 60_000).toISOString() })
      )
    }

    it('한 쪽은 200건이고 nextCursor는 그 쪽 마지막 행의 「시각|ID」다', async () => {
      fillPaged()
      const result = await listOpsDecisions(service, query())
      expect(result.decisions).toHaveLength(OPS_DECISION_PAGE_SIZE)
      const last = result.decisions[OPS_DECISION_PAGE_SIZE - 1]
      expect(result.nextCursor).toBe(`${last.createdAt}|${last.id}`)
    })

    it('커서로 이어 읽으면 겹치지도 빠지지도 않고 마지막 쪽의 nextCursor는 null이다', async () => {
      fillPaged()
      const first = await listOpsDecisions(service, query())
      const [createdAt, id] = (first.nextCursor ?? '').split('|')
      const second = await listOpsDecisions(service, query({ cursor: { createdAt, id } }))
      expect(db.filters.some((f) => f.startsWith('or created_at.lt.'))).toBe(true)
      expect(second.decisions).toHaveLength(5)
      expect(second.nextCursor).toBeNull()
      const ids = [...first.decisions, ...second.decisions].map((d) => d.id)
      expect(new Set(ids).size).toBe(205)
      const everyone = new Set(Array.from({ length: 205 }, (_, i) => uuid(i + 1)))
      expect(new Set(ids)).toEqual(everyone)
    })

    it('정확히 200건이면 다음 쪽이 없다', async () => {
      db.rows = Array.from({ length: 200 }, (_, i) => decisionRow(i + 1))
      const result = await listOpsDecisions(service, query())
      expect(result.decisions).toHaveLength(200)
      expect(result.nextCursor).toBeNull()
    })

    it('집계는 쪽이 아니라 기간 전체를 센다', async () => {
      fillPaged()
      const first = await listOpsDecisions(service, query())
      expect(first.decisions).toHaveLength(200)
      expect(first.byPattern).toEqual([{ patternNo: 'P01', items: 205, actions: { approve: 205 } }])
      const [createdAt, id] = (first.nextCursor ?? '').split('|')
      const second = await listOpsDecisions(service, query({ cursor: { createdAt, id } }))
      expect(second.byPattern).toEqual(first.byPattern)
    })
  })

  it('조회 오류는 던진다', async () => {
    db.error = 'relation missing'
    await expect(listOpsDecisions(service, query())).rejects.toThrow('결정 기록 조회 실패')
  })
})
