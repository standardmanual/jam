/**
 * 홈피드 자동 배정 — 색(배경·칩·박스)과 칩 자리·기울기 (티켓 20261121_0012, 색은 통합 팔레트 규칙으로 다시 씀: 티켓 20261122_2224 회차 4·5)
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/feedAssign.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  assignChipPlacement,
  assignFeedColors,
  DEEP_GREEN_CHANCE_AT_MIN,
  DEFAULT_FEED_PALETTE,
  FEED_FALLBACK_COLORS,
  type ExcludedColorPair,
  type FeedColorAssignInput,
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
import { chipExclusionRule, violatesImageColorRule } from '../feedColorRules'
import {
  boxAllowedFor,
  FEED_BG_BOX_COMBOS,
  FEED_COLOR_KEYS,
  FEED_COLOR_USAGE,
  FEED_DEEP_GREEN_COMBOS,
  FEED_DEEP_GREEN_KEY,
  FEED_DEEP_GREEN_RHYTHM,
  FEED_TILTS,
} from '../feedConstants'

const hexOf = (key: string) => DEFAULT_FEED_PALETTE[key]

type Triple = Pick<FeedColorAssignment, 'bg' | 'chip' | 'box'>

const asList = (values: readonly string[]) => values as readonly string[]
const COMBO_KEYS = new Set([...FEED_BG_BOX_COMBOS, ...FEED_DEEP_GREEN_COMBOS].map((combo) => `${combo.bg}+${combo.box}`))
const comboKey = (r: Triple) => `${r.bg}+${r.box}`

/** 쓰임 표(바탕·박스·값 칩)와 배제 표(칩 대 바탕, 칩 대 박스)를 모두 지키는가. */
function followsUsageAndExclusion(r: Triple): boolean {
  return (
    asList(FEED_COLOR_USAGE.bg).includes(r.bg) &&
    asList(FEED_COLOR_USAGE.box).includes(r.box) &&
    asList(FEED_COLOR_USAGE.valueChip).includes(r.chip) &&
    chipExclusionRule(r.chip, r.bg) === null &&
    chipExclusionRule(r.chip, r.box) === null
  )
}

function isExcluded(r: Triple, excluded: readonly ExcludedColorPair[]) {
  const pairs: ExcludedColorPair[] = [
    [r.bg, r.chip],
    [r.chip, r.box],
    [r.bg, r.box],
  ]
  return pairs.some(([a, b]) => excluded.some(([x, y]) => (x === a && y === b) || (x === b && y === a)))
}

const seeds = (count: number) => Array.from({ length: count }, (_, i) => `card-${i}`)
/** 바탕이 `bg`가 아닌 카드 `count`장 뒤에 `deepAt`번째 자리에서 짙은 초록이 있었던 목록: 마지막 짙은 초록 이후 `since`장. */
const recentWithSince = (since: number): string[] => [FEED_DEEP_GREEN_KEY, ...Array.from({ length: since }, (_, i) => (i % 2 === 0 ? 'yellow' : 'pink'))]

describe('assignFeedColors — 통합 팔레트 조합·가중치 (티켓 20261122_2224 회차 4·5)', () => {
  const many = seeds(6000)
  const tally = (input: Partial<FeedColorAssignInput>) => {
    const counts = new Map<string, number>()
    for (const seed of many) {
      const result = assignFeedColors({ seed, ...input })
      counts.set(comboKey(result), (counts.get(comboKey(result)) ?? 0) + 1)
    }
    return counts
  }

  it('같은 입력은 같은 값이고, 시드가 다르면 값이 갈린다', () => {
    const input = { recentBgKeys: ['sky', 'yellow'], boxHasText: false }
    for (const seed of seeds(30)) expect(assignFeedColors({ seed, ...input })).toStrictEqual(assignFeedColors({ seed, ...input }))
    const distinct = new Set(seeds(60).map((seed) => JSON.stringify(assignFeedColors({ seed }))))
    expect(distinct.size).toBeGreaterThan(5)
  })

  it('조합 9개가 모두 나오고 비율이 가중치(합 12; 노랑+초록·초록+노랑·노랑+짙은 초록은 2)와 대략 맞는다', () => {
    const counts = tally({ boxHasText: false })
    const totalWeight = FEED_BG_BOX_COMBOS.reduce((sum, combo) => sum + combo.weight, 0)
    expect(totalWeight).toBe(12)
    expect(counts.size).toBe(FEED_BG_BOX_COMBOS.length)
    for (const combo of FEED_BG_BOX_COMBOS) {
      const share = (counts.get(`${combo.bg}+${combo.box}`) ?? 0) / many.length
      expect(Math.abs(share - combo.weight / totalWeight)).toBeLessThan(0.03)
    }
  })

  it('짙은 초록 바탕 조합은 앞 카드 정보가 없으면 나오지 않는다(리듬으로만 뽑는다)', () => {
    for (const result of [...tally({ boxHasText: false }).keys()]) expect(result.startsWith(`${FEED_DEEP_GREEN_KEY}+`)).toBe(false)
  })

  it('모든 결과가 쓰임 표와 배제 표를 지키고 조합 목록 안에 있다', () => {
    for (const seed of many) {
      for (const input of [{}, { boxHasText: false }, { recentBgKeys: ['green'] }, { recentBgKeys: recentWithSince(6) }]) {
        const result = assignFeedColors({ seed, ...input })
        expect(result.usedFallback).toBe(false)
        expect(followsUsageAndExclusion(result)).toBe(true)
        expect(COMBO_KEYS.has(comboKey(result))).toBe(true)
      }
    }
  })

  it('바로 앞 카드(recentBgKeys 마지막)와 같은 바탕은 나오지 않는다', () => {
    for (const previous of FEED_COLOR_USAGE.bg) {
      for (const seed of seeds(400)) {
        const result = assignFeedColors({ seed, recentBgKeys: ['red', previous], boxHasText: false })
        expect(result.bg).not.toBe(previous)
      }
    }
    // 앞 앞 카드와 같은 바탕은 막지 않는다
    const bgs = new Set(seeds(400).map((seed) => assignFeedColors({ seed, recentBgKeys: ['yellow', 'green'] }).bg))
    expect(bgs.has('yellow')).toBe(true)
  })

  it('바탕을 지정하면 앞 카드와 같아도 지정값을 지킨다', () => {
    for (const seed of seeds(60)) {
      expect(assignFeedColors({ seed, recentBgKeys: ['yellow'], fixed: { bg: 'yellow' } }).bg).toBe('yellow')
    }
  })
})

describe('assignFeedColors — 짙은 초록 바탕 리듬', () => {
  const many = seeds(3000)
  const { everyMin, everyMax } = FEED_DEEP_GREEN_RHYTHM

  it('마지막 짙은 초록 바탕 카드로부터 5번째 미만(사이 3장 이하)이면 짙은 초록 바탕은 나오지 않는다', () => {
    for (let since = 0; since < everyMin - 1; since += 1) {
      for (const seed of many.slice(0, 600)) expect(assignFeedColors({ seed, recentBgKeys: recentWithSince(since) }).bg).not.toBe(FEED_DEEP_GREEN_KEY)
    }
  })

  it('5번째(사이 4장)에는 낮은 확률로 나온다(약 DEEP_GREEN_CHANCE_AT_MIN)', () => {
    const hits = many.filter((seed) => assignFeedColors({ seed, recentBgKeys: recentWithSince(everyMin - 1) }).bg === FEED_DEEP_GREEN_KEY).length
    expect(Math.abs(hits / many.length - DEEP_GREEN_CHANCE_AT_MIN)).toBeLessThan(0.05)
  })

  it('6번째(사이 5장)부터는 반드시 나오고, 짙은 초록 조합(노랑·분홍 박스) 안에서 고른다', () => {
    const boxes = new Set<string>()
    for (const since of [everyMax - 1, everyMax, everyMax + 9]) {
      for (const seed of many.slice(0, 600)) {
        const result = assignFeedColors({ seed, recentBgKeys: recentWithSince(since) })
        expect(result.bg).toBe(FEED_DEEP_GREEN_KEY)
        expect(FEED_DEEP_GREEN_COMBOS.some((combo) => combo.bg === result.bg && combo.box === result.box)).toBe(true)
        expect(followsUsageAndExclusion(result)).toBe(true)
        boxes.add(result.box)
      }
    }
    expect([...boxes].sort()).toEqual(['pink', 'yellow'])
  })

  it('짙은 초록이 목록에 없어도 5장 이상 쌓이면(새 카드가 6번째) 반드시 나온다', () => {
    const recent = ['yellow', 'pink', 'sky', 'green', 'yellow', 'pink']
    for (const seed of many.slice(0, 300)) expect(assignFeedColors({ seed, recentBgKeys: recent }).bg).toBe(FEED_DEEP_GREEN_KEY)
    for (const seed of many.slice(0, 300)) expect(assignFeedColors({ seed, recentBgKeys: recent.slice(3) }).bg).not.toBe(FEED_DEEP_GREEN_KEY)
  })

  it('차례로 이어 붙이면 짙은 초록 카드가 5~6장마다 하나씩이고 6번째에는 어긴 적이 없다(다섯~여섯 장에 한 장꼴)', () => {
    const recent: string[] = []
    const deepAt: number[] = []
    for (let index = 0; index < 700; index += 1) {
      const result = assignFeedColors({ seed: `chain-${index}`, recentBgKeys: recent })
      if (result.bg === FEED_DEEP_GREEN_KEY) deepAt.push(index)
      recent.push(result.bg)
    }
    const betweens = deepAt.slice(1).map((at, i) => at - deepAt[i])
    expect(betweens.length).toBeGreaterThan(80)
    for (const between of betweens) {
      expect(between).toBeGreaterThanOrEqual(everyMin)
      expect(between).toBeLessThanOrEqual(everyMax)
    }
    const share = deepAt.length / 700
    expect(share).toBeGreaterThan(1 / 8)
    expect(share).toBeLessThan(1 / 5)
  })

  it('바탕을 지정하면 리듬은 보지 않는다(짙은 초록 지정은 그대로, 그 밖의 지정에는 짙은 초록을 끼우지 않는다)', () => {
    for (const seed of many.slice(0, 200)) {
      expect(assignFeedColors({ seed, recentBgKeys: [], fixed: { bg: 'green-deep' } }).bg).toBe('green-deep')
      expect(assignFeedColors({ seed, recentBgKeys: recentWithSince(10), fixed: { bg: 'sky' } }).bg).toBe('sky')
    }
  })

  it('짙은 초록 바탕 카드의 칩은 빨강·짙은 초록·바탕과 같은 색을 피한다', () => {
    for (const seed of many.slice(0, 600)) {
      const result = assignFeedColors({ seed, recentBgKeys: recentWithSince(7) })
      expect(result.bg).toBe(FEED_DEEP_GREEN_KEY)
      expect(['red', 'green-deep']).not.toContain(result.chip)
    }
  })
})

describe('assignFeedColors — 박스 글자·칩 배제 표', () => {
  const many = seeds(3000)

  it('박스에 글자가 있으면(기본) 짙은 초록 박스가 나오지 않는다. 글자가 없을 때만 나온다', () => {
    for (const seed of many) {
      for (const input of [{}, { boxHasText: true }, { recentBgKeys: recentWithSince(8) }]) {
        const result = assignFeedColors({ seed, ...input })
        expect(result.box).not.toBe(FEED_DEEP_GREEN_KEY)
        expect(boxAllowedFor(result.box, true)).toBe(true)
      }
    }
    const withoutText = new Set(many.map((seed) => assignFeedColors({ seed, boxHasText: false }).box))
    expect(withoutText.has(FEED_DEEP_GREEN_KEY)).toBe(true)
  })

  it('칩은 값 칩 7색 안에서 고르고, 바탕·박스 양쪽의 배제 표를 지킨다', () => {
    const chips = new Set<string>()
    for (const seed of many) {
      const result = assignFeedColors({ seed, boxHasText: seed.length % 2 === 0 })
      chips.add(result.chip)
      expect(chipExclusionRule(result.chip, result.bg)).toBeNull()
      expect(chipExclusionRule(result.chip, result.box)).toBeNull()
      // 노랑 위 흰 칩, 분홍 위 보라 칩, 초록 계열 위 빨간 칩은 어느 면에서도 나오지 않는다
      for (const base of [result.bg, result.box]) {
        expect([result.chip, base]).not.toEqual(['white', 'yellow'])
        expect([result.chip, base]).not.toEqual(['purple', 'pink'])
        if (result.chip === 'red') expect(['green', 'green-deep']).not.toContain(base)
      }
    }
    // 7색이 모두 나온다
    expect([...chips].sort()).toEqual([...FEED_COLOR_USAGE.valueChip].sort())
  })
})

describe('assignFeedColors — 지정값·제외 목록·기본 조합', () => {
  const many = seeds(400)

  it('지정한 값은 덮어쓰지 않는다(일부만 지정해도, 규칙에 걸리는 조합을 지정해도, 옛 키를 지정해도)', () => {
    for (const seed of many.slice(0, 100)) {
      expect(assignFeedColors({ seed, fixed: { chip: 'red', box: 'ref-lime' } })).toMatchObject({ chip: 'red', box: 'ref-lime', usedFallback: false })
      expect(assignFeedColors({ seed, fixed: { bg: 'red-soft' } }).bg).toBe('red-soft')
      expect(assignFeedColors({ seed, fixed: { bg: 'red', chip: 'red', box: 'red' } })).toStrictEqual({ bg: 'red', chip: 'red', box: 'red', usedFallback: false })
    }
  })

  it('빈 문자열·null 지정은 «지정 없음»이다', () => {
    for (const seed of many.slice(0, 40)) {
      expect(assignFeedColors({ seed, fixed: { bg: '', chip: null, box: undefined } })).toStrictEqual(assignFeedColors({ seed }))
    }
  })

  it('조합 안에서 지정한 칸은 지키고 나머지 칸만 고른다', () => {
    const boxesForYellow = new Set<string>()
    const bgsForSky = new Set<string>()
    for (const seed of many) {
      const a = assignFeedColors({ seed, fixed: { bg: 'yellow' }, boxHasText: false })
      expect(a.bg).toBe('yellow')
      expect(COMBO_KEYS.has(comboKey(a))).toBe(true)
      boxesForYellow.add(a.box)
      const b = assignFeedColors({ seed, fixed: { box: 'sky' } })
      expect(b.box).toBe('sky')
      expect(COMBO_KEYS.has(comboKey(b))).toBe(true)
      bgsForSky.add(b.bg)
      expect(followsUsageAndExclusion({ ...a, bg: a.bg })).toBe(true)
    }
    expect([...boxesForYellow].sort()).toEqual(['green', 'green-deep', 'sky'])
    expect([...bgsForSky]).toEqual(['yellow'])
  })

  it('지정한 칩에 걸리는 바탕·박스는 고르지 않는다(빨강 칩이면 초록 계열 면이 없다)', () => {
    for (const seed of many) {
      const result = assignFeedColors({ seed, fixed: { chip: 'red' }, boxHasText: false, recentBgKeys: recentWithSince(7) })
      expect(result.chip).toBe('red')
      expect(['green', 'green-deep']).not.toContain(result.bg)
      expect(['green', 'green-deep']).not.toContain(result.box)
    }
  })

  it('제외 목록의 쌍(순서 무관)은 바탕·칩·박스 어느 쌍에서도 나오지 않는다', () => {
    const excluded: ExcludedColorPair[] = [
      ['yellow', 'green'],
      ['sky', 'pink'],
      ['pink', 'yellow'],
      ['sky', 'yellow'],
    ]
    for (const seed of seeds(1000)) {
      const result = assignFeedColors({ seed }, { excludedPairs: excluded })
      expect(result.usedFallback).toBe(false)
      expect(isExcluded(result, excluded)).toBe(false)
      expect(followsUsageAndExclusion(result)).toBe(true)
    }
  })

  it('통과하는 조합이 없으면 안전한 기본 조합으로 되돌리고 그렇게 됐다는 표시를 담는다', () => {
    const everyPair: ExcludedColorPair[] = []
    for (const a of FEED_COLOR_KEYS) for (const b of FEED_COLOR_KEYS) if (a !== b) everyPair.push([a, b])
    const result = assignFeedColors({ seed: 'card-1' }, { excludedPairs: everyPair })
    expect(result.usedFallback).toBe(true)
    expect({ bg: result.bg, chip: result.chip, box: result.box }).toEqual(FEED_FALLBACK_COLORS)
    // 지정한 칸은 기본 조합이 덮어쓰지 않는다
    const partly = assignFeedColors({ seed: 'card-1', fixed: { chip: 'purple' } }, { excludedPairs: everyPair })
    expect(partly).toMatchObject({ bg: FEED_FALLBACK_COLORS.bg, chip: 'purple', box: FEED_FALLBACK_COLORS.box, usedFallback: true })
  })

  it('기본 조합은 쓰임 표·배제 표를 지키고 일반 조합 9개 중 하나이며 글자 박스에도 쓸 수 있다', () => {
    expect(followsUsageAndExclusion(FEED_FALLBACK_COLORS)).toBe(true)
    expect(FEED_BG_BOX_COMBOS.some((combo) => combo.bg === FEED_FALLBACK_COLORS.bg && combo.box === FEED_FALLBACK_COLORS.box)).toBe(true)
    expect(boxAllowedFor(FEED_FALLBACK_COLORS.box, true)).toBe(true)
  })

  it('기본 조합을 바꿔 넣을 수 있다', () => {
    const everyPair: ExcludedColorPair[] = []
    for (const a of FEED_COLOR_KEYS) for (const b of FEED_COLOR_KEYS) if (a !== b) everyPair.push([a, b])
    const fallback = { bg: 'sky', chip: 'pink', box: 'yellow' }
    expect(assignFeedColors({ seed: 1 }, { excludedPairs: everyPair, fallback })).toMatchObject({ ...fallback, usedFallback: true })
  })
})

describe('assignFeedColors — 이미지 대표 색 규칙 ⑤·⑥ (티켓 20261121_1828, 통합 팔레트 규칙에서도 유지)', () => {
  const many = seeds(300)
  const imageGreen = [hexOf('green')]
  const imageMulti = ['#f5442c', '#95c1f7']

  it('이미지 입력을 주지 않거나 비워 두면 결과가 같다(imageRuleSkipped 칸도 없다)', () => {
    for (const seed of many) {
      const base = assignFeedColors({ seed })
      expect(assignFeedColors({ seed, imageHexes: undefined, chipOnImage: undefined })).toStrictEqual(base)
      expect(assignFeedColors({ seed, imageHexes: [] })).toStrictEqual(base)
      expect(assignFeedColors({ seed, imageHexes: [], chipOnImage: true })).toStrictEqual(base)
      expect(assignFeedColors({ seed, imageHexes: ['not-a-color'] })).toStrictEqual(base)
      expect(base).not.toHaveProperty('imageRuleSkipped')
    }
  })

  it('칩이 이미지 위에 걸리지 않으면 바탕만 규칙 ⑤를 통과한다. 칩 후보는 이미지로 거르지 않는다', () => {
    const chips = new Set<string>()
    for (const seed of many) {
      const result = assignFeedColors({ seed, imageHexes: imageGreen, chipOnImage: false })
      expect(result.imageRuleSkipped).toBeUndefined()
      expect(violatesImageColorRule(hexOf(result.bg), imageGreen)).toBe(false)
      expect(followsUsageAndExclusion(result)).toBe(true)
      chips.add(result.chip)
    }
    // 칩을 거르지 않으므로 이미지와 비슷한 칩 색(초록)도 나올 수 있다
    expect(chips.has('green')).toBe(true)
  })

  it('칩이 이미지 위에 걸리면 바탕·칩 모두 규칙 ⑤·⑥을 통과하고 쓰임 표·배제 표도 지킨다', () => {
    for (const seed of many) {
      for (const imageHexes of [imageGreen, imageMulti]) {
        const result = assignFeedColors({ seed, imageHexes, chipOnImage: true })
        expect(result.usedFallback).toBe(false)
        expect(result.imageRuleSkipped).toBeUndefined()
        expect(violatesImageColorRule(hexOf(result.bg), imageHexes)).toBe(false)
        expect(violatesImageColorRule(hexOf(result.chip), imageHexes)).toBe(false)
        expect(followsUsageAndExclusion(result)).toBe(true)
      }
    }
  })

  it('이미지에 묻히는 색은 자동 배정에서 빠진다(이미지와 같은 색 키가 바탕·칩에 나오지 않는다)', () => {
    for (const seed of many) {
      const result = assignFeedColors({ seed, imageHexes: [hexOf('red')], chipOnImage: true })
      expect(result.chip).not.toBe('red')
    }
    for (const seed of many) {
      const result = assignFeedColors({ seed, imageHexes: [hexOf('yellow')], chipOnImage: true })
      expect(result.bg).not.toBe('yellow')
      expect(result.chip).not.toBe('yellow')
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

  it('조합이 하나도 없으면 이미지 규칙만 건너뛰고 통합 팔레트 규칙으로 정한다(imageRuleSkipped, usedFallback과 구분)', () => {
    // 모든 자동 후보 색이 이미지 대표 색에 걸리는 경우: 이미지 대표 색을 19키 전부로 준다
    const everything = Object.values(DEFAULT_FEED_PALETTE)
    for (const seed of seeds(40)) {
      const skipped = assignFeedColors({ seed, imageHexes: everything, chipOnImage: true })
      expect(skipped.imageRuleSkipped).toBe(true)
      expect(skipped.usedFallback).toBe(false)
      expect(followsUsageAndExclusion(skipped)).toBe(true)
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
    const distinct = new Set(seeds(40).map((seed) => JSON.stringify(assignFeedColors({ seed, imageHexes: imageGreen, chipOnImage: true }))))
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
