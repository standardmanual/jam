/**
 * 잼 구역 연결 (티켓 20261022_1132 1회) — `jam_policy` id=1 행을 읽고 쓰는 부분. 가짜 표로 지키는 것:
 * - 읽기: 가공하지 않은 행에서 여섯 칸을 숫자로 읽는다(NUMERIC 문자열 포함). 행이 없거나 숫자가 아닌 칸이 있으면 던진다(기본값으로 바꿔 보이지 않는다)
 * - 읽기에 넘기는 칸 목록이 `JAM_BALANCE_KEYS`와 `updated_at`뿐이다(동기화·잠긴 아이템 배지 칸은 읽지도 쓰지도 않는다)
 * - 쓰기: id=1이고 수정 시각이 같을 때만 바뀐 칸과 `updated_at`을 갱신한다. 0행이면 conflict, DB 오류는 error
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

import { JAM_BALANCE_KEYS, JAM_BINDING, JAM_SELECT } from '../jam'
import { createFakeDb, jamPolicyRow, JAM_ROW_STAMP, type FakeDb } from './fakeDb'

let db: FakeDb

beforeEach(() => {
  db = createFakeDb({ jam_policy: [jamPolicyRow()] })
})

describe('JAM_BINDING.read', () => {
  it('여섯 칸을 숫자로 읽고 수정 시각을 돌려준다', async () => {
    const snapshot = await JAM_BINDING.read(db.client)
    expect(snapshot).toEqual({
      values: {
        intensity_light: 1,
        intensity_normal: 2,
        intensity_hard: 3,
        mass_earn_alert_multiplier: 3,
        mass_earn_alert_weeks: 4,
        mass_earn_alert_no_history_amount: 1200,
      },
      updatedAt: JAM_ROW_STAMP,
    })
    expect(db.selects).toEqual([JAM_SELECT])
    expect(Object.keys(snapshot.values)).toEqual([...JAM_BALANCE_KEYS])
  })

  it('저장된 값이 비정상이어도 기본값으로 바꿔 보이지 않고 그대로 읽는다', async () => {
    db.tables.jam_policy = [jamPolicyRow({ intensity_hard: 9, mass_earn_alert_multiplier: '2.50' })]
    const snapshot = await JAM_BINDING.read(db.client)
    expect(snapshot.values.intensity_hard).toBe(9)
    expect(snapshot.values.mass_earn_alert_multiplier).toBe(2.5)
  })

  it('행이 없거나 숫자가 아닌 칸이 있거나 조회가 실패하면 던진다', async () => {
    db.tables.jam_policy = []
    await expect(JAM_BINDING.read(db.client)).rejects.toThrow('id=1 행이 없음')

    db.tables.jam_policy = [jamPolicyRow({ mass_earn_alert_weeks: null })]
    await expect(JAM_BINDING.read(db.client)).rejects.toThrow('mass_earn_alert_weeks')

    db.readErrors.jam_policy = 'boom'
    await expect(JAM_BINDING.read(db.client)).rejects.toThrow('잼 정책 조회 실패: boom')
  })
})

describe('JAM_BINDING.write', () => {
  it('수정 시각이 같으면 넘긴 칸과 수정 시각만 갱신한다', async () => {
    const res = await JAM_BINDING.write(db.client, {
      values: { intensity_light: 5 },
      expectedUpdatedAt: JAM_ROW_STAMP,
      nextUpdatedAt: '2026-10-22T02:00:00.000Z',
    })
    expect(res).toEqual({ ok: true, updatedAt: '2026-10-22T02:00:00.000Z' })
    expect(db.updates).toEqual([{ intensity_light: 5, updated_at: '2026-10-22T02:00:00.000Z' }])
    expect(db.tables.jam_policy[0]).toMatchObject({ intensity_light: 5, intensity_normal: 2 })
  })

  it('수정 시각이 다르면 conflict이고 아무것도 바꾸지 않는다', async () => {
    const res = await JAM_BINDING.write(db.client, {
      values: { intensity_light: 5 },
      expectedUpdatedAt: '2026-10-21T00:00:00+00:00',
      nextUpdatedAt: '2026-10-22T02:00:00.000Z',
    })
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect(db.tables.jam_policy[0].intensity_light).toBe(1)
  })

  it('이 구역의 칸이 아닌 값은 본문에 있어도 쓰지 않는다', async () => {
    await JAM_BINDING.write(db.client, {
      values: { intensity_light: 5, sync_item_guaranteed: 9, locked_min_common: 1 },
      expectedUpdatedAt: JAM_ROW_STAMP,
      nextUpdatedAt: '2026-10-22T02:00:00.000Z',
    })
    expect(Object.keys(db.updates[0]).sort()).toEqual(['intensity_light', 'updated_at'])
    expect(db.tables.jam_policy[0].sync_item_guaranteed).toBe(1)
  })

  it('DB 오류는 error로 돌려준다', async () => {
    db.writeErrors.jam_policy = 'boom'
    const res = await JAM_BINDING.write(db.client, {
      values: { intensity_light: 5 },
      expectedUpdatedAt: JAM_ROW_STAMP,
      nextUpdatedAt: '2026-10-22T02:00:00.000Z',
    })
    expect(res).toEqual({ ok: false, reason: 'error', message: 'boom' })
  })
})
