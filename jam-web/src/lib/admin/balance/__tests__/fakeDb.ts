/**
 * 밸런스 설정 시험용 가짜 서비스 클라이언트 — 메모리 안의 표 몇 개로 `from(표).select/update/insert/upsert/eq/in/order/limit`을 흉내 낸다.
 * 실 DB에는 접속하지 않는다(공용 DB에 쓰는 코드는 시험에서 가짜 클라이언트로만 돌린다).
 */
import type { BalanceServiceClient } from '../types'

export type Row = Record<string, unknown>
type Result = { data: unknown; error: { message: string } | null; count?: number }
type RpcResult = { data: unknown; error: { message: string } | null }

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
  /** 실행한 일을 순서대로 적는다(`표.select`·`표.update`·`표.insert`·`표.upsert`). */
  calls: string[]
  /** 표별 update 본문. */
  updates: Row[]
  /** upsert에 넘긴 본문(표 구분 없이 순서대로). 가짜 upsert는 `id`가 같은 행을 갱신하고 없으면 새로 넣는다(`id` 한 칸으로 가리는 싱글톤 표만 흉내 낸다). */
  upserts: Row[]
  /** select에 넘긴 칸 목록. */
  selects: string[]
  /** `rpc`를 부른 기록(이름과 인자). */
  rpcCalls: Array<{ name: string; args: Row }>
  /** RPC 이름 → 응답을 만드는 함수. 없는 이름을 부르면 오류로 답한다. `set_inventory_max_slots`는 기본으로 들어 있다. */
  rpcHandlers: Record<string, (args: Row) => RpcResult>
  /** 기본 `set_inventory_max_slots`가 `inventory_policy.updated_at`에 쓰는 시각(실 RPC는 `now()`). */
  rpcStamp: string
  /** `order`를 부른 기록(`표.order:칸`). 정렬해서 읽는지 가린다. */
  orders: string[]
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
    upserts: [],
    selects: [],
    rpcCalls: [],
    rpcHandlers: {},
    rpcStamp: INVENTORY_RPC_STAMP,
    orders: [],
    client: undefined as unknown as BalanceServiceClient,
  }
  let updateCount = 0

  class Query implements PromiseLike<Result> {
    private mode: 'select' | 'update' | 'insert' | 'upsert' = 'select'
    private patch: Row = {}
    private inserted: Row = {}
    private upserted: Row = {}
    private filters: Array<(row: Row) => boolean> = []
    private orderBy: { col: string; ascending: boolean } | null = null
    private max: number | null = null
    private countHead = false
    constructor(private table: string) {}
    select(columns?: string, options?: { count?: 'exact'; head?: boolean }) {
      if (this.mode === 'select') db.calls.push(`${this.table}.select`)
      if (columns) db.selects.push(columns)
      if (options?.count === 'exact' && options.head === true) this.countHead = true
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
    upsert(row: Row) {
      db.calls.push(`${this.table}.upsert`)
      this.mode = 'upsert'
      this.upserted = row
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
      db.orders.push(`${this.table}.order:${col}`)
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
        // `select('*', { count: 'exact', head: true })`: 행은 주지 않고 개수만 돌려준다(적용 대상 유저 수 조회)
        if (this.countHead) return Promise.resolve({ data: null, error: null, count: hit.length })
        return Promise.resolve({ data: hit, error: null })
      }
      const writeError = db.writeErrors[this.table]
      if (this.mode === 'insert') {
        if (writeError) return Promise.resolve({ data: null, error: { message: writeError } })
        rows.push({ id: `row-${rows.length + 1}`, created_at: `2026-10-22T0${rows.length}:00:00.000+00:00`, ...this.inserted })
        return Promise.resolve({ data: null, error: null })
      }
      if (this.mode === 'upsert') {
        if (writeError) return Promise.resolve({ data: null, error: { message: writeError } })
        db.upserts.push(this.upserted)
        const existing = rows.find((row) => row.id === this.upserted.id)
        if (existing) Object.assign(existing, this.upserted)
        else rows.push({ ...this.upserted })
        return Promise.resolve({ data: [{ ...(existing ?? this.upserted) }], error: null })
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

  db.rpcHandlers.set_inventory_max_slots = (args) => setInventoryMaxSlots(db, args)
  db.client = {
    from: (table: string) => new Query(table),
    rpc: async (name: string, args: Row = {}) => {
      db.calls.push(`rpc.${name}`)
      db.rpcCalls.push({ name, args })
      const handler = db.rpcHandlers[name]
      return handler ? handler(args) : { data: null, error: { message: `가짜 RPC가 없음: ${name}` } }
    },
  } as unknown as BalanceServiceClient
  return db
}

/**
 * `set_inventory_max_slots`(마이그레이션 129)의 흉내: 1 미만이면 `INVENTORY_MAX_SLOTS_INVALID:`, 새 최대치보다 많이 가진 유저가 있으면 `INVENTORY_MAX_SLOTS_OVER_LIMIT:`로 막고,
 * 아니면 `inventory` 전체 행과 `inventory_policy` id=1(`updated_at`은 `db.rpcStamp`)을 바꾸고 바뀐 `inventory` 행 수를 돌려준다. 던지는 문장은 SQL의 것과 같다.
 */
function setInventoryMaxSlots(db: FakeDb, args: Row): RpcResult {
  const maxSlots = args.p_max_slots
  if (typeof maxSlots !== 'number' || maxSlots < 1) {
    return { data: null, error: { message: `INVENTORY_MAX_SLOTS_INVALID: max_slots는 1 이상의 정수여야 합니다. (받은 값: ${String(maxSlots)})` } }
  }
  const inventory = (db.tables.inventory ??= [])
  const overCount = inventory.filter((row) => Number(row.used_slots) > maxSlots).length
  if (overCount > 0) {
    return {
      data: null,
      error: { message: `INVENTORY_MAX_SLOTS_OVER_LIMIT: ${overCount}명의 유저가 이미 ${maxSlots}개보다 많은 아이템을 보유하고 있어 적용할 수 없습니다.` },
    }
  }
  for (const row of inventory) row.max_slots = maxSlots
  const policy = (db.tables.inventory_policy ??= [])
  const row = policy.find((entry) => entry.id === 1)
  if (row) Object.assign(row, { max_slots: maxSlots, updated_at: db.rpcStamp })
  else policy.push({ id: 1, max_slots: maxSlots, updated_at: db.rpcStamp })
  return { data: inventory.length, error: null }
}

export const INVENTORY_ROW_STAMP = '2026-10-22T01:30:00.75+00:00'
export const INVENTORY_RPC_STAMP = '2026-10-22T03:00:00.5+00:00'

/** `inventory_policy` id=1 행(마이그레이션 129). 코드 기본값은 50이지만 운영은 어드민 설정으로 정한 값을 쓰므로 시험은 10으로 둔다. */
export function inventoryPolicyRow(overrides: Row = {}): Row {
  return { id: 1, max_slots: 10, updated_at: INVENTORY_ROW_STAMP, ...overrides }
}

/** `inventory` 행(유저당 하나). 사용 칸과 최대 칸만 흉내 낸다. */
export function inventoryRows(count: number, usedSlots = 0, maxSlots = 10): Row[] {
  return Array.from({ length: count }, (_, index) => ({ user_id: `user-${index + 1}`, used_slots: usedSlots, max_slots: maxSlots }))
}

export const JAM_ROW_STAMP = '2026-10-22T01:00:00.123456+00:00'

/**
 * `jam_policy` id=1 행(마이그레이션 226·227·231·300 기본값). NUMERIC 칸(`mass_earn_alert_multiplier`·`sync_item_bonus_max_probability`·`sync_rarity_*`·`locked_roll_probability`)은
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
    locked_min_rare: 60,
    locked_min_epic: 120,
    locked_min_mystic: 240,
    locked_points_common: 50,
    locked_points_rare: 100,
    locked_points_epic: 200,
    locked_points_mystic: 400,
    locked_roll_probability: '0.250',
    service_jam_daily_cap: 40,
    service_jam_weekly_cap: 100,
    updated_at: JAM_ROW_STAMP,
    ...overrides,
  }
}

export const SERVICE_JAM_RULE_ROW_STAMP = '2026-10-29T01:00:00.5+00:00'

/** `service_jam_rules` 7행(마이그레이션 300 시드). 순서는 일부러 섞어 두어 읽기가 정렬하는지 가린다. */
export function serviceJamRuleRows(stamp: string = SERVICE_JAM_RULE_ROW_STAMP): Row[] {
  return [
    { kind: 'pickup', amount: 0, updated_at: stamp },
    { kind: 'mission_complete', amount: 20, updated_at: stamp },
    { kind: 'locked_unlock', amount: 5, updated_at: stamp },
    { kind: 'drop', amount: 0, updated_at: stamp },
    { kind: 'collection_complete', amount: 30, updated_at: stamp },
    { kind: 'badge_earned', amount: 5, updated_at: stamp },
    { kind: 'combine_success', amount: 5, updated_at: stamp },
  ]
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
const CHAPTER_DEFAULT_FILL_V2 = [145, 160, 180, 200, 220, 245, 270, 300, 330, 365]
/** 챕터 10은 마지막이라 NULL이 정상이다. */
const CHAPTER_DEFAULT_ADVANCE = [6, 7, 7, 8, 9, 9, 10, 11, 12, null]

/** `capsule_chapter_costs` 챕터 1~10 행(마이그레이션 232 시드 + 300의 `fill_amount_v2`·`advance_count`). 행마다 수정 시각을 따로 줄 수 있다. */
export function chapterCostRows(stamp: string = CAPSULE_ROW_STAMP): Row[] {
  return CHAPTER_DEFAULT_FILL.map((fill_amount, index) => ({
    chapter_no: index + 1,
    fill_amount,
    fill_amount_v2: CHAPTER_DEFAULT_FILL_V2[index],
    advance_count: CHAPTER_DEFAULT_ADVANCE[index],
    updated_at: stamp,
  }))
}

export const TIER_REWARD_ROW_STAMP = '2026-10-22T01:10:00.25+00:00'
export const COMBINE_ROW_STAMP = '2026-10-22T01:12:00+00:00'

/** `item_book_tier_default_rewards` 네 등급 행(마이그레이션 222 시드). 행마다 수정 시각을 따로 줄 수 있다. */
export function tierDefaultRewardRows(stamp: string = TIER_REWARD_ROW_STAMP): Row[] {
  return [
    { tier: 'common', reward_points: 100, updated_at: stamp },
    { tier: 'rare', reward_points: 200, updated_at: stamp },
    { tier: 'epic', reward_points: 400, updated_at: stamp },
    { tier: 'mystic', reward_points: 800, updated_at: stamp },
  ]
}

/** `combine_policy` id=1 행(마이그레이션 153 기본값, 마이그레이션 287의 `tier_up_probability` 기본값 0.7). */
export function combinePolicyRow(overrides: Row = {}): Row {
  return { id: 1, fail_reward_points: 10, tier_up_probability: 0.7, updated_at: COMBINE_ROW_STAMP, ...overrides }
}

export const CHAPTER_DEFINITION_ROW_STAMP = '2026-10-22T01:20:00.5+00:00'
export const CHAPTER_RULE_ROW_STAMP = '2026-10-22T01:22:00+00:00'

const CHAPTER_DEFAULT_REQUIRED = [0, 1000, 2300, 3800, 5700, 8500, 11500, 15000, 19000, 23000]

/** `chapter_definitions` 챕터 1~10 행(마이그레이션 221 시드). 행마다 수정 시각을 따로 줄 수 있다. */
export function chapterDefinitionRows(stamp: string = CHAPTER_DEFINITION_ROW_STAMP): Row[] {
  return CHAPTER_DEFAULT_REQUIRED.map((required_score, index) => ({ chapter_no: index + 1, required_score, updated_at: stamp }))
}

const CHAPTER_RULE_SEED: ReadonlyArray<[string, number, number | null]> = [
  ['jam_earned', 1, 300],
  ['capsule_open', 20, null],
  ['locked_item_badge_open', 10, null],
  ['badge_receive', 10, null],
  ['collection_complete_common', 100, null],
  ['collection_complete_rare', 200, null],
  ['collection_complete_epic', 400, null],
  ['collection_complete_mystic', 800, null],
  ['mix_success', 20, null],
  ['mission_complete', 50, null],
  ['drop', 5, null],
  ['pickup', 5, null],
]

/**
 * `chapter_score_rules` 활동 12행(마이그레이션 221 시드). NUMERIC 칸(`points_per_unit`·`over_cap_ratio`)은 문자열로 내려오는 경우를 흉내 낸다.
 * 행마다 수정 시각을 따로 줄 수 있다.
 */
export function chapterScoreRuleRows(stamp: string = CHAPTER_RULE_ROW_STAMP): Row[] {
  return CHAPTER_RULE_SEED.map(([activity_kind, points, weekly_cap]) => ({
    activity_kind,
    points_per_unit: points.toFixed(2),
    weekly_cap,
    over_cap_ratio: '0.500',
    updated_at: stamp,
  }))
}

export const ABUSING_ROW_STAMP = '2026-10-24T01:40:00.25+00:00'

/**
 * `abusing_policy` id=1 행(마이그레이션 010·011·078·148·224 기본값, 코드의 `DEFAULT_POLICY`와 같다). 모두 INTEGER 칸이다.
 * 옛 섀도우밴 배율 8열(`soft_*_rate`·`hard_*_rate`)은 DB에 아직 남아 있지만(티켓 20261021_1250, 열 정리는 출시 뒤 SQL) 이 구역이 읽지도 쓰지도 않아 흉내 내지 않는다.
 */
export function abusingPolicyRow(overrides: Row = {}): Row {
  return {
    id: 1,
    gps_max_speed_kmh: 300,
    gps_daily_distance_cap_km: 3000,
    vehicle_speed_filter_kmh: 60,
    transit_walk_max_speed_kmh: 20,
    transit_run_max_speed_kmh: 27,
    transit_cycling_max_speed_kmh: 55,
    transit_segment_min_duration_sec: 30,
    mismatch_run_min_speed_kmh: 6,
    mismatch_cycling_min_speed_kmh: 10,
    poi_block_hours: 72,
    updated_at: ABUSING_ROW_STAMP,
    ...overrides,
  }
}

export const AMBIENT_ROW_STAMP = '2026-10-24T02:10:00.5+00:00'

/**
 * `ambient_drop_config` id=1 행(마이그레이션 104·137). 숫자 8칸(배포 시각·상호 배제 창·배치 규모·지점당 한도·등급 비율 4칸)은 이 구역이 읽고 쓰는 칸이고,
 * 스위치·세 축 고르기·`last_auto_run_on`은 이 구역이 읽지도 쓰지도 않는 칸이다. 등급 비율은 `NUMERIC(4,3)`(0~1)이라 문자열로 내려오는 경우를 흉내 낸다.
 */
export function ambientDropConfigRow(overrides: Row = {}): Row {
  return {
    id: 1,
    auto_enabled: true,
    schedule_hour_kst: 3,
    last_auto_run_on: '2026-10-23',
    exclusion_window_minutes: 15,
    category_mode: 'explicit',
    category_slug: 'cafe',
    rarity_mode: 'explicit',
    rarity_common: '0.600',
    rarity_rare: '0.300',
    rarity_epic: '0.100',
    rarity_mystic: '0.000',
    collection_mode: 'explicit',
    collection_ids: ['5d6b3a38-5c8e-4b4a-9a52-0a1b2c3d4e5f'],
    batch_size: 30,
    max_active_per_poi: 1,
    updated_at: AMBIENT_ROW_STAMP,
    ...overrides,
  }
}

export const BADGEPOINTS_ROW_STAMP = '2026-10-24T03:00:00.5+00:00'

/** `badge_point_policy` id=1 행(마이그레이션 288 기본값, 코드의 `DEFAULT_BADGE_POINT_POLICY`와 같다). 모두 INTEGER 칸이다. */
export function badgePointPolicyRow(overrides: Row = {}): Row {
  return {
    id: 1,
    common_points: 10,
    rare_points: 20,
    epic_points: 50,
    mystic_points: 100,
    leveled_points: 10,
    updated_at: BADGEPOINTS_ROW_STAMP,
    ...overrides,
  }
}
