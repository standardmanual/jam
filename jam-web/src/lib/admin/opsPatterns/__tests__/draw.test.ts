/**
 * 조합 뽑기 (티켓 20261007_2221, 상위 20260930_1503 ④, 운영툴 PRD §11.14)
 *
 * - `parseDrawLimit`: 기본 5, 1~50 정수만 받는다
 * - `usageTimeOf`·`rankOpsDraw`(순수 함수): 승인 이후 상태만 센다·시험 묶음과 `pattern_proposal`은 세지 않는다, 기간 경계(포함)와 앞날 예약,
 *   `lastUsedAt`은 기간과 무관한 최댓값, 정렬(횟수 → 오래된 순, 한 번도 안 쓴 것이 맨 앞 → 마지막 키)·자르기·재현성, 대상 목록(사용 중 패턴·활성
 *   트라이브·제외하지 않은 카테고리), 칸 읽기(수정본 우선·형식이 틀린 값·겹친 slug)
 * - `countOpsPatternUsage`(S5와 같이 쓰는 세기, 티켓 20261008_1400): 쉬는 중·보관 번호도 센다, 시험·승인 전·`pattern_proposal`·사용 시각 없음은 안 센다, `rankOpsDraw`와 같은 값
 * - 읽기 함수: select 칸(관리자 ID·제출 원본이 없다)과 조건(시험 제외·승인 이후 상태·활성 트라이브), 1000행 넘게 읽기, 조회 실패는 던진다
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  OPS_DRAW_DEFAULT_LIMIT,
  OPS_DRAW_LIMIT_INVALID_MESSAGE,
  OPS_DRAW_MAX_LIMIT,
  OPS_DRAW_USAGE_COLUMNS,
  OPS_DRAW_TRIBE_COLUMNS,
  OPS_DRAW_WINDOW_DAYS,
  countOpsPatternUsage,
  drawOpsCombination,
  loadDrawTribes,
  loadDrawUsageRows,
  parseDrawLimit,
  rankOpsDraw,
  usageTimeOf,
  type OpsDrawTribe,
  type OpsDrawUsageRow,
  type RankOpsDrawInput,
} from '../draw'
import type { createServiceClient } from '@/lib/supabase/server'

type ServiceClient = ReturnType<typeof createServiceClient>

const NOW = new Date('2026-10-07T03:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000
const SINCE_MS = NOW.getTime() - 28 * DAY_MS
const SINCE_ISO = '2026-09-09T03:00:00.000Z'

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
}

interface RowOptions {
  patternNo?: unknown
  tribeId?: unknown
  categories?: unknown
  status?: string
  kind?: string | null
  startsAt?: string | null
  receivedAt?: string
  sample?: boolean
  edited?: Record<string, unknown> | null
}

/** 4주 안(2026-10-01)에 승인된 홈피드 카드 한 건. 옵션으로 칸을 바꾼다. */
function row(n: number, options: RowOptions = {}): OpsDrawUsageRow {
  const original: Record<string, unknown> = {}
  if (options.patternNo !== undefined) original.pattern_no = options.patternNo
  if (options.tribeId !== undefined) original.tribe_id = options.tribeId
  if (options.categories !== undefined) original.knobs = { place_category: options.categories }
  return {
    id: uuid(n),
    kind: options.kind === undefined ? 'home_feed_card' : options.kind,
    status: options.status ?? 'approved',
    starts_at: options.startsAt === undefined ? '2026-10-01T00:00:00.000Z' : options.startsAt,
    original: original as OpsDrawUsageRow['original'],
    edited: (options.edited ?? null) as OpsDrawUsageRow['edited'],
    ops_bundles: { is_sample: options.sample ?? false, received_at: options.receivedAt ?? '2026-09-30T00:00:00.000Z' },
  }
}

const PATTERNS = [
  { patternNo: 'P01', name: '첫째', status: 'active' as const },
  { patternNo: 'P02', name: '둘째', status: 'active' as const },
  { patternNo: 'P03', name: '셋째', status: 'active' as const },
]
const TRIBE_A: OpsDrawTribe = { id: uuid(901), name: '트라이브 A', sort_order: 1 }
const TRIBE_B: OpsDrawTribe = { id: uuid(902), name: '트라이브 B', sort_order: 2 }
const TRIBE_C: OpsDrawTribe = { id: uuid(903), name: '트라이브 C', sort_order: 3 }
const TRIBES = [TRIBE_A, TRIBE_B, TRIBE_C]
const CATEGORIES = ['cafe', 'park', 'museum', 'delete', 'unassigned']

function rank(overrides: Partial<RankOpsDrawInput> = {}) {
  return rankOpsDraw({ rows: [], patterns: PATTERNS, tribes: TRIBES, placeCategories: CATEGORIES, now: NOW, limit: 50, ...overrides })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parseDrawLimit', () => {
  it('안 주면 5다(빈 값도 안 준 것으로 본다)', () => {
    expect(parseDrawLimit(new URLSearchParams(''))).toEqual({ ok: true, limit: OPS_DRAW_DEFAULT_LIMIT })
    expect(parseDrawLimit(new URLSearchParams('limit='))).toEqual({ ok: true, limit: 5 })
    expect(OPS_DRAW_DEFAULT_LIMIT).toBe(5)
  })

  it('1~50 정수를 받는다', () => {
    for (const [raw, limit] of [['1', 1], ['5', 5], ['50', 50], ['07', 7]] as const) {
      expect(parseDrawLimit(new URLSearchParams({ limit: raw }))).toEqual({ ok: true, limit })
    }
    expect(OPS_DRAW_MAX_LIMIT).toBe(50)
  })

  it('0·51·abc·2.5·음수·지수·공백은 오류다', () => {
    for (const raw of ['0', '51', 'abc', '2.5', '-1', '1e1', ' 5', '5 ', '+5', '99999999999999999999']) {
      expect(parseDrawLimit(new URLSearchParams({ limit: raw })), raw).toEqual({ ok: false, error: OPS_DRAW_LIMIT_INVALID_MESSAGE })
    }
  })
})

describe('usageTimeOf', () => {
  it('공개 시각이 있으면 그것을 쓴다', () => {
    expect(usageTimeOf(row(1, { startsAt: '2026-10-02T00:00:00.000Z' }))).toBe(Date.parse('2026-10-02T00:00:00.000Z'))
  })

  it('공개 시각이 없으면 묶음의 받은 시각을 쓴다(묶음이 배열로 와도 첫 칸)', () => {
    expect(usageTimeOf(row(1, { startsAt: null, receivedAt: '2026-09-30T00:00:00.000Z' }))).toBe(Date.parse('2026-09-30T00:00:00.000Z'))
    expect(usageTimeOf({ starts_at: null, ops_bundles: [{ is_sample: false, received_at: '2026-09-29T00:00:00.000Z' }] })).toBe(Date.parse('2026-09-29T00:00:00.000Z'))
  })

  it('읽을 수 없는 공개 시각은 받은 시각으로 넘어가고, 둘 다 읽을 수 없으면 null이다', () => {
    expect(usageTimeOf(row(1, { startsAt: 'not-a-date', receivedAt: '2026-09-30T00:00:00.000Z' }))).toBe(Date.parse('2026-09-30T00:00:00.000Z'))
    expect(usageTimeOf(row(1, { startsAt: null, receivedAt: 'garbage' }))).toBeNull()
    expect(usageTimeOf({ starts_at: null, ops_bundles: null })).toBeNull()
  })
})

describe('rankOpsDraw — 무엇을 세는가', () => {
  it('승인됨·준비중·예약됨·게재중·종료만 센다', () => {
    const counted = ['approved', 'preparing', 'scheduled', 'live', 'ended']
    const skipped = ['arrived', 'reviewing', 'rejected', 'cancelled', 'failed']
    const rows = [
      ...counted.map((status, i) => row(i + 1, { patternNo: 'P01', status })),
      ...skipped.map((status, i) => row(i + 20, { patternNo: 'P02', status })),
    ]
    const result = rank({ rows })
    expect(result.patterns.find((p) => p.patternNo === 'P01')?.uses).toBe(5)
    expect(result.patterns.find((p) => p.patternNo === 'P02')).toMatchObject({ uses: 0, lastUsedAt: null })
    expect(result.countedItems).toBe(5)
  })

  it('시험 묶음은 세지 않는다(조인 필터가 빠져도 한 번 더 거른다)', () => {
    const result = rank({ rows: [row(1, { patternNo: 'P01', sample: true }), row(2, { patternNo: 'P01' })] })
    expect(result.patterns.find((p) => p.patternNo === 'P01')?.uses).toBe(1)
    expect(result.countedItems).toBe(1)
  })

  it('묶음을 못 읽은 행은 세지 않는다', () => {
    const orphan = { ...row(1, { patternNo: 'P01' }), ops_bundles: null }
    expect(rank({ rows: [orphan] }).countedItems).toBe(0)
  })

  it('pattern_proposal 종류는 세지 않는다', () => {
    const result = rank({ rows: [row(1, { patternNo: 'P01', kind: 'pattern_proposal' }), row(2, { patternNo: 'P01', kind: 'mission' }), row(3, { patternNo: 'P01', kind: null })] })
    expect(result.patterns.find((p) => p.patternNo === 'P01')?.uses).toBe(2)
  })

  it('항목 1건은 1회다. 패턴·트라이브·카테고리를 한 항목이 함께 센다', () => {
    const result = rank({ rows: [row(1, { patternNo: 'P01', tribeId: TRIBE_A.id, categories: ['cafe', 'park'] })] })
    expect(result.patterns.find((p) => p.patternNo === 'P01')?.uses).toBe(1)
    expect(result.tribes.find((t) => t.tribeId === TRIBE_A.id)?.uses).toBe(1)
    expect(result.placeCategories.find((c) => c.slug === 'cafe')?.uses).toBe(1)
    expect(result.placeCategories.find((c) => c.slug === 'park')?.uses).toBe(1)
    expect(result.countedItems).toBe(1)
  })
})

describe('rankOpsDraw — 기간과 마지막 사용', () => {
  it('기준 시각 − 28일과 같은 시각은 센다', () => {
    const result = rank({ rows: [row(1, { patternNo: 'P01', startsAt: SINCE_ISO })] })
    expect(result.since).toBe(SINCE_ISO)
    expect(result.patterns.find((p) => p.patternNo === 'P01')).toMatchObject({ uses: 1, lastUsedAt: SINCE_ISO })
  })

  it('기간보다 1ms 앞이면 uses에서 빠지고 lastUsedAt에만 반영된다', () => {
    const before = new Date(SINCE_MS - 1).toISOString()
    const result = rank({ rows: [row(1, { patternNo: 'P01', tribeId: TRIBE_A.id, categories: ['cafe'], startsAt: before })] })
    expect(result.patterns.find((p) => p.patternNo === 'P01')).toMatchObject({ uses: 0, lastUsedAt: before })
    expect(result.tribes.find((t) => t.tribeId === TRIBE_A.id)).toMatchObject({ uses: 0, lastUsedAt: before })
    expect(result.placeCategories.find((c) => c.slug === 'cafe')).toMatchObject({ uses: 0, lastUsedAt: before })
    expect(result.countedItems).toBe(0)
  })

  it('앞날로 예약된 항목도 센다', () => {
    const future = '2026-10-20T00:00:00.000Z'
    const result = rank({ rows: [row(1, { patternNo: 'P01', status: 'scheduled', startsAt: future })] })
    expect(result.patterns.find((p) => p.patternNo === 'P01')).toMatchObject({ uses: 1, lastUsedAt: future })
  })

  it('lastUsedAt은 기간 안팎을 합친 최댓값이다', () => {
    const old = new Date(SINCE_MS - 10 * DAY_MS).toISOString()
    const recent = '2026-10-03T00:00:00.000Z'
    const result = rank({ rows: [row(1, { patternNo: 'P01', startsAt: old }), row(2, { patternNo: 'P01', startsAt: recent }), row(3, { patternNo: 'P01', startsAt: old })] })
    expect(result.patterns.find((p) => p.patternNo === 'P01')).toMatchObject({ uses: 1, lastUsedAt: recent })
  })

  it('공개 시각이 없는 항목은 묶음의 받은 시각으로 센다', () => {
    const inside = row(1, { patternNo: 'P01', startsAt: null, receivedAt: '2026-10-02T00:00:00.000Z' })
    const outside = row(2, { patternNo: 'P02', startsAt: null, receivedAt: '2026-08-01T00:00:00.000Z' })
    const result = rank({ rows: [inside, outside] })
    expect(result.patterns.find((p) => p.patternNo === 'P01')).toMatchObject({ uses: 1, lastUsedAt: '2026-10-02T00:00:00.000Z' })
    expect(result.patterns.find((p) => p.patternNo === 'P02')).toMatchObject({ uses: 0, lastUsedAt: '2026-08-01T00:00:00.000Z' })
  })

  it('사용 시각을 읽을 수 없는 항목은 세지 않는다', () => {
    const result = rank({ rows: [row(1, { patternNo: 'P01', startsAt: null, receivedAt: 'garbage' })] })
    expect(result.patterns.find((p) => p.patternNo === 'P01')?.uses).toBe(0)
    expect(result.countedItems).toBe(0)
  })

  it('응답 머리: 기준 시각·기간 시작·기간 일수·limit', () => {
    const result = rank({ limit: 3 })
    expect(result).toMatchObject({ now: NOW.toISOString(), since: SINCE_ISO, windowDays: OPS_DRAW_WINDOW_DAYS, limit: 3, countedItems: 0 })
    expect(OPS_DRAW_WINDOW_DAYS).toBe(28)
  })
})

describe('rankOpsDraw — 정렬과 자르기', () => {
  it('uses가 적은 쪽이 먼저다', () => {
    const rows = [row(1, { patternNo: 'P01' }), row(2, { patternNo: 'P01' }), row(3, { patternNo: 'P02' })]
    expect(rank({ rows }).patterns.map((p) => [p.patternNo, p.uses])).toEqual([['P03', 0], ['P02', 1], ['P01', 2]])
  })

  it('같은 횟수에서는 한 번도 안 쓴 것이 맨 앞이고 그다음 마지막 사용이 오래된 쪽이다', () => {
    const old = new Date(SINCE_MS - 60 * DAY_MS).toISOString()
    const older = new Date(SINCE_MS - 90 * DAY_MS).toISOString()
    const rows = [row(1, { patternNo: 'P01', startsAt: old }), row(2, { patternNo: 'P02', startsAt: older })]
    // 모두 기간 밖이라 uses 0. P03은 한 번도 안 썼다.
    expect(rank({ rows }).patterns.map((p) => [p.patternNo, p.lastUsedAt])).toEqual([['P03', null], ['P02', older], ['P01', old]])
  })

  it('횟수가 같고 마지막 사용도 같으면 패턴은 번호의 숫자 순서다(P100은 P20 뒤)', () => {
    const patterns = ['P100', 'P20', 'P09', 'P10'].map((patternNo) => ({ patternNo, name: patternNo, status: 'active' as const }))
    expect(rank({ patterns }).patterns.map((p) => p.patternNo)).toEqual(['P09', 'P10', 'P20', 'P100'])
  })

  it('트라이브는 sort_order 다음 id 순이다', () => {
    const tribes: OpsDrawTribe[] = [
      { id: uuid(5), name: 'e', sort_order: 2 },
      { id: uuid(3), name: 'c', sort_order: 1 },
      { id: uuid(4), name: 'd', sort_order: 1 },
      { id: uuid(1), name: 'a', sort_order: 3 },
    ]
    expect(rank({ tribes }).tribes.map((t) => t.tribeId)).toEqual([uuid(3), uuid(4), uuid(5), uuid(1)])
  })

  it('카테고리는 같은 횟수에서 slug 문자 코드 순이다', () => {
    expect(rank({ placeCategories: ['park', 'Zoo', 'cafe', 'bar'] }).placeCategories.map((c) => c.slug)).toEqual(['Zoo', 'bar', 'cafe', 'park'])
  })

  it('세 목록을 따로 limit개로 자른다', () => {
    const result = rank({ limit: 2 })
    expect(result.patterns).toHaveLength(2)
    expect(result.tribes).toHaveLength(2)
    expect(result.placeCategories).toHaveLength(2)
    expect(result.limit).toBe(2)
  })

  it('목록이 limit보다 짧으면 있는 만큼만 싣는다', () => {
    const result = rank({ limit: 50, patterns: [PATTERNS[0]], tribes: [], placeCategories: [] })
    expect(result.patterns).toHaveLength(1)
    expect(result.tribes).toEqual([])
    expect(result.placeCategories).toEqual([])
  })

  it('응답 한 줄의 칸', () => {
    const result = rank({ rows: [row(1, { patternNo: 'P01', tribeId: TRIBE_A.id, categories: ['cafe'] })] })
    expect(result.patterns[0]).toEqual({ patternNo: 'P02', name: '둘째', uses: 0, lastUsedAt: null })
    expect(Object.keys(result.tribes[0]).sort()).toEqual(['lastUsedAt', 'name', 'tribeId', 'uses'])
    expect(Object.keys(result.placeCategories[0]).sort()).toEqual(['lastUsedAt', 'slug', 'uses'])
    expect(Object.keys(result).sort()).toEqual(['countedItems', 'limit', 'now', 'patterns', 'placeCategories', 'since', 'tribes', 'windowDays'])
  })
})

describe('rankOpsDraw — 대상 목록', () => {
  it('패턴은 사용 중만 나온다(쉬는 중·보관은 쓴 기록이 있어도 없다)', () => {
    const patterns = [
      { patternNo: 'P01', name: '사용', status: 'active' as const },
      { patternNo: 'P02', name: '쉼', status: 'paused' as const },
      { patternNo: 'P03', name: '보관', status: 'archived' as const },
    ]
    const result = rank({ patterns, rows: [row(1, { patternNo: 'P02' }), row(2, { patternNo: 'P03' })] })
    expect(result.patterns.map((p) => p.patternNo)).toEqual(['P01'])
  })

  it('사전에 없는 패턴 번호는 세지도 싣지도 않는다', () => {
    const result = rank({ rows: [row(1, { patternNo: 'P77' })] })
    expect(result.patterns.map((p) => p.patternNo)).toEqual(['P01', 'P02', 'P03'])
    expect(result.patterns.every((p) => p.uses === 0)).toBe(true)
  })

  it('활성 목록에 없는 트라이브(비활성·없는 트라이브)는 세지도 싣지도 않는다', () => {
    const result = rank({ tribes: [TRIBE_A], rows: [row(1, { tribeId: TRIBE_B.id }), row(2, { tribeId: uuid(777) })] })
    expect(result.tribes).toEqual([{ tribeId: TRIBE_A.id, name: '트라이브 A', uses: 0, lastUsedAt: null }])
  })

  it('카테고리에서 delete·unassigned는 빠지고, 목록에 없는 slug는 세지 않는다', () => {
    const result = rank({ rows: [row(1, { categories: ['delete', 'unassigned', 'nonexistent', 'cafe'] })] })
    expect(result.placeCategories.map((c) => c.slug).sort()).toEqual(['cafe', 'museum', 'park'])
    expect(result.placeCategories.find((c) => c.slug === 'cafe')?.uses).toBe(1)
  })
})

describe('rankOpsDraw — 칸 읽기', () => {
  it('수정본이 원본보다 우선한다', () => {
    const edited = row(1, { patternNo: 'P01', tribeId: TRIBE_A.id, categories: ['cafe'], edited: { pattern_no: 'P02', tribe_id: TRIBE_B.id, knobs: { place_category: ['park'] } } })
    const result = rank({ rows: [edited] })
    expect(result.patterns.find((p) => p.patternNo === 'P01')?.uses).toBe(0)
    expect(result.patterns.find((p) => p.patternNo === 'P02')?.uses).toBe(1)
    expect(result.tribes.find((t) => t.tribeId === TRIBE_A.id)?.uses).toBe(0)
    expect(result.tribes.find((t) => t.tribeId === TRIBE_B.id)?.uses).toBe(1)
    expect(result.placeCategories.find((c) => c.slug === 'cafe')?.uses).toBe(0)
    expect(result.placeCategories.find((c) => c.slug === 'park')?.uses).toBe(1)
  })

  it('P-07처럼 형식이 틀린 패턴 번호는 세지 않는다', () => {
    for (const bad of ['P-07', 'p01', 'P1', 7, true, {}]) {
      const result = rank({ rows: [row(1, { patternNo: bad })] })
      expect(result.patterns.every((p) => p.uses === 0), String(bad)).toBe(true)
    }
  })

  it('앞뒤 공백이 있는 패턴 번호는 떼고 센다', () => {
    expect(rank({ rows: [row(1, { patternNo: ' P01 ' })] }).patterns.find((p) => p.patternNo === 'P01')?.uses).toBe(1)
  })

  it('문자열 배열이 아닌 place_category는 세지 않는다', () => {
    for (const bad of ['cafe', 7, { 0: 'cafe' }, ['cafe', 3], ['cafe', ''], [null]]) {
      const result = rank({ rows: [row(1, { categories: bad })] })
      expect(result.placeCategories.every((c) => c.uses === 0), JSON.stringify(bad)).toBe(true)
    }
  })

  it('한 항목 안에서 겹친 slug는 1회다', () => {
    const result = rank({ rows: [row(1, { categories: ['cafe', 'cafe', 'cafe', 'park'] })] })
    expect(result.placeCategories.find((c) => c.slug === 'cafe')?.uses).toBe(1)
    expect(result.placeCategories.find((c) => c.slug === 'park')?.uses).toBe(1)
  })

  it('UUID 형식이 아닌 트라이브 ID는 세지 않고, 대문자 UUID는 소문자 ID와 같은 트라이브로 센다', () => {
    expect(rank({ rows: [row(1, { tribeId: 'not-a-uuid' }), row(2, { tribeId: 7 })] }).tribes.every((t) => t.uses === 0)).toBe(true)
    const upper = rank({ rows: [row(1, { tribeId: TRIBE_A.id.toUpperCase() })] })
    expect(upper.tribes.find((t) => t.tribeId === TRIBE_A.id)?.uses).toBe(1)
  })

  it('칸이 없는 항목은 어느 목록에도 세지 않지만 countedItems에는 든다', () => {
    const result = rank({ rows: [row(1)] })
    expect(result.countedItems).toBe(1)
    expect(result.patterns.every((p) => p.uses === 0)).toBe(true)
    expect(result.tribes.every((t) => t.uses === 0)).toBe(true)
    expect(result.placeCategories.every((c) => c.uses === 0)).toBe(true)
  })
})

describe('rankOpsDraw — 재현성', () => {
  const rows = [
    row(1, { patternNo: 'P01', tribeId: TRIBE_A.id, categories: ['cafe'], startsAt: '2026-10-01T00:00:00.000Z' }),
    row(2, { patternNo: 'P02', tribeId: TRIBE_B.id, categories: ['park', 'cafe'], startsAt: '2026-10-05T00:00:00.000Z' }),
    row(3, { patternNo: 'P01', tribeId: TRIBE_C.id, categories: ['museum'], startsAt: '2026-08-01T00:00:00.000Z' }),
    row(4, { patternNo: 'P03', status: 'rejected' }),
    row(5, { patternNo: 'P03', sample: true }),
  ]

  it('같은 행과 같은 now로 두 번 부르면 깊은 비교로 같다', () => {
    expect(rank({ rows })).toEqual(rank({ rows }))
  })

  it('행의 순서가 달라도 같고, 입력을 바꾸지 않는다', () => {
    const snapshot = JSON.stringify(rows)
    expect(rank({ rows: [...rows].reverse() })).toEqual(rank({ rows }))
    expect(JSON.stringify(rows)).toBe(snapshot)
  })

  it('무작위를 쓰지 않는다', () => {
    const random = vi.spyOn(Math, 'random')
    rank({ rows })
    expect(random).not.toHaveBeenCalled()
  })

  it('기준 시각이 달라지면 기간이 따라 움직인다', () => {
    const later = new Date(NOW.getTime() + 40 * DAY_MS)
    expect(rank({ rows, now: later }).patterns.find((p) => p.patternNo === 'P02')?.uses).toBe(0)
    expect(rank({ rows }).patterns.find((p) => p.patternNo === 'P02')?.uses).toBe(1)
  })
})

// ── 읽기 함수 ───────────────────────────────────────────────────────────────────────────────────

interface Call {
  table: string
  columns: string
  filters: string[]
  orders: string[]
}

/** 호출을 기록하고 표마다 정해 둔 행을 돌려주는 가짜 서비스 클라이언트. `range`는 실제로 잘라서, 쪽 넘김 읽기를 시험할 수 있다. */
function fakeService(tables: Record<string, Array<Record<string, unknown>>>, failTable?: string) {
  const calls: Call[] = []
  class Query implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
    private call: Call
    private window: [number, number] | null = null
    constructor(private table: string) {
      this.call = { table, columns: '', filters: [], orders: [] }
      calls.push(this.call)
    }
    select(columns: string) {
      this.call.columns = columns
      return this
    }
    eq(column: string, value: unknown) {
      this.call.filters.push(`eq ${column}=${String(value)}`)
      return this
    }
    neq(column: string, value: unknown) {
      this.call.filters.push(`neq ${column}=${String(value)}`)
      return this
    }
    in(column: string, values: readonly string[]) {
      this.call.filters.push(`in ${column}=${values.join('|')}`)
      return this
    }
    order(column: string) {
      this.call.orders.push(column)
      return this
    }
    range(from: number, to: number) {
      this.window = [from, to]
      return this
    }
    then<R1, R2 = never>(
      onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => R1 | PromiseLike<R1>) | null,
      onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
    ): PromiseLike<R1 | R2> {
      if (this.table === failTable) return Promise.resolve({ data: null, error: { message: '원문 오류' } }).then(onfulfilled, onrejected)
      let rows = tables[this.table] ?? []
      if (this.window) rows = rows.slice(this.window[0], this.window[1] + 1)
      return Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected)
    }
  }
  return { service: { from: (table: string) => new Query(table) } as unknown as ServiceClient, calls }
}

describe('countOpsPatternUsage — 패턴 사전(S5)과 조합 뽑기가 같이 쓰는 세기', () => {
  it('넘긴 번호는 한 번도 안 썼어도 0회·null로 돌려준다(상태는 보지 않는다)', () => {
    const counted = countOpsPatternUsage([row(1, { patternNo: 'P02' })], ['P01', 'P02', 'P03'], NOW)
    expect(counted.get('P01')).toEqual({ uses: 0, lastUsedAt: null })
    expect(counted.get('P02')).toEqual({ uses: 1, lastUsedAt: '2026-10-01T00:00:00.000Z' })
    expect([...counted.keys()]).toEqual(['P01', 'P02', 'P03'])
  })

  it('넘기지 않은 번호는 세지 않는다(쉬는 중·보관 번호도 넘기면 센다)', () => {
    const rows = [row(1, { patternNo: 'P14' }), row(2, { patternNo: 'P20' })]
    expect(countOpsPatternUsage(rows, ['P14'], NOW).has('P20')).toBe(false)
    expect(countOpsPatternUsage(rows, ['P14', 'P20'], NOW).get('P20')?.uses).toBe(1)
  })

  it('시험 묶음·승인 전 상태·pattern_proposal·사용 시각을 읽을 수 없는 항목은 세지 않는다', () => {
    const rows = [
      row(1, { patternNo: 'P01', sample: true }),
      row(2, { patternNo: 'P01', status: 'reviewing' }),
      row(3, { patternNo: 'P01', kind: 'pattern_proposal' }),
      row(4, { patternNo: 'P01', startsAt: null, receivedAt: 'garbage' }),
      row(5, { patternNo: 'P01' }),
      row(6, { patternNo: 'not-a-pattern' }), // 센 것은 5번 하나뿐이다
    ]
    expect(countOpsPatternUsage(rows, ['P01'], NOW).get('P01')).toEqual({ uses: 1, lastUsedAt: '2026-10-01T00:00:00.000Z' })
  })

  it('최근 4주 안은 uses에 들어가고, 마지막 사용은 기간과 무관하다', () => {
    const rows = [
      row(1, { patternNo: 'P01', startsAt: new Date(SINCE_MS).toISOString() }),
      row(2, { patternNo: 'P01', startsAt: new Date(SINCE_MS - 1).toISOString() }),
      row(3, { patternNo: 'P02', startsAt: '2026-01-01T00:00:00.000Z' }),
    ]
    const counted = countOpsPatternUsage(rows, ['P01', 'P02'], NOW)
    expect(counted.get('P01')?.uses).toBe(1)
    expect(counted.get('P02')).toEqual({ uses: 0, lastUsedAt: '2026-01-01T00:00:00.000Z' })
  })

  it('같은 입력에서 rankOpsDraw의 uses·lastUsedAt과 같다', () => {
    const rows = [
      row(1, { patternNo: 'P01' }),
      row(2, { patternNo: 'P01', startsAt: '2026-10-05T00:00:00.000Z' }),
      row(3, { patternNo: 'P02', startsAt: '2026-06-01T00:00:00.000Z' }),
      row(4, { patternNo: 'P02', sample: true }),
      row(5, { patternNo: 'P03', status: 'rejected' }),
    ]
    const counted = countOpsPatternUsage(rows, PATTERNS.map((p) => p.patternNo), NOW)
    for (const line of rank({ rows }).patterns) {
      expect(counted.get(line.patternNo), line.patternNo).toEqual({ uses: line.uses, lastUsedAt: line.lastUsedAt })
    }
  })
})

describe('loadDrawUsageRows', () => {
  it('세는 데 필요한 칸만 읽는다 — 관리자 ID·제출 원본 칸은 select에 없다', () => {
    for (const forbidden of ['author', 'raw', 'actor', 'updated_by', 'created_by']) {
      expect(OPS_DRAW_USAGE_COLUMNS).not.toContain(forbidden)
    }
    expect(OPS_DRAW_USAGE_COLUMNS).toBe('id, kind, status, starts_at, original, edited, ops_bundles!inner(is_sample, received_at)')
  })

  it('시험 묶음 제외와 승인 이후 상태 조건을 걸고, id로 정렬해 읽는다', async () => {
    const { service, calls } = fakeService({ ops_bundle_items: [] })
    await loadDrawUsageRows(service)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: 'ops_bundle_items', columns: OPS_DRAW_USAGE_COLUMNS, orders: ['id'] })
    expect(calls[0].filters).toEqual(['eq ops_bundles.is_sample=false', 'in status=approved|preparing|scheduled|live|ended'])
  })

  it('기간 조건은 걸지 않는다(lastUsedAt이 기간과 무관한 전체 기록의 최댓값이다)', async () => {
    const { service, calls } = fakeService({ ops_bundle_items: [] })
    await loadDrawUsageRows(service)
    expect(calls[0].filters.some((f) => f.includes('starts_at') || f.includes('received_at'))).toBe(false)
  })

  it('1000행을 넘어도 모두 읽는다', async () => {
    const all = Array.from({ length: 2500 }, (_, i) => ({ id: uuid(i + 1) }))
    const { service } = fakeService({ ops_bundle_items: all })
    expect(await loadDrawUsageRows(service)).toHaveLength(2500)
  })

  it('조회가 실패하면 던진다', async () => {
    const { service } = fakeService({}, 'ops_bundle_items')
    await expect(loadDrawUsageRows(service)).rejects.toThrow('원문 오류')
  })
})

describe('loadDrawTribes', () => {
  it('활성 트라이브만 조건으로 걸고 id·이름·정렬값만 싣는다', async () => {
    const { service, calls } = fakeService({ tribes: [{ id: uuid(1), name: 'A', sort_order: 1, description: '싣지 않는 칸', is_active: true }] })
    expect(await loadDrawTribes(service)).toEqual([{ id: uuid(1), name: 'A', sort_order: 1 }])
    expect(calls[0]).toMatchObject({ table: 'tribes', columns: OPS_DRAW_TRIBE_COLUMNS })
    expect(calls[0].filters).toEqual(['eq is_active=true'])
  })

  it('조회가 실패하면 던진다', async () => {
    const { service } = fakeService({}, 'tribes')
    await expect(loadDrawTribes(service)).rejects.toThrow('트라이브 조회 실패')
  })
})

describe('drawOpsCombination', () => {
  const patternRow = (patternNo: string, status: string) => ({ pattern_no: patternNo, name: patternNo, status })

  it('넷을 읽어 순위를 돌려준다: 사용 중 패턴만, 활성 트라이브만, 제외 카테고리 없이', async () => {
    const { service, calls } = fakeService({
      ops_bundle_items: [
        { id: uuid(1), kind: 'home_feed_card', status: 'approved', starts_at: '2026-10-01T00:00:00.000Z', original: { pattern_no: 'P01', tribe_id: uuid(11), knobs: { place_category: ['cafe'] } }, edited: null, ops_bundles: { is_sample: false, received_at: '2026-09-30T00:00:00.000Z' } },
      ],
      ops_patterns: [patternRow('P01', 'active'), patternRow('P02', 'active'), patternRow('P03', 'paused')],
      tribes: [{ id: uuid(11), name: 'A', sort_order: 1 }, { id: uuid(12), name: 'B', sort_order: 2 }],
      poi_categories: [{ slug: 'cafe' }, { slug: 'park' }, { slug: 'delete' }, { slug: 'unassigned' }],
    })
    const result = await drawOpsCombination(service, { limit: 5, now: NOW })
    expect(calls.map((c) => c.table).sort()).toEqual(['ops_bundle_items', 'ops_patterns', 'poi_categories', 'tribes'])
    expect(result.patterns).toEqual([
      { patternNo: 'P02', name: 'P02', uses: 0, lastUsedAt: null },
      { patternNo: 'P01', name: 'P01', uses: 1, lastUsedAt: '2026-10-01T00:00:00.000Z' },
    ])
    expect(result.tribes.map((t) => [t.tribeId, t.uses])).toEqual([[uuid(12), 0], [uuid(11), 1]])
    expect(result.placeCategories.map((c) => [c.slug, c.uses])).toEqual([['park', 0], ['cafe', 1]])
    expect(result.countedItems).toBe(1)
  })

  it('넷 중 하나라도 실패하면 던진다', async () => {
    for (const table of ['ops_bundle_items', 'ops_patterns', 'tribes', 'poi_categories']) {
      const { service } = fakeService({}, table)
      await expect(drawOpsCombination(service, { limit: 5, now: NOW }), table).rejects.toThrow()
    }
  })
})
