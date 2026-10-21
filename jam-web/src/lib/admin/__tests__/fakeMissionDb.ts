/**
 * 어드민 미션 라우트 시험용 메모리 DB 스텁 (티켓 20261019_1318 1회)
 *
 * 미션 저장 라우트가 쓰는 질의 모양(`select/insert/update/delete` + `eq/in` + `single/maybeSingle`, 건수 읽기)만 흉내 낸다.
 * 표는 이름 → 행 배열이고, 호출 순서는 `calls`에 `표.동작`으로 남는다. `failOn`에 `표.동작`을 넣으면 그 호출이 오류를 돌려준다.
 */
type Row = Record<string, unknown>
type Filter = ['eq' | 'in', string, unknown]

export interface FakeMissionDb {
  client: never
  tables: Record<string, Row[]>
  calls: string[]
  failOn: Set<string>
}

export function createFakeMissionDb(initial: Record<string, Row[]> = {}): FakeMissionDb {
  const db: FakeMissionDb = { client: null as never, tables: { ...initial }, calls: [], failOn: new Set() }
  let nextId = 1

  const matches = (row: Row, filters: Filter[]) =>
    filters.every(([kind, col, val]) => (kind === 'eq' ? row[col] === val : (val as unknown[]).includes(row[col])))

  interface State {
    table: string
    op: 'select' | 'insert' | 'update' | 'delete'
    payload: Row | Row[] | null
    filters: Filter[]
    returning: boolean
    single: 'single' | 'maybeSingle' | null
    head: boolean
  }

  const execute = (s: State) => {
    db.calls.push(`${s.table}.${s.op}`)
    if (db.failOn.has(`${s.table}.${s.op}`)) return { data: null, count: null, error: { message: `${s.table}.${s.op} 실패` } }
    const rows = (db.tables[s.table] ??= [])
    let affected: Row[] = []

    if (s.op === 'insert') {
      const inserted = (Array.isArray(s.payload) ? s.payload : [s.payload ?? {}]).map((row) => ({
        ...(s.table === 'missions' && row.id === undefined ? { id: `new-${nextId++}` } : {}),
        ...row,
      }))
      rows.push(...inserted)
      affected = inserted
    } else if (s.op === 'update') {
      affected = rows.filter((row) => matches(row, s.filters))
      for (const row of affected) Object.assign(row, s.payload)
    } else if (s.op === 'delete') {
      affected = rows.filter((row) => matches(row, s.filters))
      db.tables[s.table] = rows.filter((row) => !matches(row, s.filters))
    } else {
      affected = rows.filter((row) => matches(row, s.filters))
    }

    const returnsRows = s.op === 'select' || s.returning
    if (s.head) return { data: null, count: affected.length, error: null }
    if (!returnsRows) return { data: null, count: null, error: null }
    if (s.single === 'single') {
      return affected.length === 1
        ? { data: affected[0], count: null, error: null }
        : { data: null, count: null, error: { message: '행이 하나가 아니에요' } }
    }
    if (s.single === 'maybeSingle') return { data: affected[0] ?? null, count: null, error: null }
    return { data: affected, count: null, error: null }
  }

  const chain = (s: State) => {
    const api = {
      eq(col: string, val: unknown) {
        s.filters.push(['eq', col, val])
        return api
      },
      in(col: string, vals: unknown[]) {
        s.filters.push(['in', col, vals])
        return api
      },
      order() {
        return api
      },
      select(_cols?: string, opts?: { head?: boolean }) {
        if (s.op !== 'select') s.returning = true
        s.head = Boolean(opts?.head)
        return api
      },
      single() {
        s.single = 'single'
        return api
      },
      maybeSingle() {
        s.single = 'maybeSingle'
        return api
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(execute(s)).then(resolve, reject)
      },
    }
    return api
  }

  const start = (table: string, op: State['op'], payload: State['payload'] = null) =>
    chain({ table, op, payload, filters: [], returning: false, single: null, head: false })

  db.client = {
    from: (table: string) => ({
      select: (cols?: string, opts?: { head?: boolean }) => start(table, 'select').select(cols, opts),
      insert: (payload: Row | Row[]) => start(table, 'insert', payload),
      update: (payload: Row) => start(table, 'update', payload),
      delete: () => start(table, 'delete'),
    }),
  } as never
  return db
}
