'use client'

import { useState } from 'react'
import InventoryGrid from '@/components/inventory/InventoryGrid'
import { useToast } from '@/components/ui/Toast'
import { d } from '@/lib/i18n'
import { DEMO_INVENTORY_ITEM } from '@/lib/onboarding-quest/demo-data'
import { StepSaveFailedError } from '@/lib/onboarding-quest/step-error'
import type { OnboardingQuestStepProps } from '../StepRunner'

/**
 * 온보딩 퀘스트 2단계(인벤토리) 연출 (티켓 20260927_2125, 상위 20260927_2123 T2b)
 *
 * 실제 `/inventory` 화면과 같은 `InventoryGrid`를 연출 데이터 1개 + 빈 슬롯 5개(2행 3열,
 * 실제 `/inventory/page.tsx` L114 밀도)로 재사용한다. 배지를 누르면 `onComplete`를 부른다 —
 * 실제 화면(`page.tsx`)은 `StepRunner`를 통해 API 기록 + `router.refresh()`를 넘기고,
 * 관리자 미리보기는 화면 안 상태만 다음 단계로 넘기는 콜백을 넘긴다(티켓 20260928_0058).
 * 콜백이 `StepSaveFailedError`를 던지면 저장 실패 토스트를, 그 외 예외(네트워크 오류)면
 * 공통 네트워크 오류 토스트를 보여 기존 동작을 그대로 유지한다.
 */
export default function InventoryStep({ onComplete }: OnboardingQuestStepProps) {
  const [pending, setPending] = useState(false)
  const { toast } = useToast()

  async function handleSelect() {
    if (pending) return // 처리 중 중복 탭 무시
    setPending(true)
    try {
      await onComplete()
    } catch (err) {
      if (err instanceof StepSaveFailedError) {
        toast(d.onboardingQuest.bagStepSaveFailed, 'error')
      } else {
        toast(d.common.networkError, 'error')
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-[var(--spacing-8)]">
      <p className="text-[length:var(--text-caption)] text-text-secondary">
        {d.onboardingQuest.steps.bag.locationHint}
      </p>

      <InventoryGrid mode="select" items={[DEMO_INVENTORY_ITEM]} onSelect={handleSelect} emptySlots={5} />

      <p className="text-[length:var(--text-caption)] text-text-secondary">
        {d.onboardingQuest.demoBadgeNotice}
      </p>
    </div>
  )
}
