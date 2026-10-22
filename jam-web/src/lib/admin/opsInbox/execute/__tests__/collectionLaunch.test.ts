/**
 * 컬렉션 틀 핸들러 (티켓 20261004_2039, 상위 20260930_1500 ⑩-a). 가정 1~10은 티켓 「착수 전에 정한 것」 번호다. 틀은 `jamBadge.test.ts`다.
 *
 * - prepare: 변환 결과·툴이 정하는 값, 형식 오류 문장과 「외 N건」, 보상 배지 연결 채우기와 충돌(가정 5), 표에 없는 칸 경고
 * - check: 이름 중복·트라이브·보상 배지(없음·삭제·종류)를 고정 문장으로, 연결로 채운 보상 배지는 건너뛴다. DB 오류·ID는 `reason`에 없다(가정 6·8)
 * - create: 정한 ID로 만들고, 오류면 같은 ID로 정리 delete를 한 번 시도한다
 * - undo: 참조(아이템 배지·카드·유저 기록·포인트와 배열 칸)가 있거나 읽지 못하면 지우지 않고, 없으면 시각과 상관없이 ID로 지운다(가정 7)
 * - cancel: 없음·공개됨(`published`)·참조 있음(`referenced`)·삭제 경합·오류 비노출
 * - observe: 없음·공개 판정·종료·비활성·시각 읽기 실패·쓰기 없음
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { asRegisterChecksClient, RESOURCE_KEY_BY_KIND, type ExecuteLinkedIds } from '../handlers'
import { COLLECTION_LAUNCH_HANDLER as handler, COLLECTION_LAUNCH_MESSAGES } from '../collectionLaunch'
import { DB_SECRET, FakeDb, type Row } from './fakeDb'
import { LATER, NOW, makeItem } from './fixtures'

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const BOOK_ID = uid(1)
const EXISTING_BOOK_ID = uid(2)
const BADGE_ID = uid(3)
const TRIBE_ID = uid(4)
const CARD_ID = uid(6)
const USER_ID = uid(7)
/** `LATER`(10/10 09:00 KST)를 등록 형식으로 바꾼 공개 시각. */
const STARTS_AT = new Date(LATER).toISOString()
const DAY = 24 * 60 * 60_000
const after = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString()
/** NOW(10/5 12:00 KST = 03:00Z)보다 앞. */
const PAST = '2026-10-05T02:00:00.000Z'

type Raw = Record<string, unknown>

/** 검사를 통과하는 컬렉션 항목. 공개 시각은 행 칸(`LATER`)이다. `resource`·`original`·`copy`는 칸 단위로, 행의 시각은 `row`로 덮는다. */
function collectionItem(resource: Raw = {}, original: Raw = {}, copy: Raw = {}, row: { startsAt?: string | null; endsAt?: string | null } = {}) {
  return makeItem({
    key: 'collection',
    kind: 'collection_launch',
    original: { copy: { name: '가을 컬렉션', description: '가을 길에서 모아요.', ...copy }, ...original },
    resource,
    ...row,
  })
}

function prepared(item = collectionItem(), linkedIds: ExecuteLinkedIds = {}) {
  const outcome = handler.prepare(item, { id: BOOK_ID, actorId: 'admin-1', linkedIds, now: NOW })
  if (!outcome.ok) throw new Error(`prepare 실패: ${outcome.failure.reason}`)
  return outcome.value
}

function failureOf(item: ReturnType<typeof collectionItem>) {
  const outcome = handler.prepare(item, { id: BOOK_ID, actorId: 'admin-1', linkedIds: {}, now: NOW })
  expect(outcome.ok).toBe(false)
  if (outcome.ok) throw new Error('prepare가 실패해야 해요')
  return outcome.failure
}

const checkOf = (db: FakeDb, item = collectionItem(), linkedIds: ExecuteLinkedIds = {}) =>
  handler.check(asRegisterChecksClient(db.service), prepared(item, linkedIds), { now: NOW })
const deletes = (db: FakeDb) => db.calls.filter((call) => call.op === 'delete')
const bookIds = (db: FakeDb) => (db.tables.item_books as Row[]).map((row) => row.id)

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('핸들러 정의', () => {
  it('종류·자원 키·정한 ID 먼저 만들기가 계약대로다', () => {
    expect(handler.kind).toBe('collection_launch')
    expect(handler.resourceKey).toBe(RESOURCE_KEY_BY_KIND.collection_launch)
    expect(handler.resourceKey).toBe('item_book_id')
    expect(handler.idFirst).toBe(true)
  })
})

describe('prepare', () => {
  it('정한 ID·공개 시각(valid_from)이 들어가고 툴이 정하는 값(is_active)이 붙는다. 종료가 없으면 valid_until은 null(상시)이다', () => {
    const value = prepared()
    expect(value.id).toBe(BOOK_ID)
    expect(value.payload).toEqual({
      name: '가을 컬렉션',
      description: '가을 길에서 모아요.',
      story_text: null,
      image_url: null,
      reward_points: 0,
      reward_badge_id: null,
      tribe_id: null,
      valid_from: STARTS_AT,
      valid_until: null,
      is_active: true,
    })
    expect(value.linkFields).toEqual([])
  })

  it('이야기·이미지·보상 포인트·보상 배지·트라이브·종료 시각을 읽는다', () => {
    const endsAt = after(LATER, 7 * DAY)
    const value = prepared(
      collectionItem(
        { image_url: 'https://example.com/book.png', reward_points: 100, reward_badge_id: BADGE_ID },
        { tribe_id: TRIBE_ID },
        { story_text: '낙엽이 쌓인 길을 따라가요.' },
        { endsAt }
      )
    )
    expect(value.payload).toMatchObject({
      story_text: '낙엽이 쌓인 길을 따라가요.',
      image_url: 'https://example.com/book.png',
      reward_points: 100,
      reward_badge_id: BADGE_ID,
      tribe_id: TRIBE_ID,
      valid_from: STARTS_AT,
      valid_until: endsAt,
    })
  })

  it('받은 linkedIds는 그대로 남기고 보상 배지 칸을 연결 ID로 채우고 linkFields로 알린다', () => {
    const linkedIds = { reward_badge_id: BADGE_ID }
    const value = prepared(collectionItem(), linkedIds)
    expect(value.linkedIds).toBe(linkedIds)
    expect(value.linkFields).toEqual(['reward_badge_id'])
    expect(value.payload.reward_badge_id).toBe(BADGE_ID)
  })

  it('resource에도 보상 배지를 적고 연결로 채우면 형식 오류다(연결로 채우는 칸이라 같이 적을 수 없다)', () => {
    const outcome = handler.prepare(collectionItem({ reward_badge_id: uid(9) }), { id: BOOK_ID, actorId: 'admin-1', linkedIds: { reward_badge_id: BADGE_ID }, now: NOW })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) throw new Error('실패여야 해요')
    expect(outcome.failure.reason).toBe('컬렉션 형식이 맞지 않아요: collection.reward_badge_id: 연결된 항목으로 채우는 칸이라 resource에 같이 적을 수 없어요.')
  })

  it('경고는 막지 않고 그대로 돌려준다(표에 없는 칸·툴이 정하는 값)', () => {
    const value = prepared(collectionItem({ is_active: false, required_activity_badge_id: BADGE_ID, mood: 'calm' }))
    expect(value.warnings.map((issue) => issue.path)).toEqual(['resource.is_active', 'resource.required_activity_badge_id', 'resource.mood'])
    expect(value.payload.is_active).toBe(true)
    expect(Object.keys(value.payload)).not.toContain('required_activity_badge_id')
  })

  it('변환 오류가 하나면 「컬렉션 형식이 맞지 않아요: {오류 문장}」이다', () => {
    const failure = failureOf(collectionItem({}, {}, { name: undefined }))
    expect(failure.reason).toBe('컬렉션 형식이 맞지 않아요: collection.name: 필수 항목이 없어요.')
    expect(failure.detail).toContain('copy.name')
  })

  it('이름·설명이 둘 다 없으면 첫 문장만 싣고 끝에 「 (외 1건)」을 붙인다. 빈 문자열은 없는 것으로 본다', () => {
    const failure = failureOf(collectionItem({}, {}, { name: '', description: '  ' }))
    expect(failure.reason).toBe('컬렉션 형식이 맞지 않아요: collection.name: 필수 항목이 없어요. (외 1건)')
    expect(failure.reason).not.toContain('description')
    expect(failure.detail?.split(' / ')).toHaveLength(2)
  })

  it('보상 포인트가 음수·소수·문자열이면 형식 오류다. 0은 통과한다', () => {
    for (const bad of [-1, 1.5, '50']) {
      expect(failureOf(collectionItem({ reward_points: bad })).reason, String(bad)).toContain('컬렉션 형식이 맞지 않아요: collection.reward_points: 0 이상의 정수여야 해요')
    }
    expect(prepared(collectionItem({ reward_points: 0 })).payload.reward_points).toBe(0)
  })

  it('종료 시각이 공개 시각보다 늦지 않으면 형식 오류다', () => {
    expect(failureOf(collectionItem({}, {}, {}, { endsAt: STARTS_AT })).reason).toBe('컬렉션 형식이 맞지 않아요: collection.valid_until: 종료 시각은 공개 시각보다 늦어야 해요.')
    expect(failureOf(collectionItem({}, {}, {}, { endsAt: after(LATER, -DAY) })).reason).toContain('종료 시각은 공개 시각보다 늦어야 해요')
  })

  it('공개 시각이 없으면 형식 오류다', () => {
    expect(failureOf(collectionItem({}, {}, {}, { startsAt: null })).reason).toBe('컬렉션 형식이 맞지 않아요: collection.valid_from: 필수 항목이 없어요(공개 시각 starts_at이 필요해요).')
  })

  it('kind가 collection_launch가 아니면 형식 오류다', () => {
    expect(failureOf(makeItem({ key: 'x', kind: 'mission' })).reason).toContain('컬렉션 형식이 맞지 않아요: kind: collection_launch 항목만 컬렉션으로 바꿀 수 있어요')
  })

  it('pointedBy·now 같은 컨텍스트가 없어도 동작한다(컬렉션 핸들러는 pointedBy를 쓰지 않는다)', () => {
    expect(handler.prepare(collectionItem(), { id: BOOK_ID, actorId: 'admin-1', linkedIds: {}, now: NOW, pointedBy: [{ kind: 'home_feed_card', field: 'item_book_id' }] }).ok).toBe(true)
  })
})

describe('check — 가정 8의 고정 문장', () => {
  it('같은 이름의 컬렉션이 없고 트라이브·보상 배지도 없으면 통과한다', async () => {
    const db = new FakeDb()
    db.tables.item_books = [{ id: EXISTING_BOOK_ID, name: '다른 컬렉션' }]
    expect(await checkOf(db)).toBeNull()
  })

  it('정확히 같은 이름의 컬렉션이 이미 있으면 막는다. 기존 컬렉션 ID는 detail에만 있다', async () => {
    const db = new FakeDb()
    db.tables.item_books = [{ id: EXISTING_BOOK_ID, name: '가을 컬렉션' }]
    const failure = await checkOf(db)
    expect(failure).toMatchObject({ reason: '같은 이름의 컬렉션이 이미 있어요' })
    expect(failure?.reason).toBe(COLLECTION_LAUNCH_MESSAGES.duplicate)
    expect(failure?.reason).not.toContain(EXISTING_BOOK_ID)
    expect(failure?.detail).toContain(EXISTING_BOOK_ID)
  })

  it('이름이 비슷하기만 하면(띄어쓰기·대소문자 다름) 중복이 아니다(정확히 같은 이름만 막는다)', async () => {
    const db = new FakeDb()
    db.tables.item_books = [
      { id: EXISTING_BOOK_ID, name: '가을  컬렉션' },
      { id: uid(8), name: '가을 컬렉션 2' },
    ]
    expect(await checkOf(db)).toBeNull()
  })

  it('트라이브가 있으면 통과하고 없으면 「트라이브를 찾을 수 없어요」다. 트라이브 ID는 detail에만 있다', async () => {
    const db = new FakeDb()
    db.tables.tribes = [{ id: TRIBE_ID }]
    expect(await checkOf(db, collectionItem({}, { tribe_id: TRIBE_ID }))).toBeNull()

    const missing = new FakeDb()
    const failure = await checkOf(missing, collectionItem({}, { tribe_id: TRIBE_ID }))
    expect(failure).toMatchObject({ reason: '트라이브를 찾을 수 없어요' })
    expect(failure?.reason).not.toContain(TRIBE_ID)
    expect(failure?.detail).toContain(TRIBE_ID)
  })

  describe('resource에 직접 적은 보상 배지', () => {
    const direct = () => collectionItem({ reward_badge_id: BADGE_ID })

    it('있는 활동 배지면 통과한다', async () => {
      const db = new FakeDb()
      db.tables.badges = [{ id: BADGE_ID, type: 'activity', deleted_at: null }]
      expect(await checkOf(db, direct())).toBeNull()
    })

    it('없으면 「보상으로 정한 배지가 없거나 삭제됐어요」다', async () => {
      const failure = await checkOf(new FakeDb(), direct())
      expect(failure).toMatchObject({ reason: '보상으로 정한 배지가 없거나 삭제됐어요' })
      expect(failure?.reason).not.toContain(BADGE_ID)
      expect(failure?.detail).toContain(BADGE_ID)
    })

    it('소프트 삭제된 배지도 같은 문장이다', async () => {
      const db = new FakeDb()
      db.tables.badges = [{ id: BADGE_ID, type: 'activity', deleted_at: '2026-09-01T00:00:00.000Z' }]
      expect(await checkOf(db, direct())).toMatchObject({ reason: '보상으로 정한 배지가 없거나 삭제됐어요' })
    })

    it('활동 배지가 아니면 「완성 보상 배지는 활동 배지여야 해요」다', async () => {
      for (const type of ['item', 'checkin']) {
        const db = new FakeDb()
        db.tables.badges = [{ id: BADGE_ID, type, deleted_at: null }]
        const failure = await checkOf(db, direct())
        expect(failure, type).toMatchObject({ reason: '완성 보상 배지는 활동 배지여야 해요' })
        expect(failure?.reason).not.toContain(BADGE_ID)
        expect(failure?.detail).toContain(type)
      }
    })
  })

  it('연결로 채운 보상 배지는 같은 실행이 만들 배지라 DB에서 읽지 않는다(존재·종류 확인을 건너뛴다)', async () => {
    const db = new FakeDb()
    expect(await checkOf(db, collectionItem(), { reward_badge_id: BADGE_ID })).toBeNull()
    expect(db.calls.some((call) => call.table === 'badges')).toBe(false)
  })

  it('이름이 겹치면 트라이브·보상 배지를 읽기 전에 그 사유로 막는다(검사 순서)', async () => {
    const db = new FakeDb()
    db.tables.item_books = [{ id: EXISTING_BOOK_ID, name: '가을 컬렉션' }]
    expect(await checkOf(db, collectionItem({ reward_badge_id: BADGE_ID }, { tribe_id: TRIBE_ID }))).toMatchObject({ reason: '같은 이름의 컬렉션이 이미 있어요' })
  })

  it.each([
    ['item_books', collectionItem()],
    ['tribes', collectionItem({}, { tribe_id: TRIBE_ID })],
    ['badges', collectionItem({ reward_badge_id: BADGE_ID })],
  ])('%s를 읽지 못하면 「등록 전 확인 중 DB를 읽지 못했어요」다. DB 오류 원문은 detail에만 있다', async (table, item) => {
    const db = new FakeDb()
    db.failIf = (call) => call.table === table
    const failure = await checkOf(db, item)
    expect(failure).toMatchObject({ reason: '등록 전 확인 중 DB를 읽지 못했어요' })
    expect(failure?.reason).not.toContain(DB_SECRET)
    expect(failure?.detail).toContain(DB_SECRET)
  })
})

describe('create — 정한 ID로 만든다', () => {
  const create = (db: FakeDb, item = collectionItem()) => handler.create(db.service, prepared(item), { now: NOW })

  it('정한 ID와 변환한 값으로 item_books에 한 행을 넣고 같은 ID를 돌려준다', async () => {
    const db = new FakeDb()
    db.tables.item_books = [{ id: EXISTING_BOOK_ID, name: '기존 컬렉션' }]
    const result = await create(db, collectionItem({ reward_points: 30 }))

    expect(result).toEqual({ ok: true, value: { id: BOOK_ID } })
    expect(bookIds(db)).toEqual([EXISTING_BOOK_ID, BOOK_ID])
    expect(db.tables.item_books[1]).toMatchObject({
      id: BOOK_ID,
      name: '가을 컬렉션',
      description: '가을 길에서 모아요.',
      reward_points: 30,
      is_active: true,
      valid_from: STARTS_AT,
      valid_until: null,
    })
    expect(deletes(db)).toEqual([])
  })

  it('틀 칸만 넣는다: 어드민 표시 전용 칸·이미지 제작 경로·드랍 칸은 insert 값에 없다', async () => {
    const db = new FakeDb()
    await create(db)
    const insert = db.calls.find((call) => call.table === 'item_books' && call.op === 'insert')?.payload as Row
    expect(Object.keys(insert).sort()).toEqual(
      ['description', 'id', 'image_url', 'is_active', 'name', 'reward_badge_id', 'reward_points', 'story_text', 'tribe_id', 'valid_from', 'valid_until'].sort()
    )
  })

  it('insert가 오류를 받으면 「컬렉션을 만들지 못했어요」이고 같은 ID로 정리 delete를 한 번 시도한다. DB 오류 원문·ID는 reason에 없다', async () => {
    const db = new FakeDb()
    db.failIf = (call) => call.table === 'item_books' && call.op === 'insert'
    const result = await create(db)

    expect(result).toMatchObject({ ok: false, failure: { reason: '컬렉션을 만들지 못했어요' } })
    if (result.ok) throw new Error('실패여야 해요')
    expect(result.failure.reason).not.toContain(DB_SECRET)
    expect(result.failure.reason).not.toContain(BOOK_ID)
    expect(result.failure.detail).toContain(DB_SECRET)
    expect(deletes(db)).toHaveLength(1)
    expect(deletes(db)[0].filters).toEqual([['id', BOOK_ID]])
  })

  it('정리 delete도 실패하면 그 결과를 detail에만 적는다', async () => {
    const db = new FakeDb()
    db.failIf = (call) => call.table === 'item_books' && call.op !== 'select'
    const result = await create(db)

    expect(result).toMatchObject({ ok: false, failure: { reason: '컬렉션을 만들지 못했어요' } })
    if (result.ok) throw new Error('실패여야 해요')
    expect(result.failure.detail).toContain('정리 delete 실패')
  })
})

/** 이 컬렉션을 가리키는 참조 한 줄씩. 되돌림·취소가 같은 표를 읽는다(가정 7). */
const REFERENCES: Array<[string, string, Row]> = [
  ['badges(소프트 삭제된 아이템 배지도)', 'badges', { id: BADGE_ID, item_book_id: BOOK_ID, deleted_at: '2026-09-01T00:00:00.000Z' }],
  ['today_cards', 'today_cards', { id: CARD_ID, item_book_id: BOOK_ID }],
  ['user_item_book_slots', 'user_item_book_slots', { user_id: USER_ID, item_book_id: BOOK_ID }],
  ['user_item_book_completions', 'user_item_book_completions', { user_id: USER_ID, item_book_id: BOOK_ID }],
  ['point_transactions', 'point_transactions', { id: uid(20), source_item_book_id: BOOK_ID }],
  ['ambient_drop_config(배열 칸)', 'ambient_drop_config', { id: 1, collection_ids: [BOOK_ID] }],
  ['ambient_drop_schedules(예약됨)', 'ambient_drop_schedules', { id: uid(21), status: 'scheduled', collection_ids: [BOOK_ID] }],
  ['ambient_drop_schedules(실행 중)', 'ambient_drop_schedules', { id: uid(22), status: 'running', collection_ids: [BOOK_ID] }],
]

/** 참조로 세지 않는 행: 끝난 드랍 예약(공개 전 취소는 행이 「취소」로 남는다)과 다른 컬렉션을 가리키는 행. */
const NOT_REFERENCES: Array<[string, string, Row]> = [
  ['취소된 드랍 예약', 'ambient_drop_schedules', { id: uid(23), status: 'canceled', collection_ids: [BOOK_ID] }],
  ['완료된 드랍 예약', 'ambient_drop_schedules', { id: uid(24), status: 'done', collection_ids: [BOOK_ID] }],
  ['건너뛴 드랍 예약', 'ambient_drop_schedules', { id: uid(25), status: 'skipped', collection_ids: [BOOK_ID] }],
  ['놓친 드랍 예약', 'ambient_drop_schedules', { id: uid(26), status: 'missed', collection_ids: [BOOK_ID] }],
  ['실패한 드랍 예약', 'ambient_drop_schedules', { id: uid(27), status: 'failed', collection_ids: [BOOK_ID] }],
  ['다른 컬렉션을 가리키는 카드', 'today_cards', { id: CARD_ID, item_book_id: EXISTING_BOOK_ID }],
  ['다른 컬렉션이 든 드랍 예약', 'ambient_drop_schedules', { id: uid(28), status: 'scheduled', collection_ids: [EXISTING_BOOK_ID] }],
]

describe('undo — 참조를 확인한 뒤 ID로 지운다', () => {
  const seed = (db: FakeDb, book: Row = {}) => {
    db.tables.item_books = [
      { id: BOOK_ID, name: '가을 컬렉션', is_active: true, valid_from: LATER, valid_until: null, ...book },
      { id: EXISTING_BOOK_ID, name: '기존 컬렉션', is_active: true, valid_from: PAST, valid_until: null },
    ]
  }

  it('참조가 없으면 그 ID의 행만 지우고 성공이다', async () => {
    const db = new FakeDb()
    seed(db)
    expect(await handler.undo(db.service, BOOK_ID)).toBeNull()
    expect(bookIds(db)).toEqual([EXISTING_BOOK_ID])
  })

  it('공개 시각이 지난 컬렉션도 지운다(시각 조건은 걸지 않는다: 멈춘 준비중 정리는 공개 시각 뒤에 올 수 있다)', async () => {
    const db = new FakeDb()
    seed(db, { valid_from: PAST })
    expect(await handler.undo(db.service, BOOK_ID)).toBeNull()
    expect(bookIds(db)).toEqual([EXISTING_BOOK_ID])
    expect(deletes(db)[0].filters).toEqual([['id', BOOK_ID]])
  })

  it.each(REFERENCES)('%s에 이 컬렉션을 가리키는 행이 있으면 지우지 않는다. 표 이름은 detail에만 있다', async (_label, table, row) => {
    const db = new FakeDb()
    seed(db)
    db.tables[table] = [row]
    const failure = await handler.undo(db.service, BOOK_ID)

    expect(failure).toMatchObject({ reason: '아이템 배지나 유저 기록·연결이 있거나 확인하지 못해 컬렉션을 지우지 않았어요' })
    expect(failure?.reason).not.toContain(table)
    expect(failure?.detail).toContain(table)
    expect(deletes(db)).toEqual([])
    expect(bookIds(db)).toEqual([BOOK_ID, EXISTING_BOOK_ID])
  })

  it.each(NOT_REFERENCES)('%s는 참조로 세지 않는다', async (_label, table, row) => {
    const db = new FakeDb()
    seed(db)
    db.tables[table] = [row]
    expect(await handler.undo(db.service, BOOK_ID)).toBeNull()
    expect(bookIds(db)).toEqual([EXISTING_BOOK_ID])
  })

  it('옛 드랍 상태 표(user_drop_state)는 읽지 않는다 — 그 열이 지워져도 되돌림이 막히지 않는다 (티켓 20261022_0938 2회)', async () => {
    const db = new FakeDb()
    seed(db)
    expect(await handler.undo(db.service, BOOK_ID)).toBeNull()
    expect(db.calls.map((call) => call.table)).not.toContain('user_drop_state')
  })

  it('참조를 읽지 못하면 지우지 않는다. DB 오류 원문은 detail에만 있다', async () => {
    const db = new FakeDb()
    seed(db)
    db.failIf = (call) => call.table === 'user_item_book_slots'
    const failure = await handler.undo(db.service, BOOK_ID)

    expect(failure).toMatchObject({ reason: '아이템 배지나 유저 기록·연결이 있거나 확인하지 못해 컬렉션을 지우지 않았어요' })
    expect(failure?.reason).not.toContain(DB_SECRET)
    expect(failure?.detail).toContain(DB_SECRET)
    expect(deletes(db)).toEqual([])
  })

  it('delete 오류는 「컬렉션을 지우지 못했어요」다. DB 오류 원문은 detail에만 있다', async () => {
    const db = new FakeDb()
    seed(db)
    db.failIf = (call) => call.table === 'item_books' && call.op === 'delete'
    const failure = await handler.undo(db.service, BOOK_ID)

    expect(failure).toMatchObject({ reason: '컬렉션을 지우지 못했어요' })
    expect(failure?.reason).not.toContain(DB_SECRET)
    expect(failure?.detail).toContain(DB_SECRET)
  })
})

describe('cancel — 공개 전에만 지운다', () => {
  const seed = (db: FakeDb, book: Row = {}) => {
    db.tables.item_books = [
      { id: BOOK_ID, name: '가을 컬렉션', is_active: true, valid_from: LATER, valid_until: null, ...book },
      { id: EXISTING_BOOK_ID, name: '기존 컬렉션', is_active: true, valid_from: PAST, valid_until: null },
    ]
  }
  const cancel = (db: FakeDb) => handler.cancel(db.service, BOOK_ID, { now: NOW })
  const PUBLISHED = { ok: false, code: 'published', failure: { reason: '공개 시각이 지나 취소할 수 없어요' } }

  it('공개 전이고 참조가 없으면 그 ID의 행만 지우고 지울 때 `valid_from > 지금` 조건을 건다', async () => {
    const db = new FakeDb()
    seed(db)
    expect(await cancel(db)).toEqual({ ok: true, missing: false })
    expect(bookIds(db)).toEqual([EXISTING_BOOK_ID])
    expect(deletes(db)).toHaveLength(1)
    expect(deletes(db)[0].filters).toEqual([
      ['id', BOOK_ID],
      ['valid_from >', NOW.toISOString()],
    ])
  })

  it('종료 시각이 있어도, 비활성이어도 공개 전이면 지운다', async () => {
    const db = new FakeDb()
    seed(db, { valid_until: after(LATER, 7 * DAY), is_active: false })
    expect(await cancel(db)).toEqual({ ok: true, missing: false })
  })

  it('행이 없으면 운영툴 밖에서 지워진 것이라 성공(missing)이고 아무것도 지우지 않는다', async () => {
    const db = new FakeDb()
    expect(await cancel(db)).toEqual({ ok: true, missing: true })
    expect(deletes(db)).toEqual([])
  })

  it.each([
    ['공개 시각이 지났다', { valid_from: PAST }],
    ['공개 시각이 정확히 지금이다', { valid_from: NOW.toISOString() }],
    ['공개 시각이 비었다(바로 공개)', { valid_from: null }],
    ['공개 시각을 읽을 수 없다', { valid_from: '내일' }],
  ])('%s: published이고 지우지 않으며 참조도 읽지 않는다', async (_label, book) => {
    const db = new FakeDb()
    seed(db, book)
    expect(await cancel(db)).toEqual(PUBLISHED)
    expect(deletes(db)).toEqual([])
    expect(bookIds(db)).toEqual([BOOK_ID, EXISTING_BOOK_ID])
    expect(db.calls.some((call) => call.table === 'user_item_book_slots')).toBe(false)
  })

  it('종료 시각이 지났어도(종료됨) 공개 시각이 지났으면 published다', async () => {
    const db = new FakeDb()
    seed(db, { valid_from: '2026-09-01T00:00:00.000Z', valid_until: PAST })
    expect(await cancel(db)).toEqual(PUBLISHED)
  })

  it.each(REFERENCES)('%s에 이 컬렉션을 가리키는 행이 있으면 referenced이고 지우지 않는다. 표 이름은 detail에만 있다', async (_label, table, row) => {
    const db = new FakeDb()
    seed(db)
    db.tables[table] = [row]
    const result = await cancel(db)

    expect(result).toMatchObject({ ok: false, code: 'referenced', failure: { reason: '아이템 배지나 유저 기록·연결이 있거나 확인하지 못해 컬렉션을 지우지 않았어요' } })
    if (result.ok) throw new Error('실패여야 해요')
    expect(result.failure.reason).not.toContain(table)
    expect(result.failure.detail).toContain(table)
    expect(deletes(db)).toEqual([])
  })

  it('공개 전에 취소된 드랍 예약(「취소」로 남은 행)은 막지 않는다', async () => {
    const db = new FakeDb()
    seed(db)
    db.tables.ambient_drop_schedules = [{ id: uid(23), status: 'canceled', collection_ids: [BOOK_ID] }]
    expect(await cancel(db)).toEqual({ ok: true, missing: false })
  })

  it('참조를 읽지 못하면 referenced이고 지우지 않는다. DB 오류 원문은 detail에만 있다', async () => {
    const db = new FakeDb()
    seed(db)
    db.failIf = (call) => call.table === 'point_transactions'
    const result = await cancel(db)

    expect(result).toMatchObject({ ok: false, code: 'referenced' })
    if (result.ok) throw new Error('실패여야 해요')
    expect(result.failure.reason).not.toContain(DB_SECRET)
    expect(result.failure.detail).toContain(DB_SECRET)
    expect(deletes(db)).toEqual([])
  })

  it('읽은 뒤 공개 시각이 지나면(삭제 경합) 지운 행이 없고, 다시 읽어 행이 있으면 published다', async () => {
    const db = new FakeDb()
    seed(db)
    db.beforeRun = (call) => {
      if (call.op === 'delete') (db.tables.item_books[0] as Row).valid_from = PAST
    }
    expect(await cancel(db)).toEqual(PUBLISHED)
    expect(bookIds(db)).toEqual([BOOK_ID, EXISTING_BOOK_ID])
  })

  it('지우려는 사이 다른 곳에서 먼저 지우면(삭제 경합) 다시 읽어 행이 없으니 missing이다', async () => {
    const db = new FakeDb()
    seed(db)
    db.beforeRun = (call) => {
      if (call.op === 'delete') db.tables.item_books = (db.tables.item_books as Row[]).filter((row) => row.id !== BOOK_ID)
    }
    expect(await cancel(db)).toEqual({ ok: true, missing: true })
    expect(bookIds(db)).toEqual([EXISTING_BOOK_ID])
  })

  it.each([
    ['처음 읽기', (call: { op: string; table: string }) => call.table === 'item_books' && call.op === 'select'],
    ['지우기', (call: { op: string; table: string }) => call.table === 'item_books' && call.op === 'delete'],
  ])('%s 오류는 error이고 「컬렉션을 지우지 못했어요」다. DB 오류 원문·컬렉션 ID는 reason에 없다', async (_label, fails) => {
    const db = new FakeDb()
    seed(db)
    db.failIf = fails
    const result = await cancel(db)

    expect(result).toMatchObject({ ok: false, code: 'error', failure: { reason: '컬렉션을 지우지 못했어요' } })
    if (result.ok) throw new Error('실패여야 해요')
    expect(result.failure.reason).not.toContain(DB_SECRET)
    expect(result.failure.reason).not.toContain(BOOK_ID)
    expect(result.failure.detail).toContain(DB_SECRET)
    expect(bookIds(db)).toEqual([BOOK_ID, EXISTING_BOOK_ID])
  })

  it('지운 행이 없고 다시 읽기마저 실패하면 error다', async () => {
    const db = new FakeDb()
    seed(db)
    let selects = 0
    db.beforeRun = (call) => {
      if (call.op === 'delete') (db.tables.item_books[0] as Row).valid_from = PAST
    }
    db.failIf = (call) => call.table === 'item_books' && call.op === 'select' && ++selects === 2
    const result = await cancel(db)

    expect(result).toMatchObject({ ok: false, code: 'error', failure: { reason: '컬렉션을 지우지 못했어요' } })
    if (result.ok) throw new Error('실패여야 해요')
    expect(result.failure.detail).toContain(DB_SECRET)
  })
})

describe('observe — 컬렉션의 지금 상태를 읽는다', () => {
  const STARTS = '2026-10-05T00:00:00.000Z' // NOW(10/5 12:00 KST = 03:00Z)보다 앞
  const ENDS = '2026-10-12T00:00:00.000Z' // NOW보다 뒤
  const seed = (db: FakeDb, book: Row = {}) => {
    db.tables.item_books = [
      { id: BOOK_ID, name: '가을 컬렉션', is_active: true, valid_from: STARTS, valid_until: ENDS, ...book },
      { id: EXISTING_BOOK_ID, name: '기존 컬렉션', is_active: true, valid_from: LATER, valid_until: null },
    ]
  }
  const observe = (db: FakeDb) => handler.observe(db.service, BOOK_ID, { now: NOW })

  it('행이 없으면 missing이다(운영툴 밖에서 지워짐)', async () => {
    expect(await observe(new FakeDb())).toEqual({ status: 'missing' })
  })

  it('공개 전이면 published·ended가 둘 다 false이고 공개·종료 시각을 그대로 알린다', async () => {
    const db = new FakeDb()
    seed(db, { valid_from: LATER, valid_until: after(LATER, 7 * DAY) })
    expect(await observe(db)).toEqual({ status: 'present', published: false, ended: false, startsAt: LATER, endsAt: after(LATER, 7 * DAY), inactive: false })
  })

  it('공개 시각이 지났고 종료 시각이 아직 앞이면 공개 중이다', async () => {
    const db = new FakeDb()
    seed(db)
    expect(await observe(db)).toEqual({ status: 'present', published: true, ended: false, startsAt: STARTS, endsAt: ENDS, inactive: false })
  })

  it('종료 시각이 없으면(상시) 공개 뒤로 끝나지 않는다', async () => {
    const db = new FakeDb()
    seed(db, { valid_until: null })
    expect(await observe(db)).toEqual({ status: 'present', published: true, ended: false, startsAt: STARTS, endsAt: null, inactive: false })
  })

  it('공개 시각이 없으면 이미 공개된 것이다(valid_from 없음 = 바로 공개). 시각은 null로 알린다', async () => {
    const db = new FakeDb()
    seed(db, { valid_from: null, valid_until: null })
    expect(await observe(db)).toEqual({ status: 'present', published: true, ended: false, startsAt: null, endsAt: null, inactive: false })
  })

  it('양 끝을 포함한다: 공개 시각이 정확히 지금이어도, 종료 시각이 정확히 지금이어도 공개 중이다', async () => {
    const atStart = new FakeDb()
    seed(atStart, { valid_from: NOW.toISOString(), valid_until: ENDS })
    expect(await observe(atStart)).toMatchObject({ published: true, ended: false })

    const atEnd = new FakeDb()
    seed(atEnd, { valid_until: NOW.toISOString() })
    expect(await observe(atEnd)).toMatchObject({ published: true, ended: false })
  })

  it('종료 시각이 1밀리초라도 지났으면 종료다(공개 중이 아니다)', async () => {
    const db = new FakeDb()
    seed(db, { valid_until: new Date(NOW.getTime() - 1).toISOString() })
    expect(await observe(db)).toMatchObject({ status: 'present', published: false, ended: true })
  })

  it('공개·종료 시각이 모두 지난 늦은 회차도 종료로 읽는다', async () => {
    const db = new FakeDb()
    seed(db, { valid_from: '2026-09-01T00:00:00.000Z', valid_until: PAST })
    expect(await observe(db)).toMatchObject({ published: false, ended: true })
  })

  it('밖에서 비활성이 되면 inactive로만 알린다. 공개 판정에는 들지 않는다(published false)', async () => {
    const live = new FakeDb()
    seed(live, { is_active: false })
    expect(await observe(live)).toEqual({ status: 'present', published: false, ended: false, startsAt: STARTS, endsAt: ENDS, inactive: true })

    const scheduled = new FakeDb()
    seed(scheduled, { is_active: false, valid_from: LATER, valid_until: null })
    expect(await observe(scheduled)).toMatchObject({ published: false, ended: false, inactive: true })
  })

  it('비활성이어도 종료 시각이 지났으면 ended다', async () => {
    const db = new FakeDb()
    seed(db, { is_active: false, valid_until: PAST })
    expect(await observe(db)).toMatchObject({ published: false, ended: true, inactive: true })
  })

  it.each([
    ['공개 시각을 읽을 수 없다', { valid_from: '내일' }],
    ['종료 시각을 읽을 수 없다', { valid_until: '다음 주' }],
  ])('%s: 상태를 바꾸지 않도록 error다', async (_label, book) => {
    const db = new FakeDb()
    seed(db, book)
    expect(await observe(db)).toEqual({ status: 'error', detail: '컬렉션 시각을 읽을 수 없어요' })
  })

  it('읽지 못하면 error이고 DB 오류 원문은 detail에만 있다', async () => {
    const db = new FakeDb()
    seed(db)
    db.failIf = (call) => call.table === 'item_books'
    const result = await observe(db)
    expect(result).toMatchObject({ status: 'error' })
    if (result.status !== 'error') throw new Error('error여야 해요')
    expect(result.detail).toContain(DB_SECRET)
  })

  it('쓰지 않는다: select만 부른다', async () => {
    const db = new FakeDb()
    seed(db)
    await observe(db)
    expect(db.calls.every((call) => call.op === 'select')).toBe(true)
    expect(db.calls.map((call) => call.table)).toEqual(['item_books'])
  })
})

describe('응답에 나가는 사유 — DB 원문·자원 ID 비노출', () => {
  it('모든 고정 문장에는 ID·칼럼 이름·DB 오류 원문이 없다', () => {
    for (const reason of Object.values(COLLECTION_LAUNCH_MESSAGES)) {
      expect(reason).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/)
      expect(reason).not.toMatch(/valid_from|valid_until|item_book_id|reward_badge_id|tribe_id|item_books/)
      expect(reason).not.toContain(DB_SECRET)
    }
  })
})
