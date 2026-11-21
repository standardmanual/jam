/**
 * 홈피드 색 자동 규칙 (티켓 20261121_0012)
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/feedColorRules.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  cieLightness,
  COLOR_RULE_THRESHOLDS,
  feedColorHexes,
  firstViolatedRule,
  hexToHsl,
  hexToRgb,
  hueDifference,
  isHexColor,
  isVividPrimary,
  luminanceRatio,
  passesColorRules,
  relativeLuminance,
  summarizeColorPairs,
  summarizeFeedColors,
  violatesContrastRule,
  violatesImageColorRule,
  violatesKidsRule,
  violatesLightnessRule,
} from '../feedColorRules'
import { FEED_COLORS } from '../feedConstants'

describe('색 계산', () => {
  it('hex를 읽는다(대소문자·#·3자리). 읽을 수 없으면 던진다', () => {
    expect(hexToRgb('#ff1d1d')).toEqual([255, 29, 29])
    expect(hexToRgb('FF1D1D')).toEqual([255, 29, 29])
    expect(hexToRgb('#fff')).toEqual([255, 255, 255])
    expect(() => hexToRgb('#12345')).toThrow()
    expect(() => hexToRgb('red')).toThrow()
  })

  it('상대 휘도·대비 비·CIE L*가 기준값과 맞는다', () => {
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 10)
    expect(luminanceRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(luminanceRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5)
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

  it('원색 판정: 채도 0.85 초과·명도 0.4~0.62(경계 명도는 포함, 경계 채도는 제외)', () => {
    expect(isVividPrimary({ h: 0, s: 0.86, l: 0.5 })).toBe(true)
    expect(isVividPrimary({ h: 0, s: 0.85, l: 0.5 })).toBe(false)
    expect(isVividPrimary({ h: 0, s: 1, l: 0.4 })).toBe(true)
    expect(isVividPrimary({ h: 0, s: 1, l: 0.62 })).toBe(true)
    expect(isVividPrimary({ h: 0, s: 1, l: 0.39 })).toBe(false)
    expect(isVividPrimary({ h: 0, s: 1, l: 0.63 })).toBe(false)
  })
})

describe('규칙별 경계값', () => {
  it('① 같은 색은 대소문자·공백과 무관하게 «같은 색»이다', () => {
    expect(firstViolatedRule('#FF1D1D', '#ff1d1d')).toBe('same')
    expect(firstViolatedRule('#FF1D1D', ' #ff1d1d ')).toBe('same')
  })

  it('② 상대 휘도 비 1.15 미만이면 제외한다(1.15는 통과)', () => {
    // 같은 색상(0°)·명도 차이를 크게 줘도 휘도 비 자체를 본다: 검정과 아주 짙은 회색
    expect(luminanceRatio('#000000', '#050505')).toBeLessThan(COLOR_RULE_THRESHOLDS.minLuminanceRatio)
    expect(violatesContrastRule('#000000', '#050505')).toBe(true)
    // 색상 차이가 커서 다른 두 갈래에 걸리지 않는 쌍: 회색 두 개의 휘도 비가 1.15를 넘으면 통과
    expect(luminanceRatio('#808080', '#A0A0A0')).toBeGreaterThan(COLOR_RULE_THRESHOLDS.minLuminanceRatio)
  })

  it('② 색상 차이 30도 미만이면서 명도 차이 0.09 미만이면 제외한다', () => {
    // 색상 약 12° 차이(노랑 두 개), 명도 0.73 vs 0.68 → 차이 0.05
    expect(violatesContrastRule('#FFDD73', '#F2EC6A')).toBe(true)
    // 같은 색상 계열이라도 명도 차이가 0.09 이상이면 이 갈래에 걸리지 않는다(빨강 vs 연한 빨강: 0.56 vs 0.80)
    expect(violatesContrastRule('#FF1D1D', '#FF9A9A')).toBe(false)
  })

  it('② 원색 둘이 색상 차이 90도를 넘으면 제외한다(90도 이하는 걸리지 않는다)', () => {
    // 빨강(0°)과 파랑(203°)은 둘 다 원색이고 색상 차이가 157°다
    expect(violatesContrastRule('#FF1D1D', '#0695EC')).toBe(true)
    // 빨강(0°)과 노랑(46°)은 둘 다 원색이지만 색상 차이가 90° 이하라 이 갈래에는 걸리지 않는다
    expect(hueDifference(hexToHsl('#FF1D1D').h, hexToHsl('#FEC100').h)).toBeLessThanOrEqual(90)
    expect(violatesContrastRule('#FF1D1D', '#FEC100')).toBe(false)
  })

  it('③ 채도 높은 원색 둘의 조합은 키즈 규칙으로 제외한다', () => {
    // 빨강·노랑은 대비 규칙을 통과하지만 둘 다 원색이라 키즈 규칙에 걸린다
    expect(violatesKidsRule('#FF1D1D', '#FEC100')).toBe(true)
    expect(firstViolatedRule('#FF1D1D', '#FEC100')).toBe('kids')
  })

  it('③ 명도 0.7 초과 밝은 색 둘이 색상 차이 40도를 넘으면 제외한다', () => {
    // 연한 노랑(45°)·연한 파랑(203°): 둘 다 명도 0.7 초과, 색상 차이 158°
    expect(violatesKidsRule('#FFDD73', '#8FCFF6')).toBe(true)
    // 연한 빨강(0°)·연한 노랑(45°): 색상 차이 45° → 걸린다
    expect(violatesKidsRule('#FF9A9A', '#FFDD73')).toBe(true)
    // 밝은 색이 하나뿐이면 걸리지 않는다: 연한 빨강(명도 0.80)과 빨강(명도 0.56)
    expect(violatesKidsRule('#FF9A9A', '#FF1D1D')).toBe(false)
  })

  it('④ 칩과 다른 것은 L* 차이 15 이상이거나 색상 차이 150도 이상이어야 한다', () => {
    // 레드(L* 54)와 참조 블루(L* 77): 차이 22 → 통과
    expect(violatesLightnessRule('#FF1D1D', '#95C1F7')).toBe(false)
    // 빨강(L* 54)과 퍼플(L* 66): L* 차이 11.7, 색상 차이 94° → 제외
    expect(violatesLightnessRule('#FF1D1D', '#BA8AF7')).toBe(true)
    // L* 차이가 작아도 색상 차이가 150도 이상(보색)이면 통과한다: 연한 파랑 vs 연한 노랑
    const t = COLOR_RULE_THRESHOLDS
    expect(Math.abs(cieLightness('#FFDD73') - cieLightness('#8FCFF6'))).toBeLessThan(t.minCieLightnessDiff)
    expect(hueDifference(hexToHsl('#FFDD73').h, hexToHsl('#8FCFF6').h)).toBeGreaterThanOrEqual(t.complementaryHueDegrees)
    expect(violatesLightnessRule('#FFDD73', '#8FCFF6')).toBe(false)
  })

  it('④는 칩이 끼지 않은 쌍(배경·박스)에는 적용하지 않는다', () => {
    // 빨강·퍼플은 ④에만 걸린다(L* 차이 11.7, 색상 차이 94°)
    expect(firstViolatedRule('#FF1D1D', '#BA8AF7', { involvesChip: true })).toBe('lightness')
    expect(firstViolatedRule('#FF1D1D', '#BA8AF7', { involvesChip: false })).toBeNull()
  })

  it('규칙은 두 색의 순서와 무관하다', () => {
    const hexes = feedColorHexes()
    for (const a of hexes) {
      for (const b of hexes) {
        if (a === b) continue
        expect(firstViolatedRule(a, b)).toBe(firstViolatedRule(b, a))
      }
    }
  })
})

describe('15색 순서쌍 필터', () => {
  const summary = summarizeFeedColors()

  it('색 키 표의 15색을 키 순서대로 낸다', () => {
    expect(feedColorHexes()).toEqual(Object.values(FEED_COLORS).map((color) => color.hex))
    expect(feedColorHexes()).toHaveLength(15)
  })

  // 정답 대조: PRD §6이 적은 2026-11-20 샘플 계산값(210 → 대비 50, 키즈 36, 명도 50 제외 → 74 남음).
  // 구현 결과가 이 값과 어긋나면 임계값을 바꿔 맞추지 않고 어긋난 규칙과 원인을 티켓의 «주요 의사결정»에 적는다.
  it('210가지 순서쌍에서 대비 50·키즈 36·명도 50이 빠져 74가지가 남는다 (PRD 값과 같다)', () => {
    expect(summary.total).toBe(210)
    expect(summary.excludedByContrast).toBe(50)
    expect(summary.excludedByKids).toBe(36)
    expect(summary.excludedByLightness).toBe(50)
    expect(summary.remaining).toBe(74)
    expect(summary.remainingPairs).toHaveLength(74)
    expect(summary.excludedByContrast + summary.excludedByKids + summary.excludedByLightness + summary.remaining).toBe(
      summary.total,
    )
  })

  it('남은 쌍은 모두 규칙을 통과하고, 순서를 뒤집은 쌍도 남아 있다', () => {
    const hexes = feedColorHexes()
    const set = new Set(summary.remainingPairs.map(([i, j]) => `${i}-${j}`))
    for (const [i, j] of summary.remainingPairs) {
      expect(passesColorRules(hexes[i], hexes[j])).toBe(true)
      expect(set.has(`${j}-${i}`)).toBe(true)
    }
  })

  it('hex만 바꿔 넣어도 결과가 달라진다(색 키 표에 묶여 있지 않다)', () => {
    // 회색 세 개: 같은 색상이라 «색상 30도 미만 & 명도 0.09 미만»·휘도 비 규칙이 결과를 정한다
    const grays = summarizeColorPairs(['#000000', '#FFFFFF', '#050505'])
    expect(grays.total).toBe(6)
    // 검정↔흰색만 통과하고 검정↔짙은 회색·흰색↔짙은 회색 중 흰색↔짙은 회색은 L*·휘도 비가 커서 통과한다
    expect(grays.remaining).not.toBe(summary.remaining)
    // 같은 hex를 두 번 넣으면 «같은 색»이라 어느 단계에서도 세지 않고 총 쌍 수에서 뺀다
    expect(summarizeColorPairs(['#FF1D1D', '#ff1d1d', '#0695EC']).total).toBe(4)
    // 15색 표의 hex를 다른 색으로 바꾸면 결과가 달라진다
    const swapped = [...feedColorHexes()]
    swapped[0] = '#101010'
    expect(summarizeColorPairs(swapped)).not.toEqual(summary)
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

  it('같은 색은 걸리고, 순서쌍 판정(firstViolatedRule)은 이미지 규칙을 돌려주지 않는다', () => {
    expect(violatesImageColorRule('#ff0000', ['#ff0000'])).toBe(true)
    const names = feedColorHexes().flatMap((a) => feedColorHexes().map((b) => firstViolatedRule(a, b)))
    expect(names).not.toContain('image')
  })

  it('isHexColor는 읽을 수 있는 hex만 참이다', () => {
    expect(isHexColor('#ff1d1d')).toBe(true)
    expect(isHexColor('FFF')).toBe(true)
    expect(isHexColor('#ggg')).toBe(false)
    expect(isHexColor(null)).toBe(false)
    expect(isHexColor(12)).toBe(false)
  })
})
