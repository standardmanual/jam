/**
 * JAM! 배지 핸들러 (티켓 20261004_1756, 상위 20260930_1500 ⑨-a). 가정 1~9는 티켓 「착수 전에 정한 것」 번호다. 틀은 `recipe.test.ts`·`mission.test.ts`다.
 *
 * - prepare: 변환 결과·툴이 정하는 값, 형식 오류 문장과 「외 N건」, 희귀도·레벨·조건 저장 규칙·발급 조건 없음(가정 5·6)
 * - check: 이름 중복·체크인 배지 이름을 고정 문장으로, 직접 적은 레시피는 DB의 공개 시각과 견주고(가정 3), 연결로 채운 레시피는 건너뛴다. DB 오류·ID는 `reason`에 없다
 * - create: 정한 ID로 만들고, 오류면 같은 ID로 정리 delete를 한 번 시도한다
 * - undo: 참조가 있거나 읽지 못하면 지우지 않고, 없으면 시각과 상관없이 ID로 지운다
 * - cancel: 없음·소프트 삭제·공개됨(`published`)·참조 있음(`referenced`)·삭제 경합·오류 비노출
 * - observe: 없음·공개 판정(양 끝 포함)·종료·쓰기 없음·읽기 실패 비노출
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { asRegisterChecksClient, RESOURCE_KEY_BY_KIND, type ExecuteLinkedIds } from '../handlers'
import { JAM_BADGE_HANDLER as handler, JAM_BADGE_MESSAGES } from '../jamBadge'
import { DB_SECRET, FakeDb, type Row } from './fakeDb'
import { LATER, NOW, makeItem } from './fixtures'

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const BADGE_ID = uid(1)
const EXISTING_BADGE_ID = uid(2)
const RECIPE_ID = uid(3)
const EXISTING_RECIPE_ID = uid(4)
const MISSION_ID = uid(5)
const CARD_ID = uid(6)
/** `LATER`(10/10 09:00 KST)를 등록 형식으로 바꾼 공개 시각. */
const STARTS_AT = new Date(LATER).toISOString()
const DAY = 24 * 60 * 60_000
const after = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString()
/** NOW(10/5 12:00 KST = 03:00Z)보다 앞. */
const PAST = '2026-10-05T02:00:00.000Z'

type Raw = Record<string, unknown>

const CONDITION = { combine_success_count: 1 }

/** 검사를 통과하는 JAM! 배지 항목. 공개 시각은 행 칸(`LATER`)이다. `resource`·`original`·`copy`는 칸 단위로, 행의 시각은 `row`로 덮는다. */
function badgeItem(resource: Raw = {}, original: Raw = {}, copy: Raw = {}, row: { startsAt?: string | null; endsAt?: string | null } = {}) {
  return makeItem({
    key: 'badge',
    kind: 'jam_badge',
    original: { copy: { name: '첫 믹스', description: '믹스에 처음 성공했어요.', ...copy }, ...original },
    resource: { condition_json: CONDITION, rarity: 'common', point_reward: 10, ...resource },
    ...row,
  })
}

function prepared(item = badgeItem(), linkedIds: ExecuteLinkedIds = {}) {
  const outcome = handler.prepare(item, { id: BADGE_ID, actorId: 'admin-1', linkedIds, now: NOW })
  if (!outcome.ok) throw new Error(`prepare 실패: ${outcome.failure.reason}`)
  return outcome.value
}

function failureOf(item: ReturnType<typeof badgeItem>) {
  const outcome = handler.prepare(item, { id: BADGE_ID, actorId: 'admin-1', linkedIds: {}, now: NOW })
  expect(outcome.ok).toBe(false)
  if (outcome.ok) throw new Error('prepare가 실패해야 해요')
  return outcome.failure
}

const checkOf = (db: FakeDb, item = badgeItem(), linkedIds: ExecuteLinkedIds = {}) =>
  handler.check(asRegisterChecksClient(db.service), prepared(item, linkedIds), { now: NOW })
const deletes = (db: FakeDb) => db.calls.filter((call) => call.op === 'delete')
const badgeIds = (db: FakeDb) => (db.tables.badges as Row[]).map((row) => row.id)

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('핸들러 정의', () => {
  it('종류·자원 키·정한 ID 먼저 만들기가 계약대로다', () => {
    expect(handler.kind).toBe('jam_badge')
    expect(handler.resourceKey).toBe(RESOURCE_KEY_BY_KIND.jam_badge)
    expect(handler.resourceKey).toBe('badge_id')
    expect(handler.idFirst).toBe(true)
  })
})

describe('prepare', () => {
  it('정한 ID·공개 시각(valid_from)이 들어가고 툴이 정하는 값(type·admin_category·activity_types)이 붙는다. 종료가 없으면 valid_until은 null(상시)이다', () => {
    const value = prepared()
    expect(value.id).toBe(BADGE_ID)
    expect(value.payload).toMatchObject({
      id: BADGE_ID,
      name: '첫 믹스',
      description: '믹스에 처음 성공했어요.',
      type: 'activity',
      admin_category: 'jam',
      activity_types: [],
      condition_json: CONDITION,
      rarity: 'common',
      level: null,
      point_reward: 10,
      valid_from: STARTS_AT,
      valid_until: null,
      image_url: null,
      tribe_id: null,
      item_book_id: null,
    })
    expect(value.linkFields).toEqual([])
  })

  it('종료 시각이 있으면 valid_until이다', () => {
    const endsAt = after(LATER, 7 * DAY)
    expect(prepared(badgeItem({}, {}, {}, { endsAt })).payload).toMatchObject({ valid_from: STARTS_AT, valid_until: endsAt })
  })

  it('받은 linkedIds는 그대로 남기고 연결 칸을 payload에 덮고 linkFields로 알린다', () => {
    const linkedIds = { recipe_id: RECIPE_ID }
    const value = prepared(badgeItem({ condition_json: { recipe_first_success: { recipe_id: EXISTING_RECIPE_ID } } }), linkedIds)
    expect(value.linkedIds).toBe(linkedIds)
    expect(value.linkFields).toEqual(['condition_json.recipe_first_success.recipe_id'])
    expect(value.payload.condition_json).toEqual({ recipe_first_success: { recipe_id: RECIPE_ID } })
    expect(JSON.stringify(value.payload)).not.toContain(EXISTING_RECIPE_ID)
  })

  it('경고는 막지 않고 그대로 돌려준다(activity_types는 툴이 정하는 값이라 읽지 않는다)', () => {
    const value = prepared(badgeItem({ activity_types: ['running'], mood: 'calm' }))
    expect(value.warnings.map((issue) => issue.path)).toEqual(['resource.activity_types', 'resource.mood'])
    expect(value.payload.activity_types).toEqual([])
  })

  it('변환 오류가 하나면 「배지 형식이 맞지 않아요: {오류 문장}」이다', () => {
    const failure = failureOf(badgeItem({}, {}, { name: undefined }))
    expect(failure.reason).toBe('배지 형식이 맞지 않아요: badge.name: 필수 항목이 없어요.')
    expect(failure.detail).toContain('copy.name')
  })

  it('변환 오류가 둘 이상이면 첫 문장만 싣고 끝에 「 (외 N건)」을 붙인다', () => {
    const failure = failureOf(badgeItem({ condition_json: undefined }, {}, { name: undefined }))
    const errors = failure.detail?.split(' / ') ?? []
    expect(errors).toHaveLength(2)
    expect(failure.reason).toBe('배지 형식이 맞지 않아요: badge.name: 필수 항목이 없어요. (외 1건)')
    expect(failure.reason).not.toContain('condition_json')
  })

  it('등급형과 레벨형을 함께 적으면 막는다. 문장 앞의 「저장할 수 없습니다.」는 없다', () => {
    const failure = failureOf(badgeItem({ rarity: 'common', level: 1 }))
    expect(failure.reason).toBe(
      '배지 형식이 맞지 않아요: badge.rarity: 등급형과 레벨형은 함께 지정할 수 없습니다. 등급(common~mystic)이나 레벨(Lv.1 이상) 중 하나만 남겨주세요.'
    )
  })

  it('등급도 레벨도 없으면 막고, 레벨형(rarity 없이 level)은 통과한다', () => {
    expect(failureOf(badgeItem({ rarity: undefined })).reason).toContain('배지 종류가 정해지지 않았습니다')
    const leveled = prepared(badgeItem({ rarity: undefined, level: 2 }))
    expect(leveled.payload).toMatchObject({ rarity: null, level: 2 })
  })

  it('계열 키 형태가 틀리면 막는다', () => {
    expect(failureOf(badgeItem({ family_key: '종목없음' })).reason).toContain('계열 키 형태(종목없음)가 올바르지 않아요')
    expect(prepared(badgeItem({ family_key: 'jam:첫 믹스' })).payload.family_key).toBe('jam:첫 믹스')
  })

  it('조건 저장 규칙(어드민 배지 저장 검사)을 따른다: 엔진이 모르는 키·사용량 지표를 둘 이상 넣으면 막는다', () => {
    const unknown = failureOf(badgeItem({ condition_json: { combine_success_count: 1, mystery_key: 3 } }))
    expect(unknown.reason).toContain('배지 형식이 맞지 않아요: badge.condition_json: condition_json에 엔진이 모르는 필드(mystery_key)가 있습니다.')
    expect(unknown.reason).not.toContain('저장할 수 없습니다')

    const many = failureOf(badgeItem({ condition_json: { combine_success_count: 1, combine_attempt_count: 5 } }))
    expect(many.reason).toContain('서비스 사용량 지표는 한 배지에 하나만 쓸 수 있습니다')
  })

  describe('발급 조건이 없는 배지는 형식 오류다(메인 엔진은 admin_category = jam을 후보에서 빼므로 영원히 발급되지 않는다)', () => {
    it.each([
      ['빈 조건', {}],
      ['일반 활동 조건만 있다', { distance_km: 10 }],
      ['mission_reward가 true가 아니다', { mission_reward: false }],
    ])('%s', (_label, condition) => {
      const failure = failureOf(badgeItem({ condition_json: condition }))
      expect(failure.reason).toContain('배지 형식이 맞지 않아요: badge.condition_json: 발급 조건이 없는 배지예요.')
      expect(failure.detail).toContain('resource.condition_json')
    })

    it.each([
      ['사용량 지표', { follower_count: 10 }],
      ['JAM! 행동 지표', { combine_success_count: 1 }],
      ['JAM! 행동 지표(미션 완료)', { mission_complete_count: 3 }],
      ['레시피 최초 성공', { recipe_first_success: { recipe_id: EXISTING_RECIPE_ID } }],
      ['미션 보상 표시', { mission_reward: true }],
    ])('%s가 있으면 통과한다', (_label, condition) => {
      expect(handler.prepare(badgeItem({ condition_json: condition }), { id: BADGE_ID, actorId: 'admin-1', linkedIds: {}, now: NOW }).ok).toBe(true)
    })
  })

  describe('컬렉션 완성 보상으로 연결된 배지(pointedBy, 티켓 20261004_2039 가정 2·사용자 결정 2026-10-04)', () => {
    const REWARD = [{ kind: 'collection_launch', field: 'reward_badge_id' }]
    const prepareWith = (item: ReturnType<typeof badgeItem>, pointedBy?: readonly { kind: string; field: string }[]) =>
      handler.prepare(item, { id: BADGE_ID, actorId: 'admin-1', linkedIds: {}, now: NOW, pointedBy })

    it.each([
      ['빈 조건', {}],
      ['일반 활동 조건만 있다', { distance_km: 10 }],
      ['mission_reward가 true가 아니다', { mission_reward: false }],
    ])('발급 조건이 없어도(%s) 같은 그룹의 컬렉션이 reward_badge_id로 가리키면 통과한다', (_label, condition) => {
      const outcome = prepareWith(badgeItem({ condition_json: condition }), REWARD)
      expect(outcome.ok).toBe(true)
      if (!outcome.ok) throw new Error('통과해야 해요')
      expect(outcome.value.payload.condition_json).toEqual(condition)
    })

    it.each([
      ['pointedBy가 없다(컬렉션이 없는 그룹·다른 핸들러 경로)', undefined],
      ['pointedBy가 비어 있다(가리키던 컬렉션이 반려되는 등)', []],
      ['다른 종류가 가리킨다(미션 보상 칸)', [{ kind: 'mission', field: 'reward_badge_ids' }]],
      ['다른 종류가 가리킨다(카드 배지 칸)', [{ kind: 'home_feed_card', field: 'badge_ids' }]],
      ['컬렉션이 다른 칸으로 가리킨다', [{ kind: 'collection_launch', field: 'item_book_id' }]],
    ])('%s: 연결이 없으면 지금처럼 「발급 조건이 없는 배지예요」 형식 오류다', (_label, pointedBy) => {
      const outcome = prepareWith(badgeItem({ condition_json: {} }), pointedBy)
      expect(outcome.ok).toBe(false)
      if (outcome.ok) throw new Error('실패여야 해요')
      expect(outcome.failure.reason).toContain('배지 형식이 맞지 않아요: badge.condition_json: 발급 조건이 없는 배지예요.')
    })

    it('예외는 발급 조건 유무뿐이다: 조건 저장 규칙(엔진이 모르는 키·사용량 지표 둘)은 그대로 막는다', () => {
      const unknown = prepareWith(badgeItem({ condition_json: { mystery_key: 3 } }), REWARD)
      expect(unknown.ok).toBe(false)
      if (unknown.ok) throw new Error('실패여야 해요')
      expect(unknown.failure.reason).toContain('condition_json에 엔진이 모르는 필드(mystery_key)가 있습니다')

      const many = prepareWith(badgeItem({ condition_json: { combine_success_count: 1, combine_attempt_count: 5 } }), REWARD)
      expect(many.ok).toBe(false)
    })

    it('condition_json 자체는 여전히 필수다(빈 객체 {}는 되지만 칸이 없으면 형식 오류)', () => {
      const outcome = prepareWith(badgeItem({ condition_json: undefined }), REWARD)
      expect(outcome.ok).toBe(false)
      if (outcome.ok) throw new Error('실패여야 해요')
      expect(outcome.failure.reason).toBe('배지 형식이 맞지 않아요: badge.condition_json: 필수 항목이 없어요.')
    })

    it('다른 형식 오류도 그대로다(이름 없음·희귀도와 레벨 동시)', () => {
      const noName = prepareWith(badgeItem({ condition_json: {} }, {}, { name: undefined }), REWARD)
      expect(noName.ok).toBe(false)
      const both = prepareWith(badgeItem({ condition_json: {}, level: 1 }), REWARD)
      expect(both.ok).toBe(false)
    })

    it('연결 예외가 있어도 발급 조건이 있는 배지는 그대로 통과한다(조건 값을 바꾸지 않는다)', () => {
      const outcome = prepareWith(badgeItem(), REWARD)
      expect(outcome.ok).toBe(true)
      if (!outcome.ok) throw new Error('통과해야 해요')
      expect(outcome.value.payload.condition_json).toEqual(CONDITION)
    })
  })

  it('연결 없이 직접 적은 recipe_first_success의 레시피 ID가 UUID가 아니면 막는다', () => {
    const failure = failureOf(badgeItem({ condition_json: { recipe_first_success: { recipe_id: 'not-a-uuid' } } }))
    expect(failure.reason).toContain('recipe_first_success의 recipe_id가 레시피 ID(UUID) 형식이 아니에요')
    const noId = failureOf(badgeItem({ condition_json: { recipe_first_success: true } }))
    expect(noId.reason).toContain('recipe_first_success의 recipe_id가 레시피 ID(UUID) 형식이 아니에요')
  })

  it('레시피를 연결하면 항목에 적은 레시피 값이 형식에 어긋나도 연결 ID로 덮여 통과한다', () => {
    const value = prepared(badgeItem({ condition_json: { recipe_first_success: true } }), { recipe_id: RECIPE_ID })
    expect(value.payload.condition_json).toEqual({ recipe_first_success: { recipe_id: RECIPE_ID } })
  })

  it('kind가 jam_badge가 아니면 형식 오류다', () => {
    const failure = failureOf(makeItem({ key: 'x', kind: 'mission' }))
    expect(failure.reason).toContain('배지 형식이 맞지 않아요: kind: jam_badge 항목만 JAM! 배지로 바꿀 수 있어요')
  })
})

describe('check — 가정 7의 고정 문장', () => {
  it('같은 이름의 배지가 없으면 통과한다', async () => {
    const db = new FakeDb()
    db.tables.badges = [{ id: EXISTING_BADGE_ID, name: '다른 배지', deleted_at: null }]
    expect(await checkOf(db)).toBeNull()
  })

  it('같은 이름의 배지가 이미 있으면 막는다. 기존 배지 ID는 detail에만 있다', async () => {
    const db = new FakeDb()
    db.tables.badges = [{ id: EXISTING_BADGE_ID, name: '첫 믹스', deleted_at: null }]
    const failure = await checkOf(db)
    expect(failure).toMatchObject({ reason: '같은 이름의 배지가 이미 있어요' })
    expect(failure?.reason).not.toContain(EXISTING_BADGE_ID)
    expect(failure?.detail).toContain(EXISTING_BADGE_ID)
  })

  it('소프트 삭제된 같은 이름의 배지는 중복이 아니다', async () => {
    const db = new FakeDb()
    db.tables.badges = [{ id: EXISTING_BADGE_ID, name: '첫 믹스', deleted_at: '2026-09-01T00:00:00.000Z' }]
    expect(await checkOf(db)).toBeNull()
  })

  it('지정한 체크인 배지 이름이 실제 체크인 배지에 없으면 막는다', async () => {
    const db = new FakeDb()
    db.tables.badges = [{ id: EXISTING_BADGE_ID, name: '성수역', type: 'checkin', deleted_at: null }]
    const condition = { checkin_badge_count: { checkin_badge_names: ['성수역', '없는역'], count: 1 } }
    const failure = await checkOf(db, badgeItem({ condition_json: condition }))
    expect(failure).toMatchObject({ reason: '체크인 배지 이름 목록에 없는 이름이 있어요' })
    expect(failure?.reason).not.toContain('없는역')
    expect(failure?.detail).toContain('없는역')

    db.tables.badges = [
      { id: EXISTING_BADGE_ID, name: '성수역', type: 'checkin', deleted_at: null },
      { id: uid(9), name: '없는역', type: 'checkin', deleted_at: null },
    ]
    expect(await checkOf(db, badgeItem({ condition_json: condition }))).toBeNull()
  })

  it('트라이브·컬렉션은 읽지 않으므로 그 검사는 하지 않는다', async () => {
    const db = new FakeDb()
    await checkOf(db, badgeItem({ tribe_id: uid(8), item_book_id: uid(9) }))
    expect(db.calls.map((call) => call.table)).not.toContain('tribes')
    expect(db.calls.map((call) => call.table)).not.toContain('item_books')
  })

  it('DB를 읽지 못하면 「등록 전 확인 중 DB를 읽지 못했어요」다. DB 오류 원문은 detail에만 있다', async () => {
    const db = new FakeDb()
    db.failIf = (call) => call.table === 'badges'
    const failure = await checkOf(db)
    expect(failure).toMatchObject({ reason: '등록 전 확인 중 DB를 읽지 못했어요' })
    expect(failure?.reason).not.toContain(DB_SECRET)
    expect(failure?.detail).toContain(DB_SECRET)
  })

  describe('연결 없이 직접 적은 레시피(가정 3)', () => {
    const direct = (recipeId = EXISTING_RECIPE_ID) => badgeItem({ condition_json: { recipe_first_success: { recipe_id: recipeId } } })

    it('레시피가 있고 공개 시각이 같으면 통과한다(밀리초 비교라 표기가 달라도 같은 순간이면 통과)', async () => {
      const db = new FakeDb()
      db.tables.combination_recipes = [{ id: EXISTING_RECIPE_ID, valid_from: STARTS_AT }]
      expect(await checkOf(db, direct())).toBeNull()

      db.tables.combination_recipes = [{ id: EXISTING_RECIPE_ID, valid_from: '2026-10-10T09:00:00+09:00' }]
      expect(await checkOf(db, direct())).toBeNull()
    })

    it('공개 시각이 다르면 막는다(1밀리초 달라도). 레시피 ID·시각은 detail에만 있다', async () => {
      const db = new FakeDb()
      db.tables.combination_recipes = [{ id: EXISTING_RECIPE_ID, valid_from: after(STARTS_AT, 1) }]
      const failure = await checkOf(db, direct())
      expect(failure).toMatchObject({ reason: '가장 먼저 성공 배지는 레시피와 같은 시각에 공개돼야 해요' })
      expect(failure?.reason).toBe(JAM_BADGE_MESSAGES.recipeStartsDiffer)
      expect(failure?.reason).not.toContain(EXISTING_RECIPE_ID)
      expect(failure?.detail).toContain(EXISTING_RECIPE_ID)
    })

    it('레시피가 이미 열려 있으면(valid_from 없음) 나중에 여는 배지는 막는다', async () => {
      const db = new FakeDb()
      db.tables.combination_recipes = [{ id: EXISTING_RECIPE_ID, valid_from: null }]
      expect(await checkOf(db, direct())).toMatchObject({ reason: '가장 먼저 성공 배지는 레시피와 같은 시각에 공개돼야 해요' })
    })

    it('레시피가 없으면 「가장 먼저 성공할 레시피가 없어요」다', async () => {
      const db = new FakeDb()
      const failure = await checkOf(db, direct())
      expect(failure).toMatchObject({ reason: '가장 먼저 성공할 레시피가 없어요' })
      expect(failure?.reason).not.toContain(EXISTING_RECIPE_ID)
    })

    it('레시피를 읽지 못하면 통과시키지 않는다. DB 오류 원문은 detail에만 있다', async () => {
      const db = new FakeDb()
      db.failIf = (call) => call.table === 'combination_recipes'
      const failure = await checkOf(db, direct())
      expect(failure).toMatchObject({ reason: '등록 전 확인 중 DB를 읽지 못했어요' })
      expect(failure?.reason).not.toContain(DB_SECRET)
      expect(failure?.detail).toContain(DB_SECRET)
    })

    it('레시피 공개 시각이 시각으로 읽히지 않으면 통과시키지 않는다', async () => {
      const db = new FakeDb()
      db.tables.combination_recipes = [{ id: EXISTING_RECIPE_ID, valid_from: '내일' }]
      expect(await checkOf(db, direct())).toMatchObject({ reason: '등록 전 확인 중 DB를 읽지 못했어요' })
    })

    it('이름이 겹치면 레시피를 읽기 전에 그 사유로 막는다', async () => {
      const db = new FakeDb()
      db.tables.badges = [{ id: EXISTING_BADGE_ID, name: '첫 믹스', deleted_at: null }]
      expect(await checkOf(db, direct())).toMatchObject({ reason: '같은 이름의 배지가 이미 있어요' })
      expect(db.calls.some((call) => call.table === 'combination_recipes')).toBe(false)
    })

    it('연결로 채운 레시피는 같은 실행(또는 이전 실행)이 만든 것이라 DB에서 읽지 않는다', async () => {
      const db = new FakeDb()
      expect(await checkOf(db, direct(), { recipe_id: RECIPE_ID })).toBeNull()
      expect(db.calls.some((call) => call.table === 'combination_recipes')).toBe(false)
    })
  })
})

describe('create — 정한 ID로 만든다', () => {
  const create = (db: FakeDb, item = badgeItem()) => handler.create(db.service, prepared(item), { now: NOW })

  it('정한 ID와 변환한 값으로 badges에 한 행을 넣고 같은 ID를 돌려준다', async () => {
    const db = new FakeDb()
    db.tables.badges = [{ id: EXISTING_BADGE_ID, name: '기존 배지' }]
    const result = await create(db)

    expect(result).toEqual({ ok: true, value: { id: BADGE_ID } })
    expect(badgeIds(db)).toEqual([EXISTING_BADGE_ID, BADGE_ID])
    expect(db.tables.badges[1]).toMatchObject({ id: BADGE_ID, name: '첫 믹스', type: 'activity', admin_category: 'jam', activity_types: [], valid_from: STARTS_AT, valid_until: null })
    expect(deletes(db)).toEqual([])
  })

  it('insert가 오류를 받으면 「배지를 만들지 못했어요」이고 같은 ID로 정리 delete를 한 번 시도한다. DB 오류 원문·ID는 reason에 없다', async () => {
    const db = new FakeDb()
    db.failIf = (call) => call.table === 'badges' && call.op === 'insert'
    const result = await create(db)

    expect(result).toMatchObject({ ok: false, failure: { reason: '배지를 만들지 못했어요' } })
    if (result.ok) throw new Error('실패여야 해요')
    expect(result.failure.reason).not.toContain(DB_SECRET)
    expect(result.failure.reason).not.toContain(BADGE_ID)
    expect(result.failure.detail).toContain(DB_SECRET)
    expect(deletes(db)).toHaveLength(1)
    expect(deletes(db)[0].filters).toEqual([['id', BADGE_ID]])
  })

  it('정리 delete도 실패하면 그 결과를 detail에만 적는다', async () => {
    const db = new FakeDb()
    db.failIf = (call) => call.table === 'badges' && call.op !== 'select'
    const result = await create(db)

    expect(result).toMatchObject({ ok: false, failure: { reason: '배지를 만들지 못했어요' } })
    if (result.ok) throw new Error('실패여야 해요')
    expect(result.failure.detail).toContain('정리 delete 실패')
  })
})

describe('undo — 참조를 확인한 뒤 ID로 지운다', () => {
  const seed = (db: FakeDb, badge: Row = {}) => {
    db.tables.badges = [
      { id: BADGE_ID, name: '첫 믹스', valid_from: LATER, valid_until: null, deleted_at: null, ...badge },
      { id: EXISTING_BADGE_ID, name: '기존 배지', valid_from: PAST, valid_until: null, deleted_at: null },
    ]
  }

  it('참조가 없으면 그 ID의 행만 지우고 성공이다', async () => {
    const db = new FakeDb()
    seed(db)
    expect(await handler.undo(db.service, BADGE_ID)).toBeNull()
    expect(badgeIds(db)).toEqual([EXISTING_BADGE_ID])
  })

  it('공개 시각이 지난 배지도 지운다(시각 조건은 걸지 않는다: 멈춘 준비중 정리는 공개 시각 뒤에 올 수 있다)', async () => {
    const db = new FakeDb()
    seed(db, { valid_from: PAST })
    expect(await handler.undo(db.service, BADGE_ID)).toBeNull()
    expect(badgeIds(db)).toEqual([EXISTING_BADGE_ID])
    expect(deletes(db)[0].filters).toEqual([['id', BADGE_ID]])
  })

  it.each([
    ['user_activity_badges', { badge_id: BADGE_ID }],
    ['inventory_items', { badge_id: BADGE_ID }],
    ['point_transactions', { source_badge_id: BADGE_ID }],
    ['item_books', { reward_badge_id: BADGE_ID }],
    ['missions', { id: MISSION_ID, reward_badge_ids: [BADGE_ID] }],
    ['today_cards', { id: CARD_ID, badge_ids: [BADGE_ID] }],
    ['combination_recipes', { id: RECIPE_ID, reward_badge_ids: [BADGE_ID] }],
    ['combination_recipe_slots', { recipe_id: RECIPE_ID, allowed_badge_ids: [BADGE_ID] }],
  ])('%s에 이 배지를 가리키는 행이 있으면 지우지 않는다. 표 이름은 detail에만 있다', async (table, row) => {
    const db = new FakeDb()
    seed(db)
    db.tables[table] = [row]
    const failure = await handler.undo(db.service, BADGE_ID)

    expect(failure).toMatchObject({ reason: '획득 기록이나 연결이 있거나 확인하지 못해 배지를 지우지 않았어요' })
    expect(failure?.reason).not.toContain(table)
    expect(failure?.detail).toContain(table)
    expect(deletes(db)).toEqual([])
    expect(badgeIds(db)).toEqual([BADGE_ID, EXISTING_BADGE_ID])
  })

  it('다른 배지를 가리키는 행은 막지 않는다', async () => {
    const db = new FakeDb()
    seed(db)
    db.tables.missions = [{ id: MISSION_ID, reward_badge_ids: [EXISTING_BADGE_ID] }]
    expect(await handler.undo(db.service, BADGE_ID)).toBeNull()
  })

  it('참조를 읽지 못하면 지우지 않는다. DB 오류 원문은 detail에만 있다', async () => {
    const db = new FakeDb()
    seed(db)
    db.failIf = (call) => call.table === 'user_activity_badges'
    const failure = await handler.undo(db.service, BADGE_ID)

    expect(failure).toMatchObject({ reason: '획득 기록이나 연결이 있거나 확인하지 못해 배지를 지우지 않았어요' })
    expect(failure?.reason).not.toContain(DB_SECRET)
    expect(failure?.detail).toContain(DB_SECRET)
    expect(deletes(db)).toEqual([])
  })

  it('delete 오류는 「배지를 지우지 못했어요」다. DB 오류 원문은 detail에만 있다', async () => {
    const db = new FakeDb()
    seed(db)
    db.failIf = (call) => call.table === 'badges' && call.op === 'delete'
    const failure = await handler.undo(db.service, BADGE_ID)

    expect(failure).toMatchObject({ reason: '배지를 지우지 못했어요' })
    expect(failure?.reason).not.toContain(DB_SECRET)
    expect(failure?.detail).toContain(DB_SECRET)
  })
})

describe('cancel — 공개 전에만 지운다', () => {
  const seed = (db: FakeDb, badge: Row = {}) => {
    db.tables.badges = [
      { id: BADGE_ID, name: '첫 믹스', valid_from: LATER, valid_until: null, deleted_at: null, ...badge },
      { id: EXISTING_BADGE_ID, name: '기존 배지', valid_from: PAST, valid_until: null, deleted_at: null },
    ]
  }
  const cancel = (db: FakeDb) => handler.cancel(db.service, BADGE_ID, { now: NOW })
  const PUBLISHED = { ok: false, code: 'published', failure: { reason: '공개 시각이 지나 취소할 수 없어요' } }

  it('공개 전이고 참조가 없으면 그 ID의 행만 지우고 지울 때 `valid_from > 지금` 조건을 건다', async () => {
    const db = new FakeDb()
    seed(db)
    expect(await cancel(db)).toEqual({ ok: true, missing: false })
    expect(badgeIds(db)).toEqual([EXISTING_BADGE_ID])
    expect(deletes(db)).toHaveLength(1)
    expect(deletes(db)[0].filters).toEqual([
      ['id', BADGE_ID],
      ['valid_from >', NOW.toISOString()],
    ])
  })

  it('종료 시각이 있어도 공개 전이면 지운다', async () => {
    const db = new FakeDb()
    seed(db, { valid_until: after(LATER, 7 * DAY) })
    expect(await cancel(db)).toEqual({ ok: true, missing: false })
  })

  it('행이 없으면 운영툴 밖에서 지워진 것이라 성공(missing)이고 아무것도 지우지 않는다', async () => {
    const db = new FakeDb()
    expect(await cancel(db)).toEqual({ ok: true, missing: true })
    expect(deletes(db)).toEqual([])
  })

  it('소프트 삭제된 배지도 밖에서 지워진 것으로 본다(missing). 참조를 읽지도 지우지도 않는다', async () => {
    const db = new FakeDb()
    seed(db, { deleted_at: '2026-10-04T00:00:00.000Z' })
    expect(await cancel(db)).toEqual({ ok: true, missing: true })
    expect(deletes(db)).toEqual([])
    expect(db.calls.some((call) => call.table === 'user_activity_badges')).toBe(false)
  })

  it.each([
    ['공개 시각이 지났다', { valid_from: PAST }],
    ['공개 시각이 정확히 지금이다', { valid_from: NOW.toISOString() }],
    ['공개 시각이 비었다(바로 공개)', { valid_from: null }],
    ['공개 시각을 읽을 수 없다', { valid_from: '내일' }],
  ])('%s: published이고 지우지 않으며 참조도 읽지 않는다', async (_label, badge) => {
    const db = new FakeDb()
    seed(db, badge)
    expect(await cancel(db)).toEqual(PUBLISHED)
    expect(deletes(db)).toEqual([])
    expect(badgeIds(db)).toEqual([BADGE_ID, EXISTING_BADGE_ID])
    expect(db.calls.some((call) => call.table === 'user_activity_badges')).toBe(false)
  })

  it('종료 시각이 지났어도(종료됨) 공개 시각이 지났으면 published다', async () => {
    const db = new FakeDb()
    seed(db, { valid_from: '2026-09-01T00:00:00.000Z', valid_until: PAST })
    expect(await cancel(db)).toEqual(PUBLISHED)
  })

  it.each([
    ['user_activity_badges', { badge_id: BADGE_ID }],
    ['missions', { id: MISSION_ID, reward_badge_ids: [BADGE_ID] }],
    ['today_cards', { id: CARD_ID, badge_ids: [BADGE_ID] }],
  ])('%s에 이 배지를 가리키는 행이 있으면 referenced이고 지우지 않는다. 표 이름은 detail에만 있다', async (table, row) => {
    const db = new FakeDb()
    seed(db)
    db.tables[table] = [row]
    const result = await cancel(db)

    expect(result).toMatchObject({ ok: false, code: 'referenced', failure: { reason: '획득 기록이나 연결이 있거나 확인하지 못해 배지를 지우지 않았어요' } })
    if (result.ok) throw new Error('실패여야 해요')
    expect(result.failure.reason).not.toContain(table)
    expect(result.failure.detail).toContain(table)
    expect(deletes(db)).toEqual([])
  })

  it('참조를 읽지 못하면 referenced이고 지우지 않는다. DB 오류 원문은 detail에만 있다', async () => {
    const db = new FakeDb()
    seed(db)
    db.failIf = (call) => call.table === 'inventory_items'
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
      if (call.op === 'delete') (db.tables.badges[0] as Row).valid_from = PAST
    }
    expect(await cancel(db)).toEqual(PUBLISHED)
    expect(badgeIds(db)).toEqual([BADGE_ID, EXISTING_BADGE_ID])
  })

  it('지우려는 사이 다른 곳에서 먼저 지우면(삭제 경합) 다시 읽어 행이 없으니 missing이다', async () => {
    const db = new FakeDb()
    seed(db)
    db.beforeRun = (call) => {
      if (call.op === 'delete') db.tables.badges = (db.tables.badges as Row[]).filter((row) => row.id !== BADGE_ID)
    }
    expect(await cancel(db)).toEqual({ ok: true, missing: true })
    expect(badgeIds(db)).toEqual([EXISTING_BADGE_ID])
  })

  it('지우려는 사이 다른 곳에서 소프트 삭제하고 공개 시각도 지났으면 다시 읽은 행이 지워진 상태라 missing이다', async () => {
    const db = new FakeDb()
    seed(db)
    db.beforeRun = (call) => {
      if (call.op === 'delete') Object.assign(db.tables.badges[0] as Row, { valid_from: PAST, deleted_at: '2026-10-05T02:59:00.000Z' })
    }
    expect(await cancel(db)).toEqual({ ok: true, missing: true })
  })

  it.each([
    ['처음 읽기', (call: { op: string; table: string }) => call.table === 'badges' && call.op === 'select'],
    ['지우기', (call: { op: string; table: string }) => call.table === 'badges' && call.op === 'delete'],
  ])('%s 오류는 error이고 「배지를 지우지 못했어요」다. DB 오류 원문·배지 ID는 reason에 없다', async (_label, fails) => {
    const db = new FakeDb()
    seed(db)
    db.failIf = fails
    const result = await cancel(db)

    expect(result).toMatchObject({ ok: false, code: 'error', failure: { reason: '배지를 지우지 못했어요' } })
    if (result.ok) throw new Error('실패여야 해요')
    expect(result.failure.reason).not.toContain(DB_SECRET)
    expect(result.failure.reason).not.toContain(BADGE_ID)
    expect(result.failure.detail).toContain(DB_SECRET)
    expect(badgeIds(db)).toEqual([BADGE_ID, EXISTING_BADGE_ID])
  })

  it('지운 행이 없고 다시 읽기마저 실패하면 error다', async () => {
    const db = new FakeDb()
    seed(db)
    let selects = 0
    db.beforeRun = (call) => {
      if (call.op === 'delete') (db.tables.badges[0] as Row).valid_from = PAST
    }
    db.failIf = (call) => call.table === 'badges' && call.op === 'select' && ++selects === 2
    const result = await cancel(db)

    expect(result).toMatchObject({ ok: false, code: 'error', failure: { reason: '배지를 지우지 못했어요' } })
    if (result.ok) throw new Error('실패여야 해요')
    expect(result.failure.detail).toContain(DB_SECRET)
  })
})

describe('observe — 배지의 지금 상태를 읽는다', () => {
  const STARTS = '2026-10-05T00:00:00.000Z' // NOW(10/5 12:00 KST = 03:00Z)보다 앞
  const ENDS = '2026-10-12T00:00:00.000Z' // NOW보다 뒤
  const seed = (db: FakeDb, badge: Row = {}) => {
    db.tables.badges = [
      { id: BADGE_ID, name: '첫 믹스', valid_from: STARTS, valid_until: ENDS, deleted_at: null, ...badge },
      { id: EXISTING_BADGE_ID, name: '기존 배지', valid_from: LATER, valid_until: null, deleted_at: null },
    ]
  }
  const observe = (db: FakeDb) => handler.observe(db.service, BADGE_ID, { now: NOW })

  it('행이 없으면 missing이다(운영툴 밖에서 지워짐)', async () => {
    expect(await observe(new FakeDb())).toEqual({ status: 'missing' })
  })

  it('소프트 삭제된 배지도 missing이다', async () => {
    const db = new FakeDb()
    seed(db, { deleted_at: '2026-10-04T00:00:00.000Z' })
    expect(await observe(db)).toEqual({ status: 'missing' })
  })

  it('공개 전이면 published·ended가 둘 다 false이고 공개·종료 시각을 그대로 알린다. 비활성 칸은 없어 inactive는 늘 false다', async () => {
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

  it.each([
    ['공개 시각이 비었다', { valid_from: null }],
    ['공개 시각을 읽을 수 없다', { valid_from: '내일' }],
    ['종료 시각을 읽을 수 없다', { valid_until: '다음 주' }],
  ])('%s: 상태를 바꾸지 않도록 error다', async (_label, badge) => {
    const db = new FakeDb()
    seed(db, badge)
    expect(await observe(db)).toEqual({ status: 'error', detail: '배지 시각을 읽을 수 없어요' })
  })

  it('읽지 못하면 error이고 DB 오류 원문은 detail에만 있다', async () => {
    const db = new FakeDb()
    seed(db)
    db.failIf = (call) => call.table === 'badges'
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
    expect(db.calls.map((call) => call.table)).toEqual(['badges'])
  })
})

describe('응답에 나가는 사유 — DB 원문·자원 ID 비노출', () => {
  it('모든 고정 문장에는 ID·칼럼 이름·DB 오류 원문이 없다', () => {
    for (const reason of Object.values(JAM_BADGE_MESSAGES)) {
      expect(reason).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/)
      expect(reason).not.toMatch(/valid_from|valid_until|deleted_at|badge_id|combination_recipes/)
      expect(reason).not.toContain(DB_SECRET)
    }
  })
})
