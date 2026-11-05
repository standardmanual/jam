/**
 * 홈 캡슐 막힘 카드(CapsuleBlockedCard) 렌더 (티켓 20261105_1912, 채원 사전 판정 2026-11-05)
 *
 * 저장소에 jsdom이 없어 서버 렌더로 마크업만 고정한다. 게이지는 카드 밖(위젯)이 그린다.
 * 고정하는 것: 두 줄 안내 + «인벤토리 가기» 버튼 하나, 제목·아이콘·숫자가 없다, 반전 면, 줄바꿈 클래스(text-balance 없음),
 * section의 aria-labelledby가 안내 문단 id를 가리킨다, 붉은색·그라디언트·고정 위치·z-index가 없다.
 * /inventory 이동은 라우터 호출이라 서버 렌더로 누를 수 없어 버튼이 하나이고 문구가 `cta`인 것까지만 확인한다.
 */
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import CapsuleBlockedCard from './CapsuleBlockedCard'
import { d } from '@/lib/i18n'

const html = renderToStaticMarkup(<CapsuleBlockedCard />)
const textOf = (value: string) => value.replace(/<[^>]*>/g, '')

describe('CapsuleBlockedCard — 막힘 카드', () => {
  it('안내 두 줄이 사용자 확정 문구 그대로 보인다', () => {
    expect(d.capsule.blockedBanner.line1).toBe('인벤토리가 가득 찼어요.')
    expect(d.capsule.blockedBanner.line2).toBe('배지를 받으려면 인벤토리를 비워주세요.')
    expect(textOf(html)).toContain('인벤토리가 가득 찼어요.')
    expect(textOf(html)).toContain('배지를 받으려면 인벤토리를 비워주세요.')
  })

  it('두 줄은 각각 별도 블록이라 문장 사이에서 끊긴다', () => {
    expect(html).toMatch(/<span class="block">인벤토리가 가득 찼어요\.<\/span>/)
    expect(html).toMatch(/<span class="block text-snow\/80">배지를 받으려면 인벤토리를 비워주세요\.<\/span>/)
  })

  it('게이지는 카드 안에 없고 버튼은 «인벤토리 가기» 하나뿐이다', () => {
    expect(html).not.toContain('role="img"')
    expect(html.match(/<button/g)).toHaveLength(1)
    expect(html).toContain(`>${d.capsule.blockedBanner.cta}</button>`)
    expect(d.capsule.blockedBanner.cta).toBe('인벤토리 가기')
  })

  it('제목 요소·아이콘·숫자(n개·k칸)·옛 문구가 없다', () => {
    expect(html).not.toMatch(/<h\d/)
    expect(html).not.toContain('<svg')
    expect(textOf(html)).not.toMatch(/\d|칸을 비우면|얻었어요|인벤토리 보기/)
    expect(Object.keys(d.capsule.blockedBanner)).toEqual(['line1', 'line2', 'cta'])
  })

  it('section의 aria-labelledby가 안내 문단 id를 가리킨다', () => {
    const labelledby = html.match(/<section aria-labelledby="([^"]+)"/)?.[1]
    expect(labelledby).toBeTruthy()
    expect(html).toContain(`<p id="${labelledby}"`)
  })

  it('카드는 반전 면이고 안내는 왼쪽 정렬·snow 글자이며 줄바꿈 클래스가 있고 text-balance는 없다', () => {
    expect(html).toContain('var(--background-inverse)')
    expect(html).toContain('text-left')
    const note = html.match(/<p [^>]*>/)?.[0] ?? ''
    expect(note).toContain('text-snow')
    for (const cls of ['break-keep', 'wrap-break-word']) expect(note).toContain(cls)
    expect(html).not.toContain('text-balance')
  })

  it('버튼은 소형 secondary(--default 면)이고 줄바꿈 없이 오른쪽에 놓이며 전체 폭이 아니다', () => {
    const button = html.match(/<button[^>]*>/)?.[0] ?? ''
    expect(button).toContain('var(--default)')
    expect(button).toContain('min-height:calc(44px * var(--scale-compact))')
    expect(button).toContain('whitespace-nowrap')
    expect(button).toContain('shrink-0')
    expect(button).not.toContain('width:100%')
  })

  it('붉은색·그라디언트·고정 위치·z-index·애니메이션이 없다', () => {
    expect(html).not.toMatch(/danger|gradient|animate-|fixed|sticky|z-index|z-\d|z-\[/)
  })
})
