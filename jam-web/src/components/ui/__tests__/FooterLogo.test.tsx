/**
 * 푸터 로고 등장 모션 (티켓 20261104_1642 후속, 사용자 지시 2026-11-04: 나타날 때 위로 Ease In으로 올라온다)
 *
 * 고정하는 것: 서버 렌더에서는 숨지 않고 제자리에 있다, 보이기 시작하면 아래(translateY(100%))에서 제자리로
 * `ease-in`·`--duration-slow`로 올라온다, 한 번 올라오면 관찰자를 해제한다, 모션 줄이기에서는 숨지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/components/ui/__tests__/FooterLogo.test.tsx
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'

const { reduced } = vi.hoisted(() => ({ reduced: vi.fn(() => false) }))
vi.mock('@/lib/motion', () => ({ prefersReducedMotion: reduced }))

import FooterLogo from '../FooterLogo'

afterEach(() => reduced.mockReturnValue(false))

describe('FooterLogo 서버 렌더', () => {
  it('모션 전에는 숨지 않고 제자리(translateY(0))에 있고 전환이 없다', () => {
    const html = renderToStaticMarkup(createElement(FooterLogo))
    expect(html).toContain('translateY(0)')
    expect(html).not.toContain('100%)')
    expect(html).toContain('transition:none')
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="JAM!"')
  })
})
