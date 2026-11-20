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
import { FEED_COLORS, FEED_COLOR_KEYS, FEED_TILTS } from '../feedConstants'

const colorsCss = readFileSync(path.resolve(process.cwd(), 'design-system/tokens/colors.css'), 'utf8')

/** colors.css에서 `--이름: #rrggbb;` 정의를 이름 → hex로 읽는다(주석 안 언급은 줄 머리가 `--`가 아니라 걸리지 않는다). */
function parseHexVars(css: string): Map<string, string> {
  const vars = new Map<string, string>()
  for (const m of css.matchAll(/^\s*(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/gm)) {
    vars.set(m[1], m[2])
  }
  return vars
}

describe('FEED_COLORS 15색 표', () => {
  const cssVars = parseHexVars(colorsCss)

  it('색 키가 15개이고 표와 키 목록이 일치한다', () => {
    expect(FEED_COLOR_KEYS).toHaveLength(15)
    expect(new Set(FEED_COLOR_KEYS).size).toBe(15)
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
    expect(new Set(names).size).toBe(15)
  })
})

describe('FEED_TILTS 기울기', () => {
  it('여섯 값이고 0이 없다', () => {
    expect(FEED_TILTS).toHaveLength(6)
    expect(FEED_TILTS).not.toContain(0)
    expect([...FEED_TILTS]).toEqual([-8, -6, -4, 4, 6, 8])
  })
})
