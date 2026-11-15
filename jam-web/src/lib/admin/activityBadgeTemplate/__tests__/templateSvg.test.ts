/**
 * templateSvg: SVG 정화와 이름·값 자리 읽기 (티켓 20261116_0234)
 * 실행: cd jam-web && npx vitest run src/lib/admin/activityBadgeTemplate
 */
import { describe, it, expect } from 'vitest'
import { sanitizeTemplateSvg, readTemplateSlots, TemplateSvgError } from '../templateSvg'

const figmaText = (id: string, x: number, y: number, label: string) =>
  `<text id="${id}" fill="#123B2E" xml:space="preserve" style="white-space: pre" font-family="Pretendard" font-size="48" font-weight="bold" letter-spacing="0em"><tspan x="${x}" y="${y}">${label}</tspan></text>`

const okSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" viewBox="0 0 1024 1024" fill="none"><rect width="1024" height="1024" fill="#fff"/>${figmaText('name', 120, 96, '배지 이름')}${figmaText('value', 120, 200, '100km')}</svg>`

describe('sanitizeTemplateSvg', () => {
  it('script·foreignObject·on* 속성·바깥 href를 걷어 내고 기록한다', () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" onload="x()"><script>alert(1)</script><foreignObject><div/></foreignObject><image href="https://evil.test/a.png"/><use xlink:href="#a"/><image href="data:image/png;base64,AAA"/><rect onclick="y()" fill="#f00"/></svg>`
    const { svg, removed } = sanitizeTemplateSvg(dirty)
    expect(svg).not.toMatch(/script|foreignObject|onload|onclick|evil\.test/i)
    expect(svg).toContain('xlink:href="#a"')
    expect(svg).toContain('data:image/png')
    expect(svg).toContain('fill="#f00"')
    expect(removed.length).toBe(5)
    expect(removed.join(' ')).toContain('script')
  })

  it('iframe·object·embed·link·meta를 걷어 낸다', () => {
    const { svg } = sanitizeTemplateSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><iframe/><object/><embed/><link/><meta/><circle r="1"/></svg>'
    )
    expect(svg).not.toMatch(/iframe|object|embed|<link|<meta/)
    expect(svg).toContain('circle')
  })

  it('style은 @import나 url(이 있을 때만 걷어 낸다', () => {
    const bad = sanitizeTemplateSvg('<svg xmlns="http://www.w3.org/2000/svg"><style>@import "x.css";</style></svg>')
    expect(bad.svg).not.toContain('<style')
    const bad2 = sanitizeTemplateSvg('<svg xmlns="http://www.w3.org/2000/svg"><style>a{fill:url(http://x)}</style></svg>')
    expect(bad2.svg).not.toContain('<style')
    const good = sanitizeTemplateSvg('<svg xmlns="http://www.w3.org/2000/svg"><style>a{fill:red}</style></svg>')
    expect(good.svg).toContain('<style')
    expect(good.removed).toEqual([])
  })

  it('style 속성의 바깥 주소 선언만 걷어 내고 나머지는 남긴다', () => {
    const r = sanitizeTemplateSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(https://a.example/x.png);stroke:#000"/><circle style="fill:url(https://a.example/y)"/></svg>'
    )
    expect(r.svg).toContain('style="stroke:#000"')
    expect(r.svg).not.toContain('a.example')
    expect(r.svg).not.toMatch(/<circle[^>]*style=/)
    expect(r.removed).toEqual(['속성 style의 fill(바깥 주소)', '속성 style의 fill(바깥 주소)'])
  })

  it('그 밖의 속성도 바깥 주소는 지우고 안쪽 참조는 남긴다', () => {
    const r = sanitizeTemplateSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(https://a.example/x)"/><rect fill="url(#paint0_linear)" style="fill:url(\'#a\')" filter="url(#f)"/></svg>'
    )
    expect(r.svg).not.toContain('a.example')
    expect(r.svg).toContain('fill="url(#paint0_linear)"')
    expect(r.svg).toContain("fill:url('#a')")
    expect(r.svg).toContain('filter="url(#f)"')
    expect(r.removed).toEqual(['속성 fill(바깥 주소)'])
  })

  it('정상 SVG는 그대로 두고 removed가 비어 있다', () => {
    const r = sanitizeTemplateSvg(okSvg)
    expect(r.removed).toEqual([])
    expect(r.svg).toContain('id="name"')
  })

  it('뿌리가 svg가 아니면 NOT_SVG, XML이 아니면 INVALID_XML', () => {
    expect(() => sanitizeTemplateSvg('<html/>')).toThrowError(expect.objectContaining({ code: 'NOT_SVG' }))
    expect(() => sanitizeTemplateSvg('<svg><g></svg>')).toThrowError(TemplateSvgError)
    expect(() => sanitizeTemplateSvg('<svg><g></svg>')).toThrowError(expect.objectContaining({ code: 'INVALID_XML' }))
    expect(() => sanitizeTemplateSvg('')).toThrowError(expect.objectContaining({ code: 'INVALID_XML' }))
  })
})

describe('readTemplateSlots', () => {
  it('피그마 모양에서 이름·값 자리를 읽는다', () => {
    const s = readTemplateSlots(okSvg)
    expect(s.viewBoxWidth).toBe(1024)
    expect(s.viewBoxHeight).toBe(1024)
    expect(s.name).toMatchObject({
      found: true,
      isText: true,
      x: 120,
      y: 96,
      fontFamily: 'Pretendard',
      fontSize: 48,
      fontWeight: 'bold',
      fill: '#123B2E',
      letterSpacing: '0em',
      placeholder: '배지 이름',
      textAnchor: null,
      transform: null,
    })
    expect(s.value).toMatchObject({ found: true, isText: true, x: 120, y: 200, placeholder: '100km' })
  })

  it('g로 감싼 글자와 style 안의 속성도 읽는다', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="300"><g id="name"><text x="10" y="20" style="font-size: 30px; fill: #abc">A</text></g></svg>`
    const s = readTemplateSlots(svg)
    expect(s.viewBoxWidth).toBe(500)
    expect(s.viewBoxHeight).toBe(300)
    expect(s.name).toMatchObject({ found: true, isText: true, x: 10, y: 20, fontSize: 30, fill: '#abc' })
    expect(s.value.found).toBe(false)
  })

  it('자리가 없으면 found false, 윤곽선이면 isText false, 크기가 없으면 null', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path id="name" d="M0 0"/></svg>`
    const s = readTemplateSlots(svg)
    expect(s.name).toMatchObject({ found: true, isText: false, x: null, placeholder: null })
    expect(s.value).toMatchObject({ found: false, isText: false })
    expect(s.viewBoxWidth).toBeNull()
    expect(s.viewBoxHeight).toBeNull()
  })

  it('읽지 못하는 SVG는 오류를 던진다', () => {
    expect(() => readTemplateSlots('<div/>')).toThrowError(TemplateSvgError)
  })
})
