/**
 * 온보딩 퀘스트 홈 카드 — 이어 하기 경로 변경 테스트 (티켓 20260928_0136, 상위 20260927_2123 N3)
 * + 건너뛰기 진입점 노출 테스트(티켓 20260927_2131 T8).
 *
 * 별도 퀘스트 화면(/onboarding-quest, N2)이 삭제되면서 in_progress 카드는 N1
 * `STEP_SCREEN_MAP`을 따라 실제 화면으로 링크해야 한다. sync 차례만 비클릭 안내 카드로
 * 갈린다(채원 사전 판정 B) — 동기화 버튼이 이미 같은 화면 위에 있어 이동할 곳이 없다.
 *
 * 저장소에 jsdom·testing-library가 없어 서버 렌더(`renderToStaticMarkup`)로 고정한다
 * (`MissionDetailClient.test.tsx`와 같은 방식). 카드가 클라이언트 컴포넌트
 * `OnboardingQuestSkipSheet`를 자식으로 두므로 `OnboardingSyncButton.test.tsx`와 같은
 * 방식으로 `next/navigation`·Toast를 목으로 대체한다.
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

import OnboardingQuestCard from './OnboardingQuestCard'
import type { OnboardingQuestCardState } from '@/lib/onboarding-quest/status'
import { d } from '@/lib/i18n'

function render(state: OnboardingQuestCardState) {
  return renderToStaticMarkup(<OnboardingQuestCard state={state} />)
}

describe('OnboardingQuestCard — in_progress 경로', () => {
  it.each([
    ['bag', '/inventory'],
    ['pickup', '/drops'],
    ['drop', '/drops'],
    ['mix_fail', '/combine'],
    ['mix_success', '/combine'],
    ['browse', '/missions'],
  ] as const)('nextStep=%s면 %s로 링크한다', (nextStep, path) => {
    const html = render({ kind: 'in_progress', done: 1, total: 7, nextStep })
    expect(html).toContain(`href="${path}"`)
    expect(html).not.toContain('/onboarding-quest')
  })

  it('nextStep=sync면 링크가 없고 위치 안내 문구가 text-secondary 톤으로 보인다', () => {
    const html = render({ kind: 'in_progress', done: 0, total: 7, nextStep: 'sync' })
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('/onboarding-quest')
    expect(html).toContain(d.onboardingQuest.steps.sync.locationHint)
  })
})

describe('OnboardingQuestCard — 건너뛰기 진입점 노출(티켓 20260927_2131 T8)', () => {
  it.each(['sync', 'bag', 'browse'] as const)(
    'in_progress(nextStep=%s)에는 건너뛰기 진입점이 보인다',
    (nextStep) => {
      const html = render({ kind: 'in_progress', done: 1, total: 7, nextStep })
      expect(html).toContain(d.onboardingQuest.skip.entryLabel)
    }
  )

  it('awaiting_sync(미연동)에는 건너뛰기 진입점이 없다', () => {
    const html = render({ kind: 'awaiting_sync', stravaConnected: false, skipped: false })
    expect(html).not.toContain(d.onboardingQuest.skip.entryLabel)
  })

  it('awaiting_sync(연동됨·첫 활동 대기)에는 건너뛰기 진입점이 없다', () => {
    const html = render({ kind: 'awaiting_sync', stravaConnected: true, skipped: false })
    expect(html).not.toContain(d.onboardingQuest.skip.entryLabel)
  })
})
