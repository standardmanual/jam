/**
 * Card 서비스 시험 (티켓 20261127_1555)
 *
 * 저장소에 jsdom이 없어 서버 렌더 마크업으로 고정한다. 여기서는 inverse 톤이 티켓 잉크 구간(.cards·.ink)이
 * 되돌린 글자 토큰을 자기 안에서 다시 반전 값으로 정하는지만 확인한다.
 *
 * 실행: cd jam-web && npx vitest run src/components/ui/Card.test.tsx
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Card } from './Card'

describe('Card 글자 토큰', () => {
  it('inverse는 --foreground·--muted·--link를 자기 안에서 반전 값으로 정한다', () => {
    const html = renderToStaticMarkup(<Card tone="inverse">안내</Card>)
    expect(html).toContain('--foreground:var(--snow)')
    expect(html).toContain('--muted:var(--muted-on-inverse)')
    expect(html).toContain('--link:var(--snow)')
    expect(html).toContain('background:var(--background-inverse)')
  })

  it('호출부 style이 뒤에서 덮는다', () => {
    const html = renderToStaticMarkup(<Card tone="inverse" style={{ color: 'var(--ink)' }}>안내</Card>)
    expect(html).toContain('color:var(--ink)')
    expect(html).not.toContain('color:var(--snow);')
  })

  it('default·tint는 글자 토큰을 건드리지 않는다', () => {
    expect(renderToStaticMarkup(<Card>안내</Card>)).not.toContain('--foreground:')
    expect(renderToStaticMarkup(<Card tone="tint">안내</Card>)).not.toContain('--muted:')
  })
})
