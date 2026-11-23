/**
 * decideFeedCardValues — 저장 때 시드·색 키를 정해 고정한다 (티켓 20261121_1315)
 *
 *  - 사용자가 고른 값은 보존, 같은 입력은 같은 값
 *  - 통합 팔레트 쓰임 표·배제 표를 지킨다(티켓 20261122_2224 회차 4·5)
 *  - 시드 100개를 바꿔 돌려도 색 규칙 위반 0
 *  - 통과 조합이 없어 기본 조합으로 되돌리면 표시한다
 */
import { describe, expect, it } from 'vitest'
import { assignFeedColors, FEED_FALLBACK_COLORS } from '@/lib/today/feedAssign'
import { chipExclusionRule } from '@/lib/today/feedColorRules'
import { boxAllowedFor, FEED_COLOR_KEYS, FEED_COLOR_USAGE } from '@/lib/today/feedConstants'
import { countBgUsage, createFeedSeed, decideFeedCardValues } from '../feedCardFields'

describe('createFeedSeed — 난수 공급 함수를 인자로 받는다', () => {
  it('공급한 값을 0 이상 2^32 미만 정수로 돌려준다', () => {
    expect(createFeedSeed(() => 0)).toBe(0)
    expect(createFeedSeed(() => 4294967295)).toBe(4294967295)
    expect(createFeedSeed(() => 123456.9)).toBe(123456)
    expect(createFeedSeed(() => 4294967296 + 5)).toBe(5)
    expect(createFeedSeed(() => Number.NaN)).toBe(0)
  })

  it('실제 서버 난수(crypto)도 범위 안이다', () => {
    for (let i = 0; i < 50; i += 1) {
      const seed = createFeedSeed(() => crypto.getRandomValues(new Uint32Array(1))[0])
      expect(Number.isInteger(seed)).toBe(true)
      expect(seed).toBeGreaterThanOrEqual(0)
      expect(seed).toBeLessThan(2 ** 32)
    }
  })
})

describe('countBgUsage', () => {
  it('색 키별 장수를 세고 색 키가 없는 카드는 세지 않는다', () => {
    expect(countBgUsage([{ bg_color_key: 'red' }, { bg_color_key: 'red' }, { bg_color_key: 'blue' }, { bg_color_key: null }, {}])).toEqual({ red: 2, blue: 1 })
    expect(countBgUsage([])).toEqual({})
  })
})

describe('decideFeedCardValues', () => {
  it('비어 있는 색 키 3개와 시드를 정한다', () => {
    const decided = decideFeedCardValues({ columns: {}, seed: 4242 })
    expect(decided.feed_seed).toBe(4242)
    for (const key of [decided.bg_color_key, decided.chip_color_key, decided.box_color_key]) {
      expect((FEED_COLOR_KEYS as readonly string[]).includes(key)).toBe(true)
    }
    expect(decided.usedFallback).toBe(false)
    expect(decided.warnings).toEqual([])
  })

  it('같은 시드·같은 빈도는 같은 값이고, 자동 배정 함수와도 같다', () => {
    const usage = { red: 3, blue: 1 }
    const a = decideFeedCardValues({ columns: {}, seed: 99, overlappingBgUsage: usage, excludedPairs: [] })
    const b = decideFeedCardValues({ columns: {}, seed: 99, overlappingBgUsage: usage, excludedPairs: [] })
    expect(a).toEqual(b)
    const direct = assignFeedColors({ seed: 99, bgUsage: usage })
    expect([a.bg_color_key, a.chip_color_key, a.box_color_key]).toEqual([direct.bg, direct.chip, direct.box])
  })

  it('사용자가 고른 값은 덮어쓰지 않는다', () => {
    const decided = decideFeedCardValues({ columns: { bg_color_key: 'ref-pink', chip_color_key: 'blue' }, seed: 7 })
    expect(decided.bg_color_key).toBe('ref-pink')
    expect(decided.chip_color_key).toBe('blue')
    // 고르지 않은 칸만 자동이다
    expect((FEED_COLOR_KEYS as readonly string[]).includes(decided.box_color_key)).toBe(true)
    // 흰색 같은 자동 배정 밖의 지정값도 그대로다(지정값끼리는 규칙을 보지 않는다)
    const all = decideFeedCardValues({ columns: { bg_color_key: 'red', chip_color_key: 'red', box_color_key: 'red' }, seed: 7 })
    expect([all.bg_color_key, all.chip_color_key, all.box_color_key]).toEqual(['red', 'red', 'red'])
  })

  it('시드가 이미 있으면 그 시드를 쓰고, 넘긴 seed는 비어 있을 때만 쓴다', () => {
    expect(decideFeedCardValues({ columns: { feed_seed: 5 }, seed: 99 }).feed_seed).toBe(5)
    expect(decideFeedCardValues({ columns: { feed_seed: null }, seed: 99 }).feed_seed).toBe(99)
    expect(decideFeedCardValues({ columns: { feed_seed: 0 }, seed: 99 }).feed_seed).toBe(0)
  })

  it('자동으로 정한 세 색은 통합 팔레트 쓰임 표의 키뿐이고, 옛 사용 빈도 입력은 배정에 영향을 주지 않는다', () => {
    const usage = { yellow: 9, green: 0 }
    for (let seed = 1; seed <= 20; seed += 1) {
      const decided = decideFeedCardValues({ columns: {}, seed, overlappingBgUsage: usage })
      expect(FEED_COLOR_USAGE.bg as readonly string[]).toContain(decided.bg_color_key)
      expect(FEED_COLOR_USAGE.box as readonly string[]).toContain(decided.box_color_key)
      expect(FEED_COLOR_USAGE.valueChip as readonly string[]).toContain(decided.chip_color_key)
      expect(decideFeedCardValues({ columns: {}, seed })).toEqual(decided)
    }
  })

  it('시드 100개를 바꿔 돌려도 자동으로 정한 색 조합이 쓰임 표와 배제 표를 통과한다', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const usage = seed % 2 === 0 ? { red: seed % 5, blue: seed % 3, 'ref-lime': 1 } : undefined
      const d = decideFeedCardValues({ columns: {}, seed: seed * 7919, overlappingBgUsage: usage })
      expect(d.usedFallback, `seed ${seed}`).toBe(false)
      expect(FEED_COLOR_USAGE.bg as readonly string[], `bg ${seed}`).toContain(d.bg_color_key)
      expect(FEED_COLOR_USAGE.valueChip as readonly string[], `chip ${seed}`).toContain(d.chip_color_key)
      expect(boxAllowedFor(d.box_color_key, true), `box ${seed}`).toBe(true)
      expect(chipExclusionRule(d.chip_color_key, d.bg_color_key), `chip-bg ${seed}`).toBeNull()
      expect(chipExclusionRule(d.chip_color_key, d.box_color_key), `chip-box ${seed}`).toBeNull()
    }
  })

  it('지정값 하나를 고정해도 시드 100개 모두 그 값과 배제 표를 통과하는 짝을 찾는다', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const d = decideFeedCardValues({ columns: { chip_color_key: 'ref-blue' }, seed })
      expect(d.chip_color_key).toBe('ref-blue')
      expect(d.usedFallback, `seed ${seed}`).toBe(false)
      expect(chipExclusionRule('ref-blue', d.bg_color_key)).toBeNull()
      expect(chipExclusionRule('ref-blue', d.box_color_key)).toBeNull()
    }
  })

  it('통과 조합이 없어 기본 조합으로 되돌리면 usedFallback과 경고로 알린다', () => {
    // 지정값과 통과하는 짝이 하나도 없도록 제외 목록으로 모든 짝을 막는다
    const keys = FEED_COLOR_KEYS as readonly string[]
    const excludedPairs = keys.flatMap((a) => keys.map((b) => [a, b] as const))
    const decided = decideFeedCardValues({ columns: { bg_color_key: 'ref-pink' }, seed: 3, excludedPairs })
    expect(decided.usedFallback).toBe(true)
    expect(decided.bg_color_key).toBe('ref-pink')
    expect(decided.chip_color_key).toBe(FEED_FALLBACK_COLORS.chip)
    expect(decided.box_color_key).toBe(FEED_FALLBACK_COLORS.box)
    expect(decided.warnings).toHaveLength(1)
    expect(decided.warnings[0]).toContain('기본 조합')
  })
})
