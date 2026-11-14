/**
 * 위치 안내 카드(LocationPermissionCard) 서버 렌더 마크업 (티켓 20261114_1507).
 *
 * jsdom·testing-library가 없어 `renderToStaticMarkup`으로 초기 마크업만 고정한다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import LocationPermissionCard from './LocationPermissionCard'
import { d } from '@/lib/i18n'

describe('LocationPermissionCard — 거부(denied)', () => {
  const html = renderToStaticMarkup(<LocationPermissionCard kind="denied" onRetry={vi.fn()} />)

  it('제목·설명·허용 방법 제목이 보인다', () => {
    expect(html).toContain(d.drops.permissionDeniedTitle)
    expect(html).toContain(d.drops.permissionDeniedDescription)
    expect(html).toContain(d.drops.permissionGuideTitle)
  })

  it('번호 3줄이 순서대로 보인다', () => {
    expect(d.drops.permissionGuideSteps).toHaveLength(3)
    expect(html.match(/<li /g)).toHaveLength(3)
    let last = -1
    for (const step of d.drops.permissionGuideSteps) {
      const at = html.indexOf(step)
      expect(at).toBeGreaterThan(last)
      last = at
    }
    for (const n of ['>1<', '>2<', '>3<']) expect(html).toContain(n)
  })

  it('버튼 라벨이 보이고 버튼은 하나다', () => {
    expect(html).toContain(d.drops.permissionRetry)
    expect(html.match(/<button/g)).toHaveLength(1)
  })

  it('지도 윤곽은 보조기기에서 숨긴다', () => {
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"[^>]*stroke="var\(--border\)"/)
  })

  it('반투명 면 토큰을 쓰고 backdrop-filter는 없다', () => {
    expect(html).toContain('var(--card-bg-translucent)')
    expect(html).not.toMatch(/backdrop/i)
  })
})

describe('LocationPermissionCard — 미지원(unsupported)', () => {
  const html = renderToStaticMarkup(<LocationPermissionCard kind="unsupported" onRetry={vi.fn()} />)

  it('안내 제목과 설명만 보인다', () => {
    expect(html).toContain(d.drops.permissionUnsupportedTitle)
    expect(html).toContain(d.drops.permissionUnsupportedDescription)
  })

  it('번호 목록·허용 방법 구획·버튼이 없다', () => {
    expect(html).not.toContain('<ol')
    expect(html).not.toContain('<li')
    expect(html).not.toContain('<button')
    expect(html).not.toContain(d.drops.permissionGuideTitle)
    expect(html).not.toContain(d.drops.permissionRetry)
  })

  it('backdrop-filter가 없다', () => {
    expect(html).not.toMatch(/backdrop/i)
  })
})
