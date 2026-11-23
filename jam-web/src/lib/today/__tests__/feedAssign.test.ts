/**
 * 홈피드 자동 배정 — 색(배경·칩·박스)과 칩 자리·기울기 (티켓 20261121_0012)
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/feedAssign.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  assignChipPlacement,
  assignFeedColors,
  DEFAULT_FEED_PALETTE,
  FEED_FALLBACK_COLORS,
  type ExcludedColorPair,
  type FeedColorAssignment,
} from '../feedAssign'
import {
  chipLimitOf,
  diagonalOf,
  FEED_CHIP_SLOT_SPECS,
  FEED_SLOT_PATTERN,
  FEED_TYPES,
  MAX_CARD_CHIPS,
  type FeedType,
} from '../feedChipSlots'
import { passesColorRules, violatesImageColorRule } from '../feedColorRules'
import { FEED_COLOR_KEYS, FEED_NEW_COLOR_KEYS, FEED_TILTS } from '../feedConstants'

const hexOf = (key: string) => DEFAULT_FEED_PALETTE[key]

/** 세 색이 서로 규칙을 통과하는가(배경↔칩·칩↔박스는 ①~④, 배경↔박스는 ①~③). */
function triplePasses(r: Pick<FeedColorAssignment, 'bg' | 'chip' | 'box'>): boolean {
  return (
    passesColorRules(hexOf(r.bg), hexOf(r.chip), { involvesChip: true }) &&
    passesColorRules(hexOf(r.chip), hexOf(r.box), { involvesChip: true }) &&
    passesColorRules(hexOf(r.bg), hexOf(r.box), { involvesChip: false })
  )
}

function isExcluded(r: Pick<FeedColorAssignment, 'bg' | 'chip' | 'box'>, excluded: readonly ExcludedColorPair[]) {
  const pairs: ExcludedColorPair[] = [
    [r.bg, r.chip],
    [r.chip, r.box],
    [r.bg, r.box],
  ]
  return pairs.some(([a, b]) => excluded.some(([x, y]) => (x === a && y === b) || (x === b && y === a)))
}

const seeds = (count: number) => Array.from({ length: count }, (_, i) => `card-${i}`)

describe('assignFeedColors', () => {
  it('같은 시드는 같은 값이고, 시드가 다르면 값이 갈린다', () => {
    const a = assignFeedColors({ seed: 'card-1' })
    expect(assignFeedColors({ seed: 'card-1' })).toEqual(a)
    expect(assignFeedColors({ seed: 1 })).toEqual(assignFeedColors({ seed: '1' }))
    const distinct = new Set(seeds(40).map((seed) => JSON.stringify(assignFeedColors({ seed }))))
    expect(distinct.size).toBeGreaterThan(10)
  })

  it('카드 100장 이상: 모두 규칙을 통과하는 조합이고 제외 목록과 겹치지 않으며 흰색이 없다', () => {
    const excluded: ExcludedColorPair[] = [
      ['red', 'red-soft'],
      ['blue', 'ref-blue'],
      ['ref-red', 'ref-lime'],
      ['yellow-soft', 'ref-red'],
      ['purple', 'yellow'],
    ]
    const palette = { ...DEFAULT_FEED_PALETTE, white: '#FFFFFF' }
    for (const seed of seeds(160)) {
      const result = assignFeedColors({ seed }, { palette, excludedPairs: excluded })
      expect(result.usedFallback).toBe(false)
      expect(triplePasses(result)).toBe(true)
      expect(isExcluded(result, excluded)).toBe(false)
      expect([result.bg, result.chip, result.box]).not.toContain('white')
      for (const key of FEED_NEW_COLOR_KEYS) expect([result.bg, result.chip, result.box]).not.toContain(key)
      for (const key of [result.bg, result.chip, result.box]) expect(FEED_COLOR_KEYS).toContain(key)
    }
  })

  it('제외 목록이 없는 기본 조건에서도 160장이 모두 규칙을 통과한다', () => {
    for (const seed of seeds(160)) {
      const result = assignFeedColors({ seed })
      expect(result.usedFallback).toBe(false)
      expect(triplePasses(result)).toBe(true)
    }
  })

  it('지정한 값은 덮어쓰지 않는다(일부만 지정해도, 규칙에 걸리는 조합을 지정해도)', () => {
    for (const seed of seeds(30)) {
      expect(assignFeedColors({ seed, fixed: { bg: 'ref-pink' } }).bg).toBe('ref-pink')
      expect(assignFeedColors({ seed, fixed: { chip: 'blue' } }).chip).toBe('blue')
      expect(assignFeedColors({ seed, fixed: { box: 'ref-red' } }).box).toBe('ref-red')
      const partial = assignFeedColors({ seed, fixed: { bg: 'red-soft', chip: 'red' } })
      expect(partial).toMatchObject({ bg: 'red-soft', chip: 'red', usedFallback: false })
      // 지정하지 않은 칸은 지정값과 규칙을 통과하는 색이다
      expect(passesColorRules(hexOf('red-soft'), hexOf(partial.box), { involvesChip: false })).toBe(true)
      expect(passesColorRules(hexOf('red'), hexOf(partial.box), { involvesChip: true })).toBe(true)
    }
    // 셋 다 지정하면 규칙에 걸려도 그대로다(수동 지정은 경고만 하고 막지 않는다)
    const forced = assignFeedColors({ seed: 'x', fixed: { bg: 'red', chip: 'red-soft', box: 'red' } })
    expect(forced).toEqual({ bg: 'red', chip: 'red-soft', box: 'red', usedFallback: false })
  })

  it('빈 문자열·null 지정은 «지정 없음»이다', () => {
    const auto = assignFeedColors({ seed: 'card-7' })
    expect(assignFeedColors({ seed: 'card-7', fixed: { bg: '', chip: null, box: undefined } })).toEqual(auto)
  })

  it('지정값으로 흰색을 쓸 수 있고, 남은 칸은 흰색과 규칙을 통과하는 색이다', () => {
    const palette = { ...DEFAULT_FEED_PALETTE, white: '#FFFFFF' }
    for (const seed of seeds(30)) {
      const result = assignFeedColors({ seed, fixed: { bg: 'white' } }, { palette })
      expect(result.bg).toBe('white')
      expect(result.usedFallback).toBe(false)
      expect(passesColorRules('#FFFFFF', hexOf(result.chip), { involvesChip: true })).toBe(true)
      expect(passesColorRules('#FFFFFF', hexOf(result.box), { involvesChip: false })).toBe(true)
    }
  })

  it('배경색은 사용 빈도가 낮은 쪽으로 퍼진다', () => {
    // 한 색만 0이고 나머지는 많이 쓰였다면 그 색이 고른다
    const usage = Object.fromEntries(FEED_COLOR_KEYS.map((key) => [key, 10]))
    usage['blue-soft'] = 0
    for (const seed of seeds(20)) {
      expect(assignFeedColors({ seed, bgUsage: usage }).bg).toBe('blue-soft')
    }

    // 카드를 하나씩 등록하며 빈도를 쌓으면 조합이 남아 있는 배경색의 사용 횟수가 서로 1 이상 벌어지지 않는다
    const counts: Record<string, number> = {}
    for (const seed of seeds(150)) {
      const { bg } = assignFeedColors({ seed, bgUsage: counts })
      counts[bg] = (counts[bg] ?? 0) + 1
    }
    const used = Object.values(counts)
    expect(used.length).toBeGreaterThanOrEqual(8)
    expect(Math.max(...used) - Math.min(...used)).toBeLessThanOrEqual(1)
  })

  it('빈도가 같으면(동률) 시드가 정한다: 시드마다 다른 배경이 나오고 같은 시드는 같다', () => {
    const bgs = seeds(60).map((seed) => assignFeedColors({ seed, bgUsage: {} }).bg)
    expect(new Set(bgs).size).toBeGreaterThan(3)
    expect(assignFeedColors({ seed: 'tie', bgUsage: {} })).toEqual(assignFeedColors({ seed: 'tie', bgUsage: {} }))
  })

  it('통과하는 조합이 없으면 안전한 기본 조합으로 되돌리고 그렇게 됐다는 표시를 담는다', () => {
    const everyPair: ExcludedColorPair[] = []
    for (const a of FEED_COLOR_KEYS) for (const b of FEED_COLOR_KEYS) if (a !== b) everyPair.push([a, b])
    const result = assignFeedColors({ seed: 'card-1' }, { excludedPairs: everyPair })
    expect(result).toEqual({ ...FEED_FALLBACK_COLORS, usedFallback: true })

    // 지정한 값은 남기고 비어 있는 칸만 기본 조합으로 채운다
    const partial = assignFeedColors({ seed: 'card-1', fixed: { bg: 'yellow' } }, { excludedPairs: everyPair })
    expect(partial).toEqual({ bg: 'yellow', chip: FEED_FALLBACK_COLORS.chip, box: FEED_FALLBACK_COLORS.box, usedFallback: true })

    // 색이 서로 규칙에 걸리는 표(같은 색상 세 개)도 같다
    const similar = { a: '#FF1D1D', b: '#FF2020', c: '#FE1D1E' }
    expect(assignFeedColors({ seed: 'card-1' }, { palette: similar }).usedFallback).toBe(true)
  })

  it('기본 조합은 기본 15색 표에서 규칙을 모두 통과한다', () => {
    expect(triplePasses(FEED_FALLBACK_COLORS)).toBe(true)
  })

  it('hex 표를 바꿔 넣으면 그 표 안에서 배정한다(색 키 표에 묶여 있지 않다)', () => {
    const palette = { ink: '#101010', paper: '#F4F4F4', mint: '#59C02B', rose: '#E57FBB' }
    for (const seed of seeds(20)) {
      const result = assignFeedColors({ seed }, { palette, fallback: { bg: 'paper', chip: 'ink', box: 'mint' } })
      if (result.usedFallback) continue
      for (const key of [result.bg, result.chip, result.box]) expect(Object.keys(palette)).toContain(key)
    }
  })
})

describe('assignFeedColors — 이미지 대표 색 규칙 ⑤·⑥ (티켓 20261121_1828)', () => {
  const many = seeds(120)
  const imageRed = ['#f5442c']
  const imageMulti = ['#f5442c', '#95c1f7', '#c0dc66']

  it('이미지 입력을 주지 않거나 비워 두면 결과가 예전과 완전히 같다(imageRuleSkipped 칸도 없다)', () => {
    for (const seed of many) {
      const base = assignFeedColors({ seed })
      expect(assignFeedColors({ seed, imageHexes: undefined, chipOnImage: undefined })).toStrictEqual(base)
      expect(assignFeedColors({ seed, imageHexes: [] })).toStrictEqual(base)
      expect(assignFeedColors({ seed, imageHexes: [], chipOnImage: true })).toStrictEqual(base)
      expect(assignFeedColors({ seed, imageHexes: ['not-a-color'] })).toStrictEqual(base)
      expect(base).not.toHaveProperty('imageRuleSkipped')
    }
  })

  it('칩이 이미지 위에 걸리지 않으면 배경만 규칙 ⑤를 통과한다. 칩 후보는 이미지로 거르지 않는다', () => {
    const chips = new Set<string>()
    for (const seed of many) {
      const result = assignFeedColors({ seed, imageHexes: imageMulti, chipOnImage: false })
      expect(result.imageRuleSkipped).toBeUndefined()
      expect(violatesImageColorRule(hexOf(result.bg), imageMulti)).toBe(false)
      expect(triplePasses(result)).toBe(true)
      chips.add(result.chip)
    }
    // 칩을 거르지 않으므로 이미지와 비슷한 칩 색도 나올 수 있다(거르면 나올 수 없다)
    expect([...chips].some((key) => violatesImageColorRule(hexOf(key), imageMulti))).toBe(true)
  })

  it('시드 100개 이상: 칩이 이미지 위에 걸리면 배경·칩 모두 규칙 ⑤·⑥과 기존 규칙 ①~④를 통과한다', () => {
    for (const seed of many) {
      const result = assignFeedColors({ seed, imageHexes: imageMulti, chipOnImage: true })
      expect(result.usedFallback).toBe(false)
      expect(result.imageRuleSkipped).toBeUndefined()
      expect(violatesImageColorRule(hexOf(result.bg), imageMulti)).toBe(false)
      expect(violatesImageColorRule(hexOf(result.chip), imageMulti)).toBe(false)
      expect(triplePasses(result)).toBe(true)
    }
  })

  it('같은 입력은 같은 결과다(시드 결정성)', () => {
    for (const seed of seeds(30)) {
      const input = { seed, imageHexes: imageRed, chipOnImage: true }
      expect(assignFeedColors(input)).toStrictEqual(assignFeedColors({ ...input, imageHexes: [...imageRed] }))
    }
  })

  it('이미지에 묻히는 색은 자동 배정에서 빠진다(이미지와 같은 색 키가 나오지 않는다)', () => {
    const imageHex = hexOf('red')
    for (const seed of many) {
      const result = assignFeedColors({ seed, imageHexes: [imageHex], chipOnImage: true })
      expect(result.bg).not.toBe('red')
      expect(result.chip).not.toBe('red')
    }
  })

  it('지정값은 덮어쓰지 않고 걸러 내지도 않는다(경고는 7-7의 몫)', () => {
    for (const seed of seeds(40)) {
      const result = assignFeedColors({
        seed,
        imageHexes: [hexOf('red')],
        chipOnImage: true,
        fixed: { bg: 'red', chip: 'red-soft' },
      })
      expect(result.bg).toBe('red')
      expect(result.chip).toBe('red-soft')
      expect(result.imageRuleSkipped).toBeUndefined()
    }
  })

  it('조합이 하나도 없으면 이미지 규칙만 건너뛰고 기존 규칙으로 정한다(imageRuleSkipped, usedFallback과 구분)', () => {
    // 모든 자동 후보 색이 이미지 대표 색에 걸리는 경우: 이미지 대표 색을 15색 전부로 준다
    const everything = Object.values(DEFAULT_FEED_PALETTE)
    for (const seed of seeds(40)) {
      const skipped = assignFeedColors({ seed, imageHexes: everything, chipOnImage: true })
      expect(skipped.imageRuleSkipped).toBe(true)
      expect(skipped.usedFallback).toBe(false)
      // 건너뛴 결과는 이미지 입력이 없을 때의 결과와 같은 조합 규칙을 쓴다
      expect(triplePasses(skipped)).toBe(true)
    }
  })

  it('건너뛰고도 조합이 없으면 기본 조합이고 두 표시가 모두 켜진다', () => {
    const everything = Object.values(DEFAULT_FEED_PALETTE)
    const everyPair: ExcludedColorPair[] = []
    for (const a of FEED_COLOR_KEYS) for (const b of FEED_COLOR_KEYS) if (a !== b) everyPair.push([a, b])
    const result = assignFeedColors({ seed: 'card-1', imageHexes: everything, chipOnImage: true }, { excludedPairs: everyPair })
    expect(result.usedFallback).toBe(true)
    expect(result.imageRuleSkipped).toBe(true)
    expect({ bg: result.bg, chip: result.chip, box: result.box }).toEqual(FEED_FALLBACK_COLORS)
  })

  it('이미지 대표 색이 있어도 다른 시드는 여전히 다른 값으로 갈린다', () => {
    const distinct = new Set(seeds(40).map((seed) => JSON.stringify(assignFeedColors({ seed, imageHexes: imageRed, chipOnImage: true }))))
    expect(distinct.size).toBeGreaterThan(10)
  })
})

describe('feedChipSlots', () => {
  it('유형 키는 DB feed_type의 허용 값 8개와 같다', () => {
    expect([...FEED_TYPES].sort()).toEqual(
      ['hero_box', 'full_image', 'badge_intro', 'badge_only', 'collection_intro', 'drop_pickup', 'text_box', 'gallery_list'].sort(),
    )
    expect(Object.keys(FEED_CHIP_SLOT_SPECS).sort()).toEqual([...FEED_TYPES].sort())
  })

  it('자리 이름은 DB 규칙(소문자·숫자·하이픈 24자 이내)을 따르고, 대각선 짝은 그 유형의 자리다', () => {
    for (const type of FEED_TYPES) {
      const spec = FEED_CHIP_SLOT_SPECS[type]
      for (const slot of spec.slots) expect(FEED_SLOT_PATTERN.test(slot)).toBe(true)
      for (const [a, b] of spec.diagonalPairs) {
        expect(spec.slots).toContain(a)
        expect(spec.slots).toContain(b)
        expect(a).not.toBe(b)
        expect(diagonalOf(type, a)).toBe(b)
        expect(diagonalOf(type, b)).toBe(a)
      }
    }
  })

  it('칩 개수 상한: 배지만 0, 목록형 1, 나머지(드랍·픽업 포함) 2', () => {
    expect(chipLimitOf('badge_only')).toBe(0)
    expect(chipLimitOf('gallery_list')).toBe(1)
    for (const type of ['hero_box', 'full_image', 'badge_intro', 'collection_intro', 'drop_pickup', 'text_box'] as FeedType[]) {
      expect(chipLimitOf(type)).toBe(MAX_CARD_CHIPS)
    }
  })
})

describe('assignChipPlacement', () => {
  it('같은 시드는 같은 값이다', () => {
    const input = { seed: 'card-1', feedType: 'hero_box' as const, chipCount: 2 }
    expect(assignChipPlacement(input)).toEqual(assignChipPlacement(input))
    expect(assignChipPlacement({ ...input, seed: 1 })).toEqual(assignChipPlacement({ ...input, seed: '1' }))
  })

  it('칩이 2개면 서로 대각선 자리이고, 기울기는 여섯 값 중 하나이며 두 칩이 같지 않다', () => {
    for (const type of ['hero_box', 'full_image', 'badge_intro', 'collection_intro', 'drop_pickup', 'text_box'] as FeedType[]) {
      for (const seed of seeds(60)) {
        const [first, second, ...rest] = assignChipPlacement({ seed, feedType: type, chipCount: 2 })
        expect(rest).toEqual([])
        expect(diagonalOf(type, first.slot)).toBe(second.slot)
        expect(FEED_CHIP_SLOT_SPECS[type].slots).toContain(first.slot)
        expect(FEED_TILTS as readonly number[]).toContain(first.tilt)
        expect(FEED_TILTS as readonly number[]).toContain(second.tilt)
        expect(second.tilt).not.toBe(first.tilt)
      }
    }
  })

  it('자리가 하나뿐인 목록형은 칩을 1개만 둔다(많이 요청해도)', () => {
    expect(assignChipPlacement({ seed: 's', feedType: 'gallery_list', chipCount: 2 })).toEqual([
      { slot: 'card-top-right', tilt: expect.any(Number) },
    ])
  })

  it('드랍·픽업은 박스 줄 모서리 네 자리 중 대각선 두 자리에 칩 2개를 두고, 많이 요청해도 2개다', () => {
    expect(FEED_CHIP_SLOT_SPECS.drop_pickup.slots).toEqual([
      'box-row-top-left',
      'box-row-top-right',
      'box-row-bottom-left',
      'box-row-bottom-right',
    ])
    const drop = assignChipPlacement({ seed: 's', feedType: 'drop_pickup', chipCount: 5 })
    expect(drop).toHaveLength(2)
    expect(diagonalOf('drop_pickup', drop[0].slot)).toBe(drop[1].slot)
    expect(assignChipPlacement({ seed: 's', feedType: 'drop_pickup', chipCount: 1 })).toHaveLength(1)
  })

  it('«배지만»은 칩이 없다', () => {
    expect(assignChipPlacement({ seed: 's', feedType: 'badge_only', chipCount: 2 })).toEqual([])
  })

  it('요청 개수가 0·음수·숫자가 아니면 칩이 없고, 3개 이상은 2개로 자른다', () => {
    expect(assignChipPlacement({ seed: 's', feedType: 'hero_box', chipCount: 0 })).toEqual([])
    expect(assignChipPlacement({ seed: 's', feedType: 'hero_box', chipCount: -1 })).toEqual([])
    expect(assignChipPlacement({ seed: 's', feedType: 'hero_box', chipCount: Number.NaN })).toEqual([])
    expect(assignChipPlacement({ seed: 's', feedType: 'hero_box', chipCount: 3 })).toHaveLength(2)
  })

  it('칩 1개는 허용 자리 중 하나이고, 시드마다 여러 자리가 나온다', () => {
    const slots = seeds(80).map((seed) => assignChipPlacement({ seed, feedType: 'text_box', chipCount: 1 })[0].slot)
    for (const slot of slots) expect(FEED_CHIP_SLOT_SPECS.text_box.slots).toContain(slot)
    expect(new Set(slots).size).toBeGreaterThan(1)
  })

  it('지정한 자리·기울기는 덮어쓰지 않는다', () => {
    const placed = assignChipPlacement({
      seed: 'card-1',
      feedType: 'hero_box',
      chipCount: 2,
      fixed: [{ slot: 'image-top-left', tilt: -4 }, { tilt: 8 }],
    })
    expect(placed[0]).toEqual({ slot: 'image-top-left', tilt: -4 })
    // 한쪽 자리만 지정하면 나머지는 그 대각선 맞은편이다
    expect(placed[1]).toEqual({ slot: 'image-bottom-right', tilt: 8 })

    const second = assignChipPlacement({
      seed: 'card-1',
      feedType: 'hero_box',
      chipCount: 2,
      fixed: [null, { slot: 'image-bottom-left' }],
    })
    expect(second[0].slot).toBe('image-top-right')
    expect(second[1].slot).toBe('image-bottom-left')

    const single = assignChipPlacement({
      seed: 'card-1',
      feedType: 'gallery_list',
      chipCount: 1,
      fixed: [{ slot: 'card-top-right', tilt: 6 }],
    })
    expect(single).toEqual([{ slot: 'card-top-right', tilt: 6 }])
  })

  it('대각선 맞은편이 없는 자리를 지정하면 다른 자리를 고른다', () => {
    // 전체 배경 이미지의 «image-top-right»는 칩 1개 전용 자리다
    for (const seed of seeds(20)) {
      const [first, second] = assignChipPlacement({
        seed,
        feedType: 'full_image',
        chipCount: 2,
        fixed: [{ slot: 'image-top-right' }],
      })
      expect(first.slot).toBe('image-top-right')
      expect(second.slot).not.toBe('image-top-right')
      expect(FEED_CHIP_SLOT_SPECS.full_image.slots).toContain(second.slot)
    }
  })
})
