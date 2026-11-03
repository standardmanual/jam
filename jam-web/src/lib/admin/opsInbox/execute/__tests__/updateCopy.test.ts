/**
 * 예약된 자원의 문안 열 고치기 `updateCopy` (티켓 20261103_1446). 카드·미션 핸들러가 `copyColumns.ts`를 함께 쓴다.
 *
 * - 공개 전이면 받은 열만 고치고 고치기 전 값(`previous`)을 돌려준다. 쓸 때 `starts_at > now` 조건을 건다
 * - 공개됨(지났거나 정확히 지금)·읽은 뒤 공개(쓰기 경합)는 `published`, 행 없음은 `missing`, DB 오류는 원문 없는 `error`
 * - 비운 값은 만들 때와 같게 null(카드의 부제·설명, 미션의 달성 조건 문장)
 */
import { describe, it, expect } from 'vitest'
import { HOME_FEED_CARD_HANDLER } from '../homeFeedCard'
import { MISSION_HANDLER } from '../mission'
import { DB_SECRET, FakeDb, type Row } from './fakeDb'
import { LATER, NOW } from './fixtures'

const CARD_ID = '00000000-0000-4000-8000-000000000001'
const OTHER_CARD_ID = '00000000-0000-4000-8000-000000000002'
const MISSION_ID = '00000000-0000-4000-8000-000000000003'
const OTHER_MISSION_ID = '00000000-0000-4000-8000-000000000004'
const PAST = '2026-10-05T02:00:00.000Z' // NOW보다 앞

describe('홈피드 카드 updateCopy', () => {
  const handler = HOME_FEED_CARD_HANDLER
  const row = (db: FakeDb) => (db.tables.today_cards as Row[]).find((card) => card.id === CARD_ID) as Row
  const seed = (db: FakeDb, startsAt: string = LATER) => {
    db.tables.today_cards = [
      { id: CARD_ID, starts_at: startsAt, title: '옛 제목', subtitle: '옛 부제', description: '옛 설명이에요', cover_image_url: 'https://x/cover.png' },
      { id: OTHER_CARD_ID, starts_at: LATER, title: '다른 카드', subtitle: null, description: null },
    ]
  }
  const update = (db: FakeDb, fields: Record<string, string | null>) => handler.updateCopy!(db.service, CARD_ID, fields, { now: NOW })

  it('공개 전이면 받은 열만 고치고 고치기 전 값을 돌려준다. 쓸 때 공개 시각 조건을 걸고 다른 카드·열은 그대로다', async () => {
    const db = new FakeDb()
    seed(db)
    const result = await update(db, { title: '  새 제목 ', description: '새 설명이에요' })

    expect(result).toEqual({ ok: true, previous: { title: '옛 제목', description: '옛 설명이에요' } })
    expect(row(db)).toMatchObject({ title: '새 제목', subtitle: '옛 부제', description: '새 설명이에요', cover_image_url: 'https://x/cover.png' })
    expect(db.tables.today_cards[1]).toMatchObject({ title: '다른 카드' })
    const writes = db.calls.filter((call) => call.op === 'update')
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ table: 'today_cards', filters: [['id', CARD_ID], ['starts_at >', NOW.toISOString()]] })
  })

  it('비운 부제·설명은 만들 때와 같게 null로 저장한다', async () => {
    const db = new FakeDb()
    seed(db)
    expect(await update(db, { subtitle: '   ', description: '' })).toMatchObject({ ok: true })
    expect(row(db)).toMatchObject({ subtitle: null, description: null })
  })

  it.each([
    ['공개 시각이 지났다', PAST],
    ['공개 시각이 정확히 지금이다', NOW.toISOString()],
  ])('%s: published이고 아무것도 쓰지 않는다', async (_label, startsAt) => {
    const db = new FakeDb()
    seed(db, startsAt)
    expect(await update(db, { title: '새 제목' })).toMatchObject({ ok: false, code: 'published' })
    expect(db.calls.filter((call) => call.op === 'update')).toEqual([])
    expect(row(db).title).toBe('옛 제목')
  })

  it('행이 없으면 missing이다', async () => {
    expect(await update(new FakeDb(), { title: '새 제목' })).toMatchObject({ ok: false, code: 'missing' })
  })

  it('읽은 뒤 공개 시각이 지나면(쓰기 경합) 0행이고, 다시 읽어 행이 있으면 published다', async () => {
    const db = new FakeDb()
    seed(db)
    db.beforeRun = (call) => {
      if (call.op === 'update') row(db).starts_at = PAST
    }
    expect(await update(db, { title: '새 제목' })).toMatchObject({ ok: false, code: 'published' })
    expect(row(db).title).toBe('옛 제목')
  })

  it('쓰려는 사이 행이 지워지면 다시 읽어 행이 없으니 missing이다', async () => {
    const db = new FakeDb()
    seed(db)
    db.beforeRun = (call) => {
      if (call.op === 'update') db.tables.today_cards = (db.tables.today_cards as Row[]).filter((card) => card.id !== CARD_ID)
    }
    expect(await update(db, { title: '새 제목' })).toMatchObject({ ok: false, code: 'missing' })
  })

  it.each([
    ['읽기', (call: { op: string; table: string }) => call.table === 'today_cards' && call.op === 'select'],
    ['쓰기', (call: { op: string; table: string }) => call.table === 'today_cards' && call.op === 'update'],
  ])('%s 오류는 error이고 DB 오류 원문은 reason에 없다', async (_label, fails) => {
    const db = new FakeDb()
    seed(db)
    db.failIf = fails
    const result = await update(db, { title: '새 제목' })

    expect(result).toMatchObject({ ok: false, code: 'error' })
    if (result.ok) throw new Error('실패여야 해요')
    expect(result.failure.reason).not.toContain(DB_SECRET)
    expect(result.failure.detail).toContain(DB_SECRET)
    expect(row(db).title).toBe('옛 제목')
  })
})

describe('미션 updateCopy', () => {
  const handler = MISSION_HANDLER
  const row = (db: FakeDb) => (db.tables.missions as Row[]).find((mission) => mission.id === MISSION_ID) as Row
  const seed = (db: FakeDb, startsAt: string = LATER) => {
    db.tables.missions = [
      { id: MISSION_ID, starts_at: startsAt, title: '옛 제목', description: '옛 설명이에요', condition_text: '옛 조건', mission_type: 'distance' },
      { id: OTHER_MISSION_ID, starts_at: LATER, title: '다른 미션', description: '다른 설명', condition_text: null },
    ]
  }
  const update = (db: FakeDb, fields: Record<string, string | null>) => handler.updateCopy!(db.service, MISSION_ID, fields, { now: NOW })

  it('공개 전이면 받은 열만 고치고 고치기 전 값을 돌려준다. 쓸 때 공개 시각 조건을 걸고 다른 미션·열은 그대로다', async () => {
    const db = new FakeDb()
    seed(db)
    const result = await update(db, { title: '새 제목', condition_text: '  30km를 달려요  ' })

    expect(result).toEqual({ ok: true, previous: { title: '옛 제목', condition_text: '옛 조건' } })
    expect(row(db)).toMatchObject({ title: '새 제목', description: '옛 설명이에요', condition_text: '30km를 달려요', mission_type: 'distance' })
    expect(db.tables.missions[1]).toMatchObject({ title: '다른 미션' })
    const writes = db.calls.filter((call) => call.op === 'update')
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ table: 'missions', filters: [['id', MISSION_ID], ['starts_at >', NOW.toISOString()]] })
  })

  it('비운 달성 조건 문장은 만들 때와 같게 null로 저장한다', async () => {
    const db = new FakeDb()
    seed(db)
    expect(await update(db, { condition_text: '  ' })).toMatchObject({ ok: true })
    expect(row(db).condition_text).toBeNull()
  })

  it('공개 시각이 지났으면 published이고 아무것도 쓰지 않는다', async () => {
    const db = new FakeDb()
    seed(db, PAST)
    expect(await update(db, { title: '새 제목' })).toMatchObject({ ok: false, code: 'published' })
    expect(db.calls.filter((call) => call.op === 'update')).toEqual([])
    expect(row(db).title).toBe('옛 제목')
  })

  it('행이 없으면 missing, 읽은 뒤 공개되면 published, 쓰기 오류는 원문 없이 error다', async () => {
    expect(await update(new FakeDb(), { title: '새 제목' })).toMatchObject({ ok: false, code: 'missing' })

    const raced = new FakeDb()
    seed(raced)
    raced.beforeRun = (call) => {
      if (call.op === 'update') row(raced).starts_at = PAST
    }
    expect(await update(raced, { title: '새 제목' })).toMatchObject({ ok: false, code: 'published' })

    const broken = new FakeDb()
    seed(broken)
    broken.failIf = (call) => call.table === 'missions' && call.op === 'update'
    const result = await update(broken, { title: '새 제목' })
    expect(result).toMatchObject({ ok: false, code: 'error' })
    if (result.ok) throw new Error('실패여야 해요')
    expect(result.failure.reason).not.toContain(DB_SECRET)
    expect(row(broken).title).toBe('옛 제목')
  })
})
