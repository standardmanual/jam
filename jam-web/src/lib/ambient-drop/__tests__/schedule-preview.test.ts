/**
 * 앰비언트 드랍 날짜 예약 — 등록 전 미리 확인 (티켓 20261001_2052)
 *
 *  - 지점 직접 모드는 「이미 드랍이 있는 지점 N곳」을 알리고, 종류+개수 모드는 겹침이 0이다
 *  - 대상 판정은 지금이 아니라 「예정 시각」 기준이다 — 운영이 끝난 지점·삭제된 아이템·예정 시각에 공개 전인
 *    컬렉션은 `problem`에 담기고(200), 예정 시각에는 공개된 컬렉션은 통과한다
 *  - 입력 오류만 400, 읽기 실패는 500이다
 *  - DB에 쓰지 않고(rpc 포함) 정기 배포 설정 행도 그대로다
 *
 * 실행: cd jam-web && npx vitest run src/lib/ambient-drop/__tests__/schedule-preview.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { previewAmbientDropSchedule, summarizeSchedulePreview } from '../schedulePreview'
import type { ScheduleTargets } from '../scheduleTargets'
import { createFakeDb, type FakeDb } from './schedule-test-db'
import {
  BOOK_ENDING,
  BOOK_LATE,
  BOOK_LIVE,
  BOOK_PRELAUNCH,
  B_DELETED,
  B_LIVE,
  P1,
  P2,
  P_INACTIVE,
  world,
} from './schedule-fixtures'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => db.client }))
vi.mock('@/lib/notifications/batch/shared', async () => (await import('./schedule-test-db')).sharedMock)

/** 2026-10-01 12:00 KST */
const NOW = new Date('2026-10-01T03:00:00.000Z')
/** 2026-10-05 09:00 KST */
const AT = '2026-10-05T09:00:00+09:00'
const AT_ISO = '2026-10-05T00:00:00.000Z'

let db: FakeDb
const sb = () => db.client as Parameters<typeof previewAmbientDropSchedule>[0]
const preview = (body: unknown) => previewAmbientDropSchedule(sb(), body, NOW)

beforeEach(() => {
  db = createFakeDb(world())
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  // 미리 확인은 읽기만 한다 — 예약 행도, 드랍도, 정기 배포 설정도 건드리지 않는다
  expect(db.calls.every((c) => c.op === 'select')).toBe(true)
  expect(db.writesTo('ambient_drop_schedules')).toEqual([])
  expect(db.writesTo('poi_drops')).toEqual([])
  expect(db.rpcCalls).toEqual([])
  expect(db.calls.filter((c) => c.table === 'ambient_drop_config')).toEqual([])
  expect(db.tables.ambient_drop_config).toEqual(world().ambient_drop_config)
  expect(db.tables.ambient_drop_schedules).toEqual([])
})

const LIST_ITEMS = { scheduled_at: AT, poi_ids: [P1, P2], per_poi_count: 2, badge_ids: [B_LIVE] }
const LIST_COLLECTIONS = { scheduled_at: AT, poi_ids: [P2], per_poi_count: 1, collection_ids: [BOOK_LIVE] }
const CATEGORY_ITEMS = { scheduled_at: AT, poi_category: 'cafe', total_count: 5, badge_ids: [B_LIVE] }
const CATEGORY_COLLECTIONS = { scheduled_at: AT, total_count: 5, collection_ids: [BOOK_LIVE] }

async function ok(body: unknown) {
  const result = await preview(body)
  if (!result.ok) throw new Error(`미리 확인이 실패했어요: ${result.status} ${result.error}`)
  return result.preview
}

describe('지점 모드 — 겹침 알림', () => {
  it('지점 직접: 이미 드랍이 있는 지점 수와 안내 문장을 낸다', async () => {
    // P1에는 활성 시스템 드랍이 1개(drop-existing) 있고 P2에는 없다
    const p = await ok(LIST_ITEMS)
    expect(p).toMatchObject({
      scheduledAt: AT_ISO,
      requested: 4,
      poiMode: 'list',
      eligiblePoiCount: 2,
      overlappedPoiCount: 1,
      candidateBadgeCount: 1,
      problem: null,
    })
    expect(p.overlapNotice).toBe('이미 드랍이 있는 지점이 1곳이에요. 이 지점에는 있던 드랍 위에 겹쳐서 놓여요.')
  })

  it('지점 직접: 드랍이 없는 지점만 고르면 겹침 0이고 안내 문장도 없다', async () => {
    const p = await ok(LIST_COLLECTIONS)
    expect(p).toMatchObject({ requested: 1, overlappedPoiCount: 0, overlapNotice: null, problem: null })
  })

  it('종류+개수: 이미 드랍이 있는 지점이 있어도 겹침은 0이다', async () => {
    const p = await ok(CATEGORY_ITEMS)
    expect(p).toMatchObject({
      requested: 5,
      poiMode: 'category',
      eligiblePoiCount: 2,
      overlappedPoiCount: 0,
      overlapNotice: null,
      problem: null,
    })
  })

  it('종류+개수 × 컬렉션도 같다', async () => {
    const p = await ok(CATEGORY_COLLECTIONS)
    expect(p).toMatchObject({ poiMode: 'category', overlappedPoiCount: 0, overlapNotice: null, problem: null })
    expect(p.candidateBadgeCount).toBeGreaterThan(0)
  })
})

describe('대상 판정 — 예정 시각 기준, 문제는 200의 problem', () => {
  it('운영이 끝난 지점은 problem이다', async () => {
    const p = await ok({ ...LIST_ITEMS, poi_ids: [P1, P_INACTIVE] })
    expect(p.problem).toContain('운영이 끝난 지점 1건')
    expect(p.eligiblePoiCount).toBe(1)
  })

  it('삭제된 아이템은 problem이다', async () => {
    const p = await ok({ ...LIST_ITEMS, badge_ids: [B_LIVE, B_DELETED] })
    expect(p.problem).toContain('삭제된 아이템 1건')
  })

  it('예정 시각에 아직 공개 전인 컬렉션(BOOK_LATE)은 problem이다', async () => {
    const p = await ok({ ...LIST_COLLECTIONS, collection_ids: [BOOK_LATE] })
    expect(p.problem).toContain('노출 중이 아닌 컬렉션 1건')
  })

  it('예정 시각에 이미 기간이 끝난 컬렉션(BOOK_ENDING)은 problem이다', async () => {
    const p = await ok({ ...LIST_COLLECTIONS, collection_ids: [BOOK_ENDING] })
    expect(p.problem).toContain('노출 중이 아닌 컬렉션 1건')
  })

  it('오늘은 공개 전이어도 예정 시각에 공개되는 컬렉션(BOOK_PRELAUNCH)은 통과한다', async () => {
    const p = await ok({ ...LIST_COLLECTIONS, collection_ids: [BOOK_PRELAUNCH] })
    expect(p.problem).toBeNull()
    expect(p.candidateBadgeCount).toBe(1)
  })

  it('문제가 있어도 200이고, 같은 내용의 등록 거절 문장이 그대로 실린다', async () => {
    const result = await preview({ ...LIST_ITEMS, poi_ids: [P_INACTIVE] })
    expect(result.ok).toBe(true)
    expect(result.ok && result.preview.problem).toMatch(/^예정 시각에 놓을 수 없는 대상이 있어요\(/)
  })
})

describe('입력 오류와 읽기 실패', () => {
  it('예정 시각이 없으면 400이다(「지금」은 이 경로에서 받지 않는다)', async () => {
    const { scheduled_at: _omit, ...withoutAt } = LIST_ITEMS
    const result = await preview(withoutAt)
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(!result.ok && result.error).toContain('놓을 시각이 없어요')
  })

  it('정시가 아닌 시각·모드 섞임은 400이다', async () => {
    expect(await preview({ ...LIST_ITEMS, scheduled_at: '2026-10-05T09:30:00+09:00' })).toMatchObject({ ok: false, status: 400 })
    expect(await preview({ ...LIST_ITEMS, total_count: 3 })).toMatchObject({ ok: false, status: 400 })
  })

  it('본문이 객체가 아니면 400이다', async () => {
    expect(await preview(null)).toMatchObject({ ok: false, status: 400 })
  })

  it('없는 지점 종류는 400이다', async () => {
    const result = await preview({ ...CATEGORY_ITEMS, poi_category: 'nowhere' })
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(!result.ok && result.error).toContain('지점 종류를 찾을 수 없어요')
  })

  it('대상 읽기가 실패하면 500이고 DB 원문은 응답에 없다', async () => {
    db.failReads.add('poi')
    const result = await preview(LIST_ITEMS)
    expect(result).toMatchObject({ ok: false, status: 500 })
    expect(!result.ok && result.error).toBe('예약 대상을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')
  })

  it('지점 종류 확인이 실패해도 500이다', async () => {
    db.failReads.add('poi_categories')
    const result = await preview(CATEGORY_ITEMS)
    expect(result).toMatchObject({ ok: false, status: 500 })
    expect(!result.ok && result.error).not.toContain('조회 실패(테스트)')
  })
})

describe('summarizeSchedulePreview — 순수 요약', () => {
  const targets = (overrides: Partial<ScheduleTargets> = {}): ScheduleTargets => ({
    pois: [
      { id: P1, activeSystemCount: 2 },
      { id: P2, activeSystemCount: 0 },
    ],
    badgePool: [{ id: B_LIVE, rarity: 'common', itemBookId: BOOK_LIVE }],
    excluded: { pois: [], badges: [], collections: [] },
    effectiveCollectionIds: [BOOK_LIVE],
    ...overrides,
  })

  it('지점 직접은 활성 드랍이 있는 지점 수를 센다', () => {
    const p = summarizeSchedulePreview({ poiMode: 'list', poiIds: [P1, P2], perPoiCount: 3, itemMode: 'items', badgeIds: [B_LIVE] }, AT_ISO, targets())
    expect(p).toMatchObject({ requested: 6, eligiblePoiCount: 2, overlappedPoiCount: 1, candidateBadgeCount: 1, problem: null })
  })

  it('종류+개수는 활성 드랍이 있는 지점이 있어도 겹침을 세지 않는다', () => {
    const p = summarizeSchedulePreview({ poiMode: 'category', poiCategory: null, totalCount: 4, itemMode: 'items', badgeIds: [B_LIVE] }, AT_ISO, targets())
    expect(p).toMatchObject({ requested: 4, overlappedPoiCount: 0, overlapNotice: null })
  })

  it('놓을 대상이 하나도 없으면 사유 문장을 problem에 싣는다', () => {
    const p = summarizeSchedulePreview(
      { poiMode: 'list', poiIds: [P1], perPoiCount: 1, itemMode: 'items', badgeIds: [B_LIVE] },
      AT_ISO,
      targets({ pois: [], reason: 'no_eligible_poi' })
    )
    expect(p.problem).toContain('놓을 수 있는 지점이 없어요')
    expect(p.eligiblePoiCount).toBe(0)
  })
})
