/**
 * 레시피 핸들러 (티켓 20261002_2221, 상위 20260930_1500 ⑧-a). 가정 1~8은 티켓 「착수 전에 정한 것」 번호다. 틀은 `mission.test.ts`다.
 *
 * - prepare: 페이로드의 시각(공개 = `valid_from`, 종료 없음 = 칸 없음)·형식 오류 문장과 「외 N건」, 현재 시각으로 공개 시각이 미래인지 본다(가정 4·5·6)
 * - check: 레시피 서버 함수의 쉬운 문장을 사유로 쓰고(가정 5), 아직 열리지 않은 컬렉션의 배지는 막는다. 기준은 레시피 공개 시각이다(가정 2). DB 오류·ID는 `reason`에 없다
 * - create: 정한 ID로 행과 슬롯을 만들고, 서버 오류(500)면 같은 ID로 정리 delete를 한 번 시도한다. 검증 오류(400)는 정리하지 않는다
 * - undo: 이 레시피를 가리키는 배지가 있거나 읽지 못하면 지우지 않고, 없으면 시각과 상관없이 ID로 지운다
 * - cancel: 없음·공개됨·종료됨·참조 있음(409)·삭제 경합·오류 비노출
 * - observe: 없음·공개 판정(`recipeReleaseState`)·종료·쓰기 없음·읽기 실패 비노출
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { asRegisterChecksClient, RESOURCE_KEY_BY_KIND, type ExecuteLinkedIds } from '../handlers'
import { RECIPE_HANDLER as handler } from '../recipe'
import { DB_SECRET, FakeDb, type Row } from './fakeDb'
import { LATER, NOW, makeItem } from './fixtures'

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const RECIPE_ID = uid(1)
const EXISTING_RECIPE_ID = uid(2)
const ITEM_BADGE = uid(3)
const ACTIVITY_BADGE = uid(4)
const REWARD_BADGE = uid(5)
const BOOK_ID = uid(6)
const FIRST_SUCCESS_BADGE = uid(7)
/** `LATER`(10/10 09:00 KST)를 등록 형식으로 바꾼 공개 시각. */
const STARTS_AT = new Date(LATER).toISOString()
const DAY = 24 * 60 * 60_000
const after = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString()
/** NOW(10/5 12:00 KST = 03:00Z)보다 앞. */
const PAST = '2026-10-05T02:00:00.000Z'

type Raw = Record<string, unknown>

const SLOTS = [
  { badge_type: 'item', allowed_badge_ids: [ITEM_BADGE] },
  { badge_type: 'activity', allowed_badge_ids: [ACTIVITY_BADGE] },
]

/** 검사를 통과하는 레시피 항목. 공개 시각은 행 칸(`LATER`)이다. `resource`·`original`·`copy`는 칸 단위로, 행의 시각은 `row`로 덮는다. */
function recipeItem(resource: Raw = {}, original: Raw = {}, copy: Raw = {}, row: { startsAt?: string | null; endsAt?: string | null } = {}) {
  return makeItem({
    key: 'recipe',
    kind: 'recipe',
    original: { copy: { name: '가을 믹스', ...copy }, ...original },
    resource: { slots: SLOTS, reward_points: 10, ...resource },
    ...row,
  })
}

/** 슬롯 후보 두 개와 보상 배지가 있는 기본 DB. 컬렉션 소속 배지가 필요하면 `badges`를 고친다. */
function seededDb(): FakeDb {
  const db = new FakeDb()
  db.tables.badges = [
    { id: ITEM_BADGE, type: 'item', deleted_at: null, item_book_id: null },
    { id: ACTIVITY_BADGE, type: 'activity', deleted_at: null, item_book_id: null },
    { id: REWARD_BADGE, type: 'item', deleted_at: null, item_book_id: null },
  ]
  return db
}

function prepared(item = recipeItem(), linkedIds: ExecuteLinkedIds = {}, now: Date = NOW) {
  const outcome = handler.prepare(item, { id: RECIPE_ID, actorId: 'admin-1', linkedIds, now })
  if (!outcome.ok) throw new Error(`prepare 실패: ${outcome.failure.reason}`)
  return outcome.value
}

const checkOf = (db: FakeDb, item = recipeItem()) => handler.check(asRegisterChecksClient(db.service), prepared(item), { now: NOW })
const deletes = (db: FakeDb) => db.calls.filter((call) => call.op === 'delete')
const recipeIds = (db: FakeDb) => (db.tables.combination_recipes as Row[]).map((row) => row.id)

beforeEach(() => {
  // 레시피 서버 함수가 DB 오류를 서버 로그로 남긴다. 테스트 출력을 어지럽히지 않게 막는다.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('핸들러 정의', () => {
  it('종류·자원 키·정한 ID 먼저 만들기가 계약대로다', () => {
    expect(handler.kind).toBe('recipe')
    expect(handler.resourceKey).toBe(RESOURCE_KEY_BY_KIND.recipe)
    expect(handler.resourceKey).toBe('recipe_id')
    expect(handler.idFirst).toBe(true)
  })
})

describe('prepare', () => {
  it('정한 ID·공개 시각(valid_from)이 들어가고 종료 시각이 없으면 valid_until 칸이 없다(상시)', () => {
    const value = prepared()
    expect(value.id).toBe(RECIPE_ID)
    expect(value.payload).toEqual({ name: '가을 믹스', valid_from: STARTS_AT, slots: SLOTS, reward_points: 10 })
    expect('valid_until' in value.payload).toBe(false)
    expect(value.linkFields).toEqual([])
  })

  it('종료 시각이 있으면 valid_until이다', () => {
    const endsAt = after(LATER, 7 * DAY)
    expect(prepared(recipeItem({}, {}, {}, { endsAt })).payload).toMatchObject({ valid_from: STARTS_AT, valid_until: endsAt })
  })

  it('연결 칸이 없다: 받은 linkedIds는 그대로 남기고 payload에는 넣지 않는다', () => {
    const linkedIds = { recipe_id: uid(9) }
    const value = prepared(recipeItem(), linkedIds)
    expect(value.linkedIds).toBe(linkedIds)
    expect(value.linkFields).toEqual([])
    expect(JSON.stringify(value.payload)).not.toContain(uid(9))
  })

  it('경고는 막지 않고 그대로 돌려준다', () => {
    const value = prepared(recipeItem({ slots: SLOTS, reward_points: 10, mood: 'calm' }))
    expect(value.warnings.map((issue) => issue.path)).toEqual(['resource.mood'])
  })

  it('변환 오류가 하나면 「레시피 형식이 맞지 않아요: {오류 문장}」이다', () => {
    const outcome = handler.prepare(recipeItem({}, {}, { name: undefined }), { id: RECIPE_ID, actorId: 'admin-1', linkedIds: {}, now: NOW })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.reason).toBe('레시피 형식이 맞지 않아요: recipe.name: 필수 항목이 없어요.')
    expect(outcome.failure.detail).toContain('copy.name')
  })

  it('변환 오류가 둘 이상이면 첫 문장만 싣고 끝에 「 (외 N건)」을 붙인다', () => {
    const outcome = handler.prepare(recipeItem({ slots: undefined }, {}, { name: undefined }), { id: RECIPE_ID, actorId: 'admin-1', linkedIds: {}, now: NOW })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    const errors = outcome.failure.detail?.split(' / ') ?? []
    expect(errors).toHaveLength(2)
    expect(outcome.failure.reason).toBe('레시피 형식이 맞지 않아요: recipe.name: 필수 항목이 없어요. (외 1건)')
    expect(outcome.failure.reason).not.toContain('slots')
  })

  it('슬롯 개수·보상 같은 형식 오류는 normalizeRecipePayload의 문장을 싣는다', () => {
    const one = handler.prepare(recipeItem({ slots: [SLOTS[0]] }), { id: RECIPE_ID, actorId: 'admin-1', linkedIds: {}, now: NOW })
    expect(one.ok).toBe(false)
    if (!one.ok) expect(one.failure.reason).toBe('레시피 형식이 맞지 않아요: 슬롯을 2개 이상 만들어 주세요.')

    const noReward = handler.prepare(recipeItem({ reward_points: 0 }), { id: RECIPE_ID, actorId: 'admin-1', linkedIds: {}, now: NOW })
    expect(noReward.ok).toBe(false)
    if (!noReward.ok) expect(noReward.failure.reason).toContain('보상을 하나 이상 지정해 주세요')
  })

  it('공개 시각이 현재 시각보다 이르거나 같으면 형식 오류다(핸들러가 받은 now로 견준다)', () => {
    const past = handler.prepare(recipeItem({}, {}, {}, { startsAt: PAST }), { id: RECIPE_ID, actorId: 'admin-1', linkedIds: {}, now: NOW })
    expect(past.ok).toBe(false)
    if (!past.ok) expect(past.failure.reason).toMatch(/^레시피 형식이 맞지 않아요: 공개 시각이 이미 지났어요/)

    const same = handler.prepare(recipeItem({}, {}, {}, { startsAt: NOW.toISOString() }), { id: RECIPE_ID, actorId: 'admin-1', linkedIds: {}, now: NOW })
    expect(same.ok).toBe(false)

    // 같은 항목이어도 now가 공개 시각 앞이면 통과하고, 뒤면 막힌다.
    expect(handler.prepare(recipeItem(), { id: RECIPE_ID, actorId: 'admin-1', linkedIds: {}, now: NOW }).ok).toBe(true)
    expect(handler.prepare(recipeItem(), { id: RECIPE_ID, actorId: 'admin-1', linkedIds: {}, now: new Date(after(LATER, 1)) }).ok).toBe(false)
  })

  it('공개 시각이 시각 형식이 아니면 형식 오류다', () => {
    const outcome = handler.prepare(recipeItem({}, { starts_at: 'not-a-time' }), { id: RECIPE_ID, actorId: 'admin-1', linkedIds: {}, now: NOW })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.failure.reason).toMatch(/^레시피 형식이 맞지 않아요: 공개 시각 형식이 올바르지 않아요/)
  })

  it('다른 종류의 항목은 변환 오류로 막는다', () => {
    const outcome = handler.prepare(makeItem({ key: 'c', kind: 'home_feed_card' }), { id: RECIPE_ID, actorId: 'admin-1', linkedIds: {}, now: NOW })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.failure.reason).toMatch(/^레시피 형식이 맞지 않아요: kind: /)
  })
})

describe('check — 가정 5·2의 고정 문장', () => {
  it('모두 있으면 통과하고, 슬롯 후보·보상 배지와 컬렉션 소속만 읽는다', async () => {
    const db = seededDb()
    expect(await checkOf(db, recipeItem({ slots: SLOTS, reward_badge_ids: [REWARD_BADGE] }))).toBeNull()
    expect(db.calls.every((call) => call.op === 'select')).toBe(true)
    expect(db.calls.map((call) => call.table)).toEqual(['badges', 'badges', 'badges'])
  })

  it('슬롯 후보 배지가 없거나 삭제됐으면 서버 함수의 쉬운 문장이 사유이고 배지 ID는 없다', async () => {
    const db = seededDb()
    db.tables.badges = [{ id: ITEM_BADGE, type: 'item', deleted_at: null, item_book_id: null }]
    const failure = await checkOf(db)
    expect(failure?.reason).toBe('슬롯에 지정한 후보 중 삭제되었거나 존재하지 않는 배지가 있어요. 다시 선택해 주세요.')
    expect(failure?.reason).not.toContain(ACTIVITY_BADGE)

    const deleted = seededDb()
    deleted.tables.badges = [
      { id: ITEM_BADGE, type: 'item', deleted_at: '2026-10-01T00:00:00.000Z', item_book_id: null },
      { id: ACTIVITY_BADGE, type: 'activity', deleted_at: null, item_book_id: null },
    ]
    expect((await checkOf(deleted))?.reason).toBe('슬롯에 지정한 후보 중 삭제되었거나 존재하지 않는 배지가 있어요. 다시 선택해 주세요.')
  })

  it('슬롯이 정한 타입과 배지의 실제 타입이 다르면 서버 함수의 쉬운 문장이 사유다', async () => {
    const db = seededDb()
    db.tables.badges = [
      { id: ITEM_BADGE, type: 'activity', deleted_at: null, item_book_id: null },
      { id: ACTIVITY_BADGE, type: 'activity', deleted_at: null, item_book_id: null },
    ]
    const failure = await checkOf(db)
    expect(failure?.reason).toBe('이 슬롯은 아이템 배지만 넣을 수 있어요. 다른 타입을 쓰려면 슬롯을 새로 추가해 주세요.')
  })

  it('보상 배지가 없거나 아이템 배지가 아니면 서버 함수의 쉬운 문장이 사유다', async () => {
    const missing = seededDb()
    const missingFailure = await checkOf(missing, recipeItem({ slots: SLOTS, reward_badge_ids: [uid(99)] }))
    expect(missingFailure?.reason).toBe('선택한 보상 배지 중 삭제되었거나 존재하지 않는 배지가 있어요. 다시 선택해 주세요.')
    expect(missingFailure?.reason).not.toContain(uid(99))

    const notItem = seededDb()
    const notItemFailure = await checkOf(notItem, recipeItem({ slots: SLOTS, reward_badge_ids: [ACTIVITY_BADGE] }))
    expect(notItemFailure?.reason).toMatch(/^보상 배지는 아이템 배지만 지정할 수 있어요/)
  })

  it('종료 시각이 공개 시각보다 늦지 않으면(같거나 이르다) 서버 함수의 쉬운 문장이 사유다', async () => {
    for (const endsAt of [LATER, after(LATER, -DAY)]) {
      const failure = await checkOf(seededDb(), recipeItem({}, {}, {}, { endsAt }))
      expect(failure?.reason).toBe('종료 시각은 공개 시각보다 늦어야 해요. 종료 시각을 공개 시각 이후로 다시 선택해 주세요.')
    }
    expect(await checkOf(seededDb(), recipeItem({}, {}, {}, { endsAt: after(LATER, 1) }))).toBeNull()
  })

  it('슬롯·보상 배지를 읽지 못하면 서버 함수의 고정 문장이고 DB 오류 원문은 사유에 없다', async () => {
    const db = seededDb()
    db.failIf = (call) => call.table === 'badges'
    const failure = await checkOf(db)
    expect(failure?.reason).toBe('슬롯 후보 배지를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')
    expect(failure?.reason).not.toContain(DB_SECRET)
  })

  describe('안 열린 컬렉션의 배지(가정 2)', () => {
    const REASON = '아직 열리지 않은 컬렉션의 배지가 들어 있어요'
    /** 슬롯 후보 `ITEM_BADGE`와 보상 `REWARD_BADGE`를 컬렉션 소속으로 두는 DB. */
    const dbWith = (books: Row[], member: { slot?: boolean; reward?: boolean } = { slot: true }) => {
      const db = seededDb()
      db.tables.badges = (db.tables.badges as Row[]).map((badge) =>
        (badge.id === ITEM_BADGE && member.slot) || (badge.id === REWARD_BADGE && member.reward) ? { ...badge, item_book_id: BOOK_ID } : badge
      )
      db.tables.item_books = books
      return db
    }
    const book = (over: Row = {}) => ({ id: BOOK_ID, is_active: true, valid_from: null, valid_until: null, ...over })
    const withReward = recipeItem({ slots: SLOTS, reward_badge_ids: [REWARD_BADGE] })

    it('활성이고 공개 시각이 비었거나 레시피보다 이른 컬렉션의 배지는 통과한다', async () => {
      expect(await checkOf(dbWith([book()]))).toBeNull()
      expect(await checkOf(dbWith([book({ valid_from: after(STARTS_AT, -DAY) })]))).toBeNull()
    })

    it('기준은 레시피 공개 시각이다: 지금은 닫혀 있어도 레시피보다 먼저 열리면 통과한다', async () => {
      const opensBeforeRecipe = after(NOW.toISOString(), DAY) // NOW보다 뒤, STARTS_AT보다 앞
      expect(Date.parse(opensBeforeRecipe)).toBeGreaterThan(NOW.getTime())
      expect(Date.parse(opensBeforeRecipe)).toBeLessThan(Date.parse(STARTS_AT))
      expect(await checkOf(dbWith([book({ valid_from: opensBeforeRecipe })]))).toBeNull()
    })

    it('컬렉션 공개 시각이 레시피 공개 시각과 같으면 통과하고, 1밀리초 늦으면 막는다', async () => {
      expect(await checkOf(dbWith([book({ valid_from: STARTS_AT })]))).toBeNull()
      const failure = await checkOf(dbWith([book({ valid_from: after(STARTS_AT, 1) })]))
      expect(failure?.reason).toBe(REASON)
    })

    it('슬롯 후보 배지가 안 열린 컬렉션 소속이면 막고, 배지·컬렉션 ID는 detail에만 있다', async () => {
      const failure = await checkOf(dbWith([book({ valid_from: after(STARTS_AT, DAY) })]))
      expect(failure?.reason).toBe(REASON)
      expect(failure?.reason).not.toContain(ITEM_BADGE)
      expect(failure?.reason).not.toContain(BOOK_ID)
      expect(failure?.reason).not.toContain(RECIPE_ID)
      expect(failure?.detail).toContain(ITEM_BADGE)
      expect(failure?.detail).toContain(BOOK_ID)
    })

    it('보상 배지가 안 열린 컬렉션 소속이어도 막는다', async () => {
      const failure = await checkOf(dbWith([book({ valid_from: after(STARTS_AT, DAY) })], { reward: true }), withReward)
      expect(failure?.reason).toBe(REASON)
      expect(failure?.detail).toContain(REWARD_BADGE)
    })

    it('비활성 컬렉션이면 공개 시각과 상관없이 막는다', async () => {
      const failure = await checkOf(dbWith([book({ is_active: false, valid_from: after(STARTS_AT, -DAY) })]))
      expect(failure?.reason).toBe(REASON)
    })

    it('컬렉션 행이 없으면 열리지 않은 것으로 본다', async () => {
      expect((await checkOf(dbWith([])))?.reason).toBe(REASON)
    })

    it('컬렉션이 없는 배지는 상관없고 컬렉션 표를 읽지도 않는다', async () => {
      const db = seededDb()
      db.tables.item_books = [book({ is_active: false })] // 어느 배지도 이 컬렉션 소속이 아니다
      expect(await checkOf(db)).toBeNull()
      expect(db.calls.some((call) => call.table === 'item_books')).toBe(false)
    })

    it('컬렉션을 읽지 못하면 통과시키지 않는다: 「등록 전 확인 중 DB를 읽지 못했어요」이고 원문은 detail에만 있다', async () => {
      const db = dbWith([book()])
      db.failIf = (call) => call.table === 'item_books'
      const failure = await checkOf(db)
      expect(failure?.reason).toBe('등록 전 확인 중 DB를 읽지 못했어요')
      expect(failure?.reason).not.toContain(DB_SECRET)
      expect(failure?.reason).not.toContain(BOOK_ID)
      expect(failure?.detail).toContain(DB_SECRET)
    })

    it('컬렉션 검사에 쓰는 배지 읽기가 실패해도 같다', async () => {
      const db = dbWith([book()])
      let badgeReads = 0
      // 첫 읽기(buildRecipeRow의 슬롯 후보)는 통과시키고 컬렉션 검사의 배지 읽기만 실패시킨다.
      db.failIf = (call) => call.table === 'badges' && ++badgeReads === 2
      const failure = await checkOf(db)
      expect(failure?.reason).toBe('등록 전 확인 중 DB를 읽지 못했어요')
      expect(failure?.detail).toContain(DB_SECRET)
    })
  })

  it('검사는 읽기만 하고 레시피 표는 건드리지 않는다', async () => {
    const db = seededDb()
    await checkOf(db, recipeItem({ slots: SLOTS, reward_badge_ids: [REWARD_BADGE] }))
    expect(db.calls.length).toBeGreaterThan(0)
    expect(db.calls.every((call) => call.op === 'select')).toBe(true)
    expect(db.calls.some((call) => call.table === 'combination_recipes')).toBe(false)
  })
})

describe('create — 정한 ID로 만든다', () => {
  it('정한 ID로 행과 슬롯을 만들고 같은 ID를 돌려준다. 종료 시각이 없으면 valid_until 칸이 없다', async () => {
    const db = seededDb()
    const value = prepared(recipeItem({ slots: SLOTS, reward_badge_ids: [REWARD_BADGE] }))
    const outcome = await handler.create(db.service, value, { now: NOW })

    expect(outcome).toEqual({ ok: true, value: { id: RECIPE_ID } })
    const inserts = db.calls.filter((call) => call.op === 'insert')
    expect(inserts.map((call) => call.table)).toEqual(['combination_recipes', 'combination_recipe_slots'])
    expect(db.tables.combination_recipes).toEqual([
      { id: RECIPE_ID, name: '가을 믹스', reward_points: 10, reward_badge_ids: [REWARD_BADGE], valid_from: STARTS_AT },
    ])
    expect(db.tables.combination_recipe_slots).toMatchObject([
      { recipe_id: RECIPE_ID, slot_order: 0, badge_type: 'item', allowed_badge_ids: [ITEM_BADGE] },
      { recipe_id: RECIPE_ID, slot_order: 1, badge_type: 'activity', allowed_badge_ids: [ACTIVITY_BADGE] },
    ])
    expect('valid_until' in (db.tables.combination_recipes[0] as Row)).toBe(false)
    // 만들 때도 `check`와 같이 슬롯·보상 배지를 다시 읽는다. 지우는 호출은 없다.
    expect(deletes(db).filter((call) => call.table === 'combination_recipes')).toEqual([])
  })

  it('종료 시각이 있으면 valid_until도 저장한다', async () => {
    const db = seededDb()
    const endsAt = after(LATER, 7 * DAY)
    await handler.create(db.service, prepared(recipeItem({}, {}, {}, { endsAt })), { now: NOW })
    expect(db.tables.combination_recipes[0]).toMatchObject({ valid_from: STARTS_AT, valid_until: endsAt })
  })

  it('행 insert가 오류를 받으면 같은 ID로 delete를 한 번 시도하고 사유에는 원문이 없다', async () => {
    const db = seededDb()
    // 오류 응답인데 행이 생긴 경우를 흉내 낸다.
    db.beforeRun = (call) => {
      if (call.op === 'insert' && call.table === 'combination_recipes') db.tables.combination_recipes.push({ id: RECIPE_ID })
    }
    db.failIf = (call) => call.op === 'insert' && call.table === 'combination_recipes'
    const outcome = await handler.create(db.service, prepared(), { now: NOW })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.reason).toBe('레시피를 만들지 못했어요')
    expect(outcome.failure.reason).not.toContain(DB_SECRET)
    expect(outcome.failure.reason).not.toContain(RECIPE_ID)
    expect(outcome.failure.detail).toContain(DB_SECRET)
    expect(deletes(db)).toHaveLength(1)
    expect(deletes(db)[0]).toMatchObject({ table: 'combination_recipes', filters: [['id', RECIPE_ID]] })
    expect(db.tables.combination_recipes).toEqual([])
  })

  it('슬롯 저장이 실패하면 행도 슬롯도 남지 않고 「레시피를 만들지 못했어요」다', async () => {
    const db = seededDb()
    db.failIf = (call) => call.op === 'insert' && call.table === 'combination_recipe_slots'
    const outcome = await handler.create(db.service, prepared(), { now: NOW })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.reason).toBe('레시피를 만들지 못했어요')
    expect(outcome.failure.reason).not.toContain(DB_SECRET)
    expect(outcome.failure.detail).toContain('생성 실패')
    expect(db.tables.combination_recipes).toEqual([])
    expect(db.tables.combination_recipe_slots).toEqual([])
    // 서버 함수의 지우기와 핸들러의 정리 delete가 모두 같은 ID다.
    for (const call of deletes(db).filter((entry) => entry.table === 'combination_recipes')) expect(call.filters).toEqual([['id', RECIPE_ID]])
  })

  it('정리 delete도 실패하면 결과를 detail에만 적고 사유는 그대로다', async () => {
    const db = seededDb()
    db.failIf = (call) => call.table === 'combination_recipes' && call.op !== 'select'
    const outcome = await handler.create(db.service, prepared(), { now: NOW })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.reason).toBe('레시피를 만들지 못했어요')
    expect(outcome.failure.detail).toContain('정리 delete 실패')
    expect(outcome.failure.detail).toContain(DB_SECRET)
    expect(deletes(db)).toHaveLength(1)
  })

  it('검증 오류(400)는 그 문장을 사유로 싣고 아무것도 쓰지 않으며 정리 delete도 하지 않는다', async () => {
    const db = new FakeDb() // 배지가 없다: check와 create 사이에 삭제된 경우
    const outcome = await handler.create(db.service, prepared(), { now: NOW })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.reason).toBe('슬롯에 지정한 후보 중 삭제되었거나 존재하지 않는 배지가 있어요. 다시 선택해 주세요.')
    expect(db.calls.filter((call) => call.op !== 'select')).toEqual([])
  })
})

describe('undo — 가리키는 배지를 확인한 뒤 ID로 지운다', () => {
  const REASON = '연결된 배지가 있거나 확인하지 못해 레시피를 지우지 않았어요'
  const seed = (db: FakeDb) => {
    db.tables.combination_recipes = [{ id: RECIPE_ID }, { id: EXISTING_RECIPE_ID }]
    db.tables.combination_recipe_slots = [
      { id: 's1', recipe_id: RECIPE_ID },
      { id: 's2', recipe_id: EXISTING_RECIPE_ID },
    ]
  }
  const firstSuccessBadge = (recipeId: string, over: Row = {}) => ({
    id: FIRST_SUCCESS_BADGE,
    deleted_at: null,
    condition_json: { recipe_first_success: { recipe_id: recipeId } },
    ...over,
  })

  it('이 레시피를 가리키는 배지(가장 먼저 성공)가 있으면 지우지 않고 고정 사유를 돌려준다. 배지·레시피 ID는 reason에 없다', async () => {
    const db = new FakeDb()
    seed(db)
    db.tables.badges = [firstSuccessBadge(RECIPE_ID)]
    const failure = await handler.undo(db.service, RECIPE_ID)

    expect(failure?.reason).toBe(REASON)
    expect(failure?.reason).not.toContain(RECIPE_ID)
    expect(failure?.reason).not.toContain(FIRST_SUCCESS_BADGE)
    expect(failure?.detail).toContain('1개')
    expect(deletes(db)).toEqual([])
    expect(recipeIds(db)).toEqual([RECIPE_ID, EXISTING_RECIPE_ID])
  })

  it('참조를 읽지 못하면 확인 없이 지우지 않고 원문은 detail에만 있다', async () => {
    const db = new FakeDb()
    seed(db)
    db.failIf = (call) => call.table === 'badges'
    const failure = await handler.undo(db.service, RECIPE_ID)

    expect(failure?.reason).toBe(REASON)
    expect(failure?.reason).not.toContain(DB_SECRET)
    expect(failure?.detail).toContain(DB_SECRET)
    expect(deletes(db)).toEqual([])
    expect(recipeIds(db)).toHaveLength(2)
  })

  it('가리키는 배지가 없으면 ID로 지우고 슬롯도 함께 사라지며 다른 레시피는 건드리지 않는다. 참조 확인이 지우기보다 먼저다', async () => {
    const db = new FakeDb()
    seed(db)
    // 다른 레시피를 가리키는 배지와 삭제된 배지는 상관없다.
    db.tables.badges = [firstSuccessBadge(EXISTING_RECIPE_ID), firstSuccessBadge(RECIPE_ID, { id: uid(8), deleted_at: '2026-10-01T00:00:00.000Z' })]
    expect(await handler.undo(db.service, RECIPE_ID)).toBeNull()

    expect(deletes(db)).toHaveLength(1)
    expect(deletes(db)[0]).toMatchObject({ table: 'combination_recipes', filters: [['id', RECIPE_ID]] })
    expect(recipeIds(db)).toEqual([EXISTING_RECIPE_ID])
    expect((db.tables.combination_recipe_slots as Row[]).map((slot) => slot.id)).toEqual(['s2'])
    const order = db.calls.map((call) => `${call.table}:${call.op}`)
    expect(order.indexOf('badges:select')).toBeLessThan(order.indexOf('combination_recipes:delete'))
  })

  it('배지가 지워진 뒤에는 레시피를 지울 수 있다(그래서 되돌림은 배지가 먼저다)', async () => {
    const db = new FakeDb()
    seed(db)
    db.tables.badges = [firstSuccessBadge(RECIPE_ID)]
    expect((await handler.undo(db.service, RECIPE_ID))?.reason).toBe(REASON)
    db.tables.badges = []
    expect(await handler.undo(db.service, RECIPE_ID)).toBeNull()
    expect(recipeIds(db)).toEqual([EXISTING_RECIPE_ID])
  })

  it('공개 시각이 지난 레시피도 지운다: 시각 조건을 걸지 않는다(멈춘 준비중 정리)', async () => {
    const db = new FakeDb()
    db.tables.combination_recipes = [{ id: RECIPE_ID, valid_from: PAST, valid_until: null }]
    expect(await handler.undo(db.service, RECIPE_ID)).toBeNull()
    expect(deletes(db)[0].filters).toEqual([['id', RECIPE_ID]])
    expect(db.tables.combination_recipes).toEqual([])
  })

  it('delete 오류는 「레시피를 지우지 못했어요」이고 원문은 detail에만 있다', async () => {
    const db = new FakeDb()
    seed(db)
    db.failIf = (call) => call.op === 'delete'
    const failure = await handler.undo(db.service, RECIPE_ID)

    expect(failure?.reason).toBe('레시피를 지우지 못했어요')
    expect(failure?.reason).not.toContain(DB_SECRET)
    expect(failure?.reason).not.toContain(RECIPE_ID)
    expect(failure?.detail).toContain(DB_SECRET)
  })
})

describe('cancel — 공개 전에만 지운다', () => {
  const CANCEL_REFERENCED = '가장 먼저 성공 배지가 이 레시피를 가리키고 있거나 확인하지 못해 지우지 않았어요'
  const seed = (db: FakeDb, recipe: Row = {}) => {
    db.tables.combination_recipes = [
      { id: RECIPE_ID, valid_from: LATER, valid_until: null, ...recipe },
      { id: EXISTING_RECIPE_ID, valid_from: LATER, valid_until: null },
    ]
    db.tables.combination_recipe_slots = [
      { id: 's1', recipe_id: RECIPE_ID },
      { id: 's2', recipe_id: EXISTING_RECIPE_ID },
    ]
  }
  const firstSuccessBadge = { id: FIRST_SUCCESS_BADGE, deleted_at: null, condition_json: { recipe_first_success: { recipe_id: RECIPE_ID } } }
  const cancel = (db: FakeDb) => handler.cancel(db.service, RECIPE_ID, { now: NOW })

  it('공개 전이고 가리키는 배지가 없으면 ID로 지우고 슬롯도 사라지며 다른 레시피는 건드리지 않는다. 지울 때 공개 시각 조건을 건다', async () => {
    const db = new FakeDb()
    seed(db)
    expect(await cancel(db)).toEqual({ ok: true, missing: false })

    expect(recipeIds(db)).toEqual([EXISTING_RECIPE_ID])
    expect((db.tables.combination_recipe_slots as Row[]).map((slot) => slot.id)).toEqual(['s2'])
    expect(deletes(db)).toHaveLength(1)
    expect(deletes(db)[0]).toMatchObject({ table: 'combination_recipes', filters: [['id', RECIPE_ID], ['valid_from >', NOW.toISOString()]] })
    // 읽기 → 참조 확인 → 지우기 순서
    const order = db.calls.map((call) => `${call.table}:${call.op}`)
    expect(order.indexOf('combination_recipes:select')).toBeLessThan(order.indexOf('badges:select'))
    expect(order.indexOf('badges:select')).toBeLessThan(order.indexOf('combination_recipes:delete'))
  })

  it('행이 없으면 밖에서 지워진 것이라 성공(missing)이고 아무것도 쓰지 않으며 참조도 읽지 않는다', async () => {
    const db = new FakeDb()
    expect(await cancel(db)).toEqual({ ok: true, missing: true })
    expect(db.calls.filter((call) => call.op !== 'select')).toEqual([])
    expect(db.calls.some((call) => call.table === 'badges')).toBe(false)
  })

  it.each([
    ['공개 시각이 지났다', { valid_from: PAST }],
    ['공개 시각이 정확히 지금이다', { valid_from: NOW.toISOString() }],
    ['공개 시각이 비었다(바로 공개)', { valid_from: null }],
    ['공개됐다가 종료됐다', { valid_from: PAST, valid_until: after(PAST, 1000) }],
  ])('%s: published이고 지우지 않으며 참조도 읽지 않는다', async (_label, recipe) => {
    const db = new FakeDb()
    seed(db, recipe)
    const result = await cancel(db)

    expect(result).toEqual({ ok: false, code: 'published', failure: { reason: '공개 시각이 지나 취소할 수 없어요' } })
    expect(deletes(db)).toEqual([])
    expect(recipeIds(db)).toEqual([RECIPE_ID, EXISTING_RECIPE_ID])
    expect(db.calls.some((call) => call.table === 'badges')).toBe(false)
  })

  it('가장 먼저 성공 배지가 이 레시피를 가리키면 referenced이고 지우지 않는다. 배지·레시피 ID는 reason에 없다', async () => {
    const db = new FakeDb()
    seed(db)
    db.tables.badges = [firstSuccessBadge]
    const result = await cancel(db)

    expect(result).toMatchObject({ ok: false, code: 'referenced', failure: { reason: CANCEL_REFERENCED } })
    if (result.ok) throw new Error('실패여야 해요')
    expect(result.failure.reason).not.toContain(RECIPE_ID)
    expect(result.failure.reason).not.toContain(FIRST_SUCCESS_BADGE)
    expect(deletes(db)).toEqual([])
    expect(recipeIds(db)).toEqual([RECIPE_ID, EXISTING_RECIPE_ID])
  })

  it('삭제된 배지가 가리키는 건 참조가 아니다', async () => {
    const db = new FakeDb()
    seed(db)
    db.tables.badges = [{ ...firstSuccessBadge, deleted_at: '2026-10-01T00:00:00.000Z' }]
    expect(await cancel(db)).toEqual({ ok: true, missing: false })
  })

  it('참조를 읽지 못하면 지우지 않고 error다. DB 오류 원문은 detail에도 reason에도 싣지 않고 서버 함수의 쉬운 문장만 detail에 남는다', async () => {
    const db = new FakeDb()
    seed(db)
    db.failIf = (call) => call.table === 'badges'
    const result = await cancel(db)

    expect(result).toMatchObject({ ok: false, code: 'error', failure: { reason: '레시피를 지우지 못했어요' } })
    if (result.ok) throw new Error('실패여야 해요')
    expect(result.failure.reason).not.toContain(DB_SECRET)
    expect(result.failure.reason).not.toContain(RECIPE_ID)
    expect(result.failure.detail).not.toContain(DB_SECRET)
    expect(deletes(db)).toEqual([])
    expect(recipeIds(db)).toEqual([RECIPE_ID, EXISTING_RECIPE_ID])
  })

  it('읽은 뒤 공개 시각이 지나면(삭제 경합) 지운 행이 없고, 다시 읽어 공개됐으니 published다', async () => {
    const db = new FakeDb()
    seed(db)
    db.beforeRun = (call) => {
      if (call.op === 'delete') (db.tables.combination_recipes[0] as Row).valid_from = PAST
    }
    const result = await cancel(db)

    expect(result).toEqual({ ok: false, code: 'published', failure: { reason: '공개 시각이 지나 취소할 수 없어요' } })
    expect(recipeIds(db)).toEqual([RECIPE_ID, EXISTING_RECIPE_ID])
  })

  it('지우려는 사이 다른 곳에서 먼저 지우면(삭제 경합) 행이 없으니 missing이다', async () => {
    const db = new FakeDb()
    seed(db)
    db.beforeRun = (call) => {
      if (call.op === 'delete') db.tables.combination_recipes = (db.tables.combination_recipes as Row[]).filter((row) => row.id !== RECIPE_ID)
    }
    expect(await cancel(db)).toEqual({ ok: true, missing: true })
    expect(recipeIds(db)).toEqual([EXISTING_RECIPE_ID])
  })

  it('참조 때문에 막힌 뒤 그사이 공개되면 published다. 그사이 지워졌으면 missing이다', async () => {
    const published = new FakeDb()
    seed(published)
    published.tables.badges = [firstSuccessBadge]
    let reads = 0
    published.beforeRun = (call) => {
      // 두 번째 레시피 읽기(409 뒤 다시 읽기)에서는 이미 공개돼 있다.
      if (call.table === 'combination_recipes' && call.op === 'select' && ++reads === 2) (published.tables.combination_recipes[0] as Row).valid_from = PAST
    }
    expect(await cancel(published)).toMatchObject({ ok: false, code: 'published' })

    const gone = new FakeDb()
    seed(gone)
    gone.tables.badges = [firstSuccessBadge]
    let goneReads = 0
    gone.beforeRun = (call) => {
      if (call.table === 'combination_recipes' && call.op === 'select' && ++goneReads === 2) gone.tables.combination_recipes = []
    }
    expect(await cancel(gone)).toEqual({ ok: true, missing: true })
  })

  it.each([
    ['처음 읽기', (call: { op: string; table: string }) => call.table === 'combination_recipes' && call.op === 'select'],
    ['지우기', (call: { op: string; table: string }) => call.table === 'combination_recipes' && call.op === 'delete'],
  ])('%s 오류는 error이고 「레시피를 지우지 못했어요」다. DB 오류 원문·레시피 ID는 reason에 없다', async (_label, fails) => {
    const db = new FakeDb()
    seed(db)
    db.failIf = fails
    const result = await cancel(db)

    expect(result).toMatchObject({ ok: false, code: 'error', failure: { reason: '레시피를 지우지 못했어요' } })
    if (result.ok) throw new Error('실패여야 해요')
    expect(result.failure.reason).not.toContain(DB_SECRET)
    expect(result.failure.reason).not.toContain(RECIPE_ID)
    expect(recipeIds(db)).toEqual([RECIPE_ID, EXISTING_RECIPE_ID])
  })

  it('지운 행이 없고 서버 함수의 다시 읽기마저 실패하면 error다', async () => {
    const db = new FakeDb()
    seed(db)
    let selects = 0
    db.beforeRun = (call) => {
      if (call.op === 'delete') (db.tables.combination_recipes[0] as Row).valid_from = PAST
    }
    db.failIf = (call) => call.table === 'combination_recipes' && call.op === 'select' && ++selects === 2
    const result = await cancel(db)

    expect(result).toMatchObject({ ok: false, code: 'error', failure: { reason: '레시피를 지우지 못했어요' } })
  })

  it('참조로 막힌 뒤 다시 읽기가 실패하면 error다', async () => {
    const db = new FakeDb()
    seed(db)
    db.tables.badges = [firstSuccessBadge]
    let selects = 0
    db.failIf = (call) => call.table === 'combination_recipes' && call.op === 'select' && ++selects === 2
    const result = await cancel(db)

    expect(result).toMatchObject({ ok: false, code: 'error', failure: { reason: '레시피를 지우지 못했어요' } })
    if (result.ok) throw new Error('실패여야 해요')
    expect(result.failure.detail).toContain(DB_SECRET)
  })
})

describe('observe — 레시피의 지금 상태를 읽는다', () => {
  const STARTS = '2026-10-05T00:00:00.000Z' // NOW(10/5 12:00 KST = 03:00Z)보다 앞
  const ENDS = '2026-10-12T00:00:00.000Z' // NOW보다 뒤
  const seed = (db: FakeDb, recipe: Row = {}) => {
    db.tables.combination_recipes = [
      { id: RECIPE_ID, valid_from: STARTS, valid_until: ENDS, ...recipe },
      { id: EXISTING_RECIPE_ID, valid_from: LATER, valid_until: null },
    ]
  }
  const observe = (db: FakeDb, now: Date = NOW) => handler.observe(db.service, RECIPE_ID, { now })

  it('공개 시각이 지나고 종료 전이면 공개 중이다. 시각은 레시피의 값 그대로 돌려주고 아무것도 쓰지 않는다. 비활성 칸이 없어 inactive는 false다', async () => {
    const db = new FakeDb()
    seed(db)
    expect(await observe(db)).toEqual({ status: 'present', published: true, ended: false, startsAt: STARTS, endsAt: ENDS, inactive: false })
    expect(db.calls.filter((call) => call.op !== 'select')).toEqual([])
    expect(db.calls.map((call) => call.table)).toEqual(['combination_recipes'])
  })

  it('공개 시각 전이면 공개 중이 아니고 종료도 아니다. 종료 시각이 어떻든 공개 전이 앞선다', async () => {
    const db = new FakeDb()
    seed(db, { valid_from: LATER, valid_until: after(LATER, DAY) })
    expect(await observe(db)).toMatchObject({ status: 'present', published: false, ended: false, inactive: false })
  })

  it('공개 시각이 정확히 지금이면 공개 중이다', async () => {
    const db = new FakeDb()
    seed(db, { valid_from: NOW.toISOString() })
    expect(await observe(db)).toMatchObject({ status: 'present', published: true, ended: false })
  })

  it('종료 시각이 정확히 지금이면 종료다(공개 판정은 종료 시각 그 순간부터 끝이다)', async () => {
    const db = new FakeDb()
    seed(db, { valid_until: NOW.toISOString() })
    expect(await observe(db)).toMatchObject({ status: 'present', published: false, ended: true })
    expect(await observe(db, new Date(NOW.getTime() - 1))).toMatchObject({ status: 'present', published: true, ended: false })
  })

  it('종료 시각이 없으면(상시) 종료되지 않고 endsAt은 null이다', async () => {
    const db = new FakeDb()
    seed(db, { valid_until: null })
    expect(await observe(db, new Date('2030-01-01T00:00:00.000Z'))).toEqual({
      status: 'present',
      published: true,
      ended: false,
      startsAt: STARTS,
      endsAt: null,
      inactive: false,
    })
  })

  it('공개 시각이 비었으면(바로 공개) 공개 중이고 startsAt은 null이다', async () => {
    const db = new FakeDb()
    seed(db, { valid_from: null, valid_until: null })
    expect(await observe(db)).toEqual({ status: 'present', published: true, ended: false, startsAt: null, endsAt: null, inactive: false })
  })

  it('행이 없으면 missing이다', async () => {
    const db = new FakeDb()
    expect(await observe(db)).toEqual({ status: 'missing' })
  })

  it('읽지 못하면 error이고 원문은 detail에만 있다', async () => {
    const db = new FakeDb()
    seed(db)
    db.failIf = (call) => call.table === 'combination_recipes'
    const result = await observe(db)

    expect(result.status).toBe('error')
    if (result.status !== 'error') throw new Error('error여야 해요')
    expect(result.detail).toContain(DB_SECRET)
  })

  it.each([
    ['종료 시각', { valid_until: 'not-a-date' }],
    ['공개 시각', { valid_from: 'not-a-date' }],
  ])('%s을 읽을 수 없으면 판정하지 않고 error다(공개 전·종료로 기울어 상태가 바뀌는 것을 막는다)', async (_label, recipe) => {
    const db = new FakeDb()
    seed(db, recipe)
    expect(await observe(db)).toEqual({ status: 'error', detail: '레시피 시각을 읽을 수 없어요' })
  })
})
