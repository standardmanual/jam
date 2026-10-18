/**
 * 미션 핸들러 (티켓 20261002_1944, 상위 20260930_1500 ⑥). 가정 1~5는 티켓 「착수 전에 정한 것」 번호다. 틀은 `homeFeedCard.test.ts`다.
 *
 * - prepare: 페이로드의 `id`·툴이 정하는 값(`exposure_mode`·`image_source`)·연결 칸, 형식 오류 문장과 「외 N건」
 * - check: 검사 라벨마다 고정 문장(가정 3), 제목 중복은 기간이 겹칠 때만(가정 2), DB 오류·기존 미션 ID는 `reason`에 없다
 * - create: insert 칸·같은 ID 반환, 오류 때 정리 delete 한 번과 원문 비노출
 * - undo: 사용자 데이터·연결이 있으면 지우지 않고, 없으면 ID로 지운다. 카드가 가리키는 동안은 지워지지 않는다(그래서 카드가 먼저다)
 * - cancel: 없음·공개됨(노출 방식별)·기록 있음·삭제 경합·오류 비노출
 * - observe: 없음·공개 판정(노출 방식별)·종료·숨김·쓰기 없음·읽기 실패 비노출
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ override: null as null | (() => unknown) }))

// 표에 없는 라벨의 실패를 만들기 위해 DB 검사 결과를 바꿔 끼울 수 있게 한다. 값이 없으면 실제 검사를 그대로 부른다.
vi.mock('@/lib/admin/registerChecks/mission', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/registerChecks/mission')>()
  return {
    ...actual,
    runMissionDbChecks: (args: Parameters<typeof actual.runMissionDbChecks>[0]) => (h.override ? h.override() : actual.runMissionDbChecks(args)),
  }
})

import { asRegisterChecksClient, RESOURCE_KEY_BY_KIND, type ExecuteLinkedIds } from '../handlers'
import { MISSION_HANDLER as handler } from '../mission'
import { DB_SECRET, FakeDb, type Row } from './fakeDb'
import { LATER, NOW, makeItem } from './fixtures'

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const MISSION_ID = uid(1)
const EXISTING_MISSION_ID = uid(2)
const CARD_ID = uid(3)
const BADGE_ID = uid(4)
const OTHER_BADGE_ID = uid(5)
const POI_ID = uid(6)
/** `LATER`(10/10 09:00 KST)를 등록 형식으로 바꾼 공개 시각. */
const STARTS_AT = new Date(LATER).toISOString()
const DAY = 24 * 60 * 60_000
const after = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString()

type Raw = Record<string, unknown>

/** 검사를 통과하는 미션 항목. `resource`·`original`·`copy`는 칸 단위로, 행의 시각은 `row`로 덮는다. */
function missionItem(resource: Raw = {}, original: Raw = {}, copy: Raw = {}, row: { startsAt?: string; endsAt?: string | null } = {}) {
  return makeItem({
    key: 'mission',
    kind: 'mission',
    original: { copy: { title: '주말 러닝', description: '주말에 30km를 달려요.', ...copy }, ...original },
    resource: { mission_type: 'distance', condition_json: { activity_type: 'running', distance_km: 30 }, ...resource },
    ...row,
  })
}

function prepared(item = missionItem(), linkedIds: ExecuteLinkedIds = {}) {
  const outcome = handler.prepare(item, { id: MISSION_ID, actorId: 'admin-1', linkedIds, now: NOW })
  if (!outcome.ok) throw new Error(`prepare 실패: ${outcome.failure.reason}`)
  return outcome.value
}

const checkOf = (db: FakeDb, item = missionItem(), linkedIds: ExecuteLinkedIds = {}) => handler.check(asRegisterChecksClient(db.service), prepared(item, linkedIds), { now: NOW })
const deletes = (db: FakeDb) => db.calls.filter((call) => call.op === 'delete')

beforeEach(() => {
  h.override = null
})

describe('핸들러 정의', () => {
  it('종류·자원 키·정한 ID 먼저 만들기가 계약대로다', () => {
    expect(handler.kind).toBe('mission')
    expect(handler.resourceKey).toBe(RESOURCE_KEY_BY_KIND.mission)
    expect(handler.resourceKey).toBe('mission_id')
    expect(handler.idFirst).toBe(true)
  })
})

describe('prepare', () => {
  it('정한 ID·툴이 정하는 값(start_date·이미지 없음)·종료 없음(상시)이 페이로드에 들어간다', () => {
    const value = prepared()
    expect(value.id).toBe(MISSION_ID)
    expect(value.payload).toMatchObject({
      id: MISSION_ID,
      title: '주말 러닝',
      description: '주말에 30km를 달려요.',
      mission_type: 'distance',
      condition_json: { activity_type: 'running', distance_km: 30 },
      starts_at: STARTS_AT,
      ends_at: null,
      exposure_mode: 'start_date',
      exposure_at: null,
      image_url: null,
      image_source: null,
      reward_badge_ids: [],
    })
    expect(value.linkFields).toEqual([])
  })

  it('종료 시각이 있으면 그 값이다', () => {
    const endsAt = after(LATER, 7 * DAY)
    expect(prepared(missionItem({}, {}, {}, { endsAt })).payload.ends_at).toBe(endsAt)
  })

  it('연결 칸: 연결로 채운 보상 배지가 페이로드에 들어가고 linkFields·linkedIds가 그대로 남는다', () => {
    const linkedIds = { reward_badge_ids: [BADGE_ID] }
    const value = prepared(missionItem(), linkedIds)
    expect(value.payload).toMatchObject({ reward_badge_ids: [BADGE_ID] })
    expect(value.linkFields).toEqual(['reward_badge_ids'])
    expect(value.linkedIds).toBe(linkedIds)
  })

  it('경고는 막지 않고 그대로 돌려준다', () => {
    const value = prepared(missionItem({ mood: 'calm' }))
    expect(value.warnings.map((issue) => issue.path)).toEqual(['resource.mood'])
  })

  it('형식 오류가 하나면 「미션 형식이 맞지 않아요: {오류 문장}」이고 DB 오류 원문은 없다', () => {
    const outcome = handler.prepare(missionItem({}, {}, { description: undefined }), { id: MISSION_ID, actorId: 'admin-1', linkedIds: {}, now: NOW })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.reason).toMatch(/^미션 형식이 맞지 않아요: mission\.description: /)
    expect(outcome.failure.reason).not.toMatch(/외 \d+건/)
    expect(outcome.failure.detail).toContain('description')
  })

  it('형식 오류가 둘 이상이면 첫 문장만 싣고 끝에 「 (외 N건)」을 붙인다', () => {
    const outcome = handler.prepare(missionItem({ mission_type: 'nope' }, {}, { title: '' }), { id: MISSION_ID, actorId: 'admin-1', linkedIds: {}, now: NOW })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    const errors = outcome.failure.detail?.split(' / ') ?? []
    expect(errors.length).toBeGreaterThanOrEqual(2)
    expect(outcome.failure.reason).toMatch(new RegExp(`^미션 형식이 맞지 않아요: .+ \\(외 ${errors.length - 1}건\\)$`))
    // 첫 문장 하나만 싣는다
    expect(outcome.failure.reason).not.toContain(errors[1])
  })

  it('다른 종류의 항목은 변환 오류로 막는다', () => {
    const outcome = handler.prepare(makeItem({ key: 'c', kind: 'home_feed_card' }), { id: MISSION_ID, actorId: 'admin-1', linkedIds: {}, now: NOW })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.failure.reason).toMatch(/^미션 형식이 맞지 않아요: kind: /)
  })
})

describe('check — 가정 3의 고정 문장', () => {
  it('모두 있으면 통과하고, 제목은 같은 제목의 기존 미션 전부(id·공개·종료)를 읽는다', async () => {
    const db = new FakeDb()
    db.tables.badges = [{ id: BADGE_ID, deleted_at: null }]
    db.tables.poi = [{ id: POI_ID }]
    expect(await checkOf(db, missionItem({ reward_badge_ids: [BADGE_ID] }))).toBeNull()
    expect(await checkOf(db, missionItem({ mission_type: 'item_collect', condition_json: { badge_id: BADGE_ID } }))).toBeNull()
    expect(await checkOf(db, missionItem({ mission_type: 'checkin', condition_json: { poi_id: POI_ID } }))).toBeNull()
    const titleRead = db.calls.find((call) => call.table === 'missions')
    expect(titleRead?.filters).toEqual([['title', '주말 러닝']])
  })

  it('같은 제목이고 기간이 겹치면 → 「같은 제목의 미션이 이미 있고 기간이 겹쳐요」이고 기존 미션 ID는 detail에만 있다', async () => {
    const db = new FakeDb()
    db.tables.missions = [{ id: EXISTING_MISSION_ID, title: '주말 러닝', starts_at: after(LATER, -DAY), ends_at: null }]
    const failure = await checkOf(db)
    expect(failure?.reason).toBe('같은 제목의 미션이 이미 있고 기간이 겹쳐요')
    expect(failure?.reason).not.toContain(EXISTING_MISSION_ID)
    expect(failure?.reason).not.toContain(MISSION_ID)
    expect(failure?.detail).toContain(EXISTING_MISSION_ID)
  })

  it('같은 제목이어도 기간이 겹치지 않으면 통과한다: 기존 미션의 종료와 새 미션의 공개가 같은 경계', async () => {
    const db = new FakeDb()
    db.tables.missions = [{ id: EXISTING_MISSION_ID, title: '주말 러닝', starts_at: after(LATER, -7 * DAY), ends_at: LATER }]
    expect(await checkOf(db)).toBeNull()
  })

  it('새 미션이 기존 미션이 열리는 순간에 끝나면 겹치지 않고, 종료가 1밀리초 늦으면 겹친다', async () => {
    const existing = { id: EXISTING_MISSION_ID, title: '주말 러닝', starts_at: after(LATER, 7 * DAY), ends_at: null }
    const touching = new FakeDb()
    touching.tables.missions = [existing]
    expect(await checkOf(touching, missionItem({}, {}, {}, { endsAt: existing.starts_at }))).toBeNull()

    const overlapping = new FakeDb()
    overlapping.tables.missions = [existing]
    const failure = await checkOf(overlapping, missionItem({}, {}, {}, { endsAt: after(existing.starts_at, 1) }))
    expect(failure?.reason).toBe('같은 제목의 미션이 이미 있고 기간이 겹쳐요')
  })

  it('제목이 다른 미션은 기간이 겹쳐도 상관없다', async () => {
    const db = new FakeDb()
    db.tables.missions = [{ id: EXISTING_MISSION_ID, title: '평일 러닝', starts_at: LATER, ends_at: null }]
    expect(await checkOf(db)).toBeNull()
  })

  it.each([
    ['보상 배지 존재', missionItem({ reward_badge_ids: [BADGE_ID] }), '보상으로 정한 배지가 없거나 삭제됐어요', BADGE_ID],
    ['조건 배지 존재', missionItem({ mission_type: 'item_collect', condition_json: { badge_id: BADGE_ID } }), '달성 조건의 배지가 없거나 삭제됐어요', BADGE_ID],
    ['조건 장소 존재', missionItem({ mission_type: 'checkin', condition_json: { poi_id: POI_ID } }), '달성 조건의 장소를 찾을 수 없어요', POI_ID],
  ])('%s 실패 → 「%s」이고 칼럼 이름·ID는 detail에만 있다', async (_label, item, reason, missingId) => {
    const db = new FakeDb()
    const failure = await checkOf(db, item)
    expect(failure?.reason).toBe(reason)
    expect(failure?.reason).not.toMatch(/_id|ids|condition_json/)
    expect(failure?.reason).not.toContain(missingId)
    expect(failure?.detail).toContain(missingId)
  })

  it('삭제된 배지(deleted_at이 있음)는 없는 것으로 본다', async () => {
    const db = new FakeDb()
    db.tables.badges = [{ id: BADGE_ID, deleted_at: '2026-10-01T00:00:00.000Z' }]
    const failure = await checkOf(db, missionItem({ reward_badge_ids: [BADGE_ID] }))
    expect(failure?.reason).toBe('보상으로 정한 배지가 없거나 삭제됐어요')
  })

  it('연결로 채운 보상 배지는 같은 실행에서 만들 ID라 존재 확인에서 뺀다', async () => {
    const db = new FakeDb() // 배지 테이블이 비어 있어도 통과한다
    expect(await checkOf(db, missionItem(), { reward_badge_ids: [BADGE_ID] })).toBeNull()
    expect(db.calls.map((call) => call.table)).toEqual(['missions'])
  })

  it('resource가 정한 보상 배지는 연결 몫과 섞여도 존재를 확인한다(연결 몫만 뺀다)', async () => {
    const item = missionItem({ reward_badge_ids: [OTHER_BADGE_ID] })
    const missing = new FakeDb()
    const failure = await checkOf(missing, item, { reward_badge_ids: [BADGE_ID] })
    expect(failure?.reason).toBe('보상으로 정한 배지가 없거나 삭제됐어요')
    expect(failure?.detail).toContain(OTHER_BADGE_ID)
    expect(failure?.detail).not.toContain(BADGE_ID)

    const present = new FakeDb()
    present.tables.badges = [{ id: OTHER_BADGE_ID, deleted_at: null }]
    expect(await checkOf(present, item, { reward_badge_ids: [BADGE_ID] })).toBeNull()
  })

  it('DB를 읽지 못하면 라벨과 상관없이 「등록 전 확인 중 DB를 읽지 못했어요」이고 원문은 detail에만 있다', async () => {
    const db = new FakeDb()
    db.failIf = (call) => call.table === 'missions' && call.op === 'select'
    const failure = await checkOf(db)
    expect(failure?.reason).toBe('등록 전 확인 중 DB를 읽지 못했어요')
    expect(failure?.reason).not.toContain(DB_SECRET)
    expect(failure?.reason).not.toContain(MISSION_ID)
    expect(failure?.detail).toContain(DB_SECRET)

    const other = new FakeDb()
    other.failIf = (call) => call.table === 'badges'
    const otherFailure = await checkOf(other, missionItem({ reward_badge_ids: [BADGE_ID] }))
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
    db.tables.missions = [{ id: EXISTING_MISSION_ID, title: '주말 러닝', starts_at: LATER, ends_at: null }]
    const failure = await checkOf(db, missionItem({ reward_badge_ids: [BADGE_ID] }))
    expect(failure?.reason).toBe('같은 제목의 미션이 이미 있고 기간이 겹쳐요')
    expect(failure?.detail).toContain(EXISTING_MISSION_ID)
    expect(failure?.detail).toContain(BADGE_ID)
  })

  it('검사는 읽기만 한다', async () => {
    const db = new FakeDb()
    db.tables.badges = [{ id: BADGE_ID, deleted_at: null }]
    await checkOf(db, missionItem({ reward_badge_ids: [BADGE_ID] }))
    expect(db.calls.length).toBeGreaterThan(0)
    expect(db.calls.every((call) => call.op === 'select')).toBe(true)
  })
})

describe('create — 정한 ID로 만든다', () => {
  it('insert 페이로드의 id는 prepared.id이고 같은 ID를 돌려준다', async () => {
    const db = new FakeDb()
    const value = prepared(missionItem({ reward_badge_ids: [BADGE_ID] }, { pattern_no: 'P07' }))
    const outcome = await handler.create(db.service, value, { now: NOW })

    expect(outcome).toEqual({ ok: true, value: { id: MISSION_ID } })
    const inserts = db.calls.filter((call) => call.op === 'insert')
    expect(inserts).toHaveLength(1)
    expect(inserts[0].table).toBe('missions')
    expect(inserts[0].payload).toBe(value.payload)
    expect(db.tables.missions).toHaveLength(1)
    expect(db.tables.missions[0]).toMatchObject({
      id: MISSION_ID,
      title: '주말 러닝',
      starts_at: STARTS_AT,
      ends_at: null,
      exposure_mode: 'start_date',
      exposure_at: null,
      image_source: null,
      reward_badge_ids: [BADGE_ID],
    })
    expect(deletes(db)).toEqual([])
  })

  it('insert가 오류를 받으면 같은 ID로 delete를 한 번 시도하고 사유에는 원문이 없다', async () => {
    const db = new FakeDb()
    // 오류 응답인데 행이 생긴 경우를 흉내 낸다.
    db.beforeRun = (call) => {
      if (call.op === 'insert') db.tables.missions.push({ id: MISSION_ID })
    }
    db.failIf = (call) => call.op === 'insert'
    const outcome = await handler.create(db.service, prepared(), { now: NOW })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.reason).toBe('미션을 만들지 못했어요')
    expect(outcome.failure.reason).not.toContain(DB_SECRET)
    expect(outcome.failure.reason).not.toContain(MISSION_ID)
    expect(outcome.failure.detail).toContain(DB_SECRET)
    expect(deletes(db)).toHaveLength(1)
    expect(deletes(db)[0]).toMatchObject({ table: 'missions', filters: [['id', MISSION_ID]] })
    expect(db.tables.missions).toEqual([])
  })

  it('정리 delete도 실패하면 결과를 detail에만 적고 사유는 그대로다', async () => {
    const db = new FakeDb()
    db.failIf = (call) => call.table === 'missions' && call.op !== 'select'
    const outcome = await handler.create(db.service, prepared(), { now: NOW })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.reason).toBe('미션을 만들지 못했어요')
    expect(outcome.failure.detail).toContain('정리 delete 실패')
    expect(outcome.failure.detail).toContain(DB_SECRET)
    expect(deletes(db)).toHaveLength(1)
  })
})

describe('undo — 참조를 확인한 뒤 ID로 지운다', () => {
  const seed = (db: FakeDb) => {
    db.tables.missions = [{ id: MISSION_ID }, { id: EXISTING_MISSION_ID }]
  }
  const REASON = '참여 기록이나 연결이 있거나 확인하지 못해 미션을 지우지 않았어요'

  it.each([
    ['user_mission_participations', { mission_id: MISSION_ID }],
    ['user_mission_completions', { mission_id: MISSION_ID }],
    ['mission_rank_snapshots', { mission_id: MISSION_ID }],
    ['point_transactions', { source_mission_id: MISSION_ID }],
    ['today_cards', { id: CARD_ID, mission_id: MISSION_ID }],
    ['ranking_modes', { id: 'rank-1', target_mission_id: MISSION_ID }],
  ])('%s에 이 미션을 가리키는 행이 있으면 지우지 않고 고정 사유를 돌려준다', async (table, row) => {
    const db = new FakeDb()
    seed(db)
    db.tables[table] = [...(db.tables[table] ?? []), row]
    const failure = await handler.undo(db.service, MISSION_ID)

    expect(failure?.reason).toBe(REASON)
    expect(failure?.reason).not.toContain(table)
    expect(failure?.detail).toContain(table)
    expect(deletes(db)).toEqual([])
    expect(db.tables.missions).toHaveLength(2)
  })

  it('참조를 읽지 못하면 확인 없이 지우지 않고 원문은 detail에만 있다', async () => {
    const db = new FakeDb()
    seed(db)
    db.failIf = (call) => call.table === 'user_mission_participations'
    const failure = await handler.undo(db.service, MISSION_ID)

    expect(failure?.reason).toBe(REASON)
    expect(failure?.reason).not.toContain(DB_SECRET)
    expect(failure?.detail).toContain(DB_SECRET)
    expect(deletes(db)).toEqual([])
    expect(db.tables.missions).toHaveLength(2)
  })

  it('기록이 없으면 미션을 ID로 지우고 다른 미션은 건드리지 않는다. 다른 미션의 기록은 상관없다', async () => {
    const db = new FakeDb()
    seed(db)
    db.tables.user_mission_participations = [{ id: 'p-1', mission_id: EXISTING_MISSION_ID }]
    expect(await handler.undo(db.service, MISSION_ID)).toBeNull()

    expect(deletes(db)).toHaveLength(1)
    expect(deletes(db)[0]).toMatchObject({ table: 'missions', filters: [['id', MISSION_ID]] })
    expect((db.tables.missions as Row[]).map((row) => row.id)).toEqual([EXISTING_MISSION_ID])
    // 참조 확인이 지우기보다 먼저다
    const order = db.calls.map((call) => `${call.table}:${call.op}`)
    expect(order.indexOf('today_cards:select')).toBeLessThan(order.indexOf('missions:delete'))
  })

  it('카드가 지워진 뒤에는 미션을 지울 수 있다(그래서 되돌림은 카드가 먼저다)', async () => {
    const db = new FakeDb()
    seed(db)
    db.tables.today_cards = [{ id: CARD_ID, mission_id: MISSION_ID }]
    expect((await handler.undo(db.service, MISSION_ID))?.reason).toBe(REASON)
    db.tables.today_cards = []
    expect(await handler.undo(db.service, MISSION_ID)).toBeNull()
    expect((db.tables.missions as Row[]).map((row) => row.id)).toEqual([EXISTING_MISSION_ID])
  })

  it('delete 오류는 「미션을 지우지 못했어요」이고 원문은 detail에만 있다', async () => {
    const db = new FakeDb()
    seed(db)
    db.failIf = (call) => call.op === 'delete'
    const failure = await handler.undo(db.service, MISSION_ID)

    expect(failure?.reason).toBe('미션을 지우지 못했어요')
    expect(failure?.reason).not.toContain(DB_SECRET)
    expect(failure?.reason).not.toContain(MISSION_ID)
    expect(failure?.detail).toContain(DB_SECRET)
  })
})

describe('cancel — 공개 전에만 지운다', () => {
  const PAST = '2026-10-05T02:00:00.000Z' // NOW(10/5 12:00 KST = 03:00Z)보다 앞
  const seed = (db: FakeDb, mission: Row = {}) => {
    db.tables.missions = [
      { id: MISSION_ID, starts_at: LATER, ends_at: null, exposure_mode: 'start_date', exposure_at: null, ...mission },
      { id: EXISTING_MISSION_ID, starts_at: LATER, ends_at: null, exposure_mode: 'start_date', exposure_at: null },
    ]
  }
  const cancel = (db: FakeDb) => handler.cancel(db.service, MISSION_ID, { now: NOW })
  const ids = (db: FakeDb) => (db.tables.missions as Row[]).map((row) => row.id)

  it('공개 전이고 기록이 없으면 ID로 지우고 다른 미션은 건드리지 않는다. 지울 때 공개 시각 조건을 건다', async () => {
    const db = new FakeDb()
    seed(db)
    expect(await cancel(db)).toEqual({ ok: true, missing: false })

    expect(ids(db)).toEqual([EXISTING_MISSION_ID])
    expect(deletes(db)).toHaveLength(1)
    expect(deletes(db)[0]).toMatchObject({ table: 'missions', filters: [['id', MISSION_ID], ['starts_at >', NOW.toISOString()]] })
    // 읽기 → 참조 확인 → 지우기 순서
    const order = db.calls.map((call) => `${call.table}:${call.op}`)
    expect(order.indexOf('missions:select')).toBeLessThan(order.indexOf('user_mission_participations:select'))
    expect(order.indexOf('user_mission_participations:select')).toBeLessThan(order.indexOf('missions:delete'))
  })

  it('행이 없으면 밖에서 지워진 것이라 성공(missing)이고 아무것도 쓰지 않으며 참조도 읽지 않는다', async () => {
    const db = new FakeDb()
    expect(await cancel(db)).toEqual({ ok: true, missing: true })
    expect(db.calls.filter((call) => call.op !== 'select')).toEqual([])
    expect(db.calls.some((call) => call.table === 'user_mission_participations')).toBe(false)
  })

  it.each([
    ['공개 시각이 지났다', { starts_at: PAST }],
    ['공개 시각이 정확히 지금이다', { starts_at: NOW.toISOString() }],
    ['노출일 지정이고 노출일이 지났다(공개 시각은 아직 앞)', { exposure_mode: 'scheduled', exposure_at: PAST }],
  ])('%s: published이고 지우지 않으며 참조도 읽지 않는다', async (_label, mission) => {
    const db = new FakeDb()
    seed(db, mission)
    const result = await cancel(db)

    expect(result).toEqual({ ok: false, code: 'published', failure: { reason: '공개 시각이 지나 취소할 수 없어요' } })
    expect(deletes(db)).toEqual([])
    expect(ids(db)).toEqual([MISSION_ID, EXISTING_MISSION_ID])
    expect(db.calls.some((call) => call.table === 'user_mission_participations')).toBe(false)
  })

  it('노출일 지정이어도 노출일이 아직 앞이고 공개 시각도 앞이면 지울 수 있다', async () => {
    const db = new FakeDb()
    seed(db, { exposure_mode: 'scheduled', exposure_at: LATER })
    expect(await cancel(db)).toEqual({ ok: true, missing: false })
    expect(ids(db)).toEqual([EXISTING_MISSION_ID])
  })

  it('숨김이어도 공개 시각이 지났으면 지우지 않는다: 지울 때 건 조건에 걸려 다시 읽어 published다', async () => {
    const db = new FakeDb()
    seed(db, { exposure_mode: 'hidden', starts_at: PAST })
    const result = await cancel(db)

    expect(result).toEqual({ ok: false, code: 'published', failure: { reason: '공개 시각이 지나 취소할 수 없어요' } })
    expect(ids(db)).toEqual([MISSION_ID, EXISTING_MISSION_ID])
  })

  it.each([
    ['user_mission_participations', { mission_id: MISSION_ID }],
    ['today_cards', { id: CARD_ID, mission_id: MISSION_ID }],
  ])('%s에 이 미션을 가리키는 행이 있으면 referenced이고 지우지 않는다. 테이블 이름은 detail에만 있다', async (table, row) => {
    const db = new FakeDb()
    seed(db)
    db.tables[table] = [row]
    const result = await cancel(db)

    expect(result).toMatchObject({ ok: false, code: 'referenced', failure: { reason: '참여 기록이나 연결이 있거나 확인하지 못해 미션을 지우지 않았어요' } })
    if (result.ok) throw new Error('실패여야 해요')
    expect(result.failure.reason).not.toContain(table)
    expect(result.failure.detail).toContain(table)
    expect(deletes(db)).toEqual([])
  })

  it('참조를 읽지 못하면 referenced이고 지우지 않는다. DB 오류 원문은 detail에만 있다', async () => {
    const db = new FakeDb()
    seed(db)
    db.failIf = (call) => call.table === 'user_mission_completions'
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
      if (call.op === 'delete') (db.tables.missions[0] as Row).starts_at = PAST
    }
    const result = await cancel(db)

    expect(result).toMatchObject({ ok: false, code: 'published', failure: { reason: '공개 시각이 지나 취소할 수 없어요' } })
    expect(ids(db)).toEqual([MISSION_ID, EXISTING_MISSION_ID])
  })

  it('지우려는 사이 다른 곳에서 먼저 지우면(삭제 경합) 다시 읽어 행이 없으니 missing이다', async () => {
    const db = new FakeDb()
    seed(db)
    db.beforeRun = (call) => {
      if (call.op === 'delete') db.tables.missions = (db.tables.missions as Row[]).filter((row) => row.id !== MISSION_ID)
    }
    expect(await cancel(db)).toEqual({ ok: true, missing: true })
    expect(ids(db)).toEqual([EXISTING_MISSION_ID])
  })

  it.each([
    ['처음 읽기', (call: { op: string; table: string }) => call.table === 'missions' && call.op === 'select'],
    ['지우기', (call: { op: string; table: string }) => call.table === 'missions' && call.op === 'delete'],
  ])('%s 오류는 error이고 「미션을 지우지 못했어요」다. DB 오류 원문·미션 ID는 reason에 없다', async (_label, fails) => {
    const db = new FakeDb()
    seed(db)
    db.failIf = fails
    const result = await cancel(db)

    expect(result).toMatchObject({ ok: false, code: 'error', failure: { reason: '미션을 지우지 못했어요' } })
    if (result.ok) throw new Error('실패여야 해요')
    expect(result.failure.reason).not.toContain(DB_SECRET)
    expect(result.failure.reason).not.toContain(MISSION_ID)
    expect(result.failure.detail).toContain(DB_SECRET)
    expect(ids(db)).toEqual([MISSION_ID, EXISTING_MISSION_ID])
  })

  it('지운 행이 없고 다시 읽기마저 실패하면 error다', async () => {
    const db = new FakeDb()
    seed(db)
    let selects = 0
    db.beforeRun = (call) => {
      if (call.op === 'delete') (db.tables.missions[0] as Row).starts_at = PAST
    }
    db.failIf = (call) => call.table === 'missions' && call.op === 'select' && ++selects === 2
    const result = await cancel(db)

    expect(result).toMatchObject({ ok: false, code: 'error', failure: { reason: '미션을 지우지 못했어요' } })
    if (result.ok) throw new Error('실패여야 해요')
    expect(result.failure.detail).toContain(DB_SECRET)
  })
})

describe('observe — 미션의 지금 상태를 읽는다', () => {
  const STARTS = '2026-10-05T00:00:00.000Z' // NOW(10/5 12:00 KST = 03:00Z)보다 앞
  const ENDS = '2026-10-12T00:00:00.000Z' // NOW보다 뒤
  const seed = (db: FakeDb, mission: Row = {}) => {
    db.tables.missions = [
      { id: MISSION_ID, starts_at: STARTS, ends_at: ENDS, exposure_mode: 'start_date', exposure_at: null, ...mission },
      { id: EXISTING_MISSION_ID, starts_at: LATER, ends_at: null, exposure_mode: 'start_date', exposure_at: null },
    ]
  }
  const observe = (db: FakeDb, now: Date = NOW) => handler.observe(db.service, MISSION_ID, { now })

  it('공개 시각이 지나고 종료 전이면 공개 중이다. 시각은 미션의 값 그대로 돌려주고 아무것도 쓰지 않는다', async () => {
    const db = new FakeDb()
    seed(db)
    expect(await observe(db)).toEqual({ status: 'present', published: true, ended: false, startsAt: STARTS, endsAt: ENDS, inactive: false })
    expect(db.calls.filter((call) => call.op !== 'select')).toEqual([])
    expect(db.calls.map((call) => call.table)).toEqual(['missions'])
  })

  it('공개 시각 전이면 공개 중이 아니고 종료도 아니다', async () => {
    const db = new FakeDb()
    seed(db, { starts_at: LATER })
    expect(await observe(db)).toMatchObject({ status: 'present', published: false, ended: false, inactive: false })
  })

  it('공개 시각이 정확히 지금이면 공개 중이다', async () => {
    const db = new FakeDb()
    seed(db, { starts_at: NOW.toISOString() })
    expect(await observe(db)).toMatchObject({ status: 'present', published: true, ended: false })
  })

  it('종료 시각이 정확히 지금이면 아직 종료가 아니고, 1밀리초 지나면 공개 중이 아니고 종료다', async () => {
    const db = new FakeDb()
    seed(db, { ends_at: NOW.toISOString() })
    expect(await observe(db)).toMatchObject({ status: 'present', published: true, ended: false })
    expect(await observe(db, new Date(NOW.getTime() + 1))).toMatchObject({ status: 'present', published: false, ended: true })
  })

  it('종료 시각이 없으면(상시) 종료되지 않고 endsAt은 null이다', async () => {
    const db = new FakeDb()
    seed(db, { ends_at: null })
    expect(await observe(db, new Date('2030-01-01T00:00:00.000Z'))).toEqual({
      status: 'present',
      published: true,
      ended: false,
      startsAt: STARTS,
      endsAt: null,
      inactive: false,
    })
  })

  it('노출일 지정이면 공개 시각은 노출일이다: 노출일 전이면 공개 중이 아니고 startsAt은 노출일이다', async () => {
    const db = new FakeDb()
    seed(db, { exposure_mode: 'scheduled', exposure_at: LATER })
    expect(await observe(db)).toEqual({ status: 'present', published: false, ended: false, startsAt: LATER, endsAt: ENDS, inactive: false })

    seed(db, { exposure_mode: 'scheduled', exposure_at: STARTS, starts_at: LATER })
    expect(await observe(db)).toMatchObject({ published: true, startsAt: STARTS })
  })

  it('노출일 지정인데 노출일이 비었으면 공개 중이 아니고 startsAt은 null이다(보이지 않게 닫힌 상태)', async () => {
    const db = new FakeDb()
    seed(db, { exposure_mode: 'scheduled', exposure_at: null })
    expect(await observe(db)).toMatchObject({ status: 'present', published: false, startsAt: null })
  })

  it('숨김은 공개 중이 아니고 inactive다. 기간이 지났으면 종료이기도 하다', async () => {
    const db = new FakeDb()
    seed(db, { exposure_mode: 'hidden' })
    expect(await observe(db)).toMatchObject({ status: 'present', published: false, ended: false, inactive: true })

    seed(db, { exposure_mode: 'hidden', ends_at: '2026-10-05T02:00:00.000Z' })
    expect(await observe(db)).toMatchObject({ status: 'present', published: false, ended: true, inactive: true })
  })

  it('행이 없으면 missing이다', async () => {
    const db = new FakeDb()
    expect(await observe(db)).toEqual({ status: 'missing' })
  })

  it('읽지 못하면 error이고 원문은 detail에만 있다', async () => {
    const db = new FakeDb()
    seed(db)
    db.failIf = (call) => call.table === 'missions'
    const result = await observe(db)

    expect(result.status).toBe('error')
    if (result.status !== 'error') throw new Error('error여야 해요')
    expect(result.detail).toContain(DB_SECRET)
  })

  it.each([
    ['종료 시각', { ends_at: 'not-a-date' }],
    ['공개 시각', { starts_at: 'not-a-date' }],
    ['노출일', { exposure_mode: 'scheduled', exposure_at: 'not-a-date' }],
  ])('%s을 읽을 수 없으면 판정하지 않고 error다', async (_label, mission) => {
    const db = new FakeDb()
    seed(db, mission)
    expect(await observe(db)).toEqual({ status: 'error', detail: '미션 시각을 읽을 수 없어요' })
  })
})
