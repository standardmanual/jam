/**
 * @vitest-environment node
 *
 * ProgressCountBar 채움색 — 기본은 강조색 그린(인벤토리), `color`로 바꾸면 그 색이다(컬렉션 상세는 캡슐색, 티켓 20261125_1345).
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ProgressCountBar from '../ProgressCountBar'

describe('ProgressCountBar 채움색', () => {
  it('색을 넘기지 않으면 강조색 그린이다', () => {
    const html = renderToStaticMarkup(<ProgressCountBar percent={40} current={2} total={5} />)
    expect(html).toContain('var(--jam-green)')
    expect(html).not.toContain('var(--capsule-fill)')
  })

  it('color를 넘기면 그 색으로 채운다', () => {
    const html = renderToStaticMarkup(<ProgressCountBar percent={40} current={2} total={5} color="var(--capsule-fill)" />)
    expect(html).toContain('var(--capsule-fill)')
    expect(html).not.toContain('var(--jam-green)')
  })
})
