/**
 * 밸런스 설정 시험용 가짜 서비스 클라이언트 — 메모리 안의 표 몇 개로 `from(표).select/update/insert/eq/in/order/limit`을 흉내 낸다.
 * 실 DB에는 접속하지 않는다(공용 DB에 쓰는 코드는 시험에서 가짜 클라이언트로만 돌린다).
 */
import type { BalanceServiceClient } from '../types'

export type Row = Record<string, unknown>
type Result = { data: unknown; error: { message: string } | null }

export interface FakeDb {
  tables: Record<string, Row[]>
  /** 표 이름 → 읽기 오류 문장. 있으면 그 표의 select가 실패한다. */
  readErrors: Record<string, string | undefined>
  /** 표 이름 → 쓰기 오류 문장. 있으면 그 표의 update/insert가 실패한다. */
  writeErrors: Record<string, string | undefined>
  /** update가 일어나기 직전에 부른다(다른 곳이 먼저 바꾼 상황을 만든다). 부른 횟수(1부터)를 받는다. */
  beforeUpdate: null | ((nth: number) => void)
  /** 표 이름 → update 횟수 중 이 번째(1부터)부터 실패시킨다. 되돌리기 실패 시험에 쓴다. */
  failUpdateFrom: Record<string, number | undefined>
  /** 실행한 일을 순서대로 적는다(`표.select`·`표.update`·`표.insert`). */
  calls: string[]
  /** 표별 update 본문. */
  updates: Row[]
  /** select에 넘긴 칸 목록. */
  selects: string[]
  client: BalanceServiceClient
}

export function createFakeDb(tables: Record<string, Row[]>): FakeDb {
  const db: FakeDb = {
    tables: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))])),
    readErrors: {},
    writeErrors: {},
    beforeUpdate: null,
    failUpdateFrom: {},
    calls: [],
    updates: [],
    selects: [],
    client: undefined as unknown as BalanceServiceClient,
  }
  let updateCount = 0

  class Query implements PromiseLike<Result> {
    private mode: 'select' | 'update' | 'insert' = 'select'
    private patch: Row = {}
    private inserted: Row = {}
    private filters: Array<(row: Row) => boolean> = []
    private orderBy: { col: string; ascending: boolean } | null = null
    private max: number | null = null
    constructor(private table: string) {}
    select(columns?: string) {
      if (this.mode === 'select') db.calls.push(`${this.table}.select`)
      if (columns) db.selects.push(columns)
      return this
    }
    update(patch: Row) {
      db.calls.push(`${this.table}.update`)
      this.mode = 'update'
      this.patch = patch
      return this
    }
    insert(row: Row) {
      db.calls.push(`${this.table}.insert`)
      this.mode = 'insert'
      this.inserted = row
      return this
    }
    eq(col: string, val: unknown) {
      this.filters.push((row) => row[col] === val)
      return this
    }
    in(col: string, vals: unknown[]) {
      this.filters.push((row) => vals.includes(row[col]))
      return this
    }
    order(col: string, opts?: { ascending?: boolean }) {
      this.orderBy = { col, ascending: opts?.ascending ?? true }
      return this
    }
    limit(n: number) {
      this.max = n
      return this
    }
    async maybeSingle() {
      const result = await this.run()
      const rows = (result.data as Row[] | null) ?? []
      return { data: rows[0] ?? null, error: result.error }
    }
    private run(): Promise<Result> {
      const rows = (db.tables[this.table] ??= [])
      if (this.mode === 'select') {
        const readError = db.readErrors[this.table]
        if (readError) return Promise.resolve({ data: null, error: { message: readError } })
        let hit = rows.filter((row) => this.filters.every((f) => f(row))).map((row) => ({ ...row }))
        if (this.orderBy) {
          const { col, ascending } = this.orderBy
          hit = hit.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (ascending ? 1 : -1))
        }
        if (this.max !== null) hit = hit.slice(0, this.max)
        return Promise.resolve({ data: hit, error: null })
      }
      const writeError = db.writeErrors[this.table]
      if (this.mode === 'insert') {
        if (writeError) return Promise.resolve({ data: null, error: { message: writeError } })
        rows.push({ id: `row-${rows.length + 1}`, created_at: `2026-10-22T0${rows.length}:00:00.000+00:00`, ...this.inserted })
        return Promise.resolve({ data: null, error: null })
      }
      updateCount += 1
      db.beforeUpdate?.(updateCount)
      const failFrom = db.failUpdateFrom[this.table]
      if (writeError || (failFrom !== undefined && updateCount >= failFrom)) {
        return Promise.resolve({ data: null, error: { message: writeError ?? '업데이트 실패' } })
      }
      const hit = rows.filter((row) => this.filters.every((f) => f(row)))
      db.updates.push(this.patch)
      for (const row of hit) Object.assign(row, this.patch)
      return Promise.resolve({ data: hit.map((row) => ({ ...row })), error: null })
    }
    then<T1, T2 = never>(
      onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
    ): PromiseLike<T1 | T2> {
      return this.run().then(onfulfilled, onrejected)
    }
  }

  db.client = { from: (table: string) => new Query(table) } as unknown as BalanceServiceClient
  return db
}

export const JAM_ROW_STAMP = '2026-10-22T01:00:00.123456+00:00'

/**
 * `jam_policy` id=1 행(마이그레이션 226·227·231 기본값). NUMERIC 칸(`mass_earn_alert_multiplier`·`sync_item_bonus_max_probability`·`sync_rarity_*`·`locked_roll_probability`)은
 * 문자열로 내려오는 경우를 흉내 낸다.
 */
export function jamPolicyRow(overrides: Row = {}): Row {
  return {
    id: 1,
    intensity_light: 1,
    intensity_normal: 2,
    intensity_hard: 3,
    mass_earn_alert_multiplier: '3.00',
    mass_earn_alert_weeks: 4,
    mass_earn_alert_no_history_amount: 1200,
    sync_item_guaranteed: 1,
    sync_item_guaranteed_hiking: 2,
    sync_item_bonus_rolls: 2,
    sync_item_bonus_jam_divisor: 600,
    sync_item_bonus_max_probability: '0.250',
    sync_rarity_common: '84.000',
    sync_rarity_rare: '13.000',
    sync_rarity_epic: '2.500',
    sync_rarity_mystic: '0.500',
    common_streak_threshold: 10,
    locked_min_common: 30,
    locked_roll_probability: '0.250',
    updated_at: JAM_ROW_STAMP,
    ...overrides,
  }
}

export const CAPSULE_ROW_STAMP = '2026-10-22T01:05:00.5+00:00'

/** `capsule_policy` id=1 행(마이그레이션 232 기본값). NUMERIC 칸은 문자열로 내려오는 경우를 흉내 낸다. */
export function capsulePolicyRow(overrides: Row = {}): Row {
  return {
    id: 1,
    guaranteed_count: 1,
    bonus_count: 1,
    bonus_probability: '0.200',
    other_tribe_probability: '0.200',
    rarity_common: '70.000',
    rarity_rare: '22.000',
    rarity_epic: '6.000',
    rarity_mystic: '2.000',
    pity_epic_threshold: 15,
    pre_quest_fill_amount: 5,
    pre_quest_unlock_required: 5,
    updated_at: CAPSULE_ROW_STAMP,
    ...overrides,
  }
}

const CHAPTER_DEFAULT_FILL = [90, 100, 110, 120, 135, 150, 165, 180, 200, 220]

/** `capsule_chapter_costs` 챕터 1~10 행(마이그레이션 232 시드). 행마다 수정 시각을 따로 줄 수 있다. */
export function chapterCostRows(stamp: string = CAPSULE_ROW_STAMP): Row[] {
  return CHAPTER_DEFAULT_FILL.map((fill_amount, index) => ({ chapter_no: index + 1, fill_amount, updated_at: stamp }))
}
