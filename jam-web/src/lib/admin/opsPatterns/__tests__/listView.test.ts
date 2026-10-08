/**
 * 패턴 사전 목록 계산 (티켓 20261008_1400, 상위 20260930_1503 ⑨a)
 *
 * - 주소 값: `view`·`status`는 틀리면 기본값(patterns·all), 링크는 기본값을 쿼리에 넣지 않는다
 * - 표 줄: 사용 횟수는 `countOpsPatternUsage` 결과를 그대로 싣고, 못 읽은 재료는 0이 아니라 null이다
 * - 샘플 수: 배열이면 길이, 아니면 null(모름). 취향 신호는 그 패턴 것만 추정/확정으로 센다
 * - 개수·필터: 「전체」는 보관을 뺀 개수이고 번호 순서는 그대로다. 모르는 상태는 전체에만 든다
 */
import { describe, it, expect } from 'vitest'
import {
  buildPatternRows,
  countByStatus,
  filterPatternRows,
  parsePatternListParams,
  patternListHref,
  sampleCountOf,
} from '../listView'
import type { OpsPatternRecord, OpsTasteSignalRecord } from '../read'

function pattern(patternNo: string, overrides: Partial<OpsPatternRecord> = {}): OpsPatternRecord {
  return {
    patternNo,
    name: `${patternNo} 이름`,
    principle: '',
    userExperience: '',
    menus: [],
    samples: [],
    cardShapes: [],
    knobs: {},
    pitfalls: '',
    status: 'active',
    statusLabel: '사용 중',
    pauseReason: null,
    origin: 'seed',
    originItemId: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

function signal(id: string, patternNo: string | null, basis: 'estimate' | 'confirmed'): OpsTasteSignalRecord {
  return { id, patternNo, name: id, reason: '', basis, evidenceDecisionId: null, confirmedAt: null, sortOrder: 1 }
}

describe('parsePatternListParams / patternListHref', () => {
  it('없는 값·틀린 값은 기본값이다', () => {
    expect(parsePatternListParams({})).toEqual({ view: 'patterns', status: 'all' })
    expect(parsePatternListParams({ view: 'x', status: 'y' })).toEqual({ view: 'patterns', status: 'all' })
    expect(parsePatternListParams({ view: '', status: '' })).toEqual({ view: 'patterns', status: 'all' })
  })

  it('맞는 값은 그대로 읽는다', () => {
    expect(parsePatternListParams({ view: 'common' })).toEqual({ view: 'common', status: 'all' })
    for (const status of ['all', 'active', 'paused', 'archived'] as const) {
      expect(parsePatternListParams({ status }).status).toBe(status)
    }
  })

  it('링크는 기본값을 쿼리에 넣지 않는다', () => {
    expect(patternListHref()).toBe('/admin/ops-patterns')
    expect(patternListHref({ view: 'patterns', status: 'all' })).toBe('/admin/ops-patterns')
    expect(patternListHref({ view: 'common' })).toBe('/admin/ops-patterns?view=common')
    expect(patternListHref({ status: 'paused' })).toBe('/admin/ops-patterns?status=paused')
  })
})

describe('sampleCountOf', () => {
  it('배열이면 길이, 아니면 null(모름)이다', () => {
    expect(sampleCountOf([{}, {}, {}])).toBe(3)
    expect(sampleCountOf([])).toBe(0)
    for (const broken of [null, {}, 'x', 3, undefined]) expect(sampleCountOf(broken), String(broken)).toBeNull()
  })
})

describe('buildPatternRows', () => {
  const usage = new Map([
    ['P01', { uses: 2, lastUsedAt: '2026-10-01T00:00:00.000Z' }],
    ['P14', { uses: 0, lastUsedAt: null }],
  ])
  const signals = [
    signal('a', 'P01', 'estimate'),
    signal('b', 'P01', 'confirmed'),
    signal('c', 'P01', 'estimate'),
    signal('d', null, 'estimate'),
    signal('e', 'P02', 'confirmed'),
  ]

  it('사용 횟수·마지막 사용·샘플 수·취향 신호를 줄에 싣는다(공통 신호는 어느 줄에도 세지 않는다)', () => {
    const rows = buildPatternRows(
      [pattern('P01', { samples: [{}, {}] }), pattern('P14', { status: 'paused', pauseReason: '필요한 기능 대기', samples: 'broken' as never })],
      usage,
      signals
    )
    expect(rows[0]).toMatchObject({ patternNo: 'P01', uses: 2, lastUsedAt: '2026-10-01T00:00:00.000Z', sampleCount: 2, estimateCount: 2, confirmedCount: 1 })
    expect(rows[1]).toMatchObject({
      patternNo: 'P14',
      status: 'paused',
      pauseReason: '필요한 기능 대기',
      uses: 0,
      lastUsedAt: null,
      sampleCount: null,
      estimateCount: 0,
      confirmedCount: 0,
    })
  })

  it('사용 기록 맵에 번호가 없으면 0회·쓴 적 없음이다', () => {
    const [row] = buildPatternRows([pattern('P09')], usage, signals)
    expect(row).toMatchObject({ uses: 0, lastUsedAt: null })
  })

  it('사용 기록을 못 읽었으면 0이 아니라 null이다', () => {
    const [row] = buildPatternRows([pattern('P01')], null, signals)
    expect(row).toMatchObject({ uses: null, lastUsedAt: null, estimateCount: 2 })
  })

  it('취향 신호를 못 읽었으면 개수가 0이 아니라 null이다', () => {
    const [row] = buildPatternRows([pattern('P01')], usage, null)
    expect(row).toMatchObject({ uses: 2, estimateCount: null, confirmedCount: null })
  })

  it('입력 순서(번호의 숫자 순서)를 바꾸지 않는다', () => {
    const rows = buildPatternRows([pattern('P09'), pattern('P10'), pattern('P100')], usage, [])
    expect(rows.map((row) => row.patternNo)).toEqual(['P09', 'P10', 'P100'])
  })
})

describe('countByStatus / filterPatternRows', () => {
  const rows = [
    { patternNo: 'P01', status: 'active' },
    { patternNo: 'P02', status: 'active' },
    { patternNo: 'P03', status: 'paused' },
    { patternNo: 'P04', status: 'archived' },
    { patternNo: 'P05', status: 'weird' },
  ]

  it('전체는 보관을 뺀 개수이고, 모르는 상태는 전체에만 든다', () => {
    expect(countByStatus(rows)).toEqual({ all: 4, active: 2, paused: 1, archived: 1 })
    expect(countByStatus([])).toEqual({ all: 0, active: 0, paused: 0, archived: 0 })
  })

  it('전체 필터는 보관을 빼고, 나머지는 그 상태만 보이며 순서는 그대로다', () => {
    expect(filterPatternRows(rows, 'all').map((row) => row.patternNo)).toEqual(['P01', 'P02', 'P03', 'P05'])
    expect(filterPatternRows(rows, 'active').map((row) => row.patternNo)).toEqual(['P01', 'P02'])
    expect(filterPatternRows(rows, 'paused').map((row) => row.patternNo)).toEqual(['P03'])
    expect(filterPatternRows(rows, 'archived').map((row) => row.patternNo)).toEqual(['P04'])
  })
})
