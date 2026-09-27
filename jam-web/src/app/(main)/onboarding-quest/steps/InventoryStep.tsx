'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import InventoryGrid from '@/components/inventory/InventoryGrid'
import { useToast } from '@/components/ui/Toast'
import { d } from '@/lib/i18n'
import { DEMO_INVENTORY_ITEM } from '@/lib/onboarding-quest/demo-data'

/**
 * 온보딩 퀘스트 2단계(인벤토리) 연출 (티켓 20260927_2125, 상위 20260927_2123 T2b)
 *
 * 실제 `/inventory` 화면과 같은 `InventoryGrid`를 연출 데이터 1개 + 빈 슬롯 5개(2행 3열,
 * 실제 `/inventory/page.tsx` L114 밀도)로 재사용한다. 배지를 누르면
 * `POST /api/onboarding-quest/step`으로 `bag` 완료를 기록하고, 성공하면 `router.refresh()`로
 * 서버 컴포넌트(page.tsx)가 다음 단계를 다시 계산하게 한다.
 */
export default function InventoryStep() {
  const [pending, setPending] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  async function handleSelect() {
    if (pending) return // 처리 중 중복 탭 무시
    setPending(true)
    try {
      const res = await fetch('/api/onboarding-quest/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'bag' }),
      })
      if (!res.ok) {
        toast(d.onboardingQuest.bagStepSaveFailed, 'error')
        return
      }
      router.refresh()
    } catch {
      toast(d.common.networkError, 'error')
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
