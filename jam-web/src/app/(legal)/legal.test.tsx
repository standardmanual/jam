/**
 * (legal) 라우트 그룹 — 비로그인 공개 정책 문서 화면 (티켓 20260929_1400).
 *
 * 저장소에 jsdom·testing-library가 없어 서버 렌더(`renderToStaticMarkup`)로 고정한다.
 * Provider(ToastProvider·TopNavDataProvider) 없이 렌더되는 것 자체가 핵심 검증이다 —
 * Provider가 필요한 서비스 TopNav를 쓰면 여기서 던진다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/privacy',
  useSearchParams: () => new URLSearchParams(),
}))

import LegalLayout from './layout'
import LegalTopNav from './LegalTopNav'
import PrivacyPage from './privacy/page'
import LocationTermsPage from './location-terms/page'
import { PAGE_GRADIENT_BACKGROUND } from '@/lib/pageBackground'

describe('LegalTopNav', () => {
  it('제목과 뒤로가기 버튼만 있고 동기화·알림·아바타가 없다', () => {
    const html = renderToStaticMarkup(<LegalTopNav title="개인정보 처리방침" />)
    expect(html).toContain('개인정보 처리방침')
    expect(html).toContain('<button')
    // 뒤로가기 버튼 하나뿐이어야 한다(동기화 버튼·알림 종·아바타 버튼 없음)
    expect(html.match(/<button/g)?.length).toBe(1)
    expect(html).not.toContain('<img')
  })
})

describe('LegalLayout', () => {
  it('(main)과 같은 배경 상수(--background 단색)를 쓰고 430px 컬럼으로 감싼다', () => {
    const html = renderToStaticMarkup(
      <LegalLayout>
        <p>본문</p>
      </LegalLayout>,
    )
    expect(html).toContain('본문')
    expect(html).toContain('max-w-[430px]')
    // 라이트 전환 뒤 마지막 정지점 #3d3d3d가 남아 하단이 어두워진 결함(채원② 중대 2)의 회귀 방지
    expect(html).toContain('background:var(--background)')
    expect(html).not.toContain('#3d3d3d')
    expect(html).not.toContain('gradient')
    expect(PAGE_GRADIENT_BACKGROUND.backgroundAttachment).toBe('fixed')
    expect(PAGE_GRADIENT_BACKGROUND.background).toBe('var(--background)')
  })

  it('탭 바·Footer를 렌더하지 않는다', () => {
    const html = renderToStaticMarkup(
      <LegalLayout>
        <p>본문</p>
      </LegalLayout>,
    )
    expect(html).not.toContain('<footer')
    expect(html).not.toContain('<nav')
  })
})

describe('정책 문서 페이지는 Provider 없이 렌더된다', () => {
  it('/privacy', () => {
    const html = renderToStaticMarkup(<PrivacyPage />)
    expect(html).toContain('개인정보 처리방침')
  })

  it('/location-terms', () => {
    const html = renderToStaticMarkup(<LocationTermsPage />)
    expect(html).toContain('위치기반서비스 이용약관')
  })
})
