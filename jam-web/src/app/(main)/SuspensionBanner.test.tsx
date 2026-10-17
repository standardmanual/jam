/**
 * 홈 상단 이용 정지 배너(SuspensionBanner) 렌더 (티켓 20261017_1426 2회, 채원 사전 판정)
 *
 * 저장소에 jsdom·testing-library가 없어(`OnboardingSyncButton.test.tsx`와 같은 방식) 서버 렌더로 마크업만 고정한다.
 * 가짜 props만 쓰며 공용 DB는 부르지 않는다.
 *
 * 고정하는 것: 칩·제목·사유 전문·정지일(KST)·결과 설명·«문의하기» 버튼이 문구 사전에서 나온다, 긴 사유와 줄바꿈은 줄이지 않고 보존한다,
 * 사유가 비면 사유 줄만 숨긴다, 색 면·아이콘·고정 위치 클래스가 없다, 접근성(section·dl).
 * 정지가 아닐 때 DOM에 아무것도 없는 것은 홈이 컴포넌트를 부르지 않는 쪽(`page.tsx`)이라 `home-banner.test.ts`에서 고정한다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import SuspensionBanner from './SuspensionBanner'
import { d } from '@/lib/i18n'

// 2026-10-17 12:00 KST (= 03:00 UTC)
const SUSPENDED_AT = '2026-10-17T03:00:00.000Z'

function render(reason: string) {
  return renderToStaticMarkup(<SuspensionBanner reason={reason} suspendedAt={SUSPENDED_AT} />)
}

describe('SuspensionBanner — 정지 중 기본 모습', () => {
  const html = render('GPS 조작이 반복돼서 정지했어요.')

  it('칩·제목·라벨·결과 설명이 문구 사전 그대로 보인다', () => {
    expect(html).toContain(d.suspension.bannerChip)
    expect(html).toContain(d.suspension.bannerTitle)
    expect(html).toContain(d.suspension.bannerReasonLabel)
    expect(html).toContain(d.suspension.bannerSuspendedOnLabel)
    expect(html).toContain(d.suspension.bannerBody)
  })

  it('사유 전문과 정지일(연도 포함, KST)이 보인다', () => {
    expect(html).toContain('GPS 조작이 반복돼서 정지했어요.')
    expect(html).toContain('2026년 10월 17일')
  })

  it('문의 버튼 문구는 기존 d.voc.inquireCta를 쓴다', () => {
    expect(html).toContain(d.voc.inquireCta)
    expect(html.match(/<button/g)).toHaveLength(1) // 버튼은 하나뿐(보조 버튼·닫기 없음)
  })

  it('제목 id로 묶인 section이고 사유·정지일은 dl/dt/dd다', () => {
    expect(html).toMatch(/<section aria-labelledby="suspension-banner-title"/)
    expect(html).toContain('id="suspension-banner-title"')
    expect(html).toContain('<dl')
    expect(html.match(/<dt/g)).toHaveLength(2)
    expect(html.match(/<dd/g)).toHaveLength(2)
  })

  it('라이브 영역·고정 위치·색 면·아이콘이 없다', () => {
    expect(html).not.toContain('role="alert"')
    expect(html).not.toMatch(/\b(fixed|sticky)\b/)
    expect(html).not.toMatch(/bg-(danger|warning|red|yellow)/)
    expect(html).not.toContain('<svg')
    expect(html).not.toContain('line-clamp')
    expect(html).not.toContain('truncate')
  })

  it('한국어 줄바꿈 클래스가 붙는다', () => {
    expect(html).toContain('break-keep')
    expect(html).toContain('wrap-break-word')
    expect(html).toContain('text-balance')
    expect(html).toContain('text-pretty')
  })
})

describe('SuspensionBanner — 사유 길이', () => {
  it('아주 긴 사유도 줄이지 않고 전문을 보인다', () => {
    const long = '반복적인 부정 이용이 확인되어 '.repeat(40).trim()
    const html = render(long)
    expect(html).toContain(long)
  })

  it('긴 영문·URL 한 덩어리도 그대로 담고 wrap-break-word가 걸린다', () => {
    const token = 'https://example.com/' + 'a'.repeat(200)
    const html = render(token)
    expect(html).toContain(token)
    expect(html).toMatch(/<dd class="[^"]*wrap-break-word/)
  })

  it('줄바꿈이 들어 있는 사유는 줄바꿈을 살리는 whitespace-pre-line이 걸린다', () => {
    const html = render('첫째 줄\n둘째 줄')
    expect(html).toContain('첫째 줄\n둘째 줄')
    expect(html).toMatch(/<dd class="[^"]*whitespace-pre-line/)
  })

  it('사유가 빈 문자열이면 사유 줄만 숨기고 나머지는 그대로다', () => {
    const html = render('   ')
    expect(html).not.toContain(d.suspension.bannerReasonLabel)
    expect(html).toContain(d.suspension.bannerSuspendedOnLabel)
    expect(html).toContain('2026년 10월 17일')
    expect(html).toContain(d.suspension.bannerBody)
    expect(html.match(/<dt/g)).toHaveLength(1)
  })
})
