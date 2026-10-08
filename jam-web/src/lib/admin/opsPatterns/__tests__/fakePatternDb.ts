/**
 * 패턴 쓰기 테스트용 메모리 DB (티켓 20261008_1545). 서비스 클라이언트의 `from(table)` 체인 중 쓰기 코드가 쓰는 것만 흉내 낸다:
 * `select`·`eq`·`neq`·`maybeSingle`(읽기), `insert(...).select()`, `update(...).eq(...).select()`.
 *
 * - `ops_patterns`의 유일 제약을 흉내 낸다: 번호(`pattern_no`)와 값이 있는 `origin_item_id`. 어긋나면 PostgREST처럼 코드 `23505`와
 *   제약 이름이 든 메시지를 돌려준다.
 * - 조건부 update는 `eq` 조건에 맞는 행만 바꾸고 바뀐 행을 돌려준다(0행이면 빈 배열).
 * - `writeCalls`는 insert·update가 불린 횟수다(409·400에서 DB를 건드리지 않았는지 확인한다).
 * - `beforeWrite`는 쓰기 직전에 불리는 훅이다(읽은 뒤 쓰기 전에 다른 곳이 먼저 고친 경쟁을 만든다).
 */
export type Row = Record<string, unknown>
type Result = { data: unknown; error: { message: string; code?: string; details?: string } | null }

export const fakeDb = {
  tables: {} as Record<string, Row[]>,
  /** 읽기 오류 흉내(메시지). */
  readError: null as string | null,
  /** 쓰기 오류 흉내(코드·메시지). */
  writeError: null as { message: string; code?: string; details?: string } | null,
  writeCalls: 0,
  beforeWrite: null as (() => void) | null,
  reset() {
    this.tables = {}
    this.readError = null
    this.writeError = null
    this.writeCalls = 0
    this.beforeWrite = null
  },
}

class Query implements PromiseLike<Result> {
  private filters: Array<(row: Row) => boolean> = []
  private columns: string[] = []
  private single = false
  private mode: 'select' | 'insert' | 'update' = 'select'
  private payload: Row = {}

  constructor(private table: string) {}

  select(columns: string) {
    this.columns = columns.split(',').map((c) => c.trim())
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
    this.filters.push((row) => row[column] === value)
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

  private pick(rows: Row[]) {
    return rows.map((row) => Object.fromEntries(this.columns.map((c) => [c, row[c]])))
  }

  private run(): Result {
    if (this.mode === 'select') {
      const rows = (fakeDb.tables[this.table] ??= [])
      if (fakeDb.readError) return { data: null, error: { message: fakeDb.readError } }
      const found = this.pick(rows.filter((row) => this.filters.every((f) => f(row))))
      return { data: this.single ? (found[0] ?? null) : found, error: null }
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
