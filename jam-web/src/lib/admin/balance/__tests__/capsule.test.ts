/**
 * 캡슐 구역 연결 (티켓 20261022_1132 2회) — `capsule_policy` id=1 행(열한 칸)과 `capsule_chapter_costs` 챕터 1~10행. 가짜 표로 지키는 것:
 * - 칸 정의: 정책 열한 칸 + 챕터 열 칸(`chapter:1`~`chapter:10`). «확률 안내에 반영되는 칸»은 확률 안내가 읽는 칸 목록(`CAPSULE_COLUMNS`)과 정확히 같고(퀘스트 전 두 칸과 챕터 칸은 아니다),
 *   기본값은 `DEFAULT_CAPSULE_POLICY`와 마이그레이션 232 시드(챕터별 채울 양)와 같다. 0개는 허용하고 챕터 채울 양은 1 이상이다
 * - 읽기: 두 표를 가공 없이 읽어 한 값 묶음으로 만든다. 구역 수정 시각은 정책 행과 챕터 행들 가운데 가장 늦은 것이다. 챕터 행이 비면 던진다. 열한 번째 챕터 행은 읽지도 않는다
 * - 쓰기(행 단위): 가장 늦은 수정 시각이 화면이 본 값과 같을 때만 시작하고, 행마다 방금 읽은 수정 시각이 같을 때만 갱신한다. 정책만·챕터만·둘 다 모두 되고,
 *   쓰다가 다른 곳이 먼저 바꾸거나 DB 오류가 나면 이미 쓴 행을 이전 값과 이전 수정 시각으로 되돌린다. 되돌리기까지 실패하면 로그와 함께 error
 * - 공용 저장(`saveBalanceSection`)을 지나면: 챕터 행 저장이 `chapter:3` 칸 이름으로 이력에 남고, 등급 확률 합이 100이 아니면 400이고, 0개도 저장되고,
 *   이력을 못 쓰면 구역 수정 시각과 값이 원래대로 돌아온다
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

import { DEFAULT_CAPSULE_POLICY, VALIDATORS } from '@/lib/capsule/policy'
import { CAPSULE_COLUMNS } from '@/lib/probability/disclosure'
import { activeZeroWarnings, checkFieldValue, draftFromValues, groupSums } from '../fields'
import {
  CAPSULE_BINDING,
  CAPSULE_CHAPTER_COUNT,
  CAPSULE_CHAPTER_DEFAULT_FILL,
  CAPSULE_CHAPTER_KEYS,
  CAPSULE_CHAPTER_SELECT,
  CAPSULE_FIELDS,
  CAPSULE_NO_ITEM_WARNING,
  CAPSULE_POLICY_KEYS,
  CAPSULE_POLICY_SELECT,
  CAPSULE_RARITY_KEYS,
  chapterKey,
  parseChapterKey,
} from '../capsule'
import { BALANCE_HISTORY_FAILED_MESSAGE, BALANCE_INVALID_MESSAGE, saveBalanceSection } from '../save'
import { INTEGER_MAX } from '../types'
import { CAPSULE_ROW_STAMP, capsulePolicyRow, chapterCostRows, createFakeDb, type FakeDb } from './fakeDb'

const ACTOR = '11111111-1111-4111-8111-111111111111'
const NEXT = '2026-10-22T02:00:00.000Z'
const byKey = Object.fromEntries(CAPSULE_FIELDS.map((def) => [def.key, def]))

let db: FakeDb

beforeEach(() => {
  db = createFakeDb({
    capsule_policy: [capsulePolicyRow()],
    capsule_chapter_costs: chapterCostRows(),
    balance_setting_changes: [],
    users: [{ id: ACTOR, username: 'karina' }],
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const policyRow = () => db.tables.capsule_policy[0]
const chapterRow = (no: number) => db.tables.capsule_chapter_costs.find((row) => row.chapter_no === no)
const historyRows = () => db.tables.balance_setting_changes
const writeInput = (values: Record<string, number>, overrides: { expectedUpdatedAt?: string; nextUpdatedAt?: string } = {}) => ({
  values,
  expectedUpdatedAt: CAPSULE_ROW_STAMP,
  nextUpdatedAt: NEXT,
  ...overrides,
})
const save = (values: unknown, extra: { note?: unknown; expectedUpdatedAt?: unknown } = {}) =>
  saveBalanceSection(db.client, { binding: CAPSULE_BINDING, values, expectedUpdatedAt: CAPSULE_ROW_STAMP, actor: ACTOR, ...extra })

describe('챕터 칸 이름', () => {
  it('chapter:N 형식이고 1~10만 읽는다', () => {
    expect(chapterKey(3)).toBe('chapter:3')
    expect(parseChapterKey('chapter:1')).toBe(1)
    expect(parseChapterKey('chapter:10')).toBe(10)
    for (const key of ['chapter:0', 'chapter:11', 'chapter:01', 'chapter:', 'chapters:1', 'chapter:1.5', 'chapter:-1', 'guaranteed_count', '']) {
      expect(parseChapterKey(key), key).toBeNull()
    }
    expect(CAPSULE_CHAPTER_KEYS).toEqual(Array.from({ length: 10 }, (_, i) => `chapter:${i + 1}`))
  })
})

describe('캡슐 칸 정의', () => {
  it('정책 열한 칸 다음에 챕터 열 칸이 오고 칸 이름은 겹치지 않는다', () => {
    expect(CAPSULE_FIELDS.map((def) => def.key)).toEqual([...CAPSULE_POLICY_KEYS, ...CAPSULE_CHAPTER_KEYS])
    expect(CAPSULE_FIELDS).toHaveLength(11 + CAPSULE_CHAPTER_COUNT)
    expect(new Set(CAPSULE_FIELDS.map((def) => def.key)).size).toBe(CAPSULE_FIELDS.length)
  })

  it('«확률 안내에 반영되는 칸»이 확률 안내가 읽는 capsule_policy 칸 목록과 정확히 같다', () => {
    const affecting = CAPSULE_FIELDS.filter((def) => def.affectsDisclosure).map((def) => def.key)
    expect(affecting.sort()).toEqual([...CAPSULE_COLUMNS].sort())
    for (const key of ['pre_quest_fill_amount', 'pre_quest_unlock_required', ...CAPSULE_CHAPTER_KEYS]) {
      expect(byKey[key].affectsDisclosure, key).toBe(false)
    }
  })

  it('정책 칸의 기본값이 DEFAULT_CAPSULE_POLICY와 같다', () => {
    for (const key of CAPSULE_POLICY_KEYS) expect(byKey[key].defaultValue, key).toBe(DEFAULT_CAPSULE_POLICY[key])
  })

  it('챕터별 채울 양의 기본값이 마이그레이션 232 시드와 같다', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/232_capsule_storage_and_fill.sql'), 'utf8')
    const block = sql.slice(sql.indexOf('INSERT INTO public.capsule_chapter_costs'), sql.indexOf('ON CONFLICT (chapter_no) DO NOTHING'))
    const seed = [...block.matchAll(/\((\d+),\s*(\d+)\)/g)].map((match) => [Number(match[1]), Number(match[2])])
    expect(seed).toHaveLength(CAPSULE_CHAPTER_COUNT)
    expect(CAPSULE_CHAPTER_DEFAULT_FILL).toEqual(seed.map(([, fill]) => fill))
    CAPSULE_CHAPTER_KEYS.forEach((key, index) => expect(byKey[key].defaultValue, key).toBe(seed[index][1]))
  })

  it('읽기에 넘기는 칸 목록이 정책 칸과 updated_at뿐이다', () => {
    expect(CAPSULE_POLICY_SELECT.split(',').map((column) => column.trim())).toEqual([...CAPSULE_POLICY_KEYS, 'updated_at'])
    expect(CAPSULE_CHAPTER_SELECT).toBe('chapter_no, fill_amount, updated_at')
  })

  it('등급 확률 네 칸만 합 100 묶음이다', () => {
    expect(CAPSULE_FIELDS.filter((def) => def.sumTo === 100).map((def) => def.key)).toEqual([...CAPSULE_RARITY_KEYS])
  })

  it('챕터 칸은 «챕터별 채울 양» 묶음이고 1 이상 정수(잼)다', () => {
    for (const key of CAPSULE_CHAPTER_KEYS) {
      expect(byKey[key].group, key).toBe('챕터별 채울 양')
      expect(byKey[key].unit, key).toBe('잼')
      expect(checkFieldValue(byKey[key], 0), key).not.toBeNull()
      expect(checkFieldValue(byKey[key], 1), key).toBeNull()
      expect(checkFieldValue(byKey[key], 220), key).toBeNull()
      expect(checkFieldValue(byKey[key], 90.5), key).not.toBeNull()
    }
    expect(byKey['chapter:3'].label).toBe('챕터 3')
  })

  it('0개를 허용한다: 확정 개수·보너스 개수는 0이 통과하고, Epic 보정·퀘스트 전 두 칸은 0이 거절된다', () => {
    for (const key of ['guaranteed_count', 'bonus_count']) {
      expect(checkFieldValue(byKey[key], 0), key).toBeNull()
      expect(checkFieldValue(byKey[key], -1), key).not.toBeNull()
    }
    for (const key of ['pity_epic_threshold', 'pre_quest_fill_amount', 'pre_quest_unlock_required']) {
      expect(checkFieldValue(byKey[key], 0), key).not.toBeNull()
      expect(checkFieldValue(byKey[key], 1), key).toBeNull()
    }
  })

  it('확률은 0~1·소수 셋째 자리, 등급 확률은 0~100이다', () => {
    for (const key of ['bonus_probability', 'other_tribe_probability']) {
      expect(checkFieldValue(byKey[key], 0), key).toBeNull()
      expect(checkFieldValue(byKey[key], 1), key).toBeNull()
      expect(checkFieldValue(byKey[key], 1.001), key).not.toBeNull()
      expect(checkFieldValue(byKey[key], 0.2005), key).not.toBeNull()
    }
    for (const key of CAPSULE_RARITY_KEYS) {
      expect(checkFieldValue(byKey[key], 0), key).toBeNull()
      expect(checkFieldValue(byKey[key], 100), key).toBeNull()
      expect(checkFieldValue(byKey[key], 100.1), key).not.toBeNull()
    }
  })

  it('정책 칸 정의를 통과하는 값은 lib/capsule/policy.ts의 VALIDATORS도 통과한다(DB CHECK와 같은 기준)', () => {
    const samples = [-1, 0, 0.2, 1, 1.001, 2, 15, 70, 100, INTEGER_MAX, INTEGER_MAX + 1]
    for (const key of CAPSULE_POLICY_KEYS) {
      for (const n of samples) {
        if (checkFieldValue(byKey[key], n) === null) expect(VALIDATORS[key](n), `${key}=${n}`).toBe(true)
      }
    }
  })

  it('챕터 칸의 연결 검사는 1 이상 정수다', () => {
    const validator = CAPSULE_BINDING.validators?.['chapter:3']
    expect(validator?.(1)).toBe(true)
    expect(validator?.(0)).toBe(false)
    expect(validator?.(1.5)).toBe(false)
  })
})

describe('캡슐 «모두 0» 경고와 합계', () => {
  const draftOf = (overrides: Record<string, number>) =>
    draftFromValues(CAPSULE_FIELDS, {
      ...Object.fromEntries(CAPSULE_POLICY_KEYS.map((key) => [key, DEFAULT_CAPSULE_POLICY[key]])),
      ...Object.fromEntries(CAPSULE_CHAPTER_KEYS.map((key, index) => [key, CAPSULE_CHAPTER_DEFAULT_FILL[index]])),
      ...overrides,
    })

  it('확정 개수와 보너스 개수가 모두 0일 때만 켜진다', () => {
    expect(activeZeroWarnings(CAPSULE_BINDING.zeroWarnings, draftOf({ guaranteed_count: 0, bonus_count: 0 }))).toEqual([CAPSULE_NO_ITEM_WARNING])
    expect(activeZeroWarnings(CAPSULE_BINDING.zeroWarnings, draftOf({ guaranteed_count: 0 }))).toEqual([])
    expect(activeZeroWarnings(CAPSULE_BINDING.zeroWarnings, draftOf({}))).toEqual([])
    expect(CAPSULE_NO_ITEM_WARNING.startsWith('아이템 배지가 나오지 않아요.')).toBe(true)
  })

  it('등급 확률 합계 묶음은 기본값에서 100이고 하나만 바꾸면 어긋난다', () => {
    expect(groupSums(CAPSULE_FIELDS, draftOf({}))).toEqual([{ title: '등급 확률', target: 100, unit: '%', sum: 100, ok: true, message: null }])
    const [sum] = groupSums(CAPSULE_FIELDS, draftOf({ rarity_common: 60 }))
    expect(sum.ok).toBe(false)
    expect(sum.message).toBe('등급 확률 합이 100이어야 해요. 지금은 90이에요.')
  })
})

describe('CAPSULE_BINDING.read', () => {
  it('정책 열한 칸(NUMERIC 문자열 포함)과 챕터 열 칸을 한 값 묶음으로 읽는다', async () => {
    const snapshot = await CAPSULE_BINDING.read(db.client)
    expect(snapshot.values).toEqual({
      guaranteed_count: 1,
      bonus_count: 1,
      bonus_probability: 0.2,
      other_tribe_probability: 0.2,
      rarity_common: 70,
      rarity_rare: 22,
      rarity_epic: 6,
      rarity_mystic: 2,
      pity_epic_threshold: 15,
      pre_quest_fill_amount: 5,
      pre_quest_unlock_required: 5,
      'chapter:1': 90,
      'chapter:2': 100,
      'chapter:3': 110,
      'chapter:4': 120,
      'chapter:5': 135,
      'chapter:6': 150,
      'chapter:7': 165,
      'chapter:8': 180,
      'chapter:9': 200,
      'chapter:10': 220,
    })
    expect(Object.keys(snapshot.values)).toEqual(CAPSULE_FIELDS.map((def) => def.key))
    expect(snapshot.updatedAt).toBe(CAPSULE_ROW_STAMP)
    expect(db.selects).toEqual([CAPSULE_POLICY_SELECT, CAPSULE_CHAPTER_SELECT])
  })

  it('구역 수정 시각은 정책 행과 챕터 행들 가운데 가장 늦은 것이다', async () => {
    chapterRow(3)!.updated_at = '2026-10-22T03:00:00.250000+00:00'
    expect((await CAPSULE_BINDING.read(db.client)).updatedAt).toBe('2026-10-22T03:00:00.250000+00:00')
    policyRow().updated_at = '2026-10-22T04:00:00+00:00'
    expect((await CAPSULE_BINDING.read(db.client)).updatedAt).toBe('2026-10-22T04:00:00+00:00')
  })

  it('저장된 값이 비정상이어도 기본값으로 바꿔 보이지 않고 그대로 읽는다', async () => {
    db.tables.capsule_policy = [capsulePolicyRow({ rarity_common: '90.000' })]
    chapterRow(2)!.fill_amount = 999
    const { values } = await CAPSULE_BINDING.read(db.client)
    expect(values.rarity_common).toBe(90)
    expect(values['chapter:2']).toBe(999)
  })

  it('열한 번째 챕터 행은 읽지도 않고 그 수정 시각도 구역 수정 시각에 넣지 않는다', async () => {
    db.tables.capsule_chapter_costs.push({ chapter_no: 11, fill_amount: 240, updated_at: '2026-10-23T00:00:00+00:00' })
    const snapshot = await CAPSULE_BINDING.read(db.client)
    expect(snapshot.values['chapter:11']).toBeUndefined()
    expect(Object.keys(snapshot.values)).toHaveLength(21)
    expect(snapshot.updatedAt).toBe(CAPSULE_ROW_STAMP)
  })

  it('행이 없거나 숫자가 아닌 칸이 있거나 조회가 실패하면 던진다', async () => {
    db.tables.capsule_policy = []
    await expect(CAPSULE_BINDING.read(db.client)).rejects.toThrow('id=1 행이 없음')

    db.tables.capsule_policy = [capsulePolicyRow({ pity_epic_threshold: null })]
    await expect(CAPSULE_BINDING.read(db.client)).rejects.toThrow('pity_epic_threshold')

    db.tables.capsule_policy = [capsulePolicyRow()]
    db.tables.capsule_chapter_costs = db.tables.capsule_chapter_costs.filter((row) => row.chapter_no !== 7)
    await expect(CAPSULE_BINDING.read(db.client)).rejects.toThrow('챕터 7 행이 없음')

    db.tables.capsule_chapter_costs = chapterCostRows()
    chapterRow(4)!.fill_amount = null
    await expect(CAPSULE_BINDING.read(db.client)).rejects.toThrow('챕터 4 값을 숫자로 읽을 수 없음')

    chapterRow(4)!.fill_amount = 120
    db.readErrors.capsule_chapter_costs = 'boom'
    await expect(CAPSULE_BINDING.read(db.client)).rejects.toThrow('챕터별 채울 양 조회 실패: boom')

    db.readErrors.capsule_chapter_costs = undefined
    db.readErrors.capsule_policy = 'boom'
    await expect(CAPSULE_BINDING.read(db.client)).rejects.toThrow('캡슐 정책 조회 실패: boom')
  })
})

describe('CAPSULE_BINDING.write — 행 단위 갱신', () => {
  it('정책 칸만 바꾸면 정책 행 하나만 갱신한다(챕터 행은 건드리지 않는다)', async () => {
    const res = await CAPSULE_BINDING.write(db.client, writeInput({ guaranteed_count: 2 }))
    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.updates).toEqual([{ guaranteed_count: 2, updated_at: NEXT }])
    expect(policyRow()).toMatchObject({ guaranteed_count: 2, bonus_count: 1 })
    expect(db.tables.capsule_chapter_costs.every((row) => row.updated_at === CAPSULE_ROW_STAMP)).toBe(true)
  })

  it('챕터 칸만 바꾸면 그 챕터 행만 갱신하고 정책 행은 건드리지 않는다', async () => {
    const res = await CAPSULE_BINDING.write(db.client, writeInput({ 'chapter:3': 115 }))
    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.updates).toEqual([{ fill_amount: 115, updated_at: NEXT }])
    expect(chapterRow(3)).toMatchObject({ fill_amount: 115, updated_at: NEXT })
    expect(chapterRow(2)).toMatchObject({ fill_amount: 100, updated_at: CAPSULE_ROW_STAMP })
    expect(policyRow().updated_at).toBe(CAPSULE_ROW_STAMP)
  })

  it('정책과 챕터 여러 행을 한 번에 바꾼다(정책 먼저, 챕터는 번호 순서)', async () => {
    const res = await CAPSULE_BINDING.write(db.client, writeInput({ 'chapter:5': 140, rarity_common: 65, 'chapter:3': 115, rarity_rare: 27 }))
    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.calls.filter((call) => call.endsWith('.update'))).toEqual([
      'capsule_policy.update',
      'capsule_chapter_costs.update',
      'capsule_chapter_costs.update',
    ])
    expect(db.updates).toEqual([
      { rarity_common: 65, rarity_rare: 27, updated_at: NEXT },
      { fill_amount: 115, updated_at: NEXT },
      { fill_amount: 140, updated_at: NEXT },
    ])
    expect((await CAPSULE_BINDING.read(db.client)).updatedAt).toBe(NEXT)
  })

  it('쓰지 않은 행의 수정 시각이 더 늦으면 돌려주는 구역 수정 시각은 그 값이다(다음 읽기와 같다)', async () => {
    policyRow().updated_at = '2026-10-22T05:00:00+00:00'
    const res = await CAPSULE_BINDING.write(
      db.client,
      writeInput({ 'chapter:3': 115 }, { expectedUpdatedAt: '2026-10-22T05:00:00+00:00', nextUpdatedAt: '2026-10-22T02:00:00.000Z' })
    )
    expect(res).toEqual({ ok: true, updatedAt: '2026-10-22T05:00:00+00:00' })
    expect((await CAPSULE_BINDING.read(db.client)).updatedAt).toBe('2026-10-22T05:00:00+00:00')
  })

  it('화면이 본 수정 시각이 가장 늦은 수정 시각과 다르면 아무것도 쓰지 않고 conflict다', async () => {
    chapterRow(9)!.updated_at = '2026-10-22T03:00:00+00:00'
    const res = await CAPSULE_BINDING.write(db.client, writeInput({ 'chapter:3': 115 }))
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect(db.updates).toEqual([])
    expect(chapterRow(3)!.fill_amount).toBe(110)
  })

  it('쓰는 도중 다른 곳이 챕터 행을 먼저 바꾸면 conflict이고 이미 쓴 정책 행을 이전 값과 이전 수정 시각으로 되돌린다', async () => {
    db.beforeUpdate = (nth) => {
      if (nth === 2) chapterRow(3)!.updated_at = '2026-10-22T01:30:00+00:00'
    }
    const res = await CAPSULE_BINDING.write(db.client, writeInput({ rarity_common: 65, rarity_rare: 27, 'chapter:3': 115 }))
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    // 바꾸려던 두 칸이 이전 값으로 돌아오고 수정 시각도 이전 값이다
    expect(policyRow()).toMatchObject({ rarity_common: 70, rarity_rare: 22, updated_at: CAPSULE_ROW_STAMP })
    expect(chapterRow(3)!.fill_amount).toBe(110)
  })

  it('두 번째 챕터 행에서 막히면 앞서 쓴 챕터 행과 정책 행을 모두 되돌린다', async () => {
    db.beforeUpdate = (nth) => {
      if (nth === 3) chapterRow(5)!.updated_at = '2026-10-22T01:30:00+00:00'
    }
    const res = await CAPSULE_BINDING.write(db.client, writeInput({ guaranteed_count: 3, 'chapter:3': 115, 'chapter:5': 140 }))
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect(policyRow()).toMatchObject({ guaranteed_count: 1, updated_at: CAPSULE_ROW_STAMP })
    expect(chapterRow(3)).toMatchObject({ fill_amount: 110, updated_at: CAPSULE_ROW_STAMP })
    expect(chapterRow(5)!.fill_amount).toBe(135)
  })

  it('쓰는 도중 DB 오류가 나면 error이고 이미 쓴 행을 되돌린다', async () => {
    db.failUpdateFrom.capsule_chapter_costs = 1
    const res = await CAPSULE_BINDING.write(db.client, writeInput({ guaranteed_count: 3, 'chapter:3': 115 }))
    expect(res).toEqual({ ok: false, reason: 'error', message: '업데이트 실패' })
    expect(policyRow()).toMatchObject({ guaranteed_count: 1, updated_at: CAPSULE_ROW_STAMP })
    expect(chapterRow(3)).toMatchObject({ fill_amount: 110, updated_at: CAPSULE_ROW_STAMP })
  })

  it('되돌리기까지 실패하면 로그를 남기고 error로 알린다', async () => {
    db.writeErrors.capsule_chapter_costs = 'boom'
    db.failUpdateFrom.capsule_policy = 2
    const res = await CAPSULE_BINDING.write(db.client, writeInput({ guaranteed_count: 3, 'chapter:3': 115 }))
    expect(res).toEqual({ ok: false, reason: 'error', message: 'boom (되돌리기 실패)' })
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('되돌리지도 못했다'), expect.any(String))
  })

  it('첫 행에서 막히면 되돌릴 것이 없다(DB 오류는 error, 읽기 실패도 error)', async () => {
    db.writeErrors.capsule_policy = 'boom'
    expect(await CAPSULE_BINDING.write(db.client, writeInput({ guaranteed_count: 3 }))).toEqual({ ok: false, reason: 'error', message: 'boom' })
    db.writeErrors.capsule_policy = undefined
    db.readErrors.capsule_chapter_costs = 'boom'
    expect(await CAPSULE_BINDING.write(db.client, writeInput({ guaranteed_count: 3 }))).toMatchObject({ ok: false, reason: 'error' })
  })

  it('이 구역의 칸이 아닌 값(잼·동기화 칸, 11번째 챕터)은 본문에 있어도 쓰지 않는다', async () => {
    await CAPSULE_BINDING.write(db.client, writeInput({ guaranteed_count: 2, common_streak_threshold: 1, locked_roll_probability: 0.5, 'chapter:11': 1 }))
    expect(db.updates).toEqual([{ guaranteed_count: 2, updated_at: NEXT }])
  })

  it('쓸 칸이 하나도 없으면 error다', async () => {
    expect(await CAPSULE_BINDING.write(db.client, writeInput({ 'chapter:11': 1 }))).toEqual({ ok: false, reason: 'error', message: '바꿀 칸이 없음' })
    expect(db.updates).toEqual([])
  })
})

describe('캡슐 구역 저장 (공용 저장을 지난다)', () => {
  it('챕터별 채울 양을 바꾸면 chapter:3 칸 이름으로 이력에 남고 확률 안내 반영 표시는 없다', async () => {
    const out = await save({ 'chapter:3': 115 }, { note: '3챕터 완화' })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.changes).toEqual([{ field: 'chapter:3', from: 110, to: 115 }])
    expect(out.affectsDisclosure).toBe(false)
    expect(out.values['chapter:3']).toBe(115)
    expect(out.values['chapter:4']).toBe(120)
    expect(chapterRow(3)!.fill_amount).toBe(115)
    expect(chapterRow(4)!.fill_amount).toBe(120)
    expect(historyRows()).toHaveLength(1)
    expect(historyRows()[0]).toMatchObject({
      section_key: 'capsule',
      changes: [{ field: 'chapter:3', from: 110, to: 115 }],
      note: '3챕터 완화',
      affects_disclosure: false,
      changed_by: ACTOR,
    })
  })

  it('정책과 챕터를 함께 바꾸면 한 줄 이력에 모두 남고 확률 안내 반영 표시가 켜진다', async () => {
    const out = await save({ rarity_common: 65, rarity_rare: 27, 'chapter:1': 95, 'chapter:10': 230 })
    expect(out.ok).toBe(true)
    expect(historyRows()).toHaveLength(1)
    expect(historyRows()[0].affects_disclosure).toBe(true)
    expect((historyRows()[0].changes as Array<{ field: string }>).map((change) => change.field)).toEqual([
      'rarity_common',
      'rarity_rare',
      'chapter:1',
      'chapter:10',
    ])
  })

  it('저장 결과의 구역 수정 시각이 다음 읽기와 같아 연이어 저장할 수 있다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-10-22T02:00:00.000Z'))
      const first = await save({ 'chapter:3': 115 })
      expect(first.ok).toBe(true)
      if (!first.ok) return
      expect(first.updatedAt).toBe((await CAPSULE_BINDING.read(db.client)).updatedAt)

      vi.setSystemTime(new Date('2026-10-22T02:00:05.000Z'))
      const second = await save({ guaranteed_count: 2 }, { expectedUpdatedAt: first.updatedAt })
      expect(second.ok).toBe(true)
      if (!second.ok) return
      expect(second.updatedAt).toBe((await CAPSULE_BINDING.read(db.client)).updatedAt)
      expect(second.updatedAt).not.toBe(first.updatedAt)

      // 이전 수정 시각으로는 더 저장할 수 없다
      const stale = await save({ bonus_count: 0 }, { expectedUpdatedAt: first.updatedAt })
      expect(stale).toMatchObject({ ok: false, status: 409 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('등급 확률 합이 100이 아니면 400이고 네 칸 모두에 같은 문장이 붙으며 아무것도 쓰지 않는다', async () => {
    const out = await save({ rarity_common: 60 })
    expect(out).toMatchObject({ ok: false, status: 400, error: BALANCE_INVALID_MESSAGE })
    if (out.ok) return
    expect(Object.keys(out.fieldErrors ?? {}).sort()).toEqual([...CAPSULE_RARITY_KEYS].sort())
    expect(new Set(Object.values(out.fieldErrors ?? {}))).toEqual(new Set(['등급 확률 합이 100이어야 해요. 지금은 90이에요.']))
    expect(db.updates).toEqual([])
    expect(historyRows()).toEqual([])
  })

  it('합 100에 맞게 네 칸을 함께 바꾸면 저장된다', async () => {
    expect((await save({ rarity_common: 60, rarity_rare: 30, rarity_epic: 8, rarity_mystic: 2 })).ok).toBe(true)
  })

  it('0개도 저장된다: 확정 개수 0, 보너스 개수 0 (경고만 보이고 막지 않는다)', async () => {
    const out = await save({ guaranteed_count: 0, bonus_count: 0 })
    expect(out.ok).toBe(true)
    expect(policyRow()).toMatchObject({ guaranteed_count: 0, bonus_count: 0 })
  })

  it('챕터 채울 양 0, 소수, 없는 챕터, 열한 번째 챕터는 거절한다', async () => {
    const out = await save({ 'chapter:3': 0, 'chapter:4': 1.5, 'chapter:0': 1, 'chapter:11': 300 })
    expect(out).toMatchObject({ ok: false, status: 400, error: BALANCE_INVALID_MESSAGE })
    if (out.ok) return
    expect(Object.keys(out.fieldErrors ?? {}).sort()).toEqual(['chapter:0', 'chapter:11', 'chapter:3', 'chapter:4'])
    expect(out.fieldErrors?.['chapter:11']).toBe('알 수 없는 칸이에요.')
    expect(db.updates).toEqual([])
  })

  it('잼·동기화 구역의 칸(보정·잠길 확률)은 이 구역에서 «알 수 없는 칸»으로 거절한다', async () => {
    const out = await save({ common_streak_threshold: 5, locked_roll_probability: 0.5 })
    expect(out).toMatchObject({ ok: false, status: 400 })
    if (out.ok) return
    expect(out.fieldErrors).toEqual({ common_streak_threshold: '알 수 없는 칸이에요.', locked_roll_probability: '알 수 없는 칸이에요.' })
  })

  it('다른 사람이 먼저 바꿨으면(수정 시각 불일치) 409이고 이력이 없다', async () => {
    const out = await save({ 'chapter:3': 115 }, { expectedUpdatedAt: '2026-10-21T00:00:00+00:00' })
    expect(out).toMatchObject({ ok: false, status: 409 })
    expect(historyRows()).toEqual([])
  })

  it('이력을 쓰지 못하면 값과 구역 수정 시각이 원래대로 돌아오고 500이다', async () => {
    db.writeErrors.balance_setting_changes = 'secret relation detail'
    const out = await save({ rarity_common: 65, rarity_rare: 27, 'chapter:3': 115 })
    expect(out).toMatchObject({ ok: false, status: 500, error: BALANCE_HISTORY_FAILED_MESSAGE })
    const after = await CAPSULE_BINDING.read(db.client)
    expect(after.updatedAt).toBe(CAPSULE_ROW_STAMP)
    expect(after.values).toMatchObject({ rarity_common: 70, rarity_rare: 22, 'chapter:3': 110 })
  })

  it('챕터만 바꾸다 이력이 실패해도 원래대로 돌아온다', async () => {
    db.writeErrors.balance_setting_changes = 'boom'
    const out = await save({ 'chapter:3': 115 })
    expect(out).toMatchObject({ ok: false, status: 500 })
    expect((await CAPSULE_BINDING.read(db.client)).values['chapter:3']).toBe(110)
    expect((await CAPSULE_BINDING.read(db.client)).updatedAt).toBe(CAPSULE_ROW_STAMP)
  })
})
