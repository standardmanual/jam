/**
 * 홈피드 컬러셋 교체의 순수 함수와 팔레트 연결 (티켓 20261121_2145)
 *
 * 확인하는 것: 덮어쓰기 정리(모르는 키·잘못된 hex 버림, 대소문자 정규화), 팔레트 합치기, CSS 변수 문자열(덮어쓴 키만, 주입 불가),
 * `feedColorVar`의 폴백 변수, 덮어쓴 hex가 자동 배정·색 규칙 판정·`resolveFeedLook`·`decideFeedCardValues`·`validateFeedCardColumns` 결과를 바꾸는지.
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/feedColorOverrides.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  buildFeedPalette,
  feedColorOverrideCss,
  FEED_COLOR_VAR_PREFIX,
  isOverrideHex,
  normalizeOverrides,
} from '../feedColorOverrides'
import { assignFeedColors, DEFAULT_FEED_PALETTE } from '../feedAssign'
import { firstViolatedRule } from '../feedColorRules'
import { FEED_COLOR_KEYS, FEED_COLORS, feedColorVar, type FeedColorKey } from '../feedConstants'
import { resolveFeedLook } from '../feedLook'
import { decideFeedCardValues, validateFeedCardColumns } from '@/lib/admin/feedCardFields'

describe('isOverrideHex', () => {
  it('#rrggbb만 받는다(대소문자 무관)', () => {
    expect(isOverrideHex('#ff9a9a')).toBe(true)
    expect(isOverrideHex('#FF9A9A')).toBe(true)
  })

  it.each(['ff9a9a', '#f9a', '#ff9a9', '#ff9a9aa', '#gg9a9a', 'red', '', ' #ff9a9a', 123, null, undefined])('%s는 받지 않는다', (value) => {
    expect(isOverrideHex(value)).toBe(false)
  })
})

describe('normalizeOverrides', () => {
  it('행 배열과 키 → hex 객체를 모두 받고 hex를 소문자로 정규화한다', () => {
    expect(normalizeOverrides([{ color_key: 'red', hex: '#FF0000' }])).toEqual({ red: '#ff0000' })
    expect(normalizeOverrides({ blue: '#0000FF' })).toEqual({ blue: '#0000ff' })
  })

  it('모르는 키와 잘못된 hex는 버린다', () => {
    expect(
      normalizeOverrides([
        { color_key: 'white', hex: '#ffffff' },
        { color_key: 'red', hex: 'not-a-color' },
        { color_key: 'green', hex: '#abc' },
        { color_key: 'yellow', hex: '#f9fd69' },
      ]),
    ).toEqual({ yellow: '#f9fd69' })
  })

  it('배열이나 객체가 아니거나 행이 깨진 입력은 빈 덮어쓰기다', () => {
    expect(normalizeOverrides(null)).toEqual({})
    expect(normalizeOverrides(undefined)).toEqual({})
    expect(normalizeOverrides('red')).toEqual({})
    expect(normalizeOverrides([null, 1, 'x', {}])).toEqual({})
  })

  it('같은 키가 여럿이면 나중 것을 쓴다', () => {
    expect(
      normalizeOverrides([
        { color_key: 'red', hex: '#111111' },
        { color_key: 'red', hex: '#222222' },
      ]),
    ).toEqual({ red: '#222222' })
  })
})

describe('buildFeedPalette', () => {
  it('덮어쓰기가 없으면 기본 팔레트와 값이 같다', () => {
    expect(buildFeedPalette(undefined)).toEqual(DEFAULT_FEED_PALETTE)
    expect(buildFeedPalette(null)).toEqual(DEFAULT_FEED_PALETTE)
    expect(buildFeedPalette({})).toEqual(DEFAULT_FEED_PALETTE)
  })

  it('덮어쓴 키만 바뀌고 15색의 키 순서가 그대로다', () => {
    const palette = buildFeedPalette({ red: '#112233' })
    expect(palette.red).toBe('#112233')
    for (const key of FEED_COLOR_KEYS) {
      if (key !== 'red') expect(palette[key]).toBe(FEED_COLORS[key].hex)
    }
    expect(Object.keys(palette)).toEqual(Object.keys(DEFAULT_FEED_PALETTE))
  })

  it('잘못된 값이 섞여 들어와도 팔레트에 들어가지 않는다', () => {
    const palette = buildFeedPalette({ red: 'javascript:1', blue: '#0000AA' } as never)
    expect(palette.red).toBe(FEED_COLORS.red.hex)
    expect(palette.blue).toBe('#0000aa')
  })
})

describe('feedColorOverrideCss', () => {
  it('덮어쓴 키가 없으면 빈 문자열이다', () => {
    expect(feedColorOverrideCss(undefined)).toBe('')
    expect(feedColorOverrideCss(null)).toBe('')
    expect(feedColorOverrideCss({})).toBe('')
  })

  it('덮어쓴 키만 :root 변수로 내리고 디자인 시스템 토큰(--jam-*)은 건드리지 않는다', () => {
    const css = feedColorOverrideCss({ 'red-soft': '#FF0000', 'ref-lime': '#00ff00' })
    expect(css).toBe(':root{--feed-color-red-soft:#ff0000;--feed-color-ref-lime:#00ff00}')
    expect(css).not.toContain('--jam-')
    expect(css).not.toContain('blue')
  })

  it('키는 색 키 15개 순서로 나온다', () => {
    const css = feedColorOverrideCss({ 'ref-yellow': '#111111', red: '#222222' })
    expect(css.indexOf('--feed-color-red:')).toBeLessThan(css.indexOf('--feed-color-ref-yellow:'))
  })

  it('CSS 주입이 불가능하다 — 값·키에 다른 문자가 들어와도 출력에 나오지 않는다', () => {
    const css = feedColorOverrideCss({
      red: '#ff0000;} body{display:none',
      blue: 'red;background:url(x)',
      green: '#00ff00',
      'x}body{display:none': '#000000',
    } as never)
    expect(css).toBe(':root{--feed-color-green:#00ff00}')
    expect(css).not.toMatch(/body|url|display|javascript/)
  })

  it('머리말 상수는 feedColorVar가 읽는 변수 이름과 같다', () => {
    for (const key of FEED_COLOR_KEYS) {
      expect(feedColorVar(key).startsWith(`var(${FEED_COLOR_VAR_PREFIX}${key},`)).toBe(true)
    }
  })
})

describe('feedColorVar 폴백', () => {
  it('카드 전용 변수를 먼저 읽고 없으면 기존 변수를 읽는다', () => {
    expect(feedColorVar('red')).toBe('var(--feed-color-red, var(--jam-red))')
    expect(feedColorVar('red-soft')).toBe('var(--feed-color-red-soft, var(--jam-red-soft))')
    expect(feedColorVar('ref-lime')).toBe('var(--feed-color-ref-lime, var(--feed-ref-lime))')
  })
})

// ── 덮어쓴 팔레트가 계산 결과를 바꾼다 ─────────────────────────────

/** 기본 팔레트에서 규칙을 통과하는 칩 짝(a, b)을 하나 찾는다. */
function passingChipPair(): [FeedColorKey, FeedColorKey] {
  for (const a of FEED_COLOR_KEYS) {
    for (const b of FEED_COLOR_KEYS) {
      if (a !== b && firstViolatedRule(DEFAULT_FEED_PALETTE[a], DEFAULT_FEED_PALETTE[b], { involvesChip: true }) === null) return [a, b]
    }
  }
  throw new Error('통과하는 짝이 없다')
}

describe('덮어쓴 팔레트가 규칙 판정을 바꾼다', () => {
  it('b의 hex를 a와 같게 덮어쓰면 같은 짝이 «같은 색» 규칙에 걸린다', () => {
    const [a, b] = passingChipPair()
    expect(firstViolatedRule(DEFAULT_FEED_PALETTE[a], DEFAULT_FEED_PALETTE[b])).toBeNull()
    const palette = buildFeedPalette({ [b]: DEFAULT_FEED_PALETTE[a] })
    expect(firstViolatedRule(palette[a], palette[b])).toBe('same')
  })

  it('validateFeedCardColumns: palette를 주면 덮어쓴 hex로 색 경고를 판정하고, 안 주면 이전과 같다', () => {
    const [a, b] = passingChipPair()
    const columns = { feed_type: 'hero_box', bg_color_key: a, chip_color_key: b }
    const base = validateFeedCardColumns(columns, { title: '제목' })
    expect(base.warnings.filter((w) => w.includes('색 규칙에 걸려요'))).toEqual([])
    const palette = buildFeedPalette({ [b]: DEFAULT_FEED_PALETTE[a] })
    const overridden = validateFeedCardColumns(columns, { title: '제목', palette })
    expect(overridden.warnings.some((w) => w.includes('색 규칙에 걸려요') && w.includes(a) && w.includes(b))).toBe(true)
    expect(overridden.errors).toEqual(base.errors)
    expect(validateFeedCardColumns(columns, { title: '제목', palette: DEFAULT_FEED_PALETTE })).toEqual(base)
  })
})

describe('덮어쓴 팔레트가 자동 배정을 바꾼다', () => {
  it('팔레트를 안 주거나 기본 팔레트를 주면 결과가 같다', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const input = { seed, fixed: { bg: null, chip: null, box: null } }
      expect(assignFeedColors(input, { palette: buildFeedPalette({}) })).toEqual(assignFeedColors(input))
    }
  })

  it('고른 칩 색의 hex가 배경색과 같아지도록 덮어쓰면 다른 칩 색을 고른다', () => {
    let changed = 0
    for (let seed = 1; seed <= 30; seed++) {
      const input = { seed, fixed: { bg: 'red-soft', chip: null, box: null } }
      const before = assignFeedColors(input)
      const palette = buildFeedPalette({ [before.chip as FeedColorKey]: DEFAULT_FEED_PALETTE['red-soft'] })
      const after = assignFeedColors(input, { palette })
      expect(after.bg).toBe('red-soft')
      expect(firstViolatedRule(palette[after.bg], palette[after.chip], { involvesChip: true })).toBeNull()
      if (after.chip !== before.chip) changed++
    }
    expect(changed).toBeGreaterThan(0)
  })

  it('decideFeedCardValues: palette가 자동 배정에 전달돼 덮어쓴 hex로 규칙을 판정한다', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const columns = { bg_color_key: 'red-soft' as const }
      const before = decideFeedCardValues({ columns, seed })
      const palette = buildFeedPalette({ [before.chip_color_key]: DEFAULT_FEED_PALETTE['red-soft'] })
      const after = decideFeedCardValues({ columns, seed, palette })
      expect(firstViolatedRule(palette[after.bg_color_key], palette[after.chip_color_key], { involvesChip: true })).toBeNull()
      expect(decideFeedCardValues({ columns, seed, palette: DEFAULT_FEED_PALETTE })).toEqual(before)
    }
  })
})

describe('resolveFeedLook의 palette', () => {
  const NOW = new Date('2026-11-21T00:00:00.000Z')
  const card = { id: 'card-look-1', feed_type: 'hero_box' as const }

  it('palette를 안 주면 기본 팔레트로 계산해 이전과 같다', () => {
    const baseline = resolveFeedLook({ card, feedType: 'hero_box', valueSource: null, now: NOW })
    expect(resolveFeedLook({ card, feedType: 'hero_box', valueSource: null, now: NOW, palette: DEFAULT_FEED_PALETTE })).toEqual(baseline)
  })

  it('색이 비어 있는 카드는 덮어쓴 hex로 규칙을 판정해 색을 정한다(저장된 키는 그대로)', () => {
    let changed = 0
    for (let n = 1; n <= 30; n++) {
      const stored = { id: `card-look-${n}`, feed_type: 'hero_box' as const, bg_color_key: 'red-soft', box_color_key: 'ref-lime' }
      const before = resolveFeedLook({ card: stored, feedType: 'hero_box', valueSource: null, now: NOW })
      expect(before.colors.bg).toBe('red-soft')
      expect(before.colors.box).toBe('ref-lime')
      const palette = buildFeedPalette({ [before.colors.chip as FeedColorKey]: DEFAULT_FEED_PALETTE['red-soft'] })
      const after = resolveFeedLook({ card: stored, feedType: 'hero_box', valueSource: null, now: NOW, palette })
      expect(after.colors.bg).toBe('red-soft')
      expect(after.colors.box).toBe('ref-lime')
      if (after.colors.chip !== before.colors.chip) changed++
    }
    expect(changed).toBeGreaterThan(0)
  })
})
