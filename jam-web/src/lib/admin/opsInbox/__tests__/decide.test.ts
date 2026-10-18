/**
 * 결정 처리 (티켓 20260930_1818)
 *
 * 서비스 클라이언트는 메모리 안의 가짜 DB로 바꾼다(`ops-inbox/__tests__/route.test.ts`와 같은 방식, 실 DB에 접속하지 않는다).
 * 지키는 것:
 * - 승인·반려: 조건부 update(같은 항목을 두 번 승인하면 두 번째는 409, 결정 기록 1행), 반려 사유 필수, 결정 기록 insert 실패 시 상태 되돌림
 * - 일괄 승인: 같은 batch_id, skipped·excluded, 하나도 안 바뀌면 409
 * - 패턴 제안 승인(티켓 20261008_1845): 사전 입력과 함께 바로 종료, 형식 오류 400, 시험 묶음은 사전 제외, 실패 시 되돌림, 다시 승인해도 패턴 1개, 일괄 승인은 거름
 * - 수정: 제출 원본 불변, 고친 칸 오류는 400·나머지는 형식 오류 갱신, updated_at 어긋남 409, 되돌림 스택
 * - 패턴 번호·지점 카테고리 다시 검사(티켓 20261007_1745): 새 오류가 생겨도 직접 수정은 저장되고 열은 건드리지 않는다, 두 목록 조회가 실패하면 3경로 모두 500
 * - 결정 기록은 insert만 하고 slack_result 열만 update한다
 * - 시험 묶음만 지운다
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  type Result = { data?: unknown; error: { message: string; code?: string; details?: string } | null }

  const state = {
    tables: {
      ops_bundles: [],
      ops_bundle_items: [],
      ops_decisions: [],
      tribes: [],
      ops_patterns: [],
      poi_categories: [],
    } as Record<string, Row[]>,
    failOn: new Set<string>(),
    seq: 0,
    clock: 0,
    calls: [] as Array<{ table: string; op: string; payload?: unknown; filters: Array<[string, unknown]> }>,
    postOpsSlack: vi.fn(),
  }

  class Query implements PromiseLike<Result> {
    private mode: 'select' | 'insert' | 'update' | 'delete' = 'select'
    private payload: Row | Row[] = {}
    private filters: Array<[string, (row: Row) => boolean]> = []
    private log: Array<[string, unknown]> = []
    private returning = false
    private orderBy: { col: string; asc: boolean } | null = null

    constructor(private table: string) {}

    select() {
      if (this.mode !== 'select') this.returning = true
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
      this.filters.push([col, (row) => row[col] === val])
      this.log.push([col, val])
      return this
    }
    in(col: string, vals: unknown[]) {
      this.filters.push([col, (row) => vals.includes(row[col])])
      this.log.push([col, vals])
      return this
    }
    order(col: string, opts?: { ascending?: boolean }) {
      this.orderBy = { col, asc: opts?.ascending !== false }
      return this
    }
    async single() {
      const result = this.run()
      const rows = Array.isArray(result.data) ? result.data : []
      return { data: rows[0] ?? null, error: result.error }
    }
    async maybeSingle() {
      return this.single()
    }
    then<T1 = Result, T2 = never>(
      onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
    ): PromiseLike<T1 | T2> {
      return Promise.resolve(this.run()).then(onfulfilled, onrejected)
    }

    private run(): Result {
      state.calls.push({
        table: this.table,
        op: this.mode,
        payload: this.mode === 'insert' || this.mode === 'update' ? this.payload : undefined,
        filters: this.log,
      })
      if (state.failOn.has(`${this.table}.${this.mode}`)) return { data: null, error: { message: 'boom secret detail' } }

      const rows = state.tables[this.table]
      const matches = () => rows.filter((row) => this.filters.every(([, test]) => test(row)))

      if (this.mode === 'insert') {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload]
        // 패턴 사전의 유일 제약(번호·값이 있는 출처 항목)을 흉내 낸다.
        if (this.table === 'ops_patterns') {
          for (const item of list) {
            if (rows.some((row) => row.pattern_no === item.pattern_no)) {
              return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "ops_patterns_pkey"' } }
            }
            if (typeof item.origin_item_id === 'string' && rows.some((row) => row.origin_item_id === item.origin_item_id)) {
              return {
                data: null,
                error: { code: '23505', message: 'duplicate key value violates unique constraint "ops_patterns_origin_item_id_key"' },
              }
            }
          }
        }
        const inserted = list.map((item) => {
          const row: Row = {
            id: `id-${++state.seq}`,
            item_id: null,
            batch_id: null,
            diff: null,
            reason: null,
            slack_result: null,
            created_at: new Date(Date.UTC(2026, 9, 1, 0, 0, ++state.clock)).toISOString(),
            ...item,
          }
          rows.push(row)
          return row
        })
        // 패턴 사전 insert는 만든 행 전체를 돌려준다(PostgREST의 `.select(열 목록)`).
        if (this.table === 'ops_patterns') return { data: this.returning ? inserted.map((row) => ({ ...row })) : null, error: null }
        return { data: this.returning ? inserted.map((row) => ({ id: row.id })) : null, error: null }
      }
      if (this.mode === 'update') {
        const hit = matches()
        for (const row of hit) Object.assign(row, this.payload)
        return { data: this.returning ? hit.map((row) => ({ id: row.id })) : null, error: null }
      }
      if (this.mode === 'delete') {
        const gone = new Set(matches())
        state.tables[this.table] = rows.filter((row) => !gone.has(row))
        if (this.table === 'ops_bundles') {
          const ids = new Set([...gone].map((row) => row.id))
          state.tables.ops_bundle_items = state.tables.ops_bundle_items.filter((row) => !ids.has(row.bundle_id))
          state.tables.ops_decisions = state.tables.ops_decisions.filter((row) => !ids.has(row.bundle_id))
        }
        return { data: null, error: null }
      }
      let found = matches()
      if (this.orderBy) {
        const { col, asc } = this.orderBy
        found = [...found].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1))
      }
      return { data: found.map((row) => ({ ...row })), error: null }
    }
  }

  return { state, Query }
})

vi.mock('@/lib/admin/opsInbox/slack', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/opsInbox/slack')>()
  return { ...actual, postOpsSlack: h.state.postOpsSlack }
})

import { validateOpsBundle } from '../validate'
import { readOpsItemColorPending } from '../fields'
import { readImageSpec } from '../imageSpec'
import {
  approveItem,
  bulkApprove,
  deleteSampleBundle,
  editItem,
  fillColor,
  notifyDecision,
  rejectItem,
  revertLastEdit,
  type DecisionFailure,
  type DecisionSuccess,
} from '../decide'

const service = { from: (table: string) => new h.Query(table) } as unknown as Parameters<typeof approveItem>[0]

const B = '4ca7d1ad-43b2-41a3-9ed4-f03bc73604ee'
const OTHER_B = '11111111-1111-4111-8111-111111111111'
const I1 = '00000000-0000-4000-8000-000000000001'
const I2 = '00000000-0000-4000-8000-000000000002'
const I3 = '00000000-0000-4000-8000-000000000003'
const I4 = '00000000-0000-4000-8000-000000000004'
const FOREIGN = '00000000-0000-4000-8000-0000000000ff'
const T0 = '2026-10-01T00:00:00.000Z'
const TRIBE_A = '3f2c9a10-5b7e-4d21-8a64-0c1e7b9d2f55'
const TRIBE_MISSING = '9a8b7c6d-1e2f-4a3b-8c4d-5e6f7a8b9c0d'

const WORLD_REVIEW = { world_related: false, winter_reviewed: false, reason: '운영성 카드예요' }

function makeOriginal(overrides: Record<string, unknown> = {}) {
  return {
    item_key: 'card-1',
    kind: 'home_feed_card',
    shape: 'hero',
    exposure_tags: ['all'],
    user_experience: '비 오는 월요일 아침에 카드를 만나요',
    starts_at: '2026-10-05T09:00:00+09:00',
    ends_at: '2026-10-06T09:00:00+09:00',
    copy: { title: '우산 챙겨 달리기', body: '오늘은 비가 와요' },
    colors: { background: '#1a2b3c' },
    world_review: WORLD_REVIEW,
    ...overrides,
  }
}

function makeItem(id: string, position: number, overrides: Record<string, unknown> = {}) {
  const original = (overrides.original as Record<string, unknown> | undefined) ?? makeOriginal({ item_key: `card-${position + 1}` })
  return {
    id,
    bundle_id: B,
    position,
    item_key: original.item_key ?? null,
    kind: 'home_feed_card',
    pattern_no: null,
    starts_at: '2026-10-05T00:00:00.000Z',
    ends_at: '2026-10-06T00:00:00.000Z',
    status: 'reviewing',
    original,
    edited: null,
    format_errors: [] as string[],
    created_at: T0,
    updated_at: T0,
    ...overrides,
  }
}

function seed(items = [makeItem(I1, 0), makeItem(I2, 1), makeItem(I3, 2, { status: 'approved' })], bundle: Record<string, unknown> = {}) {
  h.state.tables = {
    ops_bundles: [{ id: B, is_sample: true, format_errors: [], ...bundle }, { id: OTHER_B, is_sample: false, format_errors: [] }],
    ops_bundle_items: items.map((item) => ({ ...item })),
    tribes: [{ id: TRIBE_A }],
    ops_patterns: [{ pattern_no: 'P07' }],
    poi_categories: [{ slug: 'cafe' }],
    ops_decisions: [{ id: 'd-submit', bundle_id: B, item_id: null, action: 'submit', actor: 'token:윤진', batch_id: null, diff: null, reason: null, slack_result: null, created_at: T0 }],
  }
}

const item = (id: string) => h.state.tables.ops_bundle_items.find((row) => row.id === id) as ReturnType<typeof makeItem>
const decisions = (action?: string) =>
  h.state.tables.ops_decisions.filter((row) => (action ? row.action === action : row.action !== 'submit'))
const failure = (outcome: unknown) => outcome as DecisionFailure
const success = (outcome: unknown) => outcome as DecisionSuccess

beforeEach(() => {
  h.state.failOn.clear()
  h.state.seq = 0
  h.state.clock = 0
  h.state.calls = []
  h.state.postOpsSlack.mockReset()
  seed()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('승인', () => {
  it('검토중 항목을 승인됨으로 바꾸고 결정 기록 1행을 남긴다(행위자는 관리자 ID, 사유 없음)', async () => {
    const out = success(await approveItem(service, { bundleId: B, itemId: I1, actor: 'admin-1' }))
    expect(out.ok).toBe(true)
    expect(item(I1).status).toBe('approved')
    expect(item(I1).updated_at).not.toBe(T0)
    expect(item(I2).status).toBe('reviewing') // 다른 항목은 그대로
    expect(decisions()).toHaveLength(1)
    expect(decisions()[0]).toMatchObject({ bundle_id: B, item_id: I1, action: 'approve', actor: 'admin-1', reason: null })
    expect(out.slack).toEqual({ action: 'approve', isSample: true, itemLabel: '홈피드 카드 · 10/5(월) 09:00' })
  })

  it('같은 항목을 두 번 승인하면 두 번째는 409이고 결정 기록은 1행이다', async () => {
    await approveItem(service, { bundleId: B, itemId: I1, actor: 'admin-1' })
    const second = failure(await approveItem(service, { bundleId: B, itemId: I1, actor: 'admin-2' }))
    expect(second).toMatchObject({ ok: false, status: 409, error: '이미 다른 곳에서 처리한 항목이에요.' })
    expect(decisions()).toHaveLength(1)
    expect(decisions()[0].actor).toBe('admin-1')
  })

  it('두 요청이 동시에 와도 한 번만 반영된다', async () => {
    const results = await Promise.all([
      approveItem(service, { bundleId: B, itemId: I1, actor: 'admin-1' }),
      approveItem(service, { bundleId: B, itemId: I1, actor: 'admin-2' }),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok).map((r) => (r as DecisionFailure).status)).toEqual([409])
    expect(decisions()).toHaveLength(1)
  })

  it('갱신 조건에 status = reviewing이 들어간다', async () => {
    await approveItem(service, { bundleId: B, itemId: I1, actor: 'admin-1' })
    const update = h.state.calls.find((call) => call.table === 'ops_bundle_items' && call.op === 'update')
    expect(update?.filters).toContainEqual(['status', 'reviewing'])
    expect(update?.filters).toContainEqual(['bundle_id', B])
  })

  it('검토중이 아니면 409이고 결정 기록을 남기지 않는다', async () => {
    const out = failure(await approveItem(service, { bundleId: B, itemId: I3, actor: 'admin-1' }))
    expect(out.status).toBe(409)
    expect(decisions()).toHaveLength(0)
  })

  it('없는 항목·다른 묶음의 항목은 404다', async () => {
    expect(failure(await approveItem(service, { bundleId: B, itemId: FOREIGN, actor: 'a' })).status).toBe(404)
    h.state.tables.ops_bundle_items.push(makeItem(I4, 0, { bundle_id: OTHER_B }))
    expect(failure(await approveItem(service, { bundleId: B, itemId: I4, actor: 'a' })).status).toBe(404)
    expect(failure(await approveItem(service, { bundleId: '22222222-2222-4222-8222-222222222222', itemId: I1, actor: 'a' })).status).toBe(404)
    expect(item(I4).status).toBe('reviewing')
  })

  it('결정 기록 저장이 실패하면 상태를 검토중으로 되돌리고 500이다(오류 원문은 싣지 않는다)', async () => {
    h.state.failOn.add('ops_decisions.insert')
    const out = failure(await approveItem(service, { bundleId: B, itemId: I1, actor: 'admin-1' }))
    expect(out.status).toBe(500)
    expect(out.error).toBe('승인하지 못했어요. 잠시 뒤 다시 눌러 주세요.')
    expect(out.error).not.toContain('boom')
    expect(item(I1).status).toBe('reviewing')
    expect(decisions()).toHaveLength(0)
  })

  it('상태 변경이 실패해도 500이고 결정 기록은 없다', async () => {
    h.state.failOn.add('ops_bundle_items.update')
    const out = failure(await approveItem(service, { bundleId: B, itemId: I1, actor: 'admin-1' }))
    expect(out.status).toBe(500)
    expect(decisions()).toHaveLength(0)
  })
})

describe('반려', () => {
  it('사유를 다듬어 남기고 반려로 바꾼다', async () => {
    const out = success(await rejectItem(service, { bundleId: B, itemId: I1, actor: 'admin-1', reason: '  톤이 맞지 않아요  ' }))
    expect(item(I1).status).toBe('rejected')
    expect(decisions()[0]).toMatchObject({ action: 'reject', item_id: I1, actor: 'admin-1', reason: '톤이 맞지 않아요' })
    expect(out.slack).toMatchObject({ action: 'reject', reason: '톤이 맞지 않아요' })
  })

  it('사유가 비었거나 공백뿐이면 400이고 아무것도 바꾸지 않는다', async () => {
    for (const reason of ['', '   ', '\n\t', undefined, null, 5]) {
      const out = failure(await rejectItem(service, { bundleId: B, itemId: I1, actor: 'a', reason }))
      expect(out.status).toBe(400)
      expect(out.error).toBe('반려 이유를 적어 주세요.')
    }
    expect(item(I1).status).toBe('reviewing')
    expect(h.state.calls).toEqual([]) // 사유 검사가 DB보다 먼저다
  })

  it('500자까지 받고 넘으면 400이다', async () => {
    expect(failure(await rejectItem(service, { bundleId: B, itemId: I1, actor: 'a', reason: '가'.repeat(501) })).status).toBe(400)
    expect((await rejectItem(service, { bundleId: B, itemId: I1, actor: 'a', reason: '가'.repeat(500) })).ok).toBe(true)
  })

  it('이미 처리된 항목은 409, 결정 기록 저장 실패는 되돌림이다', async () => {
    await rejectItem(service, { bundleId: B, itemId: I1, actor: 'a', reason: '이유' })
    expect(failure(await rejectItem(service, { bundleId: B, itemId: I1, actor: 'b', reason: '이유' })).status).toBe(409)
    expect(decisions()).toHaveLength(1)

    h.state.failOn.add('ops_decisions.insert')
    const out = failure(await rejectItem(service, { bundleId: B, itemId: I2, actor: 'a', reason: '이유' }))
    expect(out.status).toBe(500)
    expect(item(I2).status).toBe('reviewing')
  })
})

describe('일괄 승인', () => {
  it('바뀐 항목마다 결정 기록 1행을 같은 batch_id로 남기고 개수를 돌려준다', async () => {
    const out = success(await bulkApprove(service, { bundleId: B, itemIds: [I1, I2], actor: 'admin-1' }))
    expect(out.body).toEqual({ ok: true, approved: 2, skipped: 0, excluded: 0 })
    expect(item(I1).status).toBe('approved')
    expect(item(I2).status).toBe('approved')
    const rows = decisions('approve')
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((row) => row.batch_id)).size).toBe(1)
    expect(rows[0].batch_id).toBe(out.batchId)
    expect(rows.map((row) => row.item_id).sort()).toEqual([I1, I2])
    expect(rows.every((row) => row.actor === 'admin-1')).toBe(true)
    expect(out.decisionIds).toHaveLength(2)
    expect(out.slack).toEqual({ action: 'bulk_approve', isSample: true, approved: 2, excluded: 0, skipped: 0 })
  })

  it('요청하지 않은 검토중 항목은 excluded로 세고 건드리지 않는다', async () => {
    const out = success(await bulkApprove(service, { bundleId: B, itemIds: [I1], actor: 'a' }))
    expect(out.body).toMatchObject({ approved: 1, skipped: 0, excluded: 1 })
    expect(item(I2).status).toBe('reviewing')
  })

  it('요청했지만 그 사이 처리된 항목은 skipped로 세고 결정 기록을 남기지 않는다', async () => {
    item(I2).status = 'rejected'
    const out = success(await bulkApprove(service, { bundleId: B, itemIds: [I1, I2, I3], actor: 'a' }))
    expect(out.body).toMatchObject({ approved: 1, skipped: 2, excluded: 0 })
    expect(decisions('approve').map((row) => row.item_id)).toEqual([I1])
    expect(item(I2).status).toBe('rejected')
  })

  it('하나도 바뀌지 않으면 409이고 개수를 함께 돌려준다', async () => {
    const out = failure(await bulkApprove(service, { bundleId: B, itemIds: [I3], actor: 'a' }))
    expect(out.status).toBe(409)
    expect(out.extra).toEqual({ approved: 0, skipped: 1, excluded: 2 })
    expect(decisions()).toHaveLength(0)
  })

  it('같은 ID를 여러 번 보내도 한 번만 센다', async () => {
    const out = success(await bulkApprove(service, { bundleId: B, itemIds: [I1, I1, I1], actor: 'a' }))
    expect(out.body).toMatchObject({ approved: 1, skipped: 0 })
    expect(decisions('approve')).toHaveLength(1)
  })

  it('빈 목록·UUID가 아닌 값·60개 초과·이 기획의 항목이 아닌 값은 400이다', async () => {
    const many = Array.from({ length: 61 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    for (const itemIds of [[], 'x', ['abc'], [I1, 5], many, [I1, FOREIGN]]) {
      expect(failure(await bulkApprove(service, { bundleId: B, itemIds, actor: 'a' })).status, JSON.stringify(itemIds).slice(0, 30)).toBe(400)
    }
    expect(item(I1).status).toBe('reviewing')
  })

  it('결정 기록 저장이 실패하면 승인한 항목을 모두 검토중으로 되돌린다', async () => {
    h.state.failOn.add('ops_decisions.insert')
    const out = failure(await bulkApprove(service, { bundleId: B, itemIds: [I1, I2], actor: 'a' }))
    expect(out.status).toBe(500)
    expect(item(I1).status).toBe('reviewing')
    expect(item(I2).status).toBe('reviewing')
    expect(item(I3).status).toBe('approved') // 원래 승인된 항목은 그대로
  })
})

const P1 = '00000000-0000-4000-8000-0000000000a1'
const P2 = '00000000-0000-4000-8000-0000000000a2'

const PROPOSAL_PATTERN = {
  name: '오늘의 열쇠',
  principle: '오늘 한 일로 자물쇠를 연다',
  user_experience: '오늘 한 운동이 내일 배지의 열쇠가 돼요',
  menus: ['미션'],
  knobs: {
    condition: { open: '오늘 체크인 1회', closed: '상위 기록자만 통과하는 거리' },
    place: { open: '산·역·공원', closed: '공통 규칙뿐이다' },
    time: { open: '당일 활동', closed: '심야 시간대' },
    reward: { open: '믹스 결과 배지', closed: '재료를 빼앗는 방식' },
    tribe: { rule: '열쇠 행동과 장소의 성격에 맞춘다', example: '아날로그 수집가' },
  },
}

function proposalItem(id: string, position: number, pattern: unknown = PROPOSAL_PATTERN, overrides: Record<string, unknown> = {}) {
  const original = makeOriginal({ item_key: `proposal-${position + 1}`, kind: 'pattern_proposal', resource: { pattern } })
  return makeItem(id, position, { kind: 'pattern_proposal', original, ...overrides })
}

const patterns = () => h.state.tables.ops_patterns
const createdPatterns = () => patterns().filter((row) => row.origin === 'proposal')

describe('패턴 제안 승인 (티켓 20261008_1845)', () => {
  beforeEach(() => {
    seed([proposalItem(P1, 0), makeItem(I1, 1)], { is_sample: false })
  })

  it('사전에 새 패턴(출처 proposal·originItemId)을 넣고 항목을 바로 종료로 닫고 결정 기록 1행을 남긴다', async () => {
    const out = success(await approveItem(service, { bundleId: B, itemId: P1, actor: 'admin-1' }))
    expect(out.body).toEqual({ ok: true, status: 'ended', pattern: { patternNo: 'P08' }, patternSkipped: null })
    expect(item(P1).status).toBe('ended')
    expect(createdPatterns()).toHaveLength(1)
    expect(createdPatterns()[0]).toMatchObject({
      pattern_no: 'P08',
      name: '오늘의 열쇠',
      status: 'active',
      origin: 'proposal',
      origin_item_id: P1,
      updated_by: 'admin-1',
    })
    expect(decisions()).toHaveLength(1)
    expect(decisions()[0]).toMatchObject({ bundle_id: B, item_id: P1, action: 'approve', actor: 'admin-1', reason: null })
    expect(out.decisionIds).toHaveLength(1)
    expect(out.slack).toMatchObject({ action: 'approve', isSample: false })
  })

  it('수정본(edited)이 있으면 그 내용으로 사전에 넣는다', async () => {
    ;(item(P1) as { edited: unknown }).edited = { resource: { pattern: { ...PROPOSAL_PATTERN, name: '고친 이름' } } }
    await approveItem(service, { bundleId: B, itemId: P1, actor: 'admin-1' })
    expect(createdPatterns()[0].name).toBe('고친 이름')
  })

  it('형식이 맞지 않으면 400이고 상태·사전·결정 기록을 건드리지 않는다', async () => {
    seed([proposalItem(P1, 0, { ...PROPOSAL_PATTERN, name: '' })], { is_sample: false })
    const out = failure(await approveItem(service, { bundleId: B, itemId: P1, actor: 'admin-1' }))
    expect(out).toMatchObject({ ok: false, status: 400, error: '제안 내용 형식이 맞지 않아 패턴 사전에 넣을 수 없어요. 반려해 주세요.' })
    expect(item(P1).status).toBe('reviewing')
    expect(createdPatterns()).toHaveLength(0)
    expect(decisions()).toHaveLength(0)
    expect(h.state.calls.some((call) => call.op === 'update' || call.op === 'insert')).toBe(false)
  })

  it('시험 묶음이면 승인·종료·결정 기록은 같고 사전에는 넣지 않는다', async () => {
    seed([proposalItem(P1, 0)], { is_sample: true })
    const out = success(await approveItem(service, { bundleId: B, itemId: P1, actor: 'admin-1' }))
    expect(out.body).toEqual({ ok: true, status: 'ended', pattern: null, patternSkipped: 'sample' })
    expect(item(P1).status).toBe('ended')
    expect(createdPatterns()).toHaveLength(0)
    expect(decisions()).toHaveLength(1)
  })

  it('번호가 겹쳐 사전 입력이 실패하면 상태를 검토중으로 되돌리고 결정 기록 없이 409다', async () => {
    // 번호를 읽은 뒤 쓰기 전에 다른 곳이 같은 번호(P08)를 먼저 만든 경쟁.
    const rows = patterns()
    const realPush = rows.push.bind(rows)
    let raced = false
    h.state.tables.ops_patterns = new Proxy(rows, {
      get(target, prop, receiver) {
        if (prop === 'some' && !raced) {
          raced = true
          realPush({ pattern_no: 'P08' })
        }
        return Reflect.get(target, prop, receiver)
      },
    })
    const out = failure(await approveItem(service, { bundleId: B, itemId: P1, actor: 'admin-1' }))
    expect(out).toMatchObject({ ok: false, status: 409, error: '그사이 다른 패턴이 만들어졌어요. 다시 승인해 주세요.' })
    expect(item(P1).status).toBe('reviewing')
    expect(decisions()).toHaveLength(0)
    expect(createdPatterns()).toHaveLength(0)
  })

  it('사전 내용 검사에 걸리면 400으로 칸 문장을 한 문장에 담고 상태를 되돌린다', async () => {
    seed([proposalItem(P1, 0, { ...PROPOSAL_PATTERN, name: '가'.repeat(61) })], { is_sample: false })
    const out = failure(await approveItem(service, { bundleId: B, itemId: P1, actor: 'admin-1' }))
    expect(out.status).toBe(400)
    expect(out.error).toContain('패턴 사전 규칙에 맞지 않아요')
    expect(out.error).toContain('60자까지')
    expect(item(P1).status).toBe('reviewing')
    expect(decisions()).toHaveLength(0)
  })

  it('사전 저장이 실패하면 500이고 상태를 되돌린다(오류 원문은 싣지 않는다)', async () => {
    h.state.failOn.add('ops_patterns.insert')
    const out = failure(await approveItem(service, { bundleId: B, itemId: P1, actor: 'admin-1' }))
    expect(out.status).toBe(500)
    expect(out.error).not.toContain('boom')
    expect(item(P1).status).toBe('reviewing')
    expect(decisions()).toHaveLength(0)
  })

  it('결정 기록이 실패하면 상태만 되돌리고 패턴은 남는다 — 다시 승인해도 패턴은 하나다', async () => {
    h.state.failOn.add('ops_decisions.insert')
    const first = failure(await approveItem(service, { bundleId: B, itemId: P1, actor: 'admin-1' }))
    expect(first.status).toBe(500)
    expect(item(P1).status).toBe('reviewing')
    expect(createdPatterns()).toHaveLength(1)
    expect(decisions()).toHaveLength(0)

    h.state.failOn.delete('ops_decisions.insert')
    const second = success(await approveItem(service, { bundleId: B, itemId: P1, actor: 'admin-1' }))
    expect(second.body).toEqual({ ok: true, status: 'ended', pattern: { patternNo: 'P08' }, patternSkipped: null })
    expect(item(P1).status).toBe('ended')
    expect(createdPatterns()).toHaveLength(1)
    expect(decisions()).toHaveLength(1)
  })

  it('두 요청이 동시에 와도 한 번만 반영된다(패턴 1개·결정 기록 1행·나머지 409)', async () => {
    const results = await Promise.all([
      approveItem(service, { bundleId: B, itemId: P1, actor: 'admin-1' }),
      approveItem(service, { bundleId: B, itemId: P1, actor: 'admin-2' }),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok).map((r) => (r as DecisionFailure).status)).toEqual([409])
    expect(createdPatterns()).toHaveLength(1)
    expect(decisions()).toHaveLength(1)
  })

  it('이미 처리된 제안은 409이고 사전에 넣지 않는다', async () => {
    item(P1).status = 'rejected'
    const out = failure(await approveItem(service, { bundleId: B, itemId: P1, actor: 'admin-1' }))
    expect(out.status).toBe(409)
    expect(createdPatterns()).toHaveLength(0)
    expect(decisions()).toHaveLength(0)
  })

  it('상태 변경이 실패하면 500이고 사전에 넣지 않는다', async () => {
    h.state.failOn.add('ops_bundle_items.update')
    const out = failure(await approveItem(service, { bundleId: B, itemId: P1, actor: 'admin-1' }))
    expect(out.status).toBe(500)
    expect(createdPatterns()).toHaveLength(0)
  })

  it('패턴 제안이 아닌 승인은 응답이 그대로다(승인됨, 새 칸 없음, 사전 변화 없음)', async () => {
    const out = success(await approveItem(service, { bundleId: B, itemId: I1, actor: 'admin-1' }))
    expect(out.body).toEqual({ ok: true, status: 'approved' })
    expect(item(I1).status).toBe('approved')
    expect(patterns()).toHaveLength(1)
  })

  describe('일괄 승인은 패턴 제안을 빼고 처리한다', () => {
    beforeEach(() => {
      seed([proposalItem(P1, 0), proposalItem(P2, 1), makeItem(I1, 2), makeItem(I2, 3)], { is_sample: false })
    })

    it('나머지만 승인하고 뺀 개수를 patternProposals로 돌려준다(skipped·excluded에 섞지 않는다)', async () => {
      const out = success(await bulkApprove(service, { bundleId: B, itemIds: [P1, P2, I1], actor: 'admin-1' }))
      expect(out.body).toEqual({ ok: true, approved: 1, skipped: 0, excluded: 1, patternProposals: 2 })
      expect(item(I1).status).toBe('approved')
      expect(item(P1).status).toBe('reviewing')
      expect(item(P2).status).toBe('reviewing')
      expect(decisions('approve').map((row) => row.item_id)).toEqual([I1])
      expect(createdPatterns()).toHaveLength(0)
    })

    it('패턴 제안이 없으면 응답에 patternProposals 칸이 없다', async () => {
      const out = success(await bulkApprove(service, { bundleId: B, itemIds: [I1, I2], actor: 'admin-1' }))
      expect(out.body).toEqual({ ok: true, approved: 2, skipped: 0, excluded: 2 })
    })

    it('요청이 모두 패턴 제안이면 400이고 아무것도 바꾸지 않는다', async () => {
      const out = failure(await bulkApprove(service, { bundleId: B, itemIds: [P1, P2], actor: 'admin-1' }))
      expect(out).toMatchObject({ ok: false, status: 400, error: '패턴 제안은 하나씩 승인해 주세요.' })
      expect(item(P1).status).toBe('reviewing')
      expect(decisions()).toHaveLength(0)
    })

    it('남은 항목이 모두 이미 처리돼 409여도 거른 개수를 함께 돌려준다', async () => {
      item(I1).status = 'rejected'
      const out = failure(await bulkApprove(service, { bundleId: B, itemIds: [P1, I1], actor: 'admin-1' }))
      expect(out.status).toBe(409)
      expect(out.extra).toEqual({ approved: 0, skipped: 1, excluded: 2, patternProposals: 1 })
    })
  })
})

describe('직접 수정', () => {
  const edit = (values: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    editItem(service, { bundleId: B, itemId: I1, actor: 'admin-1', values, expectedUpdatedAt: T0, ...extra })

  it('수정본에만 쓰고 제출 원본은 바꾸지 않는다', async () => {
    const snapshot = JSON.stringify(item(I1).original)
    const out = success(await edit({ 'copy.title': '새 제목', user_experience: '새 문장' }, { reason: '  오타를 고쳤어요 ' }))
    expect(out.ok).toBe(true)
    expect(JSON.stringify(item(I1).original)).toBe(snapshot)
    expect(item(I1).edited).toEqual({
      copy: { title: '새 제목', body: '오늘은 비가 와요' },
      user_experience: '새 문장',
    })
    expect(item(I1).status).toBe('reviewing')
    expect(item(I1).updated_at).not.toBe(T0)
    expect(out.body).toMatchObject({ ok: true, changed: ['copy.title', 'user_experience'] })
  })

  it('결정 기록에 누가·무엇을·전후 차이·사유가 남는다', async () => {
    await edit({ 'copy.title': '새 제목' }, { reason: '  오타를 고쳤어요 ' })
    expect(decisions('edit')).toHaveLength(1)
    expect(decisions('edit')[0]).toMatchObject({
      bundle_id: B,
      item_id: I1,
      actor: 'admin-1',
      reason: '오타를 고쳤어요',
      diff: [{ path: 'copy.title', before: '우산 챙겨 달리기', after: '새 제목' }],
    })
  })

  it('수정 사유는 선택이다(없으면 null)', async () => {
    await edit({ 'copy.title': '새 제목' })
    expect(decisions('edit')[0].reason).toBeNull()
    expect(failure(await edit({ 'copy.body': '또 바꿔요' }, { reason: '가'.repeat(501) })).status).toBe(400)
  })

  it('공개 시각을 고치면 열(starts_at)도 함께 바뀌고 슬랙 글 재료에 새 시각이 들어간다', async () => {
    const out = success(await edit({ starts_at: '2026-10-05T10:30:00+09:00', ends_at: '2026-10-06T10:30:00+09:00' }))
    expect(item(I1).starts_at).toBe('2026-10-05T01:30:00.000Z')
    expect(item(I1).ends_at).toBe('2026-10-06T01:30:00.000Z')
    expect(out.slack).toEqual({
      action: 'edit',
      isSample: true,
      itemLabel: '홈피드 카드 · 10/5(월) 10:30',
      changedLabels: ['공개 시각', '종료 시각'],
    })
  })

  it('고친 칸의 새 오류는 저장을 막고 400으로 칸별 문장을 돌려준다', async () => {
    const before = JSON.stringify(item(I1))
    // 종료가 시작보다 빠르다 → 시각은 한 묶음이라 ends_at 칸에 문장이 붙는다
    const time = failure(await edit({ ends_at: '2026-10-04T09:00:00+09:00' }))
    expect(time.status).toBe(400)
    expect(time.extra).toEqual({ fieldErrors: { ends_at: '끝나는 시각이 시작보다 빨라요. 시작 뒤로 바꿔 주세요.' } })
    // 「유저가 겪는 것」을 비움
    const blank = failure(await edit({ user_experience: '   ' }))
    expect(blank.extra).toEqual({ fieldErrors: { user_experience: '유저가 겪는 것을 비워 둘 수 없어요. 한 문장으로 적어 주세요.' } })
    // 색 형식
    const color = failure(await edit({ 'colors.background': 'red' }))
    expect(color.extra).toMatchObject({ fieldErrors: { 'colors.background': expect.stringContaining('#rrggbb') } })
    // 시각 형식·비우기
    expect(failure(await edit({ starts_at: '내일 아침' })).extra).toMatchObject({ fieldErrors: { starts_at: expect.any(String) } })
    expect(failure(await edit({ ends_at: '' })).status).toBe(400)

    expect(JSON.stringify(item(I1))).toBe(before) // 아무것도 저장하지 않았다
    expect(decisions()).toHaveLength(0)
  })

  it('고칠 수 없는 칸·바뀐 게 없는 요청은 400이다', async () => {
    for (const values of [{ kind: 'mission' }, { links: 'x' }, { 'world_review.reason': 'x' }, { 'copy.nope': 'x' }, { 'copy.title': 3 }]) {
      const out = failure(await edit(values))
      expect(out.status, JSON.stringify(values)).toBe(400)
    }
    expect(failure(await edit({ 'copy.title': '우산 챙겨 달리기' })).error).toBe('바뀐 내용이 없어요.')
    expect(failure(await edit({})).error).toBe('바뀐 내용이 없어요.')
    for (const values of [null, [], 'x']) expect(failure(await edit(values as never)).status).toBe(400)
    expect(decisions()).toHaveLength(0)
  })

  it('화면이 본 수정 시각과 다르면 409이고 아무것도 저장하지 않는다', async () => {
    const out = failure(await edit({ 'copy.title': '새 제목' }, { expectedUpdatedAt: '2026-09-30T00:00:00.000Z' }))
    expect(out).toMatchObject({ status: 409, error: '이미 다른 곳에서 처리한 항목이에요.' })
    expect(item(I1).edited).toBeNull()
    expect(decisions()).toHaveLength(0)
    expect(failure(await edit({ 'copy.title': 'x' }, { expectedUpdatedAt: '' })).status).toBe(400)
  })

  it('갱신 조건에 status와 수정 시각이 들어간다', async () => {
    await edit({ 'copy.title': '새 제목' })
    const update = h.state.calls.find((call) => call.table === 'ops_bundle_items' && call.op === 'update')
    expect(update?.filters).toContainEqual(['status', 'reviewing'])
    expect(update?.filters).toContainEqual(['updated_at', T0])
  })

  it('검토중이 아닌 항목은 고칠 수 없다(409)', async () => {
    const out = failure(await editItem(service, { bundleId: B, itemId: I3, actor: 'a', values: { 'copy.title': 'x' }, expectedUpdatedAt: T0 }))
    expect(out.status).toBe(409)
    expect(item(I3).edited).toBeNull()
  })

  it('결정 기록 저장이 실패하면 항목을 원래대로 돌리고 500이다', async () => {
    h.state.failOn.add('ops_decisions.insert')
    const out = failure(await edit({ 'copy.title': '새 제목', starts_at: '2026-10-05T10:00:00+09:00' }))
    expect(out.status).toBe(500)
    expect(item(I1).edited).toBeNull()
    expect(item(I1).starts_at).toBe(makeItem(I1, 0).starts_at)
    expect(item(I1).updated_at).toBe(T0)
  })

  describe('형식 오류 갱신', () => {
    const LINK_ERROR = 'items[0].links[0]: 이 묶음에 그런 item_key가 없어요(받은 값: "nope").'
    const UX_ERROR = 'items[0].user_experience: 필수 항목이 없어요(「유저가 겪는 것」을 쉬운 한 문장으로 적어 주세요).'
    const OTHER_ITEM_ERROR = 'items[1].kind: 필수 항목이 없어요.'
    const BUNDLE_ERROR = 'week: YYYY-Www 형식이어야 해요(예: 2026-W41, 받은 값: "x").'

    beforeEach(() => {
      const original = makeOriginal({ item_key: 'card-1', links: ['nope'] })
      delete (original as Record<string, unknown>).user_experience
      seed(
        [
          makeItem(I1, 0, { original, format_errors: [LINK_ERROR, UX_ERROR] }),
          makeItem(I2, 1, { format_errors: [OTHER_ITEM_ERROR] }),
        ],
        { format_errors: [BUNDLE_ERROR, LINK_ERROR, UX_ERROR, OTHER_ITEM_ERROR] }
      )
    })

    it('이미 있던 오류를 고치면 그 오류가 사라지고 나머지 오류는 새 결과로 남는다', async () => {
      const out = await edit({ user_experience: '월요일 아침 카드를 만나요' })
      expect(out.ok).toBe(true)
      expect(item(I1).format_errors).toEqual([LINK_ERROR])
      // 묶음 목록에서 이 항목의 줄만 바뀐다: 묶음 오류·다른 항목 오류는 그대로, 순서도 그대로
      const bundle = h.state.tables.ops_bundles.find((row) => row.id === B)
      expect(bundle?.format_errors).toEqual([BUNDLE_ERROR, LINK_ERROR, OTHER_ITEM_ERROR])
    })

    it('고치지 않은 칸의 오류(연결)가 있어도 다른 칸은 저장된다', async () => {
      const out = await edit({ 'copy.title': '새 제목' })
      expect(out.ok).toBe(true)
      // 「유저가 겪는 것」이 비어 있는 채 남아 있어도 이번에 고친 칸이 아니라 막지 않는다(오류 목록은 다시 검사한 결과의 순서다)
      expect(item(I1).format_errors).toEqual([UX_ERROR, LINK_ERROR])
    })

    it('수정 뒤에도 공개 시각 오류가 없으면 항목 오류 목록에 새로 생기지 않는다', async () => {
      await edit({ user_experience: '문장', starts_at: '2026-10-05T08:00:00+09:00' })
      expect(item(I1).format_errors).toEqual([LINK_ERROR])
    })
  })

  describe('카드 칸 다시 검사 (티켓 20261001_1152)', () => {
    const SHAPE_ERROR_START = 'items[0].shape: 필수 항목이 없어요'
    const TAGS_ERROR_START = 'items[0].exposure_tags: 필수 항목이 없어요'
    const MISSING_TRIBE_ERROR = `items[0].tribe_id: 없는 트라이브예요(받은 값: "${TRIBE_MISSING}"). 트라이브 ID를 확인해 주세요.`

    function seedWith(original: Record<string, unknown>) {
      seed([makeItem(I1, 0, { original }), makeItem(I2, 1)])
    }
    // 앞 수정이 수정 시각을 바꾸므로 두 번째부터는 지금 항목의 수정 시각을 넘긴다.
    const editNow = (values: Record<string, unknown>) =>
      editItem(service, { bundleId: B, itemId: I1, actor: 'admin-1', values, expectedUpdatedAt: item(I1).updated_at })

    it('옛 형식 항목(segment만)을 고치면 저장되고 새 칸 오류가 붙지만 막지 않는다', async () => {
      const legacy = makeOriginal({ segment: 'new_user' }) as Record<string, unknown>
      delete legacy.shape
      delete legacy.exposure_tags
      seedWith(legacy)

      const out = await edit({ 'copy.title': '새 제목' })
      expect(out.ok).toBe(true)
      expect(item(I1).edited).toEqual({ copy: { title: '새 제목', body: '오늘은 비가 와요' } })
      expect(item(I1).format_errors).toHaveLength(2)
      expect(item(I1).format_errors[0]).toContain(SHAPE_ERROR_START)
      expect(item(I1).format_errors[1]).toContain(TAGS_ERROR_START)
      // 묶음 오류 목록에도 그 항목의 새 결과가 들어간다
      const bundle = h.state.tables.ops_bundles.find((row) => row.id === B)
      expect(bundle?.format_errors).toEqual(item(I1).format_errors)
      // 대상(segment)을 고쳐도 막지 않는다(shape·exposure_tags는 이 화면에서 고치는 칸이 아니다)
      expect((await editNow({ segment: 'all' })).ok).toBe(true)
    })

    it('tribes에 없는 tribe_id를 가진 항목을 고치면 제출 때와 같은 오류가 붙고 저장은 막지 않는다', async () => {
      seedWith(makeOriginal({ tribe_id: TRIBE_MISSING }))

      const out = await edit({ 'copy.title': '새 제목' })
      expect(out.ok).toBe(true)
      expect(item(I1).format_errors).toEqual([MISSING_TRIBE_ERROR])

      // 같은 항목·같은 목록으로 제출 검증을 돌린 결과와 같다
      const submitted = validateOpsBundle(
        { bundle_id: 'b', author: 'a', items: [makeOriginal({ tribe_id: TRIBE_MISSING })] },
        { tribeIds: new Set([TRIBE_A]) }
      )
      expect(item(I1).format_errors).toEqual(submitted.items[0].format_errors)
    })

    it('tribes에 있는 tribe_id면 오류가 없다', async () => {
      seedWith(makeOriginal({ tribe_id: TRIBE_A }))
      expect((await edit({ 'copy.title': '새 제목' })).ok).toBe(true)
      expect(item(I1).format_errors).toEqual([])
    })

    it('tribes 목록을 새로 읽는다(고칠 때마다 조회해 같은 규칙으로 판정한다)', async () => {
      seedWith(makeOriginal({ tribe_id: TRIBE_MISSING }))
      await edit({ 'copy.title': '첫 수정' })
      expect(item(I1).format_errors).toEqual([MISSING_TRIBE_ERROR])

      h.state.tables.tribes.push({ id: TRIBE_MISSING }) // 그 사이 트라이브가 생겼다
      await editNow({ 'copy.title': '둘째 수정' })
      expect(item(I1).format_errors).toEqual([])
    })

    it('트라이브 목록을 읽지 못하면 저장하지 않고 500이다(오류 원문은 싣지 않는다)', async () => {
      h.state.failOn.add('tribes.select')
      const before = JSON.stringify(item(I1))
      const out = failure(await edit({ 'copy.title': '새 제목' }))
      expect(out.status).toBe(500)
      expect(out.error).toBe('저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.')
      expect(JSON.stringify(out)).not.toContain('boom')
      expect(JSON.stringify(item(I1))).toBe(before)
      expect(decisions()).toHaveLength(0)
    })

    it('되돌릴 때도 같은 목록으로 다시 검사하고, 목록을 읽지 못하면 되돌리지 않는다', async () => {
      seedWith(makeOriginal({ tribe_id: TRIBE_MISSING }))
      expect((await edit({ 'copy.title': 'A1' })).ok).toBe(true)

      const out = success(await revertLastEdit(service, { bundleId: B, itemId: I1, actor: 'admin-2' }))
      expect(out.ok).toBe(true)
      expect(item(I1).format_errors).toEqual([MISSING_TRIBE_ERROR])

      await editNow({ 'copy.title': 'A2' })
      const edited = JSON.stringify(item(I1).edited)
      h.state.failOn.add('tribes.select')
      const failed = failure(await revertLastEdit(service, { bundleId: B, itemId: I1, actor: 'admin-2' }))
      expect(failed).toMatchObject({ status: 500, error: '되돌리지 못했어요. 잠시 뒤 다시 눌러 주세요.' })
      expect(JSON.stringify(item(I1).edited)).toBe(edited)
    })
  })
})

describe('패턴 번호·장소 카테고리 다시 검사 (티켓 20261007_1745)', () => {
  const PATTERN_ERROR = 'items[0].pattern_no: 패턴 사전에 없는 번호예요(받은 값: "P99"). 패턴 번호를 확인해 주세요.'
  const CATEGORY_ERROR = 'items[0].knobs.place_category: 없는 장소 카테고리예요 — "zoo". 카테고리 slug를 확인해 주세요.'
  const edit = () =>
    editItem(service, { bundleId: B, itemId: I1, actor: 'admin-1', values: { 'copy.title': '새 제목' }, expectedUpdatedAt: item(I1).updated_at })
  const seedWith = (original: Record<string, unknown>, columns: Record<string, unknown> = {}) =>
    seed([makeItem(I1, 0, { original, ...columns }), makeItem(I2, 1)])

  it('사전에 없는 번호를 가진 항목을 고치면 제출 때와 같은 오류가 붙고 저장은 막지 않으며 pattern_no 열은 그대로다', async () => {
    seedWith(makeOriginal({ pattern_no: 'P99' }), { pattern_no: 'P99' })

    const out = await edit()
    expect(out.ok).toBe(true)
    expect(item(I1).format_errors).toEqual([PATTERN_ERROR])
    expect(item(I1).pattern_no).toBe('P99')
    expect(decisions('edit')).toHaveLength(1)

    const submitted = validateOpsBundle(
      { bundle_id: 'b', author: 'a', items: [makeOriginal({ pattern_no: 'P99' })] },
      { patternNos: new Set(['P07']) }
    )
    expect(item(I1).format_errors).toEqual(submitted.items[0].format_errors)
  })

  it('형식이 틀린 번호(P-07)도 고치기를 막지 않고 열은 NULL 그대로다', async () => {
    seedWith(makeOriginal({ pattern_no: 'P-07' }))

    expect((await edit()).ok).toBe(true)
    expect(item(I1).format_errors).toHaveLength(1)
    expect(item(I1).format_errors[0]).toMatch(/^items\[0\]\.pattern_no: 패턴 번호는 P01처럼/)
    expect(item(I1).pattern_no).toBeNull()
  })

  it('없는 장소 카테고리 slug를 가진 항목을 고쳐도 저장되고 오류만 붙는다', async () => {
    seedWith(makeOriginal({ knobs: { place_category: ['cafe', 'zoo'] } }))

    expect((await edit()).ok).toBe(true)
    expect(item(I1).format_errors).toEqual([CATEGORY_ERROR])
  })

  it('사전에 있는 번호와 있는 카테고리면 오류가 없다', async () => {
    seedWith(makeOriginal({ pattern_no: 'P07', knobs: { place_category: ['cafe'] } }))

    expect((await edit()).ok).toBe(true)
    expect(item(I1).format_errors).toEqual([])
  })

  it.each(['ops_patterns.select', 'poi_categories.select'])('%s가 실패하면 직접 수정은 저장하지 않고 500이다(오류 원문은 싣지 않는다)', async (failing) => {
    h.state.failOn.add(failing)
    const before = JSON.stringify(item(I1))

    const out = failure(await edit())
    expect(out).toMatchObject({ status: 500, error: '저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.' })
    expect(JSON.stringify(out)).not.toContain('boom')
    expect(JSON.stringify(item(I1))).toBe(before)
    expect(decisions()).toHaveLength(0)
  })

  it.each(['ops_patterns.select', 'poi_categories.select'])('%s가 실패하면 되돌리기도 되돌리지 않고 500이다', async (failing) => {
    expect((await edit()).ok).toBe(true)
    const edited = JSON.stringify(item(I1).edited)
    h.state.failOn.add(failing)

    const out = failure(await revertLastEdit(service, { bundleId: B, itemId: I1, actor: 'admin-2' }))
    expect(out).toMatchObject({ status: 500, error: '되돌리지 못했어요. 잠시 뒤 다시 눌러 주세요.' })
    expect(JSON.stringify(item(I1).edited)).toBe(edited)
  })

  it.each(['ops_patterns.select', 'poi_categories.select'])('%s가 실패하면 색 채우기도 저장하지 않고 500이다', async (failing) => {
    seed([makeItem(I1, 0, { original: makeOriginal({ color_pending: true }) })])
    h.state.failOn.add(failing)

    const out = failure(
      await fillColor(service, { bundleId: B, itemId: I1, actor: 'admin-1', bg: '#b83618', end: '#5c1a0c', expectedUpdatedAt: T0 })
    )
    expect(out).toMatchObject({ status: 500, error: '색을 채우지 못했어요. 잠시 뒤 다시 눌러 주세요.' })
    expect(item(I1).edited).toBeNull()
    expect(decisions('fill_color')).toHaveLength(0)
  })
})

describe('수정 되돌리기', () => {
  const edit = (values: Record<string, unknown>) =>
    editItem(service, { bundleId: B, itemId: I1, actor: 'admin-1', values, expectedUpdatedAt: item(I1).updated_at })
  const revert = () => revertLastEdit(service, { bundleId: B, itemId: I1, actor: 'admin-2' })

  it('수정 2번 → 되돌림 → 되돌림: 한 단계씩 제출 원본 상태로 돌아가고 결정 기록에 revert가 남는다', async () => {
    const original = JSON.stringify(item(I1).original)
    expect((await edit({ 'copy.title': 'A1' })).ok).toBe(true)
    expect((await edit({ 'copy.title': 'A2', user_experience: '새 문장' })).ok).toBe(true)

    const first = success(await revert())
    expect(first.ok).toBe(true)
    expect(item(I1).edited).toEqual({ copy: { title: 'A1', body: '오늘은 비가 와요' } })
    expect(decisions('revert')[0]).toMatchObject({
      action: 'revert',
      item_id: I1,
      actor: 'admin-2',
      diff: [
        { path: 'copy.title', before: 'A2', after: 'A1' },
        { path: 'user_experience', before: '새 문장', after: '비 오는 월요일 아침에 카드를 만나요' },
      ],
    })
    expect(first.slack).toMatchObject({ action: 'revert', changedLabels: ['문안 · title', '유저가 겪는 것'] })

    expect((await revert()).ok).toBe(true)
    expect(item(I1).edited).toBeNull() // 원본과 같아져 수정본이 비었다
    expect(JSON.stringify(item(I1).original)).toBe(original)
    expect(decisions('revert')).toHaveLength(2)

    // 더 되돌릴 수정이 없다(다시 하기도 없다)
    const third = failure(await revert())
    expect(third).toMatchObject({ status: 409, error: '되돌릴 수정이 없어요.' })
    expect(decisions('revert')).toHaveLength(2)
  })

  it('되돌린 뒤 새로 수정하면 그 수정이 다음 대상이다', async () => {
    await edit({ 'copy.title': 'A1' })
    await revert()
    await edit({ 'copy.body': 'B1' })
    expect((await revert()).ok).toBe(true)
    expect(item(I1).edited).toBeNull()
  })

  it('공개 시각 수정도 열과 함께 되돌린다', async () => {
    const startsBefore = item(I1).starts_at
    await edit({ starts_at: '2026-10-05T10:00:00+09:00' })
    expect(item(I1).starts_at).toBe('2026-10-05T01:00:00.000Z')
    await revert()
    expect(item(I1).starts_at).toBe(startsBefore)
    expect(item(I1).edited).toBeNull()
  })

  it('수정한 적이 없으면 409이고 검토중이 아니어도 409다', async () => {
    expect(failure(await revert()).status).toBe(409)
    await edit({ 'copy.title': 'A1' })
    item(I1).status = 'approved'
    expect(failure(await revert()).status).toBe(409)
    expect(item(I1).edited).not.toBeNull()
  })

  it('결정 기록 저장이 실패하면 항목을 수정된 상태 그대로 돌린다', async () => {
    await edit({ 'copy.title': 'A1' })
    const edited = JSON.stringify(item(I1).edited)
    h.state.failOn.add('ops_decisions.insert')
    expect(failure(await revert()).status).toBe(500)
    expect(JSON.stringify(item(I1).edited)).toBe(edited)
  })
})

describe('색 채우기 (티켓 20261007_1145)', () => {
  const FOREST = '73f0f601-2382-900c-8ca2-5cc7c93ed95d'
  const pending = (extra: Record<string, unknown> = {}) =>
    makeItem(I1, 0, {
      original: makeOriginal({ color_pending: true, image_spec: { preset_id: 'editorial', values: { title: '제목' } }, ...extra }),
    })
  const fill = (bg: unknown, end: unknown, extra: Record<string, unknown> = {}) =>
    fillColor(service, { bundleId: B, itemId: I1, actor: 'admin-1', bg, end, expectedUpdatedAt: T0, ...extra })

  it('image_spec.bg·end와 colors.bg·end를 같은 값으로 채우고 색 대기를 푼다(원본 불변)', async () => {
    seed([pending()])
    const snapshot = JSON.stringify(item(I1).original)
    const out = success(await fill('#B83618', '#5c1a0c'))
    expect(out.ok).toBe(true)
    expect(JSON.stringify(item(I1).original)).toBe(snapshot)
    expect(item(I1).edited).toEqual({
      color_pending: false,
      image_spec: { preset_id: 'editorial', values: { title: '제목' }, bg: '#b83618', end: '#5c1a0c' },
      colors: { background: '#1a2b3c', bg: '#b83618', end: '#5c1a0c' },
    })
    expect(item(I1).status).toBe('reviewing')
    expect(out.body).toMatchObject({ ok: true, changed: ['color_pending', 'image_spec.bg', 'image_spec.end', 'colors.bg', 'colors.end'] })
  })

  it('채운 뒤에는 색 대기 신호의 근거(color_pending)가 false이고 image_spec에 bg·end가 있다', async () => {
    seed([pending()])
    await fill('#b83618', '#5c1a0c')
    const view = { original: item(I1).original as never, edited: item(I1).edited as never }
    expect(readOpsItemColorPending(view)).toBe(false)
    expect(readImageSpec(view)).toMatchObject({ bg: '#b83618', end: '#5c1a0c' })
  })

  it('결정 기록에 누가·어떤 쌍으로·전후 차이가 남는다(승인 쌍은 이름, 아니면 「직접 입력」)', async () => {
    seed([pending({ tribe_id: FOREST })])
    h.state.tables.tribes.push({ id: FOREST })
    await fill('#8a5a2e', '#2a1a0d')
    expect(decisions('fill_color')).toHaveLength(1)
    expect(decisions('fill_color')[0]).toMatchObject({
      bundle_id: B,
      item_id: I1,
      actor: 'admin-1',
      reason: '그루터기 살롱',
      diff: expect.arrayContaining([{ path: 'color_pending', before: 'true', after: 'false' }, { path: 'image_spec.bg', before: null, after: '#8a5a2e' }]),
    })

    seed([pending({ tribe_id: FOREST })])
    h.state.tables.tribes.push({ id: FOREST })
    await fill('#b83618', '#5c1a0c')
    expect(decisions('fill_color')[0].reason).toBe('직접 입력')
  })

  it('트라이브가 없는 카드는 공통 쌍 이름으로 남기고 슬랙 글 재료에도 쌍 이름을 싣는다', async () => {
    seed([pending()])
    const out = success(await fill('#037a49', '#052e1c'))
    expect(decisions('fill_color')[0].reason).toBe('주말 초록')
    expect(out.slack).toMatchObject({ action: 'fill_color', pairLabel: '주말 초록' })
  })

  it('검토중이 아니면 409이고 아무것도 바꾸지 않는다', async () => {
    seed([makeItem(I1, 0, { status: 'approved', original: makeOriginal({ color_pending: true }) })])
    const out = failure(await fill('#b83618', '#5c1a0c'))
    expect(out.status).toBe(409)
    expect(item(I1).edited).toBeNull()
    expect(decisions('fill_color')).toHaveLength(0)
  })

  it('형식이 틀린 색은 400이고 칸별 문장을 준다', async () => {
    seed([pending()])
    const out = failure(await fill('red', '#5c1a0c'))
    expect(out.status).toBe(400)
    expect(out.extra).toMatchObject({ fieldErrors: { bg: expect.any(String) } })
    expect(failure(await fill('#b83618', 5)).status).toBe(400)
    expect(item(I1).edited).toBeNull()
  })

  it('화면이 본 수정 시각이 어긋나면 409다', async () => {
    seed([pending()])
    expect(failure(await fill('#b83618', '#5c1a0c', { expectedUpdatedAt: '2026-09-01T00:00:00.000Z' })).status).toBe(409)
    expect(item(I1).edited).toBeNull()
  })

  it('이미 같은 값으로 채워져 있으면 바뀐 내용이 없어 400이다', async () => {
    seed([pending()])
    await fill('#b83618', '#5c1a0c')
    const again = failure(await fill('#b83618', '#5c1a0c', { expectedUpdatedAt: item(I1).updated_at }))
    expect(again.status).toBe(400)
    expect(decisions('fill_color')).toHaveLength(1)
  })

  it('다른 쌍을 다시 고르면 값만 바뀐다(색 대기는 이미 풀려 있다)', async () => {
    seed([pending()])
    await fill('#b83618', '#5c1a0c')
    const out = success(await fill('#158293', '#0a3d47', { expectedUpdatedAt: item(I1).updated_at }))
    expect(out.body).toMatchObject({ changed: ['image_spec.bg', 'image_spec.end', 'colors.bg', 'colors.end'] })
  })

  it('결정 기록 저장이 실패하면 항목을 원래대로 돌리고 500이다', async () => {
    seed([pending()])
    h.state.failOn.add('ops_decisions.insert')
    expect(failure(await fill('#b83618', '#5c1a0c')).status).toBe(500)
    expect(item(I1).edited).toBeNull()
  })

  it('수정 되돌리기는 색 채우기를 되돌리지 않는다', async () => {
    seed([pending()])
    await fill('#b83618', '#5c1a0c')
    expect(failure(await revertLastEdit(service, { bundleId: B, itemId: I1, actor: 'a' })).status).toBe(409)
  })
})

describe('결정 기록은 추가만 된다', () => {
  it('결정 처리 전 과정에서 결정 기록에는 insert와 slack_result update만 부른다', async () => {
    await approveItem(service, { bundleId: B, itemId: I1, actor: 'a' })
    await rejectItem(service, { bundleId: B, itemId: I2, actor: 'a', reason: '이유' })
    seed()
    await editItem(service, { bundleId: B, itemId: I1, actor: 'a', values: { 'copy.title': 'x' }, expectedUpdatedAt: T0 })
    await revertLastEdit(service, { bundleId: B, itemId: I1, actor: 'a' })
    const bulk = success(await bulkApprove(service, { bundleId: B, itemIds: [I1, I2], actor: 'a' }))
    h.state.postOpsSlack.mockResolvedValue({ ok: true })
    await notifyDecision(service, bulk)

    const onDecisions = h.state.calls.filter((call) => call.table === 'ops_decisions')
    const ops = new Set(onDecisions.map((call) => call.op))
    expect([...ops].sort()).toEqual(['insert', 'select', 'update'])
    for (const call of onDecisions.filter((c) => c.op === 'update')) {
      expect(Object.keys(call.payload as object)).toEqual(['slack_result'])
    }
  })
})

describe('알림(notifyDecision)', () => {
  it('결정 글을 올리고 그 결정 기록의 slack_result를 채운다', async () => {
    h.state.postOpsSlack.mockResolvedValue({ ok: true })
    const out = success(await approveItem(service, { bundleId: B, itemId: I1, actor: 'a' }))
    await notifyDecision(service, out)
    expect(h.state.postOpsSlack).toHaveBeenCalledWith('report', '[시험] 승인했어요 · 홈피드 카드 · 10/5(월) 09:00')
    expect(decisions('approve')[0].slack_result).toEqual({ channel: 'report', ok: true })
  })

  it('슬랙이 실패해도 던지지 않고 결정은 그대로이며 실패가 기록된다', async () => {
    h.state.postOpsSlack.mockResolvedValue({ ok: false, error: 'not_configured' })
    const out = success(await approveItem(service, { bundleId: B, itemId: I1, actor: 'a' }))
    await expect(notifyDecision(service, out)).resolves.toBeUndefined()
    expect(item(I1).status).toBe('approved')
    expect(decisions('approve')[0].slack_result).toEqual({ channel: 'report', ok: false, error: 'not_configured' })

    h.state.postOpsSlack.mockRejectedValue(new Error('network'))
    const again = success(await rejectItem(service, { bundleId: B, itemId: I2, actor: 'a', reason: '이유' }))
    await expect(notifyDecision(service, again)).resolves.toBeUndefined()
    expect(item(I2).status).toBe('rejected')
  })

  it('일괄 승인은 글 1건을 올리고 같은 batch_id의 모든 결정 기록에 결과를 채운다', async () => {
    h.state.postOpsSlack.mockResolvedValue({ ok: true })
    const out = success(await bulkApprove(service, { bundleId: B, itemIds: [I1], actor: 'a' }))
    await notifyDecision(service, out)
    expect(h.state.postOpsSlack).toHaveBeenCalledTimes(1)
    expect(h.state.postOpsSlack).toHaveBeenCalledWith('report', '[시험] 일괄 승인했어요 · 1개 승인, 1개 제외')
    expect(decisions('approve').every((row) => (row.slack_result as { ok: boolean }).ok)).toBe(true)
    const update = h.state.calls.filter((call) => call.table === 'ops_decisions' && call.op === 'update').at(-1)
    expect(update?.filters).toEqual([['batch_id', out.batchId]])
  })

  it('알릴 일이 없으면(글 재료 없음·결정 기록 없음) 아무것도 하지 않는다', async () => {
    await notifyDecision(service, { ok: true, body: {}, decisionIds: [], batchId: null, slack: null })
    expect(h.state.postOpsSlack).not.toHaveBeenCalled()
  })
})

describe('시험 묶음 지우기', () => {
  it('시험 묶음은 지워지고 항목·결정 기록이 함께 지워진다', async () => {
    const out = await deleteSampleBundle(service, B)
    expect(out.ok).toBe(true)
    expect(h.state.tables.ops_bundles.map((row) => row.id)).toEqual([OTHER_B])
    expect(h.state.tables.ops_bundle_items).toHaveLength(0)
    expect(h.state.tables.ops_decisions).toHaveLength(0)
  })

  it('시험이 아닌 묶음은 403이고 아무것도 지우지 않는다', async () => {
    h.state.tables.ops_bundle_items.push(makeItem(I4, 0, { bundle_id: OTHER_B }))
    const out = failure(await deleteSampleBundle(service, OTHER_B))
    expect(out).toMatchObject({ status: 403, error: '시험 묶음만 지울 수 있어요.' })
    expect(h.state.calls.some((call) => call.op === 'delete')).toBe(false)
    expect(h.state.tables.ops_bundles).toHaveLength(2)
    expect(h.state.tables.ops_bundle_items.some((row) => row.id === I4)).toBe(true)
  })

  it('없는 묶음은 404, 삭제 실패는 500이다', async () => {
    expect(failure(await deleteSampleBundle(service, '33333333-3333-4333-8333-333333333333')).status).toBe(404)
    h.state.failOn.add('ops_bundles.delete')
    const out = failure(await deleteSampleBundle(service, B))
    expect(out.status).toBe(500)
    expect(out.error).not.toContain('boom')
  })

  it('삭제 조건에 is_sample이 들어간다(조회와 삭제 사이에 바뀌어도 시험이 아니면 지우지 않는다)', async () => {
    await deleteSampleBundle(service, B)
    const del = h.state.calls.find((call) => call.op === 'delete')
    expect(del?.filters).toContainEqual(['is_sample', true])
  })
})
