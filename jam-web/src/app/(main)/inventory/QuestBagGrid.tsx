'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import InventoryGrid, { InventoryGridItem } from '@/components/inventory/InventoryGrid'
import { useToast } from '@/components/ui/Toast'
import { d } from '@/lib/i18n'
import { DEMO_INVENTORY_ITEM } from '@/lib/onboarding-quest/demo-data'
import { StepSaveFailedError } from '@/lib/onboarding-quest/step-error'
import { trackQuestStepComplete } from '@/lib/onboarding-quest/analytics'

interface QuestBagGridProps {
  gridItems: InventoryGridItem[]
  emptySlots: number
}

/**
 * 실제 `/inventory` 화면에서 온보딩 퀘스트 `bag` 차례에만 쓰이는 클라이언트 래퍼
 * (티켓 20260928_0137, 상위 20260927_2123 T2b). 2026-09-28 사용자 선택에 따라 연출
 * 도토리(`DEMO_INVENTORY_ITEM`)를 별도 블록이 아니라 실제 `InventoryGrid`의 첫 칸에
 * 실제 아이템과 같은 모습(`leadingItem`)으로 섞는다. 나머지 실제 아이템은 기존
 * `mode="navigate"` 그대로 `/inventory/[id]`로 이동한다.
 *
 * 도토리를 누르면 `POST /api/onboarding-quest/step`({ step: 'bag' })으로 진행도를 기록한
 * 뒤 홈(`/`)으로 이동한다(결정 20). 실패 처리는 옛 `InventoryStep.tsx`(git show 1362e562)
 * L30-38과 같은 두 갈래 토스트 패턴을 그대로 옮겼다.
 */
export default function QuestBagGrid({ gridItems, emptySlots }: QuestBagGridProps) {
  const [pending, setPending] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  async function handleSelect() {
    if (pending) return // 처리 중 중복 탭 무시
    setPending(true)
    try {
      const res = await fetch('/api/onboarding-quest/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'bag' }),
      })
      if (!res.ok) throw new StepSaveFailedError()
      trackQuestStepComplete('bag', await res.json())
      router.push('/')
    } catch (err) {
      if (err instanceof StepSaveFailedError) {
        toast(d.onboardingQuest.bagStepSaveFailed, 'error')
      } else {
        toast(d.common.networkError, 'error')
      }
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-[var(--spacing-16)]">
      <InventoryGrid
        items={gridItems}
        mode="navigate"
        emptySlots={emptySlots}
        leadingItem={{ item: DEMO_INVENTORY_ITEM, onSelect: handleSelect, disabled: pending, pulse: true }}
      />
      <p className="text-[length:var(--text-caption)] text-text-secondary text-left">
        {d.onboardingQuest.demoBadgeNotice}
      </p>
    </div>
  )
}
