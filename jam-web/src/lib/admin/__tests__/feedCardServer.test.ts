/**
 * 홈피드 카드 시드·색 자동 정하기의 서버 보조 (티켓 20261121_1531, 상위 20261120_2026 6회차-2).
 * 서비스 클라이언트는 운영 묶음 실행 시험의 메모리 DB(`FakeDb`)로 대신한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { completeFeedCardValues, fetchOverlappingBgUsage, serverRandomUint32 } from '@/lib/admin/feedCardServer'
import { DEFAULT_FEED_PALETTE } from '@/lib/today/feedAssign'
import { firstViolatedRule } from '@/lib/today/feedColorRules'
import { FEED_COLOR_KEYS } from '@/lib/today/feedConstants'
import { FakeDb } from '@/lib/admin/opsInbox/execute/__tests__/fakeDb'

const STARTS = '2026-12-01T00:00:00.000Z'
const ENDS = '2026-12-07T14:59:59.999Z'
const LOG_LABEL = '[시험 로그 머리말]'

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
})

function dbWith(rows: Array<Record<string, unknown>>): FakeDb {
  const db = new FakeDb()
  db.tables.today_cards = rows
  return db
}

describe('serverRandomUint32', () => {
  it('0 이상 2^32 미만 정수를 돌려준다', () => {
    for (let i = 0; i < 20; i++) {
      const value = serverRandomUint32()
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(2 ** 32)
    }
  })
})

describe('fetchOverlappingBgUsage — 같은 시기 노출 카드의 배경색 빈도', () => {
  it('기간이 겹치고 배경색이 있는 카드만 센다', async () => {
    const db = dbWith([
      { id: 'a', bg_color_key: 'red', starts_at: '2026-11-30T00:00:00.000Z', ends_at: '2026-12-02T00:00:00.000Z' }, // 앞쪽이 겹침
      { id: 'b', bg_color_key: 'red', starts_at: '2026-12-03T00:00:00.000Z', ends_at: '2026-12-04T00:00:00.000Z' }, // 안쪽
      { id: 'c', bg_color_key: 'blue', starts_at: '2026-12-06T00:00:00.000Z', ends_at: '2026-12-20T00:00:00.000Z' }, // 뒤쪽이 겹침
      { id: 'd', bg_color_key: 'green', starts_at: '2026-11-01T00:00:00.000Z', ends_at: '2026-11-30T23:59:59.000Z' }, // 앞서 끝남
      { id: 'e', bg_color_key: 'purple', starts_at: '2026-12-08T00:00:00.000Z', ends_at: '2026-12-09T00:00:00.000Z' }, // 뒤에 시작
      { id: 'f', bg_color_key: null, starts_at: '2026-12-02T00:00:00.000Z', ends_at: '2026-12-03T00:00:00.000Z' }, // 색 없음
    ])
    expect(await fetchOverlappingBgUsage(db.service, { startsAt: STARTS, endsAt: ENDS })).toEqual({ red: 2, blue: 1 })
  })

  it('기간 필터를 starts_at <= 끝, ends_at >= 시작으로 걸고 색 없는 행을 뺀다', async () => {
    const db = dbWith([])
    await fetchOverlappingBgUsage(db.service, { startsAt: STARTS, endsAt: ENDS })
    expect(db.calls).toHaveLength(1)
    expect(db.calls[0].filters).toEqual([
      ['starts_at <=', ENDS],
      ['ends_at >=', STARTS],
      ['bg_color_key not is', null],
    ])
  })

  it('excludeId가 있으면 그 카드는 세지 않고, 없으면 id 조건을 걸지 않는다', async () => {
    const db = dbWith([
      { id: 'self', bg_color_key: 'red', starts_at: STARTS, ends_at: ENDS },
      { id: 'other', bg_color_key: 'red', starts_at: STARTS, ends_at: ENDS },
    ])
    expect(await fetchOverlappingBgUsage(db.service, { startsAt: STARTS, endsAt: ENDS, excludeId: 'self' })).toEqual({ red: 1 })
    expect(db.calls[0].filters[0]).toEqual(['id !=', 'self'])
    expect(await fetchOverlappingBgUsage(db.service, { startsAt: STARTS, endsAt: ENDS })).toEqual({ red: 2 })
    expect(db.calls[1].filters.some(([name]) => name === 'id !=')).toBe(false)
  })

  it('기간이 비어 있으면(null·없음·글자 아님) DB를 읽지 않고 빈 빈도다', async () => {
    const db = dbWith([{ id: 'a', bg_color_key: 'red', starts_at: STARTS, ends_at: ENDS }])
    expect(await fetchOverlappingBgUsage(db.service, { startsAt: null, endsAt: ENDS })).toEqual({})
    expect(await fetchOverlappingBgUsage(db.service, { startsAt: STARTS, endsAt: undefined })).toEqual({})
    expect(await fetchOverlappingBgUsage(db.service, { startsAt: 123, endsAt: ENDS })).toEqual({})
    expect(db.calls).toEqual([])
  })

  it('조회가 실패하면 빈 빈도이고 오류는 지정한 머리말로 서버 로그에만 남는다', async () => {
    const db = dbWith([{ id: 'a', bg_color_key: 'red', starts_at: STARTS, ends_at: ENDS }])
    db.failIf = (call) => call.op === 'select'
    expect(await fetchOverlappingBgUsage(db.service, { startsAt: STARTS, endsAt: ENDS }, LOG_LABEL)).toEqual({})
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy.mock.calls[0][0]).toBe(LOG_LABEL)
  })
})

describe('completeFeedCardValues — 비어 있는 시드와 색 정하기', () => {
  const period = { startsAt: STARTS, endsAt: ENDS }

  it('비어 있으면 서버 난수로 시드를 정하고 세 색 키를 채운다', async () => {
    const decided = await completeFeedCardValues(dbWith([]).service, {}, period, () => 123456)
    expect(decided.feed_seed).toBe(123456)
    for (const key of [decided.bg_color_key, decided.chip_color_key, decided.box_color_key]) expect(FEED_COLOR_KEYS).toContain(key)
  })

  it('지정한 시드·색은 덮어쓰지 않는다', async () => {
    const decided = await completeFeedCardValues(
      dbWith([]).service,
      { feed_seed: 42, bg_color_key: 'yellow', chip_color_key: 'purple' },
      period,
      () => 999,
    )
    expect(decided.feed_seed).toBe(42)
    expect(decided.bg_color_key).toBe('yellow')
    expect(decided.chip_color_key).toBe('purple')
    expect(FEED_COLOR_KEYS).toContain(decided.box_color_key) // 비어 있던 칸만 정한다
  })

  it('같은 시드·같은 빈도는 같은 값이다', async () => {
    const rows = [{ id: 'a', bg_color_key: 'red', starts_at: STARTS, ends_at: ENDS }]
    const first = await completeFeedCardValues(dbWith(rows).service, {}, period, () => 777)
    const second = await completeFeedCardValues(dbWith(rows).service, {}, period, () => 777)
    expect(second).toEqual(first)
  })

  it('같은 시기에 가장 덜 쓰인 배경색을 고른다', async () => {
    // 'green'만 비어 있고 나머지 색은 한 번씩 쓰였다.
    const rows = FEED_COLOR_KEYS.filter((key) => key !== 'green').map((key, index) => ({
      id: `used-${index}`,
      bg_color_key: key,
      starts_at: STARTS,
      ends_at: ENDS,
    }))
    for (const seed of [1, 2, 3, 4, 5]) {
      const decided = await completeFeedCardValues(dbWith(rows).service, {}, period, () => seed)
      expect(decided.bg_color_key).toBe('green')
    }
  })

  it('excludeId로 자기 자신은 빈도에서 뺀다', async () => {
    // 자기 자신이 이미 'green'을 쓰고 있어도(수정·재시도), 뺀 빈도로 정한다.
    const rows = FEED_COLOR_KEYS.map((key, index) => ({ id: key === 'green' ? 'self' : `used-${index}`, bg_color_key: key, starts_at: STARTS, ends_at: ENDS }))
    const decided = await completeFeedCardValues(dbWith(rows).service, {}, { ...period, excludeId: 'self' }, () => 9)
    expect(decided.bg_color_key).toBe('green')
  })

  it('시드 100개의 자동 배정이 색 규칙을 모두 통과하고 기본 조합으로 되돌리지 않는다', async () => {
    const db = dbWith([])
    for (let seed = 1; seed <= 100; seed++) {
      const decided = await completeFeedCardValues(db.service, {}, period, () => seed * 40503)
      expect(decided.usedFallback).toBe(false)
      expect(decided.warnings).toEqual([])
      const bg = DEFAULT_FEED_PALETTE[decided.bg_color_key]
      const chip = DEFAULT_FEED_PALETTE[decided.chip_color_key]
      const box = DEFAULT_FEED_PALETTE[decided.box_color_key]
      expect(firstViolatedRule(bg, chip, { involvesChip: true })).toBeNull()
      expect(firstViolatedRule(chip, box, { involvesChip: true })).toBeNull()
      expect(firstViolatedRule(bg, box, { involvesChip: false })).toBeNull()
    }
  })

  it('통과하는 조합이 없으면 기본 조합으로 되돌리고 usedFallback으로 알린다', async () => {
    // 배경 red와 칩 blue-soft를 지정하면 맞는 박스 색이 없다(지정값끼리는 검사하지 않는다).
    const decided = await completeFeedCardValues(dbWith([]).service, { bg_color_key: 'red', chip_color_key: 'blue-soft' }, period, () => 1)
    expect(decided.usedFallback).toBe(true)
    expect(decided.bg_color_key).toBe('red')
    expect(decided.chip_color_key).toBe('blue-soft')
    expect(decided.warnings).toHaveLength(1)
  })

  it('빈도 조회가 실패해도 정한다(빈 빈도)', async () => {
    const db = dbWith([{ id: 'a', bg_color_key: 'red', starts_at: STARTS, ends_at: ENDS }])
    db.failIf = (call) => call.op === 'select'
    const decided = await completeFeedCardValues(db.service, {}, period, () => 5, LOG_LABEL)
    expect(decided.feed_seed).toBe(5)
    expect(errorSpy).toHaveBeenCalledWith(LOG_LABEL, expect.anything())
  })
})
