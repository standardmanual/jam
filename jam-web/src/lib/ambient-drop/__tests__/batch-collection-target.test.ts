/**
 * runAmbientDropBatch — 대상 컬렉션 축이 노출 중 컬렉션만 쓰는지 (티켓 20260930_1516)
 *
 * `collection-target.test.ts`가 판정 함수를 검증하고, 이 테스트는 배치가 그 결과를 실제로 따르는지 본다.
 *  - random: 기간이 끝난 컬렉션을 고르지 않는다
 *  - explicit: 비활성·기간 밖 컬렉션에는 드랍하지 않는다
 *  - explicit 「전체」: 후보 배지가 노출 중 컬렉션의 배지로만 좁혀진다
 *  - 노출 중 컬렉션이 없으면 모든 컬렉션으로 넓어지지 않고 `no_eligible_collection`으로 건너뛴다(POI 조회 전)
 *
 * Supabase 모킹은 `eq`·`in`·`or` 조건을 행에 실제로 적용한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/ambient-drop/__tests__/batch-collection-target.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AmbientDropConfig } from '../config'

const NOW = '2026-10-01T03:00:00.000Z'

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  tables: {} as Record<string, Row[]>,
  /** 조회한 테이블 순서 — POI 조회 전에 건너뛰는지 확인한다 */
  fromCalls: [] as string[],
  rpcCalls: [] as {
    name: string
    args: { p_poi_id: string; p_badge_id: string; p_lock_reason?: string; p_unlock_required?: number }
  }[],
}))

const logMock = vi.hoisted(() => vi.fn())

function matchesOr(row: Row, expr: string): boolean {
  return expr.split(',').some((part) => {
    const [column, op, ...rest] = part.split('.')
    const value = rest.join('.')
    const cell = row[column] as string | null | undefined
    if (op === 'is') return value === 'null' && (cell === null || cell === undefined)
    if (cell === null || cell === undefined) return false
    const left = new Date(cell).getTime()
    const right = new Date(value).getTime()
    if (op === 'lte') return left <= right
    if (op === 'gte') return left >= right
    throw new Error(`테스트 모킹이 모르는 or 연산자: ${op}`)
  })
}

function makeBuilder(table: string) {
  state.fromCalls.push(table)
  let rows = [...(state.tables[table] ?? [])]
  const builder = {
    select: () => builder,
    in(column: string, ids: unknown[]) {
      rows = rows.filter((r) => ids.includes(r[column]))
      return builder
    },
    eq(column: string, value: unknown) {
      rows = rows.filter((r) => r[column] === value)
      return builder
    },
    is(column: string, value: null) {
      rows = rows.filter((r) => (r[column] ?? null) === value)
      return builder
    },
    not(column: string, op: string, value: null) {
      if (op !== 'is') throw new Error(`테스트 모킹이 모르는 not 연산자: ${op}`)
      rows = rows.filter((r) => (r[column] ?? null) !== value)
      return builder
    },
    or(expr: string) {
      rows = rows.filter((r) => matchesOr(r, expr))
      return builder
    },
    then: (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
  }
  return builder
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => makeBuilder(table),
    rpc: async (
      name: string,
      args: { p_poi_id: string; p_badge_id: string; p_lock_reason?: string; p_unlock_required?: number }
    ) => {
      state.rpcCalls.push({ name, args })
      const n = state.rpcCalls.length
      return { data: { ok: true, drop_id: `drop-${n}`, inventory_item_id: `inv-item-${n}` }, error: null }
    },
  }),
}))
vi.mock('../config', () => ({ getAmbientDropConfig: async () => state.config }))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: logMock }))
// 실제 fetchAllRows는 페이지 조회(.order().range())를 붙인다 — 이 테스트의 관심사가 아니라 한 번에 읽는다
vi.mock('@/lib/notifications/batch/shared', () => ({
  fetchAllRows: async <T>(_label: string, _orderBy: unknown, query: () => PromiseLike<{ data: T[] }>) => (await query()).data,
  fetchAllRowsIn: async <T, V>(
    _label: string,
    _orderBy: unknown,
    values: readonly V[],
    query: (chunk: V[]) => PromiseLike<{ data: T[] }>
  ) => (values.length === 0 ? [] : (await query([...new Set(values)])).data),
}))
// 잠김으로 만든 배지의 필요한 양(등급 최소값)을 읽는 정책 — 값은 이 테스트가 정한다
vi.mock('@/lib/jam/policy', () => ({
  getJamPolicy: async () => ({
    locked_min_common: 3,
    locked_min_rare: 5,
    locked_min_epic: 8,
    locked_min_mystic: 12,
    locked_roll_probability: 0,
  }),
}))

import { runAmbientDropBatch } from '../index'

function book(id: string, overrides: Row = {}): Row {
  return { id, is_active: true, valid_from: null, valid_until: null, drop_excluded: false, ...overrides }
}

function itemBadge(id: string, itemBookId: string, overrides: Row = {}): Row {
  return {
    id,
    type: 'item',
    rarity: 'common',
    always_locked: false,
    unlock_required: null,
    deleted_at: null,
    item_book_id: itemBookId,
    valid_from: null,
    valid_until: null,
    drop_excluded: false,
    ...overrides,
  }
}

const LIVE = 'book-live'
const ENDED = 'book-ended'
const FUTURE = 'book-future'
const INACTIVE = 'book-inactive'
const EXCLUDED = 'book-drop-excluded'

function baseConfig(overrides: Partial<AmbientDropConfig> = {}): Record<string, unknown> {
  return {
    auto_enabled: true,
    category_mode: 'explicit',
    category_slug: null,
    rarity_mode: 'explicit',
    rarity_common: 1,
    rarity_rare: 0,
    rarity_epic: 0,
    rarity_mystic: 0,
    collection_mode: 'explicit',
    collection_ids: [],
    batch_size: 6,
    max_active_per_poi: 1,
    ...overrides,
  }
}

function pickedBadgeIds(): string[] {
  return state.rpcCalls.map((c) => c.args.p_badge_id)
}

/** 마지막으로 남긴 `ambient_batch_result` 로그의 페이로드 */
function lastLogged(): Record<string, unknown> {
  const calls = logMock.mock.calls
  return calls[calls.length - 1][3] as Record<string, unknown>
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(NOW))
  vi.clearAllMocks()
  state.fromCalls = []
  state.rpcCalls = []
  state.config = baseConfig()
  state.tables = {
    poi_categories: [{ slug: 'cafe' }],
    poi: ['poi-1', 'poi-2', 'poi-3', 'poi-4', 'poi-5', 'poi-6'].map((id) => ({ id, is_active: true, category: 'cafe' })),
    poi_drops: [],
    item_books: [
      // 기간이 끝났지만 활성 — 예전 random 모드는 이것도 골랐다
      book(ENDED, { valid_from: '2026-08-01T00:00:00+00:00', valid_until: '2026-09-30T00:00:00+00:00' }),
      book(FUTURE, { valid_from: '2026-10-05T00:00:00+00:00' }),
      book(INACTIVE, { is_active: false }),
      book(LIVE, { valid_from: '2026-09-01T00:00:00+00:00', valid_until: '2026-12-31T00:00:00+00:00' }),
    ],
    badges: [
      itemBadge('badge-ended', ENDED),
      itemBadge('badge-future', FUTURE),
      itemBadge('badge-inactive', INACTIVE),
      itemBadge('badge-live', LIVE),
    ],
  }
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('random 모드', () => {
  beforeEach(() => {
    state.config = baseConfig({ collection_mode: 'random' })
    // 첫 번째 후보를 고르게 한다 — 필터가 없으면 목록 맨 앞의 기간 끝난 컬렉션이 뽑힌다
    vi.spyOn(Math, 'random').mockReturnValue(0)
  })

  it('기간이 끝난 컬렉션·공개 전 컬렉션이 아니라 노출 중 컬렉션을 고른다', async () => {
    const result = await runAmbientDropBatch('manual')

    expect(result.effectiveCollectionIds).toEqual([LIVE])
    expect(result.reason).toBeUndefined()
    expect(result.spawned).toBeGreaterThan(0)
    expect(new Set(pickedBadgeIds())).toEqual(new Set(['badge-live']))
  })

  it('노출 중 컬렉션이 없으면 모든 컬렉션으로 넓어지지 않고 POI를 조회하기 전에 건너뛴다', async () => {
    state.tables.item_books = [
      book(ENDED, { valid_until: '2026-09-30T00:00:00+00:00' }),
      book(FUTURE, { valid_from: '2026-10-05T00:00:00+00:00' }),
      book(INACTIVE, { is_active: false }),
    ]
    const result = await runAmbientDropBatch('manual')

    expect(result.reason).toBe('no_eligible_collection')
    expect(result.spawned).toBe(0)
    expect(state.rpcCalls).toHaveLength(0)
    expect(state.fromCalls).not.toContain('poi')
    expect(state.fromCalls).not.toContain('badges')
    expect(lastLogged()).toMatchObject({ reason: 'no_eligible_collection', spawned: 0 })
  })
})

describe('explicit 모드 — 컬렉션을 지정함', () => {
  it('비활성·기간 밖 컬렉션은 빼고 노출 중인 컬렉션에만 드랍하고, 뺀 것을 결과와 로그에 남긴다', async () => {
    state.config = baseConfig({ collection_ids: [LIVE, INACTIVE, ENDED, FUTURE] })
    const result = await runAmbientDropBatch('manual')

    expect(result.effectiveCollectionIds).toEqual([LIVE])
    expect(result.excludedCollectionIds).toEqual([INACTIVE, ENDED, FUTURE])
    expect(new Set(pickedBadgeIds())).toEqual(new Set(['badge-live']))
    expect(lastLogged()).toMatchObject({ excludedCollectionIds: [INACTIVE, ENDED, FUTURE] })
  })

  it('지정한 컬렉션이 하나도 노출 중이 아니면 드랍하지 않고 사유와 뺀 목록을 남긴다', async () => {
    state.config = baseConfig({ collection_ids: [INACTIVE, ENDED] })
    const result = await runAmbientDropBatch('manual')

    expect(result.reason).toBe('no_eligible_collection')
    expect(result.excludedCollectionIds).toEqual([INACTIVE, ENDED])
    expect(result.spawned).toBe(0)
    expect(state.rpcCalls).toHaveLength(0)
    expect(state.fromCalls).not.toContain('poi')
  })
})

describe('explicit 「전체」 (collection_ids가 빈 배열)', () => {
  it('후보 배지가 노출 중 컬렉션의 배지로만 좁혀진다', async () => {
    const result = await runAmbientDropBatch('manual')

    expect(result.effectiveCollectionIds).toEqual([])
    expect(result.reason).toBeUndefined()
    expect(result.spawned).toBeGreaterThan(0)
    expect(new Set(pickedBadgeIds())).toEqual(new Set(['badge-live']))
  })

  it('노출 중 컬렉션이 없으면 모든 컬렉션으로 넓어지지 않고 건너뛴다', async () => {
    state.tables.item_books = [book(ENDED, { valid_until: '2026-09-30T00:00:00+00:00' }), book(INACTIVE, { is_active: false })]
    const result = await runAmbientDropBatch('manual')

    expect(result.reason).toBe('no_eligible_collection')
    expect(state.rpcCalls).toHaveLength(0)
  })
})

// 드랍 제외(`drop_excluded`)는 활동 드랍과 같은 조건으로 정기·즉시 배포에도 적용된다 (티켓 20261005_1957)
describe('드랍 제외 — 컬렉션·아이템 모두 후보에서 뺀다', () => {
  beforeEach(() => {
    // 노출 중이지만 컬렉션째 드랍 제외인 컬렉션을 목록 맨 앞에 둔다 — 필터가 없으면 첫 후보로 뽑힌다
    state.tables.item_books = [book(EXCLUDED, { drop_excluded: true }), book(LIVE)]
    state.tables.badges = [
      itemBadge('badge-in-excluded-book', EXCLUDED),
      itemBadge('badge-live', LIVE),
      itemBadge('badge-live-excluded', LIVE, { drop_excluded: true }),
    ]
  })

  it('random: 드랍 제외 컬렉션은 고르지 않는다', async () => {
    state.config = baseConfig({ collection_mode: 'random' })
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const result = await runAmbientDropBatch('manual')

    expect(result.effectiveCollectionIds).toEqual([LIVE])
    expect(new Set(pickedBadgeIds())).toEqual(new Set(['badge-live']))
  })

  it('random: 드랍 제외 컬렉션만 있으면 모든 컬렉션으로 넓어지지 않고 건너뛴다', async () => {
    state.config = baseConfig({ collection_mode: 'random' })
    state.tables.item_books = [book(EXCLUDED, { drop_excluded: true })]
    const result = await runAmbientDropBatch('manual')

    expect(result.reason).toBe('no_eligible_collection')
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('explicit 컬렉션 지정: 드랍 제외 컬렉션은 빼고 사유와 함께 결과에 남긴다', async () => {
    state.config = baseConfig({ collection_ids: [LIVE, EXCLUDED] })
    const result = await runAmbientDropBatch('manual')

    expect(result.effectiveCollectionIds).toEqual([LIVE])
    expect(result.excludedCollectionIds).toEqual([EXCLUDED])
    expect(new Set(pickedBadgeIds())).toEqual(new Set(['badge-live']))
  })

  it('explicit 「전체」: 드랍 제외 컬렉션의 배지와 드랍 제외 배지는 후보가 아니다', async () => {
    const result = await runAmbientDropBatch('manual')

    expect(result.reason).toBeUndefined()
    expect(result.spawned).toBeGreaterThan(0)
    expect(new Set(pickedBadgeIds())).toEqual(new Set(['badge-live']))
  })

  it('노출 중 컬렉션의 배지가 전부 드랍 제외면 후보가 없어 건너뛴다(no_candidate_badges)', async () => {
    state.tables.badges = [itemBadge('badge-live-excluded', LIVE, { drop_excluded: true })]
    const result = await runAmbientDropBatch('manual')

    expect(result.reason).toBe('no_candidate_badges')
    expect(state.rpcCalls).toHaveLength(0)
  })
})

// 티켓 20261018_1813 — «전체 무작위» 설정은 더는 보지 않는다. 각 축의 모드(지정/무작위)만 따른다.
// 티켓 20261022_0938 — 설정 객체에서 그 칸을 지웠다(DB 행에 남은 칸을 설정 로더가 싣지 않는 것은 config-load.test.ts).
describe('각 축의 설정을 따른다', () => {
  const LIVE2 = 'book-live-2'

  beforeEach(() => {
    // 운영 DB 행과 같은 모양: 등급 Common 100% + 컬렉션 지정 + 카테고리 무작위
    state.config = baseConfig({ category_mode: 'random', collection_ids: [LIVE] })
    state.tables.item_books = [book(LIVE), book(LIVE2)]
    state.tables.badges = [
      itemBadge('badge-live', LIVE),
      itemBadge('badge-live-rare', LIVE, { rarity: 'rare' }),
      itemBadge('badge-live2', LIVE2),
    ]
    vi.spyOn(Math, 'random').mockReturnValue(0)
  })

  it('컬렉션 축: 지정한 컬렉션의 배지에서만 고른다', async () => {
    const result = await runAmbientDropBatch('manual')

    expect(result.effectiveCollectionIds).toEqual([LIVE])
    expect(pickedBadgeIds().length).toBeGreaterThan(0)
    expect(pickedBadgeIds()).not.toContain('badge-live2')
  })

  it('등급 축: 지정한 비율(Common 100%)대로 Common 배지만 고른다', async () => {
    const result = await runAmbientDropBatch('manual')

    expect(result.effectiveRarityDistribution).toEqual({ common: 1, rare: 0, epic: 0, mystic: 0 })
    expect(new Set(pickedBadgeIds())).toEqual(new Set(['badge-live']))
  })

  it('카테고리 축: 지정한 카테고리의 장소에만 놓는다', async () => {
    state.config = baseConfig({ category_mode: 'explicit', category_slug: 'cafe', collection_ids: [LIVE] })
    state.tables.poi = [
      { id: 'poi-cafe', is_active: true, category: 'cafe' },
      { id: 'poi-park', is_active: true, category: 'park' },
    ]
    const result = await runAmbientDropBatch('manual')

    expect(result.effectiveCategorySlug).toBe('cafe')
    expect(state.rpcCalls.map((c) => c.args.p_poi_id)).toEqual(['poi-cafe'])
  })
})

// 티켓 20261018_1813 — 잠김으로 만든 배지는 잠긴 채 놓고, 공개 기간이 끝난 배지는 놓지 않는다
describe('잠긴 채 놓기와 놓지 않는 것', () => {
  beforeEach(() => {
    state.config = baseConfig({ collection_ids: [LIVE], batch_size: 1 })
    state.tables.item_books = [book(LIVE)]
    state.tables.poi = [{ id: 'poi-1', is_active: true, category: 'cafe' }]
  })

  it('잠김으로 만든 배지는 mint_and_place_ambient_drop_locked로 놓고 필요한 양은 배지 값이다', async () => {
    state.tables.badges = [itemBadge('badge-locked', LIVE, { always_locked: true, unlock_required: 7 })]
    const result = await runAmbientDropBatch('manual')

    expect(result.spawned).toBe(1)
    expect(state.rpcCalls).toEqual([
      {
        name: 'mint_and_place_ambient_drop_locked',
        args: { p_poi_id: 'poi-1', p_badge_id: 'badge-locked', p_lock_reason: 'badge_locked', p_unlock_required: 7 },
      },
    ])
  })

  it('배지에 필요한 양이 없으면 등급 최소값으로 고정한다', async () => {
    state.tables.badges = [itemBadge('badge-locked', LIVE, { always_locked: true, unlock_required: null })]
    await runAmbientDropBatch('manual')

    expect(state.rpcCalls[0].args.p_unlock_required).toBe(3) // common 최소값(이 테스트의 정책)
  })

  it('잠김으로 만들지 않은 배지는 옛 함수로 열린 채 놓는다', async () => {
    state.tables.badges = [itemBadge('badge-open', LIVE)]
    await runAmbientDropBatch('manual')

    expect(state.rpcCalls).toEqual([
      { name: 'mint_and_place_ambient_drop', args: { p_poi_id: 'poi-1', p_badge_id: 'badge-open' } },
    ])
  })

  it('꺼진 장소에는 놓지 않는다', async () => {
    state.tables.badges = [itemBadge('badge-open', LIVE)]
    state.tables.poi = [{ id: 'poi-off', is_active: false, category: 'cafe' }]
    const result = await runAmbientDropBatch('manual')

    expect(result.reason).toBe('no_eligible_poi')
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('공개 기간이 끝난 배지는 잠김 여부와 상관없이 놓지 않는다', async () => {
    state.tables.badges = [
      itemBadge('badge-ended', LIVE, { valid_until: '2026-09-30T00:00:00+00:00', always_locked: true }),
      itemBadge('badge-not-yet', LIVE, { valid_from: '2026-10-05T00:00:00+00:00' }),
    ]
    const result = await runAmbientDropBatch('manual')

    expect(result.reason).toBe('no_candidate_badges')
    expect(state.rpcCalls).toHaveLength(0)
  })
})
