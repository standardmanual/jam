/**
 * 앰비언트 드랍 예약 저장소 서버 함수 (티켓 20261001_2051)
 *
 * 등록·취소·시각 수정·상태 읽기와 실행기용 내부 함수(놓친 표시·선점·결과 기록)를 가짜 DB로 검증한다.
 *  - 등록·시각 수정 판정은 지금이 아니라 「예정 시각」 기준이다
 *  - 취소·시각 수정·선점은 `status='scheduled'` 조건부 UPDATE라 겹치면 한쪽만 이긴다
 *  - 어떤 단계에서도 `ambient_drop_config`를 읽지도 쓰지도 않는다
 *
 * 실행: cd jam-web && npx vitest run src/lib/ambient-drop/__tests__/schedule-store.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AMBIENT_SCHEDULE_LATE_WINDOW_MS, AMBIENT_SCHEDULE_STALLED_AFTER_MS } from '../scheduleSpec'
import {
  cancelScheduledAmbientDrop,
  claimDueAmbientDropSchedules,
  createAmbientDropSchedule,
  finishAmbientDropSchedule,
  getAmbientDropSchedule,
  markMissedAmbientDropSchedules,
  rescheduleAmbientDrop,
} from '../scheduleStore'
import { createFakeDb, uuid, type FakeDb, type Row } from './schedule-test-db'
import {
  BOOK_ENDING,
  BOOK_LATE,
  BOOK_LIVE,
  BOOK_PRELAUNCH,
  B_DELETED,
  B_ENDING,
  B_LATE,
  B_LIVE,
  B_NO_BOOK,
  B_PRELAUNCH,
  P1,
  P2,
  P_INACTIVE,
  P_MISSING,
  badge,
  world,
} from './schedule-fixtures'

vi.mock('@/lib/notifications/batch/shared', async () => (await import('./schedule-test-db')).sharedMock)

/** 2026-10-01 12:00 KST */
const NOW = new Date('2026-10-01T03:00:00.000Z')
/** 2026-10-05 09:00 KST */
const AT = '2026-10-05T09:00:00+09:00'
const AT_ISO = '2026-10-05T00:00:00.000Z'

const SCHEDULE_ID = uuid(900)

let db: FakeDb
const sb = () => db.client as Parameters<typeof createAmbientDropSchedule>[0]

beforeEach(() => {
  db = createFakeDb(world())
})

afterEach(() => {
  // 어느 테스트에서든 정기 배포 설정을 읽지도 쓰지도 않는다
  expect(db.calls.filter((c) => c.table === 'ambient_drop_config')).toEqual([])
  expect(db.tables.ambient_drop_config).toEqual(world().ambient_drop_config)
})

const LIST_ITEMS = { scheduled_at: AT, poi_ids: [P1, P2], per_poi_count: 2, badge_ids: [B_LIVE] }
const LIST_COLLECTIONS = { scheduled_at: AT, poi_ids: [P1], per_poi_count: 1, collection_ids: [BOOK_LIVE] }
const CATEGORY_ITEMS = { scheduled_at: AT, poi_category: 'cafe', total_count: 5, badge_ids: [B_LIVE] }
const CATEGORY_COLLECTIONS = { scheduled_at: AT, total_count: 5, collection_ids: [BOOK_LIVE] }

function insertSchedule(overrides: Row = {}): Row {
  const row: Row = {
    id: SCHEDULE_ID,
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

function scheduleRow(id = SCHEDULE_ID): Row {
  const row = db.tables.ambient_drop_schedules.find((r) => r.id === id)
  if (!row) throw new Error('예약 행이 없어요')
  return row
}

describe('createAmbientDropSchedule — 네 조합 등록', () => {
  it.each([
    ['지점 직접 × 아이템 직접', LIST_ITEMS, { poi_mode: 'list', item_mode: 'items', per_poi_count: 2, total_count: null }],
    ['지점 직접 × 컬렉션', LIST_COLLECTIONS, { poi_mode: 'list', item_mode: 'collections', per_poi_count: 1, total_count: null }],
    ['종류+개수 × 아이템 직접', CATEGORY_ITEMS, { poi_mode: 'category', item_mode: 'items', per_poi_count: null, total_count: 5 }],
    ['종류+개수 × 컬렉션', CATEGORY_COLLECTIONS, { poi_mode: 'category', item_mode: 'collections', per_poi_count: null, total_count: 5 }],
  ])('%s', async (_name, body, expected) => {
    const result = await createAmbientDropSchedule(sb(), { ...body, title: '가을 아침' }, 'admin@example.com', NOW)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.schedule).toMatchObject({ ...expected, status: 'scheduled', scheduled_at: AT_ISO, created_by: 'admin@example.com', title: '가을 아침' })
    expect(db.tables.ambient_drop_schedules).toHaveLength(1)
    // 등록은 예약 행 하나를 더할 뿐이다 — 드랍을 놓지 않는다
    expect(db.rpcCalls).toHaveLength(0)
    expect(db.writesTo('poi_drops')).toEqual([])
  })

  it('입력 검증 실패는 400이고 아무것도 쓰지 않는다', async () => {
    const result = await createAmbientDropSchedule(sb(), { ...LIST_ITEMS, scheduled_at: '2026-10-05T10:30:00+09:00' }, null, NOW)
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(db.writesTo('ambient_drop_schedules')).toEqual([])
  })

  it('존재하지 않는 지점 종류는 400이다', async () => {
    const result = await createAmbientDropSchedule(sb(), { ...CATEGORY_ITEMS, poi_category: 'nowhere' }, null, NOW)
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(!result.ok && result.error).toContain('지점 종류를 찾을 수 없어요')
    expect(db.writesTo('ambient_drop_schedules')).toEqual([])
  })

  it('지점 종류 확인이 실패하면 500이고 쓰지 않는다 (fail-closed)', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    db.failReads.add('poi_categories')
    const result = await createAmbientDropSchedule(sb(), CATEGORY_ITEMS, null, NOW)
    expect(result).toMatchObject({ ok: false, status: 500 })
    expect(db.writesTo('ambient_drop_schedules')).toEqual([])
    errorLog.mockRestore()
  })

  it('예약 저장(INSERT)이 실패하면 500이다', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    db.failWrites.add('ambient_drop_schedules')
    const result = await createAmbientDropSchedule(sb(), LIST_ITEMS, null, NOW)
    expect(result).toMatchObject({ ok: false, status: 500 })
    expect(db.tables.ambient_drop_schedules).toEqual([])
    errorLog.mockRestore()
  })

  it('대상 판정 조회가 실패하면 500이고 쓰지 않는다 (fail-closed)', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    db.failReads.add('poi')
    const result = await createAmbientDropSchedule(sb(), LIST_ITEMS, null, NOW)
    expect(result).toMatchObject({ ok: false, status: 500 })
    expect(db.writesTo('ambient_drop_schedules')).toEqual([])
    errorLog.mockRestore()
  })
})

describe('createAmbientDropSchedule — 예정 시각 기준 노출 판정', () => {
  it('지금은 공개 전이지만 예정 시각에 공개되는 컬렉션은 통과한다', async () => {
    const collection = await createAmbientDropSchedule(sb(), { ...LIST_COLLECTIONS, collection_ids: [BOOK_PRELAUNCH] }, null, NOW)
    expect(collection.ok).toBe(true)
    const item = await createAmbientDropSchedule(sb(), { ...LIST_ITEMS, badge_ids: [B_PRELAUNCH] }, null, NOW)
    expect(item.ok).toBe(true)
  })

  it('예정 시각보다 늦게 공개되는 컬렉션은 400이다', async () => {
    const collection = await createAmbientDropSchedule(sb(), { ...LIST_COLLECTIONS, collection_ids: [BOOK_LATE] }, null, NOW)
    expect(collection).toMatchObject({ ok: false, status: 400 })
    expect(!collection.ok && collection.error).toContain('노출 중이 아닌 컬렉션 1건')
    const item = await createAmbientDropSchedule(sb(), { ...LIST_ITEMS, badge_ids: [B_LATE] }, null, NOW)
    expect(item).toMatchObject({ ok: false, status: 400 })
    expect(!item.ok && item.error).toContain('노출 중이 아닌 컬렉션 1건')
  })

  it('예정 시각에 기간이 끝난 컬렉션은 400이다 (지금은 노출 중이어도)', async () => {
    const collection = await createAmbientDropSchedule(sb(), { ...CATEGORY_COLLECTIONS, collection_ids: [BOOK_ENDING] }, null, NOW)
    expect(collection).toMatchObject({ ok: false, status: 400 })
    const item = await createAmbientDropSchedule(sb(), { ...CATEGORY_ITEMS, badge_ids: [B_ENDING] }, null, NOW)
    expect(item).toMatchObject({ ok: false, status: 400 })
  })

  it('컬렉션 여러 개 중 하나라도 걸리면 400이고 걸린 개수를 알린다', async () => {
    const result = await createAmbientDropSchedule(sb(), { ...LIST_COLLECTIONS, collection_ids: [BOOK_LIVE, BOOK_LATE] }, null, NOW)
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(!result.ok && result.error).toContain('노출 중이 아닌 컬렉션 1건')
    expect(db.writesTo('ambient_drop_schedules')).toEqual([])
  })

  it('비활성 지점·없는 지점은 400이다', async () => {
    const inactive = await createAmbientDropSchedule(sb(), { ...LIST_ITEMS, poi_ids: [P1, P_INACTIVE] }, null, NOW)
    expect(inactive).toMatchObject({ ok: false, status: 400 })
    expect(!inactive.ok && inactive.error).toContain('운영이 끝난 지점 1건')
    const missing = await createAmbientDropSchedule(sb(), { ...LIST_ITEMS, poi_ids: [P_MISSING] }, null, NOW)
    expect(missing).toMatchObject({ ok: false, status: 400 })
    expect(!missing.ok && missing.error).toContain('찾을 수 없는 지점 1건')
  })

  it('삭제된 아이템·컬렉션에 속하지 않은 아이템·없는 아이템은 400이다', async () => {
    for (const [badgeId, label] of [
      [B_DELETED, '삭제된 아이템'],
      [B_NO_BOOK, '컬렉션에 속하지 않은 아이템'],
      [uuid(77), '찾을 수 없는 아이템'],
    ] as const) {
      const result = await createAmbientDropSchedule(sb(), { ...LIST_ITEMS, badge_ids: [badgeId] }, null, NOW)
      expect(result).toMatchObject({ ok: false, status: 400 })
      expect(!result.ok && result.error).toContain(`${label} 1건`)
    }
    expect(db.writesTo('ambient_drop_schedules')).toEqual([])
  })

  it('예정 시각에 유효기간이 끝난 아이템·아직 유효하지 않은 아이템은 400이다', async () => {
    db.tables.badges.push(
      badge(uuid(31), BOOK_LIVE, { valid_until: '2026-10-04T00:00:00+00:00' }),
      badge(uuid(32), BOOK_LIVE, { valid_from: '2026-10-09T00:00:00+00:00' })
    )
    const expired = await createAmbientDropSchedule(sb(), { ...LIST_ITEMS, badge_ids: [uuid(31)] }, null, NOW)
    expect(!expired.ok && expired.error).toContain('유효기간이 끝난 아이템 1건')
    const notYet = await createAmbientDropSchedule(sb(), { ...LIST_ITEMS, badge_ids: [uuid(32)] }, null, NOW)
    expect(!notYet.ok && notYet.error).toContain('아직 유효하지 않은 아이템 1건')
  })

  it('컬렉션에 후보 아이템이 하나도 없으면 400이다', async () => {
    db.tables.badges = []
    const result = await createAmbientDropSchedule(sb(), LIST_COLLECTIONS, null, NOW)
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(!result.ok && result.error).toContain('놓을 수 있는 아이템이 없어요')
  })

  it('종류에 운영 중인 지점이 없으면 400이다', async () => {
    db.tables.poi_categories.push({ slug: 'park' })
    const result = await createAmbientDropSchedule(sb(), { ...CATEGORY_ITEMS, poi_category: 'park' }, null, NOW)
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(!result.ok && result.error).toContain('놓을 수 있는 지점이 없어요')
  })
})

describe('cancelScheduledAmbientDrop — 공개 전 취소', () => {
  it('scheduled 예약을 취소하고 취소 시각을 남긴다', async () => {
    insertSchedule()
    expect(await cancelScheduledAmbientDrop(sb(), SCHEDULE_ID, NOW)).toEqual({ ok: true })
    expect(scheduleRow()).toMatchObject({ status: 'canceled', canceled_at: NOW.toISOString() })
  })

  it('실행 중·실행 뒤(done·skipped·failed·missed)·이미 취소된 예약은 409이고 바꾸지 않는다', async () => {
    for (const status of ['running', 'done', 'skipped', 'failed', 'missed', 'canceled']) {
      db.tables.ambient_drop_schedules = []
      insertSchedule({ status })
      const result = await cancelScheduledAmbientDrop(sb(), SCHEDULE_ID, NOW)
      expect(result).toMatchObject({ ok: false, status: 409 })
      expect(scheduleRow().status).toBe(status)
      expect(scheduleRow().canceled_at).toBeNull()
    }
  })

  it('없는 id와 UUID 형식이 아닌 id는 404이다', async () => {
    expect(await cancelScheduledAmbientDrop(sb(), uuid(999), NOW)).toMatchObject({ ok: false, status: 404 })
    expect(await cancelScheduledAmbientDrop(sb(), 'not-a-uuid', NOW)).toMatchObject({ ok: false, status: 404 })
  })

  it('갱신이 실패하면 500이고 예약은 그대로다', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    insertSchedule()
    db.failWrites.add('ambient_drop_schedules')
    expect(await cancelScheduledAmbientDrop(sb(), SCHEDULE_ID, NOW)).toMatchObject({ ok: false, status: 500 })
    expect(scheduleRow().status).toBe('scheduled')
    errorLog.mockRestore()
  })

  it('취소는 조건부 UPDATE 한 번이다 — status 조건을 건 UPDATE가 나간다', async () => {
    insertSchedule()
    await cancelScheduledAmbientDrop(sb(), SCHEDULE_ID, NOW)
    const updates = db.writesTo('ambient_drop_schedules')
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({ op: 'update', payload: { status: 'canceled' } })
  })
})

describe('취소와 선점이 겹치면 한쪽만 이긴다', () => {
  it('동시에 부르면 취소 성공과 선점 성공 중 정확히 하나만 일어난다', async () => {
    insertSchedule({ scheduled_at: '2026-10-01T02:00:00.000Z' }) // 한 시간 전에 도래
    const [cancel, claimed] = await Promise.all([
      cancelScheduledAmbientDrop(sb(), SCHEDULE_ID, NOW),
      claimDueAmbientDropSchedules(sb(), NOW, 1),
    ])
    expect(Number(cancel.ok) + claimed.length).toBe(1)
    expect(scheduleRow().status).toBe(cancel.ok ? 'canceled' : 'running')
    if (!cancel.ok) expect(cancel).toMatchObject({ status: 409 })
  })

  it('선점이 후보를 읽은 뒤 취소가 끼어들면 선점은 빈손이다', async () => {
    insertSchedule({ scheduled_at: '2026-10-01T02:00:00.000Z' })
    db.beforeExecute = (call) => {
      // 선점의 조건부 UPDATE가 실행되기 직전에 취소가 먼저 이긴다
      if (call.table === 'ambient_drop_schedules' && call.op === 'update') {
        db.beforeExecute = null
        scheduleRow().status = 'canceled'
      }
    }
    expect(await claimDueAmbientDropSchedules(sb(), NOW, 1)).toEqual([])
    expect(scheduleRow().status).toBe('canceled')
  })

  it('취소가 끝난 뒤의 선점은 그 예약을 가져가지 않고, 선점이 끝난 뒤의 취소는 409다', async () => {
    insertSchedule({ scheduled_at: '2026-10-01T02:00:00.000Z' })
    await cancelScheduledAmbientDrop(sb(), SCHEDULE_ID, NOW)
    expect(await claimDueAmbientDropSchedules(sb(), NOW, 1)).toEqual([])

    db.tables.ambient_drop_schedules = []
    insertSchedule({ scheduled_at: '2026-10-01T02:00:00.000Z' })
    expect(await claimDueAmbientDropSchedules(sb(), NOW, 1)).toHaveLength(1)
    expect(await cancelScheduledAmbientDrop(sb(), SCHEDULE_ID, NOW)).toMatchObject({ ok: false, status: 409 })
  })
})

describe('rescheduleAmbientDrop — 공개 전 시각 수정', () => {
  const NEW_AT = '2026-10-07T21:00:00+09:00'
  const NEW_AT_ISO = '2026-10-07T12:00:00.000Z'

  it('새 시각으로 바꾸고 updated_at을 갱신한다', async () => {
    insertSchedule()
    const result = await rescheduleAmbientDrop(sb(), SCHEDULE_ID, NEW_AT, NOW)
    expect(result.ok).toBe(true)
    expect(scheduleRow()).toMatchObject({ scheduled_at: NEW_AT_ISO, updated_at: NOW.toISOString(), status: 'scheduled' })
  })

  it('정시가 아니거나 과거이거나 형식이 틀리면 400이고 바꾸지 않는다', async () => {
    insertSchedule()
    for (const bad of ['2026-10-07T21:30:00+09:00', '2026-09-30T09:00:00+09:00', '2026-10-07T21:00:00', 'soon', 5]) {
      expect(await rescheduleAmbientDrop(sb(), SCHEDULE_ID, bad, NOW)).toMatchObject({ ok: false, status: 400 })
    }
    expect(scheduleRow().scheduled_at).toBe(AT_ISO)
    expect(db.writesTo('ambient_drop_schedules')).toEqual([])
  })

  it('새 시각 기준으로 노출 판정을 다시 한다 — 새 시각에 기간이 끝난 컬렉션이면 400', async () => {
    // BOOK_ENDING은 10-04에 기간이 끝난다
    insertSchedule({ poi_mode: 'list', item_mode: 'collections', badge_ids: [], collection_ids: [BOOK_ENDING] })
    const result = await rescheduleAmbientDrop(sb(), SCHEDULE_ID, '2026-10-02T09:00:00+09:00', NOW)
    expect(result.ok).toBe(true) // 10-02 00:00Z에는 아직 노출 중
    const late = await rescheduleAmbientDrop(sb(), SCHEDULE_ID, '2026-10-07T09:00:00+09:00', NOW)
    expect(late).toMatchObject({ ok: false, status: 400 })
    expect(scheduleRow().scheduled_at).toBe('2026-10-02T00:00:00.000Z')
  })

  it('실행 중·실행 뒤·취소된 예약은 409이다', async () => {
    for (const status of ['running', 'done', 'skipped', 'failed', 'missed', 'canceled']) {
      db.tables.ambient_drop_schedules = []
      insertSchedule({ status })
      expect(await rescheduleAmbientDrop(sb(), SCHEDULE_ID, NEW_AT, NOW)).toMatchObject({ ok: false, status: 409 })
      expect(scheduleRow().scheduled_at).toBe(AT_ISO)
    }
  })

  describe('놓침으로 읽히는 예약은 cron 표시 여부와 관계없이 같은 409이다', () => {
    const MISSED_MESSAGE =
      '예정 시각에서 3시간이 지나 놓친 예약이라 수정할 수 없어요. 다시 놓으려면 새 예약을 등록해 주세요.'

    it('DB는 scheduled인데 예정 시각 + 3시간이 지났으면(파생 상태 missed) 409이고 UPDATE를 보내지 않는다', async () => {
      const lateIso = new Date(NOW.getTime() - AMBIENT_SCHEDULE_LATE_WINDOW_MS - 60_000).toISOString() // 3시간 1분 전
      insertSchedule({ scheduled_at: lateIso })
      const result = await rescheduleAmbientDrop(sb(), SCHEDULE_ID, NEW_AT, NOW)
      expect(result).toEqual({ ok: false, status: 409, error: MISSED_MESSAGE })
      expect(scheduleRow()).toMatchObject({ scheduled_at: lateIso, status: 'scheduled' })
      expect(db.writesTo('ambient_drop_schedules')).toEqual([])
    })

    it('cron이 이미 missed로 표시한 예약도 같은 문구의 409이다', async () => {
      insertSchedule({ status: 'missed', scheduled_at: '2026-10-01T00:00:00.000Z' })
      const result = await rescheduleAmbientDrop(sb(), SCHEDULE_ID, NEW_AT, NOW)
      expect(result).toEqual({ ok: false, status: 409, error: MISSED_MESSAGE })
      expect(db.writesTo('ambient_drop_schedules')).toEqual([])
    })

    it('예정 시각에서 정확히 3시간이 지난 때는 아직 놓침이 아니라 고쳐진다(경계는 지난 뒤부터)', async () => {
      insertSchedule({ scheduled_at: new Date(NOW.getTime() - AMBIENT_SCHEDULE_LATE_WINDOW_MS).toISOString() })
      const result = await rescheduleAmbientDrop(sb(), SCHEDULE_ID, NEW_AT, NOW)
      expect(result.ok).toBe(true)
      expect(scheduleRow()).toMatchObject({ scheduled_at: NEW_AT_ISO, status: 'scheduled' })
    })
  })

  it('없는 id는 404이다', async () => {
    expect(await rescheduleAmbientDrop(sb(), uuid(999), NEW_AT, NOW)).toMatchObject({ ok: false, status: 404 })
    expect(await rescheduleAmbientDrop(sb(), 'x', NEW_AT, NOW)).toMatchObject({ ok: false, status: 404 })
  })

  it('읽은 뒤 쓰기 전에 선점이 이기면 409이고 시각을 바꾸지 않는다', async () => {
    insertSchedule()
    db.beforeExecute = (call) => {
      if (call.table === 'ambient_drop_schedules' && call.op === 'update') {
        db.beforeExecute = null
        scheduleRow().status = 'running'
      }
    }
    expect(await rescheduleAmbientDrop(sb(), SCHEDULE_ID, NEW_AT, NOW)).toMatchObject({ ok: false, status: 409 })
    expect(scheduleRow().scheduled_at).toBe(AT_ISO)
  })

  it('지점·아이템 내용은 바꾸지 않는다', async () => {
    insertSchedule()
    const before = { ...scheduleRow() }
    await rescheduleAmbientDrop(sb(), SCHEDULE_ID, NEW_AT, NOW)
    const after = scheduleRow()
    expect({ ...after, scheduled_at: before.scheduled_at, updated_at: before.updated_at }).toEqual(before)
  })
})

describe('getAmbientDropSchedule — 상태 읽기', () => {
  it('행과 파생 상태를 돌려준다', async () => {
    insertSchedule()
    const result = await getAmbientDropSchedule(sb(), SCHEDULE_ID, NOW)
    expect(result).toMatchObject({ ok: true, state: 'scheduled' })
  })

  it('예정 시각 + 3시간이 지났는데 아직 scheduled면 missed로 읽는다', async () => {
    insertSchedule()
    const late = new Date(new Date(AT_ISO).getTime() + AMBIENT_SCHEDULE_LATE_WINDOW_MS + 1)
    expect(await getAmbientDropSchedule(sb(), SCHEDULE_ID, late)).toMatchObject({ ok: true, state: 'missed' })
  })

  it('running이 30분 넘게 남으면 stalled로 읽는다', async () => {
    insertSchedule({ status: 'running', claimed_at: AT_ISO })
    const later = new Date(new Date(AT_ISO).getTime() + AMBIENT_SCHEDULE_STALLED_AFTER_MS + 1)
    expect(await getAmbientDropSchedule(sb(), SCHEDULE_ID, later)).toMatchObject({ ok: true, state: 'stalled' })
  })

  it('없는 id는 404이고 조회 실패는 500이다', async () => {
    expect(await getAmbientDropSchedule(sb(), uuid(999), NOW)).toMatchObject({ ok: false, status: 404 })
    expect(await getAmbientDropSchedule(sb(), 'x', NOW)).toMatchObject({ ok: false, status: 404 })
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    db.failReads.add('ambient_drop_schedules')
    expect(await getAmbientDropSchedule(sb(), SCHEDULE_ID, NOW)).toMatchObject({ ok: false, status: 500 })
    errorLog.mockRestore()
  })
})

describe('markMissedAmbientDropSchedules — 3시간 놓침 경계', () => {
  const at = (offsetMs: number) => new Date(NOW.getTime() - AMBIENT_SCHEDULE_LATE_WINDOW_MS + offsetMs).toISOString()

  it('예정 시각 + 3시간을 넘긴 scheduled만 missed로 표시한다 (정확히 3시간은 아직)', async () => {
    insertSchedule({ id: uuid(901), scheduled_at: at(0) }) // 정확히 3시간 — 아직 실행 대상
    insertSchedule({ id: uuid(902), scheduled_at: at(-1) }) // 1ms 넘김 — 놓침
    insertSchedule({ id: uuid(903), scheduled_at: at(60_000) }) // 3시간이 안 됨
    insertSchedule({ id: uuid(904), scheduled_at: at(-10 * 3_600_000), status: 'running' }) // scheduled가 아니면 건드리지 않는다
    insertSchedule({ id: uuid(905), scheduled_at: at(-10 * 3_600_000), status: 'done' })

    expect(await markMissedAmbientDropSchedules(sb(), NOW)).toBe(1)
    expect(scheduleRow(uuid(901)).status).toBe('scheduled')
    expect(scheduleRow(uuid(902))).toMatchObject({ status: 'missed', finished_at: NOW.toISOString(), result: { reason: 'missed' } })
    expect(scheduleRow(uuid(903)).status).toBe('scheduled')
    expect(scheduleRow(uuid(904)).status).toBe('running')
    expect(scheduleRow(uuid(905)).status).toBe('done')
  })

  it('표시만 하고 드랍을 놓지 않는다', async () => {
    insertSchedule({ scheduled_at: at(-1) })
    await markMissedAmbientDropSchedules(sb(), NOW)
    expect(db.rpcCalls).toHaveLength(0)
  })

  it('갱신 오류는 던진다 (호출부가 격리한다)', async () => {
    db.failWrites.add('ambient_drop_schedules')
    await expect(markMissedAmbientDropSchedules(sb(), NOW)).rejects.toThrow('놓친 예약 표시 실패')
  })
})

describe('claimDueAmbientDropSchedules — 한 번만 선점', () => {
  const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString()

  it('도래한 예약을 예정 시각 순으로 limit건까지 running으로 가져온다', async () => {
    insertSchedule({ id: uuid(911), scheduled_at: ago(1) })
    insertSchedule({ id: uuid(912), scheduled_at: ago(2) })
    insertSchedule({ id: uuid(913), scheduled_at: ago(0.5) })
    const claimed = await claimDueAmbientDropSchedules(sb(), NOW, 2)
    expect(claimed.map((r) => r.id)).toEqual([uuid(912), uuid(911)])
    expect(scheduleRow(uuid(912))).toMatchObject({ status: 'running', claimed_at: NOW.toISOString() })
    expect(scheduleRow(uuid(913)).status).toBe('scheduled')
  })

  it('예정 시각 전의 예약과 3시간을 넘긴 예약은 가져가지 않는다', async () => {
    insertSchedule({ id: uuid(921), scheduled_at: new Date(NOW.getTime() + 1).toISOString() })
    insertSchedule({ id: uuid(922), scheduled_at: new Date(NOW.getTime() - AMBIENT_SCHEDULE_LATE_WINDOW_MS - 1).toISOString() })
    expect(await claimDueAmbientDropSchedules(sb(), NOW, 5)).toEqual([])
    insertSchedule({ id: uuid(923), scheduled_at: NOW.toISOString() }) // 정확히 지금은 도래
    expect((await claimDueAmbientDropSchedules(sb(), NOW, 5)).map((r) => r.id)).toEqual([uuid(923)])
  })

  it('이미 running·done·canceled인 예약은 가져가지 않는다', async () => {
    for (const [i, status] of ['running', 'done', 'skipped', 'failed', 'missed', 'canceled'].entries()) {
      insertSchedule({ id: uuid(930 + i), status, scheduled_at: ago(1) })
    }
    expect(await claimDueAmbientDropSchedules(sb(), NOW, 10)).toEqual([])
  })

  it('동시 호출 5건 중 같은 예약을 가져가는 것은 정확히 1건이다', async () => {
    insertSchedule({ scheduled_at: ago(1) })
    const results = await Promise.all(Array.from({ length: 5 }, () => claimDueAmbientDropSchedules(sb(), NOW, 1)))
    expect(results.flat()).toHaveLength(1)
    // 다섯 건 모두 후보를 읽고 선점을 시도했지만 조건부 UPDATE를 이긴 것은 하나뿐이다
    expect(db.writesTo('ambient_drop_schedules').filter((c) => (c.payload as Row).status === 'running')).toHaveLength(5)
  })

  it('한 번 가져간 예약은 다시 가져갈 수 없다', async () => {
    insertSchedule({ scheduled_at: ago(1) })
    expect(await claimDueAmbientDropSchedules(sb(), NOW, 1)).toHaveLength(1)
    expect(await claimDueAmbientDropSchedules(sb(), NOW, 1)).toEqual([])
  })

  it('후보 조회가 실패하면 던진다', async () => {
    db.failReads.add('ambient_drop_schedules')
    await expect(claimDueAmbientDropSchedules(sb(), NOW, 1)).rejects.toThrow('도래한 예약 조회 실패')
  })
})

describe('finishAmbientDropSchedule — 결과 기록', () => {
  it('running 예약의 최종 상태와 결과를 남긴다', async () => {
    insertSchedule({ status: 'running', claimed_at: NOW.toISOString() })
    const result = { requested: 2, spawned: 2, failed: 0 }
    expect(await finishAmbientDropSchedule(sb(), SCHEDULE_ID, 'done', result, NOW)).toBe(true)
    expect(scheduleRow()).toMatchObject({ status: 'done', result, finished_at: NOW.toISOString() })
  })

  it('running이 아닌 예약은 바꾸지 않는다 (취소된 예약을 done으로 덮지 않는다)', async () => {
    insertSchedule({ status: 'canceled' })
    expect(await finishAmbientDropSchedule(sb(), SCHEDULE_ID, 'done', {}, NOW)).toBe(false)
    expect(scheduleRow().status).toBe('canceled')
  })
})

describe('등록·수정·취소·선점·기록 전 과정에서 ambient_drop_config를 쓰지 않는다', () => {
  it('전체 흐름을 돌려도 설정 테이블을 건드리지 않는다 (afterEach가 읽기·쓰기 0회와 행 그대로를 단언)', async () => {
    const created = await createAmbientDropSchedule(sb(), LIST_ITEMS, 'admin@example.com', NOW)
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const id = created.schedule.id
    expect((await rescheduleAmbientDrop(sb(), id, '2026-10-06T09:00:00+09:00', NOW)).ok).toBe(true)
    expect((await getAmbientDropSchedule(sb(), id, NOW)).ok).toBe(true)
    const later = new Date('2026-10-06T00:30:00.000Z')
    const claimed = await claimDueAmbientDropSchedules(sb(), later, 1)
    expect(claimed.map((r) => r.id)).toEqual([id])
    expect(await finishAmbientDropSchedule(sb(), id, 'done', {}, later)).toBe(true)
    expect(await cancelScheduledAmbientDrop(sb(), id, later)).toMatchObject({ ok: false, status: 409 })
    expect(db.calls.some((c) => c.table === 'ambient_drop_config')).toBe(false)
  })
})
