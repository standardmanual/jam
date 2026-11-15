/**
 * templateColors: 템플릿 색 읽기·조정·적용 (티켓 20261116_0632)
 * 실행: cd jam-web && npx vitest run src/lib/admin/activityBadgeTemplate
 */
import { describe, it, expect } from 'vitest'
import {
  parseSvgColor,
  extractSvgColors,
  adjustColor,
  hexToHsl,
  hslToHex,
  buildColorMap,
  applyColorMap,
  dominantHue,
  hueShiftForFamily,
  COLOR_FAMILIES,
} from '../templateColors'
import { TemplateSvgError } from '../templateSvg'

const NS = 'xmlns="http://www.w3.org/2000/svg"'
const none = { hueShift: 0, saturation: 0, lightness: 0 }

describe('parseSvgColor', () => {
  it('여러 표기를 대문자 #RRGGBB로 읽는다', () => {
    expect(parseSvgColor('#abc')).toBe('#AABBCC')
    expect(parseSvgColor('#123b2e')).toBe('#123B2E')
    expect(parseSvgColor('#123b2e80')).toBe('#123B2E')
    expect(parseSvgColor('rgb(18, 59, 46)')).toBe('#123B2E')
    expect(parseSvgColor('rgb(18 59 46)')).toBe('#123B2E')
    expect(parseSvgColor('white')).toBe('#FFFFFF')
    expect(parseSvgColor('black')).toBe('#000000')
  })
  it('색이 아니거나 읽지 못하면 null', () => {
    for (const v of ['none', 'url(#a)', 'currentColor', 'transparent', 'inherit', 'red', '#12', 'rgb(300,0,0)', '']) {
      expect(parseSvgColor(v)).toBeNull()
    }
  })
})

describe('extractSvgColors', () => {
  it('fill·stroke·stop-color·style 안의 색을 처음 나온 순서와 횟수로 돌려준다', () => {
    const svg = `<svg ${NS}><defs><linearGradient id="g"><stop stop-color="#112233"/></linearGradient></defs><rect fill="#123B2E" stroke="none"/><rect fill="url(#paint0)" stroke="#000"/><path style="fill:#123b2e;stroke:#112233"/></svg>`
    expect(extractSvgColors(svg)).toEqual([
      { color: '#112233', count: 2 },
      { color: '#123B2E', count: 2 },
      { color: '#000000', count: 1 },
    ])
  })
  it('읽지 못하는 SVG는 TemplateSvgError', () => {
    expect(() => extractSvgColors('<svg')).toThrow(TemplateSvgError)
  })
})

describe('색 변환과 adjustColor', () => {
  it('hexToHsl과 hslToHex가 되돌려진다', () => {
    expect(hexToHsl('#FF0000')).toEqual({ h: 0, s: 1, l: 0.5 })
    expect(hslToHex(hexToHsl('#123B2E'))).toBe('#123B2E')
  })
  it('색상을 돌린다', () => {
    expect(adjustColor('#FF0000', { ...none, hueShift: 120 })).toBe('#00FF00')
    expect(adjustColor('#FF0000', { ...none, hueShift: -30 })).toBe(adjustColor('#FF0000', { ...none, hueShift: 330 }))
  })
  it('채도·명도 끝값', () => {
    expect(adjustColor('#FF0000', { ...none, saturation: -100 })).toBe('#808080')
    expect(adjustColor('#FF0000', { ...none, lightness: 100 })).toBe('#FFFFFF')
    expect(adjustColor('#FF0000', { ...none, lightness: -100 })).toBe('#000000')
  })
  it('무채색은 채도를 올려도 색이 끼지 않는다', () => {
    expect(adjustColor('#FFFFFF', { ...none, saturation: 50 })).toBe('#FFFFFF')
    expect(adjustColor('#808080', { ...none, saturation: 100, hueShift: 90 })).toBe('#808080')
  })
})

describe('buildColorMap과 applyColorMap', () => {
  it('칸 하나씩 바꾼 색 위에도 전체 조정이 얹힌다', () => {
    const map = buildColorMap(['#FF0000', '#0000FF'], { ...none, hueShift: 120, overrides: { '#0000FF': '#FF0000' } })
    expect(map['#FF0000']).toBe('#00FF00')
    expect(map['#0000FF']).toBe('#00FF00')
  })
  it('대응표에 있는 색만 바꾸고 색이 아닌 값은 건드리지 않는다', () => {
    const svg = `<svg ${NS}><rect fill="#123B2E" stroke="none"/><rect fill="url(#paint0)" stroke="#FFFFFF" width="5"/></svg>`
    const out = applyColorMap(svg, { '#123B2E': '#AA0000' })
    expect(out).toContain('fill="#AA0000"')
    expect(out).toContain('stroke="none"')
    expect(out).toContain('fill="url(#paint0)"')
    expect(out).toContain('stroke="#FFFFFF"')
    expect(out).toContain('width="5"')
  })
  it('style 선언의 색을 각각 바꾸고 다른 선언은 둔다', () => {
    const svg = `<svg ${NS}><path style="fill:#123B2E;stroke:#000;opacity:0.5"/></svg>`
    const out = applyColorMap(svg, { '#123B2E': '#AA0000', '#000000': '#0000FF' })
    expect(out).toContain('style="fill:#AA0000;stroke:#0000FF;opacity:0.5"')
  })
  it('#RRGGBBAA는 새 색 뒤에 투명도를 붙인다', () => {
    const svg = `<svg ${NS}><rect fill="#123B2E80"/></svg>`
    expect(applyColorMap(svg, { '#123B2E': '#AA0000' })).toContain('fill="#AA000080"')
  })
})

describe('색 계열', () => {
  it('여덟 계열의 색상', () => {
    expect(COLOR_FAMILIES.map((f) => f.hue)).toEqual([0, 28, 50, 135, 178, 215, 270, 330])
  })
  it('dominantHue는 count×채도가 큰 색을 고르고 무채색·극단 명도는 뺀다', () => {
    const red = { color: '#FF0000', count: 1 }
    const green = { color: '#00FF00', count: 2 }
    expect(dominantHue([red, green])).toBe(120)
    expect(dominantHue([red, { color: '#00FF00', count: 1 }])).toBe(0)
    expect(dominantHue([{ color: '#FFFFFF', count: 9 }, { color: '#808080', count: 3 }])).toBeNull()
  })
  it('hueShiftForFamily는 -180 초과 180 이하로 돌려준다', () => {
    const c = [{ color: hslToHex({ h: 150, s: 1, l: 0.5 }), count: 1 }]
    expect(hueShiftForFamily(c, 215)).toBeCloseTo(65, 0)
    expect(hueShiftForFamily(c, 0)).toBeCloseTo(-150, 0)
    expect(hueShiftForFamily([{ color: '#FFFFFF', count: 1 }], 215)).toBeNull()
  })
})
