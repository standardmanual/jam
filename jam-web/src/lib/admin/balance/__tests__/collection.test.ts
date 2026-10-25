/**
 * 컬렉션과 믹스 구역 연결 (티켓 20261022_1133 1회, 20261023_1648 4회) — `item_book_tier_default_rewards` 네 등급 행과 `combine_policy` id=1 행의 `fail_reward_points`·`tier_up_probability`. 가짜 표로 지키는 것:
 * - 칸 정의: 등급별 기본 포인트 네 칸(`default_reward:common`~`mystic`)과 믹스 실패 포인트 한 칸은 0 이상 정수이고 확률 안내에 반영되지 않는다.
 *   기본값은 마이그레이션 222 시드와 `DEFAULT_COMBINE_POLICY`와 같다. 0은 허용(지급 생략)하고 음수·소수는 거절한다
 * - 윗등급 확률 칸(`tier_up_probability`): 화면은 퍼센트(0~100, 소수 첫째 자리), DB는 0~1이다. 읽을 때 ×100, 쓸 때 ÷100이고 이력 값은 퍼센트다. 기본값은 `DEFAULT_COMBINE_POLICY`(0.7)를 퍼센트로 바꾼 70이다.
 *   확률 안내가 읽는 칸 목록(`COMBINE_COLUMNS`)과 같은 칸이라 `affectsDisclosure`가 `true`이고(저장 전 확인창, 이력의 `affects_disclosure`), 다른 칸은 `false`다
 * - 읽기: 두 표를 가공 없이 읽어 한 값 묶음으로 만든다. 구역 수정 시각은 다섯 행 가운데 가장 늦은 것이다. 등급 행이 모자라거나 정책 행이 없으면 던진다
 * - 쓰기(행 단위): 가장 늦은 수정 시각이 화면이 본 값과 같을 때만 시작하고, 행마다 방금 읽은 수정 시각이 같을 때만 갱신한다. 등급만·믹스만·둘 다 모두 되고(등급 순서, 그다음 믹스),
 *   믹스 정책 행의 두 칸(실패 포인트, 윗등급 확률)은 함께 바꿔도 **한 번의 갱신**이다(수정 시각을 한 번만 올리므로 따로 쓰면 두 번째가 충돌한다),
 *   쓰다가 다른 곳이 먼저 바꾸거나 DB 오류가 나면 이미 쓴 행을 이전 값과 이전 수정 시각으로 되돌린다. 되돌리기까지 실패하면 로그와 함께 error
 * - 공용 저장(`saveBalanceSection`)을 지나면: 저장되고 `default_reward:epic`·`fail_reward_points` 칸 이름으로 이력에 남는다. 음수·소수는 저장되지 않고 이유가 붙는다.
 *   다른 사람이 먼저 바꿨으면 409이고, 이력을 못 쓰면 두 표의 값과 수정 시각이 원래대로 돌아온다
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

import { DEFAULT_COMBINE_POLICY } from '@/lib/combine/policy'
import { COMBINE_COLUMNS } from '@/lib/probability/disclosure'
import { checkFieldValue, draftFromValues } from '../fields'
import {
  COLLECTION_BINDING,
  COLLECTION_COMBINE_SELECT,
  COLLECTION_DEFAULT_TIER_REWARDS,
  COLLECTION_FIELDS,
  COLLECTION_SECTION_ID,
  COLLECTION_TIER_KEYS,
  COLLECTION_TIER_SELECT,
  FAIL_REWARD_KEY,
  TIER_UP_PROBABILITY_KEY,
  parseTierRewardKey,
  tierRewardKey,
} from '../collection'
import { BALANCE_HISTORY_FAILED_MESSAGE, BALANCE_INVALID_MESSAGE, saveBalanceSection } from '../save'
import { INTEGER_MAX } from '../types'
import { COMBINE_ROW_STAMP, TIER_REWARD_ROW_STAMP, combinePolicyRow, createFakeDb, tierDefaultRewardRows, type FakeDb } from './fakeDb'

const ACTOR = '11111111-1111-4111-8111-111111111111'
const NEXT = '2026-10-22T02:00:00.000Z'
/** 기본 행에서 가장 늦은 수정 시각(믹스 정책 행)이 구역의 수정 시각이다. */
const SECTION_STAMP = COMBINE_ROW_STAMP
const byKey = Object.fromEntries(COLLECTION_FIELDS.map((def) => [def.key, def]))
/** 포인트 단위 정수 칸(윗등급 확률 칸은 퍼센트라 따로 시험한다) */
const POINT_FIELDS = COLLECTION_FIELDS.filter((def) => def.key !== TIER_UP_PROBABILITY_KEY)

let db: FakeDb

beforeEach(() => {
  db = createFakeDb({
    item_book_tier_default_rewards: tierDefaultRewardRows(),
    combine_policy: [combinePolicyRow()],
    balance_setting_changes: [],
    users: [{ id: ACTOR, username: 'karina' }],
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const tierRow = (tier: string) => db.tables.item_book_tier_default_rewards.find((row) => row.tier === tier)
const combineRow = () => db.tables.combine_policy[0]
const historyRows = () => db.tables.balance_setting_changes
const writeInput = (values: Record<string, number>, overrides: { expectedUpdatedAt?: string; nextUpdatedAt?: string } = {}) => ({
  values,
  expectedUpdatedAt: SECTION_STAMP,
  nextUpdatedAt: NEXT,
  ...overrides,
})
const save = (values: unknown, extra: { note?: unknown; expectedUpdatedAt?: unknown } = {}) =>
  saveBalanceSection(db.client, { binding: COLLECTION_BINDING, values, expectedUpdatedAt: SECTION_STAMP, actor: ACTOR, ...extra })

describe('등급 칸 이름', () => {
  it('default_reward:등급 형식이고 네 등급만 읽는다', () => {
    expect(tierRewardKey('epic')).toBe('default_reward:epic')
    expect(parseTierRewardKey('default_reward:common')).toBe('common')
    expect(parseTierRewardKey('default_reward:mystic')).toBe('mystic')
    for (const key of ['default_reward:legend', 'default_reward:', 'default_reward:Epic', 'reward:epic', 'fail_reward_points', '']) {
      expect(parseTierRewardKey(key), key).toBeNull()
    }
    expect(COLLECTION_TIER_KEYS).toEqual(['default_reward:common', 'default_reward:rare', 'default_reward:epic', 'default_reward:mystic'])
  })
})

describe('컬렉션과 믹스 칸 정의', () => {
  it('구역 키는 collection이고 등급 네 칸 다음에 믹스 실패 포인트, 등급 올리기 윗등급 확률이 온다', () => {
    expect(COLLECTION_SECTION_ID).toBe('collection')
    expect(COLLECTION_BINDING.id).toBe('collection')
    expect(COLLECTION_FIELDS.map((def) => def.key)).toEqual([...COLLECTION_TIER_KEYS, 'fail_reward_points', 'tier_up_probability'])
    expect(FAIL_REWARD_KEY).toBe('fail_reward_points')
    expect(TIER_UP_PROBABILITY_KEY).toBe('tier_up_probability')
    expect(COLLECTION_FIELDS.map((def) => def.label)).toEqual(['Common', 'Rare', 'Epic', 'Mystic', '믹스 실패 포인트', '등급 올리기 윗등급 확률'])
  })

  it('두 묶음(등급별 완성 포인트, 믹스)으로 나뉘고 포인트 칸은 포인트 단위의 0 이상 정수이며 확률 안내에는 반영되지 않는다', () => {
    expect(COLLECTION_FIELDS.map((def) => def.group)).toEqual([
      '컬렉션 등급별 완성 포인트',
      '컬렉션 등급별 완성 포인트',
      '컬렉션 등급별 완성 포인트',
      '컬렉션 등급별 완성 포인트',
      '믹스',
      '믹스',
    ])
    expect(POINT_FIELDS.map((def) => def.key)).toEqual([...COLLECTION_TIER_KEYS, 'fail_reward_points'])
    for (const def of POINT_FIELDS) {
      expect(def.unit, def.key).toBe('포인트')
      expect(def.decimals, def.key).toBe(0)
      expect(def.min, def.key).toBe(0)
      expect(def.max, def.key).toBe(INTEGER_MAX)
      expect(def.affectsDisclosure, def.key).toBe(false)
      expect(def.sumTo, def.key).toBeUndefined()
    }
  })

  it('윗등급 확률 칸은 퍼센트(0~100, 소수 첫째 자리)이고 기본값 70이며 확률 안내에 반영되는 칸이다', () => {
    const def = byKey[TIER_UP_PROBABILITY_KEY]
    expect(def).toMatchObject({ label: '등급 올리기 윗등급 확률', unit: '%', group: '믹스', decimals: 1, min: 0, max: 100, defaultValue: 70, affectsDisclosure: true })
    expect(def.sumTo).toBeUndefined()
    expect(def.defaultValue).toBe(DEFAULT_COMBINE_POLICY.tier_up_probability * 100)
    // 소수 첫째 자리까지, 0과 100은 통과, 범위 밖과 둘째 자리는 거절
    for (const ok of [0, 0.1, 33.3, 70, 99.9, 100]) expect(checkFieldValue(def, ok), String(ok)).toBeNull()
    for (const bad of [-0.1, 100.1, 33.33, 70.05, Number.NaN]) expect(checkFieldValue(def, bad), String(bad)).not.toBeNull()
    expect(COLLECTION_BINDING.validators?.[TIER_UP_PROBABILITY_KEY]?.(100)).toBe(true)
    expect(COLLECTION_BINDING.validators?.[TIER_UP_PROBABILITY_KEY]?.(33.3)).toBe(true)
    expect(COLLECTION_BINDING.validators?.[TIER_UP_PROBABILITY_KEY]?.(100.1)).toBe(false)
    expect(COLLECTION_BINDING.validators?.[TIER_UP_PROBABILITY_KEY]?.(-1)).toBe(false)
  })

  it('확률 안내에 반영되는 칸은 확률 안내가 읽는 combine_policy 칸 목록(COMBINE_COLUMNS)과 정확히 같다', () => {
    expect(COLLECTION_FIELDS.filter((def) => def.affectsDisclosure).map((def) => def.key)).toEqual([...COMBINE_COLUMNS])
  })

  it('등급별 기본값이 마이그레이션 222 시드와 같다', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/222_item_book_tiers.sql'), 'utf8')
    const block = sql.slice(sql.indexOf('INSERT INTO public.item_book_tier_default_rewards'), sql.indexOf('ON CONFLICT (tier) DO NOTHING'))
    const seed = Object.fromEntries([...block.matchAll(/\('(\w+)',\s*(\d+)\)/g)].map((match) => [match[1], Number(match[2])]))
    expect(seed).toEqual({ common: 100, rare: 200, epic: 400, mystic: 800 })
    expect(COLLECTION_DEFAULT_TIER_REWARDS).toEqual(seed)
    for (const [tier, points] of Object.entries(seed)) expect(byKey[`default_reward:${tier}`].defaultValue, tier).toBe(points)
  })

  it('믹스 실패 포인트와 윗등급 확률의 기본값이 DEFAULT_COMBINE_POLICY와 같다', () => {
    expect(byKey.fail_reward_points.defaultValue).toBe(DEFAULT_COMBINE_POLICY.fail_reward_points)
    expect(byKey.fail_reward_points.defaultValue).toBe(10)
    expect(byKey.tier_up_probability.defaultValue).toBe(70)
    expect(draftFromValues(COLLECTION_FIELDS, {})).toEqual({
      'default_reward:common': '100',
      'default_reward:rare': '200',
      'default_reward:epic': '400',
      'default_reward:mystic': '800',
      fail_reward_points: '10',
      tier_up_probability: '70',
    })
  })

  it('포인트 칸은 0은 통과(지급 생략)하고 음수·소수는 거절한다. 연결 검사도 같은 기준이다', () => {
    for (const def of POINT_FIELDS) {
      expect(checkFieldValue(def, 0), def.key).toBeNull()
      expect(checkFieldValue(def, 1000), def.key).toBeNull()
      for (const bad of [-1, 0.5, 1.5, INTEGER_MAX + 1]) expect(checkFieldValue(def, bad), `${def.key} ${bad}`).not.toBeNull()
      expect(COLLECTION_BINDING.validators?.[def.key]?.(0), def.key).toBe(true)
      expect(COLLECTION_BINDING.validators?.[def.key]?.(-1), def.key).toBe(false)
      expect(COLLECTION_BINDING.validators?.[def.key]?.(2.5), def.key).toBe(false)
    }
  })

  it('읽기에 넘기는 칸 목록이 필요한 칸과 updated_at뿐이다', () => {
    expect(COLLECTION_TIER_SELECT).toBe('tier, reward_points, updated_at')
    expect(COLLECTION_COMBINE_SELECT).toBe('fail_reward_points, tier_up_probability, updated_at')
  })
})

describe('COLLECTION_BINDING.read', () => {
  it('네 등급 행과 믹스 정책 행을 한 값 묶음으로 읽고(윗등급 확률은 퍼센트) 구역 수정 시각은 가장 늦은 행의 것이다', async () => {
    const snapshot = await COLLECTION_BINDING.read(db.client)
    expect(snapshot).toEqual({
      values: {
        'default_reward:common': 100,
        'default_reward:rare': 200,
        'default_reward:epic': 400,
        'default_reward:mystic': 800,
        fail_reward_points: 10,
        tier_up_probability: 70,
      },
      updatedAt: COMBINE_ROW_STAMP,
    })
    expect(Object.keys(snapshot.values)).toEqual(COLLECTION_FIELDS.map((def) => def.key))
    expect(db.selects).toContain(COLLECTION_TIER_SELECT)
    expect(db.selects).toContain(COLLECTION_COMBINE_SELECT)
  })

  it('등급 행의 수정 시각이 더 늦으면 그 값이 구역 수정 시각이다', async () => {
    tierRow('rare')!.updated_at = '2026-10-22T05:00:00+00:00'
    expect((await COLLECTION_BINDING.read(db.client)).updatedAt).toBe('2026-10-22T05:00:00+00:00')
  })

  it('저장된 값이 비정상이어도 기본값으로 바꿔 보이지 않고 그대로 읽는다', async () => {
    tierRow('epic')!.reward_points = 7
    combineRow().fail_reward_points = 0
    combineRow().tier_up_probability = 0
    const snapshot = await COLLECTION_BINDING.read(db.client)
    expect(snapshot.values['default_reward:epic']).toBe(7)
    expect(snapshot.values.fail_reward_points).toBe(0)
    expect(snapshot.values.tier_up_probability).toBe(0)
  })

  it('윗등급 확률은 NUMERIC이 문자열로 내려와도 읽고, 0~1을 소수 첫째 자리 퍼센트로 정확히 바꾼다(0.333 → 33.3)', async () => {
    combineRow().tier_up_probability = '0.333'
    expect((await COLLECTION_BINDING.read(db.client)).values.tier_up_probability).toBe(33.3)
    combineRow().tier_up_probability = 1
    expect((await COLLECTION_BINDING.read(db.client)).values.tier_up_probability).toBe(100)
    combineRow().tier_up_probability = '0.700'
    expect((await COLLECTION_BINDING.read(db.client)).values.tier_up_probability).toBe(70)
  })

  it('행이 없거나 숫자가 아닌 칸이 있거나 조회가 실패하면 던진다', async () => {
    db.tables.item_book_tier_default_rewards = tierDefaultRewardRows().slice(0, 3)
    await expect(COLLECTION_BINDING.read(db.client)).rejects.toThrow('mystic 행이 없음')

    db.tables.item_book_tier_default_rewards = tierDefaultRewardRows()
    db.tables.combine_policy = []
    await expect(COLLECTION_BINDING.read(db.client)).rejects.toThrow('id=1 행이 없음')

    db.tables.combine_policy = [combinePolicyRow({ fail_reward_points: null })]
    await expect(COLLECTION_BINDING.read(db.client)).rejects.toThrow('fail_reward_points')

    // 칸이 비었거나 숫자가 아니면 기본값 70으로 바꿔 보이지 않고 던진다
    db.tables.combine_policy = [combinePolicyRow({ tier_up_probability: null })]
    await expect(COLLECTION_BINDING.read(db.client)).rejects.toThrow('tier_up_probability 값을 숫자로 읽을 수 없음')

    db.tables.combine_policy = [combinePolicyRow()]
    tierRow('rare')!.reward_points = null
    await expect(COLLECTION_BINDING.read(db.client)).rejects.toThrow('rare 값을 숫자로 읽을 수 없음')

    tierRow('rare')!.reward_points = 200
    db.readErrors.item_book_tier_default_rewards = 'boom'
    await expect(COLLECTION_BINDING.read(db.client)).rejects.toThrow('컬렉션 등급별 기본 포인트 조회 실패: boom')

    db.readErrors.item_book_tier_default_rewards = undefined
    db.readErrors.combine_policy = 'boom'
    await expect(COLLECTION_BINDING.read(db.client)).rejects.toThrow('믹스 정책 조회 실패: boom')
  })
})

describe('COLLECTION_BINDING.write — 행 단위 갱신', () => {
  it('등급 칸만 바꾸면 그 등급 행 하나만 갱신한다(믹스 정책 행은 건드리지 않는다)', async () => {
    const res = await COLLECTION_BINDING.write(db.client, writeInput({ 'default_reward:epic': 450 }))
    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.updates).toEqual([{ reward_points: 450, updated_at: NEXT }])
    expect(tierRow('epic')).toMatchObject({ reward_points: 450, updated_at: NEXT })
    expect(tierRow('rare')).toMatchObject({ reward_points: 200, updated_at: TIER_REWARD_ROW_STAMP })
    expect(combineRow()).toMatchObject({ fail_reward_points: 10, updated_at: COMBINE_ROW_STAMP })
    expect((await COLLECTION_BINDING.read(db.client)).updatedAt).toBe(NEXT)
  })

  it('쓰지 않은 행의 수정 시각이 더 늦으면 돌려주는 구역 수정 시각은 그 값이다(다음 읽기와 같다)', async () => {
    combineRow().updated_at = '2026-10-22T05:00:00+00:00'
    const res = await COLLECTION_BINDING.write(
      db.client,
      writeInput({ 'default_reward:epic': 450 }, { expectedUpdatedAt: '2026-10-22T05:00:00+00:00' })
    )
    expect(res).toEqual({ ok: true, updatedAt: '2026-10-22T05:00:00+00:00' })
    expect((await COLLECTION_BINDING.read(db.client)).updatedAt).toBe('2026-10-22T05:00:00+00:00')
  })

  it('믹스 실패 포인트만 바꾸면 정책 행만 갱신하고 구역 수정 시각이 새 시각으로 올라간다', async () => {
    const res = await COLLECTION_BINDING.write(db.client, writeInput({ fail_reward_points: 20 }))
    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.updates).toEqual([{ fail_reward_points: 20, updated_at: NEXT }])
    expect(combineRow()).toMatchObject({ fail_reward_points: 20, updated_at: NEXT })
    expect(tierRow('common')!.updated_at).toBe(TIER_REWARD_ROW_STAMP)
    expect((await COLLECTION_BINDING.read(db.client)).updatedAt).toBe(NEXT)
  })

  it('윗등급 확률만 바꾸면 정책 행만 갱신하고 DB에는 0~1로 쓰며 구역 수정 시각이 새 시각으로 올라간다', async () => {
    const res = await COLLECTION_BINDING.write(db.client, writeInput({ tier_up_probability: 80 }))
    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.updates).toEqual([{ tier_up_probability: 0.8, updated_at: NEXT }])
    expect(combineRow()).toMatchObject({ fail_reward_points: 10, tier_up_probability: 0.8, updated_at: NEXT })
    expect(tierRow('common')!.updated_at).toBe(TIER_REWARD_ROW_STAMP)
    const after = await COLLECTION_BINDING.read(db.client)
    expect(after.updatedAt).toBe(NEXT)
    expect(after.values.tier_up_probability).toBe(80)
  })

  it('윗등급 확률의 소수 첫째 자리와 양 끝(0, 100)이 부동소수 오차 없이 0~1로 쓰인다', async () => {
    for (const [percent, fraction] of [
      [33.3, 0.333],
      [0.1, 0.001],
      [99.9, 0.999],
      [0, 0],
      [100, 1],
    ] as const) {
      db.updates.length = 0
      const stamp = (await COLLECTION_BINDING.read(db.client)).updatedAt
      expect(await COLLECTION_BINDING.write(db.client, writeInput({ tier_up_probability: percent }, { expectedUpdatedAt: stamp }))).toEqual({ ok: true, updatedAt: NEXT })
      expect(db.updates, String(percent)).toEqual([{ tier_up_probability: fraction, updated_at: NEXT }])
      expect(combineRow().tier_up_probability, String(percent)).toBe(fraction)
      combineRow().updated_at = COMBINE_ROW_STAMP
    }
  })

  it('믹스 실패 포인트와 윗등급 확률을 함께 바꿔도 정책 행은 한 번만 갱신한다(수정 시각을 따로 올리면 두 번째가 충돌한다)', async () => {
    const res = await COLLECTION_BINDING.write(db.client, writeInput({ fail_reward_points: 20, tier_up_probability: 50 }))
    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.calls.filter((call) => call === 'combine_policy.update')).toHaveLength(1)
    expect(db.updates).toEqual([{ fail_reward_points: 20, tier_up_probability: 0.5, updated_at: NEXT }])
    expect(combineRow()).toMatchObject({ fail_reward_points: 20, tier_up_probability: 0.5, updated_at: NEXT })
  })

  it('등급 행과 윗등급 확률을 함께 바꾸면 등급 행이 먼저이고 정책 행이 마지막이다', async () => {
    const res = await COLLECTION_BINDING.write(db.client, writeInput({ tier_up_probability: 60, 'default_reward:epic': 450 }))
    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.calls.filter((call) => call.endsWith('.update'))).toEqual(['item_book_tier_default_rewards.update', 'combine_policy.update'])
    expect(db.updates).toEqual([
      { reward_points: 450, updated_at: NEXT },
      { tier_up_probability: 0.6, updated_at: NEXT },
    ])
  })

  it('윗등급 확률을 쓰다 다른 곳이 정책 행을 먼저 바꾸면 conflict이고 이미 쓴 등급 행을 되돌리며 정책 행은 그 사람의 값 그대로다', async () => {
    db.beforeUpdate = (nth) => {
      if (nth === 2) combineRow().updated_at = '2026-10-22T01:30:00+00:00'
    }
    const res = await COLLECTION_BINDING.write(db.client, writeInput({ 'default_reward:epic': 450, tier_up_probability: 90 }))
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect(tierRow('epic')).toMatchObject({ reward_points: 400, updated_at: TIER_REWARD_ROW_STAMP })
    expect(combineRow()).toMatchObject({ tier_up_probability: 0.7, updated_at: '2026-10-22T01:30:00+00:00' })
  })

  it('윗등급 확률을 쓰다 DB 오류가 나면 error이고 이미 쓴 등급 행을 되돌린다', async () => {
    db.writeErrors.combine_policy = 'boom'
    const res = await COLLECTION_BINDING.write(db.client, writeInput({ 'default_reward:epic': 450, tier_up_probability: 90 }))
    expect(res).toEqual({ ok: false, reason: 'error', message: 'boom' })
    expect(tierRow('epic')).toMatchObject({ reward_points: 400, updated_at: TIER_REWARD_ROW_STAMP })
    expect(combineRow()).toMatchObject({ tier_up_probability: 0.7, updated_at: COMBINE_ROW_STAMP })
  })

  it('등급 여러 행과 믹스를 한 번에 바꾼다(등급 순서, 그다음 믹스)', async () => {
    const res = await COLLECTION_BINDING.write(
      db.client,
      writeInput({ fail_reward_points: 0, 'default_reward:mystic': 900, 'default_reward:common': 120 })
    )
    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.calls.filter((call) => call.endsWith('.update'))).toEqual([
      'item_book_tier_default_rewards.update',
      'item_book_tier_default_rewards.update',
      'combine_policy.update',
    ])
    expect(db.updates).toEqual([
      { reward_points: 120, updated_at: NEXT },
      { reward_points: 900, updated_at: NEXT },
      { fail_reward_points: 0, updated_at: NEXT },
    ])
    expect(tierRow('rare')!.updated_at).toBe(TIER_REWARD_ROW_STAMP)
  })

  it('화면이 본 수정 시각이 가장 늦은 수정 시각과 다르면 아무것도 쓰지 않고 conflict다', async () => {
    tierRow('rare')!.updated_at = '2026-10-22T03:00:00+00:00'
    const res = await COLLECTION_BINDING.write(db.client, writeInput({ 'default_reward:epic': 450 }))
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect(db.updates).toEqual([])
    expect(tierRow('epic')!.reward_points).toBe(400)
  })

  it('쓰는 도중 다른 곳이 믹스 정책 행을 먼저 바꾸면 conflict이고 이미 쓴 등급 행을 이전 값과 이전 수정 시각으로 되돌린다', async () => {
    db.beforeUpdate = (nth) => {
      if (nth === 3) combineRow().updated_at = '2026-10-22T01:30:00+00:00'
    }
    const res = await COLLECTION_BINDING.write(db.client, writeInput({ 'default_reward:common': 120, 'default_reward:epic': 450, fail_reward_points: 20 }))
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    // 바꾸려던 두 등급 행이 이전 값과 이전 수정 시각으로 돌아온다
    expect(tierRow('common')).toMatchObject({ reward_points: 100, updated_at: TIER_REWARD_ROW_STAMP })
    expect(tierRow('epic')).toMatchObject({ reward_points: 400, updated_at: TIER_REWARD_ROW_STAMP })
    expect(combineRow()).toMatchObject({ fail_reward_points: 10, updated_at: '2026-10-22T01:30:00+00:00' })
  })

  it('쓰는 도중 다른 곳이 뒤쪽 등급 행을 먼저 바꾸면 앞서 쓴 등급 행을 모두 되돌린다', async () => {
    db.beforeUpdate = (nth) => {
      if (nth === 2) tierRow('mystic')!.updated_at = '2026-10-22T01:30:00+00:00'
    }
    const res = await COLLECTION_BINDING.write(db.client, writeInput({ 'default_reward:rare': 250, 'default_reward:mystic': 900, fail_reward_points: 20 }))
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect(tierRow('rare')).toMatchObject({ reward_points: 200, updated_at: TIER_REWARD_ROW_STAMP })
    expect(tierRow('mystic')!.reward_points).toBe(800)
    expect(combineRow()).toMatchObject({ fail_reward_points: 10, updated_at: COMBINE_ROW_STAMP })
  })

  it('쓰는 도중 DB 오류가 나면 error이고 이미 쓴 행을 되돌린다', async () => {
    db.writeErrors.combine_policy = 'boom'
    const res = await COLLECTION_BINDING.write(db.client, writeInput({ 'default_reward:epic': 450, fail_reward_points: 20 }))
    expect(res).toEqual({ ok: false, reason: 'error', message: 'boom' })
    expect(tierRow('epic')).toMatchObject({ reward_points: 400, updated_at: TIER_REWARD_ROW_STAMP })
    expect(combineRow()).toMatchObject({ fail_reward_points: 10, updated_at: COMBINE_ROW_STAMP })
  })

  it('되돌리기까지 실패하면 로그를 남기고 error로 알린다', async () => {
    db.writeErrors.combine_policy = 'boom'
    db.failUpdateFrom.item_book_tier_default_rewards = 2
    const res = await COLLECTION_BINDING.write(db.client, writeInput({ 'default_reward:epic': 450, fail_reward_points: 20 }))
    expect(res).toEqual({ ok: false, reason: 'error', message: 'boom (되돌리기 실패)' })
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('collection 여러 행을 쓰다 멈췄고 이미 쓴 행을 되돌리지도 못했다'), expect.any(String))
  })

  it('첫 행에서 막히면 되돌릴 것이 없다(DB 오류는 error, 읽기 실패도 error)', async () => {
    db.writeErrors.item_book_tier_default_rewards = 'boom'
    expect(await COLLECTION_BINDING.write(db.client, writeInput({ 'default_reward:epic': 450 }))).toEqual({ ok: false, reason: 'error', message: 'boom' })
    db.writeErrors.item_book_tier_default_rewards = undefined
    db.readErrors.combine_policy = 'boom'
    expect(await COLLECTION_BINDING.write(db.client, writeInput({ 'default_reward:epic': 450 }))).toMatchObject({ ok: false, reason: 'error' })
  })

  it('이 구역의 칸이 아닌 값은 본문에 있어도 쓰지 않는다', async () => {
    await COLLECTION_BINDING.write(db.client, writeInput({ fail_reward_points: 20, intensity_light: 9, 'default_reward:legend': 1, locked_min_common: 1 }))
    expect(db.updates).toEqual([{ fail_reward_points: 20, updated_at: NEXT }])
  })

  it('쓸 칸이 하나도 없으면 error다', async () => {
    expect(await COLLECTION_BINDING.write(db.client, writeInput({ 'default_reward:legend': 1 }))).toEqual({
      ok: false,
      reason: 'error',
      message: '바꿀 칸이 없음',
    })
    expect(db.updates).toEqual([])
  })
})

describe('컬렉션과 믹스 구역 저장 (공용 저장을 지난다)', () => {
  it('등급 포인트와 믹스 실패 포인트를 바꾸면 저장되고 칸 이름으로 한 줄 이력에 남으며 확률 안내 반영 표시는 없다(윗등급 확률은 그대로)', async () => {
    const out = await save({ 'default_reward:epic': 450, fail_reward_points: 20, 'default_reward:common': 100 }, { note: '완성 포인트 조정' })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.changes).toEqual([
      { field: 'default_reward:epic', from: 400, to: 450 },
      { field: 'fail_reward_points', from: 10, to: 20 },
    ])
    expect(out.affectsDisclosure).toBe(false)
    expect(out.values).toEqual({
      'default_reward:common': 100,
      'default_reward:rare': 200,
      'default_reward:epic': 450,
      'default_reward:mystic': 800,
      fail_reward_points: 20,
      tier_up_probability: 70,
    })
    expect(tierRow('epic')!.reward_points).toBe(450)
    expect(combineRow().fail_reward_points).toBe(20)
    expect(historyRows()).toHaveLength(1)
    expect(historyRows()[0]).toMatchObject({
      section_key: 'collection',
      changes: [
        { field: 'default_reward:epic', from: 400, to: 450 },
        { field: 'fail_reward_points', from: 10, to: 20 },
      ],
      note: '완성 포인트 조정',
      affects_disclosure: false,
      changed_by: ACTOR,
    })
  })

  it('윗등급 확률을 바꾸면 저장되고 퍼센트로 이력에 남으며 확률 안내 반영 표시가 켜진다', async () => {
    const out = await save({ tier_up_probability: 80 }, { note: '윗등급 확률 조정' })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.changes).toEqual([{ field: 'tier_up_probability', from: 70, to: 80 }])
    expect(out.affectsDisclosure).toBe(true)
    expect(out.values.tier_up_probability).toBe(80)
    expect(combineRow().tier_up_probability).toBe(0.8)
    expect(historyRows()).toHaveLength(1)
    expect(historyRows()[0]).toMatchObject({
      section_key: 'collection',
      changes: [{ field: 'tier_up_probability', from: 70, to: 80 }],
      note: '윗등급 확률 조정',
      affects_disclosure: true,
      changed_by: ACTOR,
    })
  })

  it('같은 값을 다시 보내거나 다른 칸만 바꾸면 확률 안내 반영 표시가 켜지지 않는다', async () => {
    const same = await save({ tier_up_probability: 70, fail_reward_points: 20 })
    expect(same.ok).toBe(true)
    if (!same.ok) return
    expect(same.changes).toEqual([{ field: 'fail_reward_points', from: 10, to: 20 }])
    expect(same.affectsDisclosure).toBe(false)
    expect(historyRows()[0]).toMatchObject({ affects_disclosure: false })
  })

  it('윗등급 확률과 다른 칸을 함께 바꾸면 한 줄 이력에 칸 정의 순서로 남고 확률 안내 반영 표시가 켜진다', async () => {
    const out = await save({ tier_up_probability: 100, fail_reward_points: 0, 'default_reward:rare': 250 })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.affectsDisclosure).toBe(true)
    expect(historyRows()).toHaveLength(1)
    expect((historyRows()[0].changes as Array<{ field: string }>).map((change) => change.field)).toEqual([
      'default_reward:rare',
      'fail_reward_points',
      'tier_up_probability',
    ])
    expect(combineRow()).toMatchObject({ fail_reward_points: 0, tier_up_probability: 1 })
  })

  it('윗등급 확률이 범위 밖(음수, 100 초과)이거나 소수 둘째 자리면 저장되지 않고 이유가 붙는다', async () => {
    for (const bad of [-1, 100.1, 33.33]) {
      const out = await save({ tier_up_probability: bad })
      expect(out, String(bad)).toMatchObject({ ok: false, status: 400, error: BALANCE_INVALID_MESSAGE })
      if (out.ok) return
      expect(out.fieldErrors?.tier_up_probability, String(bad)).toBe('0 이상 100 이하로 입력해 주세요. 소수는 첫째 자리까지 쓸 수 있어요.')
    }
    expect(db.updates).toEqual([])
    expect(historyRows()).toEqual([])
  })

  it('네 등급을 함께 바꾸면 이력에 칸 정의 순서로 남는다', async () => {
    const out = await save({
      'default_reward:mystic': 900,
      'default_reward:rare': 250,
      'default_reward:epic': 450,
      'default_reward:common': 120,
    })
    expect(out.ok).toBe(true)
    expect((historyRows()[0].changes as Array<{ field: string }>).map((change) => change.field)).toEqual([
      'default_reward:common',
      'default_reward:rare',
      'default_reward:epic',
      'default_reward:mystic',
    ])
  })

  it('0도 저장된다(지급 생략): 등급 포인트 0, 믹스 실패 포인트 0', async () => {
    const out = await save({ 'default_reward:common': 0, fail_reward_points: 0 })
    expect(out.ok).toBe(true)
    expect(tierRow('common')!.reward_points).toBe(0)
    expect(combineRow().fail_reward_points).toBe(0)
  })

  it('저장 결과의 구역 수정 시각이 다음 읽기와 같아 연이어 저장할 수 있다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-10-22T02:00:00.000Z'))
      const first = await save({ 'default_reward:epic': 450 })
      expect(first.ok).toBe(true)
      if (!first.ok) return
      expect(first.updatedAt).toBe((await COLLECTION_BINDING.read(db.client)).updatedAt)

      vi.setSystemTime(new Date('2026-10-22T02:00:05.000Z'))
      const second = await save({ fail_reward_points: 20 }, { expectedUpdatedAt: first.updatedAt })
      expect(second.ok).toBe(true)
      if (!second.ok) return
      expect(second.updatedAt).toBe((await COLLECTION_BINDING.read(db.client)).updatedAt)
      expect(second.updatedAt).not.toBe(first.updatedAt)

      // 이전 수정 시각으로는 더 저장할 수 없다
      expect(await save({ 'default_reward:rare': 250 }, { expectedUpdatedAt: first.updatedAt })).toMatchObject({ ok: false, status: 409 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('포인트 음수·소수는 저장되지 않고 칸마다 이유가 붙는다', async () => {
    const out = await save({ 'default_reward:common': -1, 'default_reward:rare': 1.5, fail_reward_points: -10 })
    expect(out).toMatchObject({ ok: false, status: 400, error: BALANCE_INVALID_MESSAGE })
    if (out.ok) return
    expect(Object.keys(out.fieldErrors ?? {}).sort()).toEqual(['default_reward:common', 'default_reward:rare', 'fail_reward_points'])
    expect(out.fieldErrors?.fail_reward_points).toBe('0 이상의 정수로 입력해 주세요.')
    expect(db.updates).toEqual([])
    expect(historyRows()).toEqual([])
  })

  it('없는 등급과 다른 구역의 칸은 «알 수 없는 칸»으로 거절한다', async () => {
    const out = await save({ 'default_reward:legend': 10, locked_min_common: 5 })
    expect(out).toMatchObject({ ok: false, status: 400 })
    if (out.ok) return
    expect(out.fieldErrors).toEqual({ 'default_reward:legend': '알 수 없는 칸이에요.', locked_min_common: '알 수 없는 칸이에요.' })
  })

  it('다른 사람이 먼저 바꿨으면(수정 시각 불일치) 409이고 이력이 없다', async () => {
    const out = await save({ 'default_reward:epic': 450 }, { expectedUpdatedAt: '2026-10-21T00:00:00+00:00' })
    expect(out).toMatchObject({ ok: false, status: 409 })
    expect(db.updates).toEqual([])
    expect(historyRows()).toEqual([])
  })

  it('저장 도중 한 행이 막히면 409이고 이미 쓴 행이 원래대로 돌아오며 이력이 없다', async () => {
    db.beforeUpdate = (nth) => {
      if (nth === 2) combineRow().updated_at = '2026-10-22T01:30:00+00:00'
    }
    const out = await save({ 'default_reward:epic': 450, fail_reward_points: 20 })
    expect(out).toMatchObject({ ok: false, status: 409 })
    expect(tierRow('epic')).toMatchObject({ reward_points: 400, updated_at: TIER_REWARD_ROW_STAMP })
    expect(historyRows()).toEqual([])
  })

  it('저장 도중 DB 오류가 나면 500이고 이미 쓴 행이 원래대로 돌아오며 이력이 없다', async () => {
    db.writeErrors.combine_policy = 'secret relation detail'
    const out = await save({ 'default_reward:epic': 450, fail_reward_points: 20 })
    expect(out).toMatchObject({ ok: false, status: 500 })
    if (out.ok) return
    expect(out.error).not.toContain('secret relation detail')
    expect(tierRow('epic')).toMatchObject({ reward_points: 400, updated_at: TIER_REWARD_ROW_STAMP })
    expect(historyRows()).toEqual([])
  })

  it('이력을 쓰지 못하면 두 표의 값과 구역 수정 시각이 원래대로 돌아오고 500이다', async () => {
    db.writeErrors.balance_setting_changes = 'secret relation detail'
    const out = await save({ 'default_reward:epic': 450, 'default_reward:mystic': 900, fail_reward_points: 20 })
    expect(out).toMatchObject({ ok: false, status: 500, error: BALANCE_HISTORY_FAILED_MESSAGE })
    const after = await COLLECTION_BINDING.read(db.client)
    expect(after.updatedAt).toBe(SECTION_STAMP)
    expect(after.values).toMatchObject({ 'default_reward:epic': 400, 'default_reward:mystic': 800, fail_reward_points: 10 })
  })

  it('윗등급 확률을 저장하다 이력이 실패하면 DB의 0~1 값과 수정 시각이 원래대로 돌아온다', async () => {
    db.writeErrors.balance_setting_changes = 'boom'
    expect(await save({ tier_up_probability: 85, fail_reward_points: 20 })).toMatchObject({ ok: false, status: 500 })
    const after = await COLLECTION_BINDING.read(db.client)
    expect(after.values).toMatchObject({ tier_up_probability: 70, fail_reward_points: 10 })
    expect(after.updatedAt).toBe(SECTION_STAMP)
    expect(combineRow()).toMatchObject({ tier_up_probability: 0.7, fail_reward_points: 10 })
  })

  it('등급만 바꾸다 이력이 실패해도 원래대로 돌아온다', async () => {
    db.writeErrors.balance_setting_changes = 'boom'
    expect(await save({ 'default_reward:rare': 250 })).toMatchObject({ ok: false, status: 500 })
    const after = await COLLECTION_BINDING.read(db.client)
    expect(after.values['default_reward:rare']).toBe(200)
    expect(after.updatedAt).toBe(SECTION_STAMP)
  })
})
