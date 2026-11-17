/**
 * 코드로 정의한 템플릿 (티켓 20261116_1435, 20261116_1634)
 * 실행: cd jam-web && npx vitest run src/lib/admin/activityBadgeTemplate
 */
import { describe, it, expect } from 'vitest'
import { BADGE_TEMPLATE_DEFS, getBadgeTemplateDef } from '../templates'
import { DAYS_TEMPLATE, nameSampleShapes } from '../templates/days'
import { DAYS_ORIGINAL_SVG } from '../templates/daysSvg'
import { STREAK_TEMPLATE, nameSampleTextLayers } from '../templates/streak'
import { STREAK_ORIGINAL_SVG } from '../templates/streakSvg'
import { COUNT_TEMPLATE } from '../templates/count'
import { METRIC_TEMPLATE_SVG } from '../templates/metricSvg'
import { METRIC_LOWER_HALF_GREEN, flattenLowerHalf } from '../templates/metric'
import { isArcSlot, type TemplateArcSlot } from '../templateDef'
import { layoutArcText } from '../arcText'
import { stripSlotText, resolveTemplateFont, layoutSlotText } from '../composeTemplate'
import { extractSvgColors, applyColorMap, buildColorMap } from '../templateColors'
import type { TemplateSlot } from '../templateSvg'

describe('getBadgeTemplateDef', () => {
  it('metric은 표의 수치를 가진다', () => {
    const d = getBadgeTemplateDef('metric')!
    expect(d.classKey).toBe('metric')
    expect(d.slots.viewBoxWidth).toBe(764)
    expect(d.slots.viewBoxHeight).toBe(764)
    expect(d.slots.name).toMatchObject({
      kind: 'arc', cx: 382, cy: 382, baselineRadius: 267.93, centerDeg: 0.09, facing: 'outward',
      maxSpanDeg: 166.95, fontSize: 71.34, letterSpacingEm: -0.0669, fontFamily: 'Noto Sans KR', fontWeight: '900', fill: '#000000',
    })
    expect(d.slots.value).toEqual({
      found: true, isText: true, x: 98.4085, y: 535.408, fontFamily: 'Noto Sans KR', fontSize: 108.333, fontWeight: '900',
      fill: '#000000', letterSpacing: '-0.08em', textAnchor: null, transform: null, placeholder: '1829283km', maxWidth: 620,
    })
  })
  it('streak은 표의 수치를 가진다', () => {
    const d = getBadgeTemplateDef('streak')!
    expect(d.classKey).toBe('streak')
    expect(d.slots.viewBoxWidth).toBe(1021)
    expect(d.slots.viewBoxHeight).toBe(834)
    const common = {
      found: true, isText: true, fontFamily: 'Noto Sans KR', fontWeight: '900', fill: '#000000',
      letterSpacing: '-0.08em', textAnchor: null, transform: null,
    }
    expect(d.slots.name).toEqual({ ...common, x: 40.4758, y: 345.745, fontSize: 90, placeholder: '동해물과 백두산이 백두산이' })
    expect(d.slots.value).toEqual({ ...common, x: 197.157, y: 574.845, fontSize: 129, placeholder: '연속 3000일' })
  })
  it('days는 표의 수치를 가진다', () => {
    const d = getBadgeTemplateDef('days')!
    expect(d.classKey).toBe('days')
    expect(d.slots.viewBoxWidth).toBe(702)
    expect(d.slots.viewBoxHeight).toBe(1098)
    expect(d.slots.name).toMatchObject({
      kind: 'arc', cx: 351, cy: 300.49, baselineRadius: 178.13, centerDeg: 0.25, facing: 'outward',
      maxSpanDeg: 177.2, fontFamily: 'Noto Sans KR', fontWeight: '900', fontSize: 84, letterSpacingEm: -0.0802, fill: '#000000',
    })
    expect(d.slots.value).toMatchObject({
      found: true, isText: true, x: 350.51, y: 949.75, fontFamily: 'Noto Sans KR', fontSize: 116.44, fontWeight: '900',
      fill: '#000000', letterSpacing: '-0.0756em', textAnchor: 'middle', transform: null, placeholder: '1000일',
    })
  })
  it('count는 표의 수치를 가진다', () => {
    const d = getBadgeTemplateDef('count')!
    expect(d.classKey).toBe('count')
    expect(d.slots.viewBoxWidth).toBe(1582)
    expect(d.slots.viewBoxHeight).toBe(958)
    const common = {
      found: true, isText: true, x: 791, fontFamily: 'Noto Sans KR', fontWeight: '900', fill: '#000000',
      letterSpacing: '-0.08em', textAnchor: 'middle', transform: null,
    }
    expect(d.slots.name).toEqual({ ...common, y: 487.64, fontSize: 101.84, placeholder: '벼룩시장 건너편', maxWidth: 663.4 })
    expect(d.slots.value).toEqual({ ...common, y: 626.35, fontSize: 92.01, placeholder: '5가지', maxWidth: 376.2 })
  })
  it('네 분류가 모두 정의를 가진다', () => {
    for (const k of ['metric', 'days', 'streak', 'count'] as const) expect(getBadgeTemplateDef(k)).not.toBeNull()
  })
  it('기타는 아직 정의가 없다', () => {
    expect(getBadgeTemplateDef('etc')).toBeNull()
  })
})

describe('등록된 모든 정의 공통', () => {
  for (const [key, def] of Object.entries(BADGE_TEMPLATE_DEFS)) {
    describe(key, () => {
      it('viewBox가 정의와 같다', () => {
        const m = def!.svg.match(/viewBox="0 0 (\d+) (\d+)"/)!
        expect([Number(m[1]), Number(m[2])]).toEqual([def!.slots.viewBoxWidth, def!.slots.viewBoxHeight])
      })
      it('샘플 글자를 걷어 내면 name·value 자리가 남지 않는다', () => {
        const out = stripSlotText(def!.svg)
        expect(out).not.toMatch(/id="(name|value)"/)
      })
      it('글꼴이 대체 없이 굵기 900', () => {
        for (const slot of [def!.slots.name, def!.slots.value]) {
          const f = resolveTemplateFont(slot)
          expect(f.fallback).toBe(false)
          expect(f.font.weight).toBe(900)
        }
      })
    })
  }
})

describe('metric 전용', () => {
  const def = getBadgeTemplateDef('metric')!
  it('원본에는 이름 모양 <path id="name">과 값 <text id="value">가 하나씩 있다', () => {
    expect(METRIC_TEMPLATE_SVG.match(/<path id="name"/g)).toHaveLength(1)
    expect(METRIC_TEMPLATE_SVG.match(/<text id="value"/g)).toHaveLength(1)
  })
  it('샘플 글자를 걷어 내도 반원 두 개·로고는 남는다', () => {
    const out = stripSlotText(def.svg)
    for (const id of ['Subtract', 'Subtract_2', 'Vector_2']) expect(out).toContain(`id="${id}"`)
    expect(out).not.toContain('1829283km')
  })
  it('색: 글자 #000000, 위 반원 #FF5900, 아래 반원 초록 #0A8B5E, 로고 #FBFF00', () => {
    const colors = extractSvgColors(def.svg).map((c) => String(c.color).toUpperCase())
    for (const c of ['#000000', '#FF5900', METRIC_LOWER_HALF_GREEN, '#FBFF00']) expect(colors).toContain(c)
  })
  it('아래 반원은 그라데이션이 아니라 단색이고, 원본과 다른 곳은 그 묶음 하나뿐이다', () => {
    expect(METRIC_TEMPLATE_SVG).toContain('foreignObject')
    expect(def.svg).not.toContain('foreignObject')
    expect(def.svg).not.toContain('data-figma-gradient-fill')
    expect(def.svg.match(/id="Subtract_2"/g)).toHaveLength(1)
    // 윗부분(위 반원)과 뒷부분(글자·로고)은 원본 그대로다
    const head = METRIC_TEMPLATE_SVG.slice(0, METRIC_TEMPLATE_SVG.indexOf('<g id="Subtract_2">'))
    expect(def.svg.startsWith(head)).toBe(true)
    const tail = METRIC_TEMPLATE_SVG.slice(METRIC_TEMPLATE_SVG.indexOf('<g id="Vector">'))
    expect(def.svg).toContain(tail.slice(0, tail.indexOf('<defs>')))
  })
  it('색 조정이 아래 반원 초록에도 먹는다', () => {
    const map = buildColorMap(extractSvgColors(def.svg).map((c) => String(c.color)), { hueShift: 120, saturation: 0, lightness: 0 })
    const out = applyColorMap(def.svg, map)
    expect(out).not.toContain(`fill="${METRIC_LOWER_HALF_GREEN}"`)
    expect(out).toContain(`fill="${map[METRIC_LOWER_HALF_GREEN]}"`)
  })
  it('아래 반원 묶음이 없으면 원본을 그대로 돌려준다', () => {
    const plain = '<svg><path d="M0 0"/></svg>'
    expect(flattenLowerHalf(plain)).toBe(plain)
  })
  it('이름은 원호 자리, 값은 직선 자리', () => {
    expect(isArcSlot(def.slots.name)).toBe(true)
    expect(isArcSlot(def.slots.value)).toBe(false)
  })
  it('값 직선 배치가 샘플 글자 폭의 가운데(그림 가운데 382)에 맞고 긴 값은 줄어든다', () => {
    const value = def.slots.value as TemplateSlot
    const v = layoutSlotText({ slot: value, viewWidth: 764, placeholderWidth: 567.9, contentWidth: 330 })!
    expect(v.anchorX).toBeCloseTo(382.4, 0)
    expect(v.shrunk).toBe(false)
    const long = layoutSlotText({ slot: value, viewWidth: 764, placeholderWidth: 567.9, contentWidth: 700 })!
    expect(long.shrunk).toBe(true)
    expect(long.fontSizePx).toBeCloseTo((108.333 * 620) / 700, 3)
  })
  it('이름 원호 배치: 샘플과 같은 15자는 샘플이 차지한 각도(약 167°)에 들어간다', () => {
    const name = def.slots.name as TemplateArcSlot
    const advances = Array(15).fill(name.fontSize * 0.9)
    const out = layoutArcText({ advances, fontSize: name.fontSize, letterSpacingEm: name.letterSpacingEm, cx: name.cx, cy: name.cy, baselineRadius: name.baselineRadius, centerDeg: name.centerDeg, facing: name.facing, maxSpanDeg: name.maxSpanDeg })!
    expect(out.spanDeg).toBeLessThanOrEqual(name.maxSpanDeg + 0.01)
  })
})

describe('streak 전용', () => {
  it('원본에는 <text>가 둘이고, id만 name·value로 바뀐다', () => {
    expect(STREAK_ORIGINAL_SVG.match(/<text/g)).toHaveLength(2)
    const out = nameSampleTextLayers(STREAK_ORIGINAL_SVG)
    expect(out.match(/id="name"/g)).toHaveLength(1)
    expect(out.match(/id="value"/g)).toHaveLength(1)
    const a = STREAK_ORIGINAL_SVG.split('\n')
    const b = out.split('\n')
    expect(b).toHaveLength(a.length)
    const diff = a.map((line, i) => (line === b[i] ? -1 : i)).filter((i) => i >= 0)
    expect(diff).toHaveLength(2)
    expect(b[diff[0]]).toBe(a[diff[0]].replace(/<text id="[^"]*"/, '<text id="name"'))
    expect(b[diff[1]]).toBe(a[diff[1]].replace(/<text id="[^"]*"/, '<text id="value"'))
  })
  it('<text>가 둘이 아니면 원본을 그대로 돌려준다', () => {
    const one = '<svg><text id="a">x</text></svg>'
    expect(nameSampleTextLayers(one)).toBe(one)
  })
  it('샘플 글자를 걷어 내도 선·묶음·모양은 남는다', () => {
    const out = stripSlotText(STREAK_TEMPLATE.svg)
    expect(out).not.toContain('<text')
    for (const id of ['Line 1', 'Group', 'Vector']) expect(out).toContain(`id="${id}"`)
  })
  it('색은 #000000·#5BF700·#FFFFFF', () => {
    const colors = extractSvgColors(STREAK_TEMPLATE.svg).map((c) => String(c.color).toUpperCase())
    for (const c of ['#000000', '#5BF700', '#FFFFFF']) expect(colors).toContain(c)
  })
  it('두 자리는 직선 자리다', () => {
    expect(isArcSlot(STREAK_TEMPLATE.slots.name)).toBe(false)
    expect(isArcSlot(STREAK_TEMPLATE.slots.value)).toBe(false)
  })
  it('직선 글자 배치가 샘플 글자 폭의 가운데에 맞는다', () => {
    const name = STREAK_TEMPLATE.slots.name as TemplateSlot
    const value = STREAK_TEMPLATE.slots.value as TemplateSlot
    const n = layoutSlotText({ slot: name, viewWidth: 1021, placeholderWidth: 950.4, contentWidth: 630 })!
    expect(n.anchorX).toBeCloseTo(515.68, 1)
    expect(n.shrunk).toBe(false)
    const v = layoutSlotText({ slot: value, viewWidth: 1021, placeholderWidth: 634.2, contentWidth: 497.7 })!
    expect(v.anchorX).toBeCloseTo(514.26, 1)
    expect(v.shrunk).toBe(false)
  })
})

describe('days 전용', () => {
  const sampleShapes = (svg: string) => svg.match(/<path id="(?!Union|Line)[^"]*"/g) ?? []
  it('원본에는 샘플 글자 모양 <path>가 둘이고, id만 name·value로 바뀐다', () => {
    expect(sampleShapes(DAYS_ORIGINAL_SVG)).toHaveLength(2)
    const out = nameSampleShapes(DAYS_ORIGINAL_SVG)
    expect(out.match(/id="name"/g)).toHaveLength(1)
    expect(out.match(/id="value"/g)).toHaveLength(1)
    const a = DAYS_ORIGINAL_SVG.split('\n')
    const b = out.split('\n')
    expect(b).toHaveLength(a.length)
    const diff = a.map((line, i) => (line === b[i] ? -1 : i)).filter((i) => i >= 0)
    expect(diff).toHaveLength(2)
    expect(b[diff[0]]).toBe(a[diff[0]].replace(/<path id="[^"]*"/, '<path id="name"'))
    expect(b[diff[1]]).toBe(a[diff[1]].replace(/<path id="[^"]*"/, '<path id="value"'))
  })
  it('샘플 글자 모양이 둘이 아니면 원본을 그대로 돌려준다', () => {
    const one = '<svg><path id="Union" d="M0 0"/><path id="샘플" d="M0 0"/></svg>'
    expect(nameSampleShapes(one)).toBe(one)
  })
  it('샘플 글자를 걷어 내도 알약·선·그림 묶음은 남는다', () => {
    const out = stripSlotText(DAYS_TEMPLATE.svg)
    for (const id of ['Union', 'Line 1', 'Vector_3']) expect(out).toContain(`id="${id}"`)
  })
  it('색은 #000000·#990000·#FF0000', () => {
    const colors = extractSvgColors(DAYS_TEMPLATE.svg).map((c) => String(c.color).toUpperCase())
    for (const c of ['#000000', '#990000', '#FF0000']) expect(colors).toContain(c)
  })
  it('이름은 원호 자리, 값은 직선 자리다', () => {
    expect(isArcSlot(DAYS_TEMPLATE.slots.name)).toBe(true)
    expect(isArcSlot(DAYS_TEMPLATE.slots.value)).toBe(false)
  })
  it('원호 글자 배치가 각도 한도를 지킨다', () => {
    const s = DAYS_TEMPLATE.slots.name
    if (!isArcSlot(s)) throw new Error('원호 자리여야 한다')
    const input = {
      fontSize: s.fontSize, letterSpacingEm: s.letterSpacingEm, cx: s.cx, cy: s.cy,
      baselineRadius: s.baselineRadius, centerDeg: s.centerDeg, facing: s.facing, maxSpanDeg: s.maxSpanDeg,
    }
    const fit = layoutArcText({ ...input, advances: Array(9).fill(50) })!
    expect(fit.shrunk).toBe(false)
    expect(fit.spanDeg).toBeLessThanOrEqual(s.maxSpanDeg)
    const wide = layoutArcText({ ...input, advances: Array(9).fill(70) })!
    expect(wide.shrunk).toBe(true)
    expect(wide.spanDeg).toBeLessThanOrEqual(s.maxSpanDeg + 1e-6)
  })
  it('직선 글자 배치가 가운데 기준이고 줄지 않는다', () => {
    const value = DAYS_TEMPLATE.slots.value as TemplateSlot
    const v = layoutSlotText({ slot: value, viewWidth: 702, placeholderWidth: 355.5, contentWidth: 230 })!
    expect(v.anchorX).toBeCloseTo(350.51, 1)
    expect(v.shrunk).toBe(false)
  })
})

describe('count 전용', () => {
  const name = COUNT_TEMPLATE.slots.name as TemplateSlot
  const value = COUNT_TEMPLATE.slots.value as TemplateSlot
  it('샘플 글자를 걷어 내도 줄무늬·로고 경로는 남는다', () => {
    const out = stripSlotText(COUNT_TEMPLATE.svg)
    expect(out).not.toContain('<text')
    for (const id of ['Rectangle 10', 'Rectangle 11', 'Vector']) expect(out).toContain(`id="${id}"`)
  })
  it('색은 #F95B1D·#D3ACFD·#222222·#000000', () => {
    const colors = extractSvgColors(COUNT_TEMPLATE.svg).map((c) => String(c.color).toUpperCase())
    for (const c of ['#F95B1D', '#D3ACFD', '#222222', '#000000']) expect(colors).toContain(c)
  })
  it('색을 바꿔도 mix-blend-mode와 fill-opacity가 남는다', () => {
    const colors = extractSvgColors(COUNT_TEMPLATE.svg)
    const map: Record<string, string> = {}
    for (const c of colors) map[String(c.color)] = '#123456'
    const out = applyColorMap(COUNT_TEMPLATE.svg, map)
    expect(out).toContain('mix-blend-mode:overlay')
    expect(out).toContain('fill-opacity="0.97"')
    expect(out).toContain('#123456')
    expect(out).not.toContain('#F95B1D')
  })
  it('두 자리는 직선 자리다', () => {
    expect(isArcSlot(COUNT_TEMPLATE.slots.name)).toBe(false)
    expect(isArcSlot(COUNT_TEMPLATE.slots.value)).toBe(false)
  })
  it('직선 글자 배치는 가운데 축에 놓이고 최대 폭을 넘을 때만 줄인다', () => {
    const n = layoutSlotText({ slot: name, viewWidth: 1582, placeholderWidth: 627.3, contentWidth: 562.2 })!
    expect(n.anchorX).toBe(791)
    expect(n.shrunk).toBe(false)
    const nBig = layoutSlotText({ slot: name, viewWidth: 1582, placeholderWidth: 627.3, contentWidth: 700 })!
    expect(nBig.shrunk).toBe(true)
    expect(nBig.fontSizePx).toBeCloseTo((101.84 * 663.4) / 700, 2)
    const v = layoutSlotText({ slot: value, viewWidth: 1582, placeholderWidth: 210.6, contentWidth: 335 })!
    expect(v.anchorX).toBe(791)
    expect(v.shrunk).toBe(false)
    const vBig = layoutSlotText({ slot: value, viewWidth: 1582, placeholderWidth: 210.6, contentWidth: 420 })!
    expect(vBig.shrunk).toBe(true)
    expect(vBig.fontSizePx).toBeCloseTo((92.01 * 376.2) / 420, 2)
  })
})
