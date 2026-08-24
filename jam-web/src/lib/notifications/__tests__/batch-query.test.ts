/**
 * 배치 **조회 계층** — 티켓 20260825_002 (3차 보강)
 *
 * `batch-drafts.test.ts`가 판정(무엇을 만들지)을 잠근다면, 이 파일은 **조회가 조용히
 * 깨지는 경로**를 잠근다. 셋 다 에러를 내지 않아 무증상이라는 공통점이 있다.
 *
 * 1. **정렬 없는 페이징** — Postgres는 `ORDER BY` 없는 쿼리의 행 순서를 보장하지 않는다.
 *    `LIMIT/OFFSET`만으로 넘기면 페이지 간 **행 중복·누락**이 생긴다.
 * 2. **`.in()` 목록 폭주** — PostgREST는 목록을 URL에 싣는다. 한계를 넘으면 조회가 실패하고
 *    `runStep`이 잡아 **그 단계만 0건**이 된다(로그 한 줄뿐인 무증상 0건).
 * 3. **지표 없는 요약 로그** — "정상 0건"과 "판정이 깨져서 0건"을 구분할 수 없다.
 */
import {
  IN_CHUNK_SIZE,
  fetchAllRows,
  fetchAllRowsIn,
  runStep,
  type BatchContext,
  type PagedQuery,
} from '../batch/shared'
import { buildCollectionDrafts } from '../batch/collections'
import { buildDropSpotDrafts } from '../batch/dropSpot'
import { buildMissionDrafts, buildMissionRankDrafts } from '../batch/missions'
import { buildFollowingDrafts } from '../batch/following'
import { buildInventoryFullDrafts, buildSyncStalledDrafts } from '../batch/account'
import { kstDateString } from '../kst'

const BATCH_AT = new Date('2026-08-25T09:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

type Row = Record<string, unknown>

interface RecordedQuery {
  table: string
  /** `.order()`로 붙은 정렬 컬럼 (순서 그대로) */
  orders: string[]
  /** `.in(col, values)`로 실은 값들 */
  inValues: { column: string; values: unknown[] }[]
  range: [number, number]
}

/**
 * PostgREST 흉내 스텁.
 *
 * 핵심은 **`.order()`가 없으면 순서를 보장하지 않는다**는 것을 실제로 재현한다는 점이다
 * (요청마다 물리적 순서를 회전시킨다). 이 스텁이 없으면 "정렬을 붙였다"는 테스트가
 * 문자열 검사에 그쳐 실제 중복·누락을 못 잡는다.
 */
function createStubClient(tables: Record<string, Row[]>) {
  const queries: RecordedQuery[] = []
  let unorderedCalls = 0

  function from(table: string) {
    const orders: string[] = []
    const inValues: RecordedQuery['inValues'] = []

    const builder = {
      select: () => builder,
      eq: () => builder,
      is: () => builder,
      not: () => builder,
      gte: () => builder,
      in: (column: string, values: unknown[]) => {
        inValues.push({ column, values })
        return builder
      },
      order: (column: string) => {
        orders.push(column)
        return builder
      },
      range: (from_: number, to: number) => {
        queries.push({ table, orders: [...orders], inValues: [...inValues], range: [from_, to] })

        let rows = tables[table] ?? []
        for (const f of inValues) rows = rows.filter((r) => f.values.includes(r[f.column]))

        if (orders.length > 0) {
          rows = [...rows].sort((a, b) => {
            for (const col of orders) {
              const cmp = String(a[col]).localeCompare(String(b[col]))
              if (cmp !== 0) return cmp
            }
            return 0
          })
        } else if (rows.length > 0) {
          // ORDER BY가 없으면 순서는 보장되지 않는다 — 요청마다 다른 물리적 순서를 낸다
          const shift = unorderedCalls++ % rows.length
          rows = [...rows.slice(shift), ...rows.slice(0, shift)]
        }

        return Promise.resolve({ data: rows.slice(from_, to + 1), error: null })
      },
      upsert: () => Promise.resolve({ error: null }),
    }
    return builder
  }

  return {
    queries,
    client: { from } as unknown as BatchContext['supabase'],
    /** 페이징 조회(= `.range()`가 붙은 조회)만 추린다 */
    paged: () => queries,
  }
}

function ctxOf(client: BatchContext['supabase']): BatchContext {
  return { supabase: client, startedAt: BATCH_AT, today: kstDateString(BATCH_AT) }
}

/** 3차 보강 이전 구현 — 정렬 없이 `.range()`만으로 페이징한다 */
async function fetchUnordered<T>(query: () => PagedQuery<T>, pageSize: number): Promise<T[]> {
  const all: T[] = []
  let from = 0
  for (;;) {
    const { data } = await query().range(from, from + pageSize - 1)
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return all
}

// ─────────────────────────────────────────────────────────────────────────────
// A. 페이징 정렬
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchAllRows — 페이지 경계', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}` }))

  it('정렬을 붙이면 1000행을 넘겨도 모든 행이 정확히 한 번씩 온다', async () => {
    const stub = createStubClient({ rows })
    const got = await fetchAllRows<{ id: string }>(
      'rows',
      'id',
      () => stub.client.from('rows').select('id') as unknown as PagedQuery<{ id: string }>,
      3
    )
    expect(got.map((r) => r.id)).toEqual(rows.map((r) => r.id))
    expect(new Set(got.map((r) => r.id)).size).toBe(rows.length)
  })

  it('정렬이 없으면 페이지 간 중복·누락이 생긴다 — 이 테스트가 정렬의 존재 이유다', async () => {
    const stub = createStubClient({ rows })
    const got = await fetchUnordered<{ id: string }>(
      () => stub.client.from('rows').select('id') as unknown as PagedQuery<{ id: string }>,
      3
    )
    const ids = got.map((r) => r.id)
    // 에러는 나지 않는다. 그래서 무증상이다.
    expect(new Set(ids).size).toBeLessThan(rows.length) // 누락
    expect(ids.length).not.toBe(new Set(ids).size) // 중복
  })

  it('행 수가 페이지 크기의 정확한 배수여도 중복 없이 끝난다', async () => {
    const exact = Array.from({ length: 9 }, (_, i) => ({ id: `r${i}` }))
    const stub = createStubClient({ rows: exact })
    const got = await fetchAllRows<{ id: string }>(
      'rows',
      'id',
      () => stub.client.from('rows').select('id') as unknown as PagedQuery<{ id: string }>,
      3
    )
    expect(got).toHaveLength(9)
    expect(new Set(got.map((r) => r.id)).size).toBe(9)
    // 마지막 빈 페이지까지 확인해야 끝난 걸 알 수 있다 (9행 / 3행씩 → 4회)
    expect(stub.paged()).toHaveLength(4)
  })

  it('복합 PK는 컬럼을 전부 줘야 전순서가 잡힌다', async () => {
    const composite = [
      { user_id: 'u2', item_book_id: 'b1' },
      { user_id: 'u1', item_book_id: 'b2' },
      { user_id: 'u1', item_book_id: 'b1' },
    ]
    const stub = createStubClient({ composite })
    const got = await fetchAllRows<{ user_id: string; item_book_id: string }>(
      'composite',
      ['user_id', 'item_book_id'],
      () =>
        stub.client.from('composite').select('user_id, item_book_id') as unknown as PagedQuery<{
          user_id: string
          item_book_id: string
        }>,
      2
    )
    expect(got.map((r) => `${r.user_id}:${r.item_book_id}`)).toEqual(['u1:b1', 'u1:b2', 'u2:b1'])
  })

  it('조회 실패는 삼키지 않고 던진다 — 부분 결과로 소식을 만들면 일부 유저만 빠진다', async () => {
    const failing = () =>
      ({
        order: () => failing(),
        range: () => Promise.resolve({ data: null, error: { message: '타임아웃' } }),
      }) as unknown as PagedQuery<Row>
    await expect(fetchAllRows<Row>('t', 'id', failing)).rejects.toThrow('타임아웃')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// D. .in() 청크 분할
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchAllRowsIn — .in() 청크 분할', () => {
  const rows = Array.from({ length: 500 }, (_, i) => ({ id: `id-${String(i).padStart(3, '0')}` }))
  const ids = rows.map((r) => r.id)

  function run(values: string[], stub = createStubClient({ rows })) {
    return {
      stub,
      result: fetchAllRowsIn<{ id: string }, string>(
        'rows',
        'id',
        values,
        (chunk) => stub.client.from('rows').select('id').in('id', chunk) as unknown as PagedQuery<{ id: string }>
      ),
    }
  }

  it(`값이 ${IN_CHUNK_SIZE}개면 조회 1회, ${IN_CHUNK_SIZE + 1}개면 2회로 쪼갠다`, async () => {
    const exact = run(ids.slice(0, IN_CHUNK_SIZE))
    await exact.result
    expect(exact.stub.paged()).toHaveLength(1)

    const over = run(ids.slice(0, IN_CHUNK_SIZE + 1))
    await over.result
    expect(over.stub.paged()).toHaveLength(2)
    expect(over.stub.paged().map((q) => q.inValues[0].values.length)).toEqual([IN_CHUNK_SIZE, 1])
  })

  it('쪼개도 결과는 합쳐지고 어느 청크도 상한을 넘지 않는다', async () => {
    const { stub, result } = run(ids)
    const got = await result
    expect(got.map((r) => r.id).sort()).toEqual([...ids].sort())
    for (const q of stub.paged()) {
      expect(q.inValues[0].values.length).toBeLessThanOrEqual(IN_CHUNK_SIZE)
    }
  })

  it('중복 값은 제거하고 쪼갠다 — 같은 값이 두 청크에 걸리면 같은 행이 두 번 담긴다', async () => {
    const dup = [...ids.slice(0, IN_CHUNK_SIZE), ids[0], ids[1]]
    const { stub, result } = run(dup)
    const got = await result
    expect(got).toHaveLength(IN_CHUNK_SIZE)
    expect(new Set(got.map((r) => r.id)).size).toBe(IN_CHUNK_SIZE)
    expect(stub.paged()).toHaveLength(1) // 중복을 뺐으니 청크도 늘지 않는다
  })

  it('값이 없으면 조회 자체를 하지 않는다', async () => {
    const { stub, result } = run([])
    expect(await result).toEqual([])
    expect(stub.paged()).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 로더 실측 — 7개 단계가 실제로 정렬·청크를 지키는가
// ─────────────────────────────────────────────────────────────────────────────

const ISO = BATCH_AT.toISOString()

function fixtures(badgeCount = 3): Record<string, Row[]> {
  const badges = Array.from({ length: badgeCount }, (_, i) => ({
    id: `b${String(i).padStart(3, '0')}`,
    item_book_id: 'book-1',
    type: 'item',
    name: `배지${i}`,
    rarity: 'legend',
  }))
  return {
    item_books: [{ id: 'book-1', name: '오아시스 자판기' }],
    badges,
    user_item_book_slots: [{ id: 's1', user_id: 'u1', item_book_id: 'book-1', badge_id: badges[0].id }],
    user_poi_badge_earns: [],
    inventory: [{ id: 'inv-1', user_id: 'u1', max_slots: 50, used_slots: 50 }],
    inventory_items: badges.map((b, i) => ({
      id: `ii${String(i).padStart(3, '0')}`,
      inventory_id: 'inv-1',
      badge_id: b.id,
      obtained_at: ISO,
    })),
    poi_drops: [{ id: 'd1', dropper_user_id: 'u1', poi_id: 'p1' }],
    poi: [{ id: 'p1', name: '성수 공원' }],
    poi_views: [{ id: 'v1', poi_id: 'p1', user_id: 'u2' }],
    missions: [
      {
        id: 'm1',
        title: '가을 러닝',
        mission_type: 'distance',
        condition_json: { distance_km: 10 },
        status_display_type: 'ranking',
        starts_at: new Date(BATCH_AT.getTime() - 7 * DAY_MS).toISOString(),
        ends_at: new Date(BATCH_AT.getTime() + 2 * DAY_MS).toISOString(),
      },
    ],
    user_mission_participations: [{ id: 'mp1', user_id: 'u1', mission_id: 'm1', progress_value: 4 }],
    user_mission_completions: [],
    mission_rank_snapshots: [{ mission_id: 'm1', user_id: 'u1', rank: 3 }],
    user_follows: [{ id: 'f1', follower_id: 'u2', following_id: 'u1' }],
    user_activity_badges: [{ id: 'ab1', user_id: 'u1', badge_id: badges[0].id, earned_at: ISO }],
    user_item_book_completions: [{ user_id: 'u1', item_book_id: 'book-1', completed_at: ISO }],
    strava_connections: [
      { id: 'sc1', user_id: 'u1', last_synced_at: null, created_at: new Date(BATCH_AT.getTime() - 10 * DAY_MS).toISOString() },
    ],
    notifications: [],
  }
}

const LOADERS = [
  { name: 'collections', run: buildCollectionDrafts },
  { name: 'drop-spot', run: buildDropSpotDrafts },
  { name: 'missions', run: buildMissionDrafts },
  { name: 'mission-rank', run: buildMissionRankDrafts },
  { name: 'following', run: buildFollowingDrafts },
  { name: 'sync-stalled', run: buildSyncStalledDrafts },
  { name: 'inventory-full', run: buildInventoryFullDrafts },
]

describe('7개 단계 로더', () => {
  it('모든 페이징 조회에 정렬이 붙는다 — 하나라도 빠지면 그 테이블에서 행이 새거나 중복된다', async () => {
    for (const loader of LOADERS) {
      const stub = createStubClient(fixtures())
      await loader.run(ctxOf(stub.client))
      expect(stub.paged().length).toBeGreaterThan(0)
      for (const q of stub.paged()) {
        expect({ step: loader.name, table: q.table, orders: q.orders }).toEqual({
          step: loader.name,
          table: q.table,
          orders: q.orders.length > 0 ? q.orders : ['정렬 없음'],
        })
        expect(q.orders.length).toBeGreaterThan(0)
      }
    }
  })

  it('복합 PK 테이블은 컬럼을 전부 정렬 키로 쓴다', async () => {
    const stub = createStubClient(fixtures())
    await buildFollowingDrafts(ctxOf(stub.client))
    const completions = stub.paged().find((q) => q.table === 'user_item_book_completions')
    expect(completions?.orders).toEqual(['user_id', 'item_book_id'])

    const rankStub = createStubClient(fixtures())
    await buildMissionRankDrafts(ctxOf(rankStub.client))
    const snapshots = rankStub.paged().find((q) => q.table === 'mission_rank_snapshots')
    expect(snapshots?.orders).toEqual(['mission_id', 'user_id'])
  })

  it('아이템북 소속 배지가 상한을 넘으면 inventory_items 조회를 쪼갠다 (FACTIONS 목표 900종)', async () => {
    const stub = createStubClient(fixtures(IN_CHUNK_SIZE + 50))
    await buildCollectionDrafts(ctxOf(stub.client))

    const invQueries = stub.paged().filter((q) => q.table === 'inventory_items')
    expect(invQueries.length).toBeGreaterThan(1)
    const carried: unknown[] = []
    for (const q of invQueries) {
      const badgeFilter = q.inValues.find((f) => f.column === 'badge_id')
      expect(badgeFilter?.values.length).toBeLessThanOrEqual(IN_CHUNK_SIZE)
      carried.push(...(badgeFilter?.values ?? []))
    }
    // 쪼개도 배지가 하나도 빠지지 않는다
    expect(new Set(carried).size).toBe(IN_CHUNK_SIZE + 50)
  })

  it('모든 .in() 조회가 청크 상한을 지킨다', async () => {
    for (const loader of LOADERS) {
      const stub = createStubClient(fixtures(IN_CHUNK_SIZE + 50))
      await loader.run(ctxOf(stub.client))
      for (const q of stub.paged()) {
        for (const f of q.inValues) {
          // rarity/type 같은 고정 목록은 애초에 짧다
          expect(f.values.length).toBeLessThanOrEqual(IN_CHUNK_SIZE)
        }
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// C. "조용한 0건"을 구분할 지표
// ─────────────────────────────────────────────────────────────────────────────

describe('BatchStepResult 지표', () => {
  const ctx = {} as BatchContext

  it('scanned·drafts·durationMs를 남긴다 — 생성 수만으로는 판정이 죽은 걸 알 수 없다', async () => {
    const result = await runStep('collections', async () => ({ drafts: [], scanned: 137 }), ctx)
    expect(result).toMatchObject({ step: 'collections', scanned: 137, drafts: 0, created: 0, failed: 0, error: null })
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    // 이 조합(스캔은 했는데 시도가 0)이 지속되는 게 "판정이 깨져서 0건"의 신호다
    expect(result.scanned > 0 && result.drafts === 0).toBe(true)
  })

  it('단계가 던져도 나머지가 죽지 않고, error와 durationMs가 남는다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await runStep(
      'mission-rank',
      async () => {
        throw new Error('relation "mission_rank_snapshots" does not exist')
      },
      ctx
    )
    expect(result.error).toContain('mission_rank_snapshots')
    expect(result).toMatchObject({ scanned: 0, drafts: 0, created: 0 })
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('로더가 실제로 scanned를 채운다 — 상수 0이면 지표가 무의미하다', async () => {
    const stub = createStubClient(fixtures())
    const out = await buildSyncStalledDrafts(ctxOf(stub.client))
    expect(out.scanned).toBe(1)

    const empty = createStubClient({ ...fixtures(), strava_connections: [] })
    expect((await buildSyncStalledDrafts(ctxOf(empty.client))).scanned).toBe(0)
  })
})
