/**
 * 홈피드 새 카드 전용 상수 (티켓 20261120_2143)
 *
 * 확인하는 것: 색 표(통합 팔레트 9색)의 CSS 변수가 primitive.css에 정의돼 있고 hex가 같다(대소문자 무시),
 * 색 키가 9개로 겹치지 않는다, 기울기가 여섯 값이고 0이 없다.
 * 칩 높이·글자·여백이 디자인 시스템 눈금과 같은지는 단언하지 않는다(눈금 대응은 feedConstants.ts 머리말 주석).
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/feedConstants.test.ts
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  FEED_BG_BOX_COMBOS,
  FEED_BOX,
  FEED_CHIP,
  FEED_CHIP_OFFSET,
  FEED_CORNER_CHIP,
  FEED_CORNER_INSET,
  FEED_CORNER_OVERHANG,
  FEED_CORNER_TILT_RANGE,
  FEED_PHOTO_TEXT_SCRIM,
  FEED_TEXT_BOX_TITLE_STEPS,
  FEED_COLORS,
  FEED_COLOR_KEYS,
  FEED_COLOR_USAGE,
  FEED_DEEP_GREEN_COMBOS,
  FEED_DEEP_GREEN_RHYTHM,
  FEED_TILTS,
  boxAllowedFor,
  feedColorVar,
  feedTextBoxTitleSizeClass,
  feedTextOnBg,
  feedTypeUsesCoverImage,
} from '../feedConstants'
import { FEED_TYPES } from '../feedChipSlots'

const colorsCss = readFileSync(path.resolve(process.cwd(), 'design-system/tokens/primitive.css'), 'utf8')

/** primitive.css에서 `--이름: #rrggbb;` 정의를 이름 → hex로 읽는다(주석 안 언급은 줄 머리가 `--`가 아니라 걸리지 않는다). */
function parseHexVars(css: string): Map<string, string> {
  const vars = new Map<string, string>()
  for (const m of css.matchAll(/^\s*(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/gm)) {
    vars.set(m[1], m[2])
  }
  return vars
}

describe('FEED_COLORS 색 표(통합 팔레트 9색)', () => {
  const cssVars = parseHexVars(colorsCss)

  it('색 키가 통합 팔레트 9개이고 표와 키 목록이 일치한다', () => {
    expect(FEED_COLOR_KEYS).toEqual(['yellow', 'green', 'green-deep', 'pink', 'sky', 'red', 'purple', 'blue', 'white'])
    expect(new Set(FEED_COLOR_KEYS).size).toBe(9)
    expect(Object.keys(FEED_COLORS).sort()).toEqual([...FEED_COLOR_KEYS].sort())
  })

  it.each(FEED_COLOR_KEYS)('%s: CSS 변수가 primitive.css에 정의돼 있다', (key) => {
    expect(cssVars.has(FEED_COLORS[key].cssVar)).toBe(true)
  })

  it.each(FEED_COLOR_KEYS)('%s: hex가 primitive.css의 값과 같다(대소문자 무시)', (key) => {
    const { cssVar, hex } = FEED_COLORS[key]
    expect(hex.toLowerCase()).toBe(cssVars.get(cssVar)?.toLowerCase())
  })

  it('CSS 변수 이름이 서로 다르다', () => {
    const names = FEED_COLOR_KEYS.map((k) => FEED_COLORS[k].cssVar)
    expect(new Set(names).size).toBe(9)
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
    expect(feedColorVar(key)).toBe(`var(${FEED_COLORS[key].cssVar})`)
    expect(feedColorVar(key)).toMatch(/^var\(--jam-[\w-]+\)$/)
  })

  it('9키에 없는 값(저장된 옛 키 등)은 던지지 않고 노랑으로 그린다', () => {
    for (const legacy of ['red-soft', 'yellow-soft', 'ref-lime', 'ref-pink', '', 'nope']) {
      expect(() => feedColorVar(legacy as never)).not.toThrow()
      expect(feedColorVar(legacy as never)).toBe(feedColorVar('yellow'))
    }
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

describe('통합 팔레트 쓰임 표', () => {
  it('바탕·박스는 노랑·초록·짙은 초록·분홍·하늘 다섯 색이다', () => {
    const five = ['yellow', 'green', 'green-deep', 'pink', 'sky']
    expect([...FEED_COLOR_USAGE.bg]).toEqual(five)
    expect([...FEED_COLOR_USAGE.box]).toEqual(five)
  })

  it('값 칩은 일곱 색, 스티커는 일곱 색이다', () => {
    expect([...FEED_COLOR_USAGE.valueChip].sort()).toEqual(['green', 'pink', 'purple', 'red', 'sky', 'white', 'yellow'])
    expect([...FEED_COLOR_USAGE.sticker].sort()).toEqual(['blue', 'green', 'pink', 'purple', 'red', 'sky', 'yellow'])
  })

  it('표의 모든 키는 색 키 목록에 있다', () => {
    for (const keys of Object.values(FEED_COLOR_USAGE)) {
      for (const key of keys) expect(FEED_COLOR_KEYS).toContain(key)
    }
  })
})

describe('바탕+박스 조합', () => {
  it('일반 조합이 정확히 9개이고 서로 겹치지 않는다', () => {
    expect(FEED_BG_BOX_COMBOS).toHaveLength(9)
    expect(new Set(FEED_BG_BOX_COMBOS.map((c) => `${c.bg}+${c.box}`)).size).toBe(9)
    expect(FEED_BG_BOX_COMBOS.map((c) => `${c.bg}+${c.box}`).sort()).toEqual(
      [
        'yellow+green',
        'green+yellow',
        'yellow+green-deep',
        'green+pink',
        'sky+yellow',
        'yellow+sky',
        'pink+yellow',
        'pink+green',
        'sky+pink',
      ].sort(),
    )
  })

  it('노랑·초록 조합 세 개만 가중치 2이고 나머지는 1이다(합계 12)', () => {
    const heavy = FEED_BG_BOX_COMBOS.filter((c) => c.weight === 2).map((c) => `${c.bg}+${c.box}`)
    expect(heavy.sort()).toEqual(['green+yellow', 'yellow+green', 'yellow+green-deep'])
    expect(FEED_BG_BOX_COMBOS.filter((c) => c.weight === 1)).toHaveLength(6)
    expect(FEED_BG_BOX_COMBOS.reduce((sum, c) => sum + c.weight, 0)).toBe(12)
  })

  it('조합의 바탕은 바탕 표에, 박스는 박스 표에 있고 바탕과 박스가 같은 색이 아니다', () => {
    for (const { bg, box } of FEED_BG_BOX_COMBOS) {
      expect(FEED_COLOR_USAGE.bg as readonly string[]).toContain(bg)
      expect(FEED_COLOR_USAGE.box as readonly string[]).toContain(box)
      expect(bg).not.toBe(box)
      expect(bg).not.toBe('green-deep') // 짙은 초록 바탕은 따로 둔 두 조합만 쓴다
    }
  })

  it('짙은 초록 바탕 조합은 노랑·분홍 박스 두 개이고 리듬은 다섯~여섯 장에 한 장이다', () => {
    expect(FEED_DEEP_GREEN_COMBOS.map((c) => `${c.bg}+${c.box}`)).toEqual(['green-deep+yellow', 'green-deep+pink'])
    expect(FEED_DEEP_GREEN_RHYTHM).toEqual({ everyMin: 5, everyMax: 6 })
  })
})

describe('feedTextOnBg', () => {
  it('짙은 초록 바탕이면 흰색(--snow)이다', () => {
    expect(feedTextOnBg('green-deep')).toBe('var(--snow)')
  })

  it('다른 바탕·비어 있는 값은 검정(--foreground)이다', () => {
    for (const key of ['yellow', 'green', 'pink', 'sky', 'purple']) expect(feedTextOnBg(key)).toBe('var(--foreground)')
    expect(feedTextOnBg(null)).toBe('var(--foreground)')
    expect(feedTextOnBg(undefined)).toBe('var(--foreground)')
  })
})

describe('boxAllowedFor', () => {
  it('짙은 초록 박스는 글자가 들어가는 박스에 못 쓰고, 글자 없는 박스에는 쓴다', () => {
    expect(boxAllowedFor('green-deep', true)).toBe(false)
    expect(boxAllowedFor('green-deep', false)).toBe(true)
  })

  it('나머지 박스 색은 글자 박스에도 쓸 수 있다', () => {
    for (const key of ['yellow', 'green', 'pink', 'sky']) expect(boxAllowedFor(key, true)).toBe(true)
  })

  it('박스 표에 없는 색(빨강·보라·흰색·파랑·모르는 키)은 쓰지 못한다', () => {
    for (const key of ['red', 'purple', 'white', 'blue', 'not-a-color']) expect(boxAllowedFor(key, false)).toBe(false)
  })
})

describe('카드 모서리 칩 상수 (티켓 20261122_2228 R1)', () => {
  it('코너 칩 크기는 큰 칩 52/24·작은 칩 40/18·굵기 900이다', () => {
    expect(FEED_CORNER_CHIP.large).toEqual({ height: 52, fontSize: 24, paddingX: 16 })
    expect(FEED_CORNER_CHIP.small).toEqual({ height: 40, fontSize: 18, paddingX: 12 })
    expect(FEED_CORNER_CHIP.fontWeight).toBe(900)
  })

  it('제목 속 칩 크기(FEED_CHIP)와 기울기 여섯 값은 그대로다', () => {
    expect(FEED_CHIP.large).toEqual({ height: 40, fontSize: 18, paddingX: 16 })
    expect(FEED_CHIP.small).toEqual({ height: 32, fontSize: 14, paddingX: 12 })
    expect([...FEED_TILTS]).toEqual([-8, -6, -4, 4, 6, 8])
  })

  it('기울기 범위 3~12°, 안쪽 한도 가로 6%·세로 5%, 바깥 한도 6px이다', () => {
    expect(FEED_CORNER_TILT_RANGE).toEqual({ min: 3, max: 12 })
    for (const tilt of FEED_TILTS) {
      expect(Math.abs(tilt)).toBeGreaterThanOrEqual(FEED_CORNER_TILT_RANGE.min)
      expect(Math.abs(tilt)).toBeLessThanOrEqual(FEED_CORNER_TILT_RANGE.max)
    }
    expect(FEED_CORNER_INSET).toEqual({ x: 6, y: 5 })
    expect(FEED_CORNER_OVERHANG).toBe(6)
  })
})

describe('텍스트형 (티켓 20261122_2228 R2)', () => {
  it('사진 위 어둠 막은 32%다', () => {
    expect(FEED_PHOTO_TEXT_SCRIM).toBe(0.32)
  })

  it('큰 제목 글자는 2~3단계이고 길수록 한 단계씩 낮아진다', () => {
    expect(FEED_TEXT_BOX_TITLE_STEPS.map((step) => step.className)).toEqual(['text-[14.7cqw]', 'text-[11cqw]', 'text-[9.2cqw]'])
    expect(feedTextBoxTitleSizeClass('잠긴 채\n온 배지,\n열어\n볼까요')).toBe('text-[14.7cqw]')
    expect(feedTextBoxTitleSizeClass('오늘 걷기 미션에 도전해 보세요')).toBe('text-[14.7cqw]')
    // 줄 수가 넘치면 낮춘다: 5자 이하로 접혀도 5줄이면 4xl, 7자 기준으로도 7줄을 넘으면 3xl
    expect(feedTextBoxTitleSizeClass('가나다라마\n가나다라마\n가나다라마\n가나다라마\n가나다라마')).toBe('text-[11cqw]')
    expect(feedTextBoxTitleSizeClass('가을 숲길을 따라 걷다가 만나는 작은 쉼터에서 한숨 돌려요 오늘도 수고했어요')).toBe('text-[11cqw]')
    expect(feedTextBoxTitleSizeClass('가나다\n가나다\n가나다\n가나다\n가나다\n가나다\n가나다')).toBe('text-[9.2cqw]')
    expect(feedTextBoxTitleSizeClass(null)).toBe('text-[14.7cqw]')
  })
})
