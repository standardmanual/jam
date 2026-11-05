/**
 * 홈 상단 캡슐 막힘 배너(CapsuleBlockedBanner) 렌더 (티켓 20261105_0104 T4, 채원 사전 판정 2026-11-05)
 *
 * 저장소에 jsdom·testing-library가 없어(`SuspensionBanner.test.tsx`와 같은 방식) 서버 렌더로 마크업만 고정한다. 가짜 props만 쓴다.
 *
 * R3(티켓 20261105_1439): 제목은 대기 보상 개수 n, 본문은 부족분 k(최소 1)로 그린다.
 * 고정하는 것: 제목(대기 개수 n)·본문(부족분 k)·«인벤토리 보기» 버튼이 문구 사전에서 나온다, N은 최소 1, 아이콘은 `text-danger`이고 `aria-hidden`이다,
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

const render = (shortfall: number, pending = 2) => renderToStaticMarkup(<CapsuleBlockedBanner pending={pending} shortfall={shortfall} />)
const textOf = (html: string) => html.replace(/<[^>]*>/g, '')

describe('CapsuleBlockedBanner — 막힘 기본 모습', () => {
  const html = render(2)

  it('제목·본문·버튼 문구가 사용자 결정(2026-11-05) 그대로 보인다', () => {
    const text = textOf(render(1, 2))
    expect(text).toContain('아이템 배지 2개를 얻었어요')
    expect(text).toContain('인벤토리가 가득 차서 넣지 못했어요. 1칸을 비우면 바로 들어와요. 그 전까지는 잼을 얻을 수 없어요.')
    expect(text).toContain('인벤토리 보기')
    expect(text).not.toContain('잠시')
  })

  it('대기 1개에 빈칸 0개면 «1개»와 «1칸»이다', () => {
    const text = textOf(render(1, 1))
    expect(text).toContain('아이템 배지 1개를 얻었어요')
    expect(text).toContain('1칸을 비우면')
  })

  it('대기 개수가 두 자리여도 제목에 그대로 들어간다', () => {
    expect(textOf(render(1, 12))).toContain('아이템 배지 12개를 얻었어요')
  })

  it('버튼은 하나뿐이다(닫기·보조 버튼 없음)', () => {
    expect(html.match(/<button/g)).toHaveLength(1)
    expect(html).toContain(d.capsule.blockedBanner.cta)
  })

  it('부족분 k를 본문에, 대기 개수 n을 제목에 넣는다', () => {
    expect(textOf(render(5, 7))).toContain(t(d.capsule.blockedBanner.body, { k: 5 }))
    expect(textOf(render(5, 7))).toContain(t(d.capsule.blockedBanner.title, { n: 7 }))
    expect(textOf(render(5, 7))).toContain('5칸을 비우면')
  })

  it('부족분이 1 미만으로 들어와도 1칸으로 보인다', () => {
    expect(textOf(render(0))).toContain('1칸을 비우면')
    expect(textOf(render(-3))).toContain('1칸을 비우면')
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

  it('카드는 반전 면이고 제목은 snow, 본문은 snow 80%이며 한국어 줄바꿈 클래스가 있고 text-balance는 없다', () => {
    const title = html.match(/<h2[^>]*>/)?.[0] ?? ''
    expect(title).toContain('text-snow')
    expect(title).toContain('font-bold')
    for (const cls of ['break-keep', 'wrap-break-word']) expect(title).toContain(cls)
    const body = html.match(/<p [^>]*>/)?.[0] ?? ''
    expect(body).toContain('text-snow/80')
    for (const cls of ['break-keep', 'wrap-break-word']) expect(body).toContain(cls)
    // 균형 맞춤이 줄을 일찍 꺾어 두세 줄로 좁아 보였다(2026-11-05 사용자 지적)
    expect(title).not.toContain('text-balance')
    expect(body).not.toContain('text-balance')
    expect(html).toContain('var(--background-inverse)')
  })

  it('버튼은 가장 작은 크기(xs, 홈 «동기화» 버튼과 같다)의 secondary이고 전체 폭이 아니다', () => {
    const button = html.match(/<button[^>]*>/)?.[0] ?? ''
    expect(button).toContain('bg-default')
    expect(button).toContain('min-height:calc(44px * var(--scale-compact))')
    expect(button).not.toMatch(/w-full/)
  })
})
