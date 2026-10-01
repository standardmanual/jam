/**
 * 운영 패턴 사전 읽기 (티켓 20261001_2134, 상위 20260930_1503 ②)
 *
 * 서비스 클라이언트는 메모리 안의 가짜 테이블로 바꾼다(실 DB에 접속하지 않는다). 가짜는 `select`에 적은 칸만 돌려주고 `eq`·`neq`를 적용하므로,
 * 읽는 칸 목록과 거르는 조건이 실제로 응답을 바꾸는지 본다. 지키는 것:
 * - 관리자 ID(`updated_by`·`confirmed_by`)를 select 목록에서 빼고, 변환 함수도 그 칸이 섞여 들어와도 싣지 않는다
 * - 패턴 목록은 보관(`archived`)을 기본으로 빼고 `includeArchived`일 때만 싣는다. 번호로 직접 읽으면 보관 패턴도 나온다
 * - 패턴 번호는 숫자 순서(P09 < P10 < P100)다
 * - 취향 신호는 보관한 패턴 것까지 싣고, 공통(`patternNo: null`)이 먼저, 그다음 패턴 번호 순서, 같은 패턴 안에서는 `sort_order`다
 * - 한 패턴의 취향 신호만 읽을 수 있고, 테이블이 비면 빈 목록이며, 조회 오류는 던진다
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  OPS_COMMON_RULE_COLUMNS,
  OPS_PATTERN_COLUMNS,
  OPS_TASTE_SIGNAL_COLUMNS,
  comparePatternNo,
  getOpsPattern,
  listOpsCommonRules,
  listOpsPatterns,
  listOpsTasteSignals,
  toCommonRuleRecord,
  toPatternRecord,
  toTasteSignalRecord,
  type OpsPatternRow,
  type OpsTasteSignalRow,
} from '../read'

type Row = Record<string, unknown>
type Result = { data: unknown; error: { message: string } | null }

const db = {
  tables: {} as Record<string, Row[]>,
  error: null as string | null,
  selects: [] as Array<{ table: string; columns: string }>,
  filters: [] as string[],
}

class Query implements PromiseLike<Result> {
  private filters: Array<(row: Row) => boolean> = []
  private columns: string[] = []
  private single = false
  constructor(private table: string) {}
  select(columns: string) {
    db.selects.push({ table: this.table, columns })
    this.columns = columns.split(',').map((c) => c.trim())
    return this
  }
  eq(column: string, value: unknown) {
    db.filters.push(`eq ${column}`)
    this.filters.push((row) => row[column] === value)
    return this
  }
  neq(column: string, value: unknown) {
    db.filters.push(`neq ${column}`)
    this.filters.push((row) => row[column] !== value)
    return this
  }
  maybeSingle() {
    this.single = true
    return this
  }
  private run(): Result {
    if (db.error) return { data: null, error: { message: db.error } }
    const rows = (db.tables[this.table] ?? [])
      .filter((row) => this.filters.every((f) => f(row)))
      .map((row) => Object.fromEntries(this.columns.map((c) => [c, row[c]])))
    return { data: this.single ? (rows[0] ?? null) : rows, error: null }
  }
  then<R1 = Result, R2 = never>(
    onfulfilled?: ((value: Result) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected)
  }
}

const service = { from: (table: string) => new Query(table) } as unknown as Parameters<typeof listOpsPatterns>[0]

function patternRow(patternNo: string, extra: Partial<Row> = {}): Row {
  return {
    pattern_no: patternNo,
    name: `패턴 ${patternNo}`,
    principle: '원리',
    user_experience: '유저 경험',
    menus: ['메뉴'],
    samples: [{ role: 'main', title: '샘플' }],
    card_shapes: [{ kind: 'badge' }],
    knobs: { condition: { open: 'a', closed: 'b' } },
    pitfalls: '함정',
    status: 'active',
    pause_reason: null,
    origin: 'seed',
    origin_item_id: null,
    created_at: '2026-10-01T00:00:00+00:00',
    updated_at: '2026-10-01T01:00:00+00:00',
    updated_by: 'admin-user-id',
    ...extra,
  }
}

function signalRow(id: string, patternNo: string | null, sortOrder: number, extra: Partial<Row> = {}): Row {
  return {
    id,
    pattern_no: patternNo,
    name: `신호 ${id}`,
    reason: '이유',
    basis: 'estimate',
    evidence_decision_id: null,
    confirmed_at: null,
    confirmed_by: 'admin-user-id',
    sort_order: sortOrder,
    created_at: '2026-10-01T00:00:00+00:00',
    updated_at: '2026-10-01T01:00:00+00:00',
    ...extra,
  }
}

beforeEach(() => {
  db.tables = {}
  db.error = null
  db.selects = []
  db.filters = []
})

describe('읽는 칸 목록과 변환: 관리자 ID를 싣지 않는다', () => {
  it('select 목록에 updated_by·confirmed_by가 없다', () => {
    for (const columns of [OPS_PATTERN_COLUMNS, OPS_TASTE_SIGNAL_COLUMNS, OPS_COMMON_RULE_COLUMNS]) {
      expect(columns).not.toMatch(/updated_by|confirmed_by/)
    }
  })

  it('패턴 변환은 응답 칸만 싣고 상태 이름표를 붙인다(관리자 ID가 섞여 들어와도 버린다)', () => {
    const record = toPatternRecord(patternRow('P01', { status: 'paused', pause_reason: '기능 대기' }) as unknown as OpsPatternRow)
    expect(Object.keys(record).sort()).toEqual(
      [
        'patternNo',
        'name',
        'principle',
        'userExperience',
        'menus',
        'samples',
        'cardShapes',
        'knobs',
        'pitfalls',
        'status',
        'statusLabel',
        'pauseReason',
        'origin',
        'originItemId',
        'createdAt',
        'updatedAt',
      ].sort()
    )
    expect(record.statusLabel).toBe('쉬는 중')
    expect(record.pauseReason).toBe('기능 대기')
    expect(JSON.stringify(record)).not.toMatch(/updated_?by|confirmed_?by|admin-user-id/i)
  })

  it('JSONB 칸(samples·cardShapes·knobs)은 그대로 넘긴다', () => {
    const row = patternRow('P02') as unknown as OpsPatternRow
    const record = toPatternRecord(row)
    expect(record.samples).toBe(row.samples)
    expect(record.cardShapes).toBe(row.card_shapes)
    expect(record.knobs).toBe(row.knobs)
  })

  it('취향 신호·공통 규칙 변환도 응답 칸만 싣는다', () => {
    const signal = toTasteSignalRecord(signalRow('s1', null, 1) as unknown as OpsTasteSignalRow)
    expect(Object.keys(signal).sort()).toEqual(
      ['id', 'patternNo', 'name', 'reason', 'basis', 'evidenceDecisionId', 'confirmedAt', 'sortOrder'].sort()
    )
    expect(JSON.stringify(signal)).not.toMatch(/confirmed_?by|admin-user-id/i)

    const rule = toCommonRuleRecord({ rule_no: 3, title: '제목', body: '본문', updated_at: 't', updated_by: 'admin-user-id' } as never)
    expect(rule).toEqual({ ruleNo: 3, title: '제목', body: '본문', updatedAt: 't' })
  })

  it('가짜 DB에서 읽어도 관리자 ID가 나가지 않는다(select에 안 적은 칸은 오지 않는다)', async () => {
    db.tables.ops_patterns = [patternRow('P01')]
    db.tables.ops_pattern_taste_signals = [signalRow('s1', 'P01', 1)]
    db.tables.ops_pattern_common_rules = [{ rule_no: 1, title: '규칙', body: '본문', updated_at: 't', updated_by: 'admin-user-id' }]
    const all = [
      await listOpsPatterns(service, { includeArchived: false }),
      await getOpsPattern(service, 'P01'),
      await listOpsTasteSignals(service),
      await listOpsCommonRules(service),
    ]
    expect(JSON.stringify(all)).not.toMatch(/updated_?by|confirmed_?by|admin-user-id/i)
  })
})

describe('listOpsPatterns', () => {
  beforeEach(() => {
    db.tables.ops_patterns = [
      patternRow('P02'),
      patternRow('P03', { status: 'paused', pause_reason: '대기' }),
      patternRow('P04', { status: 'archived' }),
    ]
  })

  it('기본은 보관 패턴을 빼고 사용 중·쉬는 중만 싣는다(쿼리에 보관 제외 조건이 걸린다)', async () => {
    const patterns = await listOpsPatterns(service, { includeArchived: false })
    expect(patterns.map((p) => p.patternNo)).toEqual(['P02', 'P03'])
    expect(db.filters).toContain('neq status')
  })

  it('includeArchived면 보관 패턴까지 싣고 상태 이름표가 붙는다', async () => {
    const patterns = await listOpsPatterns(service, { includeArchived: true })
    expect(patterns.map((p) => [p.patternNo, p.statusLabel])).toEqual([
      ['P02', '사용 중'],
      ['P03', '쉬는 중'],
      ['P04', '보관'],
    ])
    expect(db.filters).not.toContain('neq status')
  })

  it('패턴 번호는 숫자 순서다(P09 < P10 < P100)', async () => {
    db.tables.ops_patterns = [patternRow('P100'), patternRow('P10'), patternRow('P09'), patternRow('P20')]
    const patterns = await listOpsPatterns(service, { includeArchived: false })
    expect(patterns.map((p) => p.patternNo)).toEqual(['P09', 'P10', 'P20', 'P100'])
    expect(['P100', 'P10', 'P09'].sort(comparePatternNo)).toEqual(['P09', 'P10', 'P100'])
  })

  it('테이블이 비어 있으면 빈 목록이다', async () => {
    db.tables.ops_patterns = []
    expect(await listOpsPatterns(service, { includeArchived: true })).toEqual([])
  })

  it('조회 오류는 던진다', async () => {
    db.error = 'relation missing'
    await expect(listOpsPatterns(service, { includeArchived: false })).rejects.toThrow('패턴 조회 실패')
  })
})

describe('getOpsPattern', () => {
  it('번호로 직접 읽으면 보관 패턴도 돌려준다', async () => {
    db.tables.ops_patterns = [patternRow('P04', { status: 'archived' })]
    const pattern = await getOpsPattern(service, 'P04')
    expect(pattern?.patternNo).toBe('P04')
    expect(pattern?.statusLabel).toBe('보관')
  })

  it('없는 번호는 null이다', async () => {
    db.tables.ops_patterns = [patternRow('P01')]
    expect(await getOpsPattern(service, 'P99')).toBeNull()
  })

  it('조회 오류는 던진다', async () => {
    db.error = 'boom'
    await expect(getOpsPattern(service, 'P01')).rejects.toThrow('패턴 조회 실패')
  })
})

describe('listOpsTasteSignals', () => {
  beforeEach(() => {
    db.tables.ops_pattern_taste_signals = [
      signalRow('p100-a', 'P100', 1),
      signalRow('p10-b', 'P10', 2),
      signalRow('common-b', null, 2),
      signalRow('p10-a', 'P10', 1),
      signalRow('p09-a', 'P09', 5),
      signalRow('common-a', null, 1),
    ]
    // 보관한 패턴의 신호도 싣는지 보려고 P10을 보관 패턴으로 둔다(신호 조회는 패턴 상태를 거르지 않는다).
    db.tables.ops_patterns = [patternRow('P09'), patternRow('P10', { status: 'archived' }), patternRow('P100')]
  })

  it('전부 싣는다: 공통이 먼저, 그다음 패턴 번호의 숫자 순서, 같은 패턴 안에서는 sort_order', async () => {
    const signals = await listOpsTasteSignals(service)
    expect(signals.map((s) => s.id)).toEqual(['common-a', 'common-b', 'p09-a', 'p10-a', 'p10-b', 'p100-a'])
    expect(db.filters).toEqual([])
  })

  it('보관한 패턴(P10)의 취향 신호도 싣는다', async () => {
    const signals = await listOpsTasteSignals(service)
    expect(signals.filter((s) => s.patternNo === 'P10')).toHaveLength(2)
  })

  it('패턴 번호를 주면 그 패턴 것만 sort_order 순서로 싣는다', async () => {
    const signals = await listOpsTasteSignals(service, { patternNo: 'P10' })
    expect(signals.map((s) => s.id)).toEqual(['p10-a', 'p10-b'])
    expect(db.filters).toContain('eq pattern_no')
  })

  it('추정·확정 구분과 근거 칸을 싣는다', async () => {
    db.tables.ops_pattern_taste_signals = [
      signalRow('confirmed', 'P01', 1, { basis: 'confirmed', confirmed_at: '2026-10-01T02:00:00+00:00', evidence_decision_id: 'd-1' }),
    ]
    const [signal] = await listOpsTasteSignals(service)
    expect(signal).toMatchObject({ basis: 'confirmed', confirmedAt: '2026-10-01T02:00:00+00:00', evidenceDecisionId: 'd-1' })
  })

  it('테이블이 비어 있으면 빈 목록이고 조회 오류는 던진다', async () => {
    db.tables.ops_pattern_taste_signals = []
    expect(await listOpsTasteSignals(service)).toEqual([])
    db.error = 'boom'
    await expect(listOpsTasteSignals(service)).rejects.toThrow('취향 신호 조회 실패')
  })
})

describe('listOpsCommonRules', () => {
  it('공통 규칙 전부를 ruleNo 순서로 싣는다', async () => {
    db.tables.ops_pattern_common_rules = [
      { rule_no: 10, title: '열', body: 'b', updated_at: 't' },
      { rule_no: 2, title: '둘', body: 'b', updated_at: 't' },
      { rule_no: 1, title: '하나', body: 'b', updated_at: 't' },
    ]
    expect((await listOpsCommonRules(service)).map((r) => r.ruleNo)).toEqual([1, 2, 10])
  })

  it('테이블이 비어 있으면 빈 목록이고 조회 오류는 던진다', async () => {
    expect(await listOpsCommonRules(service)).toEqual([])
    db.error = 'boom'
    await expect(listOpsCommonRules(service)).rejects.toThrow('공통 규칙 조회 실패')
  })
})
