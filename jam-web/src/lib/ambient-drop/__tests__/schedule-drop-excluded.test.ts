/**
 * 앰비언트 드랍 지정 배포·예약의 드랍 제외 판정 (티켓 20261005_1957, 상위 20260930_1503 ⑦a 후속)
 *
 * 드랍 제외(`drop_excluded`)는 활동 드랍(`fetchDropStructure`)과 같은 조건으로 앰비언트 드랍에도 적용된다.
 *  - 아이템 직접 선택: 드랍 제외 아이템은 `badge_drop_excluded`, 드랍 제외 컬렉션 소속 아이템은 `collection_drop_excluded`로 걸린다
 *  - 컬렉션 선택: 드랍 제외 컬렉션은 `collection_drop_excluded`로 걸리고, 남은 컬렉션의 후보 풀에서 드랍 제외 아이템이 빠진다
 *  - 등록(예정 시각 기준)은 400으로 거절하고, 지금 배포·예약 실행은 놓지 않고 사유를 결과에 남긴다
 *
 * 실행: cd jam-web && npx vitest run src/lib/ambient-drop/__tests__/schedule-drop-excluded.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakeDb, uuid, type FakeDb } from './schedule-test-db'
import { BOOK_LIVE, B_LIVE, P1, P2, badge, world } from './schedule-fixtures'

const ctx = vi.hoisted(() => ({ db: null as unknown as FakeDb }))
const logMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ctx.db.client }))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: logMock }))
vi.mock('@/lib/notifications/batch/shared', async () => (await import('./schedule-test-db')).sharedMock)

import { runAmbientDropSpec } from '../scheduleRun'
import { createAmbientDropSchedule } from '../scheduleStore'
import { describeScheduleTargetProblems, loadScheduleTargets } from '../scheduleTargets'
import type { AmbientDropScheduleSpec } from '../scheduleSpec'

/** 2026-10-01 12:00 KST */
const NOW = new Date('2026-10-01T03:00:00.000Z')
/** 2026-10-05 09:00 KST */
const AT = '2026-10-05T09:00:00+09:00'
const AT_ISO = '2026-10-05T00:00:00.000Z'

/** 노출 중이지만 컬렉션째 드랍 제외인 컬렉션과 그 소속 아이템 */
const BOOK_EXCLUDED = uuid(25)
const B_IN_EXCLUDED_BOOK = uuid(17)
/** 노출 중 컬렉션(BOOK_LIVE) 소속이지만 아이템 개별로 드랍 제외인 아이템 */
const B_EXCLUDED = uuid(18)
/** 컬렉션 선택의 후보 풀에 남아야 하는 정상 아이템 */
const B_OK = uuid(19)
/** 드랍 제외 아이템뿐인 노출 중 컬렉션 */
const BOOK_ALL_EXCLUDED = uuid(26)
const B_ONLY_EXCLUDED = uuid(20)

let db: FakeDb
const sb = () => db.client as Parameters<typeof loadScheduleTargets>[0]

beforeEach(() => {
  vi.clearAllMocks()
  db = createFakeDb(world())
  ctx.db = db
  db.tables.item_books.push(
    { id: BOOK_EXCLUDED, is_active: true, valid_from: null, valid_until: null, drop_excluded: true },
    { id: BOOK_ALL_EXCLUDED, is_active: true, valid_from: null, valid_until: null, drop_excluded: false }
  )
  db.tables.badges.push(
    badge(B_IN_EXCLUDED_BOOK, BOOK_EXCLUDED, { drop_excluded: false }),
    badge(B_EXCLUDED, BOOK_LIVE, { drop_excluded: true }),
    badge(B_OK, BOOK_LIVE, { drop_excluded: false }),
    badge(B_ONLY_EXCLUDED, BOOK_ALL_EXCLUDED, { drop_excluded: true })
  )
})

afterEach(() => {
  vi.useRealTimers()
})

const itemsSpec = (badgeIds: string[]): AmbientDropScheduleSpec => ({
  poiMode: 'list',
  poiIds: [P1, P2],
  perPoiCount: 1,
  itemMode: 'items',
  badgeIds,
})

const collectionsSpec = (collectionIds: string[]): AmbientDropScheduleSpec => ({
  poiMode: 'list',
  poiIds: [P1],
  perPoiCount: 1,
  itemMode: 'collections',
  collectionIds,
})

describe('아이템 직접 선택', () => {
  it('드랍 제외 아이템은 badge_drop_excluded로 걸리고 후보 풀에 들지 않는다', async () => {
    const targets = await loadScheduleTargets(sb(), itemsSpec([B_LIVE, B_EXCLUDED]), AT_ISO)
    expect(targets.excluded.badges).toEqual([{ id: B_EXCLUDED, reason: 'badge_drop_excluded' }])
    expect(targets.badgePool.map((b) => b.id)).toEqual([B_LIVE])
    expect(targets.reason).toBeUndefined()
  })

  it('드랍 제외 컬렉션의 아이템은 아이템 자신이 제외가 아니어도 collection_drop_excluded로 걸린다', async () => {
    const targets = await loadScheduleTargets(sb(), itemsSpec([B_LIVE, B_IN_EXCLUDED_BOOK]), AT_ISO)
    expect(targets.excluded.badges).toEqual([{ id: B_IN_EXCLUDED_BOOK, reason: 'collection_drop_excluded' }])
    expect(targets.badgePool.map((b) => b.id)).toEqual([B_LIVE])
  })

  it('지정한 아이템이 전부 드랍 제외면 놓을 후보가 없다(no_candidate_badges)', async () => {
    const targets = await loadScheduleTargets(sb(), itemsSpec([B_EXCLUDED, B_IN_EXCLUDED_BOOK]), AT_ISO)
    expect(targets.badgePool).toEqual([])
    expect(targets.reason).toBe('no_candidate_badges')
  })

  it('거절 문장에 「드랍 제외 아이템」·「드랍 제외 컬렉션」 사유가 건수와 함께 나온다', async () => {
    const targets = await loadScheduleTargets(sb(), itemsSpec([B_EXCLUDED, B_IN_EXCLUDED_BOOK]), AT_ISO)
    const problem = describeScheduleTargetProblems(targets)
    expect(problem).toContain('드랍 제외 아이템 1건')
    expect(problem).toContain('드랍 제외 컬렉션 1건')
  })
})

describe('컬렉션 선택', () => {
  it('드랍 제외 컬렉션은 collection_drop_excluded로 걸리고 대상 컬렉션에서 빠진다', async () => {
    const targets = await loadScheduleTargets(sb(), collectionsSpec([BOOK_LIVE, BOOK_EXCLUDED]), AT_ISO)
    expect(targets.excluded.collections).toEqual([{ id: BOOK_EXCLUDED, reason: 'collection_drop_excluded' }])
    expect(targets.effectiveCollectionIds).toEqual([BOOK_LIVE])
    expect(targets.badgePool.every((b) => b.itemBookId === BOOK_LIVE)).toBe(true)
  })

  it('지정한 컬렉션이 모두 드랍 제외면 no_eligible_collection이다', async () => {
    const targets = await loadScheduleTargets(sb(), collectionsSpec([BOOK_EXCLUDED]), AT_ISO)
    expect(targets.excluded.collections).toEqual([{ id: BOOK_EXCLUDED, reason: 'collection_drop_excluded' }])
    expect(targets.reason).toBe('no_eligible_collection')
    expect(targets.badgePool).toEqual([])
  })

  it('노출 중이 아니면서 드랍 제외인 컬렉션은 노출 사유(collection_not_exposed)가 먼저다', async () => {
    db.tables.item_books.push({ id: uuid(27), is_active: false, valid_from: null, valid_until: null, drop_excluded: true })
    const targets = await loadScheduleTargets(sb(), collectionsSpec([BOOK_LIVE, uuid(27)]), AT_ISO)
    expect(targets.excluded.collections).toEqual([{ id: uuid(27), reason: 'collection_not_exposed' }])
  })

  it('후보 풀에서 드랍 제외 아이템이 빠진다', async () => {
    const targets = await loadScheduleTargets(sb(), collectionsSpec([BOOK_LIVE]), AT_ISO)
    const ids = targets.badgePool.map((b) => b.id)
    expect(ids).toContain(B_LIVE)
    expect(ids).toContain(B_OK)
    expect(ids).not.toContain(B_EXCLUDED)
  })

  it('남은 컬렉션에 드랍 제외 아이템뿐이면 후보가 없다(no_candidate_badges)', async () => {
    const targets = await loadScheduleTargets(sb(), collectionsSpec([BOOK_ALL_EXCLUDED]), AT_ISO)
    expect(targets.excluded.collections).toEqual([])
    expect(targets.badgePool).toEqual([])
    expect(targets.reason).toBe('no_candidate_badges')
  })

  it('거절 문장에 「드랍 제외 컬렉션」 사유가 나온다', async () => {
    const targets = await loadScheduleTargets(sb(), collectionsSpec([BOOK_LIVE, BOOK_EXCLUDED]), AT_ISO)
    expect(describeScheduleTargetProblems(targets)).toContain('드랍 제외 컬렉션 1건')
  })
})

describe('예약 등록 — 예정 시각 기준 판정이 드랍 제외를 400으로 거절한다', () => {
  it('드랍 제외 아이템을 지정하면 400이고 예약 행을 쓰지 않는다', async () => {
    const result = await createAmbientDropSchedule(
      db.client as Parameters<typeof createAmbientDropSchedule>[0],
      { scheduled_at: AT, poi_ids: [P1], per_poi_count: 1, badge_ids: [B_EXCLUDED] },
      null,
      NOW
    )
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(!result.ok && result.error).toContain('드랍 제외 아이템 1건')
    expect(db.writesTo('ambient_drop_schedules')).toEqual([])
  })

  it('드랍 제외 컬렉션을 지정하면 400이고 예약 행을 쓰지 않는다', async () => {
    const result = await createAmbientDropSchedule(
      db.client as Parameters<typeof createAmbientDropSchedule>[0],
      { scheduled_at: AT, poi_ids: [P1], per_poi_count: 1, collection_ids: [BOOK_EXCLUDED] },
      null,
      NOW
    )
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(!result.ok && result.error).toContain('드랍 제외 컬렉션 1건')
    expect(db.writesTo('ambient_drop_schedules')).toEqual([])
  })
})

describe('지금 배포(runAmbientDropSpec) — 드랍 제외는 놓지 않고 사유를 남긴다', () => {
  const RUN_AT = new Date('2026-10-05T00:30:00.000Z')

  it('아이템 지정: 드랍 제외 아이템은 놓지 않고 excluded.badges에 사유가 남는다', async () => {
    const outcome = await runAmbientDropSpec(sb(), itemsSpec([B_LIVE, B_EXCLUDED]), { ranAt: RUN_AT, trigger: 'manual' })
    expect(outcome.excluded.badges).toEqual([{ id: B_EXCLUDED, reason: 'badge_drop_excluded' }])
    expect(db.rpcCalls.map((c) => c.args.p_badge_id)).toEqual([B_LIVE, B_LIVE])
  })

  it('아이템 지정이 전부 드랍 제외면 아무것도 놓지 않고 건너뛴다', async () => {
    const outcome = await runAmbientDropSpec(sb(), itemsSpec([B_EXCLUDED, B_IN_EXCLUDED_BOOK]), { ranAt: RUN_AT, trigger: 'manual' })
    expect(outcome).toMatchObject({ status: 'skipped', reason: 'no_candidate_badges' })
    expect(db.rpcCalls).toHaveLength(0)
  })

  it('컬렉션 지정: 드랍 제외 컬렉션만 가리키면 건너뛰고 사유를 남긴다', async () => {
    const outcome = await runAmbientDropSpec(sb(), collectionsSpec([BOOK_EXCLUDED]), { ranAt: RUN_AT, trigger: 'manual' })
    expect(outcome).toMatchObject({ status: 'skipped', reason: 'no_eligible_collection' })
    expect(outcome.excluded.collections).toEqual([{ id: BOOK_EXCLUDED, reason: 'collection_drop_excluded' }])
    expect(db.rpcCalls).toHaveLength(0)
  })

  it('컬렉션 지정: 드랍 제외 아이템은 후보에서 빠져 한 번도 놓이지 않는다', async () => {
    const outcome = await runAmbientDropSpec(
      sb(),
      { ...collectionsSpec([BOOK_LIVE]), perPoiCount: 30 } as AmbientDropScheduleSpec,
      { ranAt: RUN_AT, trigger: 'manual' }
    )
    expect(outcome.status).toBe('done')
    const placedBadges = new Set(db.rpcCalls.map((c) => c.args.p_badge_id))
    expect(placedBadges.has(B_EXCLUDED)).toBe(false)
    expect(placedBadges.size).toBeGreaterThan(0)
  })
})
