/**
 * 밸런스 설정 공용 저장·읽기 (티켓 20261022_1132 1회)
 *
 * 서비스 클라이언트는 메모리 안의 가짜 표(`fakeDb.ts`)로 바꾼다(실 DB에 접속하지 않는다). 잼 구역 연결(`JAM_BINDING`)로 지키는 것:
 * - 성공: 바뀐 칸만 갱신하고(바뀌지 않은 칸은 본문에 있어도 쓰지 않는다) `updated_at`을 올리며, 이력 한 줄에 누가(어드민 ID)·무엇을(칸·이전 → 새 값)·메모가 남는다
 * - 400: 알 수 없는 칸, 숫자가 아닌 값, 정수·범위 위반, 바뀐 칸 없음, 수정 시각 없음, 메모 200자 초과, 본문이 객체가 아님
 * - 409: 화면이 본 수정 시각이 낡았을 때, 읽은 뒤 쓰기 전에 다른 곳이 바꿨을 때(조건부 갱신 0행). 어느 경우도 이력을 쓰지 않는다
 * - 이력 쓰기가 실패하면 방금 갱신을 이전 값과 이전 수정 시각으로 되돌리고 500. 되돌리기까지 실패하면 다른 문장의 500. 응답에 DB 오류 원문이 없다
 * - 칸 사이 검증(`validateTogether`, 등급 확률 합 100 등)은 합쳐진 전체 값으로 걸리고 걸리면 갱신하지 않는다
 * - 읽기(`loadBalanceSection`): 값을 못 읽으면 던지고, 이력만 못 읽으면 `history: null`
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

import { JAM_BINDING } from '../jam'
import { validateSumTo100 } from '../fields'
import {
  BALANCE_CONFLICT_MESSAGE,
  BALANCE_HISTORY_FAILED_MESSAGE,
  BALANCE_INVALID_MESSAGE,
  BALANCE_NOTE_TOO_LONG_MESSAGE,
  BALANCE_NO_CHANGE_MESSAGE,
  BALANCE_ROLLBACK_FAILED_MESSAGE,
  BALANCE_SAVE_FAILED_MESSAGE,
  BALANCE_STAMP_MISSING_MESSAGE,
  loadBalanceSection,
  saveBalanceSection,
  type SaveBalanceInput,
} from '../save'
import type { BalanceSectionBinding } from '../types'
import { createFakeDb, jamPolicyRow, JAM_ROW_STAMP, type FakeDb } from './fakeDb'

const ACTOR = '11111111-1111-4111-8111-111111111111'
const SECRET_DB_MESSAGE = 'relation "jam_policy" violates check constraint (secret detail)'

let db: FakeDb

beforeEach(() => {
  db = createFakeDb({
    jam_policy: [jamPolicyRow()],
    balance_setting_changes: [],
    users: [{ id: ACTOR, username: 'karina' }],
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

function save(overrides: Partial<SaveBalanceInput> = {}, binding: BalanceSectionBinding = JAM_BINDING) {
  return saveBalanceSection(db.client, {
    binding,
    values: { intensity_normal: 4 },
    expectedUpdatedAt: JAM_ROW_STAMP,
    actor: ACTOR,
    ...overrides,
  })
}

const jamRow = () => db.tables.jam_policy[0]
const historyRows = () => db.tables.balance_setting_changes

describe('saveBalanceSection — 성공', () => {
  it('바뀐 칸만 갱신하고 수정 시각을 올리며 이력 한 줄을 쓴다', async () => {
    const out = await save({ values: { intensity_normal: 4, intensity_hard: 3 }, note: ' 주말 이벤트 ' })

    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.changes).toEqual([{ field: 'intensity_normal', from: 2, to: 4 }])
    expect(out.affectsDisclosure).toBe(false)
    expect(out.values).toMatchObject({ intensity_light: 1, intensity_normal: 4, intensity_hard: 3, mass_earn_alert_multiplier: 3 })
    expect(out.updatedAt).not.toBe(JAM_ROW_STAMP)
    expect(out.updatedAt).toBe(jamRow().updated_at)

    // 바뀐 칸(intensity_normal)과 수정 시각만 쓴다. 같은 값으로 보낸 intensity_hard는 쓰지 않는다
    expect(Object.keys(db.updates[0]).sort()).toEqual(['intensity_normal', 'updated_at'])
    expect(jamRow().intensity_normal).toBe(4)
    expect(jamRow().intensity_hard).toBe(3)

    expect(historyRows()).toHaveLength(1)
    expect(historyRows()[0]).toMatchObject({
      section_key: 'jam',
      changes: [{ field: 'intensity_normal', from: 2, to: 4 }],
      note: '주말 이벤트',
      affects_disclosure: false,
      changed_by: ACTOR,
    })
  })

  it('소수 칸(NUMERIC이 문자열로 내려옴)도 숫자로 비교하고, 같은 값이면 바뀐 칸이 아니다', async () => {
    const same = await save({ values: { mass_earn_alert_multiplier: 3 } })
    expect(same).toMatchObject({ ok: false, status: 400, error: BALANCE_NO_CHANGE_MESSAGE })

    const out = await save({ values: { mass_earn_alert_multiplier: 2.5 } })
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.changes).toEqual([{ field: 'mass_earn_alert_multiplier', from: 3, to: 2.5 }])
  })

  it('여러 칸을 한 번에 바꾸면 이력은 한 줄에 칸 목록으로 남는다', async () => {
    const out = await save({ values: { intensity_light: 0, mass_earn_alert_weeks: 8, mass_earn_alert_no_history_amount: 2400 } })
    expect(out.ok).toBe(true)
    expect(historyRows()).toHaveLength(1)
    expect(historyRows()[0].changes).toEqual([
      { field: 'intensity_light', from: 1, to: 0 },
      { field: 'mass_earn_alert_weeks', from: 4, to: 8 },
      { field: 'mass_earn_alert_no_history_amount', from: 1200, to: 2400 },
    ])
  })

  it('메모는 비워도 저장된다(공백뿐이면 없는 것으로 쓴다)', async () => {
    expect((await save()).ok).toBe(true)
    expect(historyRows()[0].note).toBeNull()
    expect((await save({ values: { intensity_normal: 5 }, expectedUpdatedAt: jamRow().updated_at as string, note: '   ' })).ok).toBe(true)
    expect(historyRows()[1].note).toBeNull()
  })
})

describe('saveBalanceSection — 400', () => {
  async function expectBad(overrides: Partial<SaveBalanceInput>, error: string, fieldErrors?: Record<string, string>) {
    const out = await save(overrides)
    expect(out).toMatchObject({ ok: false, status: 400, error })
    if (fieldErrors && !out.ok) expect(out.fieldErrors).toEqual(fieldErrors)
    expect(db.updates).toEqual([])
    expect(historyRows()).toEqual([])
  }

  it('알 수 없는 칸·숫자가 아닌 값·정수와 범위 위반은 칸별 문장으로 거절한다', async () => {
    await expectBad({ values: { sync_item_guaranteed: 0 } }, BALANCE_INVALID_MESSAGE, { sync_item_guaranteed: '알 수 없는 칸이에요.' })
    await expectBad({ values: { intensity_light: '2' } }, BALANCE_INVALID_MESSAGE, { intensity_light: '숫자로 입력해 주세요.' })
    await expectBad({ values: { intensity_light: 1.5 } }, BALANCE_INVALID_MESSAGE, { intensity_light: '0 이상의 정수로 입력해 주세요.' })
    await expectBad({ values: { intensity_light: -1 } }, BALANCE_INVALID_MESSAGE, { intensity_light: '0 이상의 정수로 입력해 주세요.' })
    await expectBad({ values: { mass_earn_alert_weeks: 0 } }, BALANCE_INVALID_MESSAGE, { mass_earn_alert_weeks: '1 이상의 정수로 입력해 주세요.' })
    await expectBad({ values: { mass_earn_alert_multiplier: 1000 } }, BALANCE_INVALID_MESSAGE)
    await expectBad({ values: { mass_earn_alert_multiplier: 1.255 } }, BALANCE_INVALID_MESSAGE)
    await expectBad({ values: { intensity_light: 2 ** 31 } }, BALANCE_INVALID_MESSAGE)
  })

  it('한 번에 여러 칸이 틀리면 칸마다 문장이 나온다', async () => {
    await expectBad({ values: { intensity_light: 'x', mass_earn_alert_weeks: 0 } }, BALANCE_INVALID_MESSAGE, {
      intensity_light: '숫자로 입력해 주세요.',
      mass_earn_alert_weeks: '1 이상의 정수로 입력해 주세요.',
    })
  })

  it('본문 values가 객체가 아니거나 비어 있으면 거절한다', async () => {
    await expectBad({ values: null }, '바꿀 값을 칸 이름과 숫자로 보내 주세요.')
    await expectBad({ values: [1, 2] }, '바꿀 값을 칸 이름과 숫자로 보내 주세요.')
    await expectBad({ values: {} }, BALANCE_NO_CHANGE_MESSAGE)
  })

  it('바뀐 칸이 없으면(현재 값과 모두 같으면) 쓰지 않고 거절한다', async () => {
    await expectBad({ values: { intensity_light: 1, intensity_normal: 2 } }, BALANCE_NO_CHANGE_MESSAGE)
  })

  it('수정 시각이 없거나 글자가 아니면 거절한다', async () => {
    await expectBad({ expectedUpdatedAt: undefined }, BALANCE_STAMP_MISSING_MESSAGE)
    await expectBad({ expectedUpdatedAt: '' }, BALANCE_STAMP_MISSING_MESSAGE)
    await expectBad({ expectedUpdatedAt: 5 }, BALANCE_STAMP_MISSING_MESSAGE)
  })

  it('메모가 200자를 넘거나 글자가 아니면 거절한다(200자는 통과)', async () => {
    await expectBad({ note: 'ㄱ'.repeat(201) }, BALANCE_NOTE_TOO_LONG_MESSAGE)
    await expectBad({ note: 42 }, BALANCE_NOTE_TOO_LONG_MESSAGE)
    expect((await save({ note: 'ㄱ'.repeat(200) })).ok).toBe(true)
  })
})

describe('saveBalanceSection — 409 동시 수정', () => {
  it('화면이 본 수정 시각이 낡았으면 409이고 아무것도 쓰지 않는다', async () => {
    const out = await save({ expectedUpdatedAt: '2026-10-22T00:00:00+00:00' })
    expect(out).toMatchObject({ ok: false, status: 409, error: BALANCE_CONFLICT_MESSAGE })
    expect(db.updates).toEqual([])
    expect(historyRows()).toEqual([])
  })

  it('읽은 뒤 쓰기 전에 다른 곳이 바꿨으면(조건부 갱신 0행) 409이고 이력을 쓰지 않는다', async () => {
    db.beforeUpdate = () => {
      jamRow().updated_at = '2026-10-22T02:00:00.000+00:00'
    }
    const out = await save()
    expect(out).toMatchObject({ ok: false, status: 409, error: BALANCE_CONFLICT_MESSAGE })
    expect(jamRow().intensity_normal).toBe(2)
    expect(historyRows()).toEqual([])
  })
})

describe('saveBalanceSection — 이력 쓰기 실패', () => {
  it('이력을 쓰지 못하면 방금 갱신을 이전 값과 이전 수정 시각으로 되돌린다', async () => {
    db.writeErrors.balance_setting_changes = SECRET_DB_MESSAGE
    const out = await save({ values: { intensity_normal: 4, mass_earn_alert_weeks: 8 } })

    expect(out).toMatchObject({ ok: false, status: 500, error: BALANCE_HISTORY_FAILED_MESSAGE })
    expect(JSON.stringify(out)).not.toContain('secret detail')
    expect(jamRow()).toMatchObject({ intensity_normal: 2, mass_earn_alert_weeks: 4, updated_at: JAM_ROW_STAMP })
    expect(historyRows()).toEqual([])
    expect(db.calls).toEqual([
      'jam_policy.select',
      'jam_policy.update',
      'balance_setting_changes.insert',
      'jam_policy.update', // 되돌리기
    ])
  })

  it('되돌리기까지 실패하면 로그에 남기고 다른 문장의 오류로 답한다', async () => {
    db.writeErrors.balance_setting_changes = SECRET_DB_MESSAGE
    db.failUpdateFrom.jam_policy = 2
    const out = await save()

    expect(out).toMatchObject({ ok: false, status: 500, error: BALANCE_ROLLBACK_FAILED_MESSAGE })
    expect(JSON.stringify(out)).not.toContain('secret detail')
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('되돌리기도 실패'), expect.any(String), expect.any(String))
  })

  it('저장(갱신) 자체가 실패하면 500이고 이력을 쓰지 않으며 DB 오류 원문을 싣지 않는다', async () => {
    db.writeErrors.jam_policy = SECRET_DB_MESSAGE
    const out = await save()
    expect(out).toMatchObject({ ok: false, status: 500, error: BALANCE_SAVE_FAILED_MESSAGE })
    expect(JSON.stringify(out)).not.toContain('secret detail')
    expect(historyRows()).toEqual([])
  })

  it('현재 값을 읽지 못하면 500이고 아무것도 쓰지 않는다', async () => {
    db.readErrors.jam_policy = SECRET_DB_MESSAGE
    const out = await save()
    expect(out).toMatchObject({ ok: false, status: 500, error: BALANCE_SAVE_FAILED_MESSAGE })
    expect(JSON.stringify(out)).not.toContain('secret detail')
    expect(db.updates).toEqual([])
  })
})

describe('saveBalanceSection — 칸 사이 검증과 확률 안내 반영 표시', () => {
  const RARITY = ['rarity_a', 'rarity_b']
  const field = (key: string, affectsDisclosure: boolean) => ({
    key,
    label: key,
    decimals: 1,
    min: 0,
    max: 100,
    defaultValue: 50,
    affectsDisclosure,
  })
  let stored: Record<string, number>
  let stamp: string

  const rarityBinding: BalanceSectionBinding = {
    id: 'rarity-test',
    fields: [field('rarity_a', true), field('rarity_b', true), field('other', false)],
    validateTogether: (values) => validateSumTo100(values, RARITY),
    read: async () => ({ values: { ...stored }, updatedAt: stamp }),
    write: async (_service, input) => {
      Object.assign(stored, input.values)
      stamp = input.nextUpdatedAt
      return { ok: true, updatedAt: stamp }
    },
  }

  beforeEach(() => {
    stored = { rarity_a: 50, rarity_b: 50, other: 7 }
    stamp = JAM_ROW_STAMP
  })

  it('합쳐진 전체 값의 합이 100이 아니면 400이고 갱신하지 않는다', async () => {
    const out = await save({ values: { rarity_a: 60 } }, rarityBinding)
    expect(out).toMatchObject({ ok: false, status: 400, error: BALANCE_INVALID_MESSAGE })
    if (!out.ok) expect(Object.keys(out.fieldErrors ?? {})).toEqual(RARITY)
    expect(stored.rarity_a).toBe(50)
    expect(historyRows()).toEqual([])
  })

  it('합이 100이 되도록 두 칸을 함께 바꾸면 저장되고 이력에 확률 안내 반영 칸 포함으로 남는다', async () => {
    const out = await save({ values: { rarity_a: 60, rarity_b: 40 } }, rarityBinding)
    expect(out).toMatchObject({ ok: true, affectsDisclosure: true })
    expect(historyRows()[0]).toMatchObject({ section_key: 'rarity-test', affects_disclosure: true })
  })

  it('확률 안내에 반영되지 않는 칸만 바꾸면 반영 표시가 꺼져 있다', async () => {
    const out = await save({ values: { other: 9 } }, rarityBinding)
    expect(out).toMatchObject({ ok: true, affectsDisclosure: false })
    expect(historyRows()[0].affects_disclosure).toBe(false)
  })
})

describe('loadBalanceSection', () => {
  it('현재 값(숫자로 정규화)과 수정 시각과 최근 이력을 돌려준다', async () => {
    await save()
    const loaded = await loadBalanceSection(db.client, JAM_BINDING)
    expect(loaded.values.mass_earn_alert_multiplier).toBe(3)
    expect(loaded.values.intensity_normal).toBe(4)
    expect(loaded.updatedAt).toBe(jamRow().updated_at)
    expect(loaded.history).toHaveLength(1)
    expect(loaded.history?.[0].changedByName).toBe('karina')
  })

  it('값을 읽지 못하면 던진다', async () => {
    db.readErrors.jam_policy = 'boom'
    await expect(loadBalanceSection(db.client, JAM_BINDING)).rejects.toThrow('잼 정책 조회 실패')
  })

  it('이력만 읽지 못하면 던지지 않고 history가 null이다', async () => {
    db.readErrors.balance_setting_changes = 'boom'
    const loaded = await loadBalanceSection(db.client, JAM_BINDING)
    expect(loaded.history).toBeNull()
    expect(loaded.values.intensity_light).toBe(1)
  })
})
