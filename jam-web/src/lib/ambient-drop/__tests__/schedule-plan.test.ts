/**
 * 앰비언트 드랍 예약의 배치 계획과 배치 공용 함수 (티켓 20261001_2051)
 *
 *  - 지점 직접: 활성 드랍이 있어도 지정 개수만큼 놓고 겹친 지점 수를 센다
 *  - 아이템 직접: 섞은 풀을 순환 배정해 고르게
 *  - 컬렉션: 정기 배포와 같은 등급 가중 추첨과 폴백
 *  - 종류+개수: 활성 0 우선·한도·자리 소진 시 중단
 *  - placement.ts 추출이 index.ts에 있던 이전 동작과 같다
 *
 * 실행: cd jam-web && npx vitest run src/lib/ambient-drop/__tests__/schedule-plan.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { planScheduleDrops } from '../schedulePlan'
import { distributePoiSlots, placeAmbientDrops } from '../placement'
import type { AmbientDropScheduleSpec } from '../scheduleSpec'
import type { ScheduleTargetBadge, ScheduleTargetPoi } from '../scheduleTargets'
import { createFakeDb, type FakeDb } from './schedule-test-db'

afterEach(() => {
  vi.restoreAllMocks()
})

/** 항상 첫 번째를 고른다 — 결정적이다 */
const first = (ids: readonly string[]): string | null => ids[0] ?? null

const poi = (id: string, activeSystemCount = 0): ScheduleTargetPoi => ({ id, activeSystemCount })
const badge = (id: string, rarity: ScheduleTargetBadge['rarity'] = 'common', itemBookId = 'book-1'): ScheduleTargetBadge => ({
  id,
  rarity,
  itemBookId,
})

const LIST_ITEMS = (perPoiCount: number, badgeIds = ['b-a']): AmbientDropScheduleSpec => ({
  poiMode: 'list',
  poiIds: ['p-1', 'p-2'],
  perPoiCount,
  itemMode: 'items',
  badgeIds,
})

describe('지점 직접 선택 (list)', () => {
  it('활성 드랍이 있어도 한도 없이 지정한 개수만큼 놓고 겹친 지점 수를 센다', () => {
    const plan = planScheduleDrops({
      spec: LIST_ITEMS(2),
      targets: { pois: [poi('p-1', 3), poi('p-2', 0)], badgePool: [badge('b-a')] },
      maxActivePerPoi: 1, // 지점 직접은 이 한도를 쓰지 않는다
      pick: first,
    })
    expect(plan.rows.filter((r) => r.poi_id === 'p-1')).toHaveLength(2)
    expect(plan.rows.filter((r) => r.poi_id === 'p-2')).toHaveLength(2)
    expect(plan.overlappedPoiCount).toBe(1)
    expect(plan.eligiblePoiCount).toBe(2)
    expect(plan.reason).toBeUndefined()
  })

  it('활성 드랍이 없는 지점만 있으면 겹친 지점 수는 0이다', () => {
    const plan = planScheduleDrops({
      spec: LIST_ITEMS(1),
      targets: { pois: [poi('p-1'), poi('p-2')], badgePool: [badge('b-a')] },
      pick: first,
    })
    expect(plan.rows).toHaveLength(2)
    expect(plan.overlappedPoiCount).toBe(0)
  })

  it('지점이 하나도 남지 않으면 놓지 않고 no_eligible_poi다', () => {
    const plan = planScheduleDrops({ spec: LIST_ITEMS(2), targets: { pois: [], badgePool: [badge('b-a')] }, pick: first })
    expect(plan).toMatchObject({ rows: [], reason: 'no_eligible_poi', overlappedPoiCount: 0 })
  })
})

describe('아이템 직접 선택 (items) — 섞은 풀을 순환 배정', () => {
  const spec = (totalCount: number): AmbientDropScheduleSpec => ({
    poiMode: 'category',
    poiCategory: null,
    totalCount,
    itemMode: 'items',
    badgeIds: ['b-a', 'b-b', 'b-c'],
  })
  const pois = Array.from({ length: 6 }, (_, i) => poi(`p-${i + 1}`))
  const pool = [badge('b-a'), badge('b-b'), badge('b-c')]

  it('풀을 돌려가며 놓아 배지마다 같은 횟수로 고르게 놓인다', () => {
    const plan = planScheduleDrops({ spec: spec(6), targets: { pois, badgePool: pool }, maxActivePerPoi: 1, pick: first })
    const counts = new Map<string, number>()
    for (const row of plan.rows) counts.set(row.badge_id, (counts.get(row.badge_id) ?? 0) + 1)
    expect([...counts.values()]).toEqual([2, 2, 2])
  })

  it('개수가 풀보다 적으면 풀의 앞에서부터 하나씩 놓는다 (결정적 pick)', () => {
    const plan = planScheduleDrops({ spec: spec(2), targets: { pois, badgePool: pool }, maxActivePerPoi: 1, pick: first })
    expect(plan.rows.map((r) => r.badge_id)).toEqual(['b-a', 'b-b'])
  })

  it('지점 직접과 함께여도 지점 순서대로 풀을 순환한다', () => {
    const plan = planScheduleDrops({
      spec: { poiMode: 'list', poiIds: ['p-1', 'p-2'], perPoiCount: 2, itemMode: 'items', badgeIds: ['b-a', 'b-b', 'b-c'] },
      targets: { pois: [poi('p-1'), poi('p-2')], badgePool: pool },
      pick: first,
    })
    expect(plan.rows).toEqual([
      { poi_id: 'p-1', badge_id: 'b-a' },
      { poi_id: 'p-1', badge_id: 'b-b' },
      { poi_id: 'p-2', badge_id: 'b-c' },
      { poi_id: 'p-2', badge_id: 'b-a' },
    ])
  })

  it('풀이 비어 있으면 놓지 않고 no_candidate_badges다', () => {
    const plan = planScheduleDrops({ spec: spec(3), targets: { pois, badgePool: [] }, maxActivePerPoi: 1, pick: first })
    expect(plan).toMatchObject({ rows: [], reason: 'no_candidate_badges' })
  })
})

describe('컬렉션 선택 (collections) — 정기 배포와 같은 등급 가중 추첨', () => {
  const spec = (count: number): AmbientDropScheduleSpec => ({
    poiMode: 'list',
    poiIds: ['p-1'],
    perPoiCount: count,
    itemMode: 'collections',
    collectionIds: ['book-1'],
  })
  const dist = (common: number, rare: number) => ({ common, rare, epic: 0, mystic: 0 })

  it('등급 분포에 따라 추첨한 등급의 배지를 놓는다 (결정값 난수)', () => {
    // 슬롯마다 난수 2개: 등급 추첨(0.1 → common, 0.9 → rare), 그 등급 안의 배지 선택(0 → 첫 배지)
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0).mockReturnValueOnce(0.9).mockReturnValueOnce(0)
    const plan = planScheduleDrops({
      spec: spec(2),
      targets: { pois: [poi('p-1')], badgePool: [badge('c-1', 'common'), badge('c-2', 'common'), badge('r-1', 'rare')] },
      rarity: { distribution: dist(0.5, 0.5) },
      pick: first,
    })
    expect(plan.rows.map((r) => r.badge_id)).toEqual(['c-1', 'r-1'])
  })

  it('뽑힌 등급에 배지가 없으면 후보가 있는 첫 등급으로 폴백한다', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4) // 분포 {common:1}이라 항상 common을 뽑는다
    const plan = planScheduleDrops({
      spec: spec(2),
      targets: { pois: [poi('p-1')], badgePool: [badge('r-1', 'rare')] },
      rarity: { distribution: dist(1, 0) },
      pick: first,
    })
    expect(plan.rows.map((r) => r.badge_id)).toEqual(['r-1', 'r-1'])
  })

  it('등급 없는 배지(무한레벨형)는 자리가 없어 빠진다 — 전부 등급이 없으면 no_candidate_badges', () => {
    const plan = planScheduleDrops({
      spec: spec(2),
      targets: { pois: [poi('p-1')], badgePool: [badge('x-1', null)] },
      rarity: { distribution: dist(1, 0) },
      pick: first,
    })
    expect(plan).toMatchObject({ rows: [], reason: 'no_candidate_badges' })
  })

  it('컬렉션 모드에 등급 분포가 없으면 던진다', () => {
    expect(() =>
      planScheduleDrops({ spec: spec(1), targets: { pois: [poi('p-1')], badgePool: [badge('c-1')] }, pick: first })
    ).toThrow('등급 분포')
  })
})

describe('지점 종류+개수 (category) — 매일 배포와 같은 분산', () => {
  const spec = (totalCount: number): AmbientDropScheduleSpec => ({
    poiMode: 'category',
    poiCategory: 'cafe',
    totalCount,
    itemMode: 'items',
    badgeIds: ['b-a'],
  })
  const pool = [badge('b-a')]

  it('활성 드랍이 0인 지점을 먼저 채우고 그다음 한도 미만 지점에 더한다', () => {
    const plan = planScheduleDrops({
      spec: spec(5),
      targets: { pois: [poi('p-1', 0), poi('p-2', 0), poi('p-3', 1)], badgePool: pool },
      maxActivePerPoi: 2,
      pick: first,
    })
    expect(plan.rows.map((r) => r.poi_id)).toEqual(['p-1', 'p-2', 'p-1', 'p-2', 'p-3'])
    expect(plan.eligiblePoiCount).toBe(3)
    expect(plan.overlappedPoiCount).toBe(0)
  })

  it('활성 0인 지점이 뒤에 있어도 먼저 채운다', () => {
    const plan = planScheduleDrops({
      spec: spec(1),
      targets: { pois: [poi('p-1', 1), poi('p-2', 0)], badgePool: pool },
      maxActivePerPoi: 3,
      pick: first,
    })
    expect(plan.rows.map((r) => r.poi_id)).toEqual(['p-2'])
  })

  it('한도에 찬 지점은 후보에서 빠지고, 자리가 모자라면 있는 만큼만 놓고 멈춘다', () => {
    const plan = planScheduleDrops({
      spec: spec(10),
      targets: { pois: [poi('p-1', 0), poi('p-2', 1), poi('p-3', 5)], badgePool: pool },
      maxActivePerPoi: 1,
      pick: first,
    })
    expect(plan.rows.map((r) => r.poi_id)).toEqual(['p-1'])
    expect(plan.eligiblePoiCount).toBe(1)
  })

  it('모든 지점이 한도에 찼으면 놓지 않고 no_eligible_poi다', () => {
    const plan = planScheduleDrops({
      spec: spec(3),
      targets: { pois: [poi('p-1', 1), poi('p-2', 2)], badgePool: pool },
      maxActivePerPoi: 1,
      pick: first,
    })
    expect(plan).toMatchObject({ rows: [], reason: 'no_eligible_poi', eligiblePoiCount: 0 })
  })

  it('종류+개수 모드에 지점당 한도가 없으면 던진다', () => {
    expect(() => planScheduleDrops({ spec: spec(1), targets: { pois: [poi('p-1')], badgePool: pool }, pick: first })).toThrow('maxActivePerPoi')
  })
})

describe('distributePoiSlots — index.ts에 있던 이전 동작과 같다', () => {
  /** 추출 전 `runAmbientDropBatch`의 자리 분산 루프 그대로 */
  function legacyDistribute(
    candidatePoiIds: string[],
    activeByPoi: Map<string, number>,
    max: number,
    batchSize: number,
    pick: (ids: readonly string[]) => string | null
  ): string[] {
    const out: string[] = []
    const local = new Map(activeByPoi)
    for (let i = 0; i < batchSize; i++) {
      const zero = candidatePoiIds.filter((id) => (local.get(id) ?? 0) === 0)
      const pool = zero.length > 0 ? zero : candidatePoiIds.filter((id) => (local.get(id) ?? 0) < max)
      const poiId = pick(pool)
      if (!poiId) break
      out.push(poiId)
      local.set(poiId, (local.get(poiId) ?? 0) + 1)
    }
    return out
  }

  /** 시드 고정 난수(LCG) */
  function seededPick(seed: number): (ids: readonly string[]) => string | null {
    let s = seed
    return (ids) => {
      if (ids.length === 0) return null
      s = (s * 1664525 + 1013904223) % 4294967296
      return ids[Math.floor((s / 4294967296) * ids.length)]
    }
  }

  it('여러 시드·한도·활성 분포에서 이전 루프와 같은 결과를 낸다', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `p-${i}`)
    for (let seed = 1; seed <= 25; seed++) {
      const active = new Map(ids.map((id, i) => [id, (i * seed) % 4] as [string, number]))
      const max = 1 + (seed % 4)
      const candidates = ids.filter((id) => (active.get(id) ?? 0) < max)
      const count = 3 + (seed % 20)
      const expected = legacyDistribute(candidates, active, max, count, seededPick(seed))
      const actual = distributePoiSlots({
        candidatePoiIds: candidates,
        activeByPoi: active,
        maxActivePerPoi: max,
        count,
        pick: seededPick(seed),
      })
      expect(actual).toEqual(expected)
    }
  })

  it('입력 맵을 바꾸지 않는다', () => {
    const active = new Map([['p-1', 0]])
    distributePoiSlots({ candidatePoiIds: ['p-1'], activeByPoi: active, maxActivePerPoi: 5, count: 3, pick: first })
    expect(active.get('p-1')).toBe(0)
  })
})

describe('placeAmbientDrops — mint_and_place_ambient_drop RPC 루프', () => {
  function client(db: FakeDb) {
    return db.client as Parameters<typeof placeAmbientDrops>[0]
  }

  it('쌍마다 RPC를 한 번씩 부르고 놓인 드랍 id를 모은다', async () => {
    const db = createFakeDb()
    const { spawned, failedCount } = await placeAmbientDrops(client(db), [
      { poi_id: 'p-1', badge_id: 'b-a' },
      { poi_id: 'p-2', badge_id: 'b-b' },
    ])
    expect(db.rpcCalls).toEqual([
      { name: 'mint_and_place_ambient_drop', args: { p_poi_id: 'p-1', p_badge_id: 'b-a' } },
      { name: 'mint_and_place_ambient_drop', args: { p_poi_id: 'p-2', p_badge_id: 'b-b' } },
    ])
    expect(spawned).toEqual([
      { id: 'drop-1', inventory_item_id: 'inv-1', poi_id: 'p-1' },
      { id: 'drop-2', inventory_item_id: 'inv-2', poi_id: 'p-2' },
    ])
    expect(failedCount).toBe(0)
  })

  it('RPC 오류·ok:false·필드 누락은 실패로 세고 나머지는 계속 놓는다', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = createFakeDb()
    db.rpcResult = (_call, i) => {
      if (i === 0) return { data: null, error: { message: 'boom' } }
      if (i === 1) return { data: { ok: false }, error: null }
      if (i === 2) return { data: { ok: true, drop_id: 'only-drop' }, error: null }
      return { data: { ok: true, drop_id: 'd-4', inventory_item_id: 'i-4' }, error: null }
    }
    const { spawned, failedCount } = await placeAmbientDrops(
      client(db),
      ['p-1', 'p-2', 'p-3', 'p-4'].map((poi_id) => ({ poi_id, badge_id: 'b-a' }))
    )
    expect(spawned).toEqual([{ id: 'd-4', inventory_item_id: 'i-4', poi_id: 'p-4' }])
    expect(failedCount).toBe(3)
    expect(errorLog).toHaveBeenCalledTimes(3)
  })

  it('쌍이 없으면 RPC를 부르지 않는다', async () => {
    const db = createFakeDb()
    expect(await placeAmbientDrops(client(db), [])).toEqual({ spawned: [], failedCount: 0 })
    expect(db.rpcCalls).toHaveLength(0)
  })
})
