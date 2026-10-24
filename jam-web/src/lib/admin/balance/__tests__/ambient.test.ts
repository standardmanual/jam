/**
 * 시스템 드랍 구역 연결 (티켓 20261022_1134 3회) — `ambient_drop_config` id=1 행의 숫자 8칸. 옛 앰비언트 드랍 화면의 숫자 칸과 그 저장(`PUT /api/admin/ambient-drop/config`)이 쓰던 열을 같은 뜻으로 읽고 쓴다.
 * 가짜 표(`fakeDb.ts`, 실 DB에는 접속하지 않는다)로 지키는 것:
 * - 칸 정의: 8칸이 화면 순서(예약 배포·배치 규모·등급 비율)이고 단위·기본값(`DEFAULT_AMBIENT_DROP_CONFIG`, 등급은 퍼센트)이 맞으며, 확률 안내에 반영되는 칸은 등급 비율 네 칸(`AMBIENT_COLUMNS`)뿐이다
 * - 범위: 배포 시각 0~23 정수(`isValidScheduleHourKst`), 상호 배제 창 0~180 정수(코드 상한), 배치 규모·지점당 한도 1 이상 정수, 등급 비율 0~100(소수 첫째 자리)
 * - 퍼센트 변환: 33.3 ↔ 0.333이 왕복해도 어긋나지 않는다(0.0~100.0 전 구간). 곱셈 오차(33.300000000000004)가 입력칸과 «바뀐 칸» 판정에 새지 않는다
 * - 합계 100: 소수 퍼센트(33.3 + 33.3 + 33.4)를 부동소수 오차로 잘못 거절하지 않고, 어긋난 합(99.9)은 거절한다
 * - 읽기: 가공하지 않은 행에서 8칸만 읽고(스위치·축·`last_auto_run_on`은 읽지 않는다) 등급은 퍼센트로 돌려준다. 행이 없거나 숫자가 아니면 던진다
 * - 쓰기: `updated_at` 조건 갱신으로 바꾼 열만 쓰고 등급은 0~1로 쓴다. 스위치·세 축·`last_auto_run_on`·바뀌지 않은 숫자 열은 건드리지 않는다
 * - 공용 저장(`saveBalanceSection`)을 지나면: 저장되고 이력에 남으며, 등급 비율을 바꾼 저장만 `affects_disclosure`가 켜진다. cron이 `last_auto_run_on`만 쓰는 것은 수정 시각 409를 만들지 않는다
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

import { DEFAULT_AMBIENT_DROP_CONFIG } from '@/lib/ambient-drop/config'
import { AMBIENT_DROP_EXCLUSION_WINDOW_MAX_MINUTES, isValidScheduleHourKst } from '@/lib/ambient-drop/schedule'
import { AMBIENT_COLUMNS } from '@/lib/probability/disclosure'
import {
  AMBIENT_BALANCE_KEYS,
  AMBIENT_BINDING,
  AMBIENT_FIELDS,
  AMBIENT_RARITY_GROUP,
  AMBIENT_RARITY_KEYS,
  AMBIENT_SECTION_ID,
  AMBIENT_SELECT,
  readAmbientRarityMode,
} from '../ambient'
import { checkFieldValue, draftChangedValues, draftFromValues, fractionToPercent, groupSums, percentToFraction, sumMismatchMessage } from '../fields'
import {
  BALANCE_CONFLICT_MESSAGE,
  BALANCE_HISTORY_FAILED_MESSAGE,
  BALANCE_INVALID_MESSAGE,
  BALANCE_NO_CHANGE_MESSAGE,
  BALANCE_SAVE_FAILED_MESSAGE,
  saveBalanceSection,
} from '../save'
import { INTEGER_MAX } from '../types'
import { AMBIENT_ROW_STAMP, ambientDropConfigRow, createFakeDb, type FakeDb } from './fakeDb'

const ACTOR = '11111111-1111-4111-8111-111111111111'
const NEXT = '2026-10-24T03:00:00.000Z'
const SECRET_DB_MESSAGE = 'relation "ambient_drop_config" violates check constraint (secret detail)'

/** 화면 단위로 읽은 기본 행(`ambientDropConfigRow`: 3시, 15분, 30개, 1개, 60/30/10/0). */
const ROW_VALUES = {
  schedule_hour_kst: 3,
  exclusion_window_minutes: 15,
  batch_size: 30,
  max_active_per_poi: 1,
  rarity_common: 60,
  rarity_rare: 30,
  rarity_epic: 10,
  rarity_mystic: 0,
}

/** 이 구역이 읽지도 쓰지도 않는 열(스위치, 세 축 고르기, 시스템 전용 열). */
const UNTOUCHED = {
  auto_enabled: true,
  last_auto_run_on: '2026-10-23',
  category_mode: 'explicit',
  category_slug: 'cafe',
  rarity_mode: 'explicit',
  collection_mode: 'explicit',
  collection_ids: ['5d6b3a38-5c8e-4b4a-9a52-0a1b2c3d4e5f'],
}

let db: FakeDb

beforeEach(() => {
  db = createFakeDb({
    ambient_drop_config: [ambientDropConfigRow()],
    balance_setting_changes: [],
    users: [{ id: ACTOR, username: 'karina' }],
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(console.error).mockClear()
})

const save = (values: unknown, extra: { note?: unknown; expectedUpdatedAt?: unknown } = {}) =>
  saveBalanceSection(db.client, { binding: AMBIENT_BINDING, values, expectedUpdatedAt: AMBIENT_ROW_STAMP, actor: ACTOR, ...extra })
const write = (values: Record<string, number>, expectedUpdatedAt: string = AMBIENT_ROW_STAMP) =>
  AMBIENT_BINDING.write(db.client, { values, expectedUpdatedAt, nextUpdatedAt: NEXT })
const configRow = () => db.tables.ambient_drop_config[0]
const historyRows = () => db.tables.balance_setting_changes
const field = (key: string) => {
  const def = AMBIENT_FIELDS.find((entry) => entry.key === key)
  if (!def) throw new Error(`칸 정의가 없음: ${key}`)
  return def
}
const rarity = (common: number, rare: number, epic: number, mystic: number) => ({
  rarity_common: common,
  rarity_rare: rare,
  rarity_epic: epic,
  rarity_mystic: mystic,
})

describe('시스템 드랍 칸 정의', () => {
  it('구역 키는 ambient이고 칸 8개는 화면 순서(예약 배포·배치 규모·등급 비율)를 따른다', () => {
    expect(AMBIENT_SECTION_ID).toBe('ambient')
    expect(AMBIENT_BINDING.id).toBe('ambient')
    expect(AMBIENT_FIELDS.map((def) => def.key)).toEqual([...AMBIENT_BALANCE_KEYS])
    expect([...AMBIENT_BALANCE_KEYS]).toEqual([
      'schedule_hour_kst',
      'exclusion_window_minutes',
      'batch_size',
      'max_active_per_poi',
      'rarity_common',
      'rarity_rare',
      'rarity_epic',
      'rarity_mystic',
    ])
    expect(AMBIENT_FIELDS.map((def) => def.group)).toEqual([
      '예약 배포',
      '예약 배포',
      '배치 규모',
      '배치 규모',
      AMBIENT_RARITY_GROUP,
      AMBIENT_RARITY_GROUP,
      AMBIENT_RARITY_GROUP,
      AMBIENT_RARITY_GROUP,
    ])
    expect(AMBIENT_RARITY_GROUP).toBe('등급 비율')
  })

  it('옮기지 않는 열(스위치·세 축·last_auto_run_on·옛 전체 무작위 칸)은 칸에 없다', () => {
    const keys: readonly string[] = AMBIENT_BALANCE_KEYS
    for (const other of ['auto_enabled', 'category_mode', 'category_slug', 'rarity_mode', 'collection_mode', 'collection_ids', 'last_auto_run_on', 'all_random']) {
      expect(keys, other).not.toContain(other)
    }
  })

  it('단위와 기본값: 코드 기본값(DEFAULT_AMBIENT_DROP_CONFIG)이고 등급 비율은 퍼센트로 바꾼 값이다', () => {
    expect(field('schedule_hour_kst')).toMatchObject({ unit: '시', defaultValue: DEFAULT_AMBIENT_DROP_CONFIG.schedule_hour_kst })
    expect(field('exclusion_window_minutes')).toMatchObject({ unit: '분', defaultValue: DEFAULT_AMBIENT_DROP_CONFIG.exclusion_window_minutes })
    expect(field('batch_size')).toMatchObject({ unit: '개', defaultValue: DEFAULT_AMBIENT_DROP_CONFIG.batch_size })
    expect(field('max_active_per_poi')).toMatchObject({ unit: '개', defaultValue: DEFAULT_AMBIENT_DROP_CONFIG.max_active_per_poi })
    for (const key of AMBIENT_RARITY_KEYS) {
      expect(field(key), key).toMatchObject({ unit: '%', defaultValue: DEFAULT_AMBIENT_DROP_CONFIG[key] * 100, sumTo: 100 })
    }
    expect(DEFAULT_AMBIENT_DROP_CONFIG.rarity_common).toBe(1)
    expect(field('rarity_common').defaultValue).toBe(100)
    expect(field('rarity_mystic').defaultValue).toBe(0)
  })

  it('확률 안내에 반영되는 칸은 등급 비율 네 칸뿐이고 확률 안내가 읽는 칸 목록(AMBIENT_COLUMNS)과 같다', () => {
    expect(AMBIENT_FIELDS.filter((def) => def.affectsDisclosure).map((def) => def.key)).toEqual([...AMBIENT_COLUMNS])
    expect([...AMBIENT_RARITY_KEYS]).toEqual([...AMBIENT_COLUMNS])
    for (const key of ['schedule_hour_kst', 'exclusion_window_minutes', 'batch_size', 'max_active_per_poi']) {
      expect(field(key).affectsDisclosure, key).toBe(false)
    }
    for (const key of AMBIENT_RARITY_KEYS) expect(field(key).affectsDisclosure, key).toBe(true)
  })

  it('합계 묶음은 등급 비율 하나이고 합계 목표는 100이다', () => {
    const draft = draftFromValues(AMBIENT_FIELDS, ROW_VALUES)
    const sums = groupSums(AMBIENT_FIELDS, draft)
    expect(sums).toHaveLength(1)
    expect(sums[0]).toMatchObject({ title: '등급 비율', target: 100, unit: '%', sum: 100, ok: true, message: null })
  })

  it('읽기에 넘기는 칸 목록은 8칸과 updated_at뿐이다(스위치·축·last_auto_run_on은 읽지 않는다)', () => {
    expect(AMBIENT_SELECT.split(',').map((column) => column.trim())).toEqual([...AMBIENT_BALANCE_KEYS, 'updated_at'])
  })
})

describe('시스템 드랍 칸의 범위', () => {
  it('배포 시각은 0~23 정수이고 isValidScheduleHourKst와 같은 판정이다', () => {
    const def = field('schedule_hour_kst')
    for (const hour of [-1, 0, 3, 12, 23, 24, 3.5, 100]) {
      expect(checkFieldValue(def, hour) === null, String(hour)).toBe(isValidScheduleHourKst(hour))
    }
    expect(checkFieldValue(def, 0)).toBeNull()
    expect(checkFieldValue(def, 23)).toBeNull()
    expect(checkFieldValue(def, 24)).toBe('0 이상 23 이하의 정수로 입력해 주세요.')
  })

  it('상호 배제 창은 0 이상 코드 상한(180분) 이하 정수다. 181·소수·음수는 막는다', () => {
    const def = field('exclusion_window_minutes')
    expect(def.max).toBe(AMBIENT_DROP_EXCLUSION_WINDOW_MAX_MINUTES)
    expect(AMBIENT_DROP_EXCLUSION_WINDOW_MAX_MINUTES).toBe(180)
    expect(checkFieldValue(def, 0)).toBeNull()
    expect(checkFieldValue(def, 15)).toBeNull()
    expect(checkFieldValue(def, 180)).toBeNull()
    expect(checkFieldValue(def, 181)).toBe('0 이상 180 이하의 정수로 입력해 주세요.')
    expect(checkFieldValue(def, 720)).not.toBeNull()
    expect(checkFieldValue(def, 15.5)).not.toBeNull()
    expect(checkFieldValue(def, -1)).not.toBeNull()
  })

  it('배치 규모와 지점당 한도는 1 이상 정수다. 0·소수·정수 한계 초과는 막는다', () => {
    for (const key of ['batch_size', 'max_active_per_poi']) {
      const def = field(key)
      expect(checkFieldValue(def, 1), key).toBeNull()
      expect(checkFieldValue(def, 30), key).toBeNull()
      expect(checkFieldValue(def, INTEGER_MAX), key).toBeNull()
      expect(checkFieldValue(def, 0), key).toBe('1 이상의 정수로 입력해 주세요.')
      expect(checkFieldValue(def, -2), key).not.toBeNull()
      expect(checkFieldValue(def, 1.5), key).not.toBeNull()
      expect(checkFieldValue(def, INTEGER_MAX + 1), key).not.toBeNull()
    }
  })

  it('등급 비율은 0~100이고 소수 첫째 자리까지다. 33.3은 통과하고 33.33·100.1·-0.1은 막는다', () => {
    for (const key of AMBIENT_RARITY_KEYS) {
      const def = field(key)
      expect(def).toMatchObject({ decimals: 1, min: 0, max: 100 })
      expect(checkFieldValue(def, 0), key).toBeNull()
      expect(checkFieldValue(def, 0.1), key).toBeNull()
      expect(checkFieldValue(def, 33.3), key).toBeNull()
      expect(checkFieldValue(def, 99.9), key).toBeNull()
      expect(checkFieldValue(def, 100), key).toBeNull()
      expect(checkFieldValue(def, 33.33), key).not.toBeNull()
      expect(checkFieldValue(def, 100.1), key).not.toBeNull()
      expect(checkFieldValue(def, -0.1), key).not.toBeNull()
    }
  })
})

describe('퍼센트 ↔ 0~1 변환 (부동소수 반올림)', () => {
  it('33.3 ↔ 0.333이다', () => {
    expect(percentToFraction(33.3)).toBe(0.333)
    expect(fractionToPercent(0.333)).toBe(33.3)
  })

  it('곱셈만 하면 어긋나는 값을 눈금으로 맞춘다', () => {
    // 0.333 * 100 은 33.300000000000004, 33.3 / 100 은 0.33299999999999996
    expect(0.333 * 100).not.toBe(33.3)
    expect(33.3 / 100).not.toBe(0.333)
    expect(fractionToPercent(0.333)).toBe(33.3)
    expect(percentToFraction(33.3)).toBe(0.333)
    expect(fractionToPercent(0.007)).toBe(0.7)
    expect(percentToFraction(0.7)).toBe(0.007)
  })

  it('0.0%부터 100.0%까지 천한 눈금 전부가 왕복해도 같은 값이다', () => {
    for (let tenths = 0; tenths <= 1000; tenths += 1) {
      const percent = tenths / 10
      const fraction = tenths / 1000
      expect(percentToFraction(percent), `${percent}% → 0~1`).toBe(fraction)
      expect(fractionToPercent(fraction), `${fraction} → %`).toBe(percent)
      expect(fractionToPercent(percentToFraction(percent)), `${percent}% 왕복`).toBe(percent)
      expect(percentToFraction(fractionToPercent(fraction)), `${fraction} 왕복`).toBe(fraction)
    }
  })

  it('정수 퍼센트와 양 끝값', () => {
    expect(percentToFraction(100)).toBe(1)
    expect(percentToFraction(0)).toBe(0)
    expect(fractionToPercent(1)).toBe(100)
    expect(fractionToPercent(0)).toBe(0)
    expect(fractionToPercent(0.6)).toBe(60)
  })
})

describe('시스템 드랍 등급 합계 100', () => {
  const together = (values: Record<string, number>) => AMBIENT_BINDING.validateTogether?.(values) ?? {}

  it('소수 퍼센트(33.3 + 33.3 + 33.4)를 부동소수 오차로 잘못 거절하지 않는다', () => {
    expect(together(rarity(33.3, 33.3, 33.4, 0))).toEqual({})
    expect(together(rarity(0.1, 0.2, 0.3, 99.4))).toEqual({})
    expect(together(rarity(10.1, 20.2, 30.3, 39.4))).toEqual({})
    expect(together(rarity(14.3, 14.3, 14.3, 57.1))).toEqual({})
    expect(together(rarity(100, 0, 0, 0))).toEqual({})
  })

  it('0.1% 눈금으로 합이 100인 조합은 모두 통과하고 99.9·100.1인 조합은 모두 거절한다', () => {
    for (let a = 0; a <= 1000; a += 37) {
      for (let b = 0; b <= 1000 - a; b += 41) {
        for (let c = 0; c <= 1000 - a - b; c += 43) {
          const d = 1000 - a - b - c
          expect(together(rarity(a / 10, b / 10, c / 10, d / 10)), `${a}/${b}/${c}/${d}`).toEqual({})
          expect(Object.keys(together(rarity(a / 10, b / 10, c / 10, (d - 1) / 10))), `${a}/${b}/${c}/${d - 1}`).toHaveLength(4)
          expect(Object.keys(together(rarity(a / 10, b / 10, c / 10, (d + 1) / 10))), `${a}/${b}/${c}/${d + 1}`).toHaveLength(4)
        }
      }
    }
  })

  it('합이 어긋나면 네 칸 모두에 같은 문장을 붙인다', () => {
    const errors = together(rarity(33.3, 33.3, 33.3, 0))
    expect(Object.keys(errors).sort()).toEqual([...AMBIENT_RARITY_KEYS].sort())
    const message = sumMismatchMessage('등급 비율', 99.9)
    expect(message).toBe('등급 비율 합이 100이어야 해요. 지금은 99.9이에요.')
    for (const key of AMBIENT_RARITY_KEYS) expect(errors[key]).toBe(message)
  })

  it('화면의 합계 줄도 같은 문장이고 소수 퍼센트에서 맞다고 본다', () => {
    const ok = groupSums(AMBIENT_FIELDS, draftFromValues(AMBIENT_FIELDS, { ...ROW_VALUES, ...rarity(33.3, 33.3, 33.4, 0) }))
    expect(ok[0]).toMatchObject({ ok: true, message: null })
    const bad = groupSums(AMBIENT_FIELDS, draftFromValues(AMBIENT_FIELDS, { ...ROW_VALUES, ...rarity(33.3, 33.3, 33.3, 0) }))
    expect(bad[0]).toMatchObject({ ok: false, message: '등급 비율 합이 100이어야 해요. 지금은 99.9이에요.' })
  })
})

describe('AMBIENT_BINDING.read', () => {
  it('8칸을 읽고 등급 비율은 퍼센트로 돌려준다. 읽기에 넘기는 칸 목록은 AMBIENT_SELECT다', async () => {
    const snapshot = await AMBIENT_BINDING.read(db.client)
    expect(snapshot).toEqual({ values: ROW_VALUES, updatedAt: AMBIENT_ROW_STAMP })
    expect(db.selects).toEqual([AMBIENT_SELECT])
  })

  it('NUMERIC이 문자열로 내려와도 숫자로 읽고, 소수 퍼센트는 곱셈 오차 없이 읽는다', async () => {
    db.tables.ambient_drop_config = [
      ambientDropConfigRow({ rarity_common: '0.333', rarity_rare: '0.333', rarity_epic: 0.334, rarity_mystic: '0.000', schedule_hour_kst: '5', batch_size: '40' }),
    ]
    const { values } = await AMBIENT_BINDING.read(db.client)
    expect(values.rarity_common).toBe(33.3)
    expect(values.rarity_rare).toBe(33.3)
    expect(values.rarity_epic).toBe(33.4)
    expect(values.rarity_mystic).toBe(0)
    expect(values.schedule_hour_kst).toBe(5)
    expect(values.batch_size).toBe(40)
  })

  it('읽은 값으로 입력 초안을 만들면 긴 소수가 아니고, 아무것도 안 고치면 «바뀐 칸»이 없다', async () => {
    db.tables.ambient_drop_config = [ambientDropConfigRow({ rarity_common: '0.333', rarity_rare: '0.333', rarity_epic: '0.334', rarity_mystic: '0.000' })]
    const snapshot = await AMBIENT_BINDING.read(db.client)
    const draft = draftFromValues(AMBIENT_FIELDS, snapshot.values)
    expect(draft.rarity_common).toBe('33.3')
    expect(draft.rarity_epic).toBe('33.4')
    expect(draftChangedValues(AMBIENT_FIELDS, snapshot.values, draft)).toEqual({})
    expect(draftChangedValues(AMBIENT_FIELDS, snapshot.values, { ...draft, rarity_common: '33.4' })).toEqual({ rarity_common: 33.4 })
  })

  it('행이 없으면 던진다(기본값으로 바꿔 보이지 않는다)', async () => {
    db.tables.ambient_drop_config = []
    await expect(AMBIENT_BINDING.read(db.client)).rejects.toThrow('시스템 드랍 설정 조회 실패: id=1 행이 없음')
  })

  it('조회가 실패하면 던진다', async () => {
    db.readErrors.ambient_drop_config = 'boom'
    await expect(AMBIENT_BINDING.read(db.client)).rejects.toThrow('시스템 드랍 설정 조회 실패: boom')
  })

  it('숫자가 아닌 값이 있으면 어느 칸인지 적어 던진다', async () => {
    db.tables.ambient_drop_config = [ambientDropConfigRow({ batch_size: null })]
    await expect(AMBIENT_BINDING.read(db.client)).rejects.toThrow('batch_size')
  })

  it('읽기만 한다(쓰기 호출이 없다)', async () => {
    await AMBIENT_BINDING.read(db.client)
    expect(db.calls).toEqual(['ambient_drop_config.select'])
  })
})

describe('readAmbientRarityMode', () => {
  it('rarity_mode를 읽는다', async () => {
    expect(await readAmbientRarityMode(db.client)).toBe('explicit')
    db.tables.ambient_drop_config = [ambientDropConfigRow({ rarity_mode: 'random' })]
    expect(await readAmbientRarityMode(db.client)).toBe('random')
    expect(db.selects).toEqual(['rarity_mode', 'rarity_mode'])
  })

  it('읽지 못하거나 모르는 값이면 던진다', async () => {
    db.readErrors.ambient_drop_config = 'boom'
    await expect(readAmbientRarityMode(db.client)).rejects.toThrow('시스템 드랍 등급 축 조회 실패: boom')
    db.readErrors.ambient_drop_config = undefined
    db.tables.ambient_drop_config = []
    await expect(readAmbientRarityMode(db.client)).rejects.toThrow('id=1 행이 없음')
    db.tables.ambient_drop_config = [ambientDropConfigRow({ rarity_mode: 'all' })]
    await expect(readAmbientRarityMode(db.client)).rejects.toThrow('rarity_mode 값을 알 수 없음')
  })
})

describe('AMBIENT_BINDING.write', () => {
  it('바꾼 열과 수정 시각만 조건부로 갱신하고, 스위치·세 축·last_auto_run_on과 다른 숫자 열은 건드리지 않는다', async () => {
    const res = await write({ schedule_hour_kst: 5, batch_size: 40 })

    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.updates).toEqual([{ updated_at: NEXT, schedule_hour_kst: 5, batch_size: 40 }])
    expect(configRow()).toMatchObject({ ...UNTOUCHED, exclusion_window_minutes: 15, max_active_per_poi: 1, rarity_common: '0.600', schedule_hour_kst: 5, batch_size: 40, updated_at: NEXT })
    expect(db.upserts).toEqual([])
  })

  it('등급 비율은 0~1로 쓴다(33.3 → 0.333). 퍼센트 그대로 쓰지 않는다', async () => {
    const res = await write(rarity(33.3, 33.3, 33.4, 0))

    expect(res).toEqual({ ok: true, updatedAt: NEXT })
    expect(db.updates).toEqual([{ updated_at: NEXT, rarity_common: 0.333, rarity_rare: 0.333, rarity_epic: 0.334, rarity_mystic: 0 }])
    expect(configRow()).toMatchObject({ rarity_common: 0.333, rarity_rare: 0.333, rarity_epic: 0.334, rarity_mystic: 0 })
  })

  it('쓴 값을 다시 읽으면 입력한 퍼센트가 그대로 나온다(왕복)', async () => {
    await write(rarity(33.3, 33.3, 33.4, 0))
    expect((await AMBIENT_BINDING.read(db.client)).values).toMatchObject(rarity(33.3, 33.3, 33.4, 0))
  })

  it('수정 시각이 다르면 conflict이고 아무것도 바뀌지 않는다', async () => {
    const res = await write({ batch_size: 40 }, '2026-10-23T00:00:00+00:00')
    expect(res).toEqual({ ok: false, reason: 'conflict' })
    expect(configRow()).toMatchObject({ batch_size: 30, updated_at: AMBIENT_ROW_STAMP })
  })

  it('DB 오류는 error로 돌려준다', async () => {
    db.writeErrors.ambient_drop_config = SECRET_DB_MESSAGE
    expect(await write({ batch_size: 40 })).toEqual({ ok: false, reason: 'error', message: SECRET_DB_MESSAGE })
  })

  it('바꿀 칸이 없으면 쓰지 않는다', async () => {
    expect(await write({})).toEqual({ ok: false, reason: 'error', message: '바꿀 칸이 없음' })
    expect(await write({ not_a_column: 3 })).toEqual({ ok: false, reason: 'error', message: '바꿀 칸이 없음' })
    expect(db.updates).toEqual([])
  })
})

describe('시스템 드랍 구역 저장 (공용 저장을 지난다)', () => {
  it('값을 바꾸면 ambient_drop_config의 같은 열에 저장되고 칸 이름으로 이력에 남는다. 숫자 칸만 바꾸면 확률 안내 반영 표시가 없다', async () => {
    const out = await save({ schedule_hour_kst: 5, exclusion_window_minutes: 30, batch_size: 40, max_active_per_poi: 2 }, { note: '배포 시각 조정' })

    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.changes).toEqual([
      { field: 'schedule_hour_kst', from: 3, to: 5 },
      { field: 'exclusion_window_minutes', from: 15, to: 30 },
      { field: 'batch_size', from: 30, to: 40 },
      { field: 'max_active_per_poi', from: 1, to: 2 },
    ])
    expect(out.affectsDisclosure).toBe(false)
    expect(configRow()).toMatchObject({ ...UNTOUCHED, schedule_hour_kst: 5, exclusion_window_minutes: 30, batch_size: 40, max_active_per_poi: 2 })
    expect(historyRows()).toHaveLength(1)
    expect(historyRows()[0]).toMatchObject({
      section_key: 'ambient',
      changes: out.changes,
      note: '배포 시각 조정',
      affects_disclosure: false,
      changed_by: ACTOR,
    })
  })

  it('등급 비율을 바꾸면 0~1로 저장되고, 이력에는 화면 값(퍼센트)이 남으며 확률 안내 반영 표시가 켜진다', async () => {
    const out = await save(rarity(50, 40, 10, 0))

    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.changes).toEqual([
      { field: 'rarity_common', from: 60, to: 50 },
      { field: 'rarity_rare', from: 30, to: 40 },
    ])
    expect(out.affectsDisclosure).toBe(true)
    expect(configRow()).toMatchObject({ rarity_common: 0.5, rarity_rare: 0.4, rarity_epic: '0.100', rarity_mystic: '0.000' })
    expect(historyRows()[0]).toMatchObject({ section_key: 'ambient', changes: out.changes, affects_disclosure: true })
  })

  it('소수 퍼센트(33.3 / 33.3 / 33.4 / 0)가 저장되고 다시 읽어도 같다', async () => {
    const out = await save(rarity(33.3, 33.3, 33.4, 0))

    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.changes).toEqual([
      { field: 'rarity_common', from: 60, to: 33.3 },
      { field: 'rarity_rare', from: 30, to: 33.3 },
      { field: 'rarity_epic', from: 10, to: 33.4 },
    ])
    expect(configRow()).toMatchObject({ rarity_common: 0.333, rarity_rare: 0.333, rarity_epic: 0.334 })
    expect(out.values).toMatchObject(rarity(33.3, 33.3, 33.4, 0))
    expect((await AMBIENT_BINDING.read(db.client)).values).toMatchObject(rarity(33.3, 33.3, 33.4, 0))
  })

  it('등급 비율 합이 100이 아니면 쓰기 전에 네 칸 모두에 문장을 붙여 막는다', async () => {
    const out = await save({ rarity_common: 50 })
    expect(out).toMatchObject({ ok: false, status: 400, error: BALANCE_INVALID_MESSAGE })
    if (!out.ok) {
      expect(Object.keys(out.fieldErrors ?? {}).sort()).toEqual([...AMBIENT_RARITY_KEYS].sort())
      expect(out.fieldErrors?.rarity_common).toBe('등급 비율 합이 100이어야 해요. 지금은 90이에요.')
    }
    expect(db.updates).toEqual([])
    expect(historyRows()).toEqual([])

    const sloppy = await save(rarity(33.3, 33.3, 33.3, 0))
    expect(sloppy).toMatchObject({ ok: false, status: 400 })
    expect(db.updates).toEqual([])
  })

  it('숫자 칸만 바꾸는 저장은 등급 비율 합이 100인 한 통과한다', async () => {
    expect((await save({ batch_size: 50 })).ok).toBe(true)
    expect(configRow().batch_size).toBe(50)
  })

  it('저장된 등급 비율의 합이 100이 아니면 다른 칸을 바꾸는 저장도 합을 먼저 맞추라고 막는다(합이 어긋난 낡은 값을 그대로 두고 저장하지 않는다)', async () => {
    db.tables.ambient_drop_config = [ambientDropConfigRow({ rarity_mode: 'random', rarity_common: '0.500', rarity_rare: '0.200', rarity_epic: '0.000', rarity_mystic: '0.000' })]
    const out = await save({ batch_size: 50 })
    expect(out).toMatchObject({ ok: false, status: 400, error: BALANCE_INVALID_MESSAGE })
    if (!out.ok) expect(out.fieldErrors?.rarity_common).toBe('등급 비율 합이 100이어야 해요. 지금은 70이에요.')
    expect(db.updates).toEqual([])
  })

  it('범위 밖 값은 쓰기 전에 막힌다(배포 시각 24, 상호 배제 창 181·소수, 배치 규모 0, 지점당 한도 0·소수, 등급 100.1)', async () => {
    const cases: Array<[string, number | string]> = [
      ['schedule_hour_kst', 24],
      ['schedule_hour_kst', -1],
      ['schedule_hour_kst', 3.5],
      ['exclusion_window_minutes', 181],
      ['exclusion_window_minutes', 720],
      ['exclusion_window_minutes', 15.5],
      ['batch_size', 0],
      ['batch_size', 2.5],
      ['max_active_per_poi', 0],
      ['max_active_per_poi', 1.5],
      ['max_active_per_poi', INTEGER_MAX + 1],
      ['rarity_common', 100.1],
      ['rarity_common', 33.33],
      ['batch_size', '30'],
    ]
    for (const [key, bad] of cases) {
      const out = await save({ [key]: bad })
      expect(out, `${key} ${String(bad)}`).toMatchObject({ ok: false, status: 400, error: BALANCE_INVALID_MESSAGE })
    }
    expect(db.updates).toEqual([])
    expect(historyRows()).toEqual([])
  })

  it('경계값은 저장된다(배포 시각 0과 23, 상호 배제 창 0과 180)', async () => {
    expect((await save({ schedule_hour_kst: 0, exclusion_window_minutes: 0 })).ok).toBe(true)
    expect(configRow()).toMatchObject({ schedule_hour_kst: 0, exclusion_window_minutes: 0 })
    const stamp = String(configRow().updated_at)
    expect((await save({ schedule_hour_kst: 23, exclusion_window_minutes: 180 }, { expectedUpdatedAt: stamp })).ok).toBe(true)
    expect(configRow()).toMatchObject({ schedule_hour_kst: 23, exclusion_window_minutes: 180 })
  })

  it('이 구역의 칸이 아닌 값(스위치·세 축·last_auto_run_on·옛 전체 무작위 칸)은 «알 수 없는 칸»으로 거절한다', async () => {
    for (const key of ['auto_enabled', 'category_mode', 'rarity_mode', 'collection_mode', 'last_auto_run_on', 'all_random']) {
      const out = await save({ batch_size: 50, [key]: 1 })
      expect(out, key).toMatchObject({ ok: false, status: 400 })
      if (!out.ok) expect(out.fieldErrors, key).toEqual({ [key]: '알 수 없는 칸이에요.' })
    }
    expect(db.updates).toEqual([])
  })

  it('바뀐 값이 없으면 400이고 쓰기도 이력도 없다', async () => {
    expect(await save({ batch_size: 30, ...rarity(60, 30, 10, 0) })).toMatchObject({ ok: false, status: 400, error: BALANCE_NO_CHANGE_MESSAGE })
    expect(db.updates).toEqual([])
    expect(historyRows()).toEqual([])
  })

  it('화면이 본 수정 시각이 낡았으면 409이고 쓰지 않는다', async () => {
    const out = await save({ batch_size: 50 }, { expectedUpdatedAt: '2026-10-23T00:00:00+00:00' })
    expect(out).toMatchObject({ ok: false, status: 409, error: BALANCE_CONFLICT_MESSAGE })
    expect(db.updates).toEqual([])
    expect(configRow().batch_size).toBe(30)
  })

  it('옛 화면의 스위치·축 저장이 수정 시각을 올렸으면(PUT은 updated_at을 갱신한다) 열려 있던 구역 화면의 저장은 409다', async () => {
    configRow().updated_at = '2026-10-24T02:30:00+00:00'
    configRow().auto_enabled = false
    const out = await save({ batch_size: 50 })
    expect(out).toMatchObject({ ok: false, status: 409, error: BALANCE_CONFLICT_MESSAGE })
    expect(configRow().batch_size).toBe(30)
  })

  it('cron이 last_auto_run_on만 쓰면 수정 시각은 그대로라 구역 저장이 409가 아니고, 그 열은 건드리지 않는다', async () => {
    // claimAmbientDropAutoRun: last_auto_run_on만 update하고 updated_at은 올리지 않는다
    configRow().last_auto_run_on = '2026-10-24'
    const out = await save({ batch_size: 50 })
    expect(out.ok).toBe(true)
    expect(configRow()).toMatchObject({ batch_size: 50, last_auto_run_on: '2026-10-24' })
  })

  it('읽기와 쓰기 사이에 다른 곳이 먼저 바꾸면 409이고 이력이 없다', async () => {
    db.beforeUpdate = () => {
      configRow().updated_at = '2026-10-24T02:59:00+00:00'
    }
    const out = await save({ batch_size: 50 })
    expect(out).toMatchObject({ ok: false, status: 409, error: BALANCE_CONFLICT_MESSAGE })
    expect(historyRows()).toEqual([])
  })

  it('DB 오류는 500이고 응답에 DB 오류 원문이 없으며 이력이 없다', async () => {
    db.writeErrors.ambient_drop_config = SECRET_DB_MESSAGE
    const out = await save({ batch_size: 50 })
    expect(out).toMatchObject({ ok: false, status: 500, error: BALANCE_SAVE_FAILED_MESSAGE })
    expect(JSON.stringify(out)).not.toContain('secret detail')
    expect(historyRows()).toEqual([])
  })

  it('이력을 쓰지 못하면 이전 값(등급은 0~1)으로 되돌리고 수정 시각도 읽었던 때로 돌린다(500)', async () => {
    db.writeErrors.balance_setting_changes = SECRET_DB_MESSAGE
    const out = await save({ batch_size: 50, ...rarity(50, 40, 10, 0) })

    expect(out).toMatchObject({ ok: false, status: 500, error: BALANCE_HISTORY_FAILED_MESSAGE })
    expect(JSON.stringify(out)).not.toContain('secret detail')
    expect(configRow()).toMatchObject({ ...UNTOUCHED, batch_size: 30, rarity_common: 0.6, rarity_rare: 0.3, rarity_epic: '0.100', updated_at: AMBIENT_ROW_STAMP })
    expect((await AMBIENT_BINDING.read(db.client)).values).toEqual(ROW_VALUES)
    expect(historyRows()).toEqual([])
    // 되돌린 뒤 같은 화면에서 다시 저장해도 409가 아니다
    db.writeErrors.balance_setting_changes = undefined
    expect((await save({ batch_size: 50 })).ok).toBe(true)
  })
})
