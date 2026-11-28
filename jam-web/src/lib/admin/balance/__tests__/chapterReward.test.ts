/**
 * 챕터 보상 구역 연결 (티켓 20261127_1740 C9b) — `chapter_reward_policy` id=1 한 행 + `chapter_definitions.reward_count` 챕터 1~9. 가짜 표로 지키는 것:
 * - 칸 정의: 정책 6칸(등급 확률 네 칸·다른 트라이브 확률·Epic 보정)과 챕터별 개수 9칸(`reward_count:1`~`reward_count:9`, 챕터 10 칸 없음). 기본값은 마이그레이션 366 시드 SQL과 같다.
 *   확률 안내가 읽는 칸(`CHAPTER_REWARD_COLUMNS`)과 챕터별 개수가 `affectsDisclosure`(확인창)이고 목록은 `CHAPTER_REWARD_COLUMNS`에서 온다
 * - 검증: 등급 네 칸 합이 100이 아니면 저장되지 않고, 확률은 0~1, 개수·보정은 1 이상 정수
 * - 읽기: 가공 없이 읽는다. 챕터 10의 NULL은 정상이고(읽지 않는다), 챕터 1~9의 NULL이나 정책 행 없음은 던진다
 * - 쓰기(행 단위): 가장 늦은 수정 시각이 화면이 본 값과 같을 때만 시작하고, 행마다 읽은 수정 시각이 같을 때만 갱신한다. 막히면 이미 쓴 행을 이전 값과 이전 수정 시각으로 되돌린다
 * - 공용 저장을 지나면 `section_key = 'chapter_reward'`로 이력에 남고, 바꾼 값을 추첨이 읽는 같은 표(`getChapterRewardPolicy`·`getChapterRewardCount`)에서 읽는다
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

import { getChapterRewardCount, getChapterRewardPolicy } from '@/lib/chapter/reward/policy'
import { CHAPTER_REWARD_COLUMNS } from '@/lib/probability/disclosure'
import { CHAPTER_REWARD_SECTION_KEY } from '@/lib/probability/changeLog'
import { checkFieldValue } from '../fields'
import {
  CHAPTER_REWARD_BINDING,
  CHAPTER_REWARD_COUNT_GROUP,
  CHAPTER_REWARD_COUNT_KEYS,
  CHAPTER_REWARD_DEFAULT_COUNTS,
  CHAPTER_REWARD_DEFAULT_POLICY,
  CHAPTER_REWARD_DEFINITION_SELECT,
  CHAPTER_REWARD_FIELDS,
  CHAPTER_REWARD_PITY_HINT,
  CHAPTER_REWARD_POLICY_KEYS,
  CHAPTER_REWARD_POLICY_SELECT,
  CHAPTER_REWARD_RARITY_KEYS,
  CHAPTER_REWARD_SECTION_ID,
  parseRewardCountKey,
  rewardCountKey,
} from '../chapterReward'
import { BALANCE_HISTORY_FAILED_MESSAGE, saveBalanceSection } from '../save'
import { INTEGER_MAX } from '../types'
import {
  CHAPTER_DEFINITION_ROW_STAMP,
  CHAPTER_REWARD_POLICY_ROW_STAMP,
  chapterDefinitionRows,
  chapterRewardPolicyRow,
  createFakeDb,
  type FakeDb,
} from './fakeDb'

const ACTOR = '11111111-1111-4111-8111-111111111111'
const NEXT = '2026-11-28T02:00:00.000Z'
/** 기본 행 가운데 정책 행의 수정 시각이 가장 늦어 구역의 수정 시각이다. */
const SECTION_STAMP = CHAPTER_REWARD_POLICY_ROW_STAMP
const byKey = Object.fromEntries(CHAPTER_REWARD_FIELDS.map((def) => [def.key, def]))

let db: FakeDb

beforeEach(() => {
  db = createFakeDb({
    chapter_reward_policy: [chapterRewardPolicyRow()],
    chapter_definitions: chapterDefinitionRows(),
    balance_setting_changes: [],
    users: [{ id: ACTOR, username: 'karina' }],
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const policyRow = () => db.tables.chapter_reward_policy[0]
const definitionRow = (chapterNo: number) => db.tables.chapter_definitions.find((row) => row.chapter_no === chapterNo)
const historyRows = () => db.tables.balance_setting_changes
const writeInput = (values: Record<string, number>, overrides: { expectedUpdatedAt?: string; nextUpdatedAt?: string } = {}) => ({
  values,
  expectedUpdatedAt: SECTION_STAMP,
  nextUpdatedAt: NEXT,
  ...overrides,
})
const save = (values: unknown, extra: { note?: unknown; expectedUpdatedAt?: unknown } = {}) =>
  saveBalanceSection(db.client, { binding: CHAPTER_REWARD_BINDING, values, expectedUpdatedAt: SECTION_STAMP, actor: ACTOR, ...extra })

describe('칸 이름', () => {
  it('개수는 reward_count:챕터 형식이고 챕터 1~9만 칸이다', () => {
    expect(rewardCountKey(3)).toBe('reward_count:3')
    expect(parseRewardCountKey('reward_count:1')).toBe(1)
    expect(parseRewardCountKey('reward_count:9')).toBe(9)
    for (const key of ['reward_count:10', 'reward_count:0', 'reward_count:11', 'reward_count:03', 'reward_count:', 'reward_count:x', 'required_jam:3', 'rarity_common', '']) {
      expect(parseRewardCountKey(key), key).toBeNull()
    }
    expect(CHAPTER_REWARD_COUNT_KEYS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map((no) => `reward_count:${no}`))
  })
})

describe('챕터 보상 칸 정의', () => {
  it('구역 키는 chapter_reward이고 확률 안내 «바뀐 날짜»가 읽는 구역 키와 같다', () => {
    expect(CHAPTER_REWARD_SECTION_ID).toBe('chapter_reward')
    expect(CHAPTER_REWARD_BINDING.id).toBe('chapter_reward')
    expect(CHAPTER_REWARD_SECTION_ID).toBe(CHAPTER_REWARD_SECTION_KEY)
  })

  it('칸은 개수 아홉 칸과 정책 여섯 칸이고 챕터 10 칸이 없으며 이름이 겹치지 않는다', () => {
    const keys = CHAPTER_REWARD_FIELDS.map((def) => def.key)
    expect(keys).toEqual([...CHAPTER_REWARD_COUNT_KEYS, ...CHAPTER_REWARD_POLICY_KEYS])
    expect(keys).toHaveLength(15)
    expect(new Set(keys).size).toBe(15)
    expect(keys).not.toContain('reward_count:10')
    // 동기화 구역이 편집하는 jam_policy 두 칸은 이 구역에 없다
    expect(keys).not.toContain('common_streak_threshold')
    expect(keys).not.toContain('locked_roll_probability')
  })

  it('정책 칸 목록이 확률 안내 칸 목록(CHAPTER_REWARD_COLUMNS)·추첨이 읽는 열과 같은 여섯 칸이다', () => {
    expect([...CHAPTER_REWARD_POLICY_KEYS].sort()).toEqual([...CHAPTER_REWARD_COLUMNS].sort())
    expect(CHAPTER_REWARD_POLICY_SELECT).toBe(`${CHAPTER_REWARD_POLICY_KEYS.join(', ')}, updated_at`)
    expect(CHAPTER_REWARD_DEFINITION_SELECT).toBe('chapter_no, reward_count, updated_at')
  })

  it('확인창이 뜨는 칸(affectsDisclosure)은 CHAPTER_REWARD_COLUMNS 여섯 칸과 챕터별 개수 아홉 칸이다', () => {
    const disclosed = CHAPTER_REWARD_FIELDS.filter((def) => def.affectsDisclosure).map((def) => def.key)
    expect([...disclosed].sort()).toEqual([...CHAPTER_REWARD_COLUMNS, ...CHAPTER_REWARD_COUNT_KEYS].sort())
    for (const key of CHAPTER_REWARD_COLUMNS) expect(byKey[key].affectsDisclosure, key).toBe(true)
  })

  it('개수는 개 단위의 1 이상 정수이고 한 묶음이다', () => {
    for (const key of CHAPTER_REWARD_COUNT_KEYS) {
      const def = byKey[key]
      expect(def.group).toBe(CHAPTER_REWARD_COUNT_GROUP)
      expect(def.label).toBe(`챕터 ${Number(key.slice('reward_count:'.length))}`)
      expect(def.unit).toBe('개')
      expect([def.decimals, def.min, def.max]).toEqual([0, 1, INTEGER_MAX])
    }
  })

  it('등급 확률 네 칸은 한 묶음으로 합 100이고, 다른 트라이브 확률은 0~1, Epic 보정은 1 이상 정수다', () => {
    for (const key of CHAPTER_REWARD_RARITY_KEYS) {
      expect(byKey[key].sumTo, key).toBe(100)
      expect(byKey[key].group, key).toBe('등급 확률')
      expect([byKey[key].min, byKey[key].max], key).toEqual([0, 100])
    }
    expect([byKey.other_tribe_probability.min, byKey.other_tribe_probability.max]).toEqual([0, 1])
    expect([byKey.pity_epic_threshold.decimals, byKey.pity_epic_threshold.min]).toEqual([0, 1])
    expect(byKey.pity_epic_threshold.hint).toBe(CHAPTER_REWARD_PITY_HINT)
    expect(CHAPTER_REWARD_PITY_HINT).toContain('9보다 크면')
  })

  it('기본값이 마이그레이션 366 시드와 같다(개수 챕터 1~9, 정책 열 기본값)', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/366_chapter_reward.sql'), 'utf8')
    const block = sql.slice(sql.indexOf('FROM (VALUES'), sql.indexOf(') AS v(no, cnt)'))
    const seed = [...block.matchAll(/\((\d+),\s*(\d+)\)/g)].map((match) => [Number(match[1]), Number(match[2])])
    expect(seed.map(([chapterNo]) => chapterNo)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(CHAPTER_REWARD_DEFAULT_COUNTS).toEqual(seed.map(([, count]) => count))
    for (const [chapterNo, count] of seed) expect(byKey[`reward_count:${chapterNo}`].defaultValue, `챕터 ${chapterNo}`).toBe(count)

    const policySql = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS public.chapter_reward_policy'), sql.indexOf('ENABLE ROW LEVEL SECURITY'))
    for (const key of CHAPTER_REWARD_POLICY_KEYS) {
      const match = new RegExp(`${key} (?:NUMERIC|INTEGER) NOT NULL DEFAULT ([0-9.]+)`).exec(policySql)
      expect(match, key).not.toBeNull()
      expect(CHAPTER_REWARD_DEFAULT_POLICY[key], key).toBe(Number(match?.[1]))
      expect(byKey[key].defaultValue, key).toBe(Number(match?.[1]))
    }
  })

  it('칸마다 범위를 지킨다: 개수 0·소수 거절, 확률 1 초과 거절, 보정 0 거절. 연결 검사도 같은 기준이다', () => {
    expect(checkFieldValue(byKey['reward_count:2'], 1)).toBeNull()
    expect(checkFieldValue(byKey['reward_count:2'], 0)).not.toBeNull()
    expect(checkFieldValue(byKey['reward_count:2'], 1.5)).not.toBeNull()
    expect(checkFieldValue(byKey.other_tribe_probability, 1)).toBeNull()
    expect(checkFieldValue(byKey.other_tribe_probability, 1.1)).not.toBeNull()
    expect(checkFieldValue(byKey.pity_epic_threshold, 0)).not.toBeNull()
    expect(checkFieldValue(byKey.rarity_common, 101)).not.toBeNull()

    const v = CHAPTER_REWARD_BINDING.validators
    expect(v?.['reward_count:2']?.(1)).toBe(true)
    expect(v?.['reward_count:2']?.(0)).toBe(false)
    expect(v?.['reward_count:2']?.(1.5)).toBe(false)
    expect(v?.other_tribe_probability?.(0)).toBe(true)
    expect(v?.other_tribe_probability?.(1.01)).toBe(false)
    expect(v?.pity_epic_threshold?.(1)).toBe(true)
    expect(v?.pity_epic_threshold?.(0)).toBe(false)
    expect(v?.pity_epic_threshold?.(2.5)).toBe(false)
    expect(v?.rarity_epic?.(0)).toBe(true)
    expect(v?.rarity_epic?.(-1)).toBe(false)
  })

  it('등급 네 칸 합이 100이 아니면 네 칸 모두에 같은 문장이 붙고, 100이면 비어 있다', () => {
    const ok = { rarity_common: 30, rarity_rare: 40, rarity_epic: 22, rarity_mystic: 8 }
    expect(CHAPTER_REWARD_BINDING.validateTogether?.(ok)).toEqual({})
    const bad = CHAPTER_REWARD_BINDING.validateTogether?.({ ...ok, rarity_mystic: 9 }) ?? {}
    expect(Object.keys(bad).sort()).toEqual([...CHAPTER_REWARD_RARITY_KEYS].sort())
    expect(new Set(Object.values(bad)).size).toBe(1)
    expect(Object.values(bad)[0]).toContain('100')
  })
})

describe('CHAPTER_REWARD_BINDING.read', () => {
  it('두 표를 가공 없이 읽어 한 값 묶음으로 돌려주고 칸 순서가 칸 정의와 같다', async () => {
    const snapshot = await CHAPTER_REWARD_BINDING.read(db.client)
    expect(snapshot.updatedAt).toBe(SECTION_STAMP)
    expect(Object.keys(snapshot.values)).toEqual(CHAPTER_REWARD_FIELDS.map((def) => def.key))
    expect(snapshot.values).toEqual({
      'reward_count:1': 3,
      'reward_count:2': 3,
      'reward_count:3': 3,
      'reward_count:4': 4,
      'reward_count:5': 4,
      'reward_count:6': 4,
      'reward_count:7': 5,
      'reward_count:8': 5,
      'reward_count:9': 5,
      rarity_common: 30,
      rarity_rare: 40,
      rarity_epic: 22,
      rarity_mystic: 8,
      other_tribe_probability: 0.2,
      pity_epic_threshold: 15,
    })
    expect(db.selects).toContain(CHAPTER_REWARD_POLICY_SELECT)
    expect(db.selects).toContain(CHAPTER_REWARD_DEFINITION_SELECT)
    expect(db.orders).toContain('chapter_definitions.order:chapter_no')
  })

  it('구역 수정 시각은 정책 행과 챕터 1~9 행 가운데 가장 늦은 것이다', async () => {
    definitionRow(5)!.updated_at = '2026-12-01T00:00:00+00:00'
    expect((await CHAPTER_REWARD_BINDING.read(db.client)).updatedAt).toBe('2026-12-01T00:00:00+00:00')
  })

  it('챕터 10은 NULL이 정상이라 던지지 않고, 값에도 수정 시각에도 들어오지 않는다', async () => {
    definitionRow(10)!.updated_at = '2027-01-01T00:00:00+00:00'
    const snapshot = await CHAPTER_REWARD_BINDING.read(db.client)
    expect(snapshot.values).not.toHaveProperty('reward_count:10')
    expect(snapshot.updatedAt).toBe(SECTION_STAMP)
  })

  it('챕터 1~9의 개수가 NULL이면(정의 위반) 0으로 바꿔 보이지 않고 던진다', async () => {
    definitionRow(4)!.reward_count = null
    await expect(CHAPTER_REWARD_BINDING.read(db.client)).rejects.toThrow('챕터 4')
  })

  it('정책 행이나 챕터 행이 없거나, 숫자가 아닌 칸이 있거나, 조회가 실패하면 던진다', async () => {
    db.tables.chapter_reward_policy = []
    await expect(CHAPTER_REWARD_BINDING.read(db.client)).rejects.toThrow('id=1 행이 없음')
    db.tables.chapter_reward_policy = [chapterRewardPolicyRow({ rarity_rare: 'abc' })]
    await expect(CHAPTER_REWARD_BINDING.read(db.client)).rejects.toThrow('rarity_rare')
    db.tables.chapter_reward_policy = [chapterRewardPolicyRow()]
    db.tables.chapter_definitions = chapterDefinitionRows().filter((row) => row.chapter_no !== 6)
    await expect(CHAPTER_REWARD_BINDING.read(db.client)).rejects.toThrow('챕터 6 행이 없음')
    db.tables.chapter_definitions = chapterDefinitionRows()
    db.readErrors.chapter_reward_policy = 'boom'
    await expect(CHAPTER_REWARD_BINDING.read(db.client)).rejects.toThrow('boom')
    db.readErrors.chapter_reward_policy = undefined
    db.readErrors.chapter_definitions = 'boom'
    await expect(CHAPTER_REWARD_BINDING.read(db.client)).rejects.toThrow('boom')
  })

  it('필요 잼 열은 읽지 않는다(챕터 구역 소관)', () => {
    expect(CHAPTER_REWARD_DEFINITION_SELECT).not.toContain('required_jam')
  })
})

describe('CHAPTER_REWARD_BINDING.write — 행 단위 갱신', () => {
  it('정책 칸과 개수 칸을 함께 바꾸면 정책 행 한 번과 챕터 행마다 한 번씩 쓰고, 필요 잼·옛 점수 열은 건드리지 않는다', async () => {
    const res = await CHAPTER_REWARD_BINDING.write(db.client, writeInput({ rarity_common: 25, rarity_rare: 45, 'reward_count:3': 4, 'reward_count:1': 2 }))
    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.calls.filter((call) => call.endsWith('.update'))).toEqual([
      'chapter_reward_policy.update',
      'chapter_definitions.update',
      'chapter_definitions.update',
    ])
    expect(db.updates).toEqual([
      { rarity_common: 25, rarity_rare: 45, updated_at: NEXT },
      { reward_count: 2, updated_at: NEXT },
      { reward_count: 4, updated_at: NEXT },
    ])
    expect(policyRow()).toMatchObject({ rarity_common: 25, rarity_rare: 45, rarity_epic: '22', updated_at: NEXT })
    expect(definitionRow(3)).toMatchObject({ reward_count: 4, required_jam: 1260, required_score: 2300, updated_at: NEXT })
    expect(definitionRow(2)).toMatchObject({ reward_count: 3, updated_at: CHAPTER_DEFINITION_ROW_STAMP })
    expect((await CHAPTER_REWARD_BINDING.read(db.client)).updatedAt).toBe(NEXT)
  })

  it('개수만 바꾸면 정책 행은 쓰지 않는다', async () => {
    const res = await CHAPTER_REWARD_BINDING.write(db.client, writeInput({ 'reward_count:9': 6 }))
    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.calls.filter((call) => call.endsWith('.update'))).toEqual(['chapter_definitions.update'])
    expect(policyRow().updated_at).toBe(SECTION_STAMP)
  })

  it('정책 칸만 바꾸면 챕터 행은 쓰지 않고, 돌려주는 구역 수정 시각이 다음 읽기와 같다', async () => {
    definitionRow(2)!.updated_at = '2026-12-05T00:00:00+00:00'
    const res = await CHAPTER_REWARD_BINDING.write(db.client, writeInput({ pity_epic_threshold: 12 }, { expectedUpdatedAt: '2026-12-05T00:00:00+00:00' }))
    expect(db.calls.filter((call) => call.endsWith('.update'))).toEqual(['chapter_reward_policy.update'])
    expect(res).toEqual({ ok: true, updatedAt: '2026-12-05T00:00:00+00:00' })
    expect((await CHAPTER_REWARD_BINDING.read(db.client)).updatedAt).toBe('2026-12-05T00:00:00+00:00')
  })

  it('화면이 본 수정 시각이 가장 늦은 수정 시각과 다르면 아무것도 쓰지 않고 conflict다(챕터 구역이 챕터 행을 먼저 저장한 경우 포함)', async () => {
    definitionRow(6)!.updated_at = '2026-12-05T00:00:00+00:00'
    const res = await CHAPTER_REWARD_BINDING.write(db.client, writeInput({ 'reward_count:3': 4 }))
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect(db.updates).toEqual([])
    expect(definitionRow(3)!.reward_count).toBe(3)
  })

  it('챕터 구역이 같은 행의 필요 잼을 저장해도 개수 열은 그대로이고, 그 뒤 이 구역의 저장은 읽은 시각이 낡아 conflict다', async () => {
    definitionRow(3)!.required_jam = 1300
    definitionRow(3)!.updated_at = '2026-12-05T00:00:00+00:00'
    expect(definitionRow(3)!.reward_count).toBe(3)
    expect(await CHAPTER_REWARD_BINDING.write(db.client, writeInput({ 'reward_count:3': 4 }))).toEqual({ ok: false, reason: 'conflict' })
    // 새로 읽은 수정 시각으로 다시 저장하면 되고, 필요 잼은 그대로 남는다
    const fresh = await CHAPTER_REWARD_BINDING.read(db.client)
    const res = await CHAPTER_REWARD_BINDING.write(db.client, writeInput({ 'reward_count:3': 4 }, { expectedUpdatedAt: fresh.updatedAt }))
    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(definitionRow(3)).toMatchObject({ reward_count: 4, required_jam: 1300 })
  })

  it('쓰는 도중 다른 곳이 뒤쪽 행을 먼저 바꾸면 앞서 쓴 정책 행과 챕터 행을 이전 값과 이전 수정 시각으로 되돌린다', async () => {
    db.beforeUpdate = (nth) => {
      if (nth === 3) definitionRow(7)!.updated_at = '2026-11-28T01:30:00+00:00'
    }
    const res = await CHAPTER_REWARD_BINDING.write(db.client, writeInput({ rarity_common: 25, rarity_rare: 45, 'reward_count:2': 4, 'reward_count:7': 6 }))
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect(policyRow()).toMatchObject({ rarity_common: 30, rarity_rare: 40, updated_at: SECTION_STAMP })
    expect(definitionRow(2)).toMatchObject({ reward_count: 3, updated_at: CHAPTER_DEFINITION_ROW_STAMP })
    expect(definitionRow(7)).toMatchObject({ reward_count: 5, updated_at: '2026-11-28T01:30:00+00:00' })
  })

  it('쓰는 도중 DB 오류가 나고 되돌리기까지 실패하면 로그를 남기고 error로 알린다', async () => {
    db.failUpdateFrom.chapter_definitions = 2
    const res = await CHAPTER_REWARD_BINDING.write(db.client, writeInput({ 'reward_count:2': 4, 'reward_count:3': 5 }))
    expect(res).toEqual({ ok: false, reason: 'error', message: '업데이트 실패 (되돌리기 실패)' })
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('chapter_reward 여러 행을 쓰다 멈췄고 이미 쓴 행을 되돌리지도 못했다'), expect.any(String))
  })

  it('첫 행에서 막히면 되돌릴 것이 없다(DB 오류는 error, 읽기 실패도 error)', async () => {
    db.writeErrors.chapter_reward_policy = 'boom'
    expect(await CHAPTER_REWARD_BINDING.write(db.client, writeInput({ pity_epic_threshold: 12 }))).toEqual({ ok: false, reason: 'error', message: 'boom' })
    db.writeErrors.chapter_reward_policy = undefined
    db.readErrors.chapter_definitions = 'boom'
    expect(await CHAPTER_REWARD_BINDING.write(db.client, writeInput({ pity_epic_threshold: 12 }))).toMatchObject({ ok: false, reason: 'error' })
  })

  it('이 구역의 칸이 아닌 값은 본문에 있어도 쓰지 않는다(챕터 10·필요 잼·동기화 공유 두 칸·다른 구역 칸)', async () => {
    const res = await CHAPTER_REWARD_BINDING.write(
      db.client,
      writeInput({
        'reward_count:3': 4,
        'reward_count:10': 7,
        'reward_count:11': 7,
        'required_jam:3': 9999,
        common_streak_threshold: 9,
        locked_roll_probability: 0.5,
        guaranteed_count: 9,
      })
    )
    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.updates).toEqual([{ reward_count: 4, updated_at: NEXT }])
    expect(definitionRow(10)!.reward_count).toBeNull()
  })

  it('쓸 칸이 하나도 없으면 error다', async () => {
    const res = await CHAPTER_REWARD_BINDING.write(db.client, writeInput({ 'reward_count:10': 7, common_streak_threshold: 9 }))
    expect(res).toEqual({ ok: false, reason: 'error', message: '바꿀 칸이 없음' })
    expect(db.updates).toEqual([])
  })
})

describe('챕터 보상 구역 저장 (공용 저장을 지난다)', () => {
  it('바꾼 칸이 section_key chapter_reward 이력 한 줄로 남고 확인창 대상(확률 안내 반영)으로 표시된다', async () => {
    const out = await save({ rarity_common: 25, rarity_rare: 45, 'reward_count:3': 4 }, { note: '보상 조정' })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.changes).toEqual([
      { field: 'reward_count:3', from: 3, to: 4 },
      { field: 'rarity_common', from: 30, to: 25 },
      { field: 'rarity_rare', from: 40, to: 45 },
    ])
    expect(out.affectsDisclosure).toBe(true)
    expect(Object.keys(out.values)).toEqual(CHAPTER_REWARD_FIELDS.map((def) => def.key))
    expect(historyRows()).toHaveLength(1)
    expect(historyRows()[0]).toMatchObject({
      section_key: 'chapter_reward',
      note: '보상 조정',
      affects_disclosure: true,
      changed_by: ACTOR,
    })
  })

  it('등급 네 칸 합이 100이 아니면 저장되지 않고 이력도 없다', async () => {
    const out = await save({ rarity_common: 31 })
    expect(out).toMatchObject({ ok: false, status: 400 })
    expect(db.updates).toEqual([])
    expect(historyRows()).toEqual([])
    expect(policyRow().rarity_common).toBe('30')
  })

  it('개수 0·확률 1 초과·보정 0은 칸 범위에서 거절된다', async () => {
    for (const body of [{ 'reward_count:2': 0 }, { 'reward_count:2': 1.5 }, { other_tribe_probability: 1.2 }, { pity_epic_threshold: 0 }]) {
      const out = await save(body)
      expect(out, JSON.stringify(body)).toMatchObject({ ok: false, status: 400 })
    }
    expect(db.updates).toEqual([])
    expect(historyRows()).toEqual([])
  })

  it('챕터 10·필요 잼·동기화 공유 칸과 다른 구역의 칸은 «알 수 없는 칸»으로 거절한다', async () => {
    for (const key of ['reward_count:10', 'required_jam:3', 'common_streak_threshold', 'locked_roll_probability', 'guaranteed_count']) {
      expect(await save({ [key]: 5 }), key).toMatchObject({ ok: false, status: 400 })
    }
    expect(db.updates).toEqual([])
  })

  it('다른 사람이 먼저 바꿨으면(수정 시각 불일치) 409이고 이력이 없다', async () => {
    const out = await save({ 'reward_count:3': 4 }, { expectedUpdatedAt: '2026-10-21T00:00:00+00:00' })
    expect(out).toMatchObject({ ok: false, status: 409 })
    expect(db.updates).toEqual([])
    expect(historyRows()).toEqual([])
  })

  it('저장 도중 한 행이 막히면 409이고 이미 쓴 행이 원래대로 돌아오며 이력이 없다', async () => {
    db.beforeUpdate = (nth) => {
      if (nth === 3) definitionRow(5)!.updated_at = '2026-11-28T01:30:00+00:00'
    }
    const out = await save({ pity_epic_threshold: 12, 'reward_count:3': 4, 'reward_count:5': 5 })
    expect(out).toMatchObject({ ok: false, status: 409 })
    expect(policyRow()).toMatchObject({ pity_epic_threshold: 15, updated_at: SECTION_STAMP })
    expect(definitionRow(3)).toMatchObject({ reward_count: 3, updated_at: CHAPTER_DEFINITION_ROW_STAMP })
    expect(historyRows()).toEqual([])
  })

  it('저장 도중 DB 오류가 나면 500이고 DB 오류 원문을 싣지 않는다', async () => {
    db.writeErrors.chapter_definitions = 'secret relation detail'
    const out = await save({ pity_epic_threshold: 12, 'reward_count:3': 4 })
    expect(out).toMatchObject({ ok: false, status: 500 })
    if (out.ok) return
    expect(out.error).not.toContain('secret relation detail')
    expect(policyRow()).toMatchObject({ pity_epic_threshold: 15, updated_at: SECTION_STAMP })
    expect(historyRows()).toEqual([])
  })

  it('이력을 쓰지 못하면 값과 구역 수정 시각이 원래대로 돌아오고 500이다', async () => {
    db.writeErrors.balance_setting_changes = 'secret relation detail'
    const out = await save({ rarity_common: 25, rarity_rare: 45, 'reward_count:3': 4 })
    expect(out).toMatchObject({ ok: false, status: 500, error: BALANCE_HISTORY_FAILED_MESSAGE })
    const after = await CHAPTER_REWARD_BINDING.read(db.client)
    expect(after.updatedAt).toBe(SECTION_STAMP)
    expect(after.values).toMatchObject({ rarity_common: 30, rarity_rare: 40, 'reward_count:3': 3 })
  })

  it('저장 결과의 구역 수정 시각이 다음 읽기와 같아 연이어 저장할 수 있다', async () => {
    const first = await save({ 'reward_count:3': 4 })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const second = await saveBalanceSection(db.client, {
      binding: CHAPTER_REWARD_BINDING,
      values: { pity_epic_threshold: 12 },
      expectedUpdatedAt: first.updatedAt,
      actor: ACTOR,
    })
    expect(second.ok).toBe(true)
  })
})

describe('바꾼 값이 추첨이 읽는 표에 반영된다 (C3a)', () => {
  const asSupabase = () => db.client as unknown as SupabaseClient

  it('저장한 확률·보정은 getChapterRewardPolicy가, 저장한 개수는 getChapterRewardCount가 그대로 읽는다', async () => {
    const out = await save({
      rarity_common: 20,
      rarity_rare: 40,
      rarity_epic: 28,
      rarity_mystic: 12,
      other_tribe_probability: 0.35,
      pity_epic_threshold: 9,
      'reward_count:2': 6,
    })
    expect(out.ok).toBe(true)
    expect(await getChapterRewardPolicy(asSupabase())).toEqual({
      rarity_common: 20,
      rarity_rare: 40,
      rarity_epic: 28,
      rarity_mystic: 12,
      other_tribe_probability: 0.35,
      pity_epic_threshold: 9,
    })
    expect(await getChapterRewardCount(asSupabase(), 2)).toBe(6)
    // 바꾸지 않은 챕터와 마지막 챕터
    expect(await getChapterRewardCount(asSupabase(), 3)).toBe(3)
    expect(await getChapterRewardCount(asSupabase(), 10)).toBeNull()
  })
})
