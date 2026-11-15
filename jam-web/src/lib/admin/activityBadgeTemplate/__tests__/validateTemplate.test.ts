/**
 * validateTemplateSvg 시험 (티켓 20261116_0426)
 * 실행: cd jam-web && npx vitest run src/lib/admin/activityBadgeTemplate
 */
import { describe, it, expect } from 'vitest'
import { validateTemplateSvg } from '../validateTemplate'

const text = (id: string) => `<text id="${id}" font-size="48"><tspan x="1" y="2">가</tspan></text>`
const wrap = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${inner}</svg>`

describe('validateTemplateSvg', () => {
  it('정상 SVG는 ok와 svg·removed·slots를 돌려준다', () => {
    const r = validateTemplateSvg(wrap(text('name') + text('value')))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.removed).toEqual([])
      expect(r.slots.viewBoxWidth).toBe(100)
      expect(r.svg).toContain('id="name"')
    }
  })

  it('문자열이 아니거나 비면 비어 있음 문구', () => {
    const msg = 'SVG 내용이 비어 있어요. 피그마에서 내보낸 SVG를 올려 주세요.'
    expect(validateTemplateSvg(undefined)).toEqual({ ok: false, error: msg })
    expect(validateTemplateSvg('  ')).toEqual({ ok: false, error: msg })
  })

  it('1MB를 넘으면 너무 큼 문구', () => {
    const r = validateTemplateSvg('a'.repeat(1_000_001))
    expect(r).toEqual({ ok: false, error: 'SVG가 너무 커요. 1MB 이하로 줄여서 다시 올려 주세요.' })
  })

  it('읽지 못하면 읽기 실패 문구(예외 없음)', () => {
    expect(validateTemplateSvg('<svg><g></svg>')).toEqual({
      ok: false,
      error: 'SVG를 읽지 못했어요. 피그마에서 SVG로 다시 내보내 주세요.',
    })
  })

  it('자리가 없으면 레이어 이름·id 안내 문구', () => {
    const r = validateTemplateSvg(wrap(text('value')))
    expect(r).toEqual({
      ok: false,
      error:
        '이름 자리를 찾지 못했어요. 피그마에서 이름 글자의 레이어 이름을 name으로 바꾸고, 내보내기 설정의 Include "id" attribute를 켠 뒤 다시 내보내 주세요.',
    })
  })

  it('글자가 아니면 Outline text 안내 문구', () => {
    const r = validateTemplateSvg(wrap(text('name') + '<path id="value" d="M0 0"/>'))
    expect(r).toEqual({
      ok: false,
      error: '값 자리가 글자가 아니에요. 피그마 내보내기 설정의 Outline text를 끄고 다시 내보내 주세요.',
    })
  })
})
