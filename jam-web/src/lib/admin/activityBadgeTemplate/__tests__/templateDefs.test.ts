/**
 * 코드로 정의한 템플릿 (티켓 20261116_1435)
 * 실행: cd jam-web && npx vitest run src/lib/admin/activityBadgeTemplate
 */
import { describe, it, expect } from 'vitest'
import { BADGE_TEMPLATE_DEFS, getBadgeTemplateDef } from '../templates'
import { isArcSlot } from '../templateDef'
import { stripSlotText, resolveTemplateFont } from '../composeTemplate'
import { extractSvgColors } from '../templateColors'

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
  it('등록 안 된 분류는 null', () => {
    for (const k of ['days', 'streak', 'count'] as const) expect(getBadgeTemplateDef(k)).toBeNull()
  })
})

describe('등록된 모든 정의', () => {
  for (const [key, def] of Object.entries(BADGE_TEMPLATE_DEFS)) {
    describe(key, () => {
      it('viewBox가 정의와 같다', () => {
        const m = def!.svg.match(/viewBox="0 0 (\d+) (\d+)"/)!
        expect([Number(m[1]), Number(m[2])]).toEqual([def!.slots.viewBoxWidth, def!.slots.viewBoxHeight])
      })
      it('샘플 글자를 걷어 내도 그림은 남는다', () => {
        const out = stripSlotText(def!.svg)
        expect(out).not.toMatch(/id="(name|value)"/)
        expect(out).toContain('Union')
        expect(out).toContain('Vector')
      })
      it('색 네 가지', () => {
        const colors = extractSvgColors(def!.svg).map((c) => String(c.color).toUpperCase())
        for (const c of ['#000000', '#DD2C0F', '#FC8471', '#FFFFFF']) expect(colors).toContain(c)
      })
      it('글꼴이 대체 없이 굵기 900', () => {
        for (const slot of [def!.slots.name, def!.slots.value]) {
          expect(isArcSlot(slot)).toBe(true)
          if (!isArcSlot(slot)) continue
          const f = resolveTemplateFont(slot)
          expect(f.fallback).toBe(false)
          expect(f.font.weight).toBe(900)
        }
      })
    })
  }
})
