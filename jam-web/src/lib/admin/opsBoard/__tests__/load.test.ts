/**
 * 운영 상황판 서버 읽기 (티켓 20261026_2023 1회차)
 *
 * 서비스 클라이언트는 메모리 안의 가짜 DB로 바꾼다(실 DB에 접속하지 않는다). 지키는 것:
 * - 최근 6주 안에 받은 묶음·시작 기록만 읽고, 시험 묶음은 includeSample일 때만 읽는다
 * - 읽기(select)만 부르고 쓰기는 부르지 않는다. 묶음 제출 원본(`raw`)은 읽지 않는다
 * - 출처 하나가 실패하면 던지지 않고 `sourceErrors`에 이름이 담긴다
 * - 1000행을 넘어도 끝까지 받는다
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  type Result = { data: unknown; error: { message: string } | null }

  const state = {
    tables: { ops_bundles: [], ops_bundle_items: [], ops_routine_starts: [] } as Record<string, Row[]>,
    errors: {} as Record<string, string>,
    throws: {} as Record<string, boolean>,
    calls: [] as string[],
    selects: [] as Array<{ table: string; columns: string }>,
  }

  class Query implements PromiseLike<Result> {
    private filters: Array<(row: Row) => boolean> = []
    private orders: Array<{ col: string; asc: boolean }> = []
    private window: [number, number] | null = null

    constructor(private table: string) {}

    private note(method: string) {
      state.calls.push(`${this.table}.${method}`)
    }
    select(columns: string) {
      this.note('select')
      state.selects.push({ table: this.table, columns })
      return this
    }
    gte(col: string, val: string) {
      this.note('gte')
      this.filters.push((row) => Date.parse(String(row[col])) >= Date.parse(val))
      return this
    }
    eq(col: string, val: unknown) {
      this.note('eq')
      this.filters.push((row) => row[col] === val)
      return this
    }
    in(col: string, vals: unknown[]) {
      this.note('in')
      this.filters.push((row) => vals.includes(row[col]))
      return this
    }
    order(col: string, opts?: { ascending?: boolean }) {
      this.note('order')
      this.orders.push({ col, asc: opts?.ascending !== false })
      return this
    }
    range(from: number, to: number) {
      this.note('range')
      this.window = [from, to]
      return this
    }
    insert() {
      this.note('insert')
      return this
    }
    update() {
      this.note('update')
      return this
    }
    upsert() {
      this.note('upsert')
      return this
    }
    delete() {
      this.note('delete')
      return this
    }
    then<T1 = Result, T2 = never>(
      onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
    ): PromiseLike<T1 | T2> {
      if (state.throws[this.table]) return Promise.reject(new Error('network')).then(onfulfilled, onrejected)
      return Promise.resolve(this.run()).then(onfulfilled, onrejected)
    }

    private run(): Result {
      const message = state.errors[this.table]
      if (message) return { data: null, error: { message } }
      let rows = state.tables[this.table].filter((row) => this.filters.every((f) => f(row)))
      for (const { col, asc } of [...this.orders].reverse()) {
        rows = [...rows].sort((a, b) => {
          const x = String(a[col])
          const y = String(b[col])
          const cmp = x < y ? -1 : x > y ? 1 : 0
          return asc ? cmp : -cmp
        })
      }
      if (this.window) rows = rows.slice(this.window[0], this.window[1] + 1)
      return { data: rows, error: null }
    }
  }

  return { state, Query }
})

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: (table: string) => new h.Query(table) }),
}))

import { loadWeekFlowInputs } from '@/lib/admin/opsBoard/load'

// 기준: 2026-10-28(수) → 이번 주 월요일 10-26, 6주 전 경계는 09-21 0시 KST.
const NOW = new Date('2026-10-28T12:00:00+09:00')

function bundleRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    week: '2026-W44',
    is_sample: false,
    received_at: '2026-10-26T10:00:00+09:00',
    title: `제목 ${id}`,
    routine_run: { stages: [{ agent: '윤진', stage: 'plan', out_count: 12 }] },
    raw: { big: 'x' },
    ...overrides,
  }
}

function itemRow(id: string, bundleId: string, overrides: Record<string, unknown> = {}) {
  return { id, bundle_id: bundleId, status: 'arrived', kind: 'home_feed_card', original: {}, edited: null, ...overrides }
}

function startRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    run_key: `run-${id}`,
    week: '2026-W44',
    author: '윤진',
    agents: ['윤진', 7, '윈터'],
    started_at: '2026-10-28T09:00:00+09:00',
    bundle_id: null,
    ...overrides,
  }
}

beforeEach(() => {
  h.state.tables = { ops_bundles: [], ops_bundle_items: [], ops_routine_starts: [] }
  h.state.errors = {}
  h.state.throws = {}
  h.state.calls = []
  h.state.selects = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('loadWeekFlowInputs', () => {
  it('묶음·항목·시작 기록을 입력 모양으로 풀어 돌려준다', async () => {
    h.state.tables.ops_bundles = [bundleRow('b1')]
    h.state.tables.ops_bundle_items = [
      itemRow('i1', 'b1', { original: { rationale: [{ kind: 'trend', label: 'LP 리바이벌' }] } }),
      itemRow('i2', 'b1', { status: 'failed', original: { rationale: [{ kind: 'season', label: '억새' }] }, edited: { rationale: [{ kind: 'weather', label: '맑음' }] } }),
    ]
    h.state.tables.ops_routine_starts = [startRow('s1')]

    const result = await loadWeekFlowInputs({ includeSample: false, now: NOW })

    expect(result.sourceErrors).toEqual([])
    expect(result.bundles).toHaveLength(1)
    expect(result.bundles[0]).toMatchObject({ id: 'b1', week: '2026-W44', isSample: false, title: '제목 b1' })
    expect(result.bundles[0].stages).toHaveLength(1)
    expect(result.bundles[0].stages[0]).toMatchObject({ stage: 'plan', outCount: 12 })
    expect(result.bundles[0].items.map((i) => i.id)).toEqual(['i1', 'i2'])
    expect(result.bundles[0].items[0].rationales[0]).toMatchObject({ kind: 'trend', label: 'LP 리바이벌' })
    // 수정본이 있으면 수정본에서 이유를 읽는다.
    expect(result.bundles[0].items[1].rationales[0]).toMatchObject({ kind: 'weather' })
    expect(result.starts).toEqual([
      { id: 's1', runKey: 'run-s1', week: '2026-W44', author: '윤진', agents: ['윤진', '윈터'], startedAt: '2026-10-28T09:00:00+09:00', bundleId: null },
    ])
  })

  it('최근 6주 밖에서 받은 묶음·시작 기록은 읽지 않는다', async () => {
    h.state.tables.ops_bundles = [bundleRow('recent'), bundleRow('old', { received_at: '2026-09-20T23:00:00+09:00' })]
    h.state.tables.ops_routine_starts = [startRow('recent'), startRow('old', { started_at: '2026-09-20T23:00:00+09:00' })]
    const result = await loadWeekFlowInputs({ includeSample: false, now: NOW })
    expect(result.bundles.map((b) => b.id)).toEqual(['recent'])
    expect(result.starts.map((s) => s.id)).toEqual(['recent'])
  })

  it('시험 묶음은 includeSample일 때만 읽는다', async () => {
    h.state.tables.ops_bundles = [bundleRow('real'), bundleRow('sample', { is_sample: true })]
    const without = await loadWeekFlowInputs({ includeSample: false, now: NOW })
    const withSample = await loadWeekFlowInputs({ includeSample: true, now: NOW })
    expect(without.bundles.map((b) => b.id)).toEqual(['real'])
    expect(withSample.bundles.map((b) => b.id).sort()).toEqual(['real', 'sample'])
  })

  it('select만 부르고 쓰기는 부르지 않으며 제출 원본(raw)은 읽지 않는다', async () => {
    h.state.tables.ops_bundles = [bundleRow('b1')]
    await loadWeekFlowInputs({ includeSample: false, now: NOW })
    expect(h.state.calls.filter((c) => /\.(insert|update|upsert|delete)$/.test(c))).toEqual([])
    expect(h.state.calls).toContain('ops_bundles.select')
    for (const { columns } of h.state.selects) expect(columns).not.toMatch(/\braw\b/)
  })

  it('묶음 읽기가 실패하면 던지지 않고 sourceErrors에 bundles가 담긴다', async () => {
    h.state.tables.ops_routine_starts = [startRow('s1')]
    h.state.errors.ops_bundles = 'boom'
    const result = await loadWeekFlowInputs({ includeSample: false, now: NOW })
    expect(result.sourceErrors).toEqual(['bundles'])
    expect(result.bundles).toEqual([])
    expect(result.starts).toHaveLength(1)
  })

  it('항목 읽기가 실패하면 sourceErrors에 items가 담기고 묶음은 항목 없이 돌아온다', async () => {
    h.state.tables.ops_bundles = [bundleRow('b1')]
    h.state.errors.ops_bundle_items = 'boom'
    const result = await loadWeekFlowInputs({ includeSample: false, now: NOW })
    expect(result.sourceErrors).toEqual(['items'])
    expect(result.bundles).toHaveLength(1)
    expect(result.bundles[0].items).toEqual([])
  })

  it('시작 기록 읽기가 실패하면 sourceErrors에 routine_starts가 담기고 묶음은 그대로다', async () => {
    h.state.tables.ops_bundles = [bundleRow('b1')]
    h.state.errors.ops_routine_starts = 'boom'
    const result = await loadWeekFlowInputs({ includeSample: false, now: NOW })
    expect(result.sourceErrors).toEqual(['routine_starts'])
    expect(result.bundles).toHaveLength(1)
    expect(result.starts).toEqual([])
  })

  it('조회가 예외를 던져도 던지지 않고 이름만 담는다', async () => {
    h.state.throws.ops_routine_starts = true
    const result = await loadWeekFlowInputs({ includeSample: false, now: NOW })
    expect(result.sourceErrors).toEqual(['routine_starts'])
  })

  it('모든 출처가 실패해도 던지지 않는다', async () => {
    h.state.errors = { ops_bundles: 'a', ops_routine_starts: 'c' }
    const result = await loadWeekFlowInputs({ includeSample: false, now: NOW })
    expect(result.sourceErrors).toEqual(['bundles', 'routine_starts'])
    expect(result.bundles).toEqual([])
    expect(result.starts).toEqual([])
  })

  it('1000행을 넘는 항목도 끝까지 받는다', async () => {
    h.state.tables.ops_bundles = [bundleRow('b1')]
    h.state.tables.ops_bundle_items = Array.from({ length: 1500 }, (_, i) => itemRow(`i${String(i).padStart(5, '0')}`, 'b1'))
    const result = await loadWeekFlowInputs({ includeSample: false, now: NOW })
    expect(result.bundles[0].items).toHaveLength(1500)
  })
})
