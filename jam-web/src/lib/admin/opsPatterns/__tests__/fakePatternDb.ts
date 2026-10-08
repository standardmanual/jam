/**
 * 패턴 쓰기 테스트용 메모리 DB (티켓 20261008_1545). 서비스 클라이언트의 `from(table)` 체인 중 쓰기 코드가 쓰는 것만 흉내 낸다:
 * `select`·`eq`·`neq`·`maybeSingle`(읽기), `insert(...).select()`, `update(...).eq(...).select()`.
 * 티켓 20261008_1712가 더했다: `order`·`range`·`select(열, { count: 'exact' })`, 임베드(`ops_bundles!inner(...)`·`ops_bundle_items(...)`, 결정 행의
 * `bundle_id`·`item_id`로 같은 id의 행을 붙인다)와 임베드 칸 조건(`eq('ops_bundles.is_sample', false)`). `!inner` 임베드가 비면 그 행은 빠진다.
 *
 * - `ops_patterns`의 유일 제약을 흉내 낸다: 번호(`pattern_no`)와 값이 있는 `origin_item_id`. 어긋나면 PostgREST처럼 코드 `23505`와
 *   제약 이름이 든 메시지를 돌려준다.
 * - 조건부 update는 `eq` 조건에 맞는 행만 바꾸고 바뀐 행을 돌려준다(0행이면 빈 배열).
 * - `writeCalls`는 insert·update가 불린 횟수다(409·400에서 DB를 건드리지 않았는지 확인한다).
 * - `beforeWrite`는 쓰기 직전에 불리는 훅이다(읽은 뒤 쓰기 전에 다른 곳이 먼저 고친 경쟁을 만든다).
 */
export type Row = Record<string, unknown>
type Result = { data: unknown; error: { message: string; code?: string; details?: string } | null; count?: number }

/** 임베드 이름 → 결정 행에서 그 행을 가리키는 칸. */
const EMBED_KEY: Record<string, string> = { ops_bundles: 'bundle_id', ops_bundle_items: 'item_id' }

interface Column {
  name: string
  embed: boolean
  inner: boolean
  sub: string[]
}

/** 괄호 안의 쉼표는 가르지 않고 `칸, 임베드(칸, 칸)` 목록을 읽는다. */
function parseColumns(text: string): Column[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1
    else if (text[i] === ')') depth -= 1
    else if (text[i] === ',' && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts.map((raw) => {
    const part = raw.trim()
    const open = part.indexOf('(')
    if (open === -1) return { name: part, embed: false, inner: false, sub: [] }
    const head = part.slice(0, open)
    return {
      name: head.replace('!inner', ''),
      embed: true,
      inner: head.endsWith('!inner'),
      sub: part.slice(open + 1, part.lastIndexOf(')')).split(',').map((c) => c.trim()),
    }
  })
}

export const fakeDb = {
  tables: {} as Record<string, Row[]>,
  /** 읽기 오류 흉내(메시지). */
  readError: null as string | null,
  /** 이 테이블을 읽을 때만 오류를 낸다(다른 테이블 읽기는 성공). */
  readErrorTable: null as string | null,
  /** 쓰기 오류 흉내(코드·메시지). */
  writeError: null as { message: string; code?: string; details?: string } | null,
  writeCalls: 0,
  beforeWrite: null as (() => void) | null,
  reset() {
    this.tables = {}
    this.readError = null
    this.readErrorTable = null
    this.writeError = null
    this.writeCalls = 0
    this.beforeWrite = null
  },
}

class Query implements PromiseLike<Result> {
  private filters: Array<(row: Row) => boolean> = []
  private columns: Column[] = []
  private single = false
  private wantCount = false
  private orders: Array<{ column: string; ascending: boolean }> = []
  private window: [number, number] | null = null
  private mode: 'select' | 'insert' | 'update' = 'select'
  private payload: Row = {}

  constructor(private table: string) {}

  select(columns: string, options?: { count?: 'exact' }) {
    this.columns = parseColumns(columns)
    this.wantCount = options?.count === 'exact'
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
  insert(row: Row) {
    this.mode = 'insert'
    this.payload = row
    return this
  }
  update(patch: Row) {
    this.mode = 'update'
    this.payload = patch
    return this
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => this.valueOf(row, column) === value)
    return this
  }
  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value)
    return this
  }
  maybeSingle() {
    this.single = true
    return this
  }

  /** 점 경로(`ops_bundles.is_sample`)는 붙은 임베드 행의 칸을 읽는다. */
  private valueOf(row: Row, column: string): unknown {
    const dot = column.indexOf('.')
    if (dot === -1) return row[column]
    return this.embedded(row, column.slice(0, dot))?.[column.slice(dot + 1)]
  }

  private embedded(row: Row, name: string): Row | null {
    const key = EMBED_KEY[name]
    if (!key || row[key] === undefined || row[key] === null) return null
    return (fakeDb.tables[name] ?? []).find((target) => target.id === row[key]) ?? null
  }

  /** `!inner` 임베드가 빈 행은 읽기 결과에서 빠진다. */
  private joined(rows: Row[]): Row[] {
    return rows.filter((row) => this.columns.every((c) => !(c.embed && c.inner) || this.embedded(row, c.name) !== null))
  }

  private pick(rows: Row[]) {
    return rows.map((row) =>
      Object.fromEntries(
        this.columns.map((c) => {
          if (!c.embed) return [c.name, row[c.name]]
          const target = this.embedded(row, c.name)
          return [c.name, target ? Object.fromEntries(c.sub.map((sub) => [sub, target[sub]])) : null]
        })
      )
    )
  }

  private sorted(rows: Row[]): Row[] {
    if (this.orders.length === 0) return rows
    return [...rows].sort((a, b) => {
      for (const { column, ascending } of this.orders) {
        const left = String(this.valueOf(a, column))
        const right = String(this.valueOf(b, column))
        if (left !== right) return (left < right ? -1 : 1) * (ascending ? 1 : -1)
      }
      return 0
    })
  }

  private run(): Result {
    if (this.mode === 'select') {
      const rows = (fakeDb.tables[this.table] ??= [])
      if (fakeDb.readError) return { data: null, error: { message: fakeDb.readError } }
      if (fakeDb.readErrorTable === this.table) return { data: null, error: { message: `${this.table} 읽기 오류` } }
      const matched = this.sorted(this.joined(rows.filter((row) => this.filters.every((f) => f(row)))))
      const windowed = this.window ? matched.slice(this.window[0], this.window[1] + 1) : matched
      const found = this.pick(windowed)
      return { data: this.single ? (found[0] ?? null) : found, error: null, ...(this.wantCount ? { count: matched.length } : {}) }
    }

    fakeDb.writeCalls += 1
    fakeDb.beforeWrite?.()
    if (fakeDb.writeError) return { data: null, error: fakeDb.writeError }
    // 훅이 테이블을 통째로 바꿀 수 있으므로 훅 뒤에 행 목록을 잡는다.
    const rows = (fakeDb.tables[this.table] ??= [])

    if (this.mode === 'insert') {
      if (rows.some((row) => row.pattern_no === this.payload.pattern_no)) {
        return {
          data: null,
          error: {
            code: '23505',
            message: 'duplicate key value violates unique constraint "ops_patterns_pkey"',
            details: `Key (pattern_no)=(${String(this.payload.pattern_no)}) already exists.`,
          },
        }
      }
      const itemId = this.payload.origin_item_id
      if (typeof itemId === 'string' && rows.some((row) => row.origin_item_id === itemId)) {
        return {
          data: null,
          error: {
            code: '23505',
            message: 'duplicate key value violates unique constraint "ops_patterns_origin_item_id_key"',
            details: `Key (origin_item_id)=(${itemId}) already exists.`,
          },
        }
      }
      const now = '2026-10-08T00:00:00+00:00'
      const row: Row = { created_at: now, updated_at: now, ...this.payload }
      rows.push(row)
      return { data: this.pick([row]), error: null }
    }

    const hit = rows.filter((row) => this.filters.every((f) => f(row)))
    for (const row of hit) Object.assign(row, this.payload)
    return { data: this.pick(hit), error: null }
  }

  then<R1 = Result, R2 = never>(
    onfulfilled?: ((value: Result) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected)
  }
}

export const fakeService = { from: (table: string) => new Query(table) }

/** 쓰기 코드가 읽는 모양의 `ops_patterns` 행. */
export function patternRow(patternNo: string, extra: Row = {}): Row {
  return {
    pattern_no: patternNo,
    name: `패턴 ${patternNo}`,
    principle: '원리',
    user_experience: '유저 경험',
    menus: ['메뉴'],
    samples: [{ no: 1, name: '샘플', role: 'main', impl: '' }],
    card_shapes: [],
    knobs: {},
    pitfalls: '',
    status: 'active',
    pause_reason: null,
    origin: 'seed',
    origin_item_id: null,
    created_at: '2026-10-01T00:00:00+00:00',
    updated_at: '2026-10-01T01:00:00+00:00',
    updated_by: 'secret-admin-user-id',
    ...extra,
  }
}

/** 취향 신호 행(추정). `confirmed_by`는 응답에 나가면 안 되는 값을 일부러 넣는다. */
export function tasteSignalRow(id: string, patternNo: string | null, extra: Row = {}): Row {
  return {
    id,
    pattern_no: patternNo,
    name: `신호 ${id.slice(0, 4)}`,
    reason: '추정 이유',
    basis: 'estimate',
    evidence_decision_id: null,
    confirmed_at: null,
    confirmed_by: null,
    sort_order: 1,
    created_at: '2026-10-01T00:00:00+00:00',
    updated_at: '2026-10-01T01:00:00+00:00',
    ...extra,
  }
}

export function commonRuleRow(ruleNo: number, extra: Row = {}): Row {
  return {
    rule_no: ruleNo,
    title: `규칙 ${ruleNo}`,
    body: `규칙 ${ruleNo} 본문`,
    created_at: '2026-10-01T00:00:00+00:00',
    updated_at: '2026-10-01T01:00:00+00:00',
    updated_by: null,
    ...extra,
  }
}

/** 운영 묶음 행(`ops_bundles`). 기본은 시험이 아니다. */
export function bundleRow(id: string, extra: Row = {}): Row {
  return { id, bundle_id: `submitted-${id}`, week: '2026-W41', is_sample: false, ...extra }
}

/** 운영 묶음 항목 행(`ops_bundle_items`). */
export function bundleItemRow(id: string, patternNo: string | null, extra: Row = {}): Row {
  return { id, item_key: `key-${id}`, kind: 'mission', pattern_no: patternNo, original: { copy: { title: `항목 ${id}` } }, edited: null, status: 'rejected', ...extra }
}

/** 결정 기록 행(`ops_decisions`). `actor` 원문은 응답에 나가면 안 되는 값이다. */
export function decisionRow(id: string, bundleId: string, itemId: string | null, extra: Row = {}): Row {
  return {
    id,
    bundle_id: bundleId,
    item_id: itemId,
    action: 'reject',
    actor: 'secret-admin-user-id',
    batch_id: null,
    diff: null,
    reason: '반려 이유',
    slack_result: null,
    created_at: '2026-10-05T00:00:00+00:00',
    ...extra,
  }
}
