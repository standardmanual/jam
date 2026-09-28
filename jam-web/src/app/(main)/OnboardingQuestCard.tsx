'use client'

import { useRouter } from 'next/navigation'
import { Card } from '@ds/components/cards/Card'
import { ProgressBar } from '@ds/components/feedback/ProgressBar'
import { ChevronRightIcon, HourglassIcon } from '@/components/ui/icons'
import Button from '@/components/ui/Button'
import SyncButton from '@/components/SyncButton'
import { d } from '@/lib/i18n'
import { ONBOARDING_QUEST_STEPS, STEP_SCREEN_MAP, type OnboardingQuestScreen } from '@/lib/onboarding-quest/config'
import type { OnboardingQuestCardState } from '@/lib/onboarding-quest/status'
import OnboardingQuestSkipSheet from './OnboardingQuestSkipSheet'
import OnboardingSyncButton from './OnboardingSyncButton'
import QuestStartTracker from './QuestStartTracker'

/**
 * 온보딩 퀘스트 홈 카드 (티켓 20260927_2133, 상위 20260927_2123 T1b · 경로 변경 20260928_0136 ·
 * 보상 문구 제거·CTA 버튼화 20260928_1537).
 *
 * 채원 사전 판정 — 재사용. 신규 컴포넌트·신규 토큰 없이 Card(tone="inverse")·ProgressBar·
 * icons.tsx·서비스 Button만으로 조립한다. 칩 마크업은 TodayStatusStrip의 CellLabel·
 * TodayCardStack의 TemplateChip과 같은 인라인 클래스를 세 번째로 복제한다 — 공용화는 별도
 * 티켓(승격 후보).
 *
 * ②·③ 상태는 카드 전체가 더 이상 `<Link>`가 아니다 — CTA 버튼만 인터랙티브다. `<a>` 안에
 * `<button>`을 두는 중첩 인터랙티브 요소를 피하기 위한 결정(채원 사전 판정, MissionCard와
 * 같은 "Card는 비클릭, Button만 액션" 패턴). onClick은 TopNav.tsx가 이미 쓰는 두 패턴을
 * 그대로 재사용한다: 화면 이동은 `router.push`(TopNav.tsx의 `/voc` 이동과 동일), Strava
 * 연동 이동은 `window.location.href = '/api/strava/auth'`(TopNav.tsx와 동일 코드).
 *
 * 별도 퀘스트 화면(N2)이 삭제되면서 [다음 단계]는 N1(`screen-gate.ts`)의 단계→화면
 * 지도(`STEP_SCREEN_MAP`)를 따라 실제 화면으로 이동한다. 화면→경로 1단계 매핑만 여기서
 * 새로 둔다 — 단계→화면 지도를 두 번째로 정의하지 않는다.
 */
const SCREEN_PATH_MAP: Record<OnboardingQuestScreen, string> = {
  home: '/',
  inventory: '/inventory',
  drops: '/drops',
  combine: '/combine',
  missions: '/missions',
}

const CARD_CLASS = 'flex flex-col gap-[var(--spacing-16)]'
// CTA 줄 — flex-col 카드의 기본 stretch가 버튼을 카드 폭으로 늘리지 않도록 가로 줄로 감싼다
const CTA_ROW_CLASS = 'flex'
// 「지금 눌러야 할 곳」 펄스 전용 변형(티켓 20260928_1752) — ①·② CTA 줄에만 쓴다.
// CTA_ROW_CLASS 자체를 고치면 ③·④(Strava 동기화하기·첫 활동 대기)에도 펄스가 번지므로
// 별도 상수로 분리한다. rounded-pill은 버튼의 --radius-buttons(=--radius-pill)와 래퍼 반경을
// 맞춰 펄스 링이 버튼 실루엣과 어긋나지 않게 한다(채원 사전 판정). self-start가 없으면 이 줄 자체가
// 카드 폭으로 늘어나 펄스 링이 카드 폭 전체에 그려진다(티켓 20260928_2137).
const CTA_ROW_PULSE_CLASS = `${CTA_ROW_CLASS} self-start rounded-[var(--radius-pill)] jam-quest-pulse`
const CHIP_CLASS =
  'self-start inline-flex items-center text-[length:var(--text-caption)] leading-none font-bold uppercase px-2.5 py-1.5 rounded-[var(--radius-tags)] bg-surface text-text'
const CHIP_ROW_CLASS = 'flex items-center justify-between'
// ProgressBar.jsx의 fraction 라벨 인라인 스타일(fontSize: var(--text-small); fontWeight:700;
// color: var(--color-primary))을 그대로 복제한 클래스 — 새 토큰이 아니라 배치만 칩 줄로 옮긴다.
const PROGRESS_LABEL_CLASS = 'text-[length:var(--text-small)] font-bold text-primary [font-variant-numeric:tabular-nums]'
const TITLE_CLASS = 'text-[length:var(--text-body)] leading-[var(--leading-body)] font-bold break-words [overflow-wrap:anywhere]'
const DESC_CLASS = 'text-[length:var(--text-small)] text-text-secondary break-words [overflow-wrap:anywhere]'

function Chip() {
  return <span className={CHIP_CLASS}>{d.onboardingQuest.chipLabel}</span>
}

interface Props {
  state: OnboardingQuestCardState
  /** 첫 활동 대기 카드(④)의 실제 Strava 동기화 버튼(`SyncButton`)에 넘길 프로필 링크 값 */
  username?: string | null
}

export default function OnboardingQuestCard({ state, username = null }: Props) {
  const router = useRouter()

  if (!state) return null

  if (state.kind === 'in_progress') {
    const step = d.onboardingQuest.steps[state.nextStep]
    const ctaLabel = state.done === 0 ? d.onboardingQuest.startButton : d.onboardingQuest.continueButton

    const body = (
      <>
        <div className={CHIP_ROW_CLASS}>
          <Chip />
          <span className={PROGRESS_LABEL_CLASS}>
            {state.done}/{state.total}
          </span>
        </div>
        <ProgressBar current={state.done} total={state.total} labelType="none" />
        <div className="flex flex-col gap-[var(--spacing-8)]">
          <p className={TITLE_CLASS}>{step.title}</p>
          <p className={DESC_CLASS}>{step.description}</p>
        </div>
      </>
    )

    // 건너뛰기 진입점(티켓 20260927_2131 T8, 채원 사전 판정) — Card 바깥의 형제 요소로
    // 뺀다. in_progress 모든 단계(sync 포함)에서 보이고, awaiting_sync에는 없다.
    // GA4 onboarding_quest_skip 이벤트에 실릴 단계 키(nextStep)를 함께 넘긴다(티켓 20260927_2132).
    const skipTrigger = <OnboardingQuestSkipSheet step={state.nextStep} />

    // GA4 onboarding_quest_start 계측 — 0/7(첫 렌더)이고 관리자 미리보기가 아닐 때만 마운트
    // (사용자 결정 2, 티켓 20260927_2132). nextStep==='sync'일 때만 done===0이 될 수 있다.
    const startTracker = state.done === 0 && !state.preview ? <QuestStartTracker /> : null

    // sync 차례: 카드 CTA가 상단 바 연출 동기화 버튼과 똑같이 동작한다(결정 3-①,
    // 2026-09-28). 표시 방식만 다른 같은 컴포넌트를 재사용한다.
    if (state.nextStep === 'sync') {
      return (
        <div className="flex flex-col gap-[var(--spacing-8)]">
          {startTracker}
          <Card tone="inverse" className={CARD_CLASS}>
            {body}
            <div className={CTA_ROW_PULSE_CLASS}>
              <OnboardingSyncButton appearance="card" />
            </div>
          </Card>
          {skipTrigger}
        </div>
      )
    }

    const screen = STEP_SCREEN_MAP[state.nextStep]
    return (
      <div className="flex flex-col gap-[var(--spacing-8)]">
        <Card tone="inverse" className={CARD_CLASS}>
          {body}
          <div className={CTA_ROW_PULSE_CLASS}>
            <Button
              variant="primary"
              surface="sub"
              size="xs"
              onClick={() => router.push(SCREEN_PATH_MAP[screen])}
            >
              <span>{ctaLabel}</span>
              <ChevronRightIcon className="w-4 h-4" />
            </Button>
          </div>
        </Card>
        {skipTrigger}
      </div>
    )
  }

  // kind === 'awaiting_sync'
  if (!state.stravaConnected) {
    return (
      <Card tone="inverse" className={CARD_CLASS}>
        <div className={CHIP_ROW_CLASS}>
          <Chip />
          <span className={PROGRESS_LABEL_CLASS}>
            {ONBOARDING_QUEST_STEPS.length}/{ONBOARDING_QUEST_STEPS.length}
          </span>
        </div>
        <ProgressBar
          current={ONBOARDING_QUEST_STEPS.length}
          total={ONBOARDING_QUEST_STEPS.length}
          labelType="none"
        />
        <div className="flex flex-col gap-[var(--spacing-8)]">
          <p className={TITLE_CLASS}>{d.onboardingQuest.lastStep.title}</p>
          <p className={DESC_CLASS}>{d.onboardingQuest.lastStep.description}</p>
        </div>
        <div className={CTA_ROW_CLASS}>
          <Button
            variant="primary"
            surface="sub"
            size="xs"
            onClick={() => {
              window.location.href = '/api/strava/auth'
            }}
          >
            {d.onboardingQuest.lastStep.cta}
          </Button>
        </div>
      </Card>
    )
  }

  // Strava 동기화됨 · 첫 활동 대기 — 카드 자체는 비클릭, 실 동기화 버튼만 액션이다
  const copy = state.skipped ? d.onboardingQuest.awaitingActivitySkipped : d.onboardingQuest.awaitingActivity
  return (
    <Card tone="inverse" className={CARD_CLASS}>
      <Chip />
      <div className="flex items-start gap-[var(--spacing-8)]">
        <span className="text-text-inverse/60 shrink-0">
          <HourglassIcon className="w-6 h-6" />
        </span>
        <div className="flex flex-col gap-[var(--spacing-8)]">
          <p className={TITLE_CLASS}>{copy.title}</p>
          <p className={DESC_CLASS}>{copy.description}</p>
        </div>
      </div>
      <div className={CTA_ROW_CLASS}>
        <SyncButton username={username} appearance="card" />
      </div>
    </Card>
  )
}
