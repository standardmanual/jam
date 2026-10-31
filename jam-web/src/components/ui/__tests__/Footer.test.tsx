/**
 * 전역 푸터 링크 (티켓 20261021_1250 1회, 운영 로직 18.3절 — 확률 안내 페이지는 푸터의 서비스 소개·방침·약관 링크 옆에 둔다)
 *
 * 고정하는 것: 링크 순서(Philosophy → 개인정보처리방침 → 위치기반서비스 이용약관 → 확률 안내 → 문의), «확률 안내»가 /probability로, «문의»가 /voc로 가고
 * 나머지 링크와 같은 서식(15px/28px, 밑줄, active 투명도)을 쓴다. `/drops`·`/philosophy`에서는 푸터가 없다.
 *
 * 실행: cd jam-web && npx vitest run src/components/ui/__tests__/Footer.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const { pathnameMock } = vi.hoisted(() => ({ pathnameMock: vi.fn(() => '/') }))
vi.mock('next/navigation', () => ({ usePathname: pathnameMock }))

import Footer from '../Footer'
import { d } from '@/lib/i18n'

function links(html: string): Array<{ href: string; className: string; label: string }> {
  return [...html.matchAll(/<a class="([^"]*)" href="([^"]+)">([^<]*)<\/a>/g)].map((m) => ({ className: m[1], href: m[2], label: m[3] }))
}

describe('Footer 링크', () => {
  it('«확률 안내» 다음 줄에 «문의»가 /voc로 간다', () => {
    const found = links(renderToStaticMarkup(<Footer />))
    expect(found.map((l) => [l.href, l.label])).toEqual([
      ['/philosophy', 'Philosophy'],
      ['/privacy', '개인정보처리방침'],
      ['/location-terms', '위치기반서비스 이용약관'],
      ['/probability', '확률 안내'],
      ['/voc', '문의'],
    ])
    expect(d.common.footerProbability).toBe('확률 안내')
    expect(d.common.footerInquiry).toBe('문의')
  })

  it('나머지 링크와 같은 서식(15px/28px, 밑줄, active 투명도 전환)이다', () => {
    const found = links(renderToStaticMarkup(<Footer />))
    const probability = found.find((l) => l.href === '/probability')
    expect(probability?.className).toBe(found.find((l) => l.href === '/location-terms')?.className)
    expect(probability?.className).toContain('text-[15px] leading-[28px]')
    expect(probability?.className).toContain('underline underline-offset-2')
    expect(probability?.className).toContain('active:opacity-60')
    expect(probability?.className).toContain('duration-[var(--duration-micro)]')
    // 숫자 강조처럼 읽히지 않게 초록(--link)을 쓰지 않는다
    expect(probability?.className).not.toContain('link')
    expect(found.find((l) => l.href === '/voc')?.className).toBe(probability?.className)
  })

  it.each(['/drops', '/philosophy'])('%s에서는 푸터를 그리지 않는다(기존 규칙 그대로)', (pathname) => {
    pathnameMock.mockReturnValueOnce(pathname)
    expect(renderToStaticMarkup(<Footer />)).toBe('')
  })
})
