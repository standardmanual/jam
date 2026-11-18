/**
 * arcText: 원을 따라 글자 놓기 (티켓 20261116_1435)
 * 실행: cd jam-web && npx vitest run src/lib/admin/activityBadgeTemplate
 */
import { describe, it, expect } from 'vitest'
import { layoutArcText, type ArcTextInput } from '../arcText'

const base: ArcTextInput = {
  advances: [50, 50], fontSize: 100, letterSpacingEm: 0, cx: 0, cy: 0,
  baselineRadius: 100, centerDeg: 0, facing: 'outward', maxSpanDeg: 180,
}

describe('layoutArcText', () => {
  it('outward 두 글자', () => {
    const r = layoutArcText(base)!
    expect(r.shrunk).toBe(false)
    expect(r.glyphs[0].rotationDeg).toBeCloseTo(-14.324, 3)
    expect(r.glyphs[0].x).toBeCloseTo(-24.74, 2)
    expect(r.glyphs[0].y).toBeCloseTo(-96.891, 2)
    expect(r.glyphs[1].rotationDeg).toBeCloseTo(14.324, 3)
    expect(r.glyphs[1].x).toBeCloseTo(24.74, 2)
    expect(r.glyphs[1].y).toBeCloseTo(-96.891, 2)
  })
  it('inward 두 글자는 첫 글자가 왼쪽', () => {
    const r = layoutArcText({ ...base, centerDeg: 180, facing: 'inward' })!
    expect(r.glyphs[0].x).toBeCloseTo(-24.74, 2)
    expect(r.glyphs[0].y).toBeCloseTo(96.891, 2)
    expect(r.glyphs[0].rotationDeg).toBeCloseTo(14.324, 3)
    expect(r.glyphs[1].x).toBeCloseTo(24.74, 2)
    expect(r.glyphs[1].y).toBeCloseTo(96.891, 2)
    expect(r.glyphs[1].rotationDeg).toBeCloseTo(-14.324, 3)
  })
  it('한 글자', () => {
    const o = layoutArcText({ ...base, advances: [50] })!.glyphs[0]
    expect(o.x).toBeCloseTo(0)
    expect(o.y).toBeCloseTo(-100)
    expect(o.rotationDeg).toBeCloseTo(0)
    const i = layoutArcText({ ...base, advances: [50], centerDeg: 180, facing: 'inward' })!.glyphs[0]
    expect(i.x).toBeCloseTo(0)
    expect(i.y).toBeCloseTo(100)
    expect(i.rotationDeg).toBeCloseTo(0)
  })
  it('자간은 글자 사이에만 들어간다', () => {
    const r = layoutArcText({ ...base, letterSpacingEm: 0.1 })!
    expect(r.spanDeg).toBeCloseTo(63.025, 3)
  })
  it('넘으면 줄인다', () => {
    const r = layoutArcText({ ...base, maxSpanDeg: 28.648 })!
    expect(r.shrunk).toBe(true)
    expect(r.scale).toBeCloseTo(0.5, 3)
    expect(r.fontSize).toBeCloseTo(50, 2)
    expect(r.spanDeg).toBeCloseTo(28.648, 3)
    expect(r.glyphs[0].rotationDeg).toBeCloseTo(-7.162, 3)
    expect(r.glyphs[1].rotationDeg).toBeCloseTo(7.162, 3)
  })
  it('pathRadius는 글자 사이 각도만 바꾸고 위치는 baselineRadius로 정한다', () => {
    const r = layoutArcText({ ...base, pathRadius: 200 })!
    expect(r.spanDeg).toBeCloseTo(28.648, 3)
    expect(r.glyphs[0].rotationDeg).toBeCloseTo(-7.162, 3)
    expect(r.glyphs[0].x).toBeCloseTo(-12.467, 3)
    expect(r.glyphs[0].y).toBeCloseTo(-99.22, 2)
    expect(r.glyphs[1].x).toBeCloseTo(12.467, 3)
    expect(r.glyphs[1].y).toBeCloseTo(-99.22, 2)
  })
  it('pathRadius가 baselineRadius와 같거나 없으면 결과가 같다', () => {
    expect(layoutArcText({ ...base, pathRadius: 100 })).toEqual(layoutArcText(base))
  })
  it('pathRadius와 inward·centerDeg 180', () => {
    const r = layoutArcText({ ...base, pathRadius: 200, centerDeg: 180, facing: 'inward' })!
    expect(r.glyphs[0].x).toBeCloseTo(-12.467, 3)
    expect(r.glyphs[0].y).toBeCloseTo(99.22, 2)
    expect(r.glyphs[0].rotationDeg).toBeCloseTo(7.162, 3)
  })
  it('pathRadius로 잰 각도가 한도를 넘으면 줄인다', () => {
    const r = layoutArcText({ ...base, pathRadius: 200, maxSpanDeg: 14.324 })!
    expect(r.shrunk).toBe(true)
    expect(r.scale).toBeCloseTo(0.5, 3)
    expect(r.fontSize).toBeCloseTo(50, 2)
  })
  it('빈 글자와 잘못된 입력', () => {
    expect(layoutArcText({ ...base, pathRadius: 0 })).toBeNull()
    expect(layoutArcText({ ...base, pathRadius: NaN })).toBeNull()
    expect(layoutArcText({ ...base, advances: [] })!.glyphs).toEqual([])
    expect(layoutArcText({ ...base, baselineRadius: 0 })).toBeNull()
    expect(layoutArcText({ ...base, fontSize: NaN })).toBeNull()
    expect(layoutArcText({ ...base, maxSpanDeg: -1 })).toBeNull()
  })
})
