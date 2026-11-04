/**
 * 홈 상단 캡슐 막힘 배너(CapsuleBlockedBanner) 렌더 (티켓 20261105_0104 T4, 채원 사전 판정 2026-11-05)
 *
 * 저장소에 jsdom·testing-library가 없어(`SuspensionBanner.test.tsx`와 같은 방식) 서버 렌더로 마크업만 고정한다. 가짜 props만 쓴다.
 *
 * 고정하는 것: 제목·본문(부족분 N)·«인벤토리 보기» 버튼이 문구 사전에서 나온다, N은 최소 1, 아이콘은 `text-danger`이고 `aria-hidden`이다,
 * 면·테두리를 붉게 칠하지 않는다(붉은색은 아이콘 하나), 닫기·칩·애니메이션·고정 위치가 없다, 줄바꿈 클래스, section·h2 접근성.
 * 막히지 않았을 때 DOM에 아무것도 없는 것과 정지와 겹침은 홈이 컴포넌트를 부르는 쪽(`page.tsx`)이라 `home-blocked-banner.test.ts`에서 고정한다.
 * /inventory 이동은 라우터 호출이라 서버 렌더로 누를 수 없어, 버튼이 하나이고 문구가 `cta`인 것까지만 확인한다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import CapsuleBlockedBanner from './CapsuleBlockedBanner'
import { d, t } from '@/lib/i18n'

const render = (shortfall: number) => renderToStaticMarkup(<CapsuleBlockedBanner shortfall={shortfall} />)
const textOf = (html: string) => html.replace(/<[^>]*>/g, '')

describe('CapsuleBlockedBanner — 막힘 기본 모습', () => {
  const html = render(2)

  it('제목·본문·버튼 문구가 윈터 제3안 그대로 보인다', () => {
    const text = textOf(html)
    expect(text).toContain('인벤토리에 빈칸이 필요해요')
    expect(text).toContain('캡슐을 열 빈칸이 모자라서 잼 모으기가 잠시 멈췄어요. 2칸만 더 비우면 바로 다시 모을 수 있어요.')
    expect(text).toContain('인벤토리 보기')
  })

  it('버튼은 하나뿐이다(닫기·보조 버튼 없음)', () => {
    expect(html.match(/<button/g)).toHaveLength(1)
    expect(html).toContain(d.capsule.blockedBanner.cta)
  })

  it('부족분 N을 본문에 넣는다', () => {
    expect(textOf(render(5))).toContain(t(d.capsule.blockedBanner.body, { n: 5 }))
    expect(textOf(render(5))).toContain('5칸만 더 비우면')
  })

  it('부족분이 1 미만으로 들어와도 1칸으로 보인다', () => {
    expect(textOf(render(0))).toContain('1칸만 더 비우면')
    expect(textOf(render(-3))).toContain('1칸만 더 비우면')
  })

  it('아이콘은 text-danger이고 스크린리더에서 숨긴다', () => {
    const icon = html.match(/<svg[^>]*>/)?.[0] ?? ''
    expect(icon).toContain('text-danger')
    expect(icon).toContain('aria-hidden="true"')
    expect(icon).toContain('h-5 w-5')
  })

  it('제목 id로 묶인 section이고 제목은 h2이며 role이 없다', () => {
    expect(html).toMatch(/<section aria-labelledby="capsule-blocked-banner-title"/)
    expect(html).toContain('<h2 id="capsule-blocked-banner-title"')
    expect(html).not.toContain('role=')
  })

  it('붉은 면·테두리·그라디언트·고정 위치·애니메이션이 없고 붉은색은 아이콘 하나다', () => {
    expect(html).not.toMatch(/bg-danger|border-danger|bg-warning|text-warning|accent-content-red|point-text/)
    expect(html).not.toMatch(/gradient|animate-|fixed|sticky|z-index|z-\d|z-\[/)
    expect(html.match(/text-danger/g)).toHaveLength(1)
  })

  it('제목은 foreground, 본문은 muted이고 한국어 줄바꿈 클래스가 있다', () => {
    const title = html.match(/<h2[^>]*>/)?.[0] ?? ''
    expect(title).toContain('text-foreground')
    expect(title).toContain('font-bold')
    for (const cls of ['break-keep', 'wrap-break-word', 'text-balance']) expect(title).toContain(cls)
    const body = html.match(/<p [^>]*>/)?.[0] ?? ''
    expect(body).toContain('text-muted')
    for (const cls of ['break-keep', 'wrap-break-word', 'text-balance']) expect(body).toContain(cls)
  })

  it('버튼은 전체 폭이다', () => {
    expect(html.match(/<button[^>]*>/)?.[0]).toMatch(/w-full/)
  })
})
