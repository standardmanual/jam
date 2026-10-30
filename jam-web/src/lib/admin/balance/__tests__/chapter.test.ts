/**
 * 챕터 구역 연결 (티켓 20261022_1133 2회, 티켓 20261028_1742 2회에서 활동별 점수 규칙을 걷음) — `chapter_definitions` 챕터 1~10행. 가짜 표로 지키는 것:
 * - 칸 정의: 챕터 2~10의 필요 누적 점수 아홉 칸(`required:2`~`required:10`, 챕터 1은 편집 칸이 없다). 확률 안내에는 반영되지 않는다. 기본값은 마이그레이션 221 시드 SQL과 같다
 * - 읽기: 표를 **정렬해서** 가공 없이 읽고(`order`), 구역 수정 시각은 DB가 준 순서가 아니라 고정된 순서(챕터 번호 순)로 계산한다. 밀리초까지 같고 마이크로초만 다른
 *   수정 시각이 있어도 표의 행 순서와 상관없이 같은 값을 돌려준다. 챕터 11 이상의 행은 읽지 않는다. 활동별 점수 규칙 표(`chapter_score_rules`)는 읽지도 쓰지도 않는다
 * - 쓰기(행 단위): 가장 늦은 수정 시각이 화면이 본 값과 같을 때만 시작하고, 행마다 읽은 수정 시각이 같을 때만 갱신한다.
 *   쓰다가 막히면 이미 쓴 행을 이전 값과 이전 수정 시각으로 되돌리고, 되돌리기까지 실패하면 로그와 함께 error. 돌려주는 구역 수정 시각은 다음 읽기와 같다
 * - 칸 사이 검증: 필요 누적 점수는 앞 챕터보다 커야 한다(같거나 작으면 저장되지 않고 뒤쪽 챕터 칸에 이유가 붙는다)
 * - 공용 저장(`saveBalanceSection`)을 지나면: 저장되고 `required:3` 칸 이름으로 이력에 남는다. 범위 밖 값은 저장되지 않고 이유가 붙으며,
 *   다른 사람이 먼저 바꿨으면 409이고, 이력을 못 쓰면 값과 수정 시각이 원래대로 돌아온다
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

import { checkFieldValue } from '../fields'
import {
  CHAPTER_BINDING,
  CHAPTER_COUNT,
  CHAPTER_DEFAULT_REQUIRED,
  CHAPTER_DEFINITION_SELECT,
  CHAPTER_EDITABLE_NUMBERS,
  CHAPTER_FIELDS,
  CHAPTER_REQUIRED_GROUP,
  CHAPTER_REQUIRED_KEYS,
  CHAPTER_SECTION_ID,
  parseRequiredKey,
  requiredKey,
  validateRequiredOrder,
} from '../chapter'
import { BALANCE_HISTORY_FAILED_MESSAGE, BALANCE_INVALID_MESSAGE, saveBalanceSection } from '../save'
import { INTEGER_MAX } from '../types'
import { CHAPTER_DEFINITION_ROW_STAMP, chapterDefinitionRows, createFakeDb, type FakeDb } from './fakeDb'

const ACTOR = '11111111-1111-4111-8111-111111111111'
const NEXT = '2026-10-22T02:00:00.000Z'
/** 기본 행의 수정 시각이 구역의 수정 시각이다. */
const SECTION_STAMP = CHAPTER_DEFINITION_ROW_STAMP
const byKey = Object.fromEntries(CHAPTER_FIELDS.map((def) => [def.key, def]))

let db: FakeDb

beforeEach(() => {
  db = createFakeDb({
    chapter_definitions: chapterDefinitionRows(),
    balance_setting_changes: [],
    users: [{ id: ACTOR, username: 'karina' }],
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const definitionRow = (chapterNo: number) => db.tables.chapter_definitions.find((row) => row.chapter_no === chapterNo)
const historyRows = () => db.tables.balance_setting_changes
const writeInput = (values: Record<string, number>, overrides: { expectedUpdatedAt?: string; nextUpdatedAt?: string } = {}) => ({
  values,
  expectedUpdatedAt: SECTION_STAMP,
  nextUpdatedAt: NEXT,
  ...overrides,
})
const save = (values: unknown, extra: { note?: unknown; expectedUpdatedAt?: unknown } = {}) =>
  saveBalanceSection(db.client, { binding: CHAPTER_BINDING, values, expectedUpdatedAt: SECTION_STAMP, actor: ACTOR, ...extra })

describe('칸 이름', () => {
  it('필요 점수는 required:챕터 형식이고 편집하는 챕터(2~10)만 읽는다', () => {
    expect(requiredKey(3)).toBe('required:3')
    expect(parseRequiredKey('required:2')).toBe(2)
    expect(parseRequiredKey('required:10')).toBe(10)
    for (const key of ['required:1', 'required:0', 'required:11', 'required:03', 'required:', 'required:x', 'chapter:3', '']) {
      expect(parseRequiredKey(key), key).toBeNull()
    }
    expect(CHAPTER_EDITABLE_NUMBERS).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(CHAPTER_REQUIRED_KEYS).toEqual(CHAPTER_EDITABLE_NUMBERS.map((no) => `required:${no}`))
  })
})

describe('챕터 칸 정의', () => {
  it('구역 키는 chapter이고 칸은 필요 점수 아홉 칸뿐이다(활동별 점수 규칙 칸은 없다)', () => {
    expect(CHAPTER_SECTION_ID).toBe('chapter')
    expect(CHAPTER_BINDING.id).toBe('chapter')
    expect(CHAPTER_COUNT).toBe(10)
    expect(CHAPTER_FIELDS.map((def) => def.key)).toEqual(CHAPTER_REQUIRED_KEYS)
    expect(CHAPTER_FIELDS).toHaveLength(9)
    expect(CHAPTER_FIELDS.map((def) => def.key)).not.toContain('required:1')
    expect(CHAPTER_FIELDS.some((def) => def.key.startsWith('rule:'))).toBe(false)
  })

  it('필요 점수는 점 단위의 1 이상 정수이고 확률 안내에는 반영되지 않는다', () => {
    for (const key of CHAPTER_REQUIRED_KEYS) {
      const def = byKey[key]
      expect(def.group).toBe(CHAPTER_REQUIRED_GROUP)
      expect(def.label).toBe(`챕터 ${Number(key.slice('required:'.length))}`)
      expect(def.unit).toBe('점')
      expect([def.decimals, def.min, def.max]).toEqual([0, 1, INTEGER_MAX])
    }
    for (const def of CHAPTER_FIELDS) {
      expect(def.affectsDisclosure, def.key).toBe(false)
      expect(def.sumTo, def.key).toBeUndefined()
    }
    expect(CHAPTER_BINDING.zeroWarnings).toBeUndefined()
  })

  it('필요 점수 기본값이 마이그레이션 221 시드와 같다', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/221_chapters.sql'), 'utf8')
    const block = sql.slice(sql.indexOf('INSERT INTO public.chapter_definitions'), sql.indexOf('ON CONFLICT (chapter_no) DO NOTHING'))
    const seed = [...block.matchAll(/\((\d+),\s*(\d+)\)/g)].map((match) => [Number(match[1]), Number(match[2])])
    expect(seed.map(([chapterNo]) => chapterNo)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(CHAPTER_DEFAULT_REQUIRED).toEqual(seed.map(([, required]) => required))
    for (const [chapterNo, required] of seed.filter(([chapterNo]) => chapterNo >= 2)) expect(byKey[`required:${chapterNo}`].defaultValue, `챕터 ${chapterNo}`).toBe(required)
  })

  it('칸마다 범위를 지킨다: 필요 점수 0은 거절, 소수 거절. 연결 검사도 같은 기준이다', () => {
    expect(checkFieldValue(byKey['required:2'], 1)).toBeNull()
    expect(checkFieldValue(byKey['required:2'], 0)).not.toBeNull()
    expect(checkFieldValue(byKey['required:2'], 1.5)).not.toBeNull()

    expect(CHAPTER_BINDING.validators?.['required:2']?.(1)).toBe(true)
    expect(CHAPTER_BINDING.validators?.['required:2']?.(0)).toBe(false)
    expect(CHAPTER_BINDING.validators?.['required:2']?.(1.5)).toBe(false)
  })

  it('읽기에 넘기는 칸 목록이 필요한 칸과 updated_at뿐이다', () => {
    expect(CHAPTER_DEFINITION_SELECT).toBe('chapter_no, required_score, updated_at')
  })
})

describe('필요 누적 점수 순서 검사 (validateTogether)', () => {
  const chain = (): Record<string, number> =>
    Object.fromEntries(CHAPTER_EDITABLE_NUMBERS.map((no) => [requiredKey(no), CHAPTER_DEFAULT_REQUIRED[no - 1]]))

  it('기본값 순서는 통과한다', () => {
    expect(validateRequiredOrder(chain())).toEqual({})
    expect(CHAPTER_BINDING.validateTogether?.(chain())).toEqual({})
  })

  it('앞 챕터와 같거나 작으면 뒤쪽 챕터 칸에 앞 챕터와 점수를 알리는 문장이 붙는다', () => {
    expect(validateRequiredOrder({ ...chain(), 'required:5': 3800 })).toEqual({ 'required:5': '챕터 4(3,800점)보다 커야 해요.' })
    expect(validateRequiredOrder({ ...chain(), 'required:5': 3000 })).toEqual({ 'required:5': '챕터 4(3,800점)보다 커야 해요.' })
  })

  it('앞 챕터를 올려 뒤 챕터를 넘기면 뒤 챕터 칸이 걸린다', () => {
    expect(validateRequiredOrder({ ...chain(), 'required:2': 2500 })).toEqual({ 'required:3': '챕터 2(2,500점)보다 커야 해요.' })
  })

  it('챕터 2는 챕터 1의 0보다 커야 한다', () => {
    expect(validateRequiredOrder({ ...chain(), 'required:2': 0 })).toEqual({ 'required:2': '챕터 1(0점)보다 커야 해요.' })
  })

  it('여러 곳이 어긋나면 어긋난 칸마다 문장이 붙는다', () => {
    expect(Object.keys(validateRequiredOrder({ ...chain(), 'required:3': 900, 'required:7': 8000 })).sort()).toEqual(['required:3', 'required:7'])
  })

  it('숫자가 아닌 칸이 끼면 그 칸이 걸린 비교는 건너뛴다(칸별 검사가 먼저 알린다)', () => {
    const partial = chain()
    delete partial['required:4']
    expect(validateRequiredOrder(partial)).toEqual({})
  })
})

describe('CHAPTER_BINDING.read', () => {
  it('챕터 정의를 정렬해서 한 값 묶음으로 읽고 구역 수정 시각은 가장 늦은 행의 것이다', async () => {
    const snapshot = await CHAPTER_BINDING.read(db.client)
    expect(snapshot.updatedAt).toBe(CHAPTER_DEFINITION_ROW_STAMP)
    expect(Object.keys(snapshot.values)).toEqual(CHAPTER_FIELDS.map((def) => def.key))
    expect(snapshot.values).toMatchObject({ 'required:2': 1000, 'required:3': 2300, 'required:10': 23000 })
    expect(snapshot.values).not.toHaveProperty('required:1')
    expect(db.selects).toContain(CHAPTER_DEFINITION_SELECT)
  })

  it('정렬을 요청해서 읽고, 활동별 점수 규칙 표는 읽지 않는다', async () => {
    await CHAPTER_BINDING.read(db.client)
    expect(db.orders).toContain('chapter_definitions.order:chapter_no')
    expect(db.calls.some((call) => call.startsWith('chapter_score_rules'))).toBe(false)
    db.orders.length = 0
    await CHAPTER_BINDING.write(db.client, writeInput({ 'required:3': 2400 }))
    expect(db.orders).toContain('chapter_definitions.order:chapter_no')
    expect(db.calls.some((call) => call.startsWith('chapter_score_rules'))).toBe(false)
  })

  it('저장된 값이 비정상이어도 기본값으로 바꿔 보이지 않고 그대로 읽는다', async () => {
    definitionRow(4)!.required_score = 7
    const snapshot = await CHAPTER_BINDING.read(db.client)
    expect(snapshot.values['required:4']).toBe(7)
  })

  it('챕터 11 이상 행은 읽지 않고, 그 수정 시각도 구역 수정 시각에 넣지 않는다', async () => {
    db.tables.chapter_definitions.push({ chapter_no: 11, required_score: 28000, updated_at: '2026-10-23T00:00:00+00:00' })
    const snapshot = await CHAPTER_BINDING.read(db.client)
    expect(snapshot.updatedAt).toBe(CHAPTER_DEFINITION_ROW_STAMP)
    expect(snapshot.values).not.toHaveProperty('required:11')
    expect(Object.keys(snapshot.values)).toEqual(CHAPTER_FIELDS.map((def) => def.key))
  })

  it('챕터 행이 모자라거나 숫자가 아닌 칸이 있거나 조회가 실패하면 던진다', async () => {
    db.tables.chapter_definitions = chapterDefinitionRows().filter((row) => row.chapter_no !== 7)
    await expect(CHAPTER_BINDING.read(db.client)).rejects.toThrow('챕터 7 행이 없음')
    db.tables.chapter_definitions = chapterDefinitionRows().slice(1)
    await expect(CHAPTER_BINDING.read(db.client)).rejects.toThrow('챕터 1 행이 없음')

    db.tables.chapter_definitions = chapterDefinitionRows()
    definitionRow(5)!.required_score = null
    await expect(CHAPTER_BINDING.read(db.client)).rejects.toThrow('챕터 5 값을 숫자로 읽을 수 없음')

    definitionRow(5)!.required_score = 5700
    db.readErrors.chapter_definitions = 'boom'
    await expect(CHAPTER_BINDING.read(db.client)).rejects.toThrow('챕터별 필요 점수 조회 실패: boom')
  })
})

describe('CHAPTER_BINDING.read — 수정 시각이 밀리초까지 같을 때', () => {
  // 밀리초는 같고 마이크로초만 다른 글자들. Date.parse는 밀리초까지만 보므로 «가장 늦은 것»이 여럿이고, 고르는 글자는 읽는 순서가 정한다.
  // 가짜 표의 정렬은 글자 순(챕터 '10'이 '3'보다 앞)이라 고정 순서(챕터 번호 순)와 일부러 어긋난다.
  const CHAPTER_3 = '2026-10-22T05:00:00.123456+00:00'
  const CHAPTER_10 = '2026-10-22T05:00:00.123999+00:00'
  const readStamp = async () => (await CHAPTER_BINDING.read(db.client)).updatedAt

  it('챕터 행끼리 같은 밀리초이면 챕터 번호 순으로 먼저 나오는 글자를 고른다(챕터 10보다 챕터 3)', async () => {
    definitionRow(10)!.updated_at = CHAPTER_10
    definitionRow(3)!.updated_at = CHAPTER_3
    expect(await readStamp()).toBe(CHAPTER_3)
    db.tables.chapter_definitions = [...db.tables.chapter_definitions].reverse()
    expect(await readStamp()).toBe(CHAPTER_3)
  })

  it('읽은 구역 수정 시각을 그대로 돌려보내면 저장이 시작된다(불필요한 409가 없다)', async () => {
    definitionRow(10)!.updated_at = CHAPTER_10
    definitionRow(3)!.updated_at = CHAPTER_3
    const read = await readStamp()
    expect(await CHAPTER_BINDING.write(db.client, writeInput({ 'required:3': 2400 }, { expectedUpdatedAt: read }))).toMatchObject({ ok: true })
  })
})

describe('CHAPTER_BINDING.write — 행 단위 갱신', () => {
  it('필요 점수 칸을 바꾸면 그 챕터 행 하나만 갱신한다', async () => {
    const res = await CHAPTER_BINDING.write(db.client, writeInput({ 'required:3': 2400 }))
    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.updates).toEqual([{ required_score: 2400, updated_at: NEXT }])
    expect(definitionRow(3)).toMatchObject({ required_score: 2400, updated_at: NEXT })
    expect(definitionRow(2)).toMatchObject({ required_score: 1000, updated_at: CHAPTER_DEFINITION_ROW_STAMP })
    expect((await CHAPTER_BINDING.read(db.client)).updatedAt).toBe(NEXT)
  })

  it('챕터 번호 순서로 쓴다', async () => {
    const res = await CHAPTER_BINDING.write(db.client, writeInput({ 'required:4': 3900, 'required:2': 1100 }))
    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.calls.filter((call) => call.endsWith('.update'))).toEqual(['chapter_definitions.update', 'chapter_definitions.update'])
    expect(db.updates).toEqual([
      { required_score: 1100, updated_at: NEXT },
      { required_score: 3900, updated_at: NEXT },
    ])
  })

  it('화면이 본 수정 시각이 가장 늦은 수정 시각과 다르면 아무것도 쓰지 않고 conflict다', async () => {
    definitionRow(6)!.updated_at = '2026-10-22T03:00:00+00:00'
    const res = await CHAPTER_BINDING.write(db.client, writeInput({ 'required:3': 2400 }))
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect(db.updates).toEqual([])
    expect(definitionRow(3)!.required_score).toBe(2300)
  })

  it('쓰는 도중 다른 곳이 뒤쪽 챕터 행을 먼저 바꾸면 앞서 쓴 챕터 행을 이전 값과 이전 수정 시각으로 되돌린다', async () => {
    db.beforeUpdate = (nth) => {
      if (nth === 3) definitionRow(9)!.updated_at = '2026-10-22T01:30:00+00:00'
    }
    const res = await CHAPTER_BINDING.write(db.client, writeInput({ 'required:2': 1100, 'required:4': 3900, 'required:9': 19500 }))
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect(definitionRow(2)).toMatchObject({ required_score: 1000, updated_at: CHAPTER_DEFINITION_ROW_STAMP })
    expect(definitionRow(4)).toMatchObject({ required_score: 3800, updated_at: CHAPTER_DEFINITION_ROW_STAMP })
    expect(definitionRow(9)).toMatchObject({ required_score: 19000, updated_at: '2026-10-22T01:30:00+00:00' })
  })

  it('쓰는 도중 DB 오류가 나고 되돌리기까지 실패하면 로그를 남기고 error로 알린다', async () => {
    db.failUpdateFrom.chapter_definitions = 2
    const res = await CHAPTER_BINDING.write(db.client, writeInput({ 'required:2': 1100, 'required:3': 2400 }))
    expect(res).toEqual({ ok: false, reason: 'error', message: '업데이트 실패 (되돌리기 실패)' })
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('chapter 여러 행을 쓰다 멈췄고 이미 쓴 행을 되돌리지도 못했다'), expect.any(String))
  })

  it('첫 행에서 막히면 되돌릴 것이 없다(DB 오류는 error, 읽기 실패도 error)', async () => {
    db.writeErrors.chapter_definitions = 'boom'
    expect(await CHAPTER_BINDING.write(db.client, writeInput({ 'required:3': 2400 }))).toEqual({ ok: false, reason: 'error', message: 'boom' })
    db.writeErrors.chapter_definitions = undefined
    db.readErrors.chapter_definitions = 'boom'
    expect(await CHAPTER_BINDING.write(db.client, writeInput({ 'required:3': 2400 }))).toMatchObject({ ok: false, reason: 'error' })
  })

  it('이 구역의 칸이 아닌 값은 본문에 있어도 쓰지 않는다(챕터 1·챕터 11·걷은 점수 규칙 칸·다른 구역 칸)', async () => {
    await CHAPTER_BINDING.write(
      db.client,
      writeInput({
        'required:3': 2400,
        'required:1': 5,
        'required:11': 30000,
        'rule:drop:points': 1,
        'chapter:3': 1,
        locked_min_common: 1,
      })
    )
    expect(db.updates).toEqual([{ required_score: 2400, updated_at: NEXT }])
    expect(db.calls.some((call) => call.startsWith('chapter_score_rules'))).toBe(false)
  })

  it('쓸 칸이 하나도 없으면 error다', async () => {
    expect(await CHAPTER_BINDING.write(db.client, writeInput({ 'required:1': 5, 'required:11': 1, 'rule:drop:points': 1 }))).toEqual({
      ok: false,
      reason: 'error',
      message: '바꿀 칸이 없음',
    })
    expect(db.updates).toEqual([])
  })

  it('쓰지 않은 행의 수정 시각이 쓴 행과 밀리초까지 같아도 돌려주는 구역 수정 시각이 다음 읽기와 같다', async () => {
    // 쓰지 않은 챕터 4행: NEXT와 밀리초는 같고 마이크로초만 다르다. 읽기는 챕터 번호 순으로 먼저 나오는 이 글자를 고른다.
    const tied = '2026-10-22T02:00:00.000500+00:00'
    definitionRow(4)!.updated_at = tied
    const res = await CHAPTER_BINDING.write(db.client, writeInput({ 'required:5': 6000 }, { expectedUpdatedAt: tied }))
    expect(res).toEqual({ ok: true, updatedAt: tied })
    expect((await CHAPTER_BINDING.read(db.client)).updatedAt).toBe(tied)
  })

  it('쓰지 않은 행의 수정 시각이 더 늦으면 돌려주는 구역 수정 시각은 그 값이다(다음 읽기와 같다)', async () => {
    definitionRow(8)!.updated_at = '2026-10-22T05:00:00+00:00'
    const res = await CHAPTER_BINDING.write(db.client, writeInput({ 'required:3': 2400 }, { expectedUpdatedAt: '2026-10-22T05:00:00+00:00' }))
    expect(res).toEqual({ ok: true, updatedAt: '2026-10-22T05:00:00+00:00' })
    expect((await CHAPTER_BINDING.read(db.client)).updatedAt).toBe('2026-10-22T05:00:00+00:00')
  })
})

describe('챕터 구역 저장 (공용 저장을 지난다)', () => {
  it('필요 점수를 바꾸면 저장되고 칸 이름으로 한 줄 이력에 남으며 확률 안내 반영 표시는 없다', async () => {
    const out = await save({ 'required:3': 2400, 'required:2': 1000 }, { note: '챕터 점수 조정' })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.changes).toEqual([{ field: 'required:3', from: 2300, to: 2400 }])
    expect(out.affectsDisclosure).toBe(false)
    expect(out.values['required:3']).toBe(2400)
    expect(Object.keys(out.values)).toEqual(CHAPTER_FIELDS.map((def) => def.key))
    expect(definitionRow(3)!.required_score).toBe(2400)
    expect(historyRows()).toHaveLength(1)
    expect(historyRows()[0]).toMatchObject({
      section_key: 'chapter',
      changes: [{ field: 'required:3', from: 2300, to: 2400 }],
      note: '챕터 점수 조정',
      affects_disclosure: false,
      changed_by: ACTOR,
    })
  })

  it('앞 챕터를 함께 올리면 뒤 챕터가 그보다 커서 저장된다', async () => {
    const out = await save({ 'required:2': 2000, 'required:3': 2500 })
    expect(out.ok).toBe(true)
    expect(definitionRow(2)!.required_score).toBe(2000)
    expect(definitionRow(3)!.required_score).toBe(2500)
  })

  it('필요 점수가 앞 챕터와 같거나 작으면 저장되지 않고 뒤쪽 챕터 칸에 이유가 붙는다', async () => {
    const same = await save({ 'required:5': 3800 })
    expect(same).toMatchObject({ ok: false, status: 400, error: BALANCE_INVALID_MESSAGE })
    if (same.ok) return
    expect(same.fieldErrors).toEqual({ 'required:5': '챕터 4(3,800점)보다 커야 해요.' })

    const lower = await save({ 'required:5': 3000 })
    expect(lower).toMatchObject({ ok: false, status: 400 })
    if (lower.ok) return
    expect(lower.fieldErrors).toEqual({ 'required:5': '챕터 4(3,800점)보다 커야 해요.' })

    const pushed = await save({ 'required:2': 2500 })
    expect(pushed).toMatchObject({ ok: false, status: 400 })
    if (pushed.ok) return
    expect(pushed.fieldErrors).toEqual({ 'required:3': '챕터 2(2,500점)보다 커야 해요.' })

    expect(db.updates).toEqual([])
    expect(historyRows()).toEqual([])
    expect(definitionRow(5)!.required_score).toBe(5700)
  })

  it('필요 점수 0은 칸 범위에서 거절된다(챕터 1의 0보다 커야 한다)', async () => {
    const out = await save({ 'required:2': 0 })
    expect(out).toMatchObject({ ok: false, status: 400 })
    if (out.ok) return
    expect(out.fieldErrors?.['required:2']).toBe('1 이상의 정수로 입력해 주세요.')
  })

  it('챕터 1·챕터 11·걷은 점수 규칙 칸과 다른 구역의 칸은 «알 수 없는 칸»으로 거절한다', async () => {
    const out = await save({ 'required:1': 0, 'required:11': 30000, 'rule:jam_earned:cap': 1, 'chapter:3': 100, locked_min_common: 5 })
    expect(out).toMatchObject({ ok: false, status: 400 })
    if (out.ok) return
    expect(out.fieldErrors).toEqual({
      'required:1': '알 수 없는 칸이에요.',
      'required:11': '알 수 없는 칸이에요.',
      'rule:jam_earned:cap': '알 수 없는 칸이에요.',
      'chapter:3': '알 수 없는 칸이에요.',
      locked_min_common: '알 수 없는 칸이에요.',
    })
  })

  it('저장 결과의 구역 수정 시각이 다음 읽기와 같아 연이어 저장할 수 있다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-10-22T02:00:00.000Z'))
      const first = await save({ 'required:3': 2400 })
      expect(first.ok).toBe(true)
      if (!first.ok) return
      expect(first.updatedAt).toBe((await CHAPTER_BINDING.read(db.client)).updatedAt)

      vi.setSystemTime(new Date('2026-10-22T02:00:05.000Z'))
      const second = await save({ 'required:4': 3900 }, { expectedUpdatedAt: first.updatedAt })
      expect(second.ok).toBe(true)
      if (!second.ok) return
      expect(second.updatedAt).toBe((await CHAPTER_BINDING.read(db.client)).updatedAt)
      expect(second.updatedAt).not.toBe(first.updatedAt)

      // 이전 수정 시각으로는 더 저장할 수 없다
      expect(await save({ 'required:5': 6000 }, { expectedUpdatedAt: first.updatedAt })).toMatchObject({ ok: false, status: 409 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('다른 사람이 먼저 바꿨으면(수정 시각 불일치) 409이고 이력이 없다', async () => {
    const out = await save({ 'required:3': 2400 }, { expectedUpdatedAt: '2026-10-21T00:00:00+00:00' })
    expect(out).toMatchObject({ ok: false, status: 409 })
    expect(db.updates).toEqual([])
    expect(historyRows()).toEqual([])
  })

  it('저장 도중 한 행이 막히면 409이고 이미 쓴 행이 원래대로 돌아오며 이력이 없다', async () => {
    db.beforeUpdate = (nth) => {
      if (nth === 2) definitionRow(5)!.updated_at = '2026-10-22T01:30:00+00:00'
    }
    const out = await save({ 'required:3': 2400, 'required:5': 5800 })
    expect(out).toMatchObject({ ok: false, status: 409 })
    expect(definitionRow(3)).toMatchObject({ required_score: 2300, updated_at: CHAPTER_DEFINITION_ROW_STAMP })
    expect(historyRows()).toEqual([])
  })

  it('저장 도중 DB 오류가 나면 500이고 DB 오류 원문을 싣지 않는다', async () => {
    db.writeErrors.chapter_definitions = 'secret relation detail'
    const out = await save({ 'required:3': 2400 })
    expect(out).toMatchObject({ ok: false, status: 500 })
    if (out.ok) return
    expect(out.error).not.toContain('secret relation detail')
    expect(definitionRow(3)).toMatchObject({ required_score: 2300, updated_at: CHAPTER_DEFINITION_ROW_STAMP })
    expect(historyRows()).toEqual([])
  })

  it('이력을 쓰지 못하면 값과 구역 수정 시각이 원래대로 돌아오고 500이다', async () => {
    db.writeErrors.balance_setting_changes = 'secret relation detail'
    const out = await save({ 'required:3': 2400, 'required:5': 5800 })
    expect(out).toMatchObject({ ok: false, status: 500, error: BALANCE_HISTORY_FAILED_MESSAGE })
    const after = await CHAPTER_BINDING.read(db.client)
    expect(after.updatedAt).toBe(SECTION_STAMP)
    expect(after.values).toMatchObject({ 'required:3': 2300, 'required:5': 5700 })
  })
})
