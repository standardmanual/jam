/**
 * 챕터 오름 축하 카드 (티켓 20261019_1317 1회, 채원 사전 판정 C)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더로 첫 마크업만 확인한다.
 * 확인하는 것: 열렸을 때 «축하해요!» / «챕터 N에 올랐어요» 두 줄과 닫기 X · 대화상자 접근성 속성 · 점수·게이지 없음 ·
 * 닫혀 있으면 카드가 없고 라이브 리전은 비어 있다 · 열리면 라이브 리전이 오름 문장을 알린다 · 페이드+상승 전환과 모션 축소 클래스.
 *
 * 실행: cd jam-web && npx vitest run src/components/chapter/__tests__/ChapterRiseOverlay.test.tsx
 */
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ChapterRiseOverlay from '../ChapterRiseOverlay'
import { d } from '@/lib/i18n'

function render(over: Partial<Parameters<typeof ChapterRiseOverlay>[0]> = {}): string {
  return renderToStaticMarkup(<ChapterRiseOverlay open chapterNo={3} onClose={vi.fn()} {...over} />)
}

describe('ChapterRiseOverlay', () => {
  it('열리면 «축하해요!» / «챕터 3에 올랐어요» 두 줄을 Card 면에 보인다', () => {
    const html = render()
    expect(html).toContain(d.chapter.rise.cheer)
    expect(html).toContain('챕터 3에 올랐어요')
    expect(html).toContain('data-chapter-rise')
    // Card 안의 글 줄은 둘뿐이다(챕터는 숫자로만 표기한다, 2026-10-21 결정)
    expect(html.match(/<p /g)).toHaveLength(2)
  })

  it('점수·게이지·«다음 챕터까지»가 없다', () => {
    const html = render()
    expect(html).not.toContain('data-chapter-gauge')
    expect(html).not.toContain(d.chapter.line.untilNext)
    expect(html).not.toContain('%')
  })

  it('대화상자 접근성: role=dialog, aria-modal, 이름, 닫기 버튼', () => {
    const html = render()
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain(`aria-label="${d.chapter.rise.ariaLabel}"`)
    expect(html).toContain(`aria-label="${d.common.close}"`)
  })

  it('라이브 리전은 열리면 오름 문장을 알리고 닫혀 있으면 비어 있다', () => {
    expect(render()).toContain('aria-live="polite" aria-atomic="true" class="sr-only">축하해요! 챕터 3에 올랐어요</div>')
    const closed = render({ open: false })
    expect(closed).toContain('aria-live="polite" aria-atomic="true" class="sr-only"></div>')
    expect(closed).not.toContain('role="dialog"')
    expect(closed).not.toContain(d.chapter.rise.cheer)
  })

  it('페이드+16px 상승 전환(--duration-medium)과 모션 축소 시 상승 제거 클래스가 붙는다', () => {
    const html = render()
    expect(html).toContain('duration-[var(--duration-medium)]')
    expect(html).toContain('translate-y-4')
    expect(html).toContain('motion-reduce:translate-y-0')
    expect(html).toContain('motion-reduce:transition-opacity')
  })

  it('한국어 줄바꿈 클래스가 붙는다', () => {
    const html = render()
    expect(html).toMatch(/class="[^"]*\bbreak-keep\b[^"]*\bwrap-break-word\b[^"]*"/)
  })
})
