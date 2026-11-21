/**
 * 홈피드 카드 핸들러 (티켓 20261002_1255, 상위 20260930_1500 ④-a). 가정 1~6은 티켓 「착수 전에 정한 것」 번호다.
 *
 * - prepare: 페이로드의 `id`·`pattern_no`·종료 시각 보충·`cover_image_url`·연결 칸, 형식 오류 문장과 「외 N건」
 * - check: 검사 라벨마다 고정 문장(가정 3 표), DB 오류·기존 카드 ID는 `reason`에 없다
 * - create: insert 칸·같은 ID 반환(가정 4), 오류 때 정리 delete 한 번과 원문 비노출
 * - undo: 참조가 있으면 지우지 않고, 없으면 ID로 지운다(가정 5). 오류 원문 비노출
 * - cancel(티켓 20261002_1256 가정 2): 없음·공개됨·기록 있음·삭제 경합·오류 비노출
 * - observe(티켓 20261002_1813 가정 2): 없음·공개 판정(양 끝 포함)·종료·비활성·쓰기 없음·읽기 실패 비노출
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ override: null as null | (() => unknown) }))

// 표에 없는 라벨의 실패를 만들기 위해 DB 검사 결과를 바꿔 끼울 수 있게 한다. 값이 없으면 실제 검사를 그대로 부른다.
vi.mock('@/lib/admin/registerChecks/homeFeed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/registerChecks/homeFeed')>()
  return {
    ...actual,
    runHomeFeedDbChecks: (args: Parameters<typeof actual.runHomeFeedDbChecks>[0]) => (h.override ? h.override() : actual.runHomeFeedDbChecks(args)),
  }
})

import { asRegisterChecksClient, RESOURCE_KEY_BY_KIND, type CoverColorsFieldsFn, type ExecuteLinkedIds } from '../handlers'
import { HOME_FEED_CARD_HANDLER as handler } from '../homeFeedCard'
import { FEED_COLOR_KEYS } from '@/lib/today/feedConstants'
import { DEFAULT_FEED_PALETTE } from '@/lib/today/feedAssign'
import { violatesImageColorRule } from '@/lib/today/feedColorRules'
import { DB_SECRET, FakeDb, type Row } from './fakeDb'
import { LATER, NOW, makeItem } from './fixtures'

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CARD_ID = uid(1)
const EXISTING_CARD_ID = uid(2)
const MISSION_ID = uid(3)
const BOOK_ID = uid(4)
const BADGE_ID = uid(5)
const RANKING_ID = uid(6)
const RECIPE_ID = uid(7)
const ACTOR = 'admin-1'
/** `LATER`(10/10 09:00 KST)를 등록 형식으로 바꾼 시작 일시. */
const STARTS_AT = new Date(LATER).toISOString()
/** 공개한 날의 끝(10/10 23:59:59.999 KST). */
const ENDS_AT = '2026-10-10T14:59:59.999Z'

type Raw = Record<string, unknown>

/** 검사를 통과하는 카드 항목. `resource`·`original`·`copy`는 칸 단위로 덮는다. */
function cardItem(resource: Raw = {}, original: Raw = {}, copy: Raw = {}) {
  return makeItem({
    key: 'card',
    kind: 'home_feed_card',
    original: { shape: 'hero', exposure_tags: ['all'], copy: { title: '가을 아침 러닝', ...copy }, ...original },
    resource: { template_type: 'drop_alert', ...resource },
  })
}

function prepared(item = cardItem(), linkedIds: ExecuteLinkedIds = {}) {
  const outcome = handler.prepare(item, { id: CARD_ID, actorId: ACTOR, linkedIds, now: NOW })
  if (!outcome.ok) throw new Error(`prepare 실패: ${outcome.failure.reason}`)
  return outcome.value
}

const checkOf = (db: FakeDb, item = cardItem(), linkedIds: ExecuteLinkedIds = {}) => handler.check(asRegisterChecksClient(db.service), prepared(item, linkedIds), { now: NOW })
const deletes = (db: FakeDb) => db.calls.filter((call) => call.op === 'delete')

beforeEach(() => {
  h.override = null
})

describe('핸들러 정의', () => {
  it('종류·자원 키·정한 ID 먼저 만들기가 계약대로다', () => {
    expect(handler.kind).toBe('home_feed_card')
    expect(handler.resourceKey).toBe(RESOURCE_KEY_BY_KIND.home_feed_card)
    expect(handler.resourceKey).toBe('today_card_id')
    expect(handler.idFirst).toBe(true)
  })
})

describe('prepare', () => {
  it('정한 ID·작성자·보충한 종료 시각·패턴 번호·대표 이미지가 페이로드에 들어간다', () => {
    const value = prepared(cardItem({ cover_image_url: 'https://cdn.example.com/card.webp' }, { pattern_no: 'P07' }))
    expect(value.id).toBe(CARD_ID)
    expect(value.payload).toMatchObject({
      id: CARD_ID,
      title: '가을 아침 러닝',
      template_type: 'drop_alert',
      shape: 'hero',
      exposure_tags: ['all'],
      starts_at: STARTS_AT,
      ends_at: ENDS_AT,
      pattern_no: 'P07',
      cover_image_url: 'https://cdn.example.com/card.webp',
      image_source: null,
      created_by: ACTOR,
      is_active: true,
    })
    expect(value.linkFields).toEqual([])
  })

  it('대표 이미지·패턴 번호가 없으면 null이다', () => {
    const value = prepared()
    expect(value.payload).toMatchObject({ cover_image_url: null, pattern_no: null, image_source: null })
  })

  it('연결 칸: 연결로 채운 ID가 페이로드에 들어가고 linkFields·linkedIds가 그대로 남는다', () => {
    const linkedIds = { mission_id: MISSION_ID, badge_ids: [BADGE_ID] }
    const value = prepared(cardItem({ template_type: 'progress_nudge' }), linkedIds)
    expect(value.payload).toMatchObject({ mission_id: MISSION_ID, badge_ids: [BADGE_ID] })
    expect([...value.linkFields].sort()).toEqual(['badge_ids', 'mission_id'])
    expect(value.linkedIds).toBe(linkedIds)
  })

  it('경고는 막지 않고 그대로 돌려준다', () => {
    const value = prepared(cardItem({ mood: 'calm' }))
    expect(value.warnings.map((issue) => issue.path)).toEqual(['resource.mood'])
  })

  it('형식 오류가 하나면 「카드 형식이 맞지 않아요: {오류 문장}」이고 DB 오류 원문은 없다', () => {
    const outcome = handler.prepare(cardItem({}, { shape: undefined }), { id: CARD_ID, actorId: ACTOR, linkedIds: {}, now: NOW })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.reason).toMatch(/^카드 형식이 맞지 않아요: card\.shape: /)
    expect(outcome.failure.reason).not.toMatch(/외 \d+건/)
    expect(outcome.failure.detail).toContain('shape')
  })

  it('형식 오류가 둘 이상이면 첫 문장만 싣고 끝에 「 (외 N건)」을 붙인다', () => {
    const outcome = handler.prepare(cardItem({ template_type: 'nope' }, { shape: undefined }, { title: '' }), { id: CARD_ID, actorId: ACTOR, linkedIds: {}, now: NOW })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    const errors = outcome.failure.detail?.split(' / ') ?? []
    expect(errors.length).toBeGreaterThanOrEqual(3)
    expect(outcome.failure.reason).toMatch(new RegExp(`^카드 형식이 맞지 않아요: .+ \\(외 ${errors.length - 1}건\\)$`))
    // 첫 문장 하나만 싣는다
    expect(outcome.failure.reason).not.toContain(errors[1])
  })

  it('다른 종류의 항목은 변환 오류로 막는다', () => {
    const outcome = handler.prepare(makeItem({ key: 'm', kind: 'mission' }), { id: CARD_ID, actorId: ACTOR, linkedIds: {}, now: NOW })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.failure.reason).toMatch(/^카드 형식이 맞지 않아요: kind: /)
  })
})

describe('check — 가정 3 표의 고정 문장', () => {
  it('모두 있으면 통과하고 검사한 칸은 title·starts_at·연결 칸이다', async () => {
    const db = new FakeDb()
    db.tables.missions = [{ id: MISSION_ID }]
    db.tables.item_books = [{ id: BOOK_ID }]
    db.tables.badges = [{ id: BADGE_ID, deleted_at: null }]
    db.tables.ranking_modes = [{ id: RANKING_ID }]
    db.tables.combination_recipes = [{ id: RECIPE_ID, valid_from: '2099-01-01T00:00:00.000Z', valid_until: null }] // 공개 전 레시피도 가리킬 수 있다
    expect(await checkOf(db, cardItem({ template_type: 'mission_spotlight', mission_id: MISSION_ID }))).toBeNull()
    expect(await checkOf(db, cardItem({ template_type: 'itembook_milestone', item_book_id: BOOK_ID }))).toBeNull()
    expect(await checkOf(db, cardItem({ template_type: 'badge_spotlight', badge_ids: [BADGE_ID] }))).toBeNull()
    expect(await checkOf(db, cardItem({ template_type: 'ranking_board', ranking_mode_id: RANKING_ID }))).toBeNull()
    expect(await checkOf(db, cardItem({ template_type: 'recipe_reveal', recipe_id: RECIPE_ID }))).toBeNull()
    expect(await checkOf(db, cardItem({ template_type: 'content_intro', target_href: `/missions/${MISSION_ID}` }))).toBeNull() // 연결 칸 없이 이동 주소만으로 통과한다(티켓 20261101_2054)
    const dup = db.calls.find((call) => call.table === 'today_cards')
    expect(dup?.filters).toEqual([
      ['title', '가을 아침 러닝'],
      ['starts_at', STARTS_AT],
    ])
  })

  it('제목·시작 일시 중복 → 「같은 제목·같은 공개 시각의 카드가 이미 있어요」이고 기존 카드 ID는 detail에만 있다', async () => {
    const db = new FakeDb()
    db.tables.today_cards = [{ id: EXISTING_CARD_ID, title: '가을 아침 러닝', starts_at: STARTS_AT }]
    const failure = await checkOf(db)
    expect(failure?.reason).toBe('같은 제목·같은 공개 시각의 카드가 이미 있어요')
    expect(failure?.reason).not.toContain(EXISTING_CARD_ID)
    expect(failure?.reason).not.toContain(CARD_ID)
    expect(failure?.detail).toContain(EXISTING_CARD_ID)
  })

  it('같은 제목이어도 시작 일시가 다르면 통과한다', async () => {
    const db = new FakeDb()
    db.tables.today_cards = [{ id: EXISTING_CARD_ID, title: '가을 아침 러닝', starts_at: '2026-10-11T00:00:00.000Z' }]
    expect(await checkOf(db)).toBeNull()
  })

  it.each([
    ['미션 존재', cardItem({ template_type: 'mission_spotlight', mission_id: MISSION_ID }), '연결한 미션을 찾을 수 없어요', MISSION_ID],
    ['컬렉션 존재', cardItem({ template_type: 'itembook_milestone', item_book_id: BOOK_ID }), '연결한 컬렉션을 찾을 수 없어요', BOOK_ID],
    ['배지 존재', cardItem({ template_type: 'badge_spotlight', badge_ids: [BADGE_ID] }), '연결한 배지가 없거나 삭제됐어요', BADGE_ID],
    ['랭킹 모드 존재', cardItem({ template_type: 'ranking_board', ranking_mode_id: RANKING_ID }), '연결한 랭킹 모드를 찾을 수 없어요', RANKING_ID],
    ['레시피 존재', cardItem({ template_type: 'recipe_reveal', recipe_id: RECIPE_ID }), '연결한 레시피를 찾을 수 없어요', RECIPE_ID],
  ])('%s 실패 → 「%s」이고 칼럼 이름·ID는 detail에만 있다', async (_label, item, reason, missingId) => {
    const db = new FakeDb()
    const failure = await checkOf(db, item)
    expect(failure?.reason).toBe(reason)
    expect(failure?.reason).not.toMatch(/_id|ids/)
    expect(failure?.reason).not.toContain(missingId)
    expect(failure?.detail).toContain(missingId)
  })

  it('삭제된 배지(deleted_at이 있음)는 없는 것으로 본다', async () => {
    const db = new FakeDb()
    db.tables.badges = [{ id: BADGE_ID, deleted_at: '2026-10-01T00:00:00.000Z' }]
    const failure = await checkOf(db, cardItem({ template_type: 'badge_spotlight', badge_ids: [BADGE_ID] }))
    expect(failure?.reason).toBe('연결한 배지가 없거나 삭제됐어요')
  })

  it('연결로 채운 칸은 같은 실행에서 만들 ID라 존재 확인에서 뺀다', async () => {
    const db = new FakeDb() // 미션·배지 테이블이 비어 있어도 통과한다
    const item = cardItem({ template_type: 'progress_nudge' })
    expect(await checkOf(db, item, { mission_id: MISSION_ID, badge_ids: [BADGE_ID] })).toBeNull()
    expect(db.calls.map((call) => call.table)).toEqual(['today_cards'])

    // 레시피도 같다: 연결로 채운 recipe_id는 같은 실행에서 만들 레시피라 읽지 않는다(티켓 20261006_1218)
    const recipeDb = new FakeDb()
    expect(await checkOf(recipeDb, cardItem({ template_type: 'recipe_reveal' }), { recipe_id: RECIPE_ID })).toBeNull()
    expect(recipeDb.calls.map((call) => call.table)).toEqual(['today_cards'])
  })

  it('DB를 읽지 못하면 라벨과 상관없이 「등록 전 확인 중 DB를 읽지 못했어요」이고 원문은 detail에만 있다', async () => {
    const db = new FakeDb()
    db.failIf = (call) => call.table === 'today_cards' && call.op === 'select'
    const failure = await checkOf(db)
    expect(failure?.reason).toBe('등록 전 확인 중 DB를 읽지 못했어요')
    expect(failure?.reason).not.toContain(DB_SECRET)
    expect(failure?.reason).not.toContain(CARD_ID)
    expect(failure?.detail).toContain(DB_SECRET)

    const other = new FakeDb()
    other.failIf = (call) => call.table === 'missions'
    const otherFailure = await checkOf(other, cardItem({ template_type: 'mission_spotlight', mission_id: MISSION_ID }))
    expect(otherFailure?.reason).toBe('등록 전 확인 중 DB를 읽지 못했어요')
    expect(otherFailure?.detail).toContain(DB_SECRET)
  })

  it('표에 없는 라벨은 「등록 전 확인을 통과하지 못했어요」다', async () => {
    h.override = () => ({
      checks: [{ label: '새 검사', status: '실패', detail: '내부 사정 SECRET_LABEL_DETAIL' }],
      errors: ['새 검사: 내부 사정 SECRET_LABEL_DETAIL'],
    })
    const failure = await checkOf(new FakeDb())
    expect(failure?.reason).toBe('등록 전 확인을 통과하지 못했어요')
    expect(failure?.detail).toContain('SECRET_LABEL_DETAIL')
  })

  it('처음 실패한 검사의 문장을 쓴다', async () => {
    const db = new FakeDb()
    db.tables.today_cards = [{ id: EXISTING_CARD_ID, title: '가을 아침 러닝', starts_at: STARTS_AT }]
    const failure = await checkOf(db, cardItem({ template_type: 'mission_spotlight', mission_id: MISSION_ID }))
    expect(failure?.reason).toBe('같은 제목·같은 공개 시각의 카드가 이미 있어요')
    expect(failure?.detail).toContain(EXISTING_CARD_ID)
    expect(failure?.detail).toContain(MISSION_ID)
  })
})

describe('create — 정한 ID로 만든다', () => {
  it('insert 페이로드의 id는 prepared.id이고 같은 ID를 돌려준다', async () => {
    const db = new FakeDb()
    const value = prepared(cardItem({ cover_image_url: 'https://cdn.example.com/card.webp' }, { pattern_no: 'P07' }))
    const outcome = await handler.create(db.service, value, { now: NOW })

    expect(outcome).toEqual({ ok: true, value: { id: CARD_ID } })
    const inserts = db.calls.filter((call) => call.op === 'insert')
    expect(inserts).toHaveLength(1)
    expect(inserts[0].table).toBe('today_cards')
    expect(inserts[0].payload).toBe(value.payload)
    expect(db.tables.today_cards).toHaveLength(1)
    expect(db.tables.today_cards[0]).toMatchObject({
      id: CARD_ID,
      title: '가을 아침 러닝',
      starts_at: STARTS_AT,
      ends_at: ENDS_AT,
      pattern_no: 'P07',
      cover_image_url: 'https://cdn.example.com/card.webp',
      created_by: ACTOR,
      is_active: true,
    })
    expect(deletes(db)).toEqual([])
  })

  it('insert가 오류를 받으면 같은 ID로 delete를 한 번 시도하고 사유에는 원문이 없다', async () => {
    const db = new FakeDb()
    // 오류 응답인데 행이 생긴 경우를 흉내 낸다.
    db.beforeRun = (call) => {
      if (call.op === 'insert') db.tables.today_cards.push({ id: CARD_ID })
    }
    db.failIf = (call) => call.op === 'insert'
    const outcome = await handler.create(db.service, prepared(), { now: NOW })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.reason).toBe('카드를 만들지 못했어요')
    expect(outcome.failure.reason).not.toContain(DB_SECRET)
    expect(outcome.failure.reason).not.toContain(CARD_ID)
    expect(outcome.failure.detail).toContain(DB_SECRET)
    expect(deletes(db)).toHaveLength(1)
    expect(deletes(db)[0]).toMatchObject({ table: 'today_cards', filters: [['id', CARD_ID]] })
    expect(db.tables.today_cards).toEqual([])
  })

  it('정리 delete도 실패하면 결과를 detail에만 적고 사유는 그대로다', async () => {
    const db = new FakeDb()
    db.failIf = (call) => call.table === 'today_cards' && call.op !== 'select'
    const outcome = await handler.create(db.service, prepared(), { now: NOW })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.reason).toBe('카드를 만들지 못했어요')
    expect(outcome.failure.detail).toContain('정리 delete 실패')
    expect(outcome.failure.detail).toContain(DB_SECRET)
    expect(deletes(db)).toHaveLength(1)
  })
})

describe('create — 커버 이미지의 대표 색 저장(티켓 20261121_1724)', () => {
  const COVER = 'https://cdn.example.com/card.webp'

  it('실행 뼈대가 넘긴 추출 함수의 결과를 insert 행에 싣고, 추출 함수는 커버 주소로 부른다', async () => {
    const db = new FakeDb()
    const extract = vi.fn<CoverColorsFieldsFn>(async () => ({ cover_colors: ['#ff8800', '#2244aa'] }))
    const outcome = await handler.create(db.service, prepared(cardItem({ cover_image_url: COVER })), { now: NOW, coverColorsFields: extract })
    expect(outcome).toEqual({ ok: true, value: { id: CARD_ID } })
    expect(extract).toHaveBeenCalledWith(COVER)
    expect(db.tables.today_cards[0]).toMatchObject({ id: CARD_ID, cover_image_url: COVER, cover_colors: ['#ff8800', '#2244aa'] })
  })

  it('색이 없는 이미지([])도 «뽑았는데 없음»으로 싣는다', async () => {
    const db = new FakeDb()
    await handler.create(db.service, prepared(cardItem({ cover_image_url: COVER })), { now: NOW, coverColorsFields: async () => ({ cover_colors: [] }) })
    expect(db.tables.today_cards[0].cover_colors).toEqual([])
  })

  it('추출이 빈 결과(실패·동영상·저장소 밖)면 cover_colors 없이 만든다', async () => {
    const db = new FakeDb()
    const outcome = await handler.create(db.service, prepared(cardItem({ cover_image_url: COVER })), { now: NOW, coverColorsFields: async () => ({}) })
    expect(outcome.ok).toBe(true)
    expect('cover_colors' in db.tables.today_cards[0]).toBe(false)
  })

  it('추출이 던져도 등록은 성공하고 cover_colors는 싣지 않는다', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = new FakeDb()
    const outcome = await handler.create(db.service, prepared(cardItem({ cover_image_url: COVER })), {
      now: NOW,
      coverColorsFields: async () => {
        throw new Error('boom')
      },
    })
    expect(outcome).toEqual({ ok: true, value: { id: CARD_ID } })
    expect('cover_colors' in db.tables.today_cards[0]).toBe(false)
    errorSpy.mockRestore()
  })

  it('커버 이미지가 없으면 추출 함수를 부르지 않는다', async () => {
    const db = new FakeDb()
    const extract = vi.fn<CoverColorsFieldsFn>(async () => ({ cover_colors: ['#ff8800'] }))
    await handler.create(db.service, prepared(), { now: NOW, coverColorsFields: extract })
    expect(extract).not.toHaveBeenCalled()
    expect('cover_colors' in db.tables.today_cards[0]).toBe(false)
  })

  it('추출 함수를 넘기지 않으면(옛 호출) 색 없이 만든다', async () => {
    const db = new FakeDb()
    await handler.create(db.service, prepared(cardItem({ cover_image_url: COVER })), { now: NOW })
    expect('cover_colors' in db.tables.today_cards[0]).toBe(false)
  })
})

describe('create — 유형이 있는 카드의 시드·색 자동 정하기(티켓 20261121_1531)', () => {
  const COLOR_KEYS = ['bg_color_key', 'chip_color_key', 'box_color_key'] as const
  const FEED_COLORS: readonly string[] = FEED_COLOR_KEYS
  const feedItem = (resource: Raw = {}) => cardItem({ feed_type: 'text_box', ...resource })

  it('유형이 있으면 비어 있는 시드와 세 색 키를 채워 insert하고 응답은 그대로다', async () => {
    const db = new FakeDb()
    const value = prepared(feedItem())
    const outcome = await handler.create(db.service, value, { now: NOW })

    expect(outcome).toEqual({ ok: true, value: { id: CARD_ID } })
    const row = db.tables.today_cards[0]
    expect(Number.isInteger(row.feed_seed)).toBe(true)
    for (const key of COLOR_KEYS) expect(FEED_COLORS).toContain(row[key])
    expect(row).toMatchObject({ id: CARD_ID, feed_type: 'text_box', title: '가을 아침 러닝' })
    // 변환 결과(페이로드)는 바꾸지 않고 새 객체로 합쳐 넣는다.
    expect(value.payload).not.toHaveProperty('feed_seed')
    expect(value.payload.bg_color_key).toBeNull()
  })

  it('에이전트가 적은 색은 보존하고 비어 있는 칸만 정한다', async () => {
    const db = new FakeDb()
    await handler.create(db.service, prepared(feedItem({ bg_color_key: 'yellow', chip_color_key: 'purple' })), { now: NOW })

    const row = db.tables.today_cards[0]
    expect(row.bg_color_key).toBe('yellow')
    expect(row.chip_color_key).toBe('purple')
    expect(FEED_COLORS).toContain(row.box_color_key)
    expect(Number.isInteger(row.feed_seed)).toBe(true)
  })

  it('페이로드에 feed_seed가 있으면 그 값이 저장 시드이자 색 계산 시드다: 같은 시드는 몇 번을 등록해도 같은 색이다', async () => {
    const colorsOf = async () => {
      const db = new FakeDb()
      const value = prepared(feedItem())
      await handler.create(db.service, { ...value, payload: Object.assign({}, value.payload, { feed_seed: 20261121 }) }, { now: NOW })
      const row = db.tables.today_cards[0]
      return { seed: row.feed_seed, bg: row.bg_color_key, chip: row.chip_color_key, box: row.box_color_key }
    }
    const first = await colorsOf()
    expect(first.seed).toBe(20261121)
    for (let i = 0; i < 5; i += 1) expect(await colorsOf()).toEqual(first)
  })

  it('같은 시기에 노출되는 다른 카드의 배경색은 덜 쓰이게 피하고, 자기 자신은 빈도에서 뺀다', async () => {
    const db = new FakeDb()
    // 'green'을 뺀 모든 색이 같은 시기에 한 번씩 쓰이고 있다. 같은 ID의 옛 행(재시도 흔적)이 'green'을 쓰고 있어도 세지 않는다.
    db.tables.today_cards = [
      ...FEED_COLOR_KEYS.filter((key) => key !== 'green').map((key, index) => ({ id: uid(100 + index), bg_color_key: key, starts_at: STARTS_AT, ends_at: ENDS_AT })),
      { id: CARD_ID, bg_color_key: 'green', starts_at: STARTS_AT, ends_at: ENDS_AT },
    ]
    await handler.create(db.service, prepared(feedItem()), { now: NOW })

    const inserted = db.tables.today_cards[db.tables.today_cards.length - 1]
    expect(inserted).toMatchObject({ id: CARD_ID, feed_type: 'text_box', bg_color_key: 'green' })
    const usageRead = db.calls.find((call) => call.op === 'select')
    expect(usageRead?.filters[0]).toEqual(['id !=', CARD_ID])
  })

  it('유형이 없는 항목은 이전과 똑같다: insert 페이로드가 그대로이고 시드·색 키를 더하지 않으며 DB를 읽지 않는다', async () => {
    const db = new FakeDb()
    const value = prepared(cardItem())
    await handler.create(db.service, value, { now: NOW })

    const inserts = db.calls.filter((call) => call.op === 'insert')
    expect(inserts).toHaveLength(1)
    expect(inserts[0].payload).toBe(value.payload)
    expect(Object.keys(inserts[0].payload as Raw).sort()).toEqual(Object.keys(value.payload).sort())
    expect(inserts[0].payload).not.toHaveProperty('feed_seed')
    expect(db.calls.filter((call) => call.op === 'select')).toEqual([])
  })

  it('빈도 조회가 실패해도 등록은 성공하고 시드·색을 채운다. 오류 원문은 응답에 없다', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const db = new FakeDb()
      db.failIf = (call) => call.table === 'today_cards' && call.op === 'select'
      const outcome = await handler.create(db.service, prepared(feedItem()), { now: NOW })

      expect(outcome).toEqual({ ok: true, value: { id: CARD_ID } })
      const row = db.tables.today_cards[0]
      expect(Number.isInteger(row.feed_seed)).toBe(true)
      for (const key of COLOR_KEYS) expect(FEED_COLORS).toContain(row[key])
      expect(JSON.stringify(outcome)).not.toContain(DB_SECRET)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('빈도 조회가 예외를 던져도 등록은 성공하고(값 없이) 서버 로그에만 남긴다', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const db = new FakeDb()
      db.beforeRun = (call) => {
        if (call.op === 'select') throw new Error(DB_SECRET)
      }
      const outcome = await handler.create(db.service, prepared(feedItem()), { now: NOW })

      expect(outcome).toEqual({ ok: true, value: { id: CARD_ID } })
      expect(db.tables.today_cards[0]).not.toHaveProperty('feed_seed')
      expect(JSON.stringify(outcome)).not.toContain(DB_SECRET)
      expect(errorSpy).toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('기본 조합으로 되돌려도 등록은 막지 않고 서버 로그에만 남긴다', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const db = new FakeDb()
      // 배경 red와 칩 blue-soft를 지정하면 맞는 박스 색이 없어 기본 조합으로 되돌린다.
      const outcome = await handler.create(db.service, prepared(feedItem({ bg_color_key: 'red', chip_color_key: 'blue-soft' })), { now: NOW })

      expect(outcome).toEqual({ ok: true, value: { id: CARD_ID } })
      expect(db.tables.today_cards[0]).toMatchObject({ bg_color_key: 'red', chip_color_key: 'blue-soft' })
      expect(FEED_COLORS).toContain(db.tables.today_cards[0].box_color_key)
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(String(warnSpy.mock.calls[0][0])).toContain(CARD_ID)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('insert가 실패하면 이전과 같은 사유로 정리 delete를 한 번 시도한다', async () => {
    const db = new FakeDb()
    db.failIf = (call) => call.op === 'insert'
    const outcome = await handler.create(db.service, prepared(feedItem()), { now: NOW })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.reason).toBe('카드를 만들지 못했어요')
    expect(deletes(db)).toHaveLength(1)
  })
})

describe('create — 이미지 대표 색을 자동 색 배정에 쓴다(티켓 20261121_1828)', () => {
  const feedHero = (resource: Raw = {}) => cardItem({ feed_type: 'hero_box', cover_image_url: COVER, ...resource })
  const COVER = 'https://cdn.example.com/card.webp'
  const hexOfKey = (key: unknown) => DEFAULT_FEED_PALETTE[String(key)]
  /** 배지가 걸린 카드 항목(`badge_spotlight`만 `badge_ids`를 받는다) */
  const badgeCard = (feedType: string) => cardItem({ template_type: 'badge_spotlight', feed_type: feedType })

  // 시드는 서버 난수라 호출마다 달라진다. 이미지 입력만 바꿨을 때를 비교하려고 난수를 고정한다.
  beforeEach(() => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(((array: Uint32Array) => {
      array[0] = 987654321
      return array
    }) as typeof crypto.getRandomValues)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** 이미지 입력 없이 정했을 때의 배경·칩(같은 카드 ID라 같은 시드다) */
  async function baseline() {
    const db = new FakeDb()
    await handler.create(db.service, prepared(feedHero()), { now: NOW })
    return db.tables.today_cards[0]
  }

  it('커버 대표 색이 배경·칩 후보와 비슷하면 그 색을 피해 정한다(규칙 ⑤·⑥), 커버 색은 같은 insert에 싣는다', async () => {
    const before = await baseline()
    const cover = [hexOfKey(before.bg_color_key), hexOfKey(before.chip_color_key)]
    const db = new FakeDb()
    const extract = vi.fn<CoverColorsFieldsFn>(async () => ({ cover_colors: cover }))
    const outcome = await handler.create(db.service, prepared(feedHero()), { now: NOW, coverColorsFields: extract })

    expect(outcome).toEqual({ ok: true, value: { id: CARD_ID } })
    const row = db.tables.today_cards[0]
    expect(row.cover_colors).toEqual(cover)
    expect(row.feed_seed).toBe(before.feed_seed)
    expect(violatesImageColorRule(hexOfKey(row.bg_color_key), cover)).toBe(false)
    expect(violatesImageColorRule(hexOfKey(row.chip_color_key), cover)).toBe(false)
    expect([row.bg_color_key, row.chip_color_key]).not.toEqual([before.bg_color_key, before.chip_color_key])
  })

  it('커버 대표 색이 없으면(추출 함수 없음·실패·[]) 이미지 규칙 없이 이전과 같은 값이다', async () => {
    const before = await baseline()
    for (const context of [
      { now: NOW },
      { now: NOW, coverColorsFields: async () => ({}) },
      { now: NOW, coverColorsFields: async () => ({ cover_colors: [] }) },
    ]) {
      const db = new FakeDb()
      await handler.create(db.service, prepared(feedHero()), context)
      const row = db.tables.today_cards[0]
      expect([row.bg_color_key, row.chip_color_key, row.box_color_key]).toEqual([before.bg_color_key, before.chip_color_key, before.box_color_key])
    }
  })

  it('텍스트 박스는 이미지 마스크일 때만 커버 대표 색을 쓰고, 글자만 있는 박스는 쓰지 않는다', async () => {
    const createText = async (boxKind: string, cover?: string[]) => {
      const db = new FakeDb()
      const context = cover ? { now: NOW, coverColorsFields: async () => ({ cover_colors: cover }) } : { now: NOW }
      await handler.create(db.service, prepared(cardItem({ feed_type: 'text_box', box_kind: boxKind, cover_image_url: COVER })), context)
      return db.tables.today_cards[0]
    }
    const keysOf = (row: Row) => [row.bg_color_key, row.chip_color_key, row.box_color_key]
    const before = await createText('image_mask')
    const cover = [hexOfKey(before.bg_color_key), hexOfKey(before.chip_color_key)]

    expect(keysOf(await createText('text', cover))).toEqual(keysOf(await createText('text')))
    const masked = await createText('image_mask', cover)
    expect(keysOf(masked)).not.toEqual(keysOf(before))
    expect(violatesImageColorRule(hexOfKey(masked.bg_color_key), cover)).toBe(false)
    expect(violatesImageColorRule(hexOfKey(masked.chip_color_key), cover)).toBe(false)
  })

  it('배지 소개는 연결된 첫 배지의 대표 색을 badges에서 한 번 읽어 배경을 거른다', async () => {
    const baseDb = new FakeDb()
    await handler.create(baseDb.service, prepared(badgeCard('badge_intro'), { badge_ids: [BADGE_ID] }), { now: NOW })
    const before = baseDb.tables.today_cards[0]
    // 배지 행이 없으면(삭제됨) 이미지 규칙 없이 이전과 같다
    expect(baseDb.calls.filter((call) => call.table === 'badges')).toHaveLength(1)

    const colors = [hexOfKey(before.bg_color_key)]
    const db = new FakeDb()
    db.tables.badges = [{ id: BADGE_ID, bg_colors: colors }]
    await handler.create(db.service, prepared(badgeCard('badge_intro'), { badge_ids: [BADGE_ID] }), { now: NOW })

    const reads = db.calls.filter((call) => call.table === 'badges')
    expect(reads).toHaveLength(1)
    expect(reads[0].filters).toEqual([['id', [BADGE_ID]], ['deleted_at', null]])
    const row = db.tables.today_cards[0]
    expect(violatesImageColorRule(hexOfKey(row.bg_color_key), colors)).toBe(false)
    expect(row.bg_color_key).not.toBe(before.bg_color_key)
  })

  it('배지 대표 색 조회가 실패해도 등록은 성공하고 이미지 규칙 없이 이전과 같은 값이다. 오류 원문은 응답에 없다', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const baseDb = new FakeDb()
      await handler.create(baseDb.service, prepared(badgeCard('badge_intro'), { badge_ids: [BADGE_ID] }), { now: NOW })
      const before = baseDb.tables.today_cards[0]

      const db = new FakeDb()
      db.failIf = (call) => call.table === 'badges'
      const outcome = await handler.create(db.service, prepared(badgeCard('badge_intro'), { badge_ids: [BADGE_ID] }), { now: NOW })
      expect(outcome).toEqual({ ok: true, value: { id: CARD_ID } })
      const row = db.tables.today_cards[0]
      expect([row.bg_color_key, row.chip_color_key, row.box_color_key]).toEqual([before.bg_color_key, before.chip_color_key, before.box_color_key])
      expect(errorSpy).toHaveBeenCalled()
      expect(JSON.stringify(outcome)).not.toContain(DB_SECRET)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('배지 유형이 아니면 badges를 읽지 않는다', async () => {
    const db = new FakeDb()
    await handler.create(db.service, prepared(badgeCard('text_box'), { badge_ids: [BADGE_ID] }), { now: NOW })
    expect(db.calls.filter((call) => call.table === 'badges')).toEqual([])
  })
})

describe('undo — 참조를 확인한 뒤 ID로 지운다', () => {
  const seed = (db: FakeDb) => {
    db.tables.today_cards = [{ id: CARD_ID }, { id: EXISTING_CARD_ID }]
  }

  it('노출·열람 기록이 있으면 지우지 않고 고정 사유를 돌려준다', async () => {
    const db = new FakeDb()
    seed(db)
    db.tables.today_card_events = [{ id: 'event-1', card_id: CARD_ID }]
    const failure = await handler.undo(db.service, CARD_ID)

    expect(failure?.reason).toBe('노출 기록이 있거나 확인하지 못해 카드를 지우지 않았어요')
    expect(failure?.reason).not.toContain('today_card_events')
    expect(failure?.detail).toContain('today_card_events')
    expect(deletes(db)).toEqual([])
    expect(db.tables.today_cards).toHaveLength(2)
  })

  it('참조를 읽지 못하면 확인 없이 지우지 않고 원문은 detail에만 있다', async () => {
    const db = new FakeDb()
    seed(db)
    db.failIf = (call) => call.table === 'today_card_events'
    const failure = await handler.undo(db.service, CARD_ID)

    expect(failure?.reason).toBe('노출 기록이 있거나 확인하지 못해 카드를 지우지 않았어요')
    expect(failure?.reason).not.toContain(DB_SECRET)
    expect(failure?.detail).toContain(DB_SECRET)
    expect(deletes(db)).toEqual([])
    expect(db.tables.today_cards).toHaveLength(2)
  })

  it('기록이 없으면 카드를 ID로 지우고 다른 카드는 건드리지 않는다', async () => {
    const db = new FakeDb()
    seed(db)
    db.tables.today_card_events = [{ id: 'event-1', card_id: EXISTING_CARD_ID }]
    expect(await handler.undo(db.service, CARD_ID)).toBeNull()

    expect(deletes(db)).toHaveLength(1)
    expect(deletes(db)[0]).toMatchObject({ table: 'today_cards', filters: [['id', CARD_ID]] })
    expect((db.tables.today_cards as Row[]).map((row) => row.id)).toEqual([EXISTING_CARD_ID])
    // 참조 확인이 지우기보다 먼저다
    const order = db.calls.map((call) => `${call.table}:${call.op}`)
    expect(order.indexOf('today_card_events:select')).toBeLessThan(order.indexOf('today_cards:delete'))
  })

  it('delete 오류는 「카드를 지우지 못했어요」이고 원문은 detail에만 있다', async () => {
    const db = new FakeDb()
    seed(db)
    db.failIf = (call) => call.op === 'delete'
    const failure = await handler.undo(db.service, CARD_ID)

    expect(failure?.reason).toBe('카드를 지우지 못했어요')
    expect(failure?.reason).not.toContain(DB_SECRET)
    expect(failure?.reason).not.toContain(CARD_ID)
    expect(failure?.detail).toContain(DB_SECRET)
  })
})

describe('cancel — 공개 전에만 지운다(티켓 20261002_1256 가정 2)', () => {
  const PAST = '2026-10-05T02:00:00.000Z' // NOW(10/5 12:00 KST)보다 앞
  const seed = (db: FakeDb, startsAt: string = LATER) => {
    db.tables.today_cards = [
      { id: CARD_ID, starts_at: startsAt },
      { id: EXISTING_CARD_ID, starts_at: LATER },
    ]
  }
  const cancel = (db: FakeDb) => handler.cancel(db.service, CARD_ID, { now: NOW })
  const ids = (db: FakeDb) => (db.tables.today_cards as Row[]).map((row) => row.id)

  it('공개 전이고 기록이 없으면 ID로 지우고 다른 카드는 건드리지 않는다. 지울 때 공개 시각 조건을 건다', async () => {
    const db = new FakeDb()
    seed(db)
    expect(await cancel(db)).toEqual({ ok: true, missing: false })

    expect(ids(db)).toEqual([EXISTING_CARD_ID])
    expect(deletes(db)).toHaveLength(1)
    expect(deletes(db)[0]).toMatchObject({ table: 'today_cards', filters: [['id', CARD_ID], ['starts_at >', NOW.toISOString()]] })
    // 읽기 → 참조 확인 → 지우기 순서
    const order = db.calls.map((call) => `${call.table}:${call.op}`)
    expect(order.indexOf('today_cards:select')).toBeLessThan(order.indexOf('today_card_events:select'))
    expect(order.indexOf('today_card_events:select')).toBeLessThan(order.indexOf('today_cards:delete'))
  })

  it('행이 없으면 밖에서 지워진 것이라 성공(missing)이고 아무것도 쓰지 않는다', async () => {
    const db = new FakeDb()
    expect(await cancel(db)).toEqual({ ok: true, missing: true })
    expect(db.calls.filter((call) => call.op !== 'select')).toEqual([])
    expect(db.calls.some((call) => call.table === 'today_card_events')).toBe(false)
  })

  it.each([
    ['공개 시각이 지났다', PAST],
    ['공개 시각이 정확히 지금이다', NOW.toISOString()],
  ])('%s: published이고 지우지 않으며 참조도 읽지 않는다', async (_label, startsAt) => {
    const db = new FakeDb()
    seed(db, startsAt)
    const result = await cancel(db)

    expect(result).toEqual({ ok: false, code: 'published', failure: { reason: '공개 시각이 지나 취소할 수 없어요' } })
    expect(deletes(db)).toEqual([])
    expect(ids(db)).toEqual([CARD_ID, EXISTING_CARD_ID])
    expect(db.calls.some((call) => call.table === 'today_card_events')).toBe(false)
  })

  it('노출·열람 기록이 있으면 referenced이고 지우지 않는다. 테이블 이름은 detail에만 있다', async () => {
    const db = new FakeDb()
    seed(db)
    db.tables.today_card_events = [{ id: 'event-1', card_id: CARD_ID }]
    const result = await cancel(db)

    expect(result).toMatchObject({ ok: false, code: 'referenced', failure: { reason: '노출 기록이 있거나 확인하지 못해 카드를 지우지 않았어요' } })
    if (result.ok) throw new Error('실패여야 해요')
    expect(result.failure.reason).not.toContain('today_card_events')
    expect(result.failure.detail).toContain('today_card_events')
    expect(deletes(db)).toEqual([])
  })

  it('참조를 읽지 못하면 referenced이고 지우지 않는다. DB 오류 원문은 detail에만 있다', async () => {
    const db = new FakeDb()
    seed(db)
    db.failIf = (call) => call.table === 'today_card_events'
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
      if (call.op === 'delete') (db.tables.today_cards[0] as Row).starts_at = PAST
    }
    const result = await cancel(db)

    expect(result).toMatchObject({ ok: false, code: 'published', failure: { reason: '공개 시각이 지나 취소할 수 없어요' } })
    expect(ids(db)).toEqual([CARD_ID, EXISTING_CARD_ID])
  })

  it('지우려는 사이 다른 곳에서 먼저 지우면(삭제 경합) 다시 읽어 행이 없으니 missing이다', async () => {
    const db = new FakeDb()
    seed(db)
    db.beforeRun = (call) => {
      if (call.op === 'delete') db.tables.today_cards = (db.tables.today_cards as Row[]).filter((row) => row.id !== CARD_ID)
    }
    expect(await cancel(db)).toEqual({ ok: true, missing: true })
    expect(ids(db)).toEqual([EXISTING_CARD_ID])
  })

  it.each([
    ['처음 읽기', (call: { op: string; table: string }) => call.table === 'today_cards' && call.op === 'select'],
    ['지우기', (call: { op: string; table: string }) => call.table === 'today_cards' && call.op === 'delete'],
  ])('%s 오류는 error이고 「카드를 지우지 못했어요」다. DB 오류 원문·카드 ID는 reason에 없다', async (_label, fails) => {
    const db = new FakeDb()
    seed(db)
    db.failIf = fails
    const result = await cancel(db)

    expect(result).toMatchObject({ ok: false, code: 'error', failure: { reason: '카드를 지우지 못했어요' } })
    if (result.ok) throw new Error('실패여야 해요')
    expect(result.failure.reason).not.toContain(DB_SECRET)
    expect(result.failure.reason).not.toContain(CARD_ID)
    expect(result.failure.detail).toContain(DB_SECRET)
    expect(ids(db)).toEqual([CARD_ID, EXISTING_CARD_ID])
  })

  it('지운 행이 없고 다시 읽기마저 실패하면 error다', async () => {
    const db = new FakeDb()
    seed(db)
    let selects = 0
    db.beforeRun = (call) => {
      if (call.op === 'delete') (db.tables.today_cards[0] as Row).starts_at = PAST
    }
    db.failIf = (call) => call.table === 'today_cards' && call.op === 'select' && ++selects === 2
    const result = await cancel(db)

    expect(result).toMatchObject({ ok: false, code: 'error', failure: { reason: '카드를 지우지 못했어요' } })
    if (result.ok) throw new Error('실패여야 해요')
    expect(result.failure.detail).toContain(DB_SECRET)
  })
})

describe('observe — 카드의 지금 상태를 읽는다(티켓 20261002_1813 가정 2)', () => {
  const STARTS = '2026-10-05T00:00:00.000Z' // NOW(10/5 12:00 KST = 03:00Z)보다 앞
  const ENDS = '2026-10-05T14:59:59.999Z' // NOW보다 뒤
  const seed = (db: FakeDb, card: Row = {}) => {
    db.tables.today_cards = [
      { id: CARD_ID, is_active: true, starts_at: STARTS, ends_at: ENDS, ...card },
      { id: EXISTING_CARD_ID, is_active: true, starts_at: LATER, ends_at: LATER },
    ]
  }
  const observe = (db: FakeDb, now: Date = NOW) => handler.observe(db.service, CARD_ID, { now })

  it('켜져 있고 기간 안이면 공개 중이다. 시각은 카드의 값 그대로 돌려주고 아무것도 쓰지 않는다', async () => {
    const db = new FakeDb()
    seed(db)
    expect(await observe(db)).toEqual({ status: 'present', published: true, ended: false, startsAt: STARTS, endsAt: ENDS, inactive: false })
    expect(db.calls.filter((call) => call.op !== 'select')).toEqual([])
    expect(db.calls.map((call) => call.table)).toEqual(['today_cards'])
  })

  it('공개 시각 전이면 공개 중이 아니고 종료도 아니다', async () => {
    const db = new FakeDb()
    seed(db, { starts_at: LATER, ends_at: '2026-10-10T14:59:59.999Z' })
    expect(await observe(db)).toMatchObject({ status: 'present', published: false, ended: false, inactive: false })
  })

  it.each([
    ['공개 시각이 정확히 지금이다', { starts_at: NOW.toISOString() }],
    ['종료 시각이 정확히 지금이다', { ends_at: NOW.toISOString() }],
  ])('%s: 양 끝을 포함해 공개 중이고 종료는 아니다', async (_label, card) => {
    const db = new FakeDb()
    seed(db, card)
    expect(await observe(db)).toMatchObject({ status: 'present', published: true, ended: false })
  })

  it('종료 시각이 1밀리초 지나면 공개 중이 아니고 종료다', async () => {
    const db = new FakeDb()
    seed(db)
    expect(await observe(db, new Date(Date.parse(ENDS) + 1))).toMatchObject({ status: 'present', published: false, ended: true })
  })

  it('꺼진 카드는 공개 중이 아니고 inactive다. 기간이 지났으면 종료이기도 하다', async () => {
    const db = new FakeDb()
    seed(db, { is_active: false })
    expect(await observe(db)).toMatchObject({ status: 'present', published: false, ended: false, inactive: true })

    seed(db, { is_active: false, ends_at: '2026-10-05T02:00:00.000Z' })
    expect(await observe(db)).toMatchObject({ status: 'present', published: false, ended: true, inactive: true })
  })

  it('행이 없으면 missing이다', async () => {
    const db = new FakeDb()
    expect(await observe(db)).toEqual({ status: 'missing' })
  })

  it('읽지 못하면 error이고 원문은 detail에만 있다', async () => {
    const db = new FakeDb()
    seed(db)
    db.failIf = (call) => call.table === 'today_cards'
    const result = await observe(db)

    expect(result.status).toBe('error')
    if (result.status !== 'error') throw new Error('error여야 해요')
    expect(result.detail).toContain(DB_SECRET)
  })

  it('시각을 읽을 수 없으면 판정하지 않고 error다', async () => {
    const db = new FakeDb()
    seed(db, { ends_at: 'not-a-date' })
    expect(await observe(db)).toMatchObject({ status: 'error' })
  })
})
