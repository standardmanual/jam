'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomSheet from '@/components/ui/BottomSheet'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { d } from '@/lib/i18n'

/**
 * 홈 카드 「건너뛰기」 진입점 + 확인 시트 (티켓 20260927_2131 T8, 상위 20260927_2123).
 *
 * 채원 사전 판정 — 재사용. 새 컴포넌트·새 토큰 없이 서비스 BottomSheet(`detent="compact"`)와
 * Button 조합만으로 [계속하기]/[건너뛰기] 선택을 보여 준다(`BadgeDetailSheet.tsx`·
 * `PoiCarouselModal.tsx`의 확정 시트와 같은 버튼 배치 — 취소류 왼쪽 outline, 확정류 오른쪽
 * primary). [건너뛰기] → `POST /api/onboarding-quest/skip` → 성공 시 시트를 닫고
 * `router.refresh()`로 카드가 실제 연동 단계를 가리키도록 전환한다. 실패는 저장 실패
 * 토스트를 보여주고 시트는 유지한다(재시도 유도).
 */
export default function OnboardingQuestSkipSheet() {
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
        className="self-start min-h-11 flex items-center text-[length:var(--text-caption)] text-text-secondary active:opacity-60"
        onClick={() => setOpen(true)}
      >
        {d.onboardingQuest.skip.entryLabel}
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        detent="compact"
        footer={
          <div className="flex gap-[var(--spacing-16)]">
            <Button fullWidth variant="outline" surface="main" onClick={() => setOpen(false)} disabled={loading}>
              {d.onboardingQuest.skip.keepGoingButton}
            </Button>
            <Button fullWidth surface="main" loading={loading} onClick={handleSkip}>
              {d.onboardingQuest.skip.skipButton}
            </Button>
          </div>
        }
      >
        <p className="text-center text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text px-[var(--spacing-16)] py-[var(--spacing-24)]">
          {d.onboardingQuest.skip.confirmBody}
        </p>
      </BottomSheet>
    </>
  )
}
