/**
 * templateParams: 조정값의 꼴·정리·자리 정보 얹기 (티켓 20261116_0632)
 * 실행: cd jam-web && npx vitest run src/lib/admin/activityBadgeTemplate
 */
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TEMPLATE_BADGE_PARAMS,
  parseTemplateBadgeParams,
  isDefaultTemplateBadgeParams,
  isDefaultTemplateColorParams,
  styleSlot,
  styleArcSlot,
} from '../templateParams'
import type { TemplateArcSlot } from '../templateDef'
import type { TemplateSlot } from '../templateSvg'

const slot: TemplateSlot = {
  found: true,
  isText: true,
  x: 10,
  y: 20,
  fontFamily: 'Pretendard',
  fontSize: 48,
  fontWeight: 'bold',
  fill: '#123B2E',
  letterSpacing: '0em',
  textAnchor: null,
  transform: null,
  placeholder: '배지',
}

describe('parseTemplateBadgeParams', () => {
  it('kind나 v가 다르면 null', () => {
    expect(parseTemplateBadgeParams(null)).toBeNull()
    expect(parseTemplateBadgeParams({ kind: 'other', v: 1 })).toBeNull()
    expect(parseTemplateBadgeParams({ kind: 'activity-template', v: 2 })).toBeNull()
    expect(parseTemplateBadgeParams({ style_id: 'x' })).toBeNull()
  })
  it('기본값을 넣으면 같은 값이 나오고 기본값으로 판정된다', () => {
    const p = parseTemplateBadgeParams(DEFAULT_TEMPLATE_BADGE_PARAMS)
    expect(p).toEqual(DEFAULT_TEMPLATE_BADGE_PARAMS)
    expect(isDefaultTemplateBadgeParams(p!)).toBe(true)
  })
  it('빠진 칸은 기본값으로 채운다', () => {
    const p = parseTemplateBadgeParams({ kind: 'activity-template', v: 1 })
    expect(p).toEqual(DEFAULT_TEMPLATE_BADGE_PARAMS)
  })
  it('범위를 넘는 수는 자르고 정수로 맞춘다', () => {
    const p = parseTemplateBadgeParams({
      kind: 'activity-template',
      v: 1,
      color: { hueShift: 500, saturation: -999, lightness: 10.6 },
      text: { name: { sizeScalePct: 10 }, value: { sizeScalePct: 999 } },
    })!
    expect(p.color).toMatchObject({ hueShift: 180, saturation: -100, lightness: 11 })
    expect(p.text.name.sizeScalePct).toBe(50)
    expect(p.text.value.sizeScalePct).toBe(200)
    expect(isDefaultTemplateBadgeParams(p)).toBe(false)
  })
  it('읽지 못하는 색의 overrides 항목은 빠지고 색은 대문자로 남는다', () => {
    const p = parseTemplateBadgeParams({
      kind: 'activity-template',
      v: 1,
      color: { overrides: { '#abc': '#def', '#123456': 'none', foo: '#000000' } },
    })!
    expect(p.color.overrides).toEqual({ '#AABBCC': '#DDEEFF' })
  })
  it('글자 칸을 정리한다', () => {
    const p = parseTemplateBadgeParams({
      kind: 'activity-template',
      v: 1,
      text: {
        name: { color: 'white', fontFamily: '  Noto Sans KR ', fontWeight: 700 },
        value: { color: 'nope', fontFamily: '   ', fontWeight: 650 },
      },
    })!
    expect(p.text.name).toEqual({ color: '#FFFFFF', fontFamily: 'Noto Sans KR', fontWeight: 700, sizeScalePct: 100 })
    expect(p.text.value).toEqual({ color: null, fontFamily: null, fontWeight: null, sizeScalePct: 100 })
  })
})

describe('styleSlot', () => {
  it('sizeScalePct 150이면 fontSize가 1.5배', () => {
    expect(styleSlot(slot, { color: null, fontFamily: null, fontWeight: null, sizeScalePct: 150 }).fontSize).toBe(72)
  })
  it('null이면 템플릿의 값 그대로', () => {
    expect(styleSlot(slot, { color: null, fontFamily: null, fontWeight: null, sizeScalePct: 100 })).toEqual(slot)
  })
  it('지정한 색·글꼴·굵기를 얹는다', () => {
    const s = styleSlot(slot, { color: '#FFFFFF', fontFamily: 'Noto Sans KR', fontWeight: 500, sizeScalePct: 100 })
    expect(s).toMatchObject({ fill: '#FFFFFF', fontFamily: 'Noto Sans KR', fontWeight: '500', x: 10 })
  })
  it('fontSize가 없으면 null', () => {
    expect(styleSlot({ ...slot, fontSize: null }, { color: null, fontFamily: null, fontWeight: null, sizeScalePct: 150 }).fontSize).toBeNull()
  })
})

describe('styleArcSlot', () => {
  const arc: TemplateArcSlot = {
    kind: 'arc', cx: 1, cy: 2, baselineRadius: 300, centerDeg: 0, facing: 'outward', maxSpanDeg: 200,
    fontFamily: 'Noto Sans KR', fontWeight: '900', fontSize: 100, letterSpacingEm: 0.1, fill: '#FFFFFF',
  }
  it('기본값이면 그대로', () => {
    expect(styleArcSlot(arc, { color: null, fontFamily: null, fontWeight: null, sizeScalePct: 100 })).toEqual(arc)
  })
  it('색·글꼴·굵기·크기를 반영한다', () => {
    const s = styleArcSlot(arc, { color: '#000000', fontFamily: 'Pretendard', fontWeight: 500, sizeScalePct: 120 })
    expect(s).toMatchObject({ fill: '#000000', fontFamily: 'Pretendard', fontWeight: '500', fontSize: 120, baselineRadius: 300 })
  })
})

describe('isDefaultTemplateColorParams', () => {
  const base = { hueShift: 0, saturation: 0, lightness: 0, overrides: {} }
  it('세 값이 0이고 덮어쓴 색이 없을 때만 참', () => {
    expect(isDefaultTemplateColorParams(base)).toBe(true)
    expect(isDefaultTemplateColorParams({ ...base, hueShift: 1 })).toBe(false)
    expect(isDefaultTemplateColorParams({ ...base, saturation: -1 })).toBe(false)
    expect(isDefaultTemplateColorParams({ ...base, lightness: 5 })).toBe(false)
    expect(isDefaultTemplateColorParams({ ...base, overrides: { '#ffffff': '#000000' } })).toBe(false)
  })
})
