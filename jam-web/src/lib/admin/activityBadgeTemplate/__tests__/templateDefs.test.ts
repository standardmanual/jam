/**
 * 코드로 정의한 템플릿 (티켓 20261116_1435, 20261116_1634)
 * 실행: cd jam-web && npx vitest run src/lib/admin/activityBadgeTemplate
 */
import { describe, it, expect } from 'vitest'
import { BADGE_TEMPLATE_DEFS, getBadgeTemplateDef } from '../templates'
import { STREAK_TEMPLATE, nameSampleTextLayers } from '../templates/streak'
import { STREAK_ORIGINAL_SVG } from '../templates/streakSvg'
import { COUNT_TEMPLATE } from '../templates/count'
import { isArcSlot } from '../templateDef'
import { stripSlotText, resolveTemplateFont, layoutSlotText } from '../composeTemplate'
import { extractSvgColors, applyColorMap } from '../templateColors'
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
  it('등록 안 된 분류는 null', () => {
    expect(getBadgeTemplateDef('days')).toBeNull()
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
