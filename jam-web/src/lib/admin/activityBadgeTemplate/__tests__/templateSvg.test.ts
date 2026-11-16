/**
 * templateSvg: SVG 읽기와 요소 찾기 (티켓 20261116_0234, 정리 20261116_1513)
 * 실행: cd jam-web && npx vitest run src/lib/admin/activityBadgeTemplate
 */
import { describe, it, expect } from 'vitest'
import { findById, findFirst, parseSvg, TemplateSvgError } from '../templateSvg'

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g id="name"><text x="1" y="2">A</text></g></svg>`

describe('templateSvg', () => {
  it('id와 이름으로 요소를 찾는다', () => {
    const root = parseSvg(svg)
    const g = findById(root, 'name')
    expect(g).not.toBeNull()
    expect(findFirst(g!, 'text')?.getAttribute('x')).toBe('1')
    expect(findById(root, 'value')).toBeNull()
  })

  it('읽지 못하는 SVG는 오류를 던진다', () => {
    expect(() => parseSvg('<div/>')).toThrowError(TemplateSvgError)
    expect(() => parseSvg('<svg')).toThrowError(TemplateSvgError)
  })
})
