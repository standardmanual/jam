'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomSheet from '@/components/ui/BottomSheet'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { d } from '@/lib/i18n'
import { trackQuestSkip } from '@/lib/onboarding-quest/analytics'
import type { OnboardingQuestStepKey } from '@/types/database'

interface OnboardingQuestSkipSheetProps {
  /** 건너뛴 시점의 다음 단계 키(`OnboardingQuestCard.tsx`가 `state.nextStep`을 넘긴다) —
   *  GA4 onboarding_quest_skip 이벤트 파라미터로 쓴다(티켓 20260927_2132). */
  step: OnboardingQuestStepKey
}

/**
 * 홈 카드 「미리 해보기 건너뛰기」 진입점 + 확인 시트 (티켓 20260927_2131 T8, 상위 20260927_2123 · 문구 20261021_1248 2회).
 * 건너뛰는 것은 연출 7단계뿐이다 — 실제 2단계(내 활동으로)는 건너뛰지 않고, 마치면 건너뛴 유저도 챕터 1을 받는다.
 *
 * 채원 사전 판정 — 재사용. 새 컴포넌트·새 토큰 없이 서비스 BottomSheet(`detent="compact"`)와
 * Button 조합만으로 [계속하기]/[건너뛰기] 선택을 보여 준다(`BadgeDetailSheet.tsx`·
 * `PoiCarouselModal.tsx`의 확정 시트와 같은 버튼 배치 — 취소류 왼쪽 outline, 확정류 오른쪽
 * primary). [건너뛰기] → `POST /api/onboarding-quest/skip` → 성공 시 시트를 닫고
 * `router.refresh()`로 카드가 실제 연동 단계를 가리키도록 전환한다. 실패는 저장 실패
 * 토스트를 보여주고 시트는 유지한다(재시도 유도).
 */
export default function OnboardingQuestSkipSheet({ step }: OnboardingQuestSkipSheetProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  async function handleSkip() {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/onboarding-quest/skip', { method: 'POST' })
      if (!res.ok) throw new Error('SKIP_FAILED')
      const data = (await res.json()) as { preview?: boolean }
      trackQuestSkip(step, data)
      setOpen(false)
      router.refresh()
    } catch {
      toast(d.onboardingQuest.skip.saveFailed, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="self-start min-h-11 flex items-center text-xs text-muted break-keep wrap-break-word whitespace-nowrap active:opacity-60"
        onClick={() => setOpen(true)}
      >
        {d.onboardingQuest.skip.entryLabel}
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        detent="compact"
        footer={
          <div className="flex gap-4">
            <Button fullWidth variant="secondary" surface="main" onClick={() => setOpen(false)} disabled={loading}>
              {d.onboardingQuest.skip.keepGoingButton}
            </Button>
            <Button fullWidth surface="main" loading={loading} onClick={handleSkip}>
              {d.onboardingQuest.skip.skipButton}
            </Button>
          </div>
        }
      >
        <p className="text-center text-base text-foreground break-keep wrap-break-word text-pretty px-4 py-6">
          {d.onboardingQuest.skip.confirmBody}
        </p>
      </BottomSheet>
    </>
  )
}
