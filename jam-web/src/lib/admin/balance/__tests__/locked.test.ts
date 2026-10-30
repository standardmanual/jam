/**
 * 잠긴 아이템 배지 구역 연결 (티켓 20261022_1133 1회, 20261028_1737 3회) — `jam_policy` id=1 행의 `locked_points_*` 네 칸(여는 포인트)과 `locked_min_*` 네 칸(옛 채우기 방식의 최소값). 가짜 표로 지키는 것:
 * - 칸 정의: 여는 포인트 네 칸(단위 포인트, 0 이상 정수)이 먼저, 최소값 네 칸(단위 잼, 1 이상 정수)이 뒤에 온다. 기본값은 `DEFAULT_JAM_POLICY`, 확률 안내에 반영되지 않는다. 정의를 통과하는 값은 `VALIDATORS`도 통과한다
 * - 읽기: 가공하지 않은 행에서 여덟 칸을 숫자로 읽는다. 읽기에 넘기는 칸 목록은 여덟 칸과 `updated_at`뿐이다(잼·동기화 칸은 읽지 않는다). 행이 없거나 숫자가 아닌 칸이 있으면 던진다
 * - 쓰기: id=1이고 수정 시각이 같을 때만 바뀐 칸과 `updated_at`을 갱신한다. 0행이면 conflict, DB 오류는 error. 이 구역의 칸이 아닌 값은 쓰지 않는다
 * - 공용 저장(`saveBalanceSection`)을 지나면: 저장되고 `locked_min_epic` 같은 칸 이름으로 이력에 남는다(확률 안내 표시 없음). 최소값 0 이하·여는 포인트 음수·소수·모르는 칸(잠길 확률 포함)은 저장되지 않고 이유가 붙는다. 여는 포인트 0은 저장된다.
 *   등급 사이 순서는 검사하지 않는다. 다른 사람이 먼저 바꿨으면 409이고, 이력을 못 쓰면 값과 수정 시각이 원래대로 돌아온다
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

import { DEFAULT_JAM_POLICY, VALIDATORS } from '@/lib/jam/policy'
import { checkFieldValue, draftFromValues } from '../fields'
import { LOCKED_BALANCE_KEYS, LOCKED_BINDING, LOCKED_FIELDS, LOCKED_SECTION_ID, LOCKED_SELECT } from '../locked'
import { BALANCE_HISTORY_FAILED_MESSAGE, BALANCE_INVALID_MESSAGE, saveBalanceSection } from '../save'
import { INTEGER_MAX } from '../types'
import { createFakeDb, jamPolicyRow, JAM_ROW_STAMP, type FakeDb } from './fakeDb'

const POINT_KEYS = ['locked_points_common', 'locked_points_rare', 'locked_points_epic', 'locked_points_mystic'] as const
const MIN_KEYS = ['locked_min_common', 'locked_min_rare', 'locked_min_epic', 'locked_min_mystic'] as const
const ALL_VALUES = {
  locked_points_common: 50,
  locked_points_rare: 100,
  locked_points_epic: 200,
  locked_points_mystic: 400,
  locked_min_common: 30,
  locked_min_rare: 60,
  locked_min_epic: 120,
  locked_min_mystic: 240,
}

const ACTOR = '11111111-1111-4111-8111-111111111111'
const NEXT = '2026-10-22T02:00:00.000Z'

let db: FakeDb

beforeEach(() => {
  db = createFakeDb({ jam_policy: [jamPolicyRow()], balance_setting_changes: [], users: [{ id: ACTOR, username: 'karina' }] })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const save = (values: unknown, extra: { note?: unknown; expectedUpdatedAt?: unknown } = {}) =>
  saveBalanceSection(db.client, { binding: LOCKED_BINDING, values, expectedUpdatedAt: JAM_ROW_STAMP, actor: ACTOR, ...extra })
const policyRow = () => db.tables.jam_policy[0]
const historyRows = () => db.tables.balance_setting_changes

describe('잠긴 아이템 배지 칸 정의', () => {
  it('구역 키는 locked이고 칸은 여는 포인트 네 칸, 최소값 네 칸 순서의 여덟 개다', () => {
    expect(LOCKED_SECTION_ID).toBe('locked')
    expect(LOCKED_BINDING.id).toBe('locked')
    expect(LOCKED_FIELDS.map((def) => def.key)).toEqual([...POINT_KEYS, ...MIN_KEYS])
    expect(LOCKED_FIELDS.map((def) => def.label)).toEqual(['Common', 'Rare', 'Epic', 'Mystic', 'Common', 'Rare', 'Epic', 'Mystic'])
    expect(LOCKED_FIELDS.map((def) => def.key)).toEqual([...LOCKED_BALANCE_KEYS])
  })

  it('여는 포인트 네 칸은 포인트 단위의 0 이상 정수이고 한 묶음이며, 확률 안내에는 반영되지 않는다', () => {
    const defs = LOCKED_FIELDS.filter((def) => (POINT_KEYS as readonly string[]).includes(def.key))
    expect(defs).toHaveLength(4)
    for (const def of defs) {
      expect(def.unit, def.key).toBe('포인트')
      expect(def.group, def.key).toBe('여는 포인트')
      expect(def.decimals, def.key).toBe(0)
      expect(def.min, def.key).toBe(0)
      expect(def.max, def.key).toBe(INTEGER_MAX)
      expect(def.affectsDisclosure, def.key).toBe(false)
      expect(def.sumTo, def.key).toBeUndefined()
    }
  })

  it('등급별 최소값 네 칸은 잼 단위의 1 이상 정수이고 한 묶음이며, 확률 안내에는 반영되지 않는다', () => {
    const defs = LOCKED_FIELDS.filter((def) => (MIN_KEYS as readonly string[]).includes(def.key))
    expect(defs).toHaveLength(4)
    for (const def of defs) {
      expect(def.unit, def.key).toBe('잼')
      expect(def.group, def.key).toBe('등급별 최소값')
      expect(def.decimals, def.key).toBe(0)
      expect(def.min, def.key).toBe(1)
      expect(def.max, def.key).toBe(INTEGER_MAX)
      expect(def.affectsDisclosure, def.key).toBe(false)
      expect(def.sumTo, def.key).toBeUndefined()
    }
  })

  it('기본값이 DEFAULT_JAM_POLICY와 같고 화면 초안의 빈 값으로 쓰인다', () => {
    for (const def of LOCKED_FIELDS) expect(def.defaultValue, def.key).toBe(DEFAULT_JAM_POLICY[def.key as (typeof LOCKED_BALANCE_KEYS)[number]])
    expect(LOCKED_FIELDS.map((def) => def.defaultValue)).toEqual([50, 100, 200, 400, 30, 60, 120, 240])
    expect(draftFromValues(LOCKED_FIELDS, {})).toEqual({
      locked_points_common: '50',
      locked_points_rare: '100',
      locked_points_epic: '200',
      locked_points_mystic: '400',
      locked_min_common: '30',
      locked_min_rare: '60',
      locked_min_epic: '120',
      locked_min_mystic: '240',
    })
  })

  it('여는 포인트는 0을 허용하고 음수·소수는 거절한다. 정의를 통과하는 값은 VALIDATORS도 통과한다', () => {
    for (const key of POINT_KEYS) {
      const def = LOCKED_FIELDS.find((field) => field.key === key)!
      for (const bad of [-1, 1.5, 0.5, INTEGER_MAX + 1]) expect(checkFieldValue(def, bad), `${key} ${bad}`).not.toBeNull()
      for (const bad of [-1, 1.5, 0.5]) {
        expect(VALIDATORS[key](bad), `${key} ${bad}`).toBe(false)
        expect(LOCKED_BINDING.validators?.[key]?.(bad), `${key} ${bad}`).toBe(false)
      }
      for (const good of [0, 1, 50, INTEGER_MAX]) {
        expect(checkFieldValue(def, good), `${key} ${good}`).toBeNull()
        expect(VALIDATORS[key](good), `${key} ${good}`).toBe(true)
        expect(LOCKED_BINDING.validators?.[key]?.(good), `${key} ${good}`).toBe(true)
      }
    }
  })

  it('최소값은 0 이하·소수를 거절하고 1 이상 정수는 통과한다. 정의를 통과하는 값은 VALIDATORS도 통과한다', () => {
    for (const key of MIN_KEYS) {
      const def = LOCKED_FIELDS.find((field) => field.key === key)!
      for (const bad of [0, -1, 1.5, 0.5, INTEGER_MAX + 1]) expect(checkFieldValue(def, bad), `${key} ${bad}`).not.toBeNull()
      for (const good of [1, 30, INTEGER_MAX]) {
        expect(checkFieldValue(def, good), `${key} ${good}`).toBeNull()
        expect(VALIDATORS[key](good), `${key} ${good}`).toBe(true)
        expect(LOCKED_BINDING.validators?.[key]?.(good), `${key} ${good}`).toBe(true)
      }
      expect(LOCKED_BINDING.validators?.[key]?.(0), key).toBe(false)
    }
  })

  it('읽기에 넘기는 칸 목록이 여덟 칸과 updated_at뿐이다', () => {
    expect(LOCKED_SELECT.split(',').map((column) => column.trim())).toEqual([...LOCKED_BALANCE_KEYS, 'updated_at'])
  })
})

describe('LOCKED_BINDING.read', () => {
  it('여덟 칸을 숫자로 읽고 수정 시각을 돌려준다(잼·동기화 칸은 읽지 않는다)', async () => {
    const snapshot = await LOCKED_BINDING.read(db.client)
    expect(snapshot).toEqual({ values: ALL_VALUES, updatedAt: JAM_ROW_STAMP })
    expect(db.selects).toEqual([LOCKED_SELECT])
    expect(Object.keys(snapshot.values)).toEqual([...LOCKED_BALANCE_KEYS])
  })

  it('저장된 값이 비정상이어도 기본값으로 바꿔 보이지 않고 그대로 읽는다', async () => {
    db.tables.jam_policy = [jamPolicyRow({ locked_min_epic: 7, locked_min_mystic: '9', locked_points_rare: -3 })]
    const snapshot = await LOCKED_BINDING.read(db.client)
    expect(snapshot.values.locked_min_epic).toBe(7)
    expect(snapshot.values.locked_min_mystic).toBe(9)
    expect(snapshot.values.locked_points_rare).toBe(-3)
  })

  it('행이 없거나 숫자가 아닌 칸이 있거나 조회가 실패하면 던진다', async () => {
    db.tables.jam_policy = []
    await expect(LOCKED_BINDING.read(db.client)).rejects.toThrow('id=1 행이 없음')

    db.tables.jam_policy = [jamPolicyRow({ locked_min_rare: null })]
    await expect(LOCKED_BINDING.read(db.client)).rejects.toThrow('locked_min_rare')

    db.tables.jam_policy = [jamPolicyRow({ locked_points_epic: null })]
    await expect(LOCKED_BINDING.read(db.client)).rejects.toThrow('locked_points_epic')

    db.readErrors.jam_policy = 'boom'
    await expect(LOCKED_BINDING.read(db.client)).rejects.toThrow('잠긴 아이템 배지 값 조회 실패: boom')
  })
})

describe('LOCKED_BINDING.write', () => {
  it('수정 시각이 같으면 넘긴 칸과 수정 시각만 갱신한다', async () => {
    const res = await LOCKED_BINDING.write(db.client, { values: { locked_min_epic: 100 }, expectedUpdatedAt: JAM_ROW_STAMP, nextUpdatedAt: NEXT })
    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.updates).toEqual([{ locked_min_epic: 100, updated_at: NEXT }])
    expect(policyRow()).toMatchObject({ locked_min_common: 30, locked_min_rare: 60, locked_min_epic: 100, locked_min_mystic: 240 })
  })

  it('여는 포인트 칸도 같은 방식으로 갱신하고 0을 쓴다', async () => {
    const res = await LOCKED_BINDING.write(db.client, {
      values: { locked_points_common: 0, locked_points_mystic: 500 },
      expectedUpdatedAt: JAM_ROW_STAMP,
      nextUpdatedAt: NEXT,
    })
    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.updates).toEqual([{ locked_points_common: 0, locked_points_mystic: 500, updated_at: NEXT }])
    expect(policyRow()).toMatchObject({
      locked_points_common: 0,
      locked_points_rare: 100,
      locked_points_epic: 200,
      locked_points_mystic: 500,
      locked_min_common: 30,
    })
  })

  it('수정 시각이 다르면 conflict이고 아무것도 바꾸지 않는다', async () => {
    const res = await LOCKED_BINDING.write(db.client, {
      values: { locked_min_epic: 100 },
      expectedUpdatedAt: '2026-10-21T00:00:00+00:00',
      nextUpdatedAt: NEXT,
    })
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect(policyRow().locked_min_epic).toBe(120)
  })

  it('이 구역의 칸이 아닌 값은 본문에 있어도 쓰지 않는다', async () => {
    await LOCKED_BINDING.write(db.client, {
      values: { locked_min_epic: 100, locked_roll_probability: 0.9, intensity_light: 9, sync_item_guaranteed: 9 },
      expectedUpdatedAt: JAM_ROW_STAMP,
      nextUpdatedAt: NEXT,
    })
    expect(Object.keys(db.updates[0]).sort()).toEqual(['locked_min_epic', 'updated_at'])
    expect(policyRow()).toMatchObject({ locked_roll_probability: '0.250', intensity_light: 1, sync_item_guaranteed: 1 })
  })

  it('DB 오류는 error로 돌려준다', async () => {
    db.writeErrors.jam_policy = 'boom'
    const res = await LOCKED_BINDING.write(db.client, { values: { locked_min_epic: 100 }, expectedUpdatedAt: JAM_ROW_STAMP, nextUpdatedAt: NEXT })
    expect(res).toEqual({ ok: false, reason: 'error', message: 'boom' })
  })
})

describe('잠긴 아이템 배지 구역 저장 (공용 저장을 지난다)', () => {
  it('최소값을 바꾸면 저장되고 locked_min_epic 칸 이름으로 이력에 남으며 확률 안내 반영 표시는 없다', async () => {
    const out = await save({ locked_min_epic: 100, locked_min_common: 30 }, { note: 'Epic 완화' })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.changes).toEqual([{ field: 'locked_min_epic', from: 120, to: 100 }])
    expect(out.affectsDisclosure).toBe(false)
    expect(out.values).toEqual({ ...ALL_VALUES, locked_min_epic: 100 })
    expect(policyRow().locked_min_epic).toBe(100)
    expect(historyRows()).toHaveLength(1)
    expect(historyRows()[0]).toMatchObject({
      section_key: 'locked',
      changes: [{ field: 'locked_min_epic', from: 120, to: 100 }],
      note: 'Epic 완화',
      affects_disclosure: false,
      changed_by: ACTOR,
    })
  })

  it('여는 포인트를 바꾸면 locked_points_* 칸 이름으로 이력에 남고, 0도 저장된다', async () => {
    const out = await save({ locked_points_rare: 0, locked_points_common: 50 }, { note: 'Rare 무료' })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.changes).toEqual([{ field: 'locked_points_rare', from: 100, to: 0 }])
    expect(out.affectsDisclosure).toBe(false)
    expect(policyRow().locked_points_rare).toBe(0)
    expect(historyRows()).toHaveLength(1)
    expect(historyRows()[0]).toMatchObject({
      section_key: 'locked',
      changes: [{ field: 'locked_points_rare', from: 100, to: 0 }],
      note: 'Rare 무료',
      affects_disclosure: false,
      changed_by: ACTOR,
    })
  })

  it('여덟 칸을 함께 바꾸면 한 줄 이력에 칸 정의 순서로 모두 남는다', async () => {
    const out = await save({
      locked_min_mystic: 300,
      locked_points_mystic: 500,
      locked_min_rare: 50,
      locked_points_common: 40,
      locked_min_common: 20,
      locked_points_epic: 250,
      locked_min_epic: 100,
      locked_points_rare: 90,
    })
    expect(out.ok).toBe(true)
    expect((historyRows()[0].changes as Array<{ field: string }>).map((change) => change.field)).toEqual([
      'locked_points_common',
      'locked_points_rare',
      'locked_points_epic',
      'locked_points_mystic',
      'locked_min_common',
      'locked_min_rare',
      'locked_min_epic',
      'locked_min_mystic',
    ])
  })

  it('등급 사이 순서는 검사하지 않는다(Rare가 Common보다 작아도 저장된다)', async () => {
    expect((await save({ locked_min_rare: 10 })).ok).toBe(true)
    expect(policyRow()).toMatchObject({ locked_min_common: 30, locked_min_rare: 10 })
  })

  it('최소값 0 이하·소수는 저장되지 않고 칸마다 이유가 붙는다', async () => {
    const out = await save({ locked_min_common: 0, locked_min_rare: -5, locked_min_epic: 1.5, locked_min_mystic: INTEGER_MAX + 1 })
    expect(out).toMatchObject({ ok: false, status: 400, error: BALANCE_INVALID_MESSAGE })
    if (out.ok) return
    expect(Object.keys(out.fieldErrors ?? {}).sort()).toEqual(['locked_min_common', 'locked_min_epic', 'locked_min_mystic', 'locked_min_rare'])
    expect(out.fieldErrors?.locked_min_common).toBe('1 이상의 정수로 입력해 주세요.')
    expect(db.updates).toEqual([])
    expect(historyRows()).toEqual([])
  })

  it('여는 포인트 음수·소수는 저장되지 않고 칸마다 이유가 붙는다', async () => {
    const out = await save({ locked_points_common: -1, locked_points_rare: 1.5, locked_points_epic: INTEGER_MAX + 1 })
    expect(out).toMatchObject({ ok: false, status: 400, error: BALANCE_INVALID_MESSAGE })
    if (out.ok) return
    expect(Object.keys(out.fieldErrors ?? {}).sort()).toEqual(['locked_points_common', 'locked_points_epic', 'locked_points_rare'])
    expect(db.updates).toEqual([])
    expect(historyRows()).toEqual([])
  })

  it('숫자가 아닌 값은 거절한다', async () => {
    const out = await save({ locked_min_common: '60' })
    expect(out).toMatchObject({ ok: false, status: 400 })
    if (out.ok) return
    expect(out.fieldErrors).toEqual({ locked_min_common: '숫자로 입력해 주세요.' })
  })

  it('잠길 확률·잼·동기화 칸은 이 구역에서 «알 수 없는 칸»으로 거절한다', async () => {
    const out = await save({ locked_roll_probability: 0.5, intensity_light: 2 })
    expect(out).toMatchObject({ ok: false, status: 400 })
    if (out.ok) return
    expect(out.fieldErrors).toEqual({ locked_roll_probability: '알 수 없는 칸이에요.', intensity_light: '알 수 없는 칸이에요.' })
    expect(db.updates).toEqual([])
  })

  it('바뀐 값이 없으면 400이고 이력이 없다', async () => {
    expect(await save({ locked_min_common: 30 })).toMatchObject({ ok: false, status: 400, error: '바뀐 값이 없어요.' })
    expect(historyRows()).toEqual([])
  })

  it('다른 사람이 먼저 바꿨으면(수정 시각 불일치) 409이고 아무것도 쓰지 않는다', async () => {
    const out = await save({ locked_min_epic: 100 }, { expectedUpdatedAt: '2026-10-21T00:00:00+00:00' })
    expect(out).toMatchObject({ ok: false, status: 409 })
    expect(db.updates).toEqual([])
    expect(historyRows()).toEqual([])
  })

  it('읽은 뒤 쓰기 직전에 다른 곳이 같은 행을 바꾸면 409다(이력 없음)', async () => {
    db.beforeUpdate = () => {
      policyRow().updated_at = '2026-10-22T01:30:00+00:00'
    }
    const out = await save({ locked_min_epic: 100 })
    expect(out).toMatchObject({ ok: false, status: 409 })
    expect(policyRow().locked_min_epic).toBe(120)
    expect(historyRows()).toEqual([])
  })

  it('이력을 쓰지 못하면 값과 수정 시각이 원래대로 돌아오고 500이다', async () => {
    db.writeErrors.balance_setting_changes = 'secret relation detail'
    const out = await save({ locked_min_epic: 100 })
    expect(out).toMatchObject({ ok: false, status: 500, error: BALANCE_HISTORY_FAILED_MESSAGE })
    expect(policyRow()).toMatchObject({ locked_min_epic: 120, updated_at: JAM_ROW_STAMP })
  })
})
