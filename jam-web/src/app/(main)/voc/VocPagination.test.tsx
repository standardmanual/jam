/**
 * VocPagination — «이전 · 10 / 20 · 다음» 한 줄 구성 (티켓 20261126_1618).
 * jsdom이 없어 서버 렌더로 고정한다.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import VocPagination from './VocPagination'

describe('VocPagination', () => {
  it('쪽 번호 버튼 없이 현재 / 전체 글자와 이전·다음만 그린다', () => {
    const html = renderToStaticMarkup(<VocPagination page={10} totalPages={20} onChange={() => {}} />)
    expect(html).toContain('10 / 20')
    expect(html).toContain('aria-label="20쪽 중 10쪽"')
    expect(html).not.toContain('aria-current')
    expect(html.match(/<button/g)).toHaveLength(2)
  })

  it('첫 쪽은 이전, 끝 쪽은 다음이 비활성이다', () => {
    const first = renderToStaticMarkup(<VocPagination page={1} totalPages={3} onChange={() => {}} />)
    expect(first.match(/<button[^>]*disabled/g)).toHaveLength(1)
    expect(first.indexOf('disabled')).toBeLessThan(first.indexOf('1 / 3'))
    const last = renderToStaticMarkup(<VocPagination page={3} totalPages={3} onChange={() => {}} />)
    expect(last.match(/<button[^>]*disabled/g)).toHaveLength(1)
    expect(last.indexOf('disabled')).toBeGreaterThan(last.indexOf('3 / 3'))
  })

  it('쪽이 하나뿐이면 아무것도 그리지 않는다', () => {
    expect(renderToStaticMarkup(<VocPagination page={1} totalPages={1} onChange={() => {}} />)).toBe('')
  })
})
