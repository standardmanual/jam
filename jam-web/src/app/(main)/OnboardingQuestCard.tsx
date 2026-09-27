import Link from 'next/link'
import { Card } from '@ds/components/cards/Card'
import { ProgressBar } from '@ds/components/feedback/ProgressBar'
import { ChevronRightIcon, HourglassIcon } from '@/components/ui/icons'
import { d } from '@/lib/i18n'
import { ONBOARDING_QUEST_STEPS } from '@/lib/onboarding-quest/config'
import type { OnboardingQuestCardState } from '@/lib/onboarding-quest/status'

/**
 * 온보딩 퀘스트 홈 카드 (티켓 20260927_2133, 상위 20260927_2123 T1b).
 *
 * 채원 사전 판정 — 재사용. 신규 컴포넌트·신규 토큰 없이 Card(tone="inverse")·ProgressBar·
 * icons.tsx만으로 조립한다. 칩 마크업은 TodayStatusStrip의 CellLabel·TodayCardStack의
 * TemplateChip과 같은 인라인 클래스를 세 번째로 복제한다 — 공용화는 별도 티켓(승격 후보).
 *
 * 실제 퀘스트 화면은 T2에서 만든다. 아래 경로 상수는 이 티켓에서 값만 정해 둔다.
 */
export const ONBOARDING_QUEST_PATH = '/onboarding-quest'

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

    return (
      <Link href={ONBOARDING_QUEST_PATH} className={LINK_CLASS}>
        <Card tone="inverse" className={CARD_CLASS}>
          <Chip />
          <div className="flex flex-col gap-[var(--spacing-8)]">
            <p className={TITLE_CLASS}>{step.title}</p>
            <p className={DESC_CLASS}>{step.description}</p>
          </div>
          <ProgressBar current={state.done} total={state.total} labelType="fraction" labelPosition="top" />
          <p className={DESC_CLASS}>{d.onboardingQuest.rewardHint}</p>
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
        <span className="text-text-inverse/60 opacity-50 shrink-0">
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
