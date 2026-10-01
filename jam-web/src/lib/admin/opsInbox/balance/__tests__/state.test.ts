/**
 * 밸런스 평가가 읽는 서비스 상태 (티켓 20260930_1459 조각 A)
 *
 * 서비스 클라이언트는 메모리 안의 가짜 DB로 바꾼다(실 DB에 접속하지 않는다). 지키는 것:
 * - 다른 묶음의 신규 개방 선별: 시험 묶음·지금 평가하는 묶음·반려/취소/실패·자원이 이미 만들어진 항목은 센 것에서 뺀다
 * - 수정본이 있으면 수정본의 시각을 읽는다
 * - 조회는 select 계열만 부르고, 한 조회가 실패하면 그 상태만 ok:false이고 나머지는 이어진다
 * - 1000행을 넘어도 끝까지 받는다
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadBalanceState, selectOtherLaunches } from '../state'

type Row = Record<string, unknown>

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  errors: {} as Record<string, string>,
  calls: [] as string[],
}))

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

class Query implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private filters: Array<(row: Row) => boolean> = []
  private window: [number, number] | null = null
  constructor(private table: string) {}
  select() {
    db.calls.push(`${this.table}.select`)
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
  order() {
    return this
  }
  range(from: number, to: number) {
    this.window = [from, to]
    return this
  }
  insert() {
    db.calls.push(`${this.table}.insert`)
    return this
  }
  update() {
    db.calls.push(`${this.table}.update`)
    return this
  }
  delete() {
    db.calls.push(`${this.table}.delete`)
    return this
  }
  then<T1, T2 = never>(
    onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    const message = db.errors[this.table]
    let result: { data: unknown; error: { message: string } | null }
    if (message) result = { data: null, error: { message } }
    else {
      let rows = (db.tables[this.table] ?? []).filter((row) => this.filters.every((f) => f(row)))
      if (this.window) rows = rows.slice(this.window[0], this.window[1] + 1)
      result = { data: rows, error: null }
    }
    return Promise.resolve(result).then(onfulfilled, onrejected)
  }
}

const client = { from: (table: string) => new Query(table) } as unknown as Parameters<typeof loadBalanceState>[0]

beforeEach(() => {
  db.tables = { item_books: [], ops_bundles: [], ops_bundle_items: [], badges: [] }
  db.errors = {}
  db.calls = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const CURRENT = 'bundle-current'
const NONE = { rewardBadgeIds: [], familyKeys: [] }

function launchRow(id: string, bundleId: string, overrides: Row = {}) {
  return {
    id,
    bundle_id: bundleId,
    status: 'reviewing',
    starts_at: '2026-10-12T00:00:00+00:00',
    ends_at: '2026-12-31T00:00:00+00:00',
    original: {},
    edited: null,
    created_resource: null,
    ...overrides,
  } as Parameters<typeof selectOtherLaunches>[0][number]
}

describe('selectOtherLaunches', () => {
  const bundles = [
    { id: CURRENT, is_sample: false },
    { id: 'b-real', is_sample: false },
    { id: 'b-sample', is_sample: true },
  ]

  it('시험이 아닌 다른 묶음의 항목만 센다(지금 평가하는 묶음과 시험 묶음은 뺀다)', () => {
    const rows = [launchRow('mine', CURRENT), launchRow('real', 'b-real'), launchRow('sample', 'b-sample'), launchRow('ghost', 'b-unknown')]
    expect(selectOtherLaunches(rows, bundles, CURRENT).map((l) => l.itemId)).toEqual(['real'])
  })

  it('시험 묶음끼리는 서로 세지 않는다: 시험 묶음을 평가해도 다른 시험 묶음은 뺀다', () => {
    const rows = [launchRow('s1', 'b-sample'), launchRow('real', 'b-real')]
    expect(selectOtherLaunches(rows, bundles, 'b-sample').map((l) => l.itemId)).toEqual(['real'])
  })

  it('반려·취소·실패 항목과 자원이 이미 만들어진 항목은 뺀다', () => {
    const rows = [
      launchRow('rejected', 'b-real', { status: 'rejected' }),
      launchRow('cancelled', 'b-real', { status: 'cancelled' }),
      launchRow('failed', 'b-real', { status: 'failed' }),
      launchRow('created', 'b-real', { created_resource: { item_book_id: 'x' } }),
      launchRow('approved', 'b-real', { status: 'approved' }),
      launchRow('live', 'b-real', { status: 'live' }),
    ]
    expect(selectOtherLaunches(rows, bundles, CURRENT).map((l) => l.itemId)).toEqual(['approved', 'live'])
  })

  it('수정본의 시각이 우선이고, 읽을 수 없으면 열을 보고, 그것도 없으면 null이다', () => {
    const rows = [
      launchRow('edited', 'b-real', { edited: { starts_at: '2026-11-02T09:00:00+09:00' } }),
      launchRow('original', 'b-real', { original: { starts_at: '2026-10-20T09:00:00+09:00' } }),
      launchRow('column', 'b-real', { original: { starts_at: '내일' }, starts_at: '2026-10-12T00:00:00+00:00' }),
      launchRow('none', 'b-real', { starts_at: null, ends_at: null }),
    ]
    const result = selectOtherLaunches(rows, bundles, CURRENT)
    expect(result.map((l) => [l.itemId, l.startsAt])).toEqual([
      ['edited', '2026-11-02T00:00:00.000Z'],
      ['original', '2026-10-20T00:00:00.000Z'],
      ['column', null], // 값이 있는데 형식이 틀리면 열로 대신하지 않는다
      ['none', null],
    ])
    expect(result[3].endsAt).toBeNull()
  })
})

describe('loadBalanceState', () => {
  it('열려 있는 컬렉션은 활성인 것의 노출 판정 칸만 읽는다', async () => {
    db.tables.item_books = [
      { is_active: true, valid_from: null, valid_until: null },
      { is_active: false, valid_from: null, valid_until: null },
    ]
    const state = await loadBalanceState(client, { currentBundleId: CURRENT, references: NONE })
    expect(state.books).toEqual({ ok: true, data: [{ is_active: true, valid_from: null, valid_until: null }] })
  })

  it('다른 묶음의 신규 개방은 시험 묶음·지금 묶음을 빼고 읽는다', async () => {
    db.tables.ops_bundles = [
      { id: CURRENT, is_sample: false },
      { id: 'b-real', is_sample: false },
      { id: 'b-sample', is_sample: true },
    ]
    db.tables.ops_bundle_items = [
      { ...launchRow('mine', CURRENT), kind: 'collection_launch' },
      { ...launchRow('real', 'b-real'), kind: 'collection_launch' },
      { ...launchRow('sample', 'b-sample'), kind: 'collection_launch' },
      { ...launchRow('mission', 'b-real'), kind: 'mission' },
    ]
    const state = await loadBalanceState(client, { currentBundleId: CURRENT, references: NONE })
    expect(state.otherLaunches.ok && state.otherLaunches.data.map((l) => l.itemId)).toEqual(['real'])
  })

  it('보상 배지 포인트와 같은 계열 기존 배지를 읽는다(삭제된 배지는 뺀다, UUID가 아닌 ID는 묻지 않는다)', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    db.tables.badges = [
      { id, family_key: null, point_reward: 30, condition_json: {}, deleted_at: null },
      { id: 'f1', family_key: 'run_count', point_reward: 20, condition_json: { combine_attempt_count: 3 }, deleted_at: null },
      { id: 'f2', family_key: 'run_count', point_reward: 50, condition_json: { distance_km: 5 }, deleted_at: null },
      { id: 'f3', family_key: 'run_count', point_reward: 70, condition_json: { combine_attempt_count: 9 }, deleted_at: '2026-09-01T00:00:00Z' },
      { id: 'f4', family_key: 'run_count', point_reward: 5, condition_json: null, deleted_at: null },
    ]
    const state = await loadBalanceState(client, {
      currentBundleId: CURRENT,
      references: { rewardBadgeIds: [id, 'not-a-uuid'], familyKeys: ['run_count'] },
    })
    expect(state.badgePoints).toEqual({ ok: true, data: { [id]: 30 } })
    expect(state.familyBadges).toEqual({
      ok: true,
      data: {
        run_count: [
          { id: 'f1', pointReward: 20, countType: true },
          { id: 'f2', pointReward: 50, countType: false },
          { id: 'f4', pointReward: 5, countType: null },
        ],
      },
    })
  })

  it('보상 배지·계열 이름이 없으면 배지 조회를 하지 않는다', async () => {
    await loadBalanceState(client, { currentBundleId: CURRENT, references: NONE })
    expect(db.calls.filter((c) => c === 'badges.select')).toEqual([])
  })

  it('조회 하나가 실패하면 그 상태만 ok:false이고 나머지는 읽힌다', async () => {
    db.tables.item_books = [{ is_active: true, valid_from: null, valid_until: null }]
    db.errors.ops_bundle_items = 'items down'
    const state = await loadBalanceState(client, { currentBundleId: CURRENT, references: NONE })
    expect(state.otherLaunches).toEqual({ ok: false })
    expect(state.books.ok).toBe(true)
    expect(state.badgePoints.ok && state.familyBadges.ok).toBe(true)
  })

  it('컬렉션 조회가 실패해도 던지지 않고 ok:false다', async () => {
    db.errors.item_books = 'books down'
    const state = await loadBalanceState(client, { currentBundleId: CURRENT, references: NONE })
    expect(state.books).toEqual({ ok: false })
    expect(state.otherLaunches.ok).toBe(true)
  })

  it('1000행을 넘어도 끝까지 받는다', async () => {
    db.tables.item_books = Array.from({ length: 2350 }, () => ({ is_active: true, valid_from: null, valid_until: null }))
    const state = await loadBalanceState(client, { currentBundleId: CURRENT, references: NONE })
    expect(state.books.ok && state.books.data).toHaveLength(2350)
  })

  it('select 계열만 부른다', async () => {
    db.tables.badges = []
    await loadBalanceState(client, { currentBundleId: CURRENT, references: { rewardBadgeIds: ['11111111-1111-4111-8111-111111111111'], familyKeys: ['x'] } })
    expect(db.calls.length).toBeGreaterThan(0)
    expect(db.calls.filter((c) => /\.(insert|update|upsert|delete)$/.test(c))).toEqual([])
  })
})
