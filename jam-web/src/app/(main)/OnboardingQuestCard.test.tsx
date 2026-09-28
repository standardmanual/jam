/**
 * 온보딩 퀘스트 홈 카드 — 보상 문구 제거·진행도 우측 상단·CTA 버튼화 테스트
 * (티켓 20260928_1537, 상위 20260927_2123)
 * + 이어 하기 경로 변경 테스트(티켓 20260928_0136, 상위 20260927_2123 N3)
 * + 건너뛰기 진입점 노출 테스트(티켓 20260927_2131 T8)
 * + GA4 onboarding_quest_start 트래커 마운트 조건 테스트(티켓 20260927_2132 T9).
 *
 * ②·③ 상태는 더 이상 `<Link>`로 카드를 감싸지 않는다 — 카드 전체를 링크로 두면 CTA
 * `<button>`이 `<a>` 안에 중첩돼 접근성 위반이 되기 때문이다(채원 사전 판정, MissionCard와
 * 같은 "Card는 비클릭, Button만 액션" 패턴). CTA는 `Button`의 onClick(router.push /
 * window.location.href)으로 동작한다.
 *
 * 저장소에 jsdom·testing-library가 없어(vitest.config.ts `environment: 'node'`) 서버 렌더
 * (`renderToStaticMarkup`)로 고정한다(`MissionDetailClient.test.tsx`와 같은 방식) — onClick
 * 핸들러는 정적 마크업에 나타나지 않으므로 실제 클릭 이벤트는 시뮬레이션할 수 없다. 이
 * 테스트는 (1) 카드 전체를 감싸던 `<a>` 링크가 사라졌는지 (2) 상태별 CTA 라벨이 맞는지
 * (3) 보상 안내·위치 안내 문구가 사라졌는지 (4) n/7이 칩과 같은 줄에 보이는지만 고정한다.
 * 단계→화면 매핑(`STEP_SCREEN_MAP`) 자체는 `screen-gate.test.ts`가 별도로 고정한다.
 *
 * 카드가 클라이언트 컴포넌트 `OnboardingQuestSkipSheet`·`OnboardingSyncButton`·`SyncButton`을
 * 자식으로 두므로 `OnboardingSyncButton.test.tsx`와 같은 방식으로 `next/navigation`·Toast를
 * 목으로 대체한다. `QuestStartTracker`는 `useEffect`가 정적 렌더에서 실행되지 않아 마운트
 * 여부를 직접 관찰할 수 없으므로, 감지용 마커 문자열을 돌려주는 목으로 바꿔 "트리에
 * 포함됐는가"만 검증한다.
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

const QUEST_START_TRACKER_MARKER = 'QUEST_START_TRACKER_MARKER'
vi.mock('./QuestStartTracker', () => ({
  default: () => QUEST_START_TRACKER_MARKER,
}))

import OnboardingQuestCard from './OnboardingQuestCard'
import type { OnboardingQuestCardState } from '@/lib/onboarding-quest/status'
import { d } from '@/lib/i18n'

function render(state: OnboardingQuestCardState, username: string | null = null) {
  return renderToStaticMarkup(<OnboardingQuestCard state={state} username={username} />)
}

describe('OnboardingQuestCard — 보상 안내·위치 안내 문구 제거(티켓 20260928_1537)', () => {
  it.each([
    { kind: 'in_progress', done: 0, total: 7, nextStep: 'sync' },
    { kind: 'in_progress', done: 1, total: 7, nextStep: 'bag' },
    { kind: 'awaiting_sync', stravaConnected: false, skipped: false },
    { kind: 'awaiting_sync', stravaConnected: true, skipped: false },
  ] as const)('어느 상태에도 보상 안내 문구가 없다', (state) => {
    const html = render(state as OnboardingQuestCardState)
    expect(html).not.toContain('끝까지 가면 퀘스트 클리어 배지와 100포인트')
  })

  it('sync 차례 카드에 위치 안내 문구가 없다', () => {
    const html = render({ kind: 'in_progress', done: 0, total: 7, nextStep: 'sync' })
    expect(html).not.toContain('동기화는 위 버튼에서 진행돼요')
  })
})

describe('OnboardingQuestCard — 진행도 n/7 위치(티켓 20260928_1537)', () => {
  it('in_progress 카드는 칩과 같은 줄에 n/7을 보여준다', () => {
    const html = render({ kind: 'in_progress', done: 3, total: 7, nextStep: 'bag' })
    expect(html).toContain('3/7')
  })

  it('Strava 미동기화 카드는 7/7을 보여준다', () => {
    const html = render({ kind: 'awaiting_sync', stravaConnected: false, skipped: false })
    expect(html).toContain('7/7')
  })

  it('첫 활동 대기 카드에는 n/7이 없다(바 자체가 없음)', () => {
    const html = render({ kind: 'awaiting_sync', stravaConnected: true, skipped: false })
    expect(html).not.toMatch(/\d\/7/)
  })
})

describe('OnboardingQuestCard — 상태별 CTA 버튼(티켓 20260928_1537, 확정한 결정 3)', () => {
  it('① sync 차례: 「동기화」 버튼이 있고 카드를 감싸는 <a> 링크가 없다', () => {
    const html = render({ kind: 'in_progress', done: 0, total: 7, nextStep: 'sync' })
    expect(html).toContain(d.today.syncButton)
    expect(html).not.toContain('<a ')
  })

  it('② 2~7단계: 「시작하기/이어 하기」 버튼만 있고 카드를 감싸는 <a> 링크가 없다', () => {
    const html = render({ kind: 'in_progress', done: 1, total: 7, nextStep: 'bag' })
    expect(html).toContain(d.onboardingQuest.continueButton)
    expect(html).not.toContain('<a ')
  })

  it('③ 7/7 완료·Strava 미연동: 「Strava 동기화하기」 버튼만 있고 카드를 감싸는 <a> 링크가 없다', () => {
    const html = render({ kind: 'awaiting_sync', stravaConnected: false, skipped: false })
    expect(html).toContain(d.onboardingQuest.lastStep.cta)
    expect(html).not.toContain('<a ')
  })

  it('④ 첫 활동 대기: 실제 SyncButton의 「동기화」 버튼이 있다', () => {
    const html = render({ kind: 'awaiting_sync', stravaConnected: true, skipped: false }, 'runner')
    expect(html).toContain(d.today.syncButton)
  })
})

describe('OnboardingQuestCard — in_progress 다음 단계 표시(티켓 20260928_0136)', () => {
  it.each(['bag', 'pickup', 'drop', 'mix_fail', 'mix_success', 'browse'] as const)(
    'nextStep=%s면 「이어 하기」 CTA가 보인다',
    (nextStep) => {
      const html = render({ kind: 'in_progress', done: 1, total: 7, nextStep })
      expect(html).toContain(d.onboardingQuest.continueButton)
    }
  )
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

describe('OnboardingQuestCard — GA4 onboarding_quest_start 트래커 마운트(티켓 20260927_2132 T9)', () => {
  it('0/7(첫 렌더)이고 미리보기가 아니면 마운트한다', () => {
    const html = render({ kind: 'in_progress', done: 0, total: 7, nextStep: 'sync' })
    expect(html).toContain(QUEST_START_TRACKER_MARKER)
  })

  it('이미 진행 중(done > 0)이면 마운트하지 않는다', () => {
    const html = render({ kind: 'in_progress', done: 1, total: 7, nextStep: 'bag' })
    expect(html).not.toContain(QUEST_START_TRACKER_MARKER)
  })

  it('관리자 미리보기 상태(preview: true)면 0/7이어도 마운트하지 않는다', () => {
    const html = render({ kind: 'in_progress', done: 0, total: 7, nextStep: 'sync', preview: true })
    expect(html).not.toContain(QUEST_START_TRACKER_MARKER)
  })

  it('awaiting_sync 상태에는 마운트하지 않는다', () => {
    const html = render({ kind: 'awaiting_sync', stravaConnected: false, skipped: false })
    expect(html).not.toContain(QUEST_START_TRACKER_MARKER)
  })
})
