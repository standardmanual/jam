/**
 * 챕터 구역 연결 (티켓 20261022_1133 2회) — `chapter_definitions` 챕터 1~10행과 `chapter_score_rules` 활동 12행. 가짜 표로 지키는 것:
 * - 칸 정의: 챕터 2~10의 필요 누적 점수 아홉 칸(`required:2`~`required:10`, 챕터 1은 편집 칸이 없다)과 활동 12종마다 단위당 점수·주간 상한·초과 비율 세 칸(`rule:<활동>:points|cap|ratio`).
 *   모든 활동 종류(`CHAPTER_SCORE_KINDS`)에 칸이 있고, 확률 안내에는 반영되지 않는다. 기본값은 마이그레이션 221 시드 SQL과 같다
 * - 읽기: 두 표를 **정렬해서** 가공 없이 읽고(`order`), 구역 수정 시각은 DB가 준 순서가 아니라 고정된 순서(챕터 번호 순, 활동 종류 표 순서)로 계산한다. 밀리초까지 같고 마이크로초만 다른
 *   수정 시각이 있어도 표의 행 순서와 상관없이 같은 값을 돌려준다. 주간 상한 NULL은 0(상한 없음)으로 읽는다. 챕터 11 이상·모르는 활동 종류의 행은 읽지 않는다
 * - 쓰기(행 단위): 가장 늦은 수정 시각이 화면이 본 값과 같을 때만 시작하고, 행마다 읽은 수정 시각이 같을 때만 갱신한다. 한 활동의 여러 칸은 한 번의 갱신으로 쓴다. **주간 상한 0은 NULL로 쓴다.**
 *   쓰다가 막히면 이미 쓴 행을 이전 값과 이전 수정 시각으로 되돌리고, 되돌리기까지 실패하면 로그와 함께 error. 돌려주는 구역 수정 시각은 다음 읽기와 같다
 * - 칸 사이 검증: 필요 누적 점수는 앞 챕터보다 커야 한다(같거나 작으면 저장되지 않고 뒤쪽 챕터 칸에 이유가 붙는다)
 * - 공용 저장(`saveBalanceSection`)을 지나면: 저장되고 `required:3`·`rule:jam_earned:cap` 칸 이름으로 이력에 남는다. 범위 밖 값은 저장되지 않고 이유가 붙으며,
 *   다른 사람이 먼저 바꿨으면 409이고, 이력을 못 쓰면 두 표의 값과 수정 시각이 원래대로 돌아온다
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

import { CHAPTER_SCORE_KINDS } from '@/lib/chapter/kinds'
import { checkFieldValue, draftFromValues } from '../fields'
import {
  CHAPTER_ACTIVITY_LABELS,
  CHAPTER_BINDING,
  CHAPTER_COUNT,
  CHAPTER_DEFAULT_REQUIRED,
  CHAPTER_DEFINITION_SELECT,
  CHAPTER_EDITABLE_NUMBERS,
  CHAPTER_FIELDS,
  CHAPTER_REQUIRED_GROUP,
  CHAPTER_REQUIRED_KEYS,
  CHAPTER_RULE_COLUMNS,
  CHAPTER_RULE_DEFAULTS,
  CHAPTER_RULE_SELECT,
  CHAPTER_SECTION_ID,
  parseRequiredKey,
  parseRuleKey,
  requiredKey,
  ruleKey,
  validateRequiredOrder,
} from '../chapter'
import { BALANCE_HISTORY_FAILED_MESSAGE, BALANCE_INVALID_MESSAGE, BALANCE_NO_CHANGE_MESSAGE, saveBalanceSection } from '../save'
import { INTEGER_MAX } from '../types'
import {
  CHAPTER_DEFINITION_ROW_STAMP,
  CHAPTER_RULE_ROW_STAMP,
  chapterDefinitionRows,
  chapterScoreRuleRows,
  createFakeDb,
  type FakeDb,
} from './fakeDb'

const ACTOR = '11111111-1111-4111-8111-111111111111'
const NEXT = '2026-10-22T02:00:00.000Z'
/** 기본 행에서 가장 늦은 수정 시각(활동 규칙 행)이 구역의 수정 시각이다. */
const SECTION_STAMP = CHAPTER_RULE_ROW_STAMP
const byKey = Object.fromEntries(CHAPTER_FIELDS.map((def) => [def.key, def]))

let db: FakeDb

beforeEach(() => {
  db = createFakeDb({
    chapter_definitions: chapterDefinitionRows(),
    chapter_score_rules: chapterScoreRuleRows(),
    balance_setting_changes: [],
    users: [{ id: ACTOR, username: 'karina' }],
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const definitionRow = (chapterNo: number) => db.tables.chapter_definitions.find((row) => row.chapter_no === chapterNo)
const ruleRow = (kind: string) => db.tables.chapter_score_rules.find((row) => row.activity_kind === kind)
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

  it('활동 규칙은 rule:활동:칸 형식이고 모든 활동 종류와 세 칸을 읽는다', () => {
    expect(ruleKey('jam_earned', 'cap')).toBe('rule:jam_earned:cap')
    expect(parseRuleKey('rule:collection_complete_epic:ratio')).toEqual({ kind: 'collection_complete_epic', column: 'ratio' })
    for (const kind of CHAPTER_SCORE_KINDS) {
      for (const column of CHAPTER_RULE_COLUMNS) expect(parseRuleKey(ruleKey(kind, column)), `${kind} ${column}`).toEqual({ kind, column })
    }
    for (const key of ['rule:unknown:points', 'rule:drop:other', 'rule:drop', 'rule::points', 'drop:points', 'required:3', '']) {
      expect(parseRuleKey(key), key).toBeNull()
    }
  })
})

describe('챕터 칸 정의', () => {
  it('구역 키는 chapter이고 필요 점수 아홉 칸 다음에 활동 12종의 세 칸(점수·상한·비율)이 활동 종류 표 순서로 온다', () => {
    expect(CHAPTER_SECTION_ID).toBe('chapter')
    expect(CHAPTER_BINDING.id).toBe('chapter')
    expect(CHAPTER_COUNT).toBe(10)
    const expected = [
      ...CHAPTER_REQUIRED_KEYS,
      ...CHAPTER_SCORE_KINDS.flatMap((kind) => CHAPTER_RULE_COLUMNS.map((column) => ruleKey(kind, column))),
    ]
    expect(CHAPTER_FIELDS.map((def) => def.key)).toEqual(expected)
    expect(CHAPTER_FIELDS).toHaveLength(9 + 12 * 3)
    expect(CHAPTER_FIELDS.map((def) => def.key)).not.toContain('required:1')
  })

  it('활동 12종마다 칸이 있고 활동 이름과 단위 설명이 있다', () => {
    expect(CHAPTER_SCORE_KINDS).toHaveLength(12)
    expect(Object.keys(CHAPTER_ACTIVITY_LABELS).sort()).toEqual([...CHAPTER_SCORE_KINDS].sort())
    expect(Object.keys(CHAPTER_RULE_DEFAULTS).sort()).toEqual([...CHAPTER_SCORE_KINDS].sort())
    for (const kind of CHAPTER_SCORE_KINDS) {
      const { label, unitPhrase } = CHAPTER_ACTIVITY_LABELS[kind]
      expect(label, kind).not.toBe('')
      expect(unitPhrase, kind).not.toBe('')
      for (const column of CHAPTER_RULE_COLUMNS) {
        const def = byKey[ruleKey(kind, column)]
        expect(def, `${kind} ${column}`).toBeDefined()
        expect(def.group, `${kind} ${column}`).toBe(label)
        expect(def.hint, `${kind} ${column}`).toBeTruthy()
      }
    }
    expect(byKey['rule:jam_earned:points'].hint).toContain('잼 1당')
    expect(CHAPTER_FIELDS.filter((def) => def.group?.startsWith('컬렉션 완성')).map((def) => def.group)).toEqual(
      ['Common', 'Rare', 'Epic', 'Mystic'].flatMap((tier) => Array(3).fill(`컬렉션 완성 · ${tier}`))
    )
  })

  it('필요 점수는 점 단위의 1 이상 정수, 단위당 점수는 소수 둘째 자리, 주간 상한은 0 이상 정수, 초과 비율은 0~1의 소수 셋째 자리이고 확률 안내에는 반영되지 않는다', () => {
    for (const key of CHAPTER_REQUIRED_KEYS) {
      const def = byKey[key]
      expect(def.group).toBe(CHAPTER_REQUIRED_GROUP)
      expect(def.label).toBe(`챕터 ${Number(key.slice('required:'.length))}`)
      expect(def.unit).toBe('점')
      expect([def.decimals, def.min, def.max]).toEqual([0, 1, INTEGER_MAX])
    }
    for (const kind of CHAPTER_SCORE_KINDS) {
      const points = byKey[ruleKey(kind, 'points')]
      expect([points.label, points.unit, points.decimals, points.min, points.max]).toEqual(['단위당 점수', '점', 2, 0, 99_999_999.99])
      const cap = byKey[ruleKey(kind, 'cap')]
      expect([cap.label, cap.unit, cap.decimals, cap.min, cap.max]).toEqual(['주간 상한', '점', 0, 0, INTEGER_MAX])
      expect(cap.hint).toContain('0이면 상한이 없어요')
      const ratio = byKey[ruleKey(kind, 'ratio')]
      expect([ratio.label, ratio.unit, ratio.decimals, ratio.min, ratio.max]).toEqual(['상한 넘은 점수 비율', undefined, 3, 0, 1])
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

  it('활동 규칙 기본값이 마이그레이션 221 시드와 같다(상한 NULL은 0으로 보인다)', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/221_chapters.sql'), 'utf8')
    const block = sql.slice(sql.indexOf('INSERT INTO public.chapter_score_rules'), sql.indexOf('ON CONFLICT (activity_kind) DO NOTHING'))
    const seed = [...block.matchAll(/\('(\w+)',\s*(\d+(?:\.\d+)?),\s*(NULL|\d+),\s*(\d+(?:\.\d+)?)\)/g)].map((match) => ({
      kind: match[1],
      points: Number(match[2]),
      cap: match[3] === 'NULL' ? null : Number(match[3]),
      ratio: Number(match[4]),
    }))
    expect(seed.map((row) => row.kind)).toEqual([...CHAPTER_SCORE_KINDS])
    for (const row of seed) {
      expect(CHAPTER_RULE_DEFAULTS[row.kind as keyof typeof CHAPTER_RULE_DEFAULTS], row.kind).toEqual({ points: row.points, cap: row.cap, ratio: row.ratio })
      expect(byKey[`rule:${row.kind}:points`].defaultValue, row.kind).toBe(row.points)
      expect(byKey[`rule:${row.kind}:cap`].defaultValue, row.kind).toBe(row.cap ?? 0)
      expect(byKey[`rule:${row.kind}:ratio`].defaultValue, row.kind).toBe(row.ratio)
    }
    expect(draftFromValues(CHAPTER_FIELDS, {})['rule:jam_earned:cap']).toBe('300')
    expect(draftFromValues(CHAPTER_FIELDS, {})['rule:drop:cap']).toBe('0')
  })

  it('칸마다 범위를 지킨다: 필요 점수 0은 거절, 점수 소수 셋째 자리·음수 거절, 상한 소수 거절, 비율 1 초과 거절. 연결 검사도 같은 기준이다', () => {
    expect(checkFieldValue(byKey['required:2'], 1)).toBeNull()
    expect(checkFieldValue(byKey['required:2'], 0)).not.toBeNull()
    expect(checkFieldValue(byKey['required:2'], 1.5)).not.toBeNull()

    expect(checkFieldValue(byKey['rule:drop:points'], 0)).toBeNull()
    expect(checkFieldValue(byKey['rule:drop:points'], 12.34)).toBeNull()
    expect(checkFieldValue(byKey['rule:drop:points'], 99_999_999.99)).toBeNull()
    for (const bad of [-1, 0.005, 12.345, 100_000_000]) expect(checkFieldValue(byKey['rule:drop:points'], bad), `points ${bad}`).not.toBeNull()

    expect(checkFieldValue(byKey['rule:drop:cap'], 0)).toBeNull()
    expect(checkFieldValue(byKey['rule:drop:cap'], 500)).toBeNull()
    for (const bad of [-1, 1.5, INTEGER_MAX + 1]) expect(checkFieldValue(byKey['rule:drop:cap'], bad), `cap ${bad}`).not.toBeNull()

    for (const ok of [0, 0.5, 1, 0.123]) expect(checkFieldValue(byKey['rule:drop:ratio'], ok), `ratio ${ok}`).toBeNull()
    for (const bad of [-0.1, 1.001, 2, 0.0005]) expect(checkFieldValue(byKey['rule:drop:ratio'], bad), `ratio ${bad}`).not.toBeNull()

    expect(CHAPTER_BINDING.validators?.['required:2']?.(1)).toBe(true)
    expect(CHAPTER_BINDING.validators?.['required:2']?.(0)).toBe(false)
    expect(CHAPTER_BINDING.validators?.['rule:drop:points']?.(0)).toBe(true)
    expect(CHAPTER_BINDING.validators?.['rule:drop:points']?.(-1)).toBe(false)
    expect(CHAPTER_BINDING.validators?.['rule:drop:cap']?.(0)).toBe(true)
    expect(CHAPTER_BINDING.validators?.['rule:drop:cap']?.(2.5)).toBe(false)
    expect(CHAPTER_BINDING.validators?.['rule:drop:ratio']?.(1)).toBe(true)
    expect(CHAPTER_BINDING.validators?.['rule:drop:ratio']?.(1.5)).toBe(false)
  })

  it('읽기에 넘기는 칸 목록이 필요한 칸과 updated_at뿐이다', () => {
    expect(CHAPTER_DEFINITION_SELECT).toBe('chapter_no, required_score, updated_at')
    expect(CHAPTER_RULE_SELECT).toBe('activity_kind, points_per_unit, weekly_cap, over_cap_ratio, updated_at')
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
  it('두 표를 정렬해서 한 값 묶음으로 읽고 구역 수정 시각은 가장 늦은 행의 것이다', async () => {
    const snapshot = await CHAPTER_BINDING.read(db.client)
    expect(snapshot.updatedAt).toBe(CHAPTER_RULE_ROW_STAMP)
    expect(Object.keys(snapshot.values)).toEqual(CHAPTER_FIELDS.map((def) => def.key))
    expect(snapshot.values).toMatchObject({
      'required:2': 1000,
      'required:3': 2300,
      'required:10': 23000,
      'rule:jam_earned:points': 1,
      'rule:jam_earned:cap': 300,
      'rule:jam_earned:ratio': 0.5,
      'rule:capsule_open:points': 20,
      'rule:capsule_open:cap': 0,
      'rule:collection_complete_mystic:points': 800,
      'rule:pickup:points': 5,
    })
    expect(snapshot.values).not.toHaveProperty('required:1')
    expect(db.selects).toContain(CHAPTER_DEFINITION_SELECT)
    expect(db.selects).toContain(CHAPTER_RULE_SELECT)
  })

  it('두 표 모두 정렬을 요청해서 읽는다(챕터 번호, 활동 종류)', async () => {
    await CHAPTER_BINDING.read(db.client)
    expect(db.orders).toEqual(expect.arrayContaining(['chapter_definitions.order:chapter_no', 'chapter_score_rules.order:activity_kind']))
    db.orders.length = 0
    await CHAPTER_BINDING.write(db.client, writeInput({ 'required:3': 2400 }))
    expect(db.orders).toEqual(expect.arrayContaining(['chapter_definitions.order:chapter_no', 'chapter_score_rules.order:activity_kind']))
  })

  it('NUMERIC이 문자열로 내려와도 숫자로 읽고, 주간 상한 NULL은 0(상한 없음)으로 읽는다', async () => {
    ruleRow('drop')!.points_per_unit = '5.50'
    ruleRow('drop')!.over_cap_ratio = '0.250'
    const snapshot = await CHAPTER_BINDING.read(db.client)
    expect(snapshot.values['rule:drop:points']).toBe(5.5)
    expect(snapshot.values['rule:drop:ratio']).toBe(0.25)
    expect(snapshot.values['rule:drop:cap']).toBe(0)
  })

  it('상한을 0으로 둔 행도 0으로 읽는다(DB의 0은 상한 0이지만 화면에서는 같은 0이다)', async () => {
    ruleRow('drop')!.weekly_cap = 0
    expect((await CHAPTER_BINDING.read(db.client)).values['rule:drop:cap']).toBe(0)
  })

  it('저장된 값이 비정상이어도 기본값으로 바꿔 보이지 않고 그대로 읽는다', async () => {
    definitionRow(4)!.required_score = 7
    ruleRow('pickup')!.points_per_unit = '0.00'
    const snapshot = await CHAPTER_BINDING.read(db.client)
    expect(snapshot.values['required:4']).toBe(7)
    expect(snapshot.values['rule:pickup:points']).toBe(0)
  })

  it('챕터 11 이상 행과 모르는 활동 종류의 행은 읽지 않고, 그 수정 시각도 구역 수정 시각에 넣지 않는다', async () => {
    db.tables.chapter_definitions.push({ chapter_no: 11, required_score: 28000, updated_at: '2026-10-23T00:00:00+00:00' })
    db.tables.chapter_score_rules.push({
      activity_kind: 'future_kind',
      points_per_unit: '1.00',
      weekly_cap: null,
      over_cap_ratio: '0.500',
      updated_at: '2026-10-24T00:00:00+00:00',
    })
    const snapshot = await CHAPTER_BINDING.read(db.client)
    expect(snapshot.updatedAt).toBe(CHAPTER_RULE_ROW_STAMP)
    expect(snapshot.values).not.toHaveProperty('required:11')
    expect(Object.keys(snapshot.values)).toEqual(CHAPTER_FIELDS.map((def) => def.key))
  })

  it('챕터 행이 모자라거나 활동 행이 모자라거나 숫자가 아닌 칸이 있거나 조회가 실패하면 던진다', async () => {
    db.tables.chapter_definitions = chapterDefinitionRows().filter((row) => row.chapter_no !== 7)
    await expect(CHAPTER_BINDING.read(db.client)).rejects.toThrow('챕터 7 행이 없음')

    db.tables.chapter_definitions = chapterDefinitionRows().slice(1)
    await expect(CHAPTER_BINDING.read(db.client)).rejects.toThrow('챕터 1 행이 없음')

    db.tables.chapter_definitions = chapterDefinitionRows()
    db.tables.chapter_score_rules = chapterScoreRuleRows().filter((row) => row.activity_kind !== 'pickup')
    await expect(CHAPTER_BINDING.read(db.client)).rejects.toThrow('pickup 행이 없음')

    db.tables.chapter_score_rules = chapterScoreRuleRows()
    definitionRow(5)!.required_score = null
    await expect(CHAPTER_BINDING.read(db.client)).rejects.toThrow('챕터 5 값을 숫자로 읽을 수 없음')

    definitionRow(5)!.required_score = 5700
    ruleRow('drop')!.points_per_unit = null
    await expect(CHAPTER_BINDING.read(db.client)).rejects.toThrow('drop 단위당 점수를 숫자로 읽을 수 없음')

    ruleRow('drop')!.points_per_unit = '5.00'
    ruleRow('drop')!.over_cap_ratio = null
    await expect(CHAPTER_BINDING.read(db.client)).rejects.toThrow('drop 초과 비율을 숫자로 읽을 수 없음')

    ruleRow('drop')!.over_cap_ratio = '0.500'
    ruleRow('drop')!.weekly_cap = 'x'
    await expect(CHAPTER_BINDING.read(db.client)).rejects.toThrow('drop 주간 상한을 숫자로 읽을 수 없음')

    ruleRow('drop')!.weekly_cap = null
    db.readErrors.chapter_definitions = 'boom'
    await expect(CHAPTER_BINDING.read(db.client)).rejects.toThrow('챕터별 필요 점수 조회 실패: boom')

    db.readErrors.chapter_definitions = undefined
    db.readErrors.chapter_score_rules = 'boom'
    await expect(CHAPTER_BINDING.read(db.client)).rejects.toThrow('챕터 점수 규칙 조회 실패: boom')
  })
})

describe('CHAPTER_BINDING.read — 수정 시각이 밀리초까지 같을 때', () => {
  // 밀리초는 같고 마이크로초만 다른 글자들. Date.parse는 밀리초까지만 보므로 «가장 늦은 것»이 여럿이고, 고르는 글자는 읽는 순서가 정한다.
  // 가짜 표의 정렬은 글자 순(챕터 '10'이 '3'보다 앞, 활동 badge_receive가 jam_earned보다 앞)이라 고정 순서(챕터 번호 순, 활동 종류 표 순서)와 일부러 어긋난다.
  const CHAPTER_3 = '2026-10-22T05:00:00.123456+00:00'
  const CHAPTER_10 = '2026-10-22T05:00:00.123999+00:00'
  const RULE_JAM = '2026-10-22T05:00:00.123789+00:00'
  const RULE_BADGE = '2026-10-22T05:00:00.123111+00:00'
  const readStamp = async () => (await CHAPTER_BINDING.read(db.client)).updatedAt

  it('챕터 행끼리 같은 밀리초이면 챕터 번호 순으로 먼저 나오는 글자를 고른다(챕터 10보다 챕터 3)', async () => {
    definitionRow(10)!.updated_at = CHAPTER_10
    definitionRow(3)!.updated_at = CHAPTER_3
    expect(await readStamp()).toBe(CHAPTER_3)
    db.tables.chapter_definitions = [...db.tables.chapter_definitions].reverse()
    expect(await readStamp()).toBe(CHAPTER_3)
  })

  it('활동 행끼리 같은 밀리초이면 활동 종류 표에서 먼저 나오는 글자를 고른다(badge_receive보다 jam_earned)', async () => {
    ruleRow('badge_receive')!.updated_at = RULE_BADGE
    ruleRow('jam_earned')!.updated_at = RULE_JAM
    expect(await readStamp()).toBe(RULE_JAM)
    db.tables.chapter_score_rules = [...db.tables.chapter_score_rules].reverse()
    expect(await readStamp()).toBe(RULE_JAM)
  })

  it('챕터 행과 활동 행이 같은 밀리초이면 표 순서와 상관없이 챕터 행의 글자를 고른다', async () => {
    definitionRow(10)!.updated_at = CHAPTER_10
    ruleRow('jam_earned')!.updated_at = RULE_JAM
    ruleRow('badge_receive')!.updated_at = RULE_BADGE
    const picks = new Set<string>()
    for (let round = 0; round < 3; round += 1) {
      picks.add(await readStamp())
      db.tables.chapter_definitions = [...db.tables.chapter_definitions].reverse()
      db.tables.chapter_score_rules = [...db.tables.chapter_score_rules].reverse()
    }
    expect([...picks]).toEqual([CHAPTER_10])
  })

  it('읽은 구역 수정 시각을 그대로 돌려보내면 저장이 시작된다(불필요한 409가 없다)', async () => {
    ruleRow('badge_receive')!.updated_at = RULE_BADGE
    ruleRow('jam_earned')!.updated_at = RULE_JAM
    const read = await readStamp()
    expect(await CHAPTER_BINDING.write(db.client, writeInput({ 'required:3': 2400 }, { expectedUpdatedAt: read }))).toMatchObject({ ok: true })
  })
})

describe('CHAPTER_BINDING.write — 행 단위 갱신', () => {
  it('필요 점수 칸만 바꾸면 그 챕터 행 하나만 갱신한다(활동 규칙 행은 건드리지 않는다)', async () => {
    const res = await CHAPTER_BINDING.write(db.client, writeInput({ 'required:3': 2400 }))
    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.updates).toEqual([{ required_score: 2400, updated_at: NEXT }])
    expect(definitionRow(3)).toMatchObject({ required_score: 2400, updated_at: NEXT })
    expect(definitionRow(2)).toMatchObject({ required_score: 1000, updated_at: CHAPTER_DEFINITION_ROW_STAMP })
    expect(ruleRow('jam_earned')).toMatchObject({ weekly_cap: 300, updated_at: CHAPTER_RULE_ROW_STAMP })
    expect((await CHAPTER_BINDING.read(db.client)).updatedAt).toBe(NEXT)
  })

  it('한 활동의 여러 칸은 한 번의 갱신으로 쓴다', async () => {
    const res = await CHAPTER_BINDING.write(db.client, writeInput({ 'rule:drop:points': 6.5, 'rule:drop:ratio': 0.25 }))
    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.calls.filter((call) => call.endsWith('.update'))).toEqual(['chapter_score_rules.update'])
    expect(db.updates).toEqual([{ points_per_unit: 6.5, over_cap_ratio: 0.25, updated_at: NEXT }])
    expect(ruleRow('drop')).toMatchObject({ points_per_unit: 6.5, over_cap_ratio: 0.25, weekly_cap: null, updated_at: NEXT })
    expect(ruleRow('pickup')!.updated_at).toBe(CHAPTER_RULE_ROW_STAMP)
  })

  it('주간 상한 0은 NULL로 쓰고(상한 없음), 1 이상은 그대로 쓴다', async () => {
    const off = await CHAPTER_BINDING.write(db.client, writeInput({ 'rule:jam_earned:cap': 0 }))
    expect(off).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.updates).toEqual([{ weekly_cap: null, updated_at: NEXT }])
    expect(ruleRow('jam_earned')!.weekly_cap).toBeNull()
    expect((await CHAPTER_BINDING.read(db.client)).values['rule:jam_earned:cap']).toBe(0)

    db.updates.length = 0
    const on = await CHAPTER_BINDING.write(db.client, writeInput({ 'rule:drop:cap': 500 }, { expectedUpdatedAt: NEXT, nextUpdatedAt: '2026-10-22T03:00:00.000Z' }))
    expect(on).toEqual({ ok: true, updatedAt: '2026-10-22T03:00:00.000Z' })
    expect(db.updates).toEqual([{ weekly_cap: 500, updated_at: '2026-10-22T03:00:00.000Z' }])
    expect(ruleRow('drop')!.weekly_cap).toBe(500)
  })

  it('챕터 번호 순서, 그다음 활동 종류 표 순서로 쓴다', async () => {
    const res = await CHAPTER_BINDING.write(
      db.client,
      writeInput({ 'rule:drop:points': 6, 'required:4': 3900, 'rule:capsule_open:cap': 100, 'required:2': 1100 })
    )
    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.calls.filter((call) => call.endsWith('.update'))).toEqual([
      'chapter_definitions.update',
      'chapter_definitions.update',
      'chapter_score_rules.update',
      'chapter_score_rules.update',
    ])
    expect(db.updates).toEqual([
      { required_score: 1100, updated_at: NEXT },
      { required_score: 3900, updated_at: NEXT },
      { weekly_cap: 100, updated_at: NEXT },
      { points_per_unit: 6, updated_at: NEXT },
    ])
  })

  it('화면이 본 수정 시각이 가장 늦은 수정 시각과 다르면 아무것도 쓰지 않고 conflict다', async () => {
    definitionRow(6)!.updated_at = '2026-10-22T03:00:00+00:00'
    const res = await CHAPTER_BINDING.write(db.client, writeInput({ 'required:3': 2400 }))
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect(db.updates).toEqual([])
    expect(definitionRow(3)!.required_score).toBe(2300)
  })

  it('쓰는 도중 다른 곳이 활동 규칙 행을 먼저 바꾸면 conflict이고 이미 쓴 챕터 행을 이전 값과 이전 수정 시각으로 되돌린다', async () => {
    db.beforeUpdate = (nth) => {
      if (nth === 3) ruleRow('drop')!.updated_at = '2026-10-22T01:30:00+00:00'
    }
    const res = await CHAPTER_BINDING.write(db.client, writeInput({ 'required:2': 1100, 'required:3': 2400, 'rule:drop:points': 6 }))
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect(definitionRow(2)).toMatchObject({ required_score: 1000, updated_at: CHAPTER_DEFINITION_ROW_STAMP })
    expect(definitionRow(3)).toMatchObject({ required_score: 2300, updated_at: CHAPTER_DEFINITION_ROW_STAMP })
    expect(ruleRow('drop')).toMatchObject({ points_per_unit: '5.00', updated_at: '2026-10-22T01:30:00+00:00' })
  })

  it('쓰는 도중 다른 곳이 뒤쪽 챕터 행을 먼저 바꾸면 앞서 쓴 챕터 행을 모두 되돌린다', async () => {
    db.beforeUpdate = (nth) => {
      if (nth === 2) definitionRow(9)!.updated_at = '2026-10-22T01:30:00+00:00'
    }
    const res = await CHAPTER_BINDING.write(db.client, writeInput({ 'required:4': 3900, 'required:9': 19500, 'rule:drop:cap': 100 }))
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect(definitionRow(4)).toMatchObject({ required_score: 3800, updated_at: CHAPTER_DEFINITION_ROW_STAMP })
    expect(definitionRow(9)!.required_score).toBe(19000)
    expect(ruleRow('drop')).toMatchObject({ weekly_cap: null, updated_at: CHAPTER_RULE_ROW_STAMP })
  })

  it('활동 규칙을 되돌릴 때 이전 점수·상한(NULL 포함)·비율과 이전 수정 시각으로 돌아온다', async () => {
    db.beforeUpdate = (nth) => {
      if (nth === 3) ruleRow('pickup')!.updated_at = '2026-10-22T01:30:00+00:00'
    }
    const res = await CHAPTER_BINDING.write(
      db.client,
      writeInput({ 'rule:capsule_open:points': 25, 'rule:capsule_open:cap': 90, 'rule:capsule_open:ratio': 0.1, 'rule:drop:cap': 70, 'rule:pickup:cap': 60 })
    )
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect(ruleRow('capsule_open')).toMatchObject({ points_per_unit: 20, weekly_cap: null, over_cap_ratio: 0.5, updated_at: CHAPTER_RULE_ROW_STAMP })
    expect(ruleRow('drop')).toMatchObject({ weekly_cap: null, updated_at: CHAPTER_RULE_ROW_STAMP })
  })

  it('쓰는 도중 DB 오류가 나면 error이고 이미 쓴 행을 되돌린다', async () => {
    db.writeErrors.chapter_score_rules = 'boom'
    const res = await CHAPTER_BINDING.write(db.client, writeInput({ 'required:3': 2400, 'rule:drop:points': 6 }))
    expect(res).toEqual({ ok: false, reason: 'error', message: 'boom' })
    expect(definitionRow(3)).toMatchObject({ required_score: 2300, updated_at: CHAPTER_DEFINITION_ROW_STAMP })
    expect(ruleRow('drop')!.updated_at).toBe(CHAPTER_RULE_ROW_STAMP)
  })

  it('되돌리기까지 실패하면 로그를 남기고 error로 알린다', async () => {
    db.writeErrors.chapter_score_rules = 'boom'
    db.failUpdateFrom.chapter_definitions = 4
    const res = await CHAPTER_BINDING.write(db.client, writeInput({ 'required:2': 1100, 'required:3': 2400, 'rule:drop:points': 6 }))
    expect(res).toEqual({ ok: false, reason: 'error', message: 'boom (되돌리기 실패)' })
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('chapter 여러 행을 쓰다 멈췄고 이미 쓴 행을 되돌리지도 못했다'), expect.any(String))
  })

  it('첫 행에서 막히면 되돌릴 것이 없다(DB 오류는 error, 읽기 실패도 error)', async () => {
    db.writeErrors.chapter_definitions = 'boom'
    expect(await CHAPTER_BINDING.write(db.client, writeInput({ 'required:3': 2400 }))).toEqual({ ok: false, reason: 'error', message: 'boom' })
    db.writeErrors.chapter_definitions = undefined
    db.readErrors.chapter_score_rules = 'boom'
    expect(await CHAPTER_BINDING.write(db.client, writeInput({ 'required:3': 2400 }))).toMatchObject({ ok: false, reason: 'error' })
  })

  it('이 구역의 칸이 아닌 값은 본문에 있어도 쓰지 않는다(챕터 1·챕터 11·모르는 활동·다른 구역 칸)', async () => {
    await CHAPTER_BINDING.write(
      db.client,
      writeInput({
        'required:3': 2400,
        'required:1': 5,
        'required:11': 30000,
        'rule:unknown:points': 1,
        'rule:drop:other': 1,
        'chapter:3': 1,
        locked_min_common: 1,
      })
    )
    expect(db.updates).toEqual([{ required_score: 2400, updated_at: NEXT }])
  })

  it('쓸 칸이 하나도 없으면 error다', async () => {
    expect(await CHAPTER_BINDING.write(db.client, writeInput({ 'required:1': 5, 'required:11': 1 }))).toEqual({
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
    const res = await CHAPTER_BINDING.write(db.client, writeInput({ 'rule:drop:points': 6 }, { expectedUpdatedAt: tied }))
    expect(res).toEqual({ ok: true, updatedAt: tied })
    expect((await CHAPTER_BINDING.read(db.client)).updatedAt).toBe(tied)
  })

  it('쓰지 않은 행의 수정 시각이 더 늦으면 돌려주는 구역 수정 시각은 그 값이다(다음 읽기와 같다)', async () => {
    ruleRow('mix_success')!.updated_at = '2026-10-22T05:00:00+00:00'
    const res = await CHAPTER_BINDING.write(
      db.client,
      writeInput({ 'required:3': 2400 }, { expectedUpdatedAt: '2026-10-22T05:00:00+00:00' })
    )
    expect(res).toEqual({ ok: true, updatedAt: '2026-10-22T05:00:00+00:00' })
    expect((await CHAPTER_BINDING.read(db.client)).updatedAt).toBe('2026-10-22T05:00:00+00:00')
  })
})

describe('챕터 구역 저장 (공용 저장을 지난다)', () => {
  it('필요 점수와 활동 규칙을 바꾸면 저장되고 칸 이름으로 한 줄 이력에 남으며 확률 안내 반영 표시는 없다', async () => {
    const out = await save(
      { 'required:3': 2400, 'rule:jam_earned:cap': 400, 'rule:drop:points': 6, 'rule:drop:ratio': 0.5, 'required:2': 1000 },
      { note: '챕터 점수 조정' }
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.changes).toEqual([
      { field: 'required:3', from: 2300, to: 2400 },
      { field: 'rule:jam_earned:cap', from: 300, to: 400 },
      { field: 'rule:drop:points', from: 5, to: 6 },
    ])
    expect(out.affectsDisclosure).toBe(false)
    expect(out.values['required:3']).toBe(2400)
    expect(out.values['rule:jam_earned:cap']).toBe(400)
    expect(Object.keys(out.values)).toEqual(CHAPTER_FIELDS.map((def) => def.key))
    expect(definitionRow(3)!.required_score).toBe(2400)
    expect(ruleRow('jam_earned')!.weekly_cap).toBe(400)
    expect(ruleRow('drop')!.points_per_unit).toBe(6)
    expect(historyRows()).toHaveLength(1)
    expect(historyRows()[0]).toMatchObject({
      section_key: 'chapter',
      changes: [
        { field: 'required:3', from: 2300, to: 2400 },
        { field: 'rule:jam_earned:cap', from: 300, to: 400 },
        { field: 'rule:drop:points', from: 5, to: 6 },
      ],
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

  it('주간 상한 0은 «상한 없음»으로 저장된다(DB에는 NULL, 이력에는 이전 값 → 0)', async () => {
    const out = await save({ 'rule:jam_earned:cap': 0 })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.changes).toEqual([{ field: 'rule:jam_earned:cap', from: 300, to: 0 }])
    expect(ruleRow('jam_earned')!.weekly_cap).toBeNull()
    expect(out.values['rule:jam_earned:cap']).toBe(0)
    expect(historyRows()[0]).toMatchObject({ section_key: 'chapter', changes: [{ field: 'rule:jam_earned:cap', from: 300, to: 0 }] })
  })

  it('상한을 새로 두면 0 → 숫자로 저장된다(드랍 5점에 주 100점 상한)', async () => {
    const out = await save({ 'rule:drop:cap': 100 })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.changes).toEqual([{ field: 'rule:drop:cap', from: 0, to: 100 }])
    expect(ruleRow('drop')!.weekly_cap).toBe(100)
  })

  it('이미 상한이 없는 활동에 0을 보내면 바뀐 값이 없다', async () => {
    expect(await save({ 'rule:capsule_open:cap': 0 })).toMatchObject({ ok: false, status: 400, error: BALANCE_NO_CHANGE_MESSAGE })
    expect(db.updates).toEqual([])
    expect(historyRows()).toEqual([])
  })

  it('초과 비율 범위 밖(1 초과, 음수, 소수 넷째 자리)과 점수 음수·소수 셋째 자리, 상한 음수·소수는 저장되지 않고 칸마다 이유가 붙는다', async () => {
    const out = await save({
      'rule:drop:ratio': 1.5,
      'rule:pickup:ratio': -0.1,
      'rule:mix_success:ratio': 0.1234,
      'rule:badge_receive:points': -1,
      'rule:capsule_open:points': 1.234,
      'rule:jam_earned:cap': -5,
      'rule:mission_complete:cap': 2.5,
    })
    expect(out).toMatchObject({ ok: false, status: 400, error: BALANCE_INVALID_MESSAGE })
    if (out.ok) return
    expect(Object.keys(out.fieldErrors ?? {}).sort()).toEqual(
      [
        'rule:badge_receive:points',
        'rule:capsule_open:points',
        'rule:drop:ratio',
        'rule:jam_earned:cap',
        'rule:mission_complete:cap',
        'rule:mix_success:ratio',
        'rule:pickup:ratio',
      ].sort()
    )
    expect(out.fieldErrors?.['rule:drop:ratio']).toContain('0 이상 1 이하로 입력해 주세요')
    expect(db.updates).toEqual([])
    expect(historyRows()).toEqual([])
  })

  it('챕터 1·챕터 11·모르는 활동과 다른 구역의 칸은 «알 수 없는 칸»으로 거절한다', async () => {
    const out = await save({ 'required:1': 0, 'required:11': 30000, 'rule:future:points': 1, 'chapter:3': 100, locked_min_common: 5 })
    expect(out).toMatchObject({ ok: false, status: 400 })
    if (out.ok) return
    expect(out.fieldErrors).toEqual({
      'required:1': '알 수 없는 칸이에요.',
      'required:11': '알 수 없는 칸이에요.',
      'rule:future:points': '알 수 없는 칸이에요.',
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
      const second = await save({ 'rule:drop:points': 6 }, { expectedUpdatedAt: first.updatedAt })
      expect(second.ok).toBe(true)
      if (!second.ok) return
      expect(second.updatedAt).toBe((await CHAPTER_BINDING.read(db.client)).updatedAt)
      expect(second.updatedAt).not.toBe(first.updatedAt)

      // 이전 수정 시각으로는 더 저장할 수 없다
      expect(await save({ 'required:4': 3900 }, { expectedUpdatedAt: first.updatedAt })).toMatchObject({ ok: false, status: 409 })
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
      if (nth === 2) ruleRow('drop')!.updated_at = '2026-10-22T01:30:00+00:00'
    }
    const out = await save({ 'required:3': 2400, 'rule:drop:points': 6 })
    expect(out).toMatchObject({ ok: false, status: 409 })
    expect(definitionRow(3)).toMatchObject({ required_score: 2300, updated_at: CHAPTER_DEFINITION_ROW_STAMP })
    expect(historyRows()).toEqual([])
  })

  it('저장 도중 DB 오류가 나면 500이고 DB 오류 원문을 싣지 않으며 이미 쓴 행이 원래대로 돌아온다', async () => {
    db.writeErrors.chapter_score_rules = 'secret relation detail'
    const out = await save({ 'required:3': 2400, 'rule:drop:points': 6 })
    expect(out).toMatchObject({ ok: false, status: 500 })
    if (out.ok) return
    expect(out.error).not.toContain('secret relation detail')
    expect(definitionRow(3)).toMatchObject({ required_score: 2300, updated_at: CHAPTER_DEFINITION_ROW_STAMP })
    expect(historyRows()).toEqual([])
  })

  it('이력을 쓰지 못하면 두 표의 값과 구역 수정 시각이 원래대로 돌아오고 500이다(상한 NULL도 원래대로)', async () => {
    db.writeErrors.balance_setting_changes = 'secret relation detail'
    const out = await save({ 'required:3': 2400, 'rule:jam_earned:cap': 0, 'rule:drop:cap': 100 })
    expect(out).toMatchObject({ ok: false, status: 500, error: BALANCE_HISTORY_FAILED_MESSAGE })
    const after = await CHAPTER_BINDING.read(db.client)
    expect(after.updatedAt).toBe(SECTION_STAMP)
    expect(after.values).toMatchObject({ 'required:3': 2300, 'rule:jam_earned:cap': 300, 'rule:drop:cap': 0 })
    expect(ruleRow('jam_earned')!.weekly_cap).toBe(300)
    expect(ruleRow('drop')!.weekly_cap).toBeNull()
  })

  it('활동 규칙만 바꾸다 이력이 실패해도 원래대로 돌아온다', async () => {
    db.writeErrors.balance_setting_changes = 'boom'
    expect(await save({ 'rule:pickup:points': 7 })).toMatchObject({ ok: false, status: 500 })
    const after = await CHAPTER_BINDING.read(db.client)
    expect(after.values['rule:pickup:points']).toBe(5)
    expect(after.updatedAt).toBe(SECTION_STAMP)
  })
})
