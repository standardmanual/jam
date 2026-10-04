/**
 * 드랍 예약 핸들러 (티켓 20261002_2306, 상위 20260930_1500 ⑧-b). 가정 1~5는 티켓 「착수 전에 정한 것」 번호다. 틀은 `recipe.test.ts`다.
 *
 * 드랍 저장소의 가짜 DB(`ambient-drop/__tests__/schedule-test-db.ts`)와 기본 세상(`schedule-fixtures.ts`)에 실제 서버 함수를 그대로 돌린다(mock 없음).
 * 예정 시각 기준 대상 판정도 실제 `loadScheduleTargets`다. 운영툴 실행 전체와 만나는 통합은 `run.test.ts`·`cancel.test.ts`·`reconcile.test.ts`가 본다.
 *
 * - prepare: 페이로드(정한 ID·예정 시각·`created_by`·연결 `collection_ids`)·형식 오류 문장과 「외 N건」, 현재 시각으로 정시이고 미래인 공개 시각을 본다(가정 3·4)
 * - check: 지점 종류 확인과 예정 시각 기준 대상 판정의 쉬운 문장을 사유로 쓰고, 읽지 못하면 고정 문장이다. DB 오류 원문·ID는 `reason`에 없다.
 *   연결로 채운 컬렉션(같은 묶음이 만들 컬렉션·이전 실행이 만든 컬렉션)은 판정을 건너뛴다(티켓 20261004_2242 ⑩-b, 가정 1~3)
 * - create: 정한 ID로 `scheduled` 행을 만들고 놓지 않는다. 서버 오류(500)면 같은 ID로 정리 delete(`status = 'scheduled'` 조건)를 한 번 시도한다. 검증 오류(400)는 정리하지 않는다
 * - undo: `status = 'scheduled'` 조건으로 지운다. 시작·끝난 예약은 지우지 않고 실패, 이미 없거나 밖에서 취소된 예약은 성공이다
 * - cancel: 공개 전에만 서버 함수로 「취소」 상태를 남긴다(지우지 않는다). 예정 시각이 지났거나 실행이 시작됐으면 published, 경합·오류 비노출
 * - observe: 파생 상태로 나눈다(놓음 → 종료, 놓지 못함 → 실패, 취소 → 없음, 그 밖 → 공개 전), 쓰기 없음
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { asRegisterChecksClient, RESOURCE_KEY_BY_KIND, type ExecuteLinkedIds, type ExecuteServiceClient } from '../handlers'
import { DROP_SCHEDULE_HANDLER as handler } from '../dropSchedule'
import { createFakeDb, uuid, type FakeDb, type Row } from '@/lib/ambient-drop/__tests__/schedule-test-db'
import { BOOK_ENDING, BOOK_LATE, BOOK_LIVE, BOOK_PRELAUNCH, B_LIVE, P1, P2, P_INACTIVE, P_MISSING, world } from '@/lib/ambient-drop/__tests__/schedule-fixtures'
import { LATER, NOW, makeItem } from './fixtures'

const SCHEDULE_ID = uuid(900)
const OTHER_SCHEDULE_ID = uuid(901)
/** `LATER`(10/10 09:00 KST)를 등록 형식으로 바꾼 예정 시각. */
const STARTS_AT = new Date(LATER).toISOString()
const HOUR = 60 * 60_000
const before = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const after = (ms: number) => new Date(NOW.getTime() + ms).toISOString()

type Raw = Record<string, unknown>

/** 검사를 통과하는 드랍 항목(지점 직접 × 컬렉션). 예정 시각은 행 칸(`LATER`)이다. `resource`·`original`·`copy`는 칸 단위로, 행의 시각은 `row`로 덮는다. */
function dropItem(resource: Raw = {}, original: Raw = {}, copy: Raw = {}, row: { startsAt?: string | null; endsAt?: string | null } = {}) {
  return makeItem({
    key: 'drop',
    kind: 'drop_schedule',
    original: { copy: { title: '가을 아침', ...copy }, ...original },
    resource: { poi_ids: [P1, P2], per_poi_count: 2, collection_ids: [BOOK_LIVE], ...resource },
    ...row,
  })
}

const service = (db: FakeDb) => db.client as ExecuteServiceClient

function prepared(item = dropItem(), linkedIds: ExecuteLinkedIds = {}, now: Date = NOW) {
  const outcome = handler.prepare(item, { id: SCHEDULE_ID, actorId: 'admin-1', linkedIds, now })
  if (!outcome.ok) throw new Error(`prepare 실패: ${outcome.failure.reason}`)
  return outcome.value
}

const checkOf = (db: FakeDb, item = dropItem(), linkedIds: ExecuteLinkedIds = {}) =>
  handler.check(asRegisterChecksClient(service(db)), prepared(item, linkedIds), { now: NOW })
const createOf = (db: FakeDb, item = dropItem(), linkedIds: ExecuteLinkedIds = {}) => handler.create(service(db), prepared(item, linkedIds), { now: NOW })

const schedules = (db: FakeDb) => db.tables.ambient_drop_schedules
const scheduleOf = (db: FakeDb, id = SCHEDULE_ID) => schedules(db).find((row) => row.id === id)
const scheduleWrites = (db: FakeDb) => db.writesTo('ambient_drop_schedules')

/** 예약 행 한 건을 넣는다. 기본은 공개 전(`scheduled`)이고 예정 시각은 `LATER`다. */
function seedSchedule(db: FakeDb, overrides: Row = {}): Row {
  const row: Row = {
    id: SCHEDULE_ID,
    title: '가을 아침',
    scheduled_at: STARTS_AT,
    status: 'scheduled',
    poi_mode: 'list',
    poi_ids: [P1, P2],
    poi_category: null,
    item_mode: 'collections',
    badge_ids: [],
    collection_ids: [BOOK_LIVE],
    per_poi_count: 2,
    total_count: null,
    created_by: 'admin-1',
    created_at: '2026-10-04T00:00:00.000Z',
    updated_at: '2026-10-04T00:00:00.000Z',
    claimed_at: null,
    finished_at: null,
    canceled_at: null,
    result: null,
    ...overrides,
  }
  schedules(db).push(row)
  return row
}

/** 응답·결정 기록·슬랙에 나가는 사유에 있으면 안 되는 것: 테스트 DB의 오류 원문, 표 이름, UUID. */
function expectClean(text: string | undefined) {
  expect(text).toBeDefined()
  expect(text).not.toContain('(테스트)')
  expect(text).not.toContain('ambient_drop_schedules')
  expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i)
}

let db: FakeDb

beforeEach(() => {
  db = createFakeDb(world())
  // 드랍 서버 함수가 DB 오류를 서버 로그로 남긴다. 테스트 출력을 어지럽히지 않게 막는다.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  // 어느 테스트에서든 정기 배포 설정을 읽지도 쓰지도 않고, 드랍을 실제로 놓지도 않는다.
  expect(db.calls.filter((call) => call.table === 'ambient_drop_config')).toEqual([])
  expect(db.rpcCalls).toEqual([])
  expect(db.writesTo('poi_drops')).toEqual([])
  vi.restoreAllMocks()
})

describe('핸들러 정의', () => {
  it('종류·자원 키·정한 ID 먼저 만들기가 계약대로다', () => {
    expect(handler.kind).toBe('drop_schedule')
    expect(handler.resourceKey).toBe(RESOURCE_KEY_BY_KIND.drop_schedule)
    expect(handler.resourceKey).toBe('ambient_drop_schedule_id')
    expect(handler.idFirst).toBe(true)
  })
})

describe('prepare', () => {
  it('정한 ID·예정 시각(scheduled_at)·실행한 관리자 ID(created_by)가 들어가고 종료 시각 칸은 없다', () => {
    const value = prepared()
    expect(value.id).toBe(SCHEDULE_ID)
    expect(value.payload).toEqual({
      scheduled_at: LATER,
      title: '가을 아침',
      poi_ids: [P1, P2],
      per_poi_count: 2,
      collection_ids: [BOOK_LIVE],
      created_by: 'admin-1',
    })
    expect('ends_at' in value.payload).toBe(false)
    expect(value.linkFields).toEqual([])
  })

  it('연결로 채운 collection_ids는 resource 몫 뒤에 더해지고 linkFields에 알린다. 받은 linkedIds는 그대로 남긴다', () => {
    const linkedIds = { collection_ids: [BOOK_PRELAUNCH] }
    const value = prepared(dropItem(), linkedIds)
    expect(value.payload.collection_ids).toEqual([BOOK_LIVE, BOOK_PRELAUNCH])
    expect(value.linkFields).toEqual(['collection_ids'])
    expect(value.linkedIds).toBe(linkedIds)
  })

  it('종류+개수 × 아이템 직접도 통과한다', () => {
    const value = prepared(dropItem({ poi_ids: undefined, per_poi_count: undefined, collection_ids: undefined, poi_category: 'cafe', total_count: 5, badge_ids: [B_LIVE] }))
    expect(value.payload).toMatchObject({ poi_category: 'cafe', total_count: 5, badge_ids: [B_LIVE] })
  })

  it('경고는 막지 않고 그대로 돌려준다', () => {
    const value = prepared(dropItem({ mood: 'calm' }))
    expect(value.warnings.map((issue) => issue.path)).toEqual(['resource.mood'])
  })

  it('변환 오류가 하나면 「드랍 예약 형식이 맞지 않아요: {오류 문장}」이다', () => {
    const outcome = handler.prepare(dropItem({}, {}, {}, { endsAt: after(24 * HOUR) }), { id: SCHEDULE_ID, actorId: 'admin-1', linkedIds: {}, now: NOW })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.reason).toBe('드랍 예약 형식이 맞지 않아요: drop_schedule.ends_at: 드랍 일정은 놓은 뒤 내리지 않아서 종료 시각이 없어요. 종료 시각을 빼 주세요.')
    expect(outcome.failure.detail).toContain('ends_at')
  })

  it('변환 오류가 둘 이상이면 첫 문장만 싣고 끝에 「 (외 N건)」을 붙인다', () => {
    const outcome = handler.prepare(dropItem({}, { starts_at: '' }, {}, { startsAt: null, endsAt: after(24 * HOUR) }), {
      id: SCHEDULE_ID,
      actorId: 'admin-1',
      linkedIds: {},
      now: NOW,
    })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.detail?.split(' / ')).toHaveLength(2)
    expect(outcome.failure.reason).toBe('드랍 예약 형식이 맞지 않아요: drop_schedule.scheduled_at: 필수 항목이 없어요(공개 시각 starts_at이 필요해요). (외 1건)')
    expect(outcome.failure.reason).not.toContain('종료')
  })

  describe('드랍 파서의 쉬운 문장(현재 시각 기준)', () => {
    const failureOf = (item: ReturnType<typeof dropItem>, now: Date = NOW) => {
      const outcome = handler.prepare(item, { id: SCHEDULE_ID, actorId: 'admin-1', linkedIds: {}, now })
      expect(outcome.ok).toBe(false)
      return outcome.ok ? { reason: '', detail: '' } : { reason: outcome.failure.reason, detail: outcome.failure.detail ?? '' }
    }

    it('정시가 아닌 공개 시각', () => {
      const { reason } = failureOf(dropItem({}, {}, {}, { startsAt: '2026-10-10T00:30:00.000Z' }))
      expect(reason).toContain('드랍 예약 형식이 맞지 않아요: 놓을 시각이 정시가 아니에요')
    })

    it('공개 시각이 현재 시각보다 이르거나 같으면 형식 오류다(핸들러가 받은 now로 견준다)', () => {
      expect(failureOf(dropItem({}, {}, {}, { startsAt: '2026-10-05T02:00:00.000Z' })).reason).toContain('놓을 시각이 이미 지났어요')
      // 정확히 지금(정시)이어도 지난 것이다.
      expect(failureOf(dropItem({}, {}, {}, { startsAt: NOW.toISOString() })).reason).toContain('놓을 시각이 이미 지났어요')
      // 같은 항목이라도 now가 뒤로 가면 오류가 된다.
      expect(failureOf(dropItem(), new Date('2026-10-10T01:00:00.000Z')).reason).toContain('놓을 시각이 이미 지났어요')
    })

    it('공개 시각이 시각 형식이 아니면 형식 오류다', () => {
      expect(failureOf(dropItem({}, { starts_at: '내일 아침' })).reason).toContain('놓을 시각 형식이 올바르지 않아요')
    })

    it('지점·아이템을 정하는 방식이 섞이거나 비어 있으면 형식 오류다', () => {
      expect(failureOf(dropItem({ total_count: 3 })).reason).toContain('지점을 정하는 방식이 섞여 있어요')
      expect(failureOf(dropItem({ badge_ids: [B_LIVE] })).reason).toContain('놓을 것을 정하는 방식이 섞여 있어요')
      expect(failureOf(dropItem({ collection_ids: undefined })).reason).toContain('놓을 것이 없어요')
      expect(failureOf(dropItem({ per_poi_count: undefined })).reason).toContain('지점당 개수가 없어요')
    })

    it('같은 묶음의 컬렉션이 연결로 채워도 아이템 직접 선택과 섞이면 형식 오류다', () => {
      const outcome = handler.prepare(dropItem({ collection_ids: undefined, badge_ids: [B_LIVE] }), {
        id: SCHEDULE_ID,
        actorId: 'admin-1',
        linkedIds: { collection_ids: [BOOK_LIVE] },
        now: NOW,
      })
      expect(outcome.ok).toBe(false)
      if (!outcome.ok) expect(outcome.failure.reason).toContain('놓을 것을 정하는 방식이 섞여 있어요')
    })

    it('개수 상한·제목 길이·잘못된 ID', () => {
      expect(failureOf(dropItem({ per_poi_count: 60 })).reason).toContain('한 예약에 놓을 수 있는 드랍은 100개까지예요')
      expect(failureOf(dropItem({}, {}, { title: '가'.repeat(101) })).reason).toContain('이름이 너무 길어요')
      expect(failureOf(dropItem({ poi_ids: ['not-a-uuid'] })).reason).toContain('지점 목록에 올바르지 않은 ID가 있어요')
    })

    it('형식 오류 사유에는 입력한 ID가 없다', () => {
      const { reason } = failureOf(dropItem({ poi_ids: [P1], total_count: 3 }))
      expect(reason).not.toContain(P1)
    })
  })

  it('다른 종류의 항목은 변환 오류로 막는다', () => {
    const outcome = handler.prepare(makeItem({ kind: 'mission' }), { id: SCHEDULE_ID, actorId: 'admin-1', linkedIds: {}, now: NOW })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.failure.reason).toMatch(/^드랍 예약 형식이 맞지 않아요: kind: drop_schedule 항목만/)
  })
})

describe('check — 지점 종류와 예정 시각 기준 대상 판정', () => {
  it('모두 있으면 통과하고 읽기만 한다', async () => {
    expect(await checkOf(db)).toBeNull()
    expect(db.calls.filter((call) => call.op !== 'select')).toEqual([])
    expect(schedules(db)).toEqual([])
  })

  it('종류+개수 × 컬렉션: 지점 종류가 있으면 통과한다. 종류를 비우면 전체 종류다', async () => {
    expect(await checkOf(db, dropItem({ poi_ids: undefined, per_poi_count: undefined, poi_category: 'cafe', total_count: 3 }))).toBeNull()
    expect(await checkOf(db, dropItem({ poi_ids: undefined, per_poi_count: undefined, total_count: 3 }))).toBeNull()
    expect(db.calls.some((call) => call.table === 'poi_categories')).toBe(true)
  })

  it('지점 종류가 없으면 고정 문장이고, 놓을 대상은 읽지 않는다', async () => {
    const failure = await checkOf(db, dropItem({ poi_ids: undefined, per_poi_count: undefined, poi_category: 'nowhere', total_count: 3 }))
    expect(failure?.reason).toBe('지점 종류를 찾을 수 없어요')
    expect(db.calls.filter((call) => call.table === 'item_books')).toEqual([])
  })

  it('지점 종류를 읽지 못하면 「드랍 대상을 확인하지 못했어요」이고 원문은 detail에만 있다', async () => {
    db.failReads.add('poi_categories')
    const failure = await checkOf(db, dropItem({ poi_ids: undefined, per_poi_count: undefined, poi_category: 'cafe', total_count: 3 }))
    expect(failure?.reason).toBe('드랍 대상을 확인하지 못했어요')
    expect(failure?.detail).toContain('(테스트)')
  })

  describe('예정 시각 기준 컬렉션 판정', () => {
    it('예정 시각에 기간이 끝난 컬렉션이 있으면 막는다. 쉬운 문장이 사유이고 컬렉션 ID는 없다', async () => {
      const failure = await checkOf(db, dropItem({ collection_ids: [BOOK_LIVE, BOOK_ENDING] }))
      expect(failure?.reason).toContain('예정 시각에 놓을 수 없는 대상이 있어요(노출 중이 아닌 컬렉션 1건)')
      expectClean(failure?.reason)
      expectClean(failure?.detail)
    })

    it('지금은 공개 전이지만 예정 시각에 공개되는 컬렉션은 통과한다(같은 시각이면 통과)', async () => {
      // BOOK_LATE는 10/10 09:00 KST에 열린다. 지금(10/5)은 닫혀 있다.
      expect(await checkOf(db, dropItem({ collection_ids: [BOOK_LATE] }))).toBeNull()
    })

    it('예정 시각보다 늦게 공개되는 컬렉션은 막는다', async () => {
      const failure = await checkOf(db, dropItem({ collection_ids: [BOOK_LATE] }, {}, {}, { startsAt: '2026-10-09T00:00:00.000Z' }))
      expect(failure?.reason).toContain('노출 중이 아닌 컬렉션 1건')
    })

    it('노출 중인 컬렉션이 하나도 없으면 「예정 시각에 노출 중인 컬렉션이 없어요」다', async () => {
      const failure = await checkOf(db, dropItem({ collection_ids: [BOOK_ENDING] }))
      expect(failure?.reason).toContain('예정 시각에 놓을 수 없는 대상이 있어요(노출 중이 아닌 컬렉션 1건)')
    })
  })

  describe('연결로 채운 컬렉션은 판정을 미룬다(티켓 20261004_2242 ⑩-b)', () => {
    /** 연결로만 채운 드랍(resource에 컬렉션이 없다). */
    const linkedOnly = () => dropItem({ collection_ids: undefined })
    /** 컬렉션 항목이 아직 만들지 않은 컬렉션 — DB에 행이 없다. */
    const futureBook = uuid(7777)
    /** 이전 실행이 만든 컬렉션 — 행은 있지만 아이템 배지가 없다. */
    const EMPTY_BOOK = uuid(7778)

    it('같은 묶음의 컬렉션 항목이 만들 컬렉션(아직 DB에 없는 ID)만 가리켜도 통과하고 읽기만 한다', async () => {
      expect(await checkOf(db, linkedOnly(), { collection_ids: [futureBook] })).toBeNull()
      expect(db.calls.filter((call) => call.op !== 'select')).toEqual([])
    })

    it('이전 실행이 만든, 아이템이 비어 있는 컬렉션만 가리켜도 통과한다', async () => {
      db.tables.item_books.push({ id: EMPTY_BOOK, is_active: true, valid_from: null, valid_until: null })
      expect(await checkOf(db, linkedOnly(), { collection_ids: [EMPTY_BOOK] })).toBeNull()
    })

    it('연결 컬렉션이 노출 중이 아니어도(기간이 끝난 행) 건너뛴다 — 예정 시각의 판정은 실행기가 다시 한다', async () => {
      expect(await checkOf(db, linkedOnly(), { collection_ids: [BOOK_ENDING] })).toBeNull()
    })

    it('연결 ID만 있을 때 남은 목록이 비어도 「전체」로 읽지 않는다 — 컬렉션·배지 표를 조회하지 않는다', async () => {
      expect(await checkOf(db, linkedOnly(), { collection_ids: [futureBook, EMPTY_BOOK] })).toBeNull()
      expect(db.calls.filter((call) => call.table === 'item_books' || call.table === 'badges')).toEqual([])
    })

    it('연결 ID는 대문자로 와도 소문자로 읽은 spec과 견준다', async () => {
      expect(await checkOf(db, linkedOnly(), { collection_ids: [futureBook.toUpperCase()] })).toBeNull()
      expect(db.calls.filter((call) => call.table === 'item_books' || call.table === 'badges')).toEqual([])
    })

    it('직접 적은 컬렉션이 노출 중이면 연결 컬렉션과 섞여도 통과한다. 직접 컬렉션만 읽는다', async () => {
      expect(await checkOf(db, dropItem({ collection_ids: [BOOK_LIVE] }), { collection_ids: [futureBook] })).toBeNull()
      const bookReads = db.calls.filter((call) => call.table === 'item_books')
      expect(bookReads.length).toBeGreaterThan(0)
    })

    it('직접 적은 컬렉션이 노출 중이 아니면 연결 컬렉션이 있어도 지금처럼 막는다(「노출 중인 컬렉션이 없어요」는 내지 않는다)', async () => {
      const failure = await checkOf(db, dropItem({ collection_ids: [BOOK_ENDING] }), { collection_ids: [futureBook] })
      expect(failure?.reason).toContain('예정 시각에 놓을 수 없는 대상이 있어요(노출 중이 아닌 컬렉션 1건)')
      expect(failure?.reason).not.toContain('노출 중인 컬렉션이 없어요')
      expectClean(failure?.reason)
      expectClean(failure?.detail)
    })

    it('직접 적은 컬렉션 중 일부만 걸려도 막는다', async () => {
      const failure = await checkOf(db, dropItem({ collection_ids: [BOOK_LIVE, BOOK_ENDING] }), { collection_ids: [futureBook] })
      expect(failure?.reason).toContain('노출 중이 아닌 컬렉션 1건')
    })

    it('직접 적은 컬렉션의 후보 배지가 없어도 연결 컬렉션이 있으면 「놓을 수 있는 아이템이 없어요」를 내지 않는다', async () => {
      db.tables.item_books.push({ id: EMPTY_BOOK, is_active: true, valid_from: null, valid_until: null })
      expect(await checkOf(db, dropItem({ collection_ids: [EMPTY_BOOK] }), { collection_ids: [futureBook] })).toBeNull()
    })

    it('연결 컬렉션이 없으면 직접 적은 컬렉션이 비어 있을 때 지금처럼 「놓을 수 있는 아이템이 없어요」다', async () => {
      db.tables.item_books.push({ id: EMPTY_BOOK, is_active: true, valid_from: null, valid_until: null })
      const failure = await checkOf(db, dropItem({ collection_ids: [EMPTY_BOOK] }))
      expect(failure?.reason).toContain('놓을 수 있는 아이템이 없어요')
    })

    it('지점 쪽 문제는 연결 컬렉션이 있어도 막는다', async () => {
      const failure = await checkOf(db, dropItem({ poi_ids: [P1, P_INACTIVE], collection_ids: undefined }), { collection_ids: [futureBook] })
      expect(failure?.reason).toContain('운영이 끝난 지점 1건')
      expectClean(failure?.reason)
    })

    it('운영 중인 지점이 없으면 연결 컬렉션이 있어도 「놓을 수 있는 지점이 없어요」다', async () => {
      db.tables.poi = db.tables.poi.map((row) => ({ ...row, is_active: false }))
      const failure = await checkOf(
        db,
        dropItem({ poi_ids: undefined, per_poi_count: undefined, collection_ids: undefined, poi_category: 'cafe', total_count: 3 }),
        { collection_ids: [futureBook] }
      )
      expect(failure?.reason).toContain('놓을 수 있는 지점이 없어요')
    })

    it('판정 문장에 연결 컬렉션 ID가 없다', async () => {
      const failure = await checkOf(db, dropItem({ poi_ids: [P_MISSING], collection_ids: undefined }), { collection_ids: [futureBook] })
      expect(failure?.reason).toContain('찾을 수 없는 지점 1건')
      expect(failure?.reason).not.toContain(futureBook)
    })
  })

  describe('지점·아이템 판정', () => {
    it('없는 지점·운영이 끝난 지점이 있으면 막고 개수를 알린다', async () => {
      const failure = await checkOf(db, dropItem({ poi_ids: [P1, P_INACTIVE, P_MISSING] }))
      expect(failure?.reason).toContain('찾을 수 없는 지점 1건')
      expect(failure?.reason).toContain('운영이 끝난 지점 1건')
      expectClean(failure?.reason)
    })

    it('지점 종류에 운영 중인 지점이 없으면 「놓을 수 있는 지점이 없어요」다', async () => {
      db.tables.poi = db.tables.poi.map((row) => ({ ...row, is_active: false }))
      const failure = await checkOf(db, dropItem({ poi_ids: undefined, per_poi_count: undefined, poi_category: 'cafe', total_count: 3 }))
      expect(failure?.reason).toContain('놓을 수 있는 지점이 없어요')
    })

    it('아이템 직접 선택에서 삭제된 아이템은 막는다', async () => {
      const failure = await checkOf(db, dropItem({ collection_ids: undefined, badge_ids: [B_LIVE, uuid(15)] }))
      expect(failure?.reason).toContain('삭제된 아이템 1건')
    })
  })

  it.each(['poi', 'item_books', 'badges', 'poi_drops'])('대상 판정이 읽는 %s 표를 읽지 못하면 고정 문장이고 원문·표 이름은 사유에 없다', async (table) => {
    db.failReads.add(table)
    const failure = await checkOf(db, dropItem({ collection_ids: undefined, badge_ids: [B_LIVE] }))
    expect(failure?.reason).toBe('드랍 대상을 확인하지 못했어요')
    expect(failure?.detail).toContain('드랍 대상 확인 실패')
    expectClean(failure?.reason)
  })
})

describe('create — 정한 ID로 만든다', () => {
  it('정한 ID로 공개 전(scheduled) 행을 만들고 같은 ID를 돌려준다. 예정 시각은 항목의 공개 시각이고 created_by는 실행한 관리자 ID다', async () => {
    const outcome = await createOf(db)
    expect(outcome).toEqual({ ok: true, value: { id: SCHEDULE_ID } })
    expect(schedules(db)).toHaveLength(1)
    expect(scheduleOf(db)).toMatchObject({
      id: SCHEDULE_ID,
      status: 'scheduled',
      scheduled_at: STARTS_AT,
      title: '가을 아침',
      created_by: 'admin-1',
      poi_mode: 'list',
      poi_ids: [P1, P2],
      per_poi_count: 2,
      total_count: null,
      item_mode: 'collections',
      collection_ids: [BOOK_LIVE],
      badge_ids: [],
    })
    // 만들기는 예약 행 하나를 더할 뿐이다. 드랍을 놓지 않는다(afterEach도 확인).
    expect(scheduleWrites(db)).toHaveLength(1)
    expect(db.writesTo('poi_drops')).toEqual([])
  })

  it('created_by는 서버 함수의 입력이 아니라 만든 사람 칸으로만 간다', async () => {
    await createOf(db)
    const insert = scheduleWrites(db)[0].payload as Row
    expect(insert.created_by).toBe('admin-1')
    expect(insert.id).toBe(SCHEDULE_ID)
  })

  it('연결로 채운 컬렉션이 resource 몫 뒤에 저장된다', async () => {
    const outcome = await createOf(db, dropItem(), { collection_ids: [BOOK_PRELAUNCH] })
    expect(outcome.ok).toBe(true)
    expect(scheduleOf(db)?.collection_ids).toEqual([BOOK_LIVE, BOOK_PRELAUNCH])
  })

  describe('연결로 채운 컬렉션은 등록 판정을 미룬다(티켓 20261004_2242 ⑩-b)', () => {
    const linkedOnly = () => dropItem({ collection_ids: undefined })
    const futureBook = uuid(7777)
    const EMPTY_BOOK = uuid(7778)

    it('같은 묶음이 만들 컬렉션(DB에 없는 ID)만 가리켜도 1행이 되고, 저장된 collection_ids에 연결 ID가 들어 있다', async () => {
      const outcome = await createOf(db, linkedOnly(), { collection_ids: [futureBook] })
      expect(outcome).toEqual({ ok: true, value: { id: SCHEDULE_ID } })
      expect(schedules(db)).toHaveLength(1)
      expect(scheduleOf(db)).toMatchObject({ status: 'scheduled', item_mode: 'collections', collection_ids: [futureBook], badge_ids: [] })
      expect(scheduleWrites(db)).toHaveLength(1)
    })

    it('이전 실행이 만든, 아이템이 비어 있는 컬렉션과 같은 실행의 컬렉션이 섞여도 만든다. 저장은 미룬 ID를 포함한 전체다', async () => {
      db.tables.item_books.push({ id: EMPTY_BOOK, is_active: true, valid_from: null, valid_until: null })
      const outcome = await createOf(db, dropItem({ collection_ids: [BOOK_LIVE] }), { collection_ids: [EMPTY_BOOK, futureBook] })
      expect(outcome.ok).toBe(true)
      expect(scheduleOf(db)?.collection_ids).toEqual([BOOK_LIVE, EMPTY_BOOK, futureBook])
    })

    it('연결 ID만 있을 때 컬렉션·배지 표를 조회하지 않는다(빈 목록이 「전체」로 읽히지 않는다)', async () => {
      await createOf(db, linkedOnly(), { collection_ids: [futureBook] })
      expect(db.calls.filter((call) => call.table === 'item_books' || call.table === 'badges')).toEqual([])
    })

    it('직접 적은 컬렉션이 노출 중이 아니면 연결 컬렉션이 있어도 400 문장으로 막고 아무것도 쓰지 않는다', async () => {
      const outcome = await createOf(db, dropItem({ collection_ids: [BOOK_ENDING] }), { collection_ids: [futureBook] })
      expect(outcome.ok).toBe(false)
      if (outcome.ok) return
      expect(outcome.failure.reason).toContain('노출 중이 아닌 컬렉션 1건')
      expectClean(outcome.failure.reason)
      expect(scheduleWrites(db)).toEqual([])
    })

    it('지점 쪽 문제는 연결 컬렉션이 있어도 막는다', async () => {
      const outcome = await createOf(db, dropItem({ poi_ids: [P_INACTIVE], collection_ids: undefined }), { collection_ids: [futureBook] })
      expect(outcome.ok).toBe(false)
      if (outcome.ok) return
      expect(outcome.failure.reason).toContain('운영이 끝난 지점 1건')
      expect(scheduleWrites(db)).toEqual([])
    })
  })

  it('종류+개수 × 아이템 직접으로도 만든다', async () => {
    const outcome = await createOf(db, dropItem({ poi_ids: undefined, per_poi_count: undefined, collection_ids: undefined, poi_category: 'cafe', total_count: 5, badge_ids: [B_LIVE] }))
    expect(outcome.ok).toBe(true)
    expect(scheduleOf(db)).toMatchObject({ poi_mode: 'category', poi_category: 'cafe', total_count: 5, per_poi_count: null, item_mode: 'items', badge_ids: [B_LIVE], collection_ids: [] })
  })

  it('예정 시각 기준 대상 판정에 걸리면(400) 그 쉬운 문장을 사유로 싣고 아무것도 쓰지 않으며 정리 delete도 하지 않는다', async () => {
    const outcome = await createOf(db, dropItem({ collection_ids: [BOOK_LIVE, BOOK_ENDING] }))
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.reason).toContain('예정 시각에 놓을 수 없는 대상이 있어요(노출 중이 아닌 컬렉션 1건)')
    expectClean(outcome.failure.reason)
    expect(scheduleWrites(db)).toEqual([])
  })

  it('지점 종류가 없으면(400) 서버 함수의 쉬운 문장이고 아무것도 쓰지 않는다', async () => {
    const outcome = await createOf(db, dropItem({ poi_ids: undefined, per_poi_count: undefined, poi_category: 'nowhere', total_count: 3 }))
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.failure.reason).toContain('지점 종류를 찾을 수 없어요')
    expect(scheduleWrites(db)).toEqual([])
  })

  describe('서버 오류(500)', () => {
    it('저장이 실패하면 같은 ID로 delete를 한 번 시도하고 사유는 고정 문장이다. 원문·ID는 사유에 없다', async () => {
      db.failWrites.add('ambient_drop_schedules')
      db.beforeExecute = (call) => {
        // 정리 delete는 성공하게 둔다.
        if (call.op === 'delete') db.failWrites.delete('ambient_drop_schedules')
      }
      const outcome = await createOf(db)
      expect(outcome.ok).toBe(false)
      if (outcome.ok) return
      expect(outcome.failure.reason).toBe('드랍 예약을 만들지 못했어요')
      expectClean(outcome.failure.reason)
      expect(outcome.failure.detail).toContain('정리 delete 시도')
      expect(scheduleWrites(db).map((call) => call.op)).toEqual(['insert', 'delete'])
    })

    it('정리 delete는 아직 공개 전(scheduled)인 같은 ID의 행만 지운다. 이미 시작된 행은 남긴다', async () => {
      seedSchedule(db, { status: 'running', claimed_at: before(HOUR) })
      db.failWrites.add('ambient_drop_schedules')
      db.beforeExecute = (call) => {
        if (call.op === 'delete') db.failWrites.delete('ambient_drop_schedules')
      }
      await createOf(db)
      expect(scheduleOf(db)?.status).toBe('running')

      const second = createFakeDb(world())
      seedSchedule(second, { status: 'scheduled' })
      second.failWrites.add('ambient_drop_schedules')
      second.beforeExecute = (call) => {
        if (call.op === 'delete') second.failWrites.delete('ambient_drop_schedules')
      }
      await createOf(second)
      expect(scheduleOf(second)).toBeUndefined()
      db = second
    })

    it('정리 delete도 실패하면 결과를 detail에만 적고 사유는 그대로다', async () => {
      db.failWrites.add('ambient_drop_schedules')
      const outcome = await createOf(db)
      expect(outcome.ok).toBe(false)
      if (outcome.ok) return
      expect(outcome.failure.reason).toBe('드랍 예약을 만들지 못했어요')
      expect(outcome.failure.detail).toContain('정리 delete 실패')
      expectClean(outcome.failure.reason)
    })

    it('대상 판정 조회가 실패해도(500) 고정 문장이고 쓰기는 정리 delete 한 번뿐이다', async () => {
      db.failReads.add('badges')
      const outcome = await createOf(db, dropItem({ collection_ids: undefined, badge_ids: [B_LIVE] }))
      expect(outcome.ok).toBe(false)
      if (!outcome.ok) expect(outcome.failure.reason).toBe('드랍 예약을 만들지 못했어요')
      expect(scheduleWrites(db).map((call) => call.op)).toEqual(['delete'])
    })
  })
})

describe('undo — 방금 만든 예약을 기록 없이 지운다', () => {
  it('공개 전 예약을 ID로 지우고 다른 예약은 건드리지 않는다', async () => {
    seedSchedule(db)
    seedSchedule(db, { id: OTHER_SCHEDULE_ID })
    expect(await handler.undo(service(db), SCHEDULE_ID)).toBeNull()
    expect(schedules(db).map((row) => row.id)).toEqual([OTHER_SCHEDULE_ID])
  })

  it('지울 때는 예정 시각을 보지 않는다: 예정 시각이 지난 공개 전 예약도 지운다(멈춘 준비중 정리)', async () => {
    seedSchedule(db, { scheduled_at: before(HOUR) })
    expect(await handler.undo(service(db), SCHEDULE_ID)).toBeNull()
    expect(scheduleOf(db)).toBeUndefined()
  })

  it('만든 행이 없으면(이미 지워졌다) 성공이고 다시 읽기만 한다', async () => {
    expect(await handler.undo(service(db), SCHEDULE_ID)).toBeNull()
    expect(scheduleWrites(db).map((call) => call.op)).toEqual(['delete'])
  })

  it.each(['running', 'done', 'skipped', 'failed', 'missed'])('%s 예약은 지우지 않고 「이미 실행이 시작돼 드랍 예약을 지우지 않았어요」다', async (status) => {
    seedSchedule(db, { status })
    const failure = await handler.undo(service(db), SCHEDULE_ID)
    expect(failure?.reason).toBe('이미 실행이 시작돼 드랍 예약을 지우지 않았어요')
    expectClean(failure?.reason)
    expect(failure?.detail).toContain(status)
    expect(scheduleOf(db)?.status).toBe(status)
  })

  it('밖에서 이미 취소된 예약은 놓이지 않으니 성공이다(cancel·observe와 같다). 행은 그대로 남는다', async () => {
    seedSchedule(db, { status: 'canceled', canceled_at: before(HOUR) })
    expect(await handler.undo(service(db), SCHEDULE_ID)).toBeNull()
    expect(scheduleOf(db)?.status).toBe('canceled')
  })

  it('delete 오류는 「드랍 예약을 지우지 못했어요」이고 원문은 detail에만 있다', async () => {
    seedSchedule(db)
    db.failWrites.add('ambient_drop_schedules')
    const failure = await handler.undo(service(db), SCHEDULE_ID)
    expect(failure?.reason).toBe('드랍 예약을 지우지 못했어요')
    expectClean(failure?.reason)
    expect(failure?.detail).toContain('(테스트)')
    expect(scheduleOf(db)?.status).toBe('scheduled')
  })

  it('지운 행이 없고 다시 읽기마저 실패하면 같은 고정 문장이다', async () => {
    db.beforeExecute = (call) => {
      if (call.op === 'delete') db.failReads.add('ambient_drop_schedules')
    }
    const failure = await handler.undo(service(db), SCHEDULE_ID)
    expect(failure?.reason).toBe('드랍 예약을 지우지 못했어요')
    expectClean(failure?.reason)
    expect(failure?.detail).toContain('재조회 실패')
  })
})

describe('cancel — 공개 전에만 취소 상태로 남긴다', () => {
  const cancelOf = (id = SCHEDULE_ID) => handler.cancel(service(db), id, { now: NOW })

  it('공개 전이면 지우지 않고 「취소」 상태와 취소 시각을 남긴다. 다른 예약은 건드리지 않는다', async () => {
    seedSchedule(db)
    seedSchedule(db, { id: OTHER_SCHEDULE_ID })
    expect(await cancelOf()).toEqual({ ok: true, missing: false })
    expect(scheduleOf(db)).toMatchObject({ status: 'canceled', canceled_at: NOW.toISOString(), updated_at: NOW.toISOString() })
    expect(scheduleOf(db, OTHER_SCHEDULE_ID)?.status).toBe('scheduled')
    expect(scheduleWrites(db).map((call) => call.op)).toEqual(['update'])
  })

  it('행이 없으면 밖에서 지워진 것이라 성공(missing)이고 아무것도 쓰지 않는다', async () => {
    expect(await cancelOf()).toEqual({ ok: true, missing: true })
    expect(scheduleWrites(db)).toEqual([])
  })

  it('이미 취소된 행은 밖에서 취소된 것이라 성공(missing)이고 다시 쓰지 않는다', async () => {
    seedSchedule(db, { status: 'canceled', canceled_at: before(HOUR) })
    expect(await cancelOf()).toEqual({ ok: true, missing: true })
    expect(scheduleWrites(db)).toEqual([])
    expect(scheduleOf(db)?.canceled_at).toBe(before(HOUR))
  })

  it('UUID 형식이 아닌 ID도 없는 행으로 본다', async () => {
    expect(await cancelOf('not-a-uuid')).toEqual({ ok: true, missing: true })
  })

  it.each([
    ['실행 중', { status: 'running', claimed_at: before(5 * 60_000) }],
    ['멈춤(선점 뒤 30분이 지난 running)', { status: 'running', claimed_at: before(HOUR) }],
    ['완료', { status: 'done', finished_at: before(HOUR) }],
    ['건너뜀', { status: 'skipped', finished_at: before(HOUR) }],
    ['실패', { status: 'failed', finished_at: before(HOUR) }],
    ['놓침', { status: 'missed', finished_at: before(HOUR) }],
  ])('%s 예약은 published이고 지우지도 바꾸지도 않는다. 사유는 고정 문장이다', async (_name, extra) => {
    seedSchedule(db, extra)
    const status = extra.status
    const result = await cancelOf()
    expect(result).toMatchObject({ ok: false, code: 'published', failure: { reason: '공개 시각이 지나 취소할 수 없어요' } })
    expect(scheduleWrites(db)).toEqual([])
    expect(scheduleOf(db)?.status).toBe(status)
  })

  it('예정 시각이 지난 scheduled 예약은 서버 함수가 시각을 보지 않아도 핸들러가 막는다. 정확히 지금도 막는다', async () => {
    seedSchedule(db, { scheduled_at: before(HOUR) })
    expect(await cancelOf()).toMatchObject({ ok: false, code: 'published' })
    expect(scheduleWrites(db)).toEqual([])

    schedules(db).length = 0
    seedSchedule(db, { scheduled_at: NOW.toISOString() })
    expect(await cancelOf()).toMatchObject({ ok: false, code: 'published' })
    expect(scheduleOf(db)?.status).toBe('scheduled')
  })

  it('예정 시각이 지금보다 1밀리초라도 뒤면 취소된다', async () => {
    seedSchedule(db, { scheduled_at: new Date(NOW.getTime() + 1).toISOString() })
    expect(await cancelOf()).toEqual({ ok: true, missing: false })
    expect(scheduleOf(db)?.status).toBe('canceled')
  })

  it('예정 시각에서 3시간이 지나 놓침으로 읽히는 scheduled 예약도 published다', async () => {
    seedSchedule(db, { scheduled_at: before(3 * HOUR + 1) })
    expect(await cancelOf()).toMatchObject({ ok: false, code: 'published' })
    expect(scheduleWrites(db)).toEqual([])
  })

  it('예정 시각을 읽을 수 없으면 error다. 취소하지 않는다', async () => {
    seedSchedule(db, { scheduled_at: '시각 아님' })
    const result = await cancelOf()
    expect(result).toMatchObject({ ok: false, code: 'error', failure: { reason: '드랍 예약을 취소하지 못했어요' } })
    expect(scheduleWrites(db)).toEqual([])
  })

  it('읽지 못하면 error이고 DB 오류 원문은 사유에 없다', async () => {
    seedSchedule(db)
    db.failReads.add('ambient_drop_schedules')
    const result = await cancelOf()
    expect(result).toMatchObject({ ok: false, code: 'error', failure: { reason: '드랍 예약을 취소하지 못했어요' } })
    if (!result.ok) {
      expectClean(result.failure.reason)
      expect(result.failure.detail).toContain('드랍 예약 조회 실패')
    }
    expect(scheduleWrites(db)).toEqual([])
  })

  it('상태를 바꾸는 쓰기가 실패하면 error이고 예약은 그대로다. 서버 함수의 문장은 사유가 아니라 detail이다', async () => {
    seedSchedule(db)
    db.failWrites.add('ambient_drop_schedules')
    const result = await cancelOf()
    expect(result).toMatchObject({ ok: false, code: 'error', failure: { reason: '드랍 예약을 취소하지 못했어요' } })
    if (!result.ok) {
      expectClean(result.failure.reason)
      expect(result.failure.detail).toContain('예약을 취소하지 못했어요. 잠시 후 다시 시도해 주세요.')
    }
    expect(scheduleOf(db)?.status).toBe('scheduled')
  })

  describe('읽은 뒤 쓰기 전에 끼어든 일(경합)', () => {
    it('그사이 실행이 시작되면(409) 다시 읽어 published다. 취소하지 않는다', async () => {
      const row = seedSchedule(db)
      db.beforeExecute = (call) => {
        if (call.op === 'update') row.status = 'running'
      }
      const result = await cancelOf()
      expect(result).toMatchObject({ ok: false, code: 'published', failure: { reason: '공개 시각이 지나 취소할 수 없어요' } })
      if (!result.ok) expect(result.failure.detail).toContain('놓는 중인 예약')
      expect(scheduleOf(db)?.status).toBe('running')
    })

    it('그사이 밖에서 취소되면 다시 읽어 canceled라 missing이다', async () => {
      const row = seedSchedule(db)
      db.beforeExecute = (call) => {
        if (call.op === 'update') row.status = 'canceled'
      }
      expect(await cancelOf()).toEqual({ ok: true, missing: true })
    })

    it('그사이 행이 지워지면(404) missing이다', async () => {
      seedSchedule(db)
      db.beforeExecute = (call) => {
        if (call.op === 'update') schedules(db).length = 0
      }
      expect(await cancelOf()).toEqual({ ok: true, missing: true })
    })

    it('409 뒤 다시 읽기가 실패하면 error다', async () => {
      const row = seedSchedule(db)
      let selects = 0
      db.beforeExecute = (call) => {
        if (call.op === 'update') row.status = 'running'
        // 처음 읽기(1), 서버 함수의 다시 읽기(2)는 통과시키고 핸들러의 다시 읽기(3)만 실패시킨다.
        if (call.op === 'select' && ++selects === 3) db.failReads.add('ambient_drop_schedules')
      }
      const result = await cancelOf()
      expect(result).toMatchObject({ ok: false, code: 'error', failure: { reason: '드랍 예약을 취소하지 못했어요' } })
      if (!result.ok) {
        expectClean(result.failure.reason)
        expect(result.failure.detail).toContain('재조회 실패')
      }
    })

    it('쓰기 뒤 서버 함수의 다시 읽기가 실패하면(500) error다', async () => {
      const row = seedSchedule(db)
      db.beforeExecute = (call) => {
        if (call.op === 'update') {
          row.status = 'running'
          db.failReads.add('ambient_drop_schedules')
        }
      }
      const result = await cancelOf()
      expect(result).toMatchObject({ ok: false, code: 'error' })
      if (!result.ok) expectClean(result.failure.reason)
    })
  })
})

describe('observe — 드랍 예약의 지금 상태를 읽는다', () => {
  const observeOf = (id = SCHEDULE_ID) => handler.observe(service(db), id, { now: NOW })

  it.each([
    ['예약됨(scheduled)', {}],
    ['실행 중(running)', { status: 'running', claimed_at: before(5 * 60_000) }],
    ['멈춤(선점 뒤 30분이 지난 running)', { status: 'running', claimed_at: before(HOUR) }],
  ])('%s는 공개 전이다: 종료 시각·비활성이 없고 예정 시각은 예약의 값 그대로다. 아무것도 쓰지 않는다', async (_name, extra) => {
    seedSchedule(db, extra)
    expect(await observeOf()).toEqual({ status: 'present', published: false, ended: false, startsAt: STARTS_AT, endsAt: null, inactive: false })
    expect(scheduleWrites(db)).toEqual([])
  })

  it('예정 시각이 지났어도 아직 scheduled면 공개 전이다(게재중으로 넘기면 뒤의 실패가 무시된다)', async () => {
    seedSchedule(db, { scheduled_at: before(HOUR) })
    expect(await observeOf()).toMatchObject({ status: 'present', published: false, ended: false, startsAt: before(HOUR) })
  })

  it('놓았으면(done) 공개됐고 끝났다. 종료 시각은 없다', async () => {
    seedSchedule(db, { status: 'done', finished_at: before(HOUR), scheduled_at: before(2 * HOUR) })
    expect(await observeOf()).toEqual({ status: 'present', published: true, ended: true, startsAt: before(2 * HOUR), endsAt: null, inactive: false })
  })

  it.each([
    ['skipped', '건너뜀'],
    ['failed', '실패'],
    ['missed', '놓침'],
  ])('%s는 failed이고 사유는 「드랍을 놓지 못했어요(%s)」다', async (status, label) => {
    seedSchedule(db, { status, finished_at: before(HOUR) })
    const observation = await observeOf()
    expect(observation).toEqual({ status: 'failed', reason: `드랍을 놓지 못했어요(${label})` })
    expectClean((observation as { reason: string }).reason)
  })

  it('cron이 아직 표시하지 못했어도 예정 시각 + 3시간이 지난 scheduled는 놓침으로 읽는다', async () => {
    seedSchedule(db, { scheduled_at: before(3 * HOUR + 1) })
    expect(await observeOf()).toEqual({ status: 'failed', reason: '드랍을 놓지 못했어요(놓침)' })
  })

  it('정확히 3시간이 지난 때는 아직 공개 전이다(경계는 지난 뒤부터)', async () => {
    seedSchedule(db, { scheduled_at: before(3 * HOUR) })
    expect(await observeOf()).toMatchObject({ status: 'present', published: false })
  })

  it('취소된 예약은 자원이 없는 것과 같아 missing이다', async () => {
    seedSchedule(db, { status: 'canceled', canceled_at: before(HOUR) })
    expect(await observeOf()).toEqual({ status: 'missing' })
  })

  it('행이 없으면 missing이다. UUID 형식이 아닌 ID도 같다', async () => {
    expect(await observeOf()).toEqual({ status: 'missing' })
    expect(await observeOf('not-a-uuid')).toEqual({ status: 'missing' })
  })

  it('읽지 못하면 error이고 원문은 detail에만 있다', async () => {
    seedSchedule(db)
    db.failReads.add('ambient_drop_schedules')
    const observation = await observeOf()
    expect(observation.status).toBe('error')
    expect(JSON.stringify(observation)).toContain('드랍 예약 조회 실패')
    expect(scheduleWrites(db)).toEqual([])
  })

  it('예정 시각을 읽을 수 없으면 error다. 상태를 바꾸지 않게 한다', async () => {
    seedSchedule(db, { scheduled_at: '시각 아님' })
    const observation = await observeOf()
    expect(observation).toEqual({ status: 'error', detail: '드랍 예약의 예정 시각을 읽을 수 없어요' })
  })
})
