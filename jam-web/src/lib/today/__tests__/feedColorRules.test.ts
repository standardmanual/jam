/**
 * 홈피드 색 규칙: 그림 색 겹침(⑤·⑥)과 칩 배제 표 (티켓 20261121_0012, 옛 hex 규칙은 티켓 20261122_2225에서 제거)
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/feedColorRules.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  chipExclusionRule,
  cieLightness,
  COLOR_RULE_THRESHOLDS,
  hexToHsl,
  hexToRgb,
  hueDifference,
  isHexColor,
  relativeLuminance,
  violatesImageColorRule,
} from '../feedColorRules'

describe('색 계산', () => {
  it('hex를 읽는다(대소문자·#·3자리). 읽을 수 없으면 던진다', () => {
    expect(hexToRgb('#ff1d1d')).toEqual([255, 29, 29])
    expect(hexToRgb('FF1D1D')).toEqual([255, 29, 29])
    expect(hexToRgb('#fff')).toEqual([255, 255, 255])
    expect(() => hexToRgb('#12345')).toThrow()
    expect(() => hexToRgb('red')).toThrow()
  })

  it('상대 휘도·CIE L*가 기준값과 맞는다', () => {
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 10)
    expect(cieLightness('#000000')).toBeCloseTo(0, 5)
    expect(cieLightness('#FFFFFF')).toBeCloseTo(100, 5)
    // 중간 회색(#777777)의 L*는 약 50이다
    expect(cieLightness('#777777')).toBeCloseTo(50, 0)
  })

  it('HSL: 원색은 색상 0·120·240, 무채색은 색상·채도 0', () => {
    expect(hexToHsl('#FF0000')).toEqual({ h: 0, s: 1, l: 0.5 })
    expect(hexToHsl('#00FF00').h).toBeCloseTo(120, 5)
    expect(hexToHsl('#0000FF').h).toBeCloseTo(240, 5)
    expect(hexToHsl('#808080')).toMatchObject({ h: 0, s: 0 })
  })

  it('색상 차이는 가까운 쪽 각도다(350°와 10°는 20°)', () => {
    expect(hueDifference(350, 10)).toBe(20)
    expect(hueDifference(10, 350)).toBe(20)
    expect(hueDifference(0, 180)).toBe(180)
    expect(hueDifference(90, 90)).toBe(0)
  })
})

describe('규칙 ⑤·⑥ 그림과 배경·칩 (티켓 20261121_1828)', () => {
  // 임계값은 기존 두 값을 읽는다: 색상 차이 30°, 밝기(L*) 차이 15. 아래 hex의 값은 시험이 같이 확인한다.
  it('새 임계값을 만들지 않는다', () => {
    expect(COLOR_RULE_THRESHOLDS.closeHueDegrees).toBe(30)
    expect(COLOR_RULE_THRESHOLDS.minCieLightnessDiff).toBe(15)
  })

  it('색상 차이 30° 경계: 29.88°는 걸리고 30.12°는 통과한다(밝기 차이는 둘 다 15 미만)', () => {
    const image = ['#ff0000']
    expect(hueDifference(hexToHsl('#ff0000').h, hexToHsl('#ff7f00').h)).toBeLessThan(30)
    expect(hueDifference(hexToHsl('#ff0000').h, hexToHsl('#ff8000').h)).toBeGreaterThan(30)
    expect(Math.abs(cieLightness('#ff7f00') - cieLightness('#ff0000'))).toBeLessThan(15)
    expect(Math.abs(cieLightness('#ff8000') - cieLightness('#ff0000'))).toBeLessThan(15)
    expect(violatesImageColorRule('#ff7f00', image)).toBe(true)
    expect(violatesImageColorRule('#ff8000', image)).toBe(false)
  })

  it('밝기(L*) 차이 15 경계: 14.9는 걸리고 15.3은 통과한다(색상 차이는 둘 다 0°)', () => {
    const image = ['#808080']
    expect(Math.abs(cieLightness('#a7a7a7') - cieLightness('#808080'))).toBeLessThan(15)
    expect(Math.abs(cieLightness('#a8a8a8') - cieLightness('#808080'))).toBeGreaterThan(15)
    expect(violatesImageColorRule('#a7a7a7', image)).toBe(true)
    expect(violatesImageColorRule('#a8a8a8', image)).toBe(false)
  })

  it('대표 색 세 개 중 하나라도 걸리면 제외한다', () => {
    const farBlue = '#0000ff'
    const farGreen = '#00aa00'
    expect(violatesImageColorRule('#ff7f00', [farBlue, farGreen, '#ff0000'])).toBe(true)
    expect(violatesImageColorRule('#ff7f00', [farBlue, farGreen])).toBe(false)
  })

  it('대표 색이 없으면 걸리지 않고, 읽을 수 없는 대표 색은 건너뛴다', () => {
    expect(violatesImageColorRule('#ff0000', [])).toBe(false)
    expect(violatesImageColorRule('#ff0000', ['not-a-color', ''])).toBe(false)
    expect(violatesImageColorRule('#ff7f00', ['not-a-color', '#ff0000'])).toBe(true)
  })

  it('같은 색은 걸린다', () => {
    expect(violatesImageColorRule('#ff0000', ['#ff0000'])).toBe(true)
  })

  it('isHexColor는 읽을 수 있는 hex만 참이다', () => {
    expect(isHexColor('#ff1d1d')).toBe(true)
    expect(isHexColor('FFF')).toBe(true)
    expect(isHexColor('#ggg')).toBe(false)
    expect(isHexColor(null)).toBe(false)
    expect(isHexColor(12)).toBe(false)
  })
})

describe('배제 표(chipExclusionRule)', () => {
  it('같은 색끼리는 걸린다', () => {
    for (const key of ['yellow', 'green', 'pink', 'sky', 'purple']) expect(chipExclusionRule(key, key)).toBe('table')
  })

  it('빨강과 초록·짙은 초록은 칩과 면이 바뀌어도 걸린다', () => {
    for (const green of ['green', 'green-deep']) {
      expect(chipExclusionRule('red', green)).toBe('table')
      expect(chipExclusionRule(green, 'red')).toBe('table')
    }
  })

  it('노랑 위 흰 칩과 분홍 위 보라 칩은 걸리고 반대 방향은 통과한다', () => {
    expect(chipExclusionRule('white', 'yellow')).toBe('table')
    expect(chipExclusionRule('yellow', 'white')).toBeNull()
    expect(chipExclusionRule('purple', 'pink')).toBe('table')
    expect(chipExclusionRule('pink', 'purple')).toBeNull()
  })

  it('표에 없는 조합은 통과한다', () => {
    expect(chipExclusionRule('white', 'green-deep')).toBeNull()
    expect(chipExclusionRule('red', 'yellow')).toBeNull()
    expect(chipExclusionRule('purple', 'sky')).toBeNull()
    expect(chipExclusionRule('sky', 'pink')).toBeNull()
  })
})
