/**
 * 서비스 활동 잼 구역 연결 (티켓 20261028_1735 4회) — `service_jam_rules` 7행과 `jam_policy` id=1 행의 `service_jam_daily_cap`·`service_jam_weekly_cap`. 가짜 표로 지키는 것:
 * - 칸 정의: 종류별 잼 7칸(`rule:<kind>:amount`)과 상한 2칸은 모두 0 이상 정수이고 확률 안내에 반영되지 않는다. 종류와 기본값은 마이그레이션 300(CHECK·시드·열 기본값)과 같다.
 *   상한 칸 안내에 «0이면 상한 없음이 아니라 받는 잼이 없다»가 적혀 있다
 * - 읽기: 두 곳을 가공 없이 읽어 한 값 묶음으로 만든다. 종류는 DB가 준 순서와 상관없이 고정 순서이고 구역 수정 시각은 여덟 행 가운데 가장 늦은 것이다. 행이 모자라거나 숫자가 아니면 던진다
 * - 쓰기(행 단위): 종류 순서, 그다음 `jam_policy`. 상한 두 칸은 함께 바꿔도 한 번의 갱신이다. 막히면 이미 쓴 행을 이전 값과 수정 시각으로 되돌린다
 * - 공용 저장을 지나면: 칸 이름으로 이력에 남고, 음수·소수는 거절하며, 0은 저장된다
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

import {
  SERVICE_JAM_ALL_RULES_ZERO_WARNING,
  SERVICE_JAM_BINDING,
  SERVICE_JAM_CAP_ZERO_MEANING,
  SERVICE_JAM_DEFAULT_AMOUNTS,
  SERVICE_JAM_DEFAULT_CAPS,
  SERVICE_JAM_FIELDS,
  SERVICE_JAM_POLICY_SELECT,
  SERVICE_JAM_RULE_KEYS,
  SERVICE_JAM_RULE_KINDS,
  SERVICE_JAM_RULE_SELECT,
  SERVICE_JAM_SECTION_ID,
  parseServiceJamRuleKey,
  serviceJamRuleKey,
} from '../serviceJam'
import { checkFieldValue } from '../fields'
import { BALANCE_HISTORY_FAILED_MESSAGE, BALANCE_INVALID_MESSAGE, saveBalanceSection } from '../save'
import { INTEGER_MAX } from '../types'
import { JAM_ROW_STAMP, SERVICE_JAM_RULE_ROW_STAMP, createFakeDb, jamPolicyRow, serviceJamRuleRows, type FakeDb } from './fakeDb'

const ACTOR = '11111111-1111-4111-8111-111111111111'
const NEXT = '2026-10-29T02:00:00.000Z'
/** 기본 행에서 가장 늦은 수정 시각(규칙 행)이 구역의 수정 시각이다. */
const SECTION_STAMP = SERVICE_JAM_RULE_ROW_STAMP
const byKey = Object.fromEntries(SERVICE_JAM_FIELDS.map((def) => [def.key, def]))

let db: FakeDb

beforeEach(() => {
  db = createFakeDb({
    service_jam_rules: serviceJamRuleRows(),
    jam_policy: [jamPolicyRow()],
    balance_setting_changes: [],
    users: [{ id: ACTOR, username: 'karina' }],
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const ruleRow = (kind: string) => db.tables.service_jam_rules.find((row) => row.kind === kind)
const policyRow = () => db.tables.jam_policy[0]
const historyRows = () => db.tables.balance_setting_changes
const writeInput = (values: Record<string, number>, overrides: { expectedUpdatedAt?: string; nextUpdatedAt?: string } = {}) => ({
  values,
  expectedUpdatedAt: SECTION_STAMP,
  nextUpdatedAt: NEXT,
  ...overrides,
})
const save = (values: unknown, extra: { note?: unknown; expectedUpdatedAt?: unknown } = {}) =>
  saveBalanceSection(db.client, { binding: SERVICE_JAM_BINDING, values, expectedUpdatedAt: SECTION_STAMP, actor: ACTOR, ...extra })

describe('서비스 활동 잼 칸 정의', () => {
  it('구역 키는 servicejam이고 종류 7칸 다음에 하루 상한, 주간 상한이 온다', () => {
    expect(SERVICE_JAM_SECTION_ID).toBe('servicejam')
    expect(SERVICE_JAM_BINDING.id).toBe('servicejam')
    expect(SERVICE_JAM_FIELDS.map((def) => def.key)).toEqual([
      'rule:locked_unlock:amount',
      'rule:badge_earned:amount',
      'rule:combine_success:amount',
      'rule:mission_complete:amount',
      'rule:collection_complete:amount',
      'rule:drop:amount',
      'rule:pickup:amount',
      'service_jam_daily_cap',
      'service_jam_weekly_cap',
    ])
  })

  it('두 묶음(활동 종류별 잼, 받을 수 있는 양의 상한)으로 나뉘고 모두 잼 단위의 0 이상 정수이며 확률 안내에는 반영되지 않는다', () => {
    expect(new Set(SERVICE_JAM_FIELDS.map((def) => def.group))).toEqual(new Set(['활동 종류별 잼', '받을 수 있는 양의 상한']))
    for (const def of SERVICE_JAM_FIELDS) {
      expect(def.unit, def.key).toBe('잼')
      expect(def.decimals, def.key).toBe(0)
      expect(def.min, def.key).toBe(0)
      expect(def.max, def.key).toBe(INTEGER_MAX)
      expect(def.affectsDisclosure, def.key).toBe(false)
    }
  })

  it('상한 두 칸의 안내에 «0이면 상한 없음이 아니라 받는 잼이 없다»가 적혀 있다', () => {
    expect(SERVICE_JAM_CAP_ZERO_MEANING).toContain('«상한 없음»이 아니라')
    expect(byKey.service_jam_daily_cap.hint).toContain(SERVICE_JAM_CAP_ZERO_MEANING)
    expect(byKey.service_jam_weekly_cap.hint).toContain(SERVICE_JAM_CAP_ZERO_MEANING)
  })

  it('종류 7종과 기본값이 마이그레이션 300의 CHECK·시드·열 기본값과 같다', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/300_capsule_auto_fill_expand.sql'), 'utf8')
    const checkBlock = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS public.service_jam_rules'), sql.indexOf('amount INTEGER NOT NULL'))
    const kinds = [...checkBlock.matchAll(/'(\w+)'/g)].map((match) => match[1])
    expect(kinds).toEqual([...SERVICE_JAM_RULE_KINDS])

    const seedBlock = sql.slice(sql.indexOf('INSERT INTO public.service_jam_rules'), sql.indexOf('ON CONFLICT (kind) DO NOTHING'))
    const seed = Object.fromEntries([...seedBlock.matchAll(/\('(\w+)',\s*(\d+)\)/g)].map((match) => [match[1], Number(match[2])]))
    expect(seed).toEqual({
      locked_unlock: 5,
      badge_earned: 5,
      combine_success: 5,
      mission_complete: 20,
      collection_complete: 30,
      drop: 0,
      pickup: 0,
    })
    expect(SERVICE_JAM_DEFAULT_AMOUNTS).toEqual(seed)
    for (const [kind, amount] of Object.entries(seed)) expect(byKey[`rule:${kind}:amount`].defaultValue, kind).toBe(amount)

    expect(sql).toMatch(/service_jam_daily_cap INTEGER NOT NULL DEFAULT 40/)
    expect(sql).toMatch(/service_jam_weekly_cap INTEGER NOT NULL DEFAULT 100/)
    expect(SERVICE_JAM_DEFAULT_CAPS).toEqual({ service_jam_daily_cap: 40, service_jam_weekly_cap: 100 })
    expect(byKey.service_jam_daily_cap.defaultValue).toBe(40)
    expect(byKey.service_jam_weekly_cap.defaultValue).toBe(100)
  })

  it('칸 이름은 rule:종류:amount 형식이고 모르는 종류나 다른 형식은 null이다', () => {
    expect(serviceJamRuleKey('badge_earned')).toBe('rule:badge_earned:amount')
    expect(parseServiceJamRuleKey('rule:badge_earned:amount')).toBe('badge_earned')
    expect(parseServiceJamRuleKey('rule:capsule_full:amount')).toBeNull()
    expect(parseServiceJamRuleKey('rule:badge_earned:points')).toBeNull()
    expect(parseServiceJamRuleKey('service_jam_daily_cap')).toBeNull()
    expect(SERVICE_JAM_RULE_KEYS).toHaveLength(7)
  })

  it('0은 통과하고 음수·소수는 거절한다. 연결 검사도 같은 기준이다', () => {
    for (const def of SERVICE_JAM_FIELDS) {
      expect(checkFieldValue(def, 0), def.key).toBeNull()
      expect(checkFieldValue(def, -1), def.key).not.toBeNull()
      expect(checkFieldValue(def, 1.5), def.key).not.toBeNull()
      const validate = SERVICE_JAM_BINDING.validators?.[def.key]
      expect(validate?.(0), def.key).toBe(true)
      expect(validate?.(7), def.key).toBe(true)
      expect(validate?.(-1), def.key).toBe(false)
      expect(validate?.(1.5), def.key).toBe(false)
    }
  })

  it('경고는 하루 상한 0, 주간 상한 0, 종류별 잼이 모두 0일 때를 가린다', () => {
    const warnings = SERVICE_JAM_BINDING.zeroWarnings ?? []
    expect(warnings.map((warning) => warning.keys)).toEqual([['service_jam_daily_cap'], ['service_jam_weekly_cap'], [...SERVICE_JAM_RULE_KEYS]])
    expect(warnings[2].message).toBe(SERVICE_JAM_ALL_RULES_ZERO_WARNING)
  })
})

describe('SERVICE_JAM_BINDING.read', () => {
  it('규칙 7행과 상한 2칸을 한 값 묶음으로 읽는다. 종류는 고정 순서이고 수정 시각은 가장 늦은 행의 것이다', async () => {
    const snapshot = await SERVICE_JAM_BINDING.read(db.client)
    expect(snapshot).toEqual({
      values: {
        'rule:locked_unlock:amount': 5,
        'rule:badge_earned:amount': 5,
        'rule:combine_success:amount': 5,
        'rule:mission_complete:amount': 20,
        'rule:collection_complete:amount': 30,
        'rule:drop:amount': 0,
        'rule:pickup:amount': 0,
        service_jam_daily_cap: 40,
        service_jam_weekly_cap: 100,
      },
      updatedAt: SECTION_STAMP,
    })
    expect(Object.keys(snapshot.values)).toEqual(SERVICE_JAM_FIELDS.map((def) => def.key))
    expect(db.selects).toEqual([SERVICE_JAM_RULE_SELECT, SERVICE_JAM_POLICY_SELECT])
    expect(db.orders).toContain('service_jam_rules.order:kind')
  })

  it('정책 행의 수정 시각이 더 늦으면 그 값이 구역 수정 시각이다', async () => {
    policyRow().updated_at = '2026-10-30T00:00:00+00:00'
    expect((await SERVICE_JAM_BINDING.read(db.client)).updatedAt).toBe('2026-10-30T00:00:00+00:00')
  })

  it('저장된 값이 비정상이어도 기본값으로 바꿔 보이지 않고 그대로 읽는다', async () => {
    ruleRow('drop')!.amount = 9
    policyRow().service_jam_daily_cap = 0
    const snapshot = await SERVICE_JAM_BINDING.read(db.client)
    expect(snapshot.values['rule:drop:amount']).toBe(9)
    expect(snapshot.values.service_jam_daily_cap).toBe(0)
  })

  it('모르는 종류의 행은 읽지 않고 그 수정 시각도 구역 수정 시각에 넣지 않는다', async () => {
    db.tables.service_jam_rules.push({ kind: 'future_kind', amount: 1, updated_at: '2026-11-01T00:00:00+00:00' })
    const snapshot = await SERVICE_JAM_BINDING.read(db.client)
    expect(snapshot.updatedAt).toBe(SECTION_STAMP)
    expect(Object.keys(snapshot.values)).toEqual(SERVICE_JAM_FIELDS.map((def) => def.key))
  })

  it('종류 행이 모자라거나 정책 행이 없거나 숫자가 아닌 칸이 있거나 조회가 실패하면 던진다', async () => {
    db.tables.service_jam_rules = serviceJamRuleRows().filter((row) => row.kind !== 'pickup')
    await expect(SERVICE_JAM_BINDING.read(db.client)).rejects.toThrow('pickup 행이 없음')

    db.tables.service_jam_rules = serviceJamRuleRows()
    db.tables.jam_policy = []
    await expect(SERVICE_JAM_BINDING.read(db.client)).rejects.toThrow('id=1 행이 없음')

    db.tables.jam_policy = [jamPolicyRow({ service_jam_weekly_cap: null })]
    await expect(SERVICE_JAM_BINDING.read(db.client)).rejects.toThrow('service_jam_weekly_cap 값을 숫자로 읽을 수 없음')

    db.tables.jam_policy = [jamPolicyRow()]
    ruleRow('drop')!.amount = null
    await expect(SERVICE_JAM_BINDING.read(db.client)).rejects.toThrow('drop 값을 숫자로 읽을 수 없음')

    ruleRow('drop')!.amount = 0
    db.readErrors.service_jam_rules = 'boom'
    await expect(SERVICE_JAM_BINDING.read(db.client)).rejects.toThrow('서비스 활동 잼 규칙 조회 실패: boom')

    db.readErrors.service_jam_rules = undefined
    db.readErrors.jam_policy = 'boom'
    await expect(SERVICE_JAM_BINDING.read(db.client)).rejects.toThrow('서비스 활동 잼 상한 조회 실패: boom')
  })
})

describe('SERVICE_JAM_BINDING.write — 행 단위 갱신', () => {
  it('종류 칸만 바꾸면 그 종류 행 하나만 갱신한다(정책 행은 건드리지 않는다)', async () => {
    const res = await SERVICE_JAM_BINDING.write(db.client, writeInput({ 'rule:pickup:amount': 3 }))
    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.updates).toEqual([{ amount: 3, updated_at: NEXT }])
    expect(ruleRow('pickup')).toMatchObject({ amount: 3, updated_at: NEXT })
    expect(ruleRow('drop')).toMatchObject({ amount: 0, updated_at: SECTION_STAMP })
    expect(policyRow()).toMatchObject({ service_jam_daily_cap: 40, updated_at: JAM_ROW_STAMP })
    expect((await SERVICE_JAM_BINDING.read(db.client)).updatedAt).toBe(NEXT)
  })

  it('상한만 바꾸면 정책 행만 갱신하고, 두 상한을 함께 바꿔도 한 번만 갱신한다', async () => {
    const res = await SERVICE_JAM_BINDING.write(db.client, writeInput({ service_jam_daily_cap: 0, service_jam_weekly_cap: 200 }))
    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.updates).toEqual([{ service_jam_daily_cap: 0, service_jam_weekly_cap: 200, updated_at: NEXT }])
    expect(policyRow()).toMatchObject({ service_jam_daily_cap: 0, service_jam_weekly_cap: 200, updated_at: NEXT })
    expect(ruleRow('badge_earned')).toMatchObject({ amount: 5, updated_at: SECTION_STAMP })
    // 규칙 행의 수정 시각(2026-10-29T01:00)이 새 시각(02:00)보다 이르므로 구역 수정 시각은 새 시각이다
    expect((await SERVICE_JAM_BINDING.read(db.client)).updatedAt).toBe(NEXT)
  })

  it('쓰지 않은 행의 수정 시각이 더 늦으면 돌려주는 구역 수정 시각은 그 값이다(다음 읽기와 같다)', async () => {
    const later = '2026-10-30T05:00:00+00:00'
    ruleRow('mission_complete')!.updated_at = later
    const res = await SERVICE_JAM_BINDING.write(db.client, writeInput({ service_jam_daily_cap: 50 }, { expectedUpdatedAt: later }))
    expect(res).toEqual({ ok: true, updatedAt: later })
    expect((await SERVICE_JAM_BINDING.read(db.client)).updatedAt).toBe(later)
  })

  it('종류 여러 행과 상한을 함께 바꾸면 종류 순서가 먼저이고 정책 행이 마지막이다', async () => {
    const res = await SERVICE_JAM_BINDING.write(
      db.client,
      writeInput({ service_jam_weekly_cap: 150, 'rule:pickup:amount': 2, 'rule:badge_earned:amount': 6, 'rule:mission_complete:amount': 25 })
    )
    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.updates).toEqual([
      { amount: 6, updated_at: NEXT },
      { amount: 25, updated_at: NEXT },
      { amount: 2, updated_at: NEXT },
      { service_jam_weekly_cap: 150, updated_at: NEXT },
    ])
  })

  it('화면이 본 수정 시각이 가장 늦은 수정 시각과 다르면 아무것도 쓰지 않고 conflict다', async () => {
    const res = await SERVICE_JAM_BINDING.write(db.client, writeInput({ 'rule:drop:amount': 1 }, { expectedUpdatedAt: '2026-10-01T00:00:00+00:00' }))
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect(db.updates).toEqual([])
  })

  it('쓰는 도중 다른 곳이 정책 행을 먼저 바꾸면 conflict이고 이미 쓴 종류 행을 이전 값과 이전 수정 시각으로 되돌린다', async () => {
    db.beforeUpdate = (nth) => {
      if (nth === 3) policyRow().updated_at = '2026-10-29T01:30:00+00:00'
    }
    const res = await SERVICE_JAM_BINDING.write(
      db.client,
      writeInput({ 'rule:badge_earned:amount': 6, 'rule:mission_complete:amount': 25, service_jam_daily_cap: 10 })
    )
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect(ruleRow('badge_earned')).toMatchObject({ amount: 5, updated_at: SECTION_STAMP })
    expect(ruleRow('mission_complete')).toMatchObject({ amount: 20, updated_at: SECTION_STAMP })
    expect(policyRow()).toMatchObject({ service_jam_daily_cap: 40, updated_at: '2026-10-29T01:30:00+00:00' })
  })

  it('쓰는 도중 DB 오류가 나면 error이고 이미 쓴 행을 되돌린다', async () => {
    db.failUpdateFrom.jam_policy = 3
    const res = await SERVICE_JAM_BINDING.write(db.client, writeInput({ 'rule:drop:amount': 1, 'rule:pickup:amount': 1, service_jam_daily_cap: 10 }))
    expect(res).toMatchObject({ ok: false, reason: 'error' })
    expect(ruleRow('drop')).toMatchObject({ amount: 0, updated_at: SECTION_STAMP })
    expect(ruleRow('pickup')).toMatchObject({ amount: 0, updated_at: SECTION_STAMP })
    expect(policyRow()).toMatchObject({ service_jam_daily_cap: 40, updated_at: JAM_ROW_STAMP })
  })

  it('읽기가 실패하면 error이고, 이 구역의 칸이 아닌 값은 쓰지 않으며, 쓸 칸이 없으면 error다', async () => {
    db.readErrors.service_jam_rules = 'boom'
    expect(await SERVICE_JAM_BINDING.write(db.client, writeInput({ 'rule:drop:amount': 1 }))).toMatchObject({ ok: false, reason: 'error' })

    db.readErrors.service_jam_rules = undefined
    expect(await SERVICE_JAM_BINDING.write(db.client, writeInput({ intensity_light: 9, 'rule:capsule_full:amount': 5 }))).toEqual({
      ok: false,
      reason: 'error',
      message: '바꿀 칸이 없음',
    })
    expect(db.updates).toEqual([])
    expect(policyRow()).toMatchObject({ intensity_light: 1 })
  })
})

describe('서비스 활동 잼 구역 저장 (공용 저장을 지난다)', () => {
  it('종류별 잼과 상한을 바꾸면 저장되고 칸 이름으로 한 줄 이력에 남으며 확률 안내 반영 표시는 없다', async () => {
    const out = await save({ 'rule:pickup:amount': 3, service_jam_daily_cap: 50, 'rule:drop:amount': 0 }, { note: '픽업 잼 시험' })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.changes).toEqual([
      { field: 'rule:pickup:amount', from: 0, to: 3 },
      { field: 'service_jam_daily_cap', from: 40, to: 50 },
    ])
    expect(out.affectsDisclosure).toBe(false)
    expect(ruleRow('pickup')!.amount).toBe(3)
    expect(policyRow().service_jam_daily_cap).toBe(50)
    expect(historyRows()).toHaveLength(1)
    expect(historyRows()[0]).toMatchObject({ section_key: 'servicejam', note: '픽업 잼 시험', affects_disclosure: false, changed_by: ACTOR })
  })

  it('0도 저장된다: 상한 0(받는 잼 없음), 종류별 잼 0', async () => {
    const out = await save({ service_jam_weekly_cap: 0, 'rule:mission_complete:amount': 0 })
    expect(out.ok).toBe(true)
    expect(policyRow().service_jam_weekly_cap).toBe(0)
    expect(ruleRow('mission_complete')!.amount).toBe(0)
  })

  it('음수·소수와 모르는 칸은 저장되지 않고 칸마다 이유가 붙는다', async () => {
    const out = await save({ 'rule:pickup:amount': -1, service_jam_daily_cap: 1.5, 'rule:capsule_full:amount': 5 })
    expect(out).toMatchObject({ ok: false, status: 400, error: BALANCE_INVALID_MESSAGE })
    if (out.ok) return
    expect(Object.keys(out.fieldErrors ?? {}).sort()).toEqual(['rule:capsule_full:amount', 'rule:pickup:amount', 'service_jam_daily_cap'].sort())
    expect(db.updates).toEqual([])
    expect(historyRows()).toEqual([])
  })

  it('다른 사람이 먼저 바꿨으면(수정 시각 불일치) 409이고 이력이 없다', async () => {
    const out = await save({ 'rule:pickup:amount': 3 }, { expectedUpdatedAt: '2026-10-01T00:00:00+00:00' })
    expect(out).toMatchObject({ ok: false, status: 409 })
    expect(historyRows()).toEqual([])
  })

  it('이력을 쓰지 못하면 두 곳의 값과 수정 시각이 원래대로 돌아온다', async () => {
    db.writeErrors.balance_setting_changes = 'boom'
    const out = await save({ 'rule:pickup:amount': 3, service_jam_daily_cap: 50 })
    expect(out).toMatchObject({ ok: false, status: 500, error: BALANCE_HISTORY_FAILED_MESSAGE })
    // 되돌리기는 값을 이전 값으로, 수정 시각을 화면이 읽은 구역 수정 시각으로 돌려놓는다(공용 저장의 방식)
    expect(ruleRow('pickup')).toMatchObject({ amount: 0, updated_at: SECTION_STAMP })
    expect(policyRow()).toMatchObject({ service_jam_daily_cap: 40, updated_at: SECTION_STAMP })
    expect((await SERVICE_JAM_BINDING.read(db.client)).updatedAt).toBe(SECTION_STAMP)
  })
})
