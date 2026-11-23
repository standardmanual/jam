/**
 * 홈피드 새 카드 전용 상수 (티켓 20261120_2143)
 *
 * 확인하는 것: 15색 표의 CSS 변수가 colors.css에 정의돼 있고 hex가 같다(대소문자 무시),
 * 색 키가 15개로 겹치지 않는다, 기울기가 여섯 값이고 0이 없다.
 * 칩 높이·글자·여백이 디자인 시스템 눈금과 같은지는 단언하지 않는다(눈금 대응은 feedConstants.ts 머리말 주석).
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/feedConstants.test.ts
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  FEED_BOX,
  FEED_CHIP_OFFSET,
  FEED_COLORS,
  FEED_COLOR_KEYS,
  FEED_LEGACY_COLOR_KEYS,
  FEED_NEW_COLOR_KEYS,
  FEED_TILTS,
  feedColorVar,
  feedTypeUsesCoverImage,
} from '../feedConstants'
import { FEED_TYPES } from '../feedChipSlots'

const colorsCss = readFileSync(path.resolve(process.cwd(), 'design-system/tokens/colors.css'), 'utf8')

/** colors.css에서 `--이름: #rrggbb;` 정의를 이름 → hex로 읽는다(주석 안 언급은 줄 머리가 `--`가 아니라 걸리지 않는다). */
function parseHexVars(css: string): Map<string, string> {
  const vars = new Map<string, string>()
  for (const m of css.matchAll(/^\s*(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/gm)) {
    vars.set(m[1], m[2])
  }
  return vars
}

describe('FEED_COLORS 색 표(19색)', () => {
  const cssVars = parseHexVars(colorsCss)

  it('색 키가 19개(옛 15 + 새 4)이고 표와 키 목록이 일치한다', () => {
    expect(FEED_COLOR_KEYS).toHaveLength(19)
    expect(new Set(FEED_COLOR_KEYS).size).toBe(19)
    expect(FEED_LEGACY_COLOR_KEYS).toHaveLength(15)
    expect(FEED_NEW_COLOR_KEYS).toEqual(['green-deep', 'pink', 'sky', 'white'])
    expect(Object.keys(FEED_COLORS).sort()).toEqual([...FEED_COLOR_KEYS].sort())
  })

  it.each(FEED_COLOR_KEYS)('%s: CSS 변수가 colors.css에 정의돼 있다', (key) => {
    expect(cssVars.has(FEED_COLORS[key].cssVar)).toBe(true)
  })

  it.each(FEED_COLOR_KEYS)('%s: hex가 colors.css의 값과 같다(대소문자 무시)', (key) => {
    const { cssVar, hex } = FEED_COLORS[key]
    expect(hex.toLowerCase()).toBe(cssVars.get(cssVar)?.toLowerCase())
  })

  it('CSS 변수 이름이 서로 다르다', () => {
    const names = FEED_COLOR_KEYS.map((k) => FEED_COLORS[k].cssVar)
    expect(new Set(names).size).toBe(19)
  })
})

describe('FEED_TILTS 기울기', () => {
  it('여섯 값이고 0이 없다', () => {
    expect(FEED_TILTS).toHaveLength(6)
    expect(FEED_TILTS).not.toContain(0)
    expect([...FEED_TILTS]).toEqual([-8, -6, -4, 4, 6, 8])
  })
})

describe('feedColorVar 색 키 → CSS 변수', () => {
  it.each(FEED_COLOR_KEYS)('%s: var(--…) 문자열로 바뀌고 표의 변수 이름을 가리킨다', (key) => {
    expect(feedColorVar(key)).toBe(`var(--feed-color-${key}, var(${FEED_COLORS[key].cssVar}))`)
    expect(feedColorVar(key)).toMatch(/^var\(--feed-color-[\w-]+, var\(--[\w-]+\)\)$/)
  })

  it('hex 값은 돌려주지 않는다', () => {
    for (const key of FEED_COLOR_KEYS) expect(feedColorVar(key)).not.toMatch(/#/)
  })
})

describe('박스·칩 자리 상수', () => {
  it('물결 마디 수는 22이고 높낮이 범위(12~22)와 다른 값이다', () => {
    expect(FEED_BOX.waveCount).toBe(22)
    expect(FEED_BOX.waveAmplitude).toEqual({ min: 12, max: 22 })
  })

  it('칩 자리 오프셋은 양수다', () => {
    expect(FEED_CHIP_OFFSET.x).toBeGreaterThan(0)
    expect(FEED_CHIP_OFFSET.y).toBeGreaterThan(0)
  })
})

describe('feedTypeUsesCoverImage (티켓 20261121_1722)', () => {
  it('hero_box와 collection_intro는 박스 용도와 상관없이 커버 이미지를 쓴다', () => {
    for (const boxKind of [undefined, null, 'text', 'image_mask']) {
      expect(feedTypeUsesCoverImage('hero_box', boxKind)).toBe(true)
      expect(feedTypeUsesCoverImage('collection_intro', boxKind)).toBe(true)
    }
  })

  it('text_box는 image_mask일 때만 쓴다', () => {
    expect(feedTypeUsesCoverImage('text_box', 'image_mask')).toBe(true)
    expect(feedTypeUsesCoverImage('text_box', 'text')).toBe(false)
    expect(feedTypeUsesCoverImage('text_box', null)).toBe(false)
    expect(feedTypeUsesCoverImage('text_box')).toBe(false)
  })

  it('full_image·badge_intro·badge_only·drop_pickup·gallery_list는 쓰지 않는다', () => {
    for (const feedType of ['full_image', 'badge_intro', 'badge_only', 'drop_pickup', 'gallery_list']) {
      expect(feedTypeUsesCoverImage(feedType, 'image_mask')).toBe(false)
    }
  })

  it('모르는 값이면 거짓이다', () => {
    for (const feedType of [null, undefined, '', 'unknown', 'HERO_BOX', 1]) {
      expect(feedTypeUsesCoverImage(feedType, 'image_mask')).toBe(false)
    }
  })

  it('유형 8개 전부를 판정한다(새 유형이 생기면 이 표를 함께 고친다)', () => {
    expect(FEED_TYPES).toHaveLength(8)
    const used = FEED_TYPES.filter((feedType) => feedTypeUsesCoverImage(feedType, 'image_mask'))
    expect([...used].sort()).toEqual(['collection_intro', 'hero_box', 'text_box'])
  })
})
