/**
 * 앰비언트 드랍 날짜 예약 어드민 API — 목록(GET)·등록(POST)·미리 확인(preview POST) (티켓 20261001_2052)
 *
 *  - 비관리자는 403이고 DB를 한 번도 읽지 않는다
 *  - 목록은 최근순으로 나오고 실행 실패의 DB 오류 원문이 응답에 없다
 *  - 등록은 두 지점 모드 × 두 아이템 모드 모두 201이고 `created_by`에는 관리자 이메일이 들어간다
 *  - 미리 확인은 DB에 쓰지 않는다
 *
 * 서버 함수(`scheduleStore`·`scheduleList`·`schedulePreview`)는 실제 코드를 거치고 DB만 가짜(`schedule-test-db.ts`)다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/ambient-drop/schedules/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createFakeDb, uuid, type FakeDb, type Row } from '@/lib/ambient-drop/__tests__/schedule-test-db'
import { BOOK_LIVE, B_LIVE, P1, P2, P_INACTIVE, world } from '@/lib/ambient-drop/__tests__/schedule-fixtures'
import { SCHEDULE_FORBIDDEN, SCHEDULE_UNEXPECTED } from '@/lib/ambient-drop/scheduleRoute'
import { GET, POST } from '../route'
import { POST as PREVIEW } from '../preview/route'

const state = vi.hoisted(() => ({
  /** null이면 관리자가 아니다 */
  admin: { id: 'admin-1', email: 'admin@example.com' } as { id: string; email: string } | null,
  /** 켜면 인증 단계에서 예외가 난다 */
  authThrows: false,
}))

let db: FakeDb

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => db.client }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  getAdminUser: async () => {
    if (state.authThrows) throw new Error('인증 서버 연결 실패 secret-detail')
    return state.admin
  },
}))
vi.mock('@/lib/notifications/batch/shared', async () => (await import('@/lib/ambient-drop/__tests__/schedule-test-db')).sharedMock)

/** 2026-10-01 12:00 KST */
const NOW = new Date('2026-10-01T03:00:00.000Z')
/** 2026-10-05 09:00 KST */
const AT = '2026-10-05T09:00:00+09:00'
const AT_ISO = '2026-10-05T00:00:00.000Z'
const URL = 'https://j-a-m.app/api/admin/ambient-drop/schedules'

const LIST_ITEMS = { scheduled_at: AT, poi_ids: [P1, P2], per_poi_count: 2, badge_ids: [B_LIVE] }
const LIST_COLLECTIONS = { scheduled_at: AT, poi_ids: [P1], per_poi_count: 1, collection_ids: [BOOK_LIVE] }
const CATEGORY_ITEMS = { scheduled_at: AT, poi_category: 'cafe', total_count: 5, badge_ids: [B_LIVE] }
const CATEGORY_COLLECTIONS = { scheduled_at: AT, total_count: 5, collection_ids: [BOOK_LIVE] }

function post(body: unknown, path = ''): NextRequest {
  return new NextRequest(`${URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  db = createFakeDb(world())
  state.admin = { id: 'admin-1', email: 'admin@example.com' }
  state.authThrows = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  // 어느 라우트에서든 정기 배포 설정을 읽지도 쓰지도 않고, 드랍을 놓지 않는다
  expect(db.calls.filter((c) => c.table === 'ambient_drop_config')).toEqual([])
  expect(db.tables.ambient_drop_config).toEqual(world().ambient_drop_config)
  expect(db.rpcCalls).toEqual([])
  expect(db.writesTo('poi_drops')).toEqual([])
})

function addSchedule(overrides: Row = {}): Row {
  const row: Row = {
    id: uuid(900 + db.tables.ambient_drop_schedules.length),
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

describe('비관리자는 403이고 DB를 읽지 않는다', () => {
  beforeEach(() => {
    state.admin = null
  })

  it.each([
    ['GET 목록', () => GET()],
    ['POST 등록', () => POST(post(LIST_ITEMS))],
    ['POST 미리 확인', () => PREVIEW(post(LIST_ITEMS, '/preview'))],
  ])('%s', async (_name, call) => {
    const res = await call()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: SCHEDULE_FORBIDDEN })
    expect(db.calls).toEqual([])
  })
})

describe('GET — 목록', () => {
  it('최근순 목록과 이름 맵을 200으로 준다', async () => {
    for (const p of db.tables.poi) p.name = `지점-${String(p.id).slice(-2)}`
    for (const b of db.tables.badges) b.name = `아이템-${String(b.id).slice(-2)}`
    addSchedule({ title: '이른', scheduled_at: '2026-10-03T00:00:00.000Z' })
    addSchedule({ title: '늦은', scheduled_at: '2026-10-09T00:00:00.000Z' })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.schedules.map((s: { title: string }) => s.title)).toEqual(['늦은', '이른'])
    expect(body.schedules[0]).toMatchObject({ status: 'scheduled', state: 'scheduled', poiMode: 'list', outcome: null })
    expect(body.names).toEqual({ pois: { [P1]: '지점-01' }, badges: { [B_LIVE]: '아이템-11' }, collections: {} })
    // 읽기만 한다
    expect(db.calls.every((c) => c.op === 'select')).toBe(true)
  })

  it('실행에 실패한 예약의 DB 오류 원문은 응답 어디에도 없다', async () => {
    const raw = '대상 조회 실패: poi(예약 지점)[0~0] 조회 실패: permission denied for table poi'
    addSchedule({
      status: 'failed',
      finished_at: AT_ISO,
      result: { requested: 1, spawned: 0, failed: 0, reason: null, error: raw, overlappedPoiCount: 0, excluded: { pois: [], badges: [], collections: [] }, dropIds: [] },
    })
    const res = await GET()
    expect(res.status).toBe(200)
    const text = JSON.stringify(await res.json())
    expect(text).not.toContain('permission denied')
    expect(text).not.toContain('대상 조회 실패')
    expect(text).toContain('"failureKind":"target_lookup"')
  })

  it('목록을 읽지 못하면 500과 해요체 문장이고 DB 원문은 없다', async () => {
    db.failReads.add('ambient_drop_schedules')
    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('예약 목록을 불러오지 못했어요. 서버에서 목록을 읽는 중 오류가 났어요. 잠시 후 새로고침해 주세요.')
    expect(JSON.stringify(body)).not.toContain('조회 실패(테스트)')
  })

  it('인증 단계에서 예외가 나면 500 고정 문장이고 예외 원문은 없다', async () => {
    state.authThrows = true
    const res = await GET()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: SCHEDULE_UNEXPECTED })
  })
})

describe('POST — 등록', () => {
  it.each([
    ['지점 직접 × 아이템 직접', LIST_ITEMS, { poiMode: 'list', itemMode: 'items', perPoiCount: 2, totalCount: null }],
    ['지점 직접 × 컬렉션', LIST_COLLECTIONS, { poiMode: 'list', itemMode: 'collections', perPoiCount: 1, totalCount: null }],
    ['종류+개수 × 아이템 직접', CATEGORY_ITEMS, { poiMode: 'category', itemMode: 'items', perPoiCount: null, totalCount: 5 }],
    ['종류+개수 × 컬렉션', CATEGORY_COLLECTIONS, { poiMode: 'category', itemMode: 'collections', perPoiCount: null, totalCount: 5 }],
  ])('%s → 201', async (_name, body, expected) => {
    const res = await POST(post({ ...body, title: '가을 아침' }))
    expect(res.status).toBe(201)
    const { schedule } = await res.json()
    expect(schedule).toMatchObject({
      ...expected,
      title: '가을 아침',
      scheduledAt: AT_ISO,
      status: 'scheduled',
      state: 'scheduled',
      createdBy: 'admin@example.com',
      outcome: null,
    })
    // 행에는 관리자 id가 아니라 이메일이 남는다
    expect(db.tables.ambient_drop_schedules).toHaveLength(1)
    expect(db.tables.ambient_drop_schedules[0]).toMatchObject({ id: schedule.id, created_by: 'admin@example.com', status: 'scheduled' })
    expect(JSON.stringify(db.tables.ambient_drop_schedules[0])).not.toContain('admin-1')
  })

  it('등록은 예약 행 하나를 더할 뿐이다 — 드랍을 놓지 않는다', async () => {
    await POST(post(LIST_ITEMS))
    expect(db.writesTo('ambient_drop_schedules')).toHaveLength(1)
    expect(db.writesTo('poi')).toEqual([])
  })

  it.each([
    ['깨진 JSON', '{broken', '예약 내용을 읽지 못했어요'],
    ['지점 수 × 개수가 101개', { ...CATEGORY_ITEMS, total_count: 101 }, '100개까지예요'],
    ['지난 시각', { ...LIST_ITEMS, scheduled_at: '2026-10-01T09:00:00+09:00' }, '이미 지났어요'],
    ['정시가 아닌 시각', { ...LIST_ITEMS, scheduled_at: '2026-10-05T09:30:00+09:00' }, '정시가 아니에요'],
    ['지점 모드 섞임', { ...LIST_ITEMS, total_count: 3 }, '섞여 있어요'],
    ['아이템 모드 섞임', { ...LIST_ITEMS, collection_ids: [BOOK_LIVE] }, '섞여 있어요'],
    ['비활성 지점', { ...LIST_ITEMS, poi_ids: [P_INACTIVE] }, '운영이 끝난 지점 1건'],
  ])('%s → 400이고 아무것도 쓰지 않는다', async (_name, body, message) => {
    const res = await POST(post(body))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain(message)
    expect(db.writesTo('ambient_drop_schedules')).toEqual([])
  })

  it('저장이 실패하면 500이고 DB 원문은 응답에 없다', async () => {
    db.failWrites.add('ambient_drop_schedules')
    const res = await POST(post(LIST_ITEMS))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('예약을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.')
    expect(JSON.stringify(body)).not.toContain('쓰기 실패(테스트)')
  })

  it('대상 읽기가 실패해도 500이고 예약 행은 없다', async () => {
    db.failReads.add('poi')
    const res = await POST(post(LIST_ITEMS))
    expect(res.status).toBe(500)
    expect(db.writesTo('ambient_drop_schedules')).toEqual([])
  })
})

describe('POST preview — 미리 확인', () => {
  it('200으로 요약을 주고 DB에 쓰지 않는다', async () => {
    const res = await PREVIEW(post(LIST_ITEMS, '/preview'))
    expect(res.status).toBe(200)
    const { preview } = await res.json()
    expect(preview).toEqual({
      scheduledAt: AT_ISO,
      requested: 4,
      poiMode: 'list',
      eligiblePoiCount: 2,
      overlappedPoiCount: 1,
      overlapNotice: '이미 드랍이 있는 지점이 1곳이에요. 이 지점에는 있던 드랍 위에 겹쳐서 놓여요.',
      candidateBadgeCount: 1,
      problem: null,
    })
    expect(db.calls.every((c) => c.op === 'select')).toBe(true)
    expect(db.tables.ambient_drop_schedules).toEqual([])
  })

  it('예정 시각에 놓을 수 없는 대상은 200의 problem이다', async () => {
    const res = await PREVIEW(post({ ...LIST_ITEMS, poi_ids: [P_INACTIVE] }, '/preview'))
    expect(res.status).toBe(200)
    expect((await res.json()).preview.problem).toContain('운영이 끝난 지점 1건')
  })

  it.each([
    ['깨진 JSON', '{broken'],
    ['시각 없음', { poi_ids: [P1], per_poi_count: 1, badge_ids: [B_LIVE] }],
    ['없는 지점 종류', { ...CATEGORY_ITEMS, poi_category: 'nowhere' }],
  ])('%s → 400', async (_name, body) => {
    const res = await PREVIEW(post(body, '/preview'))
    expect(res.status).toBe(400)
    expect(typeof (await res.json()).error).toBe('string')
  })

  it('대상 읽기가 실패하면 500이다', async () => {
    db.failReads.add('poi')
    const res = await PREVIEW(post(LIST_ITEMS, '/preview'))
    expect(res.status).toBe(500)
    expect(db.calls.every((c) => c.op === 'select')).toBe(true)
  })
})
