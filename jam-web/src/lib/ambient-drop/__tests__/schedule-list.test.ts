/**
 * 앰비언트 드랍 날짜 예약 — 목록 읽기와 화면용 변환 (티켓 20261001_2052)
 *
 *  - 실행 실패의 DB 오류 원문은 응답에 실리지 않고 `failureKind` 분류만 남는다
 *  - 최근순 정렬·개수 제한·파생 상태(`missed`·`stalled`)
 *  - 지점·아이템·컬렉션 이름을 함께 읽고, 이름 조회가 실패해도 목록은 성공한다
 *  - 어떤 경우에도 DB에 쓰지 않는다
 *
 * 실행: cd jam-web && npx vitest run src/lib/ambient-drop/__tests__/schedule-list.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { listAmbientDropSchedules, toScheduleListItem, toScheduleOutcomeView } from '../scheduleList'
import { AMBIENT_SCHEDULE_LATE_WINDOW_MS, AMBIENT_SCHEDULE_STALLED_AFTER_MS } from '../scheduleSpec'
import { createFakeDb, uuid, type FakeDb, type Row } from './schedule-test-db'
import { BOOK_LIVE, B_LIVE, P1, P2, world } from './schedule-fixtures'
import type { AmbientDropScheduleRow } from '@/types/database'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => db.client }))
vi.mock('@/lib/notifications/batch/shared', async () => (await import('./schedule-test-db')).sharedMock)

/** 2026-10-01 12:00 KST */
const NOW = new Date('2026-10-01T03:00:00.000Z')
const AT_ISO = '2026-10-05T00:00:00.000Z'

let db: FakeDb
const sb = () => db.client as Parameters<typeof listAmbientDropSchedules>[0]

beforeEach(() => {
  db = createFakeDb(world())
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  // 목록 읽기는 select만 한다 — 정기 배포 설정을 건드리지 않고 드랍도 놓지 않는다
  expect(db.calls.every((c) => c.op === 'select')).toBe(true)
  expect(db.calls.filter((c) => c.table === 'ambient_drop_config')).toEqual([])
  expect(db.tables.ambient_drop_config).toEqual(world().ambient_drop_config)
  expect(db.rpcCalls).toEqual([])
  expect(db.writesTo('poi_drops')).toEqual([])
})

let seq = 100
function addSchedule(overrides: Row = {}): Row {
  const row: Row = {
    id: uuid(seq++),
    title: null,
    scheduled_at: AT_ISO,
    status: 'scheduled',
    poi_mode: 'list',
    poi_ids: [P1],
    poi_category: null,
    item_mode: 'items',
    badge_ids: [B_LIVE],
    collection_ids: [],
    per_poi_count: 1,
    total_count: null,
    created_by: 'admin@example.com',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    claimed_at: null,
    finished_at: null,
    canceled_at: null,
    result: null,
    ...overrides,
  }
  db.tables.ambient_drop_schedules.push(row)
  return row
}

const toRow = (row: Row) => row as unknown as AmbientDropScheduleRow

async function listItems() {
  const result = await listAmbientDropSchedules(sb(), NOW)
  if (!result.ok) throw new Error(`목록이 실패했어요: ${result.error}`)
  return result
}

describe('실행 결과 — 오류 원문은 버리고 분류만 남긴다', () => {
  const RAW_LOOKUP = '대상 조회 실패: poi(예약 지점)[0~0] 조회 실패: permission denied for table poi'
  const RAW_UNEXPECTED = 'duplicate key value violates unique constraint "poi_drops_pkey"'
  const RAW_INSERT = '개체 선발급+배치 전부 실패'

  const failedResult = (overrides: Row) => ({
    requested: 3,
    spawned: 0,
    failed: 0,
    reason: null,
    error: null,
    overlappedPoiCount: 0,
    excluded: { pois: [], badges: [], collections: [] },
    dropIds: [],
    ...overrides,
  })

  it.each([
    ['대상 조회 실패 접두어 → target_lookup', failedResult({ error: RAW_LOOKUP }), 'target_lookup', RAW_LOOKUP],
    ['사유 insert_failed → insert', failedResult({ reason: 'insert_failed', error: RAW_INSERT }), 'insert', RAW_INSERT],
    ['그 밖의 예외 → unexpected', failedResult({ error: RAW_UNEXPECTED }), 'unexpected', RAW_UNEXPECTED],
  ])('%s', async (_name, result, failureKind, raw) => {
    addSchedule({ status: 'failed', finished_at: AT_ISO, result })
    const { schedules } = await listItems()
    expect(schedules[0].state).toBe('failed')
    expect(schedules[0].outcome).toMatchObject({ failureKind, requested: 3, spawned: 0 })
    // 응답 전체에 원문이 없다
    expect(JSON.stringify(schedules)).not.toContain(raw)
    expect(Object.keys(schedules[0].outcome ?? {})).not.toContain('error')
  })

  it('성공한 실행은 failureKind가 없다', async () => {
    addSchedule({ status: 'done', result: failedResult({ requested: 4, spawned: 4, dropIds: ['d1', 'd2', 'd3', 'd4'] }) })
    const { schedules } = await listItems()
    expect(schedules[0].outcome).toEqual({
      requested: 4,
      spawned: 4,
      failed: 0,
      reason: null,
      failureKind: null,
      overlappedPoiCount: 0,
      excludedSummary: null,
    })
  })

  it('건너뜀 사유와 빠진 대상 요약이 결과에 담긴다', async () => {
    addSchedule({
      status: 'skipped',
      result: failedResult({
        reason: 'no_eligible_poi',
        excluded: {
          pois: [{ id: P2, reason: 'poi_inactive' }],
          badges: [],
          collections: [
            { id: uuid(31), reason: 'collection_not_exposed' },
            { id: uuid(32), reason: 'collection_not_exposed' },
          ],
        },
      }),
    })
    const { schedules } = await listItems()
    expect(schedules[0].outcome).toMatchObject({
      reason: 'no_eligible_poi',
      excludedSummary: '운영이 끝난 지점 1건, 노출 중이 아닌 컬렉션 2건',
    })
  })

  it('겹쳐 놓은 지점 수와 만들지 못한 개수를 그대로 싣는다', async () => {
    addSchedule({ status: 'done', result: failedResult({ requested: 6, spawned: 4, failed: 2, overlappedPoiCount: 1 }) })
    const { schedules } = await listItems()
    expect(schedules[0].outcome).toMatchObject({ requested: 6, spawned: 4, failed: 2, overlappedPoiCount: 1 })
  })

  it('DB가 아직 scheduled인 놓친 예약은 state가 missed다', async () => {
    addSchedule({ scheduled_at: new Date(NOW.getTime() - AMBIENT_SCHEDULE_LATE_WINDOW_MS - 1000).toISOString() })
    const { schedules } = await listItems()
    expect(schedules[0]).toMatchObject({ status: 'scheduled', state: 'missed', outcome: null })
  })

  it('cron이 놓침으로 표시한 예약(result.reason=missed)도 state가 missed다', async () => {
    addSchedule({ status: 'missed', finished_at: AT_ISO, result: { reason: 'missed' } })
    const { schedules } = await listItems()
    expect(schedules[0]).toMatchObject({ status: 'missed', state: 'missed' })
    expect(schedules[0].outcome).toMatchObject({ reason: 'missed', failureKind: null })
  })
})

describe('toScheduleOutcomeView — 믿을 수 없는 JSON', () => {
  it('객체가 아니면 null이다', () => {
    for (const value of [null, undefined, 'x', 3, ['a']]) expect(toScheduleOutcomeView(value)).toBeNull()
  })

  it('숫자가 아닌 칸은 0, 모르는 빠진 사유는 「그 밖의 대상」으로 센다', () => {
    const view = toScheduleOutcomeView({
      requested: '3',
      spawned: null,
      excluded: { pois: [{ id: 'a', reason: 'never_seen' }], badges: 'broken', collections: [null] },
    })
    expect(view).toMatchObject({ requested: 0, spawned: 0, failed: 0, excludedSummary: '그 밖의 대상 1건' })
  })
})

describe('listAmbientDropSchedules — 목록', () => {
  it('예정 시각 내림차순이다', async () => {
    addSchedule({ title: '이른', scheduled_at: '2026-10-03T00:00:00.000Z' })
    addSchedule({ title: '늦은', scheduled_at: '2026-10-09T00:00:00.000Z' })
    addSchedule({ title: '가운데', scheduled_at: '2026-10-06T00:00:00.000Z' })
    const { schedules } = await listItems()
    expect(schedules.map((s) => s.title)).toEqual(['늦은', '가운데', '이른'])
  })

  it('기본은 최근 50건이다', async () => {
    for (let i = 0; i < 55; i += 1) {
      addSchedule({ scheduled_at: new Date(Date.UTC(2026, 9, 5, 0) + i * 3600_000).toISOString() })
    }
    const { schedules } = await listItems()
    expect(schedules).toHaveLength(50)
    // 가장 늦은 예약이 맨 앞이고, 가장 이른 5건은 잘렸다
    expect(schedules[0].scheduledAt).toBe(new Date(Date.UTC(2026, 9, 5, 0) + 54 * 3600_000).toISOString())
    expect(schedules[49].scheduledAt).toBe(new Date(Date.UTC(2026, 9, 5, 0) + 5 * 3600_000).toISOString())
  })

  it('limit 인자로 개수를 바꾼다', async () => {
    for (let i = 0; i < 4; i += 1) addSchedule({ scheduled_at: new Date(Date.UTC(2026, 9, 5, i)).toISOString() })
    const result = await listAmbientDropSchedules(sb(), NOW, 2)
    expect(result.ok && result.schedules).toHaveLength(2)
  })

  it('예약이 없으면 빈 목록과 빈 이름 맵이다', async () => {
    const result = await listItems()
    expect(result.schedules).toEqual([])
    expect(result.names).toEqual({ pois: {}, badges: {}, collections: {} })
  })

  it('running은 선점 30분 안이면 running, 넘으면 stalled다', async () => {
    addSchedule({ status: 'running', claimed_at: new Date(NOW.getTime() - 10 * 60_000).toISOString() })
    addSchedule({
      status: 'running',
      scheduled_at: '2026-10-04T00:00:00.000Z',
      claimed_at: new Date(NOW.getTime() - AMBIENT_SCHEDULE_STALLED_AFTER_MS - 1000).toISOString(),
    })
    const { schedules } = await listItems()
    expect(schedules.map((s) => [s.status, s.state])).toEqual([
      ['running', 'running'],
      ['running', 'stalled'],
    ])
  })

  it('행의 칸을 항목 모양(camelCase)으로 옮긴다', async () => {
    addSchedule({
      title: '가을 아침',
      poi_mode: 'category',
      poi_ids: [],
      poi_category: 'cafe',
      per_poi_count: null,
      total_count: 5,
      item_mode: 'collections',
      badge_ids: [],
      collection_ids: [BOOK_LIVE],
    })
    const { schedules } = await listItems()
    expect(schedules[0]).toMatchObject({
      title: '가을 아침',
      scheduledAt: AT_ISO,
      status: 'scheduled',
      state: 'scheduled',
      poiMode: 'category',
      poiIds: [],
      poiCategory: 'cafe',
      perPoiCount: null,
      totalCount: 5,
      itemMode: 'collections',
      badgeIds: [],
      collectionIds: [BOOK_LIVE],
      createdBy: 'admin@example.com',
      outcome: null,
    })
  })

  it('toScheduleListItem은 같은 변환을 한 행에 한다', () => {
    const item = toScheduleListItem(toRow(addSchedule()), NOW)
    expect(item).toMatchObject({ status: 'scheduled', state: 'scheduled', poiMode: 'list' })
  })

  it('읽기가 실패하면 500이고 DB 오류 원문은 응답에 없다', async () => {
    db.failReads.add('ambient_drop_schedules')
    const result = await listAmbientDropSchedules(sb(), NOW)
    expect(result).toMatchObject({ ok: false, status: 500 })
    expect(!result.ok && result.error).toBe(
      '예약 목록을 불러오지 못했어요. 서버에서 목록을 읽는 중 오류가 났어요. 잠시 후 새로고침해 주세요.'
    )
    expect(!result.ok && result.error).not.toContain('조회 실패(테스트)')
  })
})

describe('이름 맵', () => {
  function nameTheWorld() {
    for (const p of db.tables.poi) p.name = `지점-${String(p.id).slice(-2)}`
    for (const b of db.tables.badges) b.name = `아이템-${String(b.id).slice(-2)}`
    for (const c of db.tables.item_books) c.name = `컬렉션-${String(c.id).slice(-2)}`
  }

  it('목록에 나온 지점·아이템·컬렉션의 이름만 읽는다', async () => {
    nameTheWorld()
    addSchedule({ poi_ids: [P1, P2], badge_ids: [B_LIVE] })
    addSchedule({ item_mode: 'collections', badge_ids: [], collection_ids: [BOOK_LIVE] })
    const { names } = await listItems()
    expect(names).toEqual({
      pois: { [P1]: '지점-01', [P2]: '지점-02' },
      badges: { [B_LIVE]: '아이템-11' },
      collections: { [BOOK_LIVE]: '컬렉션-21' },
    })
  })

  it('이름 조회가 실패하면 그 맵만 비고 목록은 성공한다', async () => {
    nameTheWorld()
    addSchedule({ poi_ids: [P1], badge_ids: [B_LIVE] })
    db.failReads.add('poi')
    const { schedules, names } = await listItems()
    expect(schedules).toHaveLength(1)
    expect(names.pois).toEqual({})
    expect(names.badges).toEqual({ [B_LIVE]: '아이템-11' })
    expect(console.error).toHaveBeenCalled()
  })

  it('세 이름 조회가 모두 실패해도 목록은 성공한다', async () => {
    addSchedule({ item_mode: 'collections', badge_ids: [], collection_ids: [BOOK_LIVE] })
    for (const table of ['poi', 'badges', 'item_books']) db.failReads.add(table)
    const result = await listItems()
    expect(result.schedules).toHaveLength(1)
    expect(result.names).toEqual({ pois: {}, badges: {}, collections: {} })
  })
})
