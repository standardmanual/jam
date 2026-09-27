import Link from 'next/link'
import { Card } from '@ds/components/cards/Card'
import { ProgressBar } from '@ds/components/feedback/ProgressBar'
import { ChevronRightIcon, HourglassIcon } from '@/components/ui/icons'
import { d } from '@/lib/i18n'
import { ONBOARDING_QUEST_STEPS } from '@/lib/onboarding-quest/config'
import { STEP_SCREEN_MAP, type OnboardingQuestScreen } from '@/lib/onboarding-quest/screen-gate'
import type { OnboardingQuestCardState } from '@/lib/onboarding-quest/status'

/**
 * 온보딩 퀘스트 홈 카드 (티켓 20260927_2133, 상위 20260927_2123 T1b · 경로 변경 20260928_0136).
 *
 * 채원 사전 판정 — 재사용. 신규 컴포넌트·신규 토큰 없이 Card(tone="inverse")·ProgressBar·
 * icons.tsx만으로 조립한다. 칩 마크업은 TodayStatusStrip의 CellLabel·TodayCardStack의
 * TemplateChip과 같은 인라인 클래스를 세 번째로 복제한다 — 공용화는 별도 티켓(승격 후보).
 *
 * 별도 퀘스트 화면(N2)이 삭제되면서 [이어 하기]는 N1(`screen-gate.ts`)의 단계→화면
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
const CHIP_CLASS =
  'self-start inline-flex items-center text-[length:var(--text-caption)] leading-none font-bold uppercase px-2.5 py-1.5 rounded-[var(--radius-tags)] bg-surface text-text'
const TITLE_CLASS = 'text-[length:var(--text-body)] leading-[var(--leading-body)] font-bold break-words [overflow-wrap:anywhere]'
const DESC_CLASS = 'text-[length:var(--text-small)] text-text-secondary break-words [overflow-wrap:anywhere]'
const CTA_CLASS = 'flex items-center gap-[var(--spacing-4)] text-[length:var(--text-body-sm)] font-bold text-primary'
const LINK_CLASS = 'block active:scale-[0.98] transition-transform duration-100'

function Chip() {
  return <span className={CHIP_CLASS}>{d.onboardingQuest.chipLabel}</span>
}

interface Props {
  state: OnboardingQuestCardState
}

export default function OnboardingQuestCard({ state }: Props) {
  if (!state) return null

  if (state.kind === 'in_progress') {
    const step = d.onboardingQuest.steps[state.nextStep]
    const ctaLabel = state.done === 0 ? d.onboardingQuest.startButton : d.onboardingQuest.continueButton

    const body = (
      <>
        <Chip />
        <div className="flex flex-col gap-[var(--spacing-8)]">
          <p className={TITLE_CLASS}>{step.title}</p>
          <p className={DESC_CLASS}>{step.description}</p>
        </div>
        <ProgressBar current={state.done} total={state.total} labelType="fraction" labelPosition="top" />
        <p className={DESC_CLASS}>{d.onboardingQuest.rewardHint}</p>
      </>
    )

    // sync 차례: 동기화 버튼은 이미 같은 화면(TopNav) 위에 있어 카드를 눌러도 이동할 곳이
    // 없다. 링크 없는 안내 카드로 위치만 알린다(결정 20, 채원 사전 판정 B).
    if (state.nextStep === 'sync') {
      return (
        <Card tone="inverse" className={CARD_CLASS}>
          {body}
          <p className={DESC_CLASS}>{d.onboardingQuest.steps.sync.locationHint}</p>
        </Card>
      )
    }

    const screen = STEP_SCREEN_MAP[state.nextStep]
    return (
      <Link href={SCREEN_PATH_MAP[screen]} className={LINK_CLASS}>
        <Card tone="inverse" className={CARD_CLASS}>
          {body}
          <div className={CTA_CLASS}>
            <span>{ctaLabel}</span>
            <ChevronRightIcon className="w-4 h-4" />
          </div>
        </Card>
      </Link>
    )
  }

  // kind === 'awaiting_sync'
  if (!state.stravaConnected) {
    return (
      <Link href="/api/strava/auth" className={LINK_CLASS}>
        <Card tone="inverse" className={CARD_CLASS}>
          <Chip />
          <ProgressBar
            current={ONBOARDING_QUEST_STEPS.length}
            total={ONBOARDING_QUEST_STEPS.length}
            labelType="fraction"
            labelPosition="top"
          />
          <div className="flex flex-col gap-[var(--spacing-8)]">
            <p className={TITLE_CLASS}>{d.onboardingQuest.lastStep.title}</p>
            <p className={DESC_CLASS}>{d.onboardingQuest.lastStep.description}</p>
          </div>
          <div className={CTA_CLASS}>
            <span>{d.onboardingQuest.lastStep.cta}</span>
            <ChevronRightIcon className="w-4 h-4" />
          </div>
        </Card>
      </Link>
    )
  }

  // Strava 동기화됨 · 첫 활동 대기 — 비클릭 카드
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
    </Card>
  )
}
