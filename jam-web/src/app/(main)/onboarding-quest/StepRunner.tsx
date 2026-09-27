'use client'

import { useRouter } from 'next/navigation'
import type { ComponentType } from 'react'
import type { OnboardingQuestStepKey } from '@/types/database'
import { StepSaveFailedError } from '@/lib/onboarding-quest/step-error'

/** 단계 부품(`SyncStep`·`InventoryStep` 등)이 공통으로 받는 완료 콜백 prop (티켓 20260928_0058). */
export interface OnboardingQuestStepProps {
  onComplete: () => Promise<void>
}

interface StepRunnerProps {
  step: OnboardingQuestStepKey
  StepComponent: ComponentType<OnboardingQuestStepProps>
}

/**
 * 실제 온보딩 퀘스트 화면(`page.tsx`) 전용 — 단계 부품에 "API 기록 + `router.refresh()`"
 * 콜백을 연결하는 작은 클라이언트 래퍼(티켓 20260928_0058). `page.tsx`는 서버 컴포넌트라
 * `useRouter`를 쓸 수 없어 이 래퍼가 그 자리를 대신한다.
 *
 * 관리자 미리보기(`preview/QuestPreviewClient.tsx`)는 이 래퍼를 쓰지 않고, 화면 안 상태만
 * 넘기는 콜백을 단계 부품에 직접 연결한다(DB에 쓰지 않는다는 요구사항).
 */
export default function StepRunner({ step, StepComponent }: StepRunnerProps) {
  const router = useRouter()

  async function handleComplete() {
    const res = await fetch('/api/onboarding-quest/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step }),
    })
    if (!res.ok) throw new StepSaveFailedError()
    router.refresh()
  }

  return <StepComponent onComplete={handleComplete} />
}
