/**
 * composeTemplate: 예시 글자 제거와 글자 위치·크기 계산 (티켓 20261116_0535)
 * 실행: cd jam-web && npx vitest run src/lib/admin/activityBadgeTemplate
 */
import { describe, it, expect } from 'vitest'
import {
  stripSlotText,
  parseFontWeight,
  parseLetterSpacingEm,
  resolveTemplateFont,
  layoutSlotText,
  toTextLayerInput,
  layoutTemplateContent,
  TEMPLATE_CONTENT_BOX_RATIO,
} from '../composeTemplate'
import { BOX_PX, CANVAS_PX } from '@/lib/admin/badgeImageGenerator/normalize'

describe('layoutTemplateContent', () => {
  it('이미지 생성 메뉴의 규격과 같은 비율이다', () => {
    expect(TEMPLATE_CONTENT_BOX_RATIO).toBe(BOX_PX / CANVAS_PX)
  })
  it('정사각형 그림을 1024 캔버스 가운데 870에 맞춘다', () => {
    const l = layoutTemplateContent({ viewWidth: 922, viewHeight: 922, longSidePx: 1024 })
    expect(l).toMatchObject({ canvasWidth: 1024, canvasHeight: 1024, drawWidth: 870, drawHeight: 870, offsetX: 77, offsetY: 77 })
    expect(l.scale).toBeCloseTo(0.9436, 4)
  })
  it('긴 변 1280이면 상자가 비례해 커진다', () => {
    const l = layoutTemplateContent({ viewWidth: 922, viewHeight: 922, longSidePx: 1280 })
    expect(l.drawWidth).toBe(1087.5)
    expect(l.offsetX).toBe(96.25)
  })
  it('가로가 긴 그림은 세로를 가운데에 둔다', () => {
    const l = layoutTemplateContent({ viewWidth: 1000, viewHeight: 500, longSidePx: 1024 })
    expect(l).toMatchObject({ drawWidth: 870, drawHeight: 435, offsetX: 77, offsetY: 294.5 })
  })
})
import { TemplateSvgError } from '../templateSvg'
import { SYSTEM_DEFAULT_FONT } from '@/app/admin/asset-generator/assetGeneratorHelpers'

const figmaText = (id: string, x: number, y: number, label: string) =>
  `<text id="${id}" fill="#123B2E" xml:space="preserve" style="white-space: pre" font-family="Pretendard" font-size="48" font-weight="bold" letter-spacing="0em"><tspan x="${x}" y="${y}">${label}</tspan></text>`

const svgOf = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" fill="none"><defs><clipPath id="c"><rect width="10" height="10"/></clipPath></defs><rect width="1024" height="1024" fill="#fff"/>${inner}</svg>`

describe('stripSlotText', () => {
  it('이름·값 text를 지우고 rect·defs는 남긴다', () => {
    const out = stripSlotText(svgOf(figmaText('name', 120, 96, '배지 이름') + figmaText('value', 120, 200, '21.1km')))
    expect(out).not.toContain('배지 이름')
    expect(out).not.toContain('21.1km')
    expect(out).not.toMatch(/id="(name|value)"/)
    expect(out).toContain('<rect')
    expect(out).toContain('<defs>')
  })

  it('g로 감싼 글자도 지운다', () => {
    const out = stripSlotText(svgOf(`<g id="name">${figmaText('x', 1, 2, '감싼 이름')}</g>`))
    expect(out).not.toContain('감싼 이름')
    expect(out).toContain('<g')
  })

  it('자리가 없으면 도형이 그대로다', () => {
    const src = svgOf('<circle r="5"/>')
    const out = stripSlotText(src)
    expect(out).toContain('<circle')
    expect(out).toContain('<rect')
  })

  it('모양(path)과 text 없는 g도 통째로 지운다', () => {
    const out = stripSlotText(svgOf('<path id="name" d="M0 0L5 5"/><g id="value"><path d="M1 1"/></g><circle id="keep" r="5"/>'))
    expect(out).not.toMatch(/id="(name|value)"/)
    expect(out).toContain('id="keep"')
  })

  it('읽지 못하면 TemplateSvgError', () => {
    expect(() => stripSlotText('<svg><')).toThrow(TemplateSvgError)
  })
})

describe('parseFontWeight / parseLetterSpacingEm', () => {
  it('굵기를 변환한다', () => {
    expect(parseFontWeight('bold')).toBe(700)
    expect(parseFontWeight('normal')).toBe(400)
    expect(parseFontWeight('650')).toBe(700)
    expect(parseFontWeight('5000')).toBe(900)
    expect(parseFontWeight('0')).toBe(100)
    expect(parseFontWeight('bolder')).toBe(400)
    expect(parseFontWeight(null)).toBe(400)
  })

  it('자간을 em으로 바꾼다', () => {
    expect(parseLetterSpacingEm('0em', 48)).toBe(0)
    expect(parseLetterSpacingEm('-0.02em', 48)).toBe(-0.02)
    expect(parseLetterSpacingEm('2px', 40)).toBe(0.05)
    expect(parseLetterSpacingEm('2', 40)).toBe(0.05)
    expect(parseLetterSpacingEm('2px', null)).toBe(0)
    expect(parseLetterSpacingEm('2px', 0)).toBe(0)
    expect(parseLetterSpacingEm(null, 48)).toBe(0)
  })
})

describe('resolveTemplateFont', () => {
  it('카탈로그에 있으면 그대로, 없으면 시스템 글꼴', () => {
    const plex = resolveTemplateFont({ fontFamily: 'IBM Plex Sans KR', fontWeight: 'bold' })
    expect(plex).toEqual({ font: { family: 'IBM Plex Sans KR', weight: 700 }, requestedFamily: 'IBM Plex Sans KR', fallback: false })
    const pre = resolveTemplateFont({ fontFamily: 'Pretendard', fontWeight: null })
    expect(pre.fallback).toBe(true)
    expect(pre.font.family).toBe(SYSTEM_DEFAULT_FONT.family)
    expect(pre.requestedFamily).toBe('Pretendard')
  })

  it("첫 항목만 보고 따옴표를 걷는다", () => {
    const r = resolveTemplateFont({ fontFamily: "'inter', sans-serif", fontWeight: null })
    expect(r.font.family).toBe('Inter')
    expect(r.fallback).toBe(false)
  })

  it('fontFamily가 null이면 시스템 글꼴', () => {
    const r = resolveTemplateFont({ fontFamily: null, fontWeight: null })
    expect(r).toEqual({ font: { family: SYSTEM_DEFAULT_FONT.family, weight: 400 }, requestedFamily: null, fallback: true })
  })
})

describe('layoutSlotText', () => {
  const slot = { x: 352, fontSize: 64, textAnchor: null }
  it('왼쪽 시작점에서 가운데를 되찾는다', () => {
    expect(layoutSlotText({ slot, viewWidth: 1024, placeholderWidth: 320, contentWidth: 600 })).toEqual({
      anchorX: 512,
      fontSizePx: 64,
      shrunk: false,
    })
  })

  it('넘치면 줄인다', () => {
    const r = layoutSlotText({ slot, viewWidth: 1024, placeholderWidth: 320, contentWidth: 1200 })!
    expect(r.shrunk).toBe(true)
    expect(r.fontSizePx).toBeCloseTo((64 * 942.08) / 1200, 6)
  })

  it('middle·end 기준', () => {
    expect(layoutSlotText({ slot: { ...slot, textAnchor: 'middle' }, viewWidth: 1024, placeholderWidth: 320, contentWidth: 10 })!.anchorX).toBe(352)
    expect(layoutSlotText({ slot: { ...slot, textAnchor: 'end' }, viewWidth: 1024, placeholderWidth: 320, contentWidth: 10 })!.anchorX).toBe(192)
  })

  it('x나 fontSize가 없으면 null', () => {
    expect(layoutSlotText({ slot: { ...slot, x: null }, viewWidth: 1024, placeholderWidth: 1, contentWidth: 1 })).toBeNull()
    expect(layoutSlotText({ slot: { ...slot, fontSize: null }, viewWidth: 1024, placeholderWidth: 1, contentWidth: 1 })).toBeNull()
  })
})

describe('toTextLayerInput', () => {
  it('식대로 비율을 낸다', () => {
    const r = toTextLayerInput({
      content: '21.1km',
      font: { family: 'Inter', weight: 700 },
      color: null,
      letterSpacingEm: -0.02,
      layout: { anchorX: 512, fontSizePx: 64, shrunk: false },
      baselineY: 300,
      middleOffsetEm: -0.35,
      viewWidth: 1024,
      viewHeight: 1024,
      stageWidth: 512,
      stageHeight: 512,
    })
    expect(r.sizePct).toBeCloseTo(6.25, 6)
    expect(r.xPct).toBeCloseTo(50, 6)
    // (300 - (-0.35 × 64)) / 1024 × 100 = 322.4 / 1024 × 100
    expect(r.yPct).toBeCloseTo(31.484375, 6)
    expect(r).toMatchObject({ align: 'center', lineHeight: 1, rotationDeg: 0, opacityPct: 100, letterSpacing: -0.02, color: '#000000', stageWidth: 512 })
  })
})
