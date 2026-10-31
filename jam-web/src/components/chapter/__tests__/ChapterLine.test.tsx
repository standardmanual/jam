/**
 * 프로필의 챕터 줄 (티켓 20261019_1317 1회, 채원 사전 판정 A·B)
 *
 * 고정하는 것
 *  - 내 줄(티켓 20261031_1806): 작은 글씨 «챕터 3» 한 줄뿐이다. 막대·«다음 챕터까지»·점수 숫자가 없다.
 *  - 다른 유저 줄: «트라이브 · 챕터 3», 게이지 없음, 없는 조각은 빼고 모두 없으면 아무것도 그리지 않는다.
 *  - 챕터는 숫자로만 표기한다(2026-10-21 결정): 어느 모양에도 챕터 이름 조각이 없다.
 *  - 점수 숫자는 어느 모양에도 그려지지 않는다. 긴 글이 넘치지 않도록 줄이는(truncate) 클래스가 붙는다.
 *
 * 실행: cd jam-web && npx vitest run src/components/chapter/__tests__/ChapterLine.test.tsx
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ChapterLine, { publicChapterText } from '../ChapterLine'

/** 태그를 걷어낸 화면 글 */
function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}

describe('내 챕터 줄', () => {
  const mine = { chapterNo: 3 }

  it('작은 글씨 «챕터 3» 한 줄만 그린다 — 막대와 «다음 챕터까지»가 없다', () => {
    const html = renderToStaticMarkup(<ChapterLine variant="mine" chapter={mine} />)
    expect(textOf(html)).toBe('챕터 3')
    expect(html).toContain('data-chapter-line="mine"')
    expect(html).not.toContain('챕터 3 ·')
    expect(html).not.toContain('data-chapter-gauge')
    expect(html).not.toContain('width:')
    expect(html).not.toContain('다음 챕터까지')
  })

  it('점수 숫자를 그리지 않는다 — 보이는 글은 챕터 번호 말고 숫자가 없다', () => {
    const html = renderToStaticMarkup(<ChapterLine variant="mine" chapter={mine} />)
    expect(textOf(html).replace('챕터 3', '')).toBe('')
    expect(textOf(html)).not.toContain('%')
    expect(textOf(html)).not.toContain('점')
  })

  it('text-xs text-muted이고 상자·굵기 장식이 없다 — 줄이고(truncate) 한국어 줄바꿈 클래스가 붙는다', () => {
    const html = renderToStaticMarkup(<ChapterLine variant="mine" chapter={mine} />)
    expect(html).toMatch(/class="[^"]*\btext-xs\b[^"]*\btext-muted\b[^"]*"/)
    expect(html).not.toMatch(/\bfont-bold\b/)
    expect(html).toMatch(/class="[^"]*\btruncate\b[^"]*"/)
    expect(html).toMatch(/class="[^"]*\bbreak-keep\b[^"]*\bwrap-break-word\b[^"]*"/)
  })
})

describe('다른 유저 챕터 줄', () => {
  it('«트라이브 · 챕터 3» 한 줄이고 게이지·«다음 챕터까지»가 없다', () => {
    const html = renderToStaticMarkup(<ChapterLine variant="public" chapter={{ tribeName: '새벽러너스', chapterNo: 3 }} />)
    expect(textOf(html)).toBe('새벽러너스 · 챕터 3')
    expect(html).not.toContain('data-chapter-gauge')
    expect(html).not.toContain('다음 챕터까지')
    expect(html).toMatch(/class="[^"]*\btruncate\b[^"]*"/)
    expect(html).toMatch(/class="[^"]*\bbreak-keep\b[^"]*\bwrap-break-word\b[^"]*"/)
  })

  it('없는 조각은 빼고 이어 붙인다', () => {
    // 트라이브 없음: 챕터만
    expect(publicChapterText({ tribeName: null, chapterNo: 3 })).toBe('챕터 3')
    // 퀘스트 전: 트라이브만
    expect(publicChapterText({ tribeName: '새벽러너스', chapterNo: null })).toBe('새벽러너스')
  })

  it('보일 조각이 하나도 없으면 아무것도 그리지 않는다', () => {
    const html = renderToStaticMarkup(<ChapterLine variant="public" chapter={{ tribeName: null, chapterNo: null }} />)
    expect(html).toBe('')
  })

  it('빈 문자열 트라이브는 조각으로 치지 않는다', () => {
    expect(publicChapterText({ tribeName: '', chapterNo: 3 })).toBe('챕터 3')
  })
})
