/**
 * JAM 2.0 노출 태그 시험 — 챕터 구간·캡슐 게이지·잼 보유량·인벤토리 여유 (티켓 20261026_2030 1회차)
 *
 * 1) 순수 함수 경계 2) computeUserExposureTags 통합(Supabase 모의) 3) 방출 태그 ↔ 어드민 선택지 양쪽 대조.
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/exposure-tags-jam2.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

type Row = Record<string, unknown>

const fixtures = vi.hoisted(() => ({
  chapters: {} as Record<string, Row | undefined>,
  capsules: {} as Record<string, Row | undefined>,
  wallets: {} as Record<string, Row | undefined>,
  inventories: {} as Record<string, Row | undefined>,
  /** 조회 오류를 반환할 테이블 → 메시지 */
  errorTables: {} as Record<string, string>,
  fromCalls: {} as Record<string, number>,
}))

const TABLE_FIXTURE: Record<string, 'chapters' | 'capsules' | 'wallets' | 'inventories'> = {
  user_chapters: 'chapters',
  user_capsules: 'capsules',
  jam_wallets: 'wallets',
  inventory: 'inventories',
}

/** 새 표 4개만 유저별 고정 행을 돌려주고, 나머지 표는 빈 결과를 돌려주는 최소 쿼리 빌더 */
function mockSupabase() {
  const from = (table: string) => {
    fixtures.fromCalls[table] = (fixtures.fromCalls[table] ?? 0) + 1
    const eq: Record<string, unknown> = {}
    const builder: Record<string, unknown> = {}
    const chain = () => builder
    builder.select = chain
    builder.eq = (col: string, val: unknown) => {
      eq[col] = val
      return builder
    }
    for (const m of ['in', 'is', 'gte', 'lte', 'order']) builder[m] = chain
    builder.limit = () => Promise.resolve({ data: [], error: null })
    builder.maybeSingle = () => {
      if (fixtures.errorTables[table]) {
        return Promise.resolve({ data: null, error: { message: fixtures.errorTables[table] } })
      }
      const key = TABLE_FIXTURE[table]
      const row = key ? fixtures[key][eq.user_id as string] : undefined
      return Promise.resolve({ data: row ?? null, error: null })
    }
    builder.then = (resolve: (v: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve)
    return builder
  }
  return { from } as unknown as SupabaseClient
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => mockSupabase() }))
vi.mock('@/lib/inputs/weather', () => ({ getTodayWeather: async () => null }))
vi.mock('@/lib/inputs/holidays', () => ({ getTodaySpecialDays: async () => [] }))

import {
  capsuleGaugeTag,
  chapterBandTag,
  computeUserExposureTags,
  inventoryRoomTag,
  jamBalanceTag,
} from '../exposure'
import { INVENTORY_LOW_FREE_SLOTS } from '../exposureThresholds'
import { isTribeTag } from '../exposureTribe'
import { TODAY_EXPOSURE_TAG_OPTIONS } from '@/lib/admin/today-sections'

const NEW_TAGS = [
  'chapter_1_3',
  'chapter_4_6',
  'chapter_7_9',
  'chapter_10',
  'capsule_full',
  'capsule_nearly_full',
  'jam_plenty',
  'jam_low',
  'inventory_full',
  'inventory_nearly_full',
]

describe('chapterBandTag — 챕터 구간 경계', () => {
  it.each([
    [1, 'chapter_1_3'],
    [3, 'chapter_1_3'],
    [4, 'chapter_4_6'],
    [6, 'chapter_4_6'],
    [7, 'chapter_7_9'],
    [9, 'chapter_7_9'],
    [10, 'chapter_10'],
  ])('챕터 %i → %s', (no, tag) => {
    expect(chapterBandTag(no)).toBe(tag)
  })

  it.each([[0], [11], [-1], [2.5], [null], [undefined]])('챕터 %s는 태그 없음', (no) => {
    expect(chapterBandTag(no as number | null | undefined)).toBeNull()
  })
})

describe('capsuleGaugeTag — 캡슐 게이지', () => {
  it('79.9%는 태그 없음, 80%는 거의 참, 100%·초과는 가득 참', () => {
    expect(capsuleGaugeTag({ filled: 799, required: 1000 })).toBeNull()
    expect(capsuleGaugeTag({ filled: 800, required: 1000 })).toBe('capsule_nearly_full')
    expect(capsuleGaugeTag({ filled: 999, required: 1000 })).toBe('capsule_nearly_full')
    expect(capsuleGaugeTag({ filled: 1000, required: 1000 })).toBe('capsule_full')
    expect(capsuleGaugeTag({ filled: 1200, required: 1000 })).toBe('capsule_full')
  })

  it('캡슐이 없거나 required가 0 이하면 태그 없음', () => {
    expect(capsuleGaugeTag(null)).toBeNull()
    expect(capsuleGaugeTag(undefined)).toBeNull()
    expect(capsuleGaugeTag({ filled: 0, required: 0 })).toBeNull()
    expect(capsuleGaugeTag({ filled: 5, required: -3 })).toBeNull()
  })
})

describe('jamBalanceTag — 캡슐 필요량 대비 잼 잔액', () => {
  const capsule = { required: 90 }
  it('필요량×2 바로 아래는 없음, 이상은 jam_plenty', () => {
    expect(jamBalanceTag(179, capsule)).toBeNull()
    expect(jamBalanceTag(180, capsule)).toBe('jam_plenty')
    expect(jamBalanceTag(10_000, capsule)).toBe('jam_plenty')
  })

  it('필요량/3 바로 아래는 jam_low, 이상은 없음', () => {
    expect(jamBalanceTag(29, capsule)).toBe('jam_low')
    expect(jamBalanceTag(30, capsule)).toBeNull()
    expect(jamBalanceTag(0, capsule)).toBe('jam_low')
  })

  it('지갑 행이 없으면(null) 잔액 0으로 본다', () => {
    expect(jamBalanceTag(null, capsule)).toBe('jam_low')
  })

  it('캡슐이 없거나 required가 0 이하면 잼 태그도 없다', () => {
    expect(jamBalanceTag(500, null)).toBeNull()
    expect(jamBalanceTag(0, { required: 0 })).toBeNull()
  })
})

describe('inventoryRoomTag — 남은 칸', () => {
  it('남은 칸 0은 가득 참, 1~3은 거의 가득 참, 4는 없음', () => {
    expect(INVENTORY_LOW_FREE_SLOTS).toBe(3)
    expect(inventoryRoomTag({ max_slots: 20, used_slots: 20 })).toBe('inventory_full')
    expect(inventoryRoomTag({ max_slots: 20, used_slots: 19 })).toBe('inventory_nearly_full')
    expect(inventoryRoomTag({ max_slots: 20, used_slots: 17 })).toBe('inventory_nearly_full')
    expect(inventoryRoomTag({ max_slots: 20, used_slots: 16 })).toBeNull()
  })

  it('used가 max보다 크면 가득 참, 행이 없으면 태그 없음', () => {
    expect(inventoryRoomTag({ max_slots: 20, used_slots: 25 })).toBe('inventory_full')
    expect(inventoryRoomTag(null)).toBeNull()
  })
})

describe('computeUserExposureTags 통합 — JAM 2.0 태그', () => {
  const now = new Date('2026-10-27T03:00:00Z')
  const CHAPTER_TAGS = NEW_TAGS.slice(0, 4)
  const pick = (tags: string[]) => tags.filter((t) => NEW_TAGS.includes(t))

  function seed(user: string, rows: { chapter?: number; capsule?: [number, number]; balance?: number; inv?: [number, number] }) {
    if (rows.chapter !== undefined) fixtures.chapters[user] = { chapter_no: rows.chapter }
    if (rows.capsule) fixtures.capsules[user] = { filled: rows.capsule[0], required: rows.capsule[1] }
    if (rows.balance !== undefined) fixtures.wallets[user] = { balance: rows.balance }
    if (rows.inv) fixtures.inventories[user] = { used_slots: rows.inv[0], max_slots: rows.inv[1] }
  }

  it('조건을 만족하는 유저에게만 각 태그가 붙고, 행이 없는 유저는 하나도 받지 않는다', async () => {
    seed('u-a', { chapter: 2, capsule: [90, 100], balance: 250, inv: [20, 20] })
    seed('u-b', { chapter: 10, capsule: [100, 100], balance: 10, inv: [18, 20] })
    seed('u-c', { chapter: 5, capsule: [10, 100], balance: 100, inv: [5, 20] })

    const [a, b, c, none] = await Promise.all(
      ['u-a', 'u-b', 'u-c', 'u-none'].map((u) => computeUserExposureTags(u, now))
    )

    expect(pick(a)).toEqual(['chapter_1_3', 'capsule_nearly_full', 'jam_plenty', 'inventory_full'])
    expect(pick(b)).toEqual(['chapter_10', 'capsule_full', 'jam_low', 'inventory_nearly_full'])
    expect(pick(c)).toEqual(['chapter_4_6'])
    expect(pick(none)).toEqual([])
    // 기존 태그는 그대로 앞에 있다
    expect(a.slice(0, 2)).toEqual(['all', 'time_afternoon'])
  })

  it('지갑 행이 없는데 캡슐 행이 있으면 잔액 0으로 보고, 캡슐 행이 없으면 지갑이 있어도 잼 태그가 없다', async () => {
    seed('u-nowallet', { capsule: [0, 100] })
    seed('u-nocapsule', { balance: 9999 })
    expect(pick(await computeUserExposureTags('u-nowallet', now))).toEqual(['jam_low'])
    expect(pick(await computeUserExposureTags('u-nocapsule', now))).toEqual([])
  })

  it('새 표 4개는 호출마다 한 번씩만 읽는다', async () => {
    seed('u-count', { chapter: 1, capsule: [1, 100], balance: 1, inv: [1, 20] })
    fixtures.fromCalls = {}
    await computeUserExposureTags('u-count', now)
    for (const table of Object.keys(TABLE_FIXTURE)) expect(fixtures.fromCalls[table]).toBe(1)
  })

  it.each([
    { table: 'user_chapters', fn: 'getUserChapterNo', missing: 'chapter_4_6' },
    { table: 'user_capsules', fn: 'getUserCapsule', missing: 'capsule_nearly_full' },
    { table: 'jam_wallets', fn: 'getJamBalance', missing: 'jam_plenty' },
    { table: 'inventory', fn: 'getUserInventory', missing: 'inventory_nearly_full' },
  ])('$table 조회 오류면 console.error를 남기고 그 태그만 빠진다', async ({ table, fn, missing }) => {
    const user = `u-err-${table}`
    seed(user, { chapter: 5, capsule: [85, 100], balance: 500, inv: [18, 20] })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const healthy = pick(await computeUserExposureTags(user, now))
    expect(healthy).toEqual(['chapter_4_6', 'capsule_nearly_full', 'jam_plenty', 'inventory_nearly_full'])

    fixtures.errorTables[table] = `${table} 실패`
    const tags = pick(await computeUserExposureTags(user, now))
    delete fixtures.errorTables[table]

    expect(tags).not.toContain(missing)
    expect(tags).toEqual(healthy.filter((t) => t !== missing && !(table === 'user_capsules' && t === 'jam_plenty')))
    expect(errorSpy).toHaveBeenCalledWith(`[${fn}] ${table} 조회 오류:`, `${table} 실패`)
    errorSpy.mockRestore()
  })

  it('캡슐 조회가 실패하면 잼 태그도 붙지 않는다(필요량을 모르므로 잘못된 태그를 붙이지 않는다)', async () => {
    seed('u-cap-fail', { capsule: [0, 100], balance: 500 })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    fixtures.errorTables['user_capsules'] = '실패'
    const tags = pick(await computeUserExposureTags('u-cap-fail', now))
    delete fixtures.errorTables['user_capsules']
    errorSpy.mockRestore()
    expect(tags).toEqual([])
  })

  it('한 유저는 챕터 구간 1개, 캡슐·잼·인벤토리 태그 각 0~1개만 가진다(배타)', async () => {
    const combos: Array<Parameters<typeof seed>[1]> = []
    for (const chapter of [0, 1, 4, 7, 10, 11]) {
      for (const capsule of [[0, 100], [80, 100], [100, 100]] as [number, number][]) {
        for (const balance of [0, 40, 100, 200, 500]) {
          for (const inv of [[20, 20], [18, 20], [10, 20]] as [number, number][]) {
            combos.push({ chapter, capsule, balance, inv })
          }
        }
      }
    }
    for (const [i, combo] of combos.entries()) {
      const user = `u-excl-${i}`
      seed(user, combo)
      const tags = pick(await computeUserExposureTags(user, now))
      expect(tags.filter((t) => CHAPTER_TAGS.includes(t)).length).toBeLessThanOrEqual(1)
      expect(tags.filter((t) => t.startsWith('capsule_')).length).toBeLessThanOrEqual(1)
      expect(tags.filter((t) => t.startsWith('jam_')).length).toBeLessThanOrEqual(1)
      expect(tags.filter((t) => t.startsWith('inventory_')).length).toBeLessThanOrEqual(1)
    }
  })
})

describe('방출 태그 ↔ TODAY_EXPOSURE_TAG_OPTIONS 양쪽 대조 (JAM 2.0 태그)', () => {
  const optionValues = new Set(TODAY_EXPOSURE_TAG_OPTIONS.map((o) => o.value))

  it('입력을 훑어 방출한 새 태그가 모두 선택지에 있고, 새 선택지 10개가 모두 방출 가능하다', () => {
    const emitted = new Set<string>()
    for (let chapter = -1; chapter <= 12; chapter++) {
      const t = chapterBandTag(chapter)
      if (t) emitted.add(t)
    }
    for (let required = -1; required <= 300; required += 1) {
      for (let filled = 0; filled <= required + 2; filled += Math.max(1, Math.floor(required / 20))) {
        const t = capsuleGaugeTag({ filled, required })
        if (t) emitted.add(t)
      }
      for (let balance = 0; balance <= required * 3; balance += Math.max(1, Math.floor(required / 10))) {
        const t = jamBalanceTag(balance, { required })
        if (t) emitted.add(t)
      }
    }
    for (let used = 0; used <= 25; used++) {
      const t = inventoryRoomTag({ max_slots: 20, used_slots: used })
      if (t) emitted.add(t)
    }

    for (const tag of emitted) expect(optionValues.has(tag)).toBe(true)
    expect([...emitted].sort()).toEqual([...NEW_TAGS].sort())
    for (const tag of NEW_TAGS) expect(optionValues.has(tag)).toBe(true)
  })

  it('통합 경로로 방출된 모든 태그(기존 태그 포함)가 선택지에 있다', async () => {
    seed2()
    const tags = await computeUserExposureTags('u-opt', new Date('2026-10-27T03:00:00Z'), '2026-10-25T00:00:00Z')
    // 소속 트라이브 태그(tribe_<ID>)는 목록에 없고 형식으로 검사한다 (티켓 20261026_2030 2회차)
    for (const tag of tags) expect(optionValues.has(tag) || isTribeTag(tag)).toBe(true)
  })

  function seed2() {
    fixtures.chapters['u-opt'] = { chapter_no: 8 }
    fixtures.capsules['u-opt'] = { filled: 95, required: 100 }
    fixtures.wallets['u-opt'] = { balance: 250 }
    fixtures.inventories['u-opt'] = { used_slots: 19, max_slots: 20 }
  }
})
