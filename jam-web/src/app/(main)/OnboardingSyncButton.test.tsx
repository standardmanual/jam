/**
 * 홈 TopNav 연출 동기화 버튼(OnboardingSyncButton) 초기 렌더 (티켓 20260927_2331, 상위
 * 20260927_2123 T2c).
 *
 * 저장소에 jsdom·testing-library가 없어(`OnboardingQuestCard.test.tsx`와 같은 방식) 서버 렌더
 * (`renderToStaticMarkup`)로 초기 상태만 고정한다: 「동기화」 버튼이 보이고, 오버레이는
 * 닫혀 있어 연출 배지 이름이 아직 노출되지 않는다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

import OnboardingSyncButton from './OnboardingSyncButton'
import { d } from '@/lib/i18n'
import { DEMO_SYNC_REVEAL_BADGE } from '@/lib/onboarding-quest/demo-data'

describe('OnboardingSyncButton 초기 렌더', () => {
  it('「동기화」 버튼 라벨이 보인다', () => {
    const html = renderToStaticMarkup(<OnboardingSyncButton />)
    expect(html).toContain(d.today.syncButton)
  })

  it('오버레이가 닫혀 있어 연출 배지 이름이 아직 보이지 않는다', () => {
    const html = renderToStaticMarkup(<OnboardingSyncButton />)
    expect(html).not.toContain(DEMO_SYNC_REVEAL_BADGE.name)
  })
})
