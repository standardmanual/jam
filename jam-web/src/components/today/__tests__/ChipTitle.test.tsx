/**
 * 제목 속 칩(`ChipTitle`) 렌더 테스트 (티켓 20261120_2144)
 *
 * 실행: cd jam-web && npx vitest run src/components/today/__tests__/ChipTitle.test.tsx
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from '@/lib/testing/renderStable'
import ChipTitle from '../ChipTitle'
import { feedColorVar } from '@/lib/today/feedConstants'

/** 태그를 걷어 낸 글자(HTML 이스케이프를 되돌린다). 보조 기술이 읽는 글자와 같다. */
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")

const chipCount = (html: string) => (html.match(/rounded-full/g) ?? []).length

describe('ChipTitle — 칩 있음', () => {
  it('낱말 1개: 칩 1개를 그리고 글자는 제목 원문과 같다', () => {
    const html = renderToStaticMarkup(<ChipTitle title="이번 주말 문경에서 달려요" words={['문경']} />)
    expect(chipCount(html)).toBe(1)
    expect(textOf(html)).toBe('이번 주말 문경에서 달려요')
  })

  it('낱말 2개: 칩 2개를 그린다', () => {
    const html = renderToStaticMarkup(<ChipTitle title="문경 달리기 완주" words={['문경', '완주']} />)
    expect(chipCount(html)).toBe(2)
    expect(textOf(html)).toBe('문경 달리기 완주')
  })

  it('낱말이 3개 들어와도 칩은 2개까지다', () => {
    const html = renderToStaticMarkup(<ChipTitle title="가 나 다" words={['가', '나', '다']} />)
    expect(chipCount(html)).toBe(2)
  })

  it('칩 색은 낱말마다 받고(색 키 → var) 없으면 기본 색을 쓴다', () => {
    const html = renderToStaticMarkup(
      <ChipTitle title="문경 달리기 완주" words={['문경', '완주']} colors={['blue']} defaultColor="ref-pink" />,
    )
    expect(html).toContain(`background-color:${feedColorVar('blue')}`)
    expect(html).toContain(`background-color:${feedColorVar('ref-pink')}`)
  })

  it('칩 크기를 고른다: 큰 칩 40px·작은 칩 32px', () => {
    expect(renderToStaticMarkup(<ChipTitle title="문경" words={['문경']} size="lg" />)).toContain('height:40px')
    expect(renderToStaticMarkup(<ChipTitle title="문경" words={['문경']} size="sm" />)).toContain('height:32px')
  })

  it('기울기는 받은 값을 쓰고 없으면 기본값을 쓴다', () => {
    expect(renderToStaticMarkup(<ChipTitle title="문경" words={['문경']} tilts={[8]} />)).toContain('rotate(8deg)')
    expect(renderToStaticMarkup(<ChipTitle title="문경" words={['문경']} />)).toContain('rotate(-4deg)')
  })

  it('칩이 줄 안에 가운데 맞춤으로 놓인다(줄 높이를 칩 높이가 민다)', () => {
    expect(renderToStaticMarkup(<ChipTitle title="문경" words={['문경']} />)).toContain('align-middle')
  })
})

describe('ChipTitle — 칩 없음', () => {
  it('목록이 비면 글자만 그린다', () => {
    const html = renderToStaticMarkup(<ChipTitle title="주말 달리기" words={[]} />)
    expect(chipCount(html)).toBe(0)
    expect(textOf(html)).toBe('주말 달리기')
  })

  it('낱말이 제목에 없으면 무시하고 글자만 그린다', () => {
    const html = renderToStaticMarkup(<ChipTitle title="주말 달리기" words={['문경']} />)
    expect(chipCount(html)).toBe(0)
    expect(textOf(html)).toBe('주말 달리기')
  })
})

describe('ChipTitle — 태그·클래스', () => {
  it('기본 태그는 p이고 as로 바꾼다', () => {
    expect(renderToStaticMarkup(<ChipTitle title="제목" words={[]} />)).toMatch(/^<p /)
    expect(renderToStaticMarkup(<ChipTitle title="제목" words={[]} as="h3" />)).toMatch(/^<h3 /)
  })

  it('한국어 줄바꿈 클래스와 className을 가진다', () => {
    const html = renderToStaticMarkup(<ChipTitle title="제목" words={[]} className="text-2xl" />)
    expect(html).toContain('break-keep')
    expect(html).toContain('wrap-break-word')
    expect(html).toContain('text-2xl')
  })

  it('제목 글자의 HTML 특수문자는 이스케이프된다', () => {
    const html = renderToStaticMarkup(<ChipTitle title="A & B <달리기>" words={['달리기']} />)
    expect(textOf(html)).toBe('A & B <달리기>')
  })
})

describe('ChipTitle — 소스', () => {
  const source = readFileSync(path.resolve(process.cwd(), 'src/components/today/ChipTitle.tsx'), 'utf8')

  it('hex 리터럴과 Math.random이 없다', () => {
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(source).not.toContain('Math.random')
  })
})
