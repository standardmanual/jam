import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ListRowCard from './ListRowCard'

// 티켓 20261105_1953 — 경고성 안내 행용 어두운 반전 톤.
describe('ListRowCard 톤', () => {
  it('inverse는 --background-inverse 면과 같은 색 1px 테두리, --snow 글자를 쓴다', () => {
    const html = renderToStaticMarkup(<ListRowCard tone="inverse">본문</ListRowCard>)
    expect(html).toContain('bg-background-inverse')
    expect(html).toContain('border-background-inverse')
    expect(html).toContain('text-snow')
    expect(html).not.toContain('bg-surface')
  })

  it('inverse도 default와 같은 박스(rounded-2xl p-4, 1px 테두리)라 높이가 같다', () => {
    const inverse = renderToStaticMarkup(<ListRowCard tone="inverse">본문</ListRowCard>)
    const base = renderToStaticMarkup(<ListRowCard>본문</ListRowCard>)
    for (const cls of ['rounded-2xl', 'p-4', 'gap-4', 'border']) {
      expect(inverse).toContain(cls)
      expect(base).toContain(cls)
    }
  })

  it('톤을 주지 않으면 흰 면 + 1px --border다', () => {
    const html = renderToStaticMarkup(<ListRowCard>본문</ListRowCard>)
    expect(html).toContain('bg-surface')
    expect(html).toContain('border-border')
    expect(html).not.toContain('bg-background-inverse')
  })
})
