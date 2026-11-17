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
import { isArcSlot } from '../templateDef'
import { layoutArcText } from '../arcText'
import { stripSlotText, resolveTemplateFont, layoutSlotText } from '../composeTemplate'
import { extractSvgColors } from '../templateColors'
import type { TemplateSlot } from '../templateSvg'

describe('getBadgeTemplateDef', () => {
  it('metric은 표의 수치를 가진다', () => {
    const d = getBadgeTemplateDef('metric')!
    expect(d.classKey).toBe('metric')
    expect(d.slots.viewBoxWidth).toBe(922)
    expect(d.slots.viewBoxHeight).toBe(922)
    expect(d.slots.name).toMatchObject({
      kind: 'arc', cx: 461, cy: 461, baselineRadius: 302.56, centerDeg: 0, facing: 'outward',
      maxSpanDeg: 208.5, fontSize: 106.5, letterSpacingEm: -0.11, fontFamily: 'Noto Sans KR', fontWeight: '900', fill: '#FFFFFF',
    })
    expect(d.slots.value).toMatchObject({
      kind: 'arc', cx: 461, cy: 461, baselineRadius: 383.56, centerDeg: 180, facing: 'inward',
      maxSpanDeg: 91, fontSize: 107, letterSpacingEm: 0.06, fontFamily: 'Noto Sans KR', fontWeight: '900', fill: '#FFFFFF',
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
  it('등록 안 된 분류는 null', () => {
    expect(getBadgeTemplateDef('count')).toBeNull()
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
  it('샘플 글자를 걷어 내도 그림은 남는다', () => {
    const out = stripSlotText(def.svg)
    expect(out).toContain('Union')
    expect(out).toContain('Vector')
  })
  it('색 네 가지', () => {
    const colors = extractSvgColors(def.svg).map((c) => String(c.color).toUpperCase())
    for (const c of ['#000000', '#DD2C0F', '#FC8471', '#FFFFFF']) expect(colors).toContain(c)
  })
  it('두 자리 모두 원호 자리', () => {
    expect(isArcSlot(def.slots.name)).toBe(true)
    expect(isArcSlot(def.slots.value)).toBe(true)
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
