/**
 * 트렌드 레이더 읽기 (티켓 20261026_2033 2회차)
 *
 * 서비스 클라이언트는 메모리 안의 가짜다. 지키는 것:
 * - 시험 포함이 꺼져 있으면 시험 묶음을 읽지 않는다(쿼리에 `is_sample = false`가 걸린다)
 * - 최근 14일 안의 묶음만, 트렌드가 있는 묶음만 읽고 항목을 묶음별로 붙인다
 * - 묶음이 없으면 항목을 읽지 않는다
 * - 읽기 실패는 던진다
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/opsTrends/__tests__/radarLoad.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { loadTrendRadarInput } from '../radarLoad'

type Row = Record<string, unknown>

const state: { bundles: Row[]; items: Row[]; failTable: string | null; reads: string[] } = {
  bundles: [],
  items: [],
  failTable: null,
  reads: [],
}

const NOW = new Date('2026-10-27T03:00:00Z')

function fakeService() {
  const make = (table: 'ops_bundles' | 'ops_bundle_items') => {
    const filters: Array<(r: Row) => boolean> = []
    let sortKey: string | null = null
    let ascending = true
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (col: string, value: unknown) => {
        filters.push((r) => r[col] === value)
        return builder
      },
      gte: (col: string, value: string) => {
        filters.push((r) => Date.parse(String(r[col])) >= Date.parse(value))
        return builder
      },
      not: (col: string, op: string, value: unknown) => {
        if (op === 'is' && value === null) filters.push((r) => r[col] !== null && r[col] !== undefined)
        return builder
      },
      in: (col: string, values: unknown[]) => {
        filters.push((r) => values.includes(r[col]))
        return builder
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        sortKey = col
        ascending = opts?.ascending !== false
        return builder
      },
      limit: () => builder,
      then: (resolve: (value: unknown) => void) => {
        state.reads.push(table)
        if (state.failTable === table) return resolve({ data: null, error: { message: 'boom secret' } })
        let matched = (table === 'ops_bundles' ? state.bundles : state.items).filter((r) => filters.every((f) => f(r)))
        if (sortKey) {
          const key = sortKey
          matched = [...matched].sort((a, b) => {
            const av = String(a[key])
            const bv = String(b[key])
            return (av < bv ? -1 : av > bv ? 1 : 0) * (ascending ? 1 : -1)
          })
        }
        return resolve({ data: matched, error: null })
      },
    }
    return builder
  }
  return { from: (table: 'ops_bundles' | 'ops_bundle_items') => make(table) } as never
}

function bundleRow(id: string, overrides: Row = {}): Row {
  return {
    id,
    week: '2026-W44',
    title: `기획 ${id}`,
    received_at: '2026-10-25T00:00:00Z',
    trends: [{ label: '러닝', source_ids: [1], summary: '요약', outcome: 'used' }],
    is_sample: false,
    ...overrides,
  }
}

function itemRow(id: string, bundleId: string): Row {
  return { id, bundle_id: bundleId, status: 'reviewing', original: { rationale: [] }, edited: null }
}

beforeEach(() => {
  state.bundles = []
  state.items = []
  state.failTable = null
  state.reads = []
})

describe('loadTrendRadarInput', () => {
  it('시험 포함이 꺼져 있으면 시험 묶음을 읽지 않고 그 항목도 읽지 않는다', async () => {
    state.bundles = [bundleRow('real'), bundleRow('sample', { is_sample: true })]
    state.items = [itemRow('i1', 'real'), itemRow('i2', 'sample')]
    const result = await loadTrendRadarInput(fakeService(), { now: NOW, includeSample: false })
    expect(result.map((bundle) => bundle.id)).toEqual(['real'])
    expect(result[0].items.map((item) => item.id)).toEqual(['i1'])
  })

  it('시험 포함이 켜져 있으면 시험 묶음도 읽고 isSample을 싣는다', async () => {
    state.bundles = [bundleRow('real'), bundleRow('sample', { is_sample: true, received_at: '2026-10-26T00:00:00Z' })]
    const result = await loadTrendRadarInput(fakeService(), { now: NOW, includeSample: true })
    expect(result.map((bundle) => [bundle.id, bundle.isSample])).toEqual([
      ['sample', true],
      ['real', false],
    ])
  })

  it('14일 밖에 받은 묶음과 트렌드가 없는 묶음은 읽지 않는다', async () => {
    state.bundles = [
      bundleRow('old', { received_at: '2026-10-01T00:00:00Z' }),
      bundleRow('no-trends', { trends: null }),
      bundleRow('ok'),
    ]
    const result = await loadTrendRadarInput(fakeService(), { now: NOW, includeSample: false })
    expect(result.map((bundle) => bundle.id)).toEqual(['ok'])
  })

  it('읽을 묶음이 없으면 항목 표는 읽지 않는다', async () => {
    const result = await loadTrendRadarInput(fakeService(), { now: NOW, includeSample: false })
    expect(result).toEqual([])
    expect(state.reads).toEqual(['ops_bundles'])
  })

  it('묶음 읽기 실패는 던진다', async () => {
    state.failTable = 'ops_bundles'
    await expect(loadTrendRadarInput(fakeService(), { now: NOW, includeSample: false })).rejects.toThrow('트렌드 레이더 묶음 조회 실패')
  })

  it('항목 읽기 실패도 던진다', async () => {
    state.bundles = [bundleRow('real')]
    state.failTable = 'ops_bundle_items'
    await expect(loadTrendRadarInput(fakeService(), { now: NOW, includeSample: false })).rejects.toThrow('트렌드 레이더 항목 조회 실패')
  })
})
