/**
 * 앰비언트 드랍 날짜 예약 어드민 API — 시각 수정(PATCH)·취소(DELETE) (티켓 20261001_2052)
 *
 *  - 비관리자는 403이고 DB를 한 번도 읽지 않는다
 *  - 공개 전(`scheduled`) 예약만 바뀐다. 실행 중·실행 뒤·놓침·취소된 예약은 PATCH·DELETE 모두 409다
 *  - DB는 아직 `scheduled`인데 예정 시각 + 3시간이 지나 놓침으로 읽히는 예약은 시각 수정만 409다(티켓 20261001_2132).
 *    취소는 열려 있다
 *  - 취소해도 행은 지우지 않고 `canceled`로 남는다
 *
 * 서버 함수(`scheduleStore`)는 실제 코드를 거치고 DB만 가짜(`schedule-test-db.ts`)다.
 * 실행: cd jam-web && npx vitest run "src/app/api/admin/ambient-drop/schedules/[id]/__tests__/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createFakeDb, uuid, type FakeDb, type Row } from '@/lib/ambient-drop/__tests__/schedule-test-db'
import { BOOK_ENDING, BOOK_LIVE, B_LIVE, P1, world } from '@/lib/ambient-drop/__tests__/schedule-fixtures'
import { SCHEDULE_FORBIDDEN, SCHEDULE_UNEXPECTED } from '@/lib/ambient-drop/scheduleRoute'
import { DELETE, PATCH } from '../route'

const state = vi.hoisted(() => ({
  /** null이면 관리자가 아니다 */
  admin: { id: 'admin-1', email: 'admin@example.com' } as { id: string; email: string } | null,
}))

let db: FakeDb

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => db.client }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  getAdminUser: async () => state.admin,
}))
vi.mock('@/lib/notifications/batch/shared', async () => (await import('@/lib/ambient-drop/__tests__/schedule-test-db')).sharedMock)

/** 2026-10-01 12:00 KST */
const NOW = new Date('2026-10-01T03:00:00.000Z')
/** 예정 시각 2026-10-05 09:00 KST */
const AT_ISO = '2026-10-05T00:00:00.000Z'
/** 새 예정 시각 2026-10-06 10:00 KST */
const NEW_AT = '2026-10-06T10:00:00+09:00'
const NEW_AT_ISO = '2026-10-06T01:00:00.000Z'
/** 예정 시각 + 3시간이 NOW보다 앞이라 놓침으로 읽히는 시각 */
const LONG_PAST_ISO = '2026-09-30T23:00:00.000Z'

const ID = uuid(900)

function addSchedule(overrides: Row = {}): Row {
  const row: Row = {
    id: ID,
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

const scheduleRow = (id = ID) => db.tables.ambient_drop_schedules.find((r) => r.id === id)

function patch(body: unknown, id = ID): Promise<Response> {
  return PATCH(
    new NextRequest(`https://j-a-m.app/api/admin/ambient-drop/schedules/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  )
}

function del(id = ID): Promise<Response> {
  return DELETE(new NextRequest(`https://j-a-m.app/api/admin/ambient-drop/schedules/${id}`, { method: 'DELETE' }), {
    params: Promise.resolve({ id }),
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  db = createFakeDb(world())
  state.admin = { id: 'admin-1', email: 'admin@example.com' }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  // 어느 경우에도 정기 배포 설정을 읽지도 쓰지도 않고, 드랍을 놓지 않고, 예약 행을 지우지 않는다
  expect(db.calls.filter((c) => c.table === 'ambient_drop_config')).toEqual([])
  expect(db.tables.ambient_drop_config).toEqual(world().ambient_drop_config)
  expect(db.rpcCalls).toEqual([])
  expect(db.writesTo('poi_drops')).toEqual([])
  expect(db.calls.filter((c) => c.op === 'delete')).toEqual([])
})

describe('비관리자는 403이고 DB를 읽지 않는다', () => {
  beforeEach(() => {
    state.admin = null
    addSchedule()
    db.calls.length = 0
  })

  it.each([
    ['PATCH', () => patch({ scheduled_at: NEW_AT })],
    ['DELETE', () => del()],
  ])('%s', async (_name, call) => {
    const res = await call()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: SCHEDULE_FORBIDDEN })
    expect(db.calls).toEqual([])
    expect(scheduleRow()).toMatchObject({ status: 'scheduled', scheduled_at: AT_ISO })
  })
})

describe('DELETE — 공개 전 취소', () => {
  it('200이고 행은 canceled로 남는다', async () => {
    addSchedule()
    const res = await del()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(scheduleRow()).toMatchObject({ status: 'canceled', canceled_at: NOW.toISOString() })
    expect(db.tables.ambient_drop_schedules).toHaveLength(1)
  })

  it('DB는 scheduled인데 놓침으로 읽히는 예약도 취소할 수 있다', async () => {
    addSchedule({ scheduled_at: LONG_PAST_ISO })
    const res = await del()
    expect(res.status).toBe(200)
    expect(scheduleRow()?.status).toBe('canceled')
  })

  it.each([
    ['uuid가 아닌 id', 'not-a-uuid'],
    ['없는 uuid', uuid(999)],
  ])('%s → 404', async (_name, id) => {
    addSchedule()
    const res = await del(id)
    expect(res.status).toBe(404)
    expect((await res.json()).error).toContain('예약을 찾을 수 없어요')
    expect(scheduleRow()?.status).toBe('scheduled')
  })

  it('저장이 실패하면 500이고 DB 원문은 응답에 없다', async () => {
    addSchedule()
    db.failWrites.add('ambient_drop_schedules')
    const res = await del()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('예약을 취소하지 못했어요. 잠시 후 다시 시도해 주세요.')
    expect(JSON.stringify(body)).not.toContain('쓰기 실패(테스트)')
    expect(scheduleRow()?.status).toBe('scheduled')
  })

  it('예외가 나면 500 고정 문장이다', async () => {
    addSchedule()
    const res = await DELETE(new NextRequest('https://j-a-m.app/api/admin/ambient-drop/schedules/x', { method: 'DELETE' }), {
      params: Promise.reject(new Error('params 읽기 실패 secret-detail')),
    })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: SCHEDULE_UNEXPECTED })
  })
})

describe('PATCH — 공개 전 시각 수정', () => {
  it('200이고 예정 시각만 바뀐다', async () => {
    addSchedule({ title: '가을 아침' })
    const res = await patch({ scheduled_at: NEW_AT })
    expect(res.status).toBe(200)
    const { schedule } = await res.json()
    expect(schedule).toMatchObject({
      id: ID,
      title: '가을 아침',
      scheduledAt: NEW_AT_ISO,
      status: 'scheduled',
      state: 'scheduled',
      poiIds: [P1],
      badgeIds: [B_LIVE],
    })
    expect(scheduleRow()).toMatchObject({ scheduled_at: NEW_AT_ISO, status: 'scheduled', poi_ids: [P1], badge_ids: [B_LIVE] })
  })

  it.each([
    ['정시가 아닌 시각', { scheduled_at: '2026-10-06T10:30:00+09:00' }, '정시가 아니에요'],
    ['지난 시각', { scheduled_at: '2026-10-01T09:00:00+09:00' }, '이미 지났어요'],
    ['시각이 없는 본문', {}, '형식이 올바르지 않아요'],
    ['깨진 JSON', '{broken', '형식이 올바르지 않아요'],
    ['시각이 글자가 아님', { scheduled_at: 12345 }, '형식이 올바르지 않아요'],
  ])('%s → 400이고 예약은 그대로다', async (_name, body, message) => {
    addSchedule()
    const res = await patch(body)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain(message)
    expect(scheduleRow()?.scheduled_at).toBe(AT_ISO)
    expect(db.writesTo('ambient_drop_schedules')).toEqual([])
  })

  it('새 시각에 기간이 끝나 있는 컬렉션이 있으면 400이고 예약은 그대로다', async () => {
    // BOOK_ENDING은 10-04에 기간이 끝난다 — 10-06으로 옮기면 그 시각에는 노출 중이 아니다
    addSchedule({ item_mode: 'collections', badge_ids: [], collection_ids: [BOOK_ENDING] })
    const res = await patch({ scheduled_at: NEW_AT })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('노출 중이 아닌 컬렉션 1건')
    expect(scheduleRow()?.scheduled_at).toBe(AT_ISO)
  })

  it('옮기는 시각에도 노출 중인 컬렉션이면 200이다', async () => {
    addSchedule({ item_mode: 'collections', badge_ids: [], collection_ids: [BOOK_LIVE] })
    const res = await patch({ scheduled_at: NEW_AT })
    expect(res.status).toBe(200)
    expect(scheduleRow()?.scheduled_at).toBe(NEW_AT_ISO)
  })

  it.each([
    ['uuid가 아닌 id', 'not-a-uuid'],
    ['없는 uuid', uuid(999)],
  ])('%s → 404', async (_name, id) => {
    addSchedule()
    const res = await patch({ scheduled_at: NEW_AT }, id)
    expect(res.status).toBe(404)
    expect((await res.json()).error).toContain('예약을 찾을 수 없어요')
    expect(scheduleRow()?.scheduled_at).toBe(AT_ISO)
  })

  it('예약을 읽지 못하면 500이다', async () => {
    addSchedule()
    db.failReads.add('ambient_drop_schedules')
    const res = await patch({ scheduled_at: NEW_AT })
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('조회 실패(테스트)')
  })

  it('저장이 실패하면 500이고 예약은 그대로다', async () => {
    addSchedule()
    db.failWrites.add('ambient_drop_schedules')
    const res = await patch({ scheduled_at: NEW_AT })
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('예약을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.')
    expect(scheduleRow()?.scheduled_at).toBe(AT_ISO)
  })

  it('예외가 나면 500 고정 문장이다', async () => {
    const res = await PATCH(new NextRequest('https://j-a-m.app/api/admin/ambient-drop/schedules/x', { method: 'PATCH', body: '{}' }), {
      params: Promise.reject(new Error('params 읽기 실패 secret-detail')),
    })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: SCHEDULE_UNEXPECTED })
  })
})

describe('이미 시작됐거나 끝난 예약은 PATCH·DELETE 모두 409다', () => {
  const claimed = new Date(NOW.getTime() - 5 * 60_000).toISOString()

  it.each([
    ['running', { status: 'running', claimed_at: claimed }, '놓는 중인 예약이라'],
    ['done', { status: 'done', finished_at: AT_ISO, result: { requested: 1, spawned: 1 } }, '이미 처리된 예약이라'],
    ['skipped', { status: 'skipped', finished_at: AT_ISO, result: { reason: 'no_eligible_poi' } }, '이미 처리된 예약이라'],
    ['failed', { status: 'failed', finished_at: AT_ISO, result: { error: 'x' } }, '이미 처리된 예약이라'],
    ['missed', { status: 'missed', finished_at: AT_ISO, result: { reason: 'missed' } }, '놓친 예약이라'],
    ['canceled', { status: 'canceled', canceled_at: AT_ISO }, '이미 취소된 예약이에요'],
  ])('%s', async (_name, overrides, message) => {
    addSchedule(overrides)
    const before = { ...scheduleRow() }

    const patched = await patch({ scheduled_at: NEW_AT })
    expect(patched.status).toBe(409)
    expect((await patched.json()).error).toContain(message)

    const deleted = await del()
    expect(deleted.status).toBe(409)
    expect((await deleted.json()).error).toContain(message)

    // 어느 쪽도 행을 바꾸지 않는다
    expect(scheduleRow()).toEqual(before)
  })

  it('DB는 scheduled인데 예정 시각 + 3시간이 지나 놓침으로 읽히는 예약은 PATCH만 409다', async () => {
    addSchedule({ scheduled_at: LONG_PAST_ISO })
    const res = await patch({ scheduled_at: NEW_AT })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('3시간이 지나 놓친 예약이라 수정할 수 없어요')
    expect(scheduleRow()).toMatchObject({ status: 'scheduled', scheduled_at: LONG_PAST_ISO })
    expect(db.writesTo('ambient_drop_schedules')).toEqual([])
  })
})
