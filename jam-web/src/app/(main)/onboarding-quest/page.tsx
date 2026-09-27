import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import TopNav from '@/components/ui/TopNav'
import { d } from '@/lib/i18n'
import { ONBOARDING_QUEST_ENABLED, ONBOARDING_QUEST_STEPS } from '@/lib/onboarding-quest/config'
import { nextStepOf } from '@/lib/onboarding-quest/progress'
import StepRunner from './StepRunner'
import { STEP_COMPONENTS } from './step-components'
import type { OnboardingQuestStepKey } from '@/types/database'

/**
 * 온보딩 퀘스트 전용 화면 뼈대 (티켓 20260927_2330, 상위 20260927_2123 T2a).
 *
 * 채원 사전 판정 — 재사용. 상단 바는 홈과 같은 TopNav `logo` 모드를 표시 전용(`decorative`)
 * 으로 쓴다. 헤더 텍스트는 신규 컴포넌트 없이 플레인 마크업 + 토큰 클래스, 좌측 정렬.
 * 단계 부품 자리는 `step-components.ts`의 `STEP_COMPONENTS`가 있는 단계(1~2단계, T2b)만
 * 채우고 나머지는 빈 컨테이너로 남긴다(부품 선택은 각 T2b 티켓의 몫). 관리자 미리보기
 * (`preview/QuestPreviewClient.tsx`, 티켓 20260928_0058)도 같은 매핑을 공유한다.
 *
 * 대상 판정 — 아래 중 하나라도 해당하면 렌더링 없이 홈으로 보낸다:
 * 스위치 꺼짐 · 행 없음 · 건너뜀(skipped_at) · 7단계 완료(다음 단계 없음).
 * 조회 실패도 에러 화면 없이 홈으로 보내고 콘솔에만 남긴다.
 */
export default async function OnboardingQuestPage() {
  if (!ONBOARDING_QUEST_ENABLED) redirect('/')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const service = createServiceClient()
  const { data: row, error } = await service
    .from('user_onboarding_quests')
    .select('step_progress, skipped_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('[onboarding-quest/page] user_onboarding_quests 조회 실패', error)
    redirect('/')
  }

  if (!row || row.skipped_at) redirect('/')

  const progress = (row.step_progress ?? {}) as Partial<Record<OnboardingQuestStepKey, string>>
  const step = nextStepOf(progress)

  if (!step) redirect('/')

  const stepNumber = ONBOARDING_QUEST_STEPS.indexOf(step) + 1
  const total = ONBOARDING_QUEST_STEPS.length
  const copy = d.onboardingQuest.steps[step]
  const StepComponent = STEP_COMPONENTS[step]

  return (
    <div className="min-h-full text-text">
      {/* 표시 전용 — 로고·동기화 버튼·아바타 모양은 홈과 같지만 눌러도 동작하지 않는다 */}
      <TopNav logo decorative />

      <div className="px-[var(--spacing-24)] pt-[var(--spacing-24)] flex flex-col gap-[var(--spacing-8)]">
        <p className="text-[length:var(--text-caption)] text-text-secondary tabular-nums">
          {stepNumber} / {total}
        </p>
        <h1 className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)] font-bold break-words [overflow-wrap:anywhere]">
          {copy.title}
        </h1>
        <p className="text-[length:var(--text-body)] leading-[var(--leading-body)] text-text-secondary break-words [overflow-wrap:anywhere]">
          {copy.description}
        </p>
      </div>

      {/* 단계 부품 자리 — 매핑에 없는 단계(3~7단계)는 빈 컨테이너로 남는다 */}
      <div className="px-[var(--spacing-24)] mt-[var(--spacing-32)]" data-step={step}>
        {StepComponent ? <StepRunner step={step} StepComponent={StepComponent} /> : null}
      </div>
    </div>
  )
}
