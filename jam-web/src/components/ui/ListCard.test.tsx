/**
 * ListCard — 큰 이미지 위에 제목을 얹는 목록 카드 (티켓 20261114_1543)
 *
 * 저장소에 jsdom이 없어 서버 렌더(`renderToStaticMarkup`)로 고정한다.
 * 실행: cd jam-web && npx vitest run src/components/ui/ListCard.test.tsx
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ListCard } from './ListCard'

const withoutStyle = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, '')
const render = (node: React.ReactElement) => withoutStyle(renderToStaticMarkup(node))
const titleSpan = (html: string, title: string) => html.slice(html.lastIndexOf('<span', html.indexOf(`>${title}<`)), html.indexOf(`>${title}<`))

describe('ListCard', () => {
  it('href가 있으면 카드 전체가 하나의 링크이고 안은 div·h3 없이 span뿐이다', () => {
    const html = render(<ListCard href="/x" imageUrl="https://e.com/a.png" title="제목" chips={<span>칩</span>} value="값" description="설명" footer={<span>푸터</span>} />)
    const hit = html.slice(html.indexOf('<a '))

    expect(hit).toContain('href="/x"')
    expect(hit).not.toMatch(/<(div|h\d|p)\b/)
    expect(html.match(/<a /g)?.length).toBe(1)
  })

  it('onClick만 있으면 button이고 aria-disabled가 전달된다(disabled 속성 없음)', () => {
    const html = render(<ListCard onClick={() => {}} aria-disabled="true" title="잠금" />)

    expect(html).toMatch(/<button type="button"[^>]*aria-disabled="true"/)
    expect(html).not.toMatch(/<button[^>]*\sdisabled/)
  })

  it('이미지는 alt 기본값이 빈 값이고 cover·가운데 위치, 비율 16:9다', () => {
    const html = render(<ListCard imageUrl="https://e.com/a.png" title="제목" />)

    expect(html).toContain('alt=""')
    expect(html).toContain('object-fit:cover')
    expect(html).toContain('object-position:50% 50%')
    expect(html).toContain('aspect-ratio:16 / 9')
  })

  it('제목은 이미지 위 왼쪽 아래 --snow 20px 굵게이고 막·그림자가 없다', () => {
    const html = render(<ListCard imageUrl="https://e.com/a.png" title="제목" />)
    const title = titleSpan(html, '제목')

    expect(title).toContain('bottom:0')
    expect(title).toContain('color:var(--snow)')
    expect(title).toContain('font-size:var(--text-xl)')
    expect(title).toContain('-webkit-line-clamp:2')
    expect(html).not.toMatch(/gradient|text-shadow|backdrop|box-shadow/)
  })

  it('이미지가 없으면 자리표시 면 위 제목이 --foreground로 바뀐다', () => {
    const html = render(<ListCard title="제목" />)

    expect(html).not.toContain('<img')
    expect(html).toContain('background:var(--background-secondary)')
    expect(titleSpan(html, '제목')).toContain('color:var(--foreground)')
  })

  it('imageDim·grayscale은 이미지에만 걸리고 제목은 --foreground, 오버레이는 가운데에 얹힌다', () => {
    const html = render(<ListCard imageUrl="https://e.com/a.png" imageDim={0.4} grayscale imageOverlay={<span>자물쇠</span>} title="제목" />)
    const img = html.slice(html.indexOf('<img'), html.indexOf('/>', html.indexOf('<img')))

    expect(img).toContain('filter:grayscale(1)')
    expect(img).toContain('opacity:0.4')
    expect(titleSpan(html, '제목')).not.toContain('opacity')
    expect(titleSpan(html, '제목')).toContain('color:var(--foreground)')
    expect(html).toContain('align-items:center;justify-content:center')
    expect(html).toContain('>자물쇠<')
  })

  it('값은 칩 줄 오른쪽에서 줄어들지 않고 위쪽에 붙는다', () => {
    const html = render(<ListCard title="제목" chips={<span>칩</span>} value="20 포인트" />)
    const value = html.slice(html.lastIndexOf('<span', html.indexOf('>20 포인트<')), html.indexOf('>20 포인트<'))

    expect(value).toContain('flex-shrink:0')
    expect(value).toContain('align-self:flex-start')
    expect(value).toContain('margin-left:auto')
  })

  it('칩 줄은 wrap이고 칩·값이 모두 없으면 칩 줄이 없다', () => {
    expect(render(<ListCard title="제목" chips={<span>칩</span>} />)).toContain('flex-wrap:wrap')
    expect(render(<ListCard title="제목" />)).not.toContain('flex-wrap')
  })

  it('설명은 2줄 말줄임 --muted이고 footer는 설명 아래에 온다', () => {
    const html = render(<ListCard title="제목" description="설명" footer={<span>푸터</span>} />)
    const description = html.slice(html.lastIndexOf('<span', html.indexOf('>설명<')), html.indexOf('>설명<'))

    expect(description).toContain('-webkit-line-clamp:2')
    expect(description).toContain('color:var(--muted)')
    expect(html.indexOf('>설명<')).toBeLessThan(html.indexOf('>푸터<'))
  })

  it('disabled면 불투명도가 낮아지고 링크가 아니라 aria-disabled 앵커다', () => {
    const html = render(<ListCard href="/x" disabled title="제목" />)

    expect(html).toContain('opacity:var(--opacity-disabled)')
    expect(html).toContain('aria-disabled="true"')
    expect(html).not.toContain('href=')
  })

  it('«MISSION» 같은 글자를 코드로 그리지 않는다', () => {
    expect(render(<ListCard imageUrl="https://e.com/a.png" title="제목" />)).not.toContain('MISSION')
  })
})
