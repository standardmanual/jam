/**
 * 인벤토리 구역 연결 (티켓 20261022_1134 1회) — `inventory_policy` id=1 행의 `max_slots` 한 칸. 저장은 기존 RPC(`set_inventory_max_slots`)를 그대로 거친다.
 * 가짜 표와 가짜 RPC(`fakeDb.ts`, 실 DB에는 접속하지 않는다)로 지키는 것:
 * - 칸 정의: 한 칸(`max_slots`), 단위 개, 1 이상 정수, 기본값은 `DEFAULT_INVENTORY_POLICY`, 확률 안내에 반영되지 않는다. 정의를 통과하는 값은 `validators`도 통과한다
 * - 읽기: 가공하지 않은 행에서 `max_slots`를 숫자로 읽는다. 읽기에 넘기는 칸 목록은 `max_slots`와 `updated_at`뿐이다. 행이 없거나 숫자가 아니면 던진다
 * - 쓰기: 수정 시각 재확인 → RPC(`p_max_slots`) → 수정 시각 다시 읽기. 시각이 다르면 conflict이고 RPC를 부르지 않는다. 새 최대치보다 많이 가진 유저가 있으면(`OVER_LIMIT`)·1 미만이면(`INVALID`)
 *   사용자에게 보일 문장의 rejected, 그 밖의 DB 오류는 error. 저장 뒤 시각을 읽지 못해도 값은 바뀌었으므로 ok다
 * - 공용 저장(`saveBalanceSection`)을 지나면: 저장되고 `max_slots` 칸 이름으로 이력에 남는다. 0·소수·숫자가 아닌 값은 RPC를 부르기 전에 막힌다. 거절은 400(그 문장 그대로),
 *   DB 오류는 500(원문 없음). 이력을 못 쓰면 RPC로 이전 값을 되돌리지만 수정 시각은 되돌리지 못한다(알려진 한계)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

import { DEFAULT_INVENTORY_POLICY } from '@/lib/inventory/policy'
import { checkFieldValue, draftFromValues } from '../fields'
import {
  INVENTORY_BINDING,
  INVENTORY_FIELDS,
  INVENTORY_INVALID_MESSAGE,
  INVENTORY_SECTION_ID,
  INVENTORY_SELECT,
  MAX_SLOTS_KEY,
  inventoryOverLimitMessage,
} from '../inventory'
import {
  BALANCE_CONFLICT_MESSAGE,
  BALANCE_HISTORY_FAILED_MESSAGE,
  BALANCE_INVALID_MESSAGE,
  BALANCE_NO_CHANGE_MESSAGE,
  BALANCE_ROLLBACK_FAILED_MESSAGE,
  BALANCE_SAVE_FAILED_MESSAGE,
  saveBalanceSection,
} from '../save'
import { INTEGER_MAX } from '../types'
import {
  INVENTORY_ROW_STAMP,
  INVENTORY_RPC_STAMP,
  createFakeDb,
  inventoryPolicyRow,
  inventoryRows,
  type FakeDb,
} from './fakeDb'

const ACTOR = '11111111-1111-4111-8111-111111111111'
const NEXT = '2026-10-22T02:00:00.000Z'
const SECRET_DB_MESSAGE = 'relation "inventory" violates check constraint (secret detail)'

let db: FakeDb

beforeEach(() => {
  db = createFakeDb({
    inventory_policy: [inventoryPolicyRow()],
    inventory: inventoryRows(3, 4, 10),
    balance_setting_changes: [],
    users: [{ id: ACTOR, username: 'karina' }],
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(console.error).mockClear()
})

const save = (values: unknown, extra: { note?: unknown; expectedUpdatedAt?: unknown } = {}) =>
  saveBalanceSection(db.client, { binding: INVENTORY_BINDING, values, expectedUpdatedAt: INVENTORY_ROW_STAMP, actor: ACTOR, ...extra })
const write = (values: Record<string, number>, expectedUpdatedAt = INVENTORY_ROW_STAMP) =>
  INVENTORY_BINDING.write(db.client, { values, expectedUpdatedAt, nextUpdatedAt: NEXT })
const policyRow = () => db.tables.inventory_policy[0]
const inventoryMaxSlots = () => db.tables.inventory.map((row) => row.max_slots)
const historyRows = () => db.tables.balance_setting_changes

describe('인벤토리 칸 정의', () => {
  it('구역 키는 inventory이고 칸은 max_slots 하나다', () => {
    expect(INVENTORY_SECTION_ID).toBe('inventory')
    expect(INVENTORY_BINDING.id).toBe('inventory')
    expect(INVENTORY_FIELDS.map((def) => def.key)).toEqual(['max_slots'])
    expect(MAX_SLOTS_KEY).toBe('max_slots')
  })

  it('개 단위의 1 이상 정수이고 확률 안내에는 반영되지 않으며 기본값은 DEFAULT_INVENTORY_POLICY다', () => {
    const [def] = INVENTORY_FIELDS
    expect(def.unit).toBe('개')
    expect(def.decimals).toBe(0)
    expect(def.min).toBe(1)
    expect(def.max).toBe(INTEGER_MAX)
    expect(def.affectsDisclosure).toBe(false)
    expect(def.sumTo).toBeUndefined()
    expect(def.defaultValue).toBe(DEFAULT_INVENTORY_POLICY.max_slots)
    expect(draftFromValues(INVENTORY_FIELDS, {})).toEqual({ max_slots: '10' })
  })

  it('0 이하·소수는 거절하고 1 이상 정수는 통과한다. 정의를 통과하는 값은 validators도 통과한다', () => {
    const [def] = INVENTORY_FIELDS
    for (const bad of [0, -1, 1.5, 0.5, INTEGER_MAX + 1]) expect(checkFieldValue(def, bad), String(bad)).not.toBeNull()
    for (const good of [1, 10, 50, INTEGER_MAX]) {
      expect(checkFieldValue(def, good), String(good)).toBeNull()
      expect(INVENTORY_BINDING.validators?.[MAX_SLOTS_KEY]?.(good), String(good)).toBe(true)
    }
    for (const bad of [0, -1, 1.5]) expect(INVENTORY_BINDING.validators?.[MAX_SLOTS_KEY]?.(bad), String(bad)).toBe(false)
  })

  it('읽기에 넘기는 칸 목록이 max_slots와 updated_at뿐이다', () => {
    expect(INVENTORY_SELECT.split(',').map((column) => column.trim())).toEqual(['max_slots', 'updated_at'])
  })
})

describe('INVENTORY_BINDING.read', () => {
  it('max_slots를 숫자로 읽고 수정 시각을 돌려준다', async () => {
    const snapshot = await INVENTORY_BINDING.read(db.client)
    expect(snapshot).toEqual({ values: { max_slots: 10 }, updatedAt: INVENTORY_ROW_STAMP })
    expect(db.selects).toEqual([INVENTORY_SELECT])
  })

  it('저장된 값이 코드 기본값(50)과 달라도, 비정상이어도 기본값으로 바꿔 보이지 않고 그대로 읽는다', async () => {
    db.tables.inventory_policy = [inventoryPolicyRow({ max_slots: 7 })]
    expect((await INVENTORY_BINDING.read(db.client)).values.max_slots).toBe(7)
    db.tables.inventory_policy = [inventoryPolicyRow({ max_slots: '12' })]
    expect((await INVENTORY_BINDING.read(db.client)).values.max_slots).toBe(12)
  })

  it('행이 없거나 숫자가 아니거나 조회가 실패하면 던진다', async () => {
    db.tables.inventory_policy = []
    await expect(INVENTORY_BINDING.read(db.client)).rejects.toThrow('id=1 행이 없음')

    db.tables.inventory_policy = [inventoryPolicyRow({ max_slots: null })]
    await expect(INVENTORY_BINDING.read(db.client)).rejects.toThrow('max_slots')

    db.readErrors.inventory_policy = 'boom'
    await expect(INVENTORY_BINDING.read(db.client)).rejects.toThrow('인벤토리 정책 조회 실패: boom')
  })

  it('읽기만 한다(RPC와 쓰기 호출이 없다)', async () => {
    await INVENTORY_BINDING.read(db.client)
    expect(db.rpcCalls).toEqual([])
    expect(db.calls).toEqual(['inventory_policy.select'])
  })
})

describe('INVENTORY_BINDING.write', () => {
  it('수정 시각을 다시 확인한 뒤 RPC(p_max_slots)를 부르고, RPC가 올린 수정 시각을 다시 읽어 돌려준다', async () => {
    const res = await write({ max_slots: 60 })

    expect(res).toEqual({ ok: true, updatedAt: INVENTORY_RPC_STAMP })
    expect(db.rpcCalls).toEqual([{ name: 'set_inventory_max_slots', args: { p_max_slots: 60 } }])
    expect(db.calls).toEqual(['inventory_policy.select', 'rpc.set_inventory_max_slots', 'inventory_policy.select'])
    // 기존 유저 전원과 정책 행이 함께 바뀐다(RPC의 일). 표를 직접 갱신하지 않는다
    expect(inventoryMaxSlots()).toEqual([60, 60, 60])
    expect(policyRow()).toMatchObject({ max_slots: 60, updated_at: INVENTORY_RPC_STAMP })
    expect(db.updates).toEqual([])
  })

  it('수정 시각이 다르면 conflict이고 RPC를 부르지 않는다', async () => {
    const res = await write({ max_slots: 60 }, '2026-10-21T00:00:00+00:00')
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect(db.rpcCalls).toEqual([])
    expect(inventoryMaxSlots()).toEqual([10, 10, 10])
    expect(policyRow()).toMatchObject({ max_slots: 10, updated_at: INVENTORY_ROW_STAMP })
  })

  it('새 최대치보다 많은 아이템을 가진 유저가 있으면 [현상-원인-해결책] 문장의 rejected이고 아무것도 바뀌지 않는다', async () => {
    db.tables.inventory = [...inventoryRows(2, 4, 10), { user_id: 'user-9', used_slots: 8, max_slots: 10 }]
    const res = await write({ max_slots: 5 })

    expect(res).toEqual({
      ok: false,
      reason: 'rejected',
      message:
        '인벤토리 최대치가 저장되지 않았어요. 1명의 유저가 이미 5개보다 많은 아이템을 보유하고 있어 적용할 수 없습니다. 더 큰 값을 입력하거나, 해당 유저의 아이템을 정리한 뒤 다시 저장해 주세요.',
    })
    expect(inventoryMaxSlots()).toEqual([10, 10, 10])
    expect(policyRow()).toMatchObject({ max_slots: 10, updated_at: INVENTORY_ROW_STAMP })
    // 수정 시각을 다시 읽지 않는다(RPC가 거절했다)
    expect(db.calls).toEqual(['inventory_policy.select', 'rpc.set_inventory_max_slots'])
  })

  it('거절 문장은 RPC가 센 유저 수와 새 최대치를 그대로 싣는다', () => {
    expect(inventoryOverLimitMessage('3명의 유저가 이미 5개보다 많은 아이템을 보유하고 있어 적용할 수 없습니다.')).toBe(
      '인벤토리 최대치가 저장되지 않았어요. 3명의 유저가 이미 5개보다 많은 아이템을 보유하고 있어 적용할 수 없습니다. 더 큰 값을 입력하거나, 해당 유저의 아이템을 정리한 뒤 다시 저장해 주세요.'
    )
  })

  it('RPC가 1 미만이라고 거절하면(INVALID) 값을 확인하라는 문장의 rejected다', async () => {
    const res = await write({ max_slots: 0 })
    expect(res).toEqual({ ok: false, reason: 'rejected', message: INVENTORY_INVALID_MESSAGE })
    expect(INVENTORY_INVALID_MESSAGE).toBe('인벤토리 최대치가 저장되지 않았어요. 값이 1 이상의 정수가 아니에요. 값을 확인하고 다시 저장해 주세요.')
    expect(policyRow().max_slots).toBe(10)
  })

  it('그 밖의 DB 오류는 error로 돌려주고 원문은 message에만 둔다', async () => {
    db.rpcHandlers.set_inventory_max_slots = () => ({ data: null, error: { message: SECRET_DB_MESSAGE } })
    const res = await write({ max_slots: 60 })
    expect(res).toEqual({ ok: false, reason: 'error', message: SECRET_DB_MESSAGE })
  })

  it('수정 시각을 다시 확인하다 읽기에 실패하면 error이고 RPC를 부르지 않는다', async () => {
    db.readErrors.inventory_policy = 'boom'
    const res = await write({ max_slots: 60 })
    expect(res).toMatchObject({ ok: false, reason: 'error' })
    expect(db.rpcCalls).toEqual([])
  })

  it('저장 뒤 수정 시각을 읽지 못해도 값은 이미 바뀌었으므로 ok이고, 이번 저장의 시각으로 답하며 로그를 남긴다', async () => {
    db.rpcHandlers.set_inventory_max_slots = () => {
      db.readErrors.inventory_policy = 'boom'
      return { data: 3, error: null }
    }
    const res = await write({ max_slots: 60 })
    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('저장 뒤 수정 시각을 읽지 못함'), '인벤토리 정책 조회 실패: boom')
  })

  it('바꿀 칸이 없으면 error이고 아무것도 하지 않는다', async () => {
    expect(await write({})).toEqual({ ok: false, reason: 'error', message: '바꿀 칸이 없음' })
    expect(db.calls).toEqual([])
  })
})

describe('인벤토리 구역 저장 (공용 저장을 지난다)', () => {
  it('최대치를 바꾸면 RPC로 저장되고 max_slots 칸 이름으로 이력에 남으며 확률 안내 반영 표시는 없다', async () => {
    const out = await save({ max_slots: 60 }, { note: '시즌 확장' })

    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.changes).toEqual([{ field: 'max_slots', from: 10, to: 60 }])
    expect(out.affectsDisclosure).toBe(false)
    expect(out.values).toEqual({ max_slots: 60 })
    expect(out.updatedAt).toBe(INVENTORY_RPC_STAMP)
    expect(db.rpcCalls).toEqual([{ name: 'set_inventory_max_slots', args: { p_max_slots: 60 } }])
    expect(inventoryMaxSlots()).toEqual([60, 60, 60])
    expect(historyRows()).toHaveLength(1)
    expect(historyRows()[0]).toMatchObject({
      section_key: 'inventory',
      changes: [{ field: 'max_slots', from: 10, to: 60 }],
      note: '시즌 확장',
      affects_disclosure: false,
      changed_by: ACTOR,
    })
  })

  it('0 이하·소수·숫자가 아닌 값·정수 한계 초과는 RPC를 부르기 전에 막히고 이유가 붙는다', async () => {
    for (const bad of [0, -3, 1.5, INTEGER_MAX + 1, '60']) {
      const out = await save({ max_slots: bad })
      expect(out, String(bad)).toMatchObject({ ok: false, status: 400, error: BALANCE_INVALID_MESSAGE })
      if (!out.ok) expect(Object.keys(out.fieldErrors ?? {}), String(bad)).toEqual(['max_slots'])
    }
    const zero = await save({ max_slots: 0 })
    if (!zero.ok) expect(zero.fieldErrors?.max_slots).toBe('1 이상의 정수로 입력해 주세요.')
    expect(db.rpcCalls).toEqual([])
    expect(historyRows()).toEqual([])
    expect(inventoryMaxSlots()).toEqual([10, 10, 10])
  })

  it('최소값 1은 저장된다', async () => {
    db.tables.inventory = inventoryRows(2, 0, 10)
    expect((await save({ max_slots: 1 })).ok).toBe(true)
    expect(inventoryMaxSlots()).toEqual([1, 1])
  })

  it('이 구역의 칸이 아닌 값은 «알 수 없는 칸»으로 거절한다', async () => {
    const out = await save({ max_slots: 60, used_slots: 1 })
    expect(out).toMatchObject({ ok: false, status: 400 })
    if (!out.ok) expect(out.fieldErrors).toEqual({ used_slots: '알 수 없는 칸이에요.' })
    expect(db.rpcCalls).toEqual([])
  })

  it('바뀐 값이 없으면 400이고 RPC도 이력도 없다', async () => {
    expect(await save({ max_slots: 10 })).toMatchObject({ ok: false, status: 400, error: BALANCE_NO_CHANGE_MESSAGE })
    expect(db.rpcCalls).toEqual([])
    expect(historyRows()).toEqual([])
  })

  it('화면이 본 수정 시각이 낡았으면 409이고 RPC를 부르지 않는다', async () => {
    const out = await save({ max_slots: 60 }, { expectedUpdatedAt: '2026-10-21T00:00:00+00:00' })
    expect(out).toMatchObject({ ok: false, status: 409, error: BALANCE_CONFLICT_MESSAGE })
    expect(db.rpcCalls).toEqual([])
    expect(historyRows()).toEqual([])
  })

  it('새 최대치보다 많이 가진 유저가 있으면 400이고 그 문장이 그대로 나가며, 이력도 칸별 문장도 없다', async () => {
    db.tables.inventory = [...inventoryRows(2, 4, 10), { user_id: 'user-9', used_slots: 8, max_slots: 10 }]
    const out = await save({ max_slots: 5 })

    expect(out).toEqual({
      ok: false,
      status: 400,
      error:
        '인벤토리 최대치가 저장되지 않았어요. 1명의 유저가 이미 5개보다 많은 아이템을 보유하고 있어 적용할 수 없습니다. 더 큰 값을 입력하거나, 해당 유저의 아이템을 정리한 뒤 다시 저장해 주세요.',
    })
    expect(historyRows()).toEqual([])
    expect(inventoryMaxSlots()).toEqual([10, 10, 10])
    expect(policyRow()).toMatchObject({ max_slots: 10, updated_at: INVENTORY_ROW_STAMP })
  })

  it('그 밖의 DB 오류는 500이고 응답에 DB 오류 원문이 없으며 이력이 없다', async () => {
    db.rpcHandlers.set_inventory_max_slots = () => ({ data: null, error: { message: SECRET_DB_MESSAGE } })
    const out = await save({ max_slots: 60 })
    expect(out).toMatchObject({ ok: false, status: 500, error: BALANCE_SAVE_FAILED_MESSAGE })
    expect(JSON.stringify(out)).not.toContain('secret detail')
    expect(console.error).toHaveBeenCalledWith('[admin/balance] inventory 저장 실패:', SECRET_DB_MESSAGE)
    expect(historyRows()).toEqual([])
  })

  it('이력을 쓰지 못하면 RPC로 이전 값을 되돌리고 500이다. 단, 수정 시각은 읽었던 때로 되돌리지 못한다(알려진 한계)', async () => {
    db.writeErrors.balance_setting_changes = SECRET_DB_MESSAGE
    const out = await save({ max_slots: 60 })

    expect(out).toMatchObject({ ok: false, status: 500, error: BALANCE_HISTORY_FAILED_MESSAGE })
    expect(JSON.stringify(out)).not.toContain('secret detail')
    expect(db.rpcCalls.map((call) => call.args)).toEqual([{ p_max_slots: 60 }, { p_max_slots: 10 }])
    expect(inventoryMaxSlots()).toEqual([10, 10, 10])
    expect(policyRow().max_slots).toBe(10)
    // 한계: 값은 돌아왔지만 수정 시각은 RPC가 올린 시각이다 → 화면의 시각이 낡아 다음 저장이 한 번 409다
    expect(policyRow().updated_at).toBe(INVENTORY_RPC_STAMP)
    expect(policyRow().updated_at).not.toBe(INVENTORY_ROW_STAMP)
    const next = await save({ max_slots: 60 })
    expect(next).toMatchObject({ ok: false, status: 409, error: BALANCE_CONFLICT_MESSAGE })
    expect(historyRows()).toEqual([])
  })

  it('이력을 못 쓴 뒤 되돌리기가 거절되면(그사이 유저가 늘어 이전 값이 안 맞음) 되돌리기 실패의 500이고 로그에 거절 문장이 남는다', async () => {
    db.writeErrors.balance_setting_changes = SECRET_DB_MESSAGE
    const real = db.rpcHandlers.set_inventory_max_slots
    db.rpcHandlers.set_inventory_max_slots = (args) => {
      const res = real(args)
      db.tables.inventory[0].used_slots = 30 // 첫 RPC 직후 한 유저가 10개보다 많이 채움
      return res
    }
    const out = await save({ max_slots: 60 })

    expect(out).toMatchObject({ ok: false, status: 500, error: BALANCE_ROLLBACK_FAILED_MESSAGE })
    expect(JSON.stringify(out)).not.toContain('secret detail')
    expect(policyRow().max_slots).toBe(60)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('되돌리기도 실패'),
      expect.any(String),
      expect.stringContaining('1명의 유저가 이미 10개보다 많은 아이템을 보유하고 있어')
    )
  })
})
