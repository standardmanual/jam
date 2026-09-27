'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import TopNav from '@/components/ui/TopNav'
import { d } from '@/lib/i18n'
import { ONBOARDING_QUEST_STEPS } from '@/lib/onboarding-quest/config'
import { nextPreviewIndex, isPreviewDone, resetPreviewIndex } from '@/lib/onboarding-quest/preview'
import { STEP_COMPONENTS } from '../step-components'

/**
 * 온보딩 퀘스트 관리자 미리보기 화면 (티켓 20260928_0058, 상위 20260927_2123).
 *
 * 채원 사전 판정 — 재사용. 실제 화면(`page.tsx`)과 같은 `TopNav`·헤더 마크업·단계 부품을
 * 그대로 쓰되, 진행은 화면 안 상태(`index`)로만 두고 DB에 아무것도 쓰지 않는다(새로고침하면
 * 항상 1단계부터). 부품이 아직 없는 단계(3~7단계)는 빈 자리 + 「다음 단계」 버튼으로 넘긴다.
 */
export default function QuestPreviewClient() {
  const [index, setIndex] = useState(0)

  function handleNext() {
    setIndex((current) => nextPreviewIndex(current))
  }

  function handleRestart() {
    setIndex(resetPreviewIndex())
  }

  const done = isPreviewDone(index)
  const step = done ? null : ONBOARDING_QUEST_STEPS[index]
  const StepComponent = step ? STEP_COMPONENTS[step] : undefined

  return (
    <div className="min-h-full text-text">
      {/* 표시 전용 — 실제 화면과 같은 TopNav */}
      <TopNav logo decorative />

      <div className="px-[var(--spacing-24)] pt-[var(--spacing-24)] flex flex-col gap-[var(--spacing-8)]">
        <div className="flex items-center justify-between gap-[var(--spacing-8)]">
          <p className="text-[length:var(--text-caption)] text-text-secondary">관리자 미리보기</p>
          {!done ? (
            <Button variant="outline" surface="sub" size="sm" onClick={handleRestart}>
              처음부터 다시
            </Button>
          ) : null}
        </div>

        {!done && step ? (
          <>
            <p className="text-[length:var(--text-caption)] text-text-secondary tabular-nums">
              {index + 1} / {ONBOARDING_QUEST_STEPS.length}
            </p>
            <h1 className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)] font-bold break-words [overflow-wrap:anywhere]">
              {d.onboardingQuest.steps[step].title}
            </h1>
            <p className="text-[length:var(--text-body)] leading-[var(--leading-body)] text-text-secondary break-words [overflow-wrap:anywhere]">
              {d.onboardingQuest.steps[step].description}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)] font-bold">
              미리보기 끝
            </h1>
            <p className="text-[length:var(--text-body)] leading-[var(--leading-body)] text-text-secondary">
              모든 단계를 확인했어요.
            </p>
          </>
        )}
      </div>

      <div className="px-[var(--spacing-24)] mt-[var(--spacing-32)]" data-step={step ?? undefined}>
        {!done ? (
          StepComponent ? (
            <StepComponent onComplete={async () => handleNext()} />
          ) : (
            <div className="bg-surface-elevated px-[var(--spacing-24)] py-[var(--spacing-24)] flex flex-col gap-[var(--spacing-8)]">
              <p className="text-[length:var(--text-caption)] text-text-secondary">
                이 단계는 아직 화면이 없어요
              </p>
              <Button variant="outline" surface="sub" size="sm" onClick={handleNext}>
                다음 단계
              </Button>
            </div>
          )
        ) : (
          <Button variant="outline" surface="sub" size="sm" onClick={handleRestart}>
            처음부터 다시
          </Button>
        )}
      </div>
    </div>
  )
}
