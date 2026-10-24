/**
 * 어뷰징 구역 연결 (티켓 20261022_1134 2회) — `abusing_policy` id=1 행의 기준값 10칸. 옛 «정책 설정» 탭의 저장(`PUT /api/admin/abusing/policy` → `updateAbusingPolicy` upsert)과 같은 열을 같은 뜻으로 읽고 쓴다.
 * 가짜 표(`fakeDb.ts`, 실 DB에는 접속하지 않는다)로 지키는 것:
 * - 칸 정의: 10칸이 `AbusingPolicy`의 키 전부이고 묶음 순서(이동 감지·차량·교통수단·종목 불일치·장소 블록)와 단위·기본값(`DEFAULT_POLICY`)이 맞으며 확률 안내에 반영되지 않는다
 * - 범위: 모두 정수 1 이상, 차량 속도 필터만 20 이상(`MIN_VEHICLE_SPEED_FILTER_KMH`), 종목 불일치 두 칸은 `MISMATCH_POLICY_KEYS`와 같은 칸이다. 0·소수·정수 한계 초과는 막힌다
 * - 읽기: 가공하지 않은 행에서 10칸을 숫자로 읽는다(읽기에 넘기는 칸 목록은 10칸과 `updated_at`뿐, 옛 배율 열은 읽지 않는다). 행이 없으면 기본값과 `ABUSING_NO_ROW_STAMP`, 조회 오류·숫자가 아닌 값은 던진다
 * - 쓰기: `updated_at` 조건 갱신으로 바꾼 칸만 쓴다(옛 배율 열은 건드리지 않는다). 시각이 다르면 conflict. 행이 없던 때의 첫 저장은 update가 아니라 upsert로 행을 만든다
 * - 공용 저장(`saveBalanceSection`)을 지나면: 저장되고 칸 이름으로 이력에 남는다. 범위 밖 값은 쓰기 전에 막히고, 이력을 못 쓰면 이전 값과 수정 시각으로 되돌린다
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

import { DEFAULT_POLICY, MIN_VEHICLE_SPEED_FILTER_KMH, MISMATCH_POLICY_KEYS } from '@/lib/abusing/policy'
import {
  ABUSING_BALANCE_KEYS,
  ABUSING_BINDING,
  ABUSING_FIELDS,
  ABUSING_NO_ROW_STAMP,
  ABUSING_SECTION_ID,
  ABUSING_SELECT,
} from '../abusing'
import { checkFieldValue, draftFromValues } from '../fields'
import {
  BALANCE_CONFLICT_MESSAGE,
  BALANCE_HISTORY_FAILED_MESSAGE,
  BALANCE_INVALID_MESSAGE,
  BALANCE_NO_CHANGE_MESSAGE,
  BALANCE_SAVE_FAILED_MESSAGE,
  saveBalanceSection,
} from '../save'
import { INTEGER_MAX } from '../types'
import { ABUSING_ROW_STAMP, abusingPolicyRow, createFakeDb, type FakeDb } from './fakeDb'

const ACTOR = '11111111-1111-4111-8111-111111111111'
const NEXT = '2026-10-24T02:00:00.000Z'
const SECRET_DB_MESSAGE = 'relation "abusing_policy" violates check constraint (secret detail)'

/** 옛 섀도우밴 배율 열(DB에 남아 있고 이 구역이 읽지도 쓰지도 않는다). */
const LEGACY_RATES = {
  soft_common_rate: 1,
  soft_rare_rate: 1,
  soft_epic_rate: 0,
  soft_mystic_rate: 0,
  hard_common_rate: 1,
  hard_rare_rate: 0,
  hard_epic_rate: 0,
  hard_mystic_rate: 0,
}

let db: FakeDb

beforeEach(() => {
  db = createFakeDb({
    abusing_policy: [abusingPolicyRow(LEGACY_RATES)],
    balance_setting_changes: [],
    users: [{ id: ACTOR, username: 'karina' }],
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(console.error).mockClear()
})

const save = (values: unknown, extra: { note?: unknown; expectedUpdatedAt?: unknown } = {}) =>
  saveBalanceSection(db.client, { binding: ABUSING_BINDING, values, expectedUpdatedAt: ABUSING_ROW_STAMP, actor: ACTOR, ...extra })
const write = (values: Record<string, number>, expectedUpdatedAt: string = ABUSING_ROW_STAMP) =>
  ABUSING_BINDING.write(db.client, { values, expectedUpdatedAt, nextUpdatedAt: NEXT })
const policyRow = () => db.tables.abusing_policy[0]
const historyRows = () => db.tables.balance_setting_changes
const field = (key: string) => {
  const def = ABUSING_FIELDS.find((entry) => entry.key === key)
  if (!def) throw new Error(`칸 정의가 없음: ${key}`)
  return def
}

describe('어뷰징 칸 정의', () => {
  it('구역 키는 abusing이고 칸 10개는 AbusingPolicy의 키 전부이며 화면 순서를 따른다', () => {
    expect(ABUSING_SECTION_ID).toBe('abusing')
    expect(ABUSING_BINDING.id).toBe('abusing')
    expect(ABUSING_FIELDS.map((def) => def.key)).toEqual([...ABUSING_BALANCE_KEYS])
    expect([...ABUSING_BALANCE_KEYS]).toEqual([
      'gps_max_speed_kmh',
      'gps_daily_distance_cap_km',
      'vehicle_speed_filter_kmh',
      'transit_walk_max_speed_kmh',
      'transit_run_max_speed_kmh',
      'transit_cycling_max_speed_kmh',
      'transit_segment_min_duration_sec',
      'mismatch_run_min_speed_kmh',
      'mismatch_cycling_min_speed_kmh',
      'poi_block_hours',
    ])
    // 정책에 칸이 늘면 이 구역에도 칸을 더해야 한다(편집할 수 없는 기준값이 생기지 않는다)
    expect([...ABUSING_BALANCE_KEYS].sort()).toEqual(Object.keys(DEFAULT_POLICY).sort())
  })

  it('묶음은 이동 감지·차량·교통수단·종목 불일치·장소 블록 순서다', () => {
    const titles = ABUSING_FIELDS.map((def) => def.group).filter((group, index, all) => group !== all[index - 1])
    expect(titles).toEqual(['이동 감지', '차량', '교통수단', '종목 불일치', '장소 블록'])
    expect(ABUSING_FIELDS.filter((def) => def.group === '교통수단').map((def) => def.key)).toEqual([
      'transit_walk_max_speed_kmh',
      'transit_run_max_speed_kmh',
      'transit_cycling_max_speed_kmh',
      'transit_segment_min_duration_sec',
    ])
  })

  it('기본값은 DEFAULT_POLICY이고 단위가 있으며 확률 안내에는 반영되지 않고 합계 묶음이 없다', () => {
    for (const def of ABUSING_FIELDS) {
      expect(def.defaultValue, def.key).toBe(DEFAULT_POLICY[def.key as keyof typeof DEFAULT_POLICY])
      expect(def.affectsDisclosure, def.key).toBe(false)
      expect(def.sumTo, def.key).toBeUndefined()
      expect(def.decimals, def.key).toBe(0)
      expect(def.max, def.key).toBe(INTEGER_MAX)
      expect(def.unit, def.key).toBeTruthy()
      expect(def.label, def.key).toBeTruthy()
      expect(def.hint, def.key).toBeTruthy()
    }
    expect(field('transit_segment_min_duration_sec').unit).toBe('초')
    expect(field('poi_block_hours').unit).toBe('시간')
    expect(field('gps_daily_distance_cap_km').unit).toBe('km')
    expect(draftFromValues(ABUSING_FIELDS, {})).toEqual(Object.fromEntries(Object.entries(DEFAULT_POLICY).map(([key, value]) => [key, String(value)])))
  })

  it('읽기에 넘기는 칸 목록은 10칸과 updated_at뿐이다(옛 배율 열은 읽지 않는다)', () => {
    expect(ABUSING_SELECT.split(',').map((column) => column.trim())).toEqual([...ABUSING_BALANCE_KEYS, 'updated_at'])
  })
})

describe('어뷰징 칸의 최소값 (사용자 결정 ①)', () => {
  it('차량 속도 필터는 20 이상이다. 19는 막고 20은 통과한다', () => {
    expect(MIN_VEHICLE_SPEED_FILTER_KMH).toBe(20)
    const def = field('vehicle_speed_filter_kmh')
    expect(def.min).toBe(MIN_VEHICLE_SPEED_FILTER_KMH)
    for (const bad of [0, 1, 19]) expect(checkFieldValue(def, bad), String(bad)).toBe('20 이상의 정수로 입력해 주세요.')
    for (const good of [20, 21, 60, INTEGER_MAX]) expect(checkFieldValue(def, good), String(good)).toBeNull()
  })

  it('종목 불일치 두 칸은 lib의 MISMATCH_POLICY_KEYS와 같은 칸이고 1 이상 정수다. 0·소수는 막는다', () => {
    const mismatch = ABUSING_FIELDS.filter((def) => def.group === '종목 불일치').map((def) => def.key)
    expect(mismatch.sort()).toEqual([...MISMATCH_POLICY_KEYS].sort())
    for (const key of MISMATCH_POLICY_KEYS) {
      const def = field(key)
      expect(def.min, key).toBe(1)
      for (const bad of [0, -1, 5.5, 0.5]) expect(checkFieldValue(def, bad), `${key} ${bad}`).toBe('1 이상의 정수로 입력해 주세요.')
      for (const good of [1, 6, 10, 100000]) expect(checkFieldValue(def, good), `${key} ${good}`).toBeNull()
    }
  })

  it('나머지 칸은 정수 1 이상이다. 0·음수·소수·정수 한계 초과는 막고 1은 통과한다', () => {
    const others = ABUSING_FIELDS.filter((def) => def.key !== 'vehicle_speed_filter_kmh')
    expect(others).toHaveLength(9)
    for (const def of others) {
      expect(def.min, def.key).toBe(1)
      for (const bad of [0, -1, 1.5, INTEGER_MAX + 1]) expect(checkFieldValue(def, bad), `${def.key} ${bad}`).not.toBeNull()
      for (const good of [1, def.defaultValue, INTEGER_MAX]) expect(checkFieldValue(def, good), `${def.key} ${good}`).toBeNull()
    }
  })
})

describe('ABUSING_BINDING.read', () => {
  it('10칸을 숫자로 읽고 수정 시각을 돌려준다. 읽기에 넘기는 칸 목록은 ABUSING_SELECT다', async () => {
    const snapshot = await ABUSING_BINDING.read(db.client)
    expect(snapshot).toEqual({ values: { ...DEFAULT_POLICY }, updatedAt: ABUSING_ROW_STAMP })
    expect(db.selects).toEqual([ABUSING_SELECT])
  })

  it('저장된 값이 코드 기본값과 달라도 그대로 읽고, 문자열 숫자도 숫자로 읽는다', async () => {
    db.tables.abusing_policy = [abusingPolicyRow({ gps_max_speed_kmh: 250, poi_block_hours: '48' })]
    const { values } = await ABUSING_BINDING.read(db.client)
    expect(values.gps_max_speed_kmh).toBe(250)
    expect(values.poi_block_hours).toBe(48)
  })

  it('종목 불일치 값이 0 이하여도 기본값으로 바꿔 보이지 않고 DB 값 그대로 읽는다(정식 읽기 경로와 다른 점)', async () => {
    db.tables.abusing_policy = [abusingPolicyRow({ mismatch_run_min_speed_kmh: 0 })]
    expect((await ABUSING_BINDING.read(db.client)).values.mismatch_run_min_speed_kmh).toBe(0)
  })

  it('행이 없으면 던지지 않고 기본값과 «행 없음» 수정 시각을 돌려주며 로그를 남긴다', async () => {
    db.tables.abusing_policy = []
    const snapshot = await ABUSING_BINDING.read(db.client)
    expect(snapshot).toEqual({ values: { ...DEFAULT_POLICY }, updatedAt: ABUSING_NO_ROW_STAMP })
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('id=1 행이 없음'))
    // 공용 저장이 빈 글자를 거절하고 DB가 받는 시각 형식이라야 한다
    expect(ABUSING_NO_ROW_STAMP).not.toBe('')
    expect(Number.isNaN(Date.parse(ABUSING_NO_ROW_STAMP))).toBe(false)
  })

  it('조회가 실패하면 기본값으로 바꿔 보이지 않고 던진다', async () => {
    db.readErrors.abusing_policy = 'boom'
    await expect(ABUSING_BINDING.read(db.client)).rejects.toThrow('어뷰징 정책 조회 실패: boom')
  })

  it('숫자가 아닌 값이 있으면 어느 칸인지 적어 던진다', async () => {
    db.tables.abusing_policy = [abusingPolicyRow({ transit_run_max_speed_kmh: null })]
    await expect(ABUSING_BINDING.read(db.client)).rejects.toThrow('transit_run_max_speed_kmh')
  })

  it('읽기만 한다(쓰기 호출이 없다)', async () => {
    await ABUSING_BINDING.read(db.client)
    expect(db.calls).toEqual(['abusing_policy.select'])
  })
})

describe('ABUSING_BINDING.write', () => {
  it('바꾼 칸과 수정 시각만 조건부로 갱신하고, 옛 배율 열과 다른 칸은 건드리지 않는다', async () => {
    const res = await write({ gps_max_speed_kmh: 250, poi_block_hours: 48 })

    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.updates).toEqual([{ updated_at: NEXT, gps_max_speed_kmh: 250, poi_block_hours: 48 }])
    expect(policyRow()).toMatchObject({ ...abusingPolicyRow(LEGACY_RATES), gps_max_speed_kmh: 250, poi_block_hours: 48, updated_at: NEXT })
    expect(db.upserts).toEqual([])
  })

  it('수정 시각이 다르면 conflict이고 아무것도 바뀌지 않는다', async () => {
    const res = await write({ gps_max_speed_kmh: 250 }, '2026-10-23T00:00:00+00:00')
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect(policyRow()).toMatchObject({ gps_max_speed_kmh: 300, updated_at: ABUSING_ROW_STAMP })
  })

  it('DB 오류는 error로 돌려준다', async () => {
    db.writeErrors.abusing_policy = SECRET_DB_MESSAGE
    expect(await write({ gps_max_speed_kmh: 250 })).toEqual({ ok: false, reason: 'error', message: SECRET_DB_MESSAGE })
  })

  it('행이 없던 때의 첫 저장은 update가 아니라 upsert로 행을 만든다. 화면이 보던 10칸을 모두 싣고 바꾼 칸만 새 값이다', async () => {
    db.tables.abusing_policy = []
    const res = await write({ gps_max_speed_kmh: 250 }, ABUSING_NO_ROW_STAMP)

    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.calls).toEqual(['abusing_policy.upsert'])
    expect(db.updates).toEqual([])
    expect(db.upserts).toEqual([{ id: 1, ...DEFAULT_POLICY, gps_max_speed_kmh: 250, updated_at: NEXT }])
    expect(db.tables.abusing_policy).toEqual([{ id: 1, ...DEFAULT_POLICY, gps_max_speed_kmh: 250, updated_at: NEXT }])
  })

  it('첫 저장의 upsert가 실패하면 error다', async () => {
    db.tables.abusing_policy = []
    db.writeErrors.abusing_policy = SECRET_DB_MESSAGE
    expect(await write({ gps_max_speed_kmh: 250 }, ABUSING_NO_ROW_STAMP)).toEqual({ ok: false, reason: 'error', message: SECRET_DB_MESSAGE })
    expect(db.tables.abusing_policy).toEqual([])
  })
})

describe('어뷰징 구역 저장 (공용 저장을 지난다)', () => {
  it('값을 바꾸면 abusing_policy의 같은 열에 저장되고 칸 이름으로 이력에 남으며 확률 안내 반영 표시는 없다', async () => {
    const out = await save({ gps_max_speed_kmh: 250, vehicle_speed_filter_kmh: 45 }, { note: '임계값 조정' })

    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.changes).toEqual([
      { field: 'gps_max_speed_kmh', from: 300, to: 250 },
      { field: 'vehicle_speed_filter_kmh', from: 60, to: 45 },
    ])
    expect(out.affectsDisclosure).toBe(false)
    expect(out.values).toEqual({ ...DEFAULT_POLICY, gps_max_speed_kmh: 250, vehicle_speed_filter_kmh: 45 })
    expect(policyRow()).toMatchObject({ gps_max_speed_kmh: 250, vehicle_speed_filter_kmh: 45, transit_walk_max_speed_kmh: 20, ...LEGACY_RATES })
    expect(historyRows()).toHaveLength(1)
    expect(historyRows()[0]).toMatchObject({
      section_key: 'abusing',
      changes: out.changes,
      note: '임계값 조정',
      affects_disclosure: false,
      changed_by: ACTOR,
    })
  })

  it('10칸 모두 저장된다', async () => {
    const next = Object.fromEntries(ABUSING_BALANCE_KEYS.map((key, index) => [key, 100 + index]))
    next.vehicle_speed_filter_kmh = 90
    const out = await save(next)
    expect(out.ok).toBe(true)
    for (const [key, value] of Object.entries(next)) expect(policyRow()[key], key).toBe(value)
  })

  it('차량 속도 필터 19는 쓰기 전에 막히고 20은 저장된다', async () => {
    const low = await save({ vehicle_speed_filter_kmh: 19 })
    expect(low).toMatchObject({ ok: false, status: 400, error: BALANCE_INVALID_MESSAGE })
    if (!low.ok) expect(low.fieldErrors).toEqual({ vehicle_speed_filter_kmh: '20 이상의 정수로 입력해 주세요.' })
    expect(db.updates).toEqual([])
    expect(historyRows()).toEqual([])

    expect((await save({ vehicle_speed_filter_kmh: 20 })).ok).toBe(true)
    expect(policyRow().vehicle_speed_filter_kmh).toBe(20)
  })

  it('종목 불일치 칸의 0·소수는 쓰기 전에 막히고 1은 저장된다', async () => {
    for (const key of MISMATCH_POLICY_KEYS) {
      for (const bad of [0, 5.5, -1]) {
        const out = await save({ [key]: bad })
        expect(out, `${key} ${bad}`).toMatchObject({ ok: false, status: 400, error: BALANCE_INVALID_MESSAGE })
        if (!out.ok) expect(Object.keys(out.fieldErrors ?? {}), `${key} ${bad}`).toEqual([key])
      }
    }
    expect(db.updates).toEqual([])
    expect((await save({ mismatch_run_min_speed_kmh: 1, mismatch_cycling_min_speed_kmh: 1 })).ok).toBe(true)
    expect(policyRow()).toMatchObject({ mismatch_run_min_speed_kmh: 1, mismatch_cycling_min_speed_kmh: 1 })
  })

  it('나머지 칸의 0·소수·숫자가 아닌 값·정수 한계 초과는 쓰기 전에 막힌다', async () => {
    for (const key of ['gps_max_speed_kmh', 'gps_daily_distance_cap_km', 'transit_walk_max_speed_kmh', 'transit_segment_min_duration_sec', 'poi_block_hours']) {
      for (const bad of [0, -3, 1.5, INTEGER_MAX + 1, '72']) {
        const out = await save({ [key]: bad })
        expect(out, `${key} ${String(bad)}`).toMatchObject({ ok: false, status: 400, error: BALANCE_INVALID_MESSAGE })
      }
    }
    expect(db.updates).toEqual([])
    expect(historyRows()).toEqual([])
  })

  it('이 구역의 칸이 아닌 값(옛 배율 열 포함)은 «알 수 없는 칸»으로 거절한다', async () => {
    const out = await save({ gps_max_speed_kmh: 250, soft_epic_rate: 0.5 })
    expect(out).toMatchObject({ ok: false, status: 400 })
    if (!out.ok) expect(out.fieldErrors).toEqual({ soft_epic_rate: '알 수 없는 칸이에요.' })
    expect(db.updates).toEqual([])
  })

  it('바뀐 값이 없으면 400이고 쓰기도 이력도 없다', async () => {
    expect(await save({ gps_max_speed_kmh: 300 })).toMatchObject({ ok: false, status: 400, error: BALANCE_NO_CHANGE_MESSAGE })
    expect(db.updates).toEqual([])
    expect(historyRows()).toEqual([])
  })

  it('화면이 본 수정 시각이 낡았으면 409이고 쓰지 않는다', async () => {
    const out = await save({ gps_max_speed_kmh: 250 }, { expectedUpdatedAt: '2026-10-23T00:00:00+00:00' })
    expect(out).toMatchObject({ ok: false, status: 409, error: BALANCE_CONFLICT_MESSAGE })
    expect(db.updates).toEqual([])
    expect(policyRow().gps_max_speed_kmh).toBe(300)
  })

  it('읽기와 쓰기 사이에 다른 곳이 먼저 바꾸면 409이고 이력이 없다', async () => {
    db.beforeUpdate = () => {
      policyRow().updated_at = '2026-10-24T01:59:00+00:00'
    }
    const out = await save({ gps_max_speed_kmh: 250 })
    expect(out).toMatchObject({ ok: false, status: 409, error: BALANCE_CONFLICT_MESSAGE })
    expect(historyRows()).toEqual([])
  })

  it('DB 오류는 500이고 응답에 DB 오류 원문이 없으며 이력이 없다', async () => {
    db.writeErrors.abusing_policy = SECRET_DB_MESSAGE
    const out = await save({ gps_max_speed_kmh: 250 })
    expect(out).toMatchObject({ ok: false, status: 500, error: BALANCE_SAVE_FAILED_MESSAGE })
    expect(JSON.stringify(out)).not.toContain('secret detail')
    expect(historyRows()).toEqual([])
  })

  it('이력을 쓰지 못하면 이전 값으로 되돌리고 수정 시각도 읽었던 때로 돌린다(500)', async () => {
    db.writeErrors.balance_setting_changes = SECRET_DB_MESSAGE
    const out = await save({ gps_max_speed_kmh: 250, poi_block_hours: 48 })

    expect(out).toMatchObject({ ok: false, status: 500, error: BALANCE_HISTORY_FAILED_MESSAGE })
    expect(JSON.stringify(out)).not.toContain('secret detail')
    expect(policyRow()).toMatchObject({ gps_max_speed_kmh: 300, poi_block_hours: 72, updated_at: ABUSING_ROW_STAMP })
    expect(historyRows()).toEqual([])
    // 되돌린 뒤 같은 화면에서 다시 저장해도 409가 아니다
    db.writeErrors.balance_setting_changes = undefined
    expect((await save({ gps_max_speed_kmh: 250 })).ok).toBe(true)
  })
})

describe('행이 없을 때의 어뷰징 구역 (옛 화면과 같은 뜻: 기본값을 보이고 첫 저장이 행을 만든다)', () => {
  beforeEach(() => {
    db.tables.abusing_policy = []
  })

  it('공용 저장을 지난 첫 저장은 upsert로 행을 만들고 이력에 남으며 update는 한 번도 부르지 않는다', async () => {
    const out = await save({ gps_max_speed_kmh: 250 }, { expectedUpdatedAt: ABUSING_NO_ROW_STAMP })

    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.changes).toEqual([{ field: 'gps_max_speed_kmh', from: 300, to: 250 }])
    expect(db.calls.filter((call) => call.startsWith('abusing_policy.') && call !== 'abusing_policy.select')).toEqual(['abusing_policy.upsert'])
    expect(db.updates).toEqual([])
    expect(db.tables.abusing_policy).toHaveLength(1)
    expect(policyRow()).toMatchObject({ id: 1, ...DEFAULT_POLICY, gps_max_speed_kmh: 250 })
    expect(out.updatedAt).toBe(policyRow().updated_at)
    expect(historyRows()).toHaveLength(1)
    expect(historyRows()[0]).toMatchObject({ section_key: 'abusing', changes: [{ field: 'gps_max_speed_kmh', from: 300, to: 250 }] })
  })

  it('첫 저장 뒤에는 행이 있으므로 그 수정 시각으로 다음 저장이 조건부 갱신이 된다', async () => {
    const first = await save({ gps_max_speed_kmh: 250 }, { expectedUpdatedAt: ABUSING_NO_ROW_STAMP })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const second = await save({ poi_block_hours: 48 }, { expectedUpdatedAt: first.updatedAt })
    expect(second.ok).toBe(true)
    expect(db.upserts).toHaveLength(1)
    expect(db.updates).toHaveLength(1)
    expect(policyRow()).toMatchObject({ gps_max_speed_kmh: 250, poi_block_hours: 48 })
  })

  it('첫 저장도 범위 검사를 지난다(차량 속도 필터 19는 행을 만들기 전에 막힌다)', async () => {
    const out = await save({ vehicle_speed_filter_kmh: 19 }, { expectedUpdatedAt: ABUSING_NO_ROW_STAMP })
    expect(out).toMatchObject({ ok: false, status: 400 })
    expect(db.tables.abusing_policy).toEqual([])
    expect(db.upserts).toEqual([])
  })

  it('첫 저장에서 이력을 쓰지 못하면 값을 기본값으로, 수정 시각을 «행 없음» 시각으로 되돌리고(행은 남는다) 같은 화면에서 다시 저장할 수 있다', async () => {
    db.writeErrors.balance_setting_changes = SECRET_DB_MESSAGE
    const out = await save({ gps_max_speed_kmh: 250 }, { expectedUpdatedAt: ABUSING_NO_ROW_STAMP })

    expect(out).toMatchObject({ ok: false, status: 500, error: BALANCE_HISTORY_FAILED_MESSAGE })
    expect(policyRow()).toMatchObject({ ...DEFAULT_POLICY, updated_at: ABUSING_NO_ROW_STAMP })
    expect(historyRows()).toEqual([])

    db.writeErrors.balance_setting_changes = undefined
    const retry = await save({ gps_max_speed_kmh: 250 }, { expectedUpdatedAt: ABUSING_NO_ROW_STAMP })
    expect(retry.ok).toBe(true)
    expect(policyRow().gps_max_speed_kmh).toBe(250)
  })
})
