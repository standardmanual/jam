/**
 * 동기화 구역 연결 (티켓 20261022_1132 2회) — `jam_policy` id=1 행의 동기화 칸 열한 개. 가짜 표로 지키는 것:
 * - 칸 정의: 열한 칸이 확률 안내가 읽는 칸 목록(`JAM_COLUMNS`)과 같고 모두 «확률 안내에 반영되는 칸»이다. 기본값은 `DEFAULT_JAM_POLICY`와 같고 범위는 DB CHECK와 같다
 *   (개수·기회는 0 허용, 확률 나눗수·보정 횟수는 1 이상, 확률은 0~1·소수 셋째 자리, 등급 확률은 합 100을 맞출 네 칸)
 * - 읽기: 가공하지 않은 행에서 열한 칸을 숫자로 읽는다(NUMERIC 문자열 포함). 잼 칸·잠긴 아이템 배지 최소값은 읽지도 쓰지도 않는다
 * - 쓰기: id=1이고 수정 시각이 같을 때만 넘긴 칸을 갱신한다. 0행이면 conflict
 * - 공용 저장(`saveBalanceSection`)을 지나면: 등급 확률 합이 100이 아니면 400이고 쓰지 않는다, 0개(확정 0, 보너스 0)도 저장된다, 이력에 확률 안내 반영 표시가 남는다,
 *   이력을 못 쓰면 이전 값과 수정 시각으로 되돌린다, 잼 칸은 이 구역에서 거절한다
 * - «모두 0» 경고는 확정 개수 두 칸과 보너스 기회가 모두 0일 때만 켜지고 저장을 막지 않는다
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

import { DEFAULT_JAM_POLICY, VALIDATORS } from '@/lib/jam/policy'
import { JAM_COLUMNS } from '@/lib/probability/disclosure'
import { activeZeroWarnings, checkFieldValue, draftFromValues, groupSums } from '../fields'
import { SYNC_BALANCE_KEYS, SYNC_BINDING, SYNC_FIELDS, SYNC_NO_ITEM_WARNING, SYNC_RARITY_KEYS, SYNC_SELECT } from '../sync'
import { BALANCE_INVALID_MESSAGE, BALANCE_HISTORY_FAILED_MESSAGE, saveBalanceSection } from '../save'
import { INTEGER_MAX } from '../types'
import { createFakeDb, jamPolicyRow, JAM_ROW_STAMP, type FakeDb } from './fakeDb'

const ACTOR = '11111111-1111-4111-8111-111111111111'
const byKey = Object.fromEntries(SYNC_FIELDS.map((def) => [def.key, def]))

let db: FakeDb

beforeEach(() => {
  db = createFakeDb({ jam_policy: [jamPolicyRow()], balance_setting_changes: [], users: [{ id: ACTOR, username: 'karina' }] })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const syncRow = () => db.tables.jam_policy[0]
const historyRows = () => db.tables.balance_setting_changes
const save = (values: unknown, extra: { note?: unknown; expectedUpdatedAt?: unknown } = {}) =>
  saveBalanceSection(db.client, { binding: SYNC_BINDING, values, expectedUpdatedAt: JAM_ROW_STAMP, actor: ACTOR, ...extra })

describe('동기화 칸 정의', () => {
  it('열한 칸이고 화면 순서가 SYNC_BALANCE_KEYS와 같다', () => {
    expect(SYNC_FIELDS.map((def) => def.key)).toEqual([...SYNC_BALANCE_KEYS])
    expect(SYNC_BALANCE_KEYS).toHaveLength(11)
    expect(new Set(SYNC_BALANCE_KEYS).size).toBe(11)
  })

  it('확률 안내가 읽는 jam_policy 칸 목록(JAM_COLUMNS)과 칸이 정확히 같다', () => {
    expect([...SYNC_BALANCE_KEYS].sort()).toEqual([...JAM_COLUMNS].sort())
  })

  it('모든 칸이 확률 안내에 반영되는 칸이다(목록에서 가져온다)', () => {
    for (const def of SYNC_FIELDS) expect(def.affectsDisclosure, def.key).toBe(true)
  })

  it('기본값이 DEFAULT_JAM_POLICY와 같다', () => {
    for (const def of SYNC_FIELDS) expect(def.defaultValue, def.key).toBe(DEFAULT_JAM_POLICY[def.key as keyof typeof DEFAULT_JAM_POLICY])
  })

  it('읽기에 넘기는 칸 목록이 SYNC_BALANCE_KEYS와 updated_at뿐이다(잼 칸·잠긴 아이템 배지 칸이 없다)', () => {
    expect(SYNC_SELECT.split(',').map((column) => column.trim())).toEqual([...SYNC_BALANCE_KEYS, 'updated_at'])
    expect(SYNC_SELECT).not.toContain('intensity_')
    expect(SYNC_SELECT).not.toContain('locked_min_')
    expect(SYNC_SELECT).not.toContain('mass_earn_alert')
  })

  it('등급 확률 네 칸만 합 100 묶음이다', () => {
    expect(SYNC_FIELDS.filter((def) => def.sumTo === 100).map((def) => def.key)).toEqual([...SYNC_RARITY_KEYS])
    expect(SYNC_FIELDS.filter((def) => def.sumTo !== undefined).every((def) => def.group === '등급 확률')).toBe(true)
  })

  it('두 구역이 함께 쓰는 보정과 잠길 확률은 같은 묶음 «캡슐과 함께 쓰는 값»이다', () => {
    expect(byKey.common_streak_threshold.group).toBe('캡슐과 함께 쓰는 값')
    expect(byKey.locked_roll_probability.group).toBe('캡슐과 함께 쓰는 값')
  })

  it('0개를 허용한다: 확정 개수(일반·등산)와 보너스 기회는 0이 통과하고, 나눗수·보정 횟수는 0이 거절된다', () => {
    for (const key of ['sync_item_guaranteed', 'sync_item_guaranteed_hiking', 'sync_item_bonus_rolls']) {
      expect(checkFieldValue(byKey[key], 0), key).toBeNull()
      expect(checkFieldValue(byKey[key], -1), key).not.toBeNull()
      expect(checkFieldValue(byKey[key], 1.5), key).not.toBeNull()
    }
    expect(checkFieldValue(byKey.sync_item_bonus_jam_divisor, 0)).not.toBeNull()
    expect(checkFieldValue(byKey.sync_item_bonus_jam_divisor, 1)).toBeNull()
    expect(checkFieldValue(byKey.common_streak_threshold, 0)).not.toBeNull()
    expect(checkFieldValue(byKey.common_streak_threshold, INTEGER_MAX + 1)).not.toBeNull()
  })

  it('범위 밖은 거절한다: 확률은 0~1·소수 셋째 자리, 등급 확률은 0~100', () => {
    for (const key of ['sync_item_bonus_max_probability', 'locked_roll_probability']) {
      expect(checkFieldValue(byKey[key], 0), key).toBeNull()
      expect(checkFieldValue(byKey[key], 1), key).toBeNull()
      expect(checkFieldValue(byKey[key], 0.255), key).toBeNull()
      expect(checkFieldValue(byKey[key], 1.001), key).not.toBeNull()
      expect(checkFieldValue(byKey[key], -0.1), key).not.toBeNull()
      expect(checkFieldValue(byKey[key], 0.2555), key).not.toBeNull()
    }
    for (const key of SYNC_RARITY_KEYS) {
      expect(checkFieldValue(byKey[key], 0), key).toBeNull()
      expect(checkFieldValue(byKey[key], 2.5), key).toBeNull()
      expect(checkFieldValue(byKey[key], 100), key).toBeNull()
      expect(checkFieldValue(byKey[key], 100.5), key).not.toBeNull()
      expect(checkFieldValue(byKey[key], -1), key).not.toBeNull()
    }
  })

  it('칸 정의를 통과하는 값은 lib/jam/policy.ts의 VALIDATORS도 통과한다(DB CHECK와 같은 기준)', () => {
    const samples = [-1, 0, 0.25, 0.5, 1, 1.001, 2, 2.5, 84, 100, 600, INTEGER_MAX, INTEGER_MAX + 1]
    for (const def of SYNC_FIELDS) {
      for (const n of samples) {
        if (checkFieldValue(def, n) === null) {
          expect(VALIDATORS[def.key as keyof typeof VALIDATORS](n), `${def.key}=${n}`).toBe(true)
        }
      }
    }
  })
})

describe('동기화 «모두 0» 경고', () => {
  const draftOf = (overrides: Record<string, number>) =>
    draftFromValues(SYNC_FIELDS, { ...Object.fromEntries(SYNC_BALANCE_KEYS.map((key) => [key, DEFAULT_JAM_POLICY[key]])), ...overrides })

  it('확정 개수 두 칸과 보너스 기회가 모두 0일 때만 켜진다', () => {
    const zero = { sync_item_guaranteed: 0, sync_item_guaranteed_hiking: 0, sync_item_bonus_rolls: 0 }
    expect(activeZeroWarnings(SYNC_BINDING.zeroWarnings, draftOf(zero))).toEqual([SYNC_NO_ITEM_WARNING])
    expect(activeZeroWarnings(SYNC_BINDING.zeroWarnings, draftOf({ ...zero, sync_item_bonus_rolls: 1 }))).toEqual([])
    expect(activeZeroWarnings(SYNC_BINDING.zeroWarnings, draftOf({ ...zero, sync_item_guaranteed_hiking: 2 }))).toEqual([])
    expect(activeZeroWarnings(SYNC_BINDING.zeroWarnings, draftOf({}))).toEqual([])
  })

  it('경고 문장은 «아이템 배지가 나오지 않아요»로 시작하고 저장할 수 있다고 알린다', () => {
    expect(SYNC_NO_ITEM_WARNING.startsWith('아이템 배지가 나오지 않아요.')).toBe(true)
    expect(SYNC_NO_ITEM_WARNING).toContain('그대로 저장할 수 있어요')
  })

  it('등급 확률 합계 묶음은 기본값에서 100이다', () => {
    expect(groupSums(SYNC_FIELDS, draftOf({}))).toEqual([{ title: '등급 확률', target: 100, unit: '%', sum: 100, ok: true, message: null }])
  })
})

describe('SYNC_BINDING.read', () => {
  it('열한 칸을 숫자로 읽고(NUMERIC 문자열 포함) 수정 시각을 돌려준다', async () => {
    const snapshot = await SYNC_BINDING.read(db.client)
    expect(snapshot.updatedAt).toBe(JAM_ROW_STAMP)
    expect(snapshot.values).toEqual({
      sync_item_guaranteed: 1,
      sync_item_guaranteed_hiking: 2,
      sync_item_bonus_rolls: 2,
      sync_item_bonus_jam_divisor: 600,
      sync_item_bonus_max_probability: 0.25,
      sync_rarity_common: 84,
      sync_rarity_rare: 13,
      sync_rarity_epic: 2.5,
      sync_rarity_mystic: 0.5,
      common_streak_threshold: 10,
      locked_roll_probability: 0.25,
    })
    expect(db.selects).toEqual([SYNC_SELECT])
  })

  it('저장된 값이 비정상이어도 기본값으로 바꿔 보이지 않고 그대로 읽는다', async () => {
    db.tables.jam_policy = [jamPolicyRow({ sync_rarity_common: '90.000' })]
    expect((await SYNC_BINDING.read(db.client)).values.sync_rarity_common).toBe(90)
  })

  it('행이 없거나 숫자가 아닌 칸이 있거나 조회가 실패하면 던진다', async () => {
    db.tables.jam_policy = []
    await expect(SYNC_BINDING.read(db.client)).rejects.toThrow('id=1 행이 없음')
    db.tables.jam_policy = [jamPolicyRow({ common_streak_threshold: null })]
    await expect(SYNC_BINDING.read(db.client)).rejects.toThrow('common_streak_threshold')
    db.readErrors.jam_policy = 'boom'
    await expect(SYNC_BINDING.read(db.client)).rejects.toThrow('동기화 정책 조회 실패: boom')
  })
})

describe('SYNC_BINDING.write', () => {
  it('수정 시각이 같으면 넘긴 칸과 수정 시각만 갱신한다', async () => {
    const res = await SYNC_BINDING.write(db.client, {
      values: { sync_item_guaranteed: 0 },
      expectedUpdatedAt: JAM_ROW_STAMP,
      nextUpdatedAt: '2026-10-22T02:00:00.000Z',
    })
    expect(res).toEqual({ ok: true, updatedAt: '2026-10-22T02:00:00.000Z' })
    expect(db.updates).toEqual([{ sync_item_guaranteed: 0, updated_at: '2026-10-22T02:00:00.000Z' }])
  })

  it('수정 시각이 다르면 conflict이고 아무것도 바꾸지 않는다', async () => {
    const res = await SYNC_BINDING.write(db.client, {
      values: { sync_item_guaranteed: 0 },
      expectedUpdatedAt: '2026-10-21T00:00:00+00:00',
      nextUpdatedAt: '2026-10-22T02:00:00.000Z',
    })
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect(syncRow().sync_item_guaranteed).toBe(1)
  })

  it('이 구역의 칸이 아닌 값(잼 칸·잠긴 아이템 배지 최소값)은 본문에 있어도 쓰지 않는다', async () => {
    await SYNC_BINDING.write(db.client, {
      values: { sync_item_guaranteed: 0, intensity_light: 9, locked_min_common: 1 },
      expectedUpdatedAt: JAM_ROW_STAMP,
      nextUpdatedAt: '2026-10-22T02:00:00.000Z',
    })
    expect(Object.keys(db.updates[0]).sort()).toEqual(['sync_item_guaranteed', 'updated_at'])
    expect(syncRow().intensity_light).toBe(1)
    expect(syncRow().locked_min_common).toBe(30)
  })

  it('DB 오류는 error로 돌려준다', async () => {
    db.writeErrors.jam_policy = 'boom'
    const res = await SYNC_BINDING.write(db.client, {
      values: { sync_item_guaranteed: 0 },
      expectedUpdatedAt: JAM_ROW_STAMP,
      nextUpdatedAt: '2026-10-22T02:00:00.000Z',
    })
    expect(res).toEqual({ ok: false, reason: 'error', message: 'boom' })
  })
})

describe('동기화 구역 저장 (공용 저장을 지난다)', () => {
  it('등급 확률을 합 100에 맞게 바꾸면 저장되고 이력에 «확률 안내 반영» 표시가 남는다', async () => {
    const out = await save({ sync_rarity_common: 80, sync_rarity_rare: 17 }, { note: '이벤트 주간' })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.affectsDisclosure).toBe(true)
    expect(out.changes).toEqual([
      { field: 'sync_rarity_common', from: 84, to: 80 },
      { field: 'sync_rarity_rare', from: 13, to: 17 },
    ])
    expect(syncRow()).toMatchObject({ sync_rarity_common: 80, sync_rarity_rare: 17, sync_rarity_epic: '2.500' })
    expect(historyRows()).toHaveLength(1)
    expect(historyRows()[0]).toMatchObject({
      section_key: 'sync',
      affects_disclosure: true,
      note: '이벤트 주간',
      changed_by: ACTOR,
      changes: [
        { field: 'sync_rarity_common', from: 84, to: 80 },
        { field: 'sync_rarity_rare', from: 13, to: 17 },
      ],
    })
  })

  it('등급 확률 합이 100이 아니면 400이고 네 칸 모두에 같은 문장이 붙으며 아무것도 쓰지 않는다', async () => {
    const out = await save({ sync_rarity_common: 80 })
    expect(out).toMatchObject({ ok: false, status: 400, error: BALANCE_INVALID_MESSAGE })
    if (out.ok) return
    expect(Object.keys(out.fieldErrors ?? {}).sort()).toEqual([...SYNC_RARITY_KEYS].sort())
    expect(new Set(Object.values(out.fieldErrors ?? {}))).toEqual(new Set(['등급 확률 합이 100이어야 해요. 지금은 96이에요.']))
    expect(db.updates).toEqual([])
    expect(historyRows()).toEqual([])
  })

  it('소수 셋째 자리로 합을 맞추면 부동소수 오차가 있어도 통과한다(2.501 + 0.499)', async () => {
    const out = await save({ sync_rarity_epic: 2.501, sync_rarity_mystic: 0.499 })
    expect(out.ok).toBe(true)
  })

  it('소수 셋째 자리를 넘는 등급 확률은 칸 오류로 거절한다', async () => {
    const out = await save({ sync_rarity_mystic: 0.5004 })
    expect(out).toMatchObject({ ok: false, status: 400 })
  })

  it('0개도 저장된다: 확정 개수 0, 보너스 기회 0 (경고만 보이고 막지 않는다)', async () => {
    const out = await save({ sync_item_guaranteed: 0, sync_item_guaranteed_hiking: 0, sync_item_bonus_rolls: 0 })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.values).toMatchObject({ sync_item_guaranteed: 0, sync_item_guaranteed_hiking: 0, sync_item_bonus_rolls: 0 })
    expect(syncRow()).toMatchObject({ sync_item_guaranteed: 0, sync_item_guaranteed_hiking: 0, sync_item_bonus_rolls: 0 })
    expect(historyRows()[0]).toMatchObject({ affects_disclosure: true })
  })

  it('범위 밖 값은 칸별 문장과 함께 400이다', async () => {
    const out = await save({ sync_item_bonus_jam_divisor: 0, locked_roll_probability: 1.5, common_streak_threshold: 0, sync_item_guaranteed: -1 })
    expect(out).toMatchObject({ ok: false, status: 400, error: BALANCE_INVALID_MESSAGE })
    if (out.ok) return
    expect(Object.keys(out.fieldErrors ?? {}).sort()).toEqual(
      ['common_streak_threshold', 'locked_roll_probability', 'sync_item_bonus_jam_divisor', 'sync_item_guaranteed'].sort()
    )
    expect(db.updates).toEqual([])
  })

  it('잼 구역의 칸과 잠긴 아이템 배지 최소값은 이 구역에서 «알 수 없는 칸»으로 거절한다', async () => {
    const out = await save({ intensity_light: 5, locked_min_common: 1 })
    expect(out).toMatchObject({ ok: false, status: 400 })
    if (out.ok) return
    expect(out.fieldErrors).toEqual({ intensity_light: '알 수 없는 칸이에요.', locked_min_common: '알 수 없는 칸이에요.' })
    expect(db.updates).toEqual([])
  })

  it('다른 사람이 먼저 바꿨으면(수정 시각 불일치) 409다', async () => {
    const out = await save({ sync_item_guaranteed: 0 }, { expectedUpdatedAt: '2026-10-21T00:00:00+00:00' })
    expect(out).toMatchObject({ ok: false, status: 409 })
    expect(historyRows()).toEqual([])
  })

  it('이력을 쓰지 못하면 값과 수정 시각을 읽었던 때로 되돌리고 500이다', async () => {
    db.writeErrors.balance_setting_changes = 'secret relation detail'
    const out = await save({ sync_item_guaranteed: 0 })
    expect(out).toMatchObject({ ok: false, status: 500, error: BALANCE_HISTORY_FAILED_MESSAGE })
    expect(syncRow().sync_item_guaranteed).toBe(1)
    expect(syncRow().updated_at).toBe(JAM_ROW_STAMP)
  })
})
