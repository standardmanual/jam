/**
 * templateParams: 조정값의 꼴·정리·자리 정보 얹기 (티켓 20261116_0632)
 * 실행: cd jam-web && npx vitest run src/lib/admin/activityBadgeTemplate
 */
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TEMPLATE_BADGE_PARAMS,
  parseTemplateBadgeParams,
  isDefaultTemplateBadgeParams,
  resolveSlotColor,
  styleSlot,
} from '../templateParams'
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

describe('resolveSlotColor', () => {
  const none = { hueShift: 0, saturation: 0, lightness: 0, overrides: {} }

  it('따로 고른 색이 있으면 템플릿 색 조정과 상관없이 그 색이다', () => {
    expect(resolveSlotColor('#FF0000', '#0000ff', { ...none, hueShift: 120 })).toBe('#0000FF')
  })

  it('고른 색이 없으면 템플릿의 글자 색에 색상 조정을 얹는다', () => {
    expect(resolveSlotColor('#FF0000', null, { ...none, hueShift: 120 })).toBe('#00FF00')
    expect(resolveSlotColor('#ff0000', null, none)).toBe('#FF0000')
  })

  it('템플릿 색 칸을 바꾸면 같은 색의 글자도 따라 바뀐다', () => {
    expect(resolveSlotColor('#123B2E', null, { ...none, overrides: { '#123B2E': '#FF0000' } })).toBe('#FF0000')
  })

  it('템플릿의 글자 색을 읽지 못하면 null이다', () => {
    expect(resolveSlotColor(null, null, none)).toBeNull()
    expect(resolveSlotColor('url(#paint0)', null, none)).toBeNull()
  })
})
