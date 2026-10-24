/**
 * 배지와 포인트 구역 연결 (티켓 20261022_1135 1회) — `badge_point_policy` id=1 행의 5칸. 가짜 표로 지키는 것:
 * - 칸 정의: 다섯 칸(Common·Rare·Epic·Mystic·레벨마다) 순서, 단위 포인트, 0 이상 정수, 기본값은 `DEFAULT_BADGE_POINT_POLICY`(10·20·50·100·10), 확률 안내에 반영되지 않는다.
 *   모든 칸 안내에 «이미 있는 배지는 바뀌지 않아요»가 들어 있다. 정의를 통과하는 값은 구역 검사도 통과한다
 * - 읽기: 가공하지 않은 행에서 5칸을 숫자로 읽는다. 읽기에 넘기는 칸 목록은 5칸과 `updated_at`뿐이다. 행이 없거나 숫자가 아닌 칸이 있으면 던진다
 * - 쓰기: id=1이고 수정 시각이 같을 때만 바뀐 칸과 `updated_at`을 갱신한다. 0행이면 conflict, DB 오류는 error. 이 구역의 칸이 아닌 값은 쓰지 않는다
 * - 공용 저장(`saveBalanceSection`)을 지나면: 저장되고 `rare_points` 같은 칸 이름으로 이력에 남는다(확률 안내 표시 없음). 음수·소수·모르는 칸은 저장되지 않고 이유가 붙는다.
 *   0은 저장된다(0이면 포인트를 주지 않는다). 등급 사이 순서는 검사하지 않는다. 다른 사람이 먼저 바꿨으면 409이고, 이력을 못 쓰면 값과 수정 시각이 원래대로 돌아온다
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

import { BADGE_POINT_POLICY_KEYS, DEFAULT_BADGE_POINT_POLICY } from '@/lib/badge/pointPolicy'
import {
  BADGEPOINTS_BALANCE_KEYS,
  BADGEPOINTS_BINDING,
  BADGEPOINTS_FIELDS,
  BADGEPOINTS_SECTION_ID,
  BADGEPOINTS_SELECT,
} from '../badgepoints'
import { checkFieldValue, draftFromValues } from '../fields'
import { BALANCE_HISTORY_FAILED_MESSAGE, BALANCE_INVALID_MESSAGE, saveBalanceSection } from '../save'
import { INTEGER_MAX } from '../types'
import { BADGEPOINTS_ROW_STAMP, badgePointPolicyRow, createFakeDb, type FakeDb } from './fakeDb'

const ACTOR = '11111111-1111-4111-8111-111111111111'
const NEXT = '2026-10-24T04:00:00.000Z'

let db: FakeDb

beforeEach(() => {
  db = createFakeDb({ badge_point_policy: [badgePointPolicyRow()], balance_setting_changes: [], users: [{ id: ACTOR, username: 'karina' }] })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const save = (values: unknown, extra: { note?: unknown; expectedUpdatedAt?: unknown } = {}) =>
  saveBalanceSection(db.client, { binding: BADGEPOINTS_BINDING, values, expectedUpdatedAt: BADGEPOINTS_ROW_STAMP, actor: ACTOR, ...extra })
const policyRow = () => db.tables.badge_point_policy[0]
const historyRows = () => db.tables.balance_setting_changes

describe('배지와 포인트 칸 정의', () => {
  it('구역 키는 badgepoints이고 칸은 Common·Rare·Epic·Mystic·레벨마다 순서의 다섯 개다', () => {
    expect(BADGEPOINTS_SECTION_ID).toBe('badgepoints')
    expect(BADGEPOINTS_BINDING.id).toBe('badgepoints')
    expect(BADGEPOINTS_FIELDS.map((def) => def.key)).toEqual(['common_points', 'rare_points', 'epic_points', 'mystic_points', 'leveled_points'])
    expect(BADGEPOINTS_FIELDS.map((def) => def.label)).toEqual(['Common', 'Rare', 'Epic', 'Mystic', '레벨마다'])
    expect(BADGEPOINTS_FIELDS.map((def) => def.key)).toEqual([...BADGEPOINTS_BALANCE_KEYS])
    expect([...BADGEPOINTS_BALANCE_KEYS]).toEqual([...BADGE_POINT_POLICY_KEYS])
  })

  it('등급 네 칸은 «등급별 포인트», 레벨마다 칸은 «레벨형» 묶음이다', () => {
    expect(BADGEPOINTS_FIELDS.map((def) => def.group)).toEqual(['등급별 포인트', '등급별 포인트', '등급별 포인트', '등급별 포인트', '레벨형'])
  })

  it('모두 포인트 단위의 0 이상 정수이고 합계·순서 검사가 없으며, 확률 안내에는 반영되지 않는다', () => {
    for (const def of BADGEPOINTS_FIELDS) {
      expect(def.unit, def.key).toBe('포인트')
      expect(def.decimals, def.key).toBe(0)
      expect(def.min, def.key).toBe(0)
      expect(def.max, def.key).toBe(INTEGER_MAX)
      expect(def.affectsDisclosure, def.key).toBe(false)
      expect(def.sumTo, def.key).toBeUndefined()
    }
    expect(BADGEPOINTS_BINDING.validateTogether).toBeUndefined()
  })

  it('모든 칸 안내가 «이미 있는 배지는 바뀌지 않아요»를 말한다', () => {
    for (const def of BADGEPOINTS_FIELDS) {
      expect(def.hint, def.key).toContain('이미 있는 배지는 바뀌지 않아요')
      expect(def.hint, def.key).toContain('기본값이에요')
    }
  })

  it('기본값이 DEFAULT_BADGE_POINT_POLICY와 같고 화면 초안의 빈 값으로 쓰인다', () => {
    for (const def of BADGEPOINTS_FIELDS) expect(def.defaultValue, def.key).toBe(DEFAULT_BADGE_POINT_POLICY[def.key as (typeof BADGEPOINTS_BALANCE_KEYS)[number]])
    expect(BADGEPOINTS_FIELDS.map((def) => def.defaultValue)).toEqual([10, 20, 50, 100, 10])
    expect(draftFromValues(BADGEPOINTS_FIELDS, {})).toEqual({ common_points: '10', rare_points: '20', epic_points: '50', mystic_points: '100', leveled_points: '10' })
  })

  it('음수·소수는 거절하고 0 이상 정수는 통과한다(0은 포인트를 주지 않는다는 뜻이다). 정의를 통과하는 값은 구역 검사도 통과한다', () => {
    for (const def of BADGEPOINTS_FIELDS) {
      // 정수 상한은 칸 정의(`max`)가 막는다 — 구역 검사(`validators`)는 0 이상 정수인지만 본다
      for (const bad of [-1, 1.5, 0.5, INTEGER_MAX + 1]) expect(checkFieldValue(def, bad), `${def.key} ${bad}`).not.toBeNull()
      for (const bad of [-1, 1.5, 0.5]) expect(BADGEPOINTS_BINDING.validators?.[def.key]?.(bad), `${def.key} ${bad}`).toBe(false)
      for (const good of [0, 10, INTEGER_MAX]) {
        expect(checkFieldValue(def, good), `${def.key} ${good}`).toBeNull()
        expect(BADGEPOINTS_BINDING.validators?.[def.key]?.(good), `${def.key} ${good}`).toBe(true)
      }
    }
  })

  it('읽기에 넘기는 칸 목록이 5칸과 updated_at뿐이다', () => {
    expect(BADGEPOINTS_SELECT.split(',').map((column) => column.trim())).toEqual([...BADGEPOINTS_BALANCE_KEYS, 'updated_at'])
  })
})

describe('BADGEPOINTS_BINDING.read', () => {
  it('5칸을 숫자로 읽고 수정 시각을 돌려준다', async () => {
    const snapshot = await BADGEPOINTS_BINDING.read(db.client)
    expect(snapshot).toEqual({
      values: { common_points: 10, rare_points: 20, epic_points: 50, mystic_points: 100, leveled_points: 10 },
      updatedAt: BADGEPOINTS_ROW_STAMP,
    })
    expect(db.selects).toEqual([BADGEPOINTS_SELECT])
    expect(Object.keys(snapshot.values)).toEqual([...BADGEPOINTS_BALANCE_KEYS])
  })

  it('저장된 값이 비정상이어도 기본값으로 바꿔 보이지 않고 그대로 읽는다', async () => {
    db.tables.badge_point_policy = [badgePointPolicyRow({ epic_points: -3, mystic_points: '9' })]
    const snapshot = await BADGEPOINTS_BINDING.read(db.client)
    expect(snapshot.values.epic_points).toBe(-3)
    expect(snapshot.values.mystic_points).toBe(9)
  })

  it('행이 없거나 숫자가 아닌 칸이 있거나 조회가 실패하면 던진다', async () => {
    db.tables.badge_point_policy = []
    await expect(BADGEPOINTS_BINDING.read(db.client)).rejects.toThrow('id=1 행이 없음')

    db.tables.badge_point_policy = [badgePointPolicyRow({ rare_points: null })]
    await expect(BADGEPOINTS_BINDING.read(db.client)).rejects.toThrow('rare_points')

    db.readErrors.badge_point_policy = 'boom'
    await expect(BADGEPOINTS_BINDING.read(db.client)).rejects.toThrow('배지 포인트 조회 실패: boom')
  })
})

describe('BADGEPOINTS_BINDING.write', () => {
  it('수정 시각이 같으면 넘긴 칸과 수정 시각만 갱신한다', async () => {
    const res = await BADGEPOINTS_BINDING.write(db.client, { values: { rare_points: 25 }, expectedUpdatedAt: BADGEPOINTS_ROW_STAMP, nextUpdatedAt: NEXT })
    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.updates).toEqual([{ rare_points: 25, updated_at: NEXT }])
    expect(policyRow()).toMatchObject({ common_points: 10, rare_points: 25, epic_points: 50, mystic_points: 100, leveled_points: 10, updated_at: NEXT })
  })

  it('5칸을 함께 넘기면 5칸을 모두 쓴다', async () => {
    const values = { common_points: 1, rare_points: 2, epic_points: 3, mystic_points: 4, leveled_points: 5 }
    expect(await BADGEPOINTS_BINDING.write(db.client, { values, expectedUpdatedAt: BADGEPOINTS_ROW_STAMP, nextUpdatedAt: NEXT })).toEqual({ ok: true, updatedAt: NEXT })
    expect(policyRow()).toMatchObject(values)
  })

  it('수정 시각이 다르면 conflict이고 아무것도 바꾸지 않는다', async () => {
    const res = await BADGEPOINTS_BINDING.write(db.client, {
      values: { rare_points: 25 },
      expectedUpdatedAt: '2026-10-23T00:00:00+00:00',
      nextUpdatedAt: NEXT,
    })
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect(policyRow().rare_points).toBe(20)
  })

  it('이 구역의 칸이 아닌 값은 본문에 있어도 쓰지 않는다', async () => {
    await BADGEPOINTS_BINDING.write(db.client, {
      values: { rare_points: 25, id: 2, fail_reward_points: 99, locked_min_epic: 9 },
      expectedUpdatedAt: BADGEPOINTS_ROW_STAMP,
      nextUpdatedAt: NEXT,
    })
    expect(Object.keys(db.updates[0]).sort()).toEqual(['rare_points', 'updated_at'])
    expect(policyRow()).toMatchObject({ id: 1, common_points: 10 })
  })

  it('DB 오류는 error로 돌려준다', async () => {
    db.writeErrors.badge_point_policy = 'boom'
    const res = await BADGEPOINTS_BINDING.write(db.client, { values: { rare_points: 25 }, expectedUpdatedAt: BADGEPOINTS_ROW_STAMP, nextUpdatedAt: NEXT })
    expect(res).toEqual({ ok: false, reason: 'error', message: 'boom' })
  })
})

describe('배지와 포인트 구역 저장 (공용 저장을 지난다)', () => {
  it('포인트를 바꾸면 저장되고 rare_points 칸 이름으로 이력에 남으며 확률 안내 반영 표시는 없다', async () => {
    const out = await save({ rare_points: 25, common_points: 10 }, { note: 'Rare 상향' })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.changes).toEqual([{ field: 'rare_points', from: 20, to: 25 }])
    expect(out.affectsDisclosure).toBe(false)
    expect(out.values).toEqual({ common_points: 10, rare_points: 25, epic_points: 50, mystic_points: 100, leveled_points: 10 })
    expect(policyRow().rare_points).toBe(25)
    expect(historyRows()).toHaveLength(1)
    expect(historyRows()[0]).toMatchObject({
      section_key: 'badgepoints',
      changes: [{ field: 'rare_points', from: 20, to: 25 }],
      note: 'Rare 상향',
      affects_disclosure: false,
      changed_by: ACTOR,
    })
  })

  it('다섯 칸을 함께 바꾸면 한 줄 이력에 칸 정의 순서로 모두 남는다', async () => {
    const out = await save({ leveled_points: 12, mystic_points: 120, rare_points: 22, common_points: 11, epic_points: 55 })
    expect(out.ok).toBe(true)
    expect((historyRows()[0].changes as Array<{ field: string }>).map((change) => change.field)).toEqual([
      'common_points',
      'rare_points',
      'epic_points',
      'mystic_points',
      'leveled_points',
    ])
  })

  it('0도 저장된다 — 0이면 포인트를 주지 않는다', async () => {
    expect((await save({ leveled_points: 0 })).ok).toBe(true)
    expect(policyRow().leveled_points).toBe(0)
  })

  it('등급 사이 순서는 검사하지 않는다(Rare가 Common보다 작아도 저장된다)', async () => {
    expect((await save({ rare_points: 5 })).ok).toBe(true)
    expect(policyRow()).toMatchObject({ common_points: 10, rare_points: 5 })
  })

  it('음수·소수는 저장되지 않고 칸마다 이유가 붙는다', async () => {
    const out = await save({ common_points: -1, rare_points: 2.5, epic_points: INTEGER_MAX + 1, leveled_points: -5 })
    expect(out).toMatchObject({ ok: false, status: 400, error: BALANCE_INVALID_MESSAGE })
    if (out.ok) return
    expect(Object.keys(out.fieldErrors ?? {}).sort()).toEqual(['common_points', 'epic_points', 'leveled_points', 'rare_points'])
    expect(out.fieldErrors?.common_points).toBe('0 이상의 정수로 입력해 주세요.')
    expect(db.updates).toEqual([])
    expect(historyRows()).toEqual([])
  })

  it('숫자가 아닌 값은 거절한다', async () => {
    const out = await save({ common_points: '60' })
    expect(out).toMatchObject({ ok: false, status: 400 })
    if (out.ok) return
    expect(out.fieldErrors).toEqual({ common_points: '숫자로 입력해 주세요.' })
  })

  it('모르는 칸은 «알 수 없는 칸»으로 거절한다(숨김 배지 칸은 없다)', async () => {
    const out = await save({ hidden_points: 5, locked_min_epic: 2 })
    expect(out).toMatchObject({ ok: false, status: 400 })
    if (out.ok) return
    expect(out.fieldErrors).toEqual({ hidden_points: '알 수 없는 칸이에요.', locked_min_epic: '알 수 없는 칸이에요.' })
    expect(db.updates).toEqual([])
  })

  it('바뀐 값이 없으면 400이고 이력이 없다', async () => {
    expect(await save({ common_points: 10 })).toMatchObject({ ok: false, status: 400, error: '바뀐 값이 없어요.' })
    expect(historyRows()).toEqual([])
  })

  it('다른 사람이 먼저 바꿨으면(수정 시각 불일치) 409이고 아무것도 쓰지 않는다', async () => {
    const out = await save({ rare_points: 25 }, { expectedUpdatedAt: '2026-10-23T00:00:00+00:00' })
    expect(out).toMatchObject({ ok: false, status: 409 })
    expect(db.updates).toEqual([])
    expect(historyRows()).toEqual([])
  })

  it('읽은 뒤 쓰기 직전에 다른 곳이 같은 행을 바꾸면 409다(이력 없음)', async () => {
    db.beforeUpdate = () => {
      policyRow().updated_at = '2026-10-24T03:30:00+00:00'
    }
    const out = await save({ rare_points: 25 })
    expect(out).toMatchObject({ ok: false, status: 409 })
    expect(policyRow().rare_points).toBe(20)
    expect(historyRows()).toEqual([])
  })

  it('이력을 쓰지 못하면 값과 수정 시각이 원래대로 돌아오고 500이다', async () => {
    db.writeErrors.balance_setting_changes = 'secret relation detail'
    const out = await save({ rare_points: 25 })
    expect(out).toMatchObject({ ok: false, status: 500, error: BALANCE_HISTORY_FAILED_MESSAGE })
    expect(policyRow()).toMatchObject({ rare_points: 20, updated_at: BADGEPOINTS_ROW_STAMP })
  })
})
