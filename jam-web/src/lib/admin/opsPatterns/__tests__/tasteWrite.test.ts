/**
 * 취향 신호 확정·공통 규칙 고치기·근거 후보 읽기 (티켓 20261008_1712, 상위 20260930_1503 ⑩b-1) — `tasteWrite.ts`·`input.ts`
 *
 * 서비스 클라이언트는 메모리 DB(`fakePatternDb.ts`)로 바꾼다. 확인하는 것:
 * - 취향 신호: 처음 확정이면 확정 시각·확정한 사람을 남기고 다시 고쳐도 처음 값이 유지된다, 이유 필수·500자, 추정으로 되돌리는 입력은 400,
 *   값이 같으면 `changed: false`, 없는 신호 404·UUID 아님 404, 그사이 바뀌면 409(DB 그대로), `expectedUpdatedAt` 없음 400
 * - 근거: 같은 패턴의 시험 아닌 반려 기록만 붙는다(다른 패턴·승인 등 다른 행동·시험·없는 결정은 각각 400), 근거 비우기, 공통 신호는 근거 없이만
 * - 공통 규칙: 제목 60자·본문 2,000자, 양의 정수 아닌 번호·없는 번호 404, 409, `changed: false`, 갱신자 기록, 응답에 관리자 ID 없음
 * - 근거 후보: 시험·다른 패턴·다른 행동 제외, 92일보다 오래된 반려 포함, 최신순, 10건씩과 `hasMore`·`total`, `actor` 원문 없음, 오류는 던진다
 * - 시드(212)의 취향 신호 이유와 공통 규칙이 상한 안에 든다
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { createServiceClient } from '@/lib/supabase/server'
import { OPS_TASTE_LIMITS } from '../constants'
import { parseCommonRuleNo, parseRejectionOffset, validateCommonRuleInput, validateTasteSignalInput } from '../input'
import {
  COMMON_RULE_NOT_FOUND_MESSAGE,
  COMMON_RULE_UPDATE_CONFLICT_MESSAGE,
  TASTE_NOT_FOUND_MESSAGE,
  TASTE_UPDATE_CONFLICT_MESSAGE,
  listPatternRejections,
  saveOpsCommonRule,
  saveOpsTasteSignal,
} from '../tasteWrite'
import { bundleItemRow, bundleRow, commonRuleRow, decisionRow, fakeDb, fakeService, tasteSignalRow } from './fakePatternDb'

type ServiceClient = ReturnType<typeof createServiceClient>
const service = fakeService as unknown as ServiceClient

const ACTOR = 'admin-7'
const T1 = '2026-10-01T01:00:00+00:00'
const NOW = '2026-10-08T03:00:00.000Z'

/** 형식이 맞는 UUID. */
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const SIG = uid(1)
const SIG_COMMON = uid(2)
const D_OK = uid(101)
const D_OTHER_PATTERN = uid(102)
const D_SAMPLE = uid(103)
const D_APPROVE = uid(104)
const D_NO_ITEM = uid(105)

function seedDecisions() {
  fakeDb.tables.ops_bundles = [bundleRow('b1'), bundleRow('b-sample', { is_sample: true })]
  fakeDb.tables.ops_bundle_items = [
    bundleItemRow('i10', 'P10'),
    bundleItemRow('i11', 'P11'),
    bundleItemRow('i10-sample', 'P10'),
  ]
  fakeDb.tables.ops_decisions = [
    decisionRow(D_OK, 'b1', 'i10'),
    decisionRow(D_OTHER_PATTERN, 'b1', 'i11'),
    decisionRow(D_SAMPLE, 'b-sample', 'i10-sample'),
    decisionRow(D_APPROVE, 'b1', 'i10', { action: 'approve' }),
    decisionRow(D_NO_ITEM, 'b1', null),
  ]
}

beforeEach(() => {
  fakeDb.reset()
  fakeDb.tables.ops_pattern_taste_signals = [tasteSignalRow(SIG, 'P10'), tasteSignalRow(SIG_COMMON, null)]
  fakeDb.tables.ops_pattern_common_rules = [commonRuleRow(1), commonRuleRow(2)]
  seedDecisions()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(NOW))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function signalRowOf(id: string) {
  const row = fakeDb.tables.ops_pattern_taste_signals.find((r) => r.id === id)
  if (!row) throw new Error('행이 없다')
  return row
}

/** `expected`를 안 넘기면 처음 수정 시각(T1)이고, `undefined`를 명시하면 그대로 보낸다(시각 없음). */
const save = (id: string, body: Record<string, unknown>, ...expected: [unknown?]) =>
  saveOpsTasteSignal(service, id, body, { actor: ACTOR, expectedUpdatedAt: expected.length ? expected[0] : T1 })

describe('validateTasteSignalInput', () => {
  it('이유는 필수이고 앞뒤 공백을 뗀 1~500자다', () => {
    const ok = validateTasteSignalInput({ reason: '  이유  ' })
    expect(ok).toEqual({ ok: true, value: { reason: '이유', evidenceDecisionId: null } })
    for (const reason of ['', '   ', undefined, 3, null]) {
      const checked = validateTasteSignalInput({ reason })
      expect(checked.ok).toBe(false)
      if (!checked.ok) expect(checked.fieldErrors.reason).toBe('이유를 적어 주세요.')
    }
    expect(validateTasteSignalInput({ reason: '가'.repeat(OPS_TASTE_LIMITS.reasonMax) }).ok).toBe(true)
    const tooLong = validateTasteSignalInput({ reason: '가'.repeat(OPS_TASTE_LIMITS.reasonMax + 1) })
    expect(tooLong.ok).toBe(false)
    if (!tooLong.ok) expect(tooLong.fieldErrors.reason).toContain('500자까지')
  })

  it('근거는 없음·null(근거 없이)이거나 UUID여야 한다', () => {
    expect(validateTasteSignalInput({ reason: '이유', evidenceDecisionId: null })).toMatchObject({ ok: true, value: { evidenceDecisionId: null } })
    expect(validateTasteSignalInput({ reason: '이유', evidenceDecisionId: D_OK })).toMatchObject({ ok: true, value: { evidenceDecisionId: D_OK } })
    for (const evidenceDecisionId of ['abc', '', 5, {}]) {
      expect(validateTasteSignalInput({ reason: '이유', evidenceDecisionId }).ok).toBe(false)
    }
  })

  it('추정으로 되돌리는 입력(basis)은 거절하고, 확정 값은 받아도 결과에 싣지 않는다', () => {
    const revert = validateTasteSignalInput({ reason: '이유', basis: 'estimate' })
    expect(revert.ok).toBe(false)
    if (!revert.ok) expect(revert.fieldErrors.basis).toContain('추정으로 되돌릴 수 없어요')
    const ok = validateTasteSignalInput({ reason: '이유', basis: 'confirmed' })
    expect(ok).toEqual({ ok: true, value: { reason: '이유', evidenceDecisionId: null } })
  })

  it('객체가 아니면 거절한다', () => {
    expect(validateTasteSignalInput(null).ok).toBe(false)
    expect(validateTasteSignalInput([]).ok).toBe(false)
  })
})

describe('saveOpsTasteSignal — 확정', () => {
  it('추정 신호를 처음 확정하면 확정 시각·확정한 사람을 남기고 이유를 고친다. 응답에 관리자 ID가 없다', async () => {
    const outcome = await save(SIG, { reason: '  고친 이유  ' })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.changed).toBe(true)
    expect(outcome.signal).toMatchObject({ id: SIG, reason: '고친 이유', basis: 'confirmed', confirmedAt: NOW, evidenceDecisionId: null, updatedAt: NOW })
    expect(signalRowOf(SIG)).toMatchObject({ basis: 'confirmed', confirmed_at: NOW, confirmed_by: ACTOR, updated_at: NOW })
    expect(JSON.stringify(outcome)).not.toContain(ACTOR)
  })

  it('이미 확정한 신호를 다시 고쳐도 확정 시각·확정한 사람은 처음 값 그대로다', async () => {
    const first = await save(SIG, { reason: '첫 이유' })
    expect(first.ok).toBe(true)
    vi.setSystemTime(new Date('2026-10-09T03:00:00.000Z'))
    const second = await save(SIG, { reason: '둘째 이유', evidenceDecisionId: D_OK }, NOW)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.signal).toMatchObject({ reason: '둘째 이유', confirmedAt: NOW, evidenceDecisionId: D_OK, updatedAt: '2026-10-09T03:00:00.000Z' })
    expect(signalRowOf(SIG)).toMatchObject({ confirmed_at: NOW, confirmed_by: ACTOR })
  })

  it('다른 관리자가 다시 고쳐도 확정한 사람은 바뀌지 않는다', async () => {
    await save(SIG, { reason: '첫 이유' })
    await saveOpsTasteSignal(service, SIG, { reason: '둘째 이유' }, { actor: 'admin-9', expectedUpdatedAt: NOW })
    expect(signalRowOf(SIG).confirmed_by).toBe(ACTOR)
  })

  it('이유·근거가 같고 이미 확정이면 쓰지 않고 changed:false다. 추정 상태의 같은 이유는 확정으로 바뀐다', async () => {
    const same = await save(SIG, { reason: '추정 이유' })
    expect(same.ok && same.changed).toBe(true)
    expect(signalRowOf(SIG).basis).toBe('confirmed')

    fakeDb.writeCalls = 0
    const again = await save(SIG, { reason: '추정 이유' }, NOW)
    expect(again).toMatchObject({ ok: true, changed: false })
    expect(fakeDb.writeCalls).toBe(0)
  })

  it('이유가 비었거나 500자를 넘으면 400이고 DB를 건드리지 않는다', async () => {
    for (const reason of ['  ', '가'.repeat(501)]) {
      const outcome = await save(SIG, { reason })
      expect(outcome).toMatchObject({ ok: false, status: 400 })
      if (!outcome.ok) expect(outcome.fieldErrors?.reason).toEqual(expect.any(String))
    }
    expect(fakeDb.writeCalls).toBe(0)
    expect(signalRowOf(SIG).basis).toBe('estimate')
  })

  it('추정으로 되돌리는 입력은 400이고 확정은 그대로다', async () => {
    await save(SIG, { reason: '이유' })
    const outcome = await save(SIG, { reason: '이유', basis: 'estimate' }, NOW)
    expect(outcome).toMatchObject({ ok: false, status: 400 })
    expect(signalRowOf(SIG).basis).toBe('confirmed')
  })

  it('expectedUpdatedAt이 없거나 시각이 아니면 400이다', async () => {
    for (const expected of [undefined, '', '어제', 3]) {
      expect(await save(SIG, { reason: '이유' }, expected)).toMatchObject({ ok: false, status: 400 })
    }
    expect(fakeDb.writeCalls).toBe(0)
  })

  it('UUID가 아니거나 없는 신호는 404다', async () => {
    expect(await save('not-a-uuid', { reason: '이유' })).toMatchObject({ ok: false, status: 404, error: TASTE_NOT_FOUND_MESSAGE })
    expect(await save(uid(999), { reason: '이유' })).toMatchObject({ ok: false, status: 404 })
    expect(fakeDb.writeCalls).toBe(0)
  })

  it('화면이 본 시각과 다르면 409이고 DB는 그대로다', async () => {
    const outcome = await save(SIG, { reason: '이유' }, '2026-09-30T00:00:00+00:00')
    expect(outcome).toMatchObject({ ok: false, status: 409, error: TASTE_UPDATE_CONFLICT_MESSAGE })
    expect(fakeDb.writeCalls).toBe(0)
    expect(signalRowOf(SIG)).toMatchObject({ basis: 'estimate', reason: '추정 이유' })
  })

  it('읽은 뒤 쓰기 전에 다른 곳이 먼저 고치면 409다(0행 → 다시 읽어 구분)', async () => {
    fakeDb.beforeWrite = () => {
      signalRowOf(SIG).updated_at = '2026-10-02T00:00:00+00:00'
    }
    const outcome = await save(SIG, { reason: '이유' })
    expect(outcome).toMatchObject({ ok: false, status: 409, error: TASTE_UPDATE_CONFLICT_MESSAGE })
    expect(signalRowOf(SIG).basis).toBe('estimate')
  })

  it('읽은 뒤 쓰기 전에 행이 사라지면 404다', async () => {
    fakeDb.beforeWrite = () => {
      fakeDb.tables.ops_pattern_taste_signals = []
    }
    expect(await save(SIG, { reason: '이유' })).toMatchObject({ ok: false, status: 404 })
  })

  it('조회·쓰기 오류는 500이고 고정 문장이다', async () => {
    fakeDb.readError = 'boom secret'
    const readFail = await save(SIG, { reason: '이유' })
    expect(readFail).toMatchObject({ ok: false, status: 500 })
    fakeDb.readError = null
    fakeDb.writeError = { message: 'boom secret' }
    const writeFail = await save(SIG, { reason: '이유' })
    expect(writeFail).toMatchObject({ ok: false, status: 500 })
    if (!writeFail.ok) expect(writeFail.error).not.toContain('secret')
  })
})

describe('saveOpsTasteSignal — 근거', () => {
  it('같은 패턴의 시험 아닌 반려 기록이면 근거로 붙는다', async () => {
    const outcome = await save(SIG, { reason: '이유', evidenceDecisionId: D_OK })
    expect(outcome.ok && outcome.signal.evidenceDecisionId).toBe(D_OK)
    expect(signalRowOf(SIG).evidence_decision_id).toBe(D_OK)
  })

  it('다른 패턴 항목의 반려 기록은 400이다', async () => {
    const outcome = await save(SIG, { reason: '이유', evidenceDecisionId: D_OTHER_PATTERN })
    expect(outcome).toMatchObject({ ok: false, status: 400, fieldErrors: { evidenceDecisionId: '이 패턴의 반려 기록만 근거로 붙일 수 있어요.' } })
    expect(fakeDb.writeCalls).toBe(0)
  })

  it('반려가 아닌 기록(승인 등)은 400이다', async () => {
    expect(await save(SIG, { reason: '이유', evidenceDecisionId: D_APPROVE })).toMatchObject({ ok: false, status: 400 })
  })

  it('시험 묶음의 반려 기록은 400이다', async () => {
    expect(await save(SIG, { reason: '이유', evidenceDecisionId: D_SAMPLE })).toMatchObject({ ok: false, status: 400 })
  })

  it('항목이 없는 결정(묶음 단위)과 없는 결정은 400이다', async () => {
    expect(await save(SIG, { reason: '이유', evidenceDecisionId: D_NO_ITEM })).toMatchObject({ ok: false, status: 400 })
    expect(await save(SIG, { reason: '이유', evidenceDecisionId: uid(404) })).toMatchObject({ ok: false, status: 400 })
    expect(fakeDb.writeCalls).toBe(0)
  })

  it('공통 취향 신호는 근거를 붙일 수 없고, 근거 없이는 확정된다', async () => {
    const withEvidence = await save(SIG_COMMON, { reason: '이유', evidenceDecisionId: D_OK })
    expect(withEvidence).toMatchObject({ ok: false, status: 400, fieldErrors: { evidenceDecisionId: expect.any(String) } })
    const without = await save(SIG_COMMON, { reason: '이유' })
    expect(without).toMatchObject({ ok: true, signal: { basis: 'confirmed', patternNo: null, evidenceDecisionId: null } })
  })

  it('근거를 null로 보내면 비운다(근거 없이 확정)', async () => {
    await save(SIG, { reason: '이유', evidenceDecisionId: D_OK })
    const cleared = await save(SIG, { reason: '이유', evidenceDecisionId: null }, NOW)
    expect(cleared).toMatchObject({ ok: true, changed: true, signal: { evidenceDecisionId: null } })
    expect(signalRowOf(SIG).evidence_decision_id).toBeNull()
  })

  it('근거 결정 기록을 읽지 못하면 500이다', async () => {
    fakeDb.readErrorTable = 'ops_decisions'
    const outcome = await save(SIG, { reason: '이유', evidenceDecisionId: D_OK })
    expect(outcome).toMatchObject({ ok: false, status: 500 })
    expect(fakeDb.writeCalls).toBe(0)
  })
})

describe('validateCommonRuleInput / parseCommonRuleNo', () => {
  it('제목 60자·본문 2,000자(앞뒤 공백을 뗀 뒤), 둘 다 필수다', () => {
    expect(validateCommonRuleInput({ title: ' 제목 ', body: ' 본문 ' })).toEqual({ ok: true, value: { title: '제목', body: '본문' } })
    expect(validateCommonRuleInput({ title: '가'.repeat(60), body: '가'.repeat(2000) }).ok).toBe(true)
    const checked = validateCommonRuleInput({ title: '가'.repeat(61), body: '가'.repeat(2001) })
    expect(checked.ok).toBe(false)
    if (!checked.ok) expect(Object.keys(checked.fieldErrors).sort()).toEqual(['body', 'title'])
    const empty = validateCommonRuleInput({ title: ' ', body: '' })
    expect(empty.ok).toBe(false)
    if (!empty.ok) expect(empty.fieldErrors).toEqual({ title: '제목을 적어 주세요.', body: '본문을 적어 주세요.' })
  })

  it('번호는 양의 정수 글자만 읽는다', () => {
    expect(parseCommonRuleNo('3')).toBe(3)
    for (const raw of ['0', '-1', '1.5', 'abc', '', '01', '99999999999']) expect(parseCommonRuleNo(raw)).toBeNull()
  })
})

describe('saveOpsCommonRule', () => {
  const saveRule = (ruleNo: number, body: Record<string, unknown>, ...expected: [unknown?]) =>
    saveOpsCommonRule(service, ruleNo, body, { actor: ACTOR, expectedUpdatedAt: expected.length ? expected[0] : T1 })

  it('제목·본문을 고치고 수정 시각·갱신자를 남긴다. 응답에 관리자 ID가 없다', async () => {
    const outcome = await saveRule(2, { title: ' 새 제목 ', body: '새 본문' })
    expect(outcome).toMatchObject({ ok: true, changed: true, rule: { ruleNo: 2, title: '새 제목', body: '새 본문', updatedAt: NOW } })
    expect(fakeDb.tables.ops_pattern_common_rules.find((r) => r.rule_no === 2)).toMatchObject({ updated_by: ACTOR, updated_at: NOW })
    expect(fakeDb.tables.ops_pattern_common_rules.find((r) => r.rule_no === 1)).toMatchObject({ title: '규칙 1', updated_by: null })
    expect(JSON.stringify(outcome)).not.toContain(ACTOR)
  })

  it('값이 같으면 쓰지 않고 changed:false다', async () => {
    const outcome = await saveRule(1, { title: '규칙 1', body: '규칙 1 본문' })
    expect(outcome).toMatchObject({ ok: true, changed: false, rule: { updatedAt: T1 } })
    expect(fakeDb.writeCalls).toBe(0)
  })

  it('길이를 넘기면 400이다', async () => {
    expect(await saveRule(1, { title: '가'.repeat(61), body: '본문' })).toMatchObject({ ok: false, status: 400, fieldErrors: { title: expect.any(String) } })
    expect(await saveRule(1, { title: '제목', body: '가'.repeat(2001) })).toMatchObject({ ok: false, status: 400, fieldErrors: { body: expect.any(String) } })
    expect(fakeDb.writeCalls).toBe(0)
  })

  it('양의 정수가 아니거나 없는 번호는 404다. 추가 경로는 없다', async () => {
    for (const ruleNo of [0, -1, 1.5, 8]) {
      expect(await saveRule(ruleNo, { title: '제목', body: '본문' })).toMatchObject({ ok: false, status: 404, error: COMMON_RULE_NOT_FOUND_MESSAGE })
    }
    expect(fakeDb.tables.ops_pattern_common_rules).toHaveLength(2)
    expect(fakeDb.writeCalls).toBe(0)
  })

  it('expectedUpdatedAt이 없으면 400, 다르면 409(DB 그대로)다', async () => {
    expect(await saveRule(1, { title: '제목', body: '본문' }, undefined)).toMatchObject({ ok: false, status: 400 })
    expect(await saveRule(1, { title: '제목', body: '본문' }, '2026-09-30T00:00:00+00:00')).toMatchObject({
      ok: false,
      status: 409,
      error: COMMON_RULE_UPDATE_CONFLICT_MESSAGE,
    })
    expect(fakeDb.writeCalls).toBe(0)
  })

  it('읽은 뒤 쓰기 전에 다른 곳이 먼저 고치면 409다', async () => {
    fakeDb.beforeWrite = () => {
      fakeDb.tables.ops_pattern_common_rules[0].updated_at = '2026-10-02T00:00:00+00:00'
    }
    expect(await saveRule(1, { title: '제목', body: '본문' })).toMatchObject({ ok: false, status: 409 })
    expect(fakeDb.tables.ops_pattern_common_rules[0].title).toBe('규칙 1')
  })

  it('쓰기 오류는 500이다', async () => {
    fakeDb.writeError = { message: 'boom' }
    expect(await saveRule(1, { title: '제목', body: '본문' })).toMatchObject({ ok: false, status: 500 })
  })
})

describe('parseRejectionOffset', () => {
  it('없으면 0, 0 이상 정수 글자는 1,000까지 읽고 나머지는 null이다', () => {
    expect(parseRejectionOffset(null)).toBe(0)
    expect(parseRejectionOffset('0')).toBe(0)
    expect(parseRejectionOffset('20')).toBe(20)
    expect(parseRejectionOffset('1000')).toBe(1000)
    for (const raw of ['1001', '-1', '1.5', 'abc', '']) expect(parseRejectionOffset(raw)).toBeNull()
  })
})

describe('listPatternRejections', () => {
  /** P10 반려 기록 n건을 하루씩 간격을 두고 만든다(n이 클수록 최신). */
  function manyRejections(count: number) {
    fakeDb.tables.ops_bundles = [bundleRow('b1')]
    fakeDb.tables.ops_bundle_items = [bundleItemRow('i10', 'P10')]
    fakeDb.tables.ops_decisions = Array.from({ length: count }, (_, index) =>
      decisionRow(uid(1000 + index), 'b1', 'i10', { created_at: `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00+00:00` })
    )
  }

  it('이 패턴 항목의 반려만 싣는다: 시험·다른 패턴·다른 행동·항목 없는 결정은 뺀다', async () => {
    const result = await listPatternRejections(service, 'P10', { offset: 0 })
    expect(result.rejections.map((r) => r.id)).toEqual([D_OK])
    expect(result).toMatchObject({ hasMore: false, total: 1 })
    expect((await listPatternRejections(service, 'P11', { offset: 0 })).rejections.map((r) => r.id)).toEqual([D_OTHER_PATTERN])
    expect(await listPatternRejections(service, 'P99', { offset: 0 })).toEqual({ rejections: [], hasMore: false, total: 0 })
  })

  it('한 줄에는 날짜·행위자 종류·묶음 행 ID·항목 이름·이유가 있고 actor 원문은 없다', async () => {
    fakeDb.tables.ops_decisions = [decisionRow(D_OK, 'b1', 'i10', { actor: 'token:routine-agent', reason: '톤이 안 맞아요' })]
    const [line] = (await listPatternRejections(service, 'P10', { offset: 0 })).rejections
    expect(line).toEqual({
      id: D_OK,
      createdAt: '2026-10-05T00:00:00+00:00',
      actorType: 'agent',
      agentName: 'routine-agent',
      bundleId: 'b1',
      itemId: 'i10',
      itemName: '항목 i10',
      reason: '톤이 안 맞아요',
    })
    const text = JSON.stringify(await listPatternRejections(service, 'P10', { offset: 0 }))
    for (const forbidden of ['actor"', 'secret-admin-user-id', 'token:', 'slack_result', 'diff']) expect(text).not.toContain(forbidden)
  })

  it('관리자가 한 반려는 이름 없이 admin이다', async () => {
    const [line] = (await listPatternRejections(service, 'P10', { offset: 0 })).rejections
    expect(line).toMatchObject({ actorType: 'admin', agentName: null })
    expect(JSON.stringify(line)).not.toContain('secret-admin-user-id')
  })

  it('항목 이름은 수정본 제목, 없으면 항목 키 순서로 만든다', async () => {
    fakeDb.tables.ops_bundle_items = [bundleItemRow('i10', 'P10', { original: {}, edited: null, item_key: 'mission-7' })]
    const [line] = (await listPatternRejections(service, 'P10', { offset: 0 })).rejections
    expect(line.itemName).toBe('mission-7')
  })

  it('92일보다 오래된 반려도 싣고 최신순이다', async () => {
    fakeDb.tables.ops_decisions = [
      decisionRow(uid(1), 'b1', 'i10', { created_at: '2025-01-01T00:00:00+00:00' }),
      decisionRow(uid(3), 'b1', 'i10', { created_at: '2026-10-01T00:00:00+00:00' }),
      decisionRow(uid(2), 'b1', 'i10', { created_at: '2026-03-01T00:00:00+00:00' }),
    ]
    const result = await listPatternRejections(service, 'P10', { offset: 0 })
    expect(result.rejections.map((r) => r.id)).toEqual([uid(3), uid(2), uid(1)])
  })

  it('같은 시각이면 id 내림차순으로 순서가 고정된다', async () => {
    const at = '2026-10-01T00:00:00+00:00'
    fakeDb.tables.ops_decisions = [decisionRow(uid(1), 'b1', 'i10', { created_at: at }), decisionRow(uid(2), 'b1', 'i10', { created_at: at })]
    expect((await listPatternRejections(service, 'P10', { offset: 0 })).rejections.map((r) => r.id)).toEqual([uid(2), uid(1)])
  })

  it('10건씩 읽고 hasMore·total로 다음 쪽을 알린다', async () => {
    manyRejections(23)
    const first = await listPatternRejections(service, 'P10', { offset: 0 })
    expect(first.rejections).toHaveLength(10)
    expect(first).toMatchObject({ hasMore: true, total: 23 })
    expect(first.rejections[0].id).toBe(uid(1022))

    const second = await listPatternRejections(service, 'P10', { offset: 10 })
    expect(second.rejections).toHaveLength(10)
    expect(second.hasMore).toBe(true)
    expect(second.rejections[0].id).toBe(uid(1012))

    const last = await listPatternRejections(service, 'P10', { offset: 20 })
    expect(last.rejections.map((r) => r.id)).toEqual([uid(1002), uid(1001), uid(1000)])
    expect(last.hasMore).toBe(false)
  })

  it('정확히 10건이면 hasMore는 거짓이다', async () => {
    manyRejections(10)
    expect(await listPatternRejections(service, 'P10', { offset: 0 })).toMatchObject({ hasMore: false, total: 10 })
  })

  it('조회 오류는 던진다', async () => {
    fakeDb.readError = 'down'
    await expect(listPatternRejections(service, 'P10', { offset: 0 })).rejects.toThrow('반려 기록 조회 실패')
  })
})

describe('시드(212)의 취향 신호 이유와 공통 규칙은 상한 안이다', () => {
  const sql = readFileSync(join(__dirname, '../../../../../supabase/migrations/212_ops_patterns_seed.sql'), 'utf8')
  const quoted = String.raw`'((?:[^']|'')*)'`

  it('취향 신호 이유가 모두 500자 이하다', () => {
    const rows = [...sql.matchAll(new RegExp(String.raw`\((?:'P[0-9]+'|NULL), ${quoted}, ${quoted}, 'estimate', [0-9]+\)`, 'g'))]
    expect(rows.length).toBeGreaterThan(30)
    for (const row of rows) expect(row[2].length, row[1]).toBeLessThanOrEqual(OPS_TASTE_LIMITS.reasonMax)
  })

  it('공통 규칙 7개의 제목은 60자, 본문은 2,000자 이하다', () => {
    const rows = [...sql.matchAll(new RegExp(String.raw`\(([1-7]), ${quoted}, ${quoted}\)`, 'g'))]
    expect(rows).toHaveLength(7)
    for (const row of rows) {
      expect(row[2].length, `규칙 ${row[1]} 제목`).toBeLessThanOrEqual(OPS_TASTE_LIMITS.ruleTitleMax)
      expect(row[3].length, `규칙 ${row[1]} 본문`).toBeLessThanOrEqual(OPS_TASTE_LIMITS.ruleBodyMax)
    }
  })
})
