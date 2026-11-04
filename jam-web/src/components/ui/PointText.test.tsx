import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PointText } from '@ds/components/patterns/PointText'

// 티켓 20261104_2319 — 포인트 값+단위는 PointText 한 곳에서 --point-text로 칠한다.
describe('PointText', () => {
  it('inline은 «값 포인트» 한 덩어리를 줄바꿈 없이 --point-text로 그린다', () => {
    const html = renderToStaticMarkup(<PointText value={1200} />)
    expect(html).toContain('>1,200 포인트<')
    expect(html).toContain('white-space:nowrap')
    expect(html).toContain('color:var(--point-text)')
    expect(html).toContain('text-point-text')
  })

  it('stacked는 숫자와 단위를 두 줄로 쌓고 둘 다 같은 색이다', () => {
    const html = renderToStaticMarkup(<PointText value={40} layout="stacked" />)
    expect(html).toContain('flex-direction:column')
    expect(html.match(/color:var\(--point-text\)/g)).toHaveLength(2)
    expect(html).toContain('>40<')
    expect(html).toContain('>포인트<')
  })

  it('0은 그리고, null·undefined는 아무것도 그리지 않는다', () => {
    expect(renderToStaticMarkup(<PointText value={0} />)).toContain('>0 포인트<')
    expect(renderToStaticMarkup(<PointText value={null} />)).toBe('')
    expect(renderToStaticMarkup(<PointText value={undefined} layout="stacked" />)).toBe('')
  })

  it('포맷된 문자열(부호 포함)은 그대로 쓰고 단위를 바꿀 수 있다', () => {
    expect(renderToStaticMarkup(<PointText value="-300" />)).toContain('>-300 포인트<')
    expect(renderToStaticMarkup(<PointText value={5} unit="P" />)).toContain('>5 P<')
  })

  it('unit=""이면 값만 그리고 값 뒤 공백도 붙이지 않는다 (inline·stacked 모두)', () => {
    const inline = renderToStaticMarkup(<PointText value={1200} unit="" />)
    expect(inline).toContain('>1,200<')
    expect(inline).not.toContain('포인트')
    expect(inline).toContain('color:var(--point-text)')
    const stacked = renderToStaticMarkup(<PointText value={40} unit="" layout="stacked" />)
    expect(stacked).toContain('>40<')
    expect(stacked).not.toContain('포인트')
    expect(stacked.match(/color:var\(--point-text\)/g)).toHaveLength(1)
    expect(renderToStaticMarkup(<PointText value={0} unit="" />)).toContain('>0<')
    expect(renderToStaticMarkup(<PointText value={null} unit="" />)).toBe('')
  })
})
