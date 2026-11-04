'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'
import { d } from '@/lib/i18n'
import { trackQuestSkip } from '@/lib/onboarding-quest/analytics'
import type { OnboardingQuestStepKey } from '@/types/database'

interface OnboardingQuestSkipModalProps {
  /** 건너뛴 시점의 다음 단계 키(`OnboardingQuestCard.tsx`가 `state.nextStep`을 넘긴다) —
   *  GA4 onboarding_quest_skip 이벤트 파라미터로 쓴다(티켓 20260927_2132). */
  step: OnboardingQuestStepKey
}

/**
 * 홈 카드 「미리 해보기 건너뛰기」 진입 버튼 + 확인 모달 (티켓 20260927_2131 T8, 상위 20260927_2123 · 문구 20261021_1248 2회 ·
 * 카드 안 버튼과 가운데 모달로 변경 20261104_1810, 채원 사전 판정 2026-11-04).
 * 건너뛰는 것은 연출 7단계뿐이다 — 실제 2단계(내 활동으로)는 건너뛰지 않고, 마치면 건너뛴 유저도 챕터 1을 받는다.
 *
 * 진입은 카드 안 우측 아래의 보조 버튼(`Button` outline sm — 한 카드의 primary는 연출 CTA 하나라서 이 버튼은 primary가 아니다)이다.
 * 누르면 하단 시트가 아니라 화면 가운데의 `ConfirmModal`이 뜬다: [계속하기]는 닫기, [건너뛰기] → `POST /api/onboarding-quest/skip` →
 * 성공 시 모달을 닫고 `router.refresh()`로 카드가 실제 연동 단계를 가리키도록 전환한다. 실패는 저장 실패 토스트를 보여주고
 * 모달은 유지한다(재시도 유도).
 */
export default function OnboardingQuestSkipModal({ step }: OnboardingQuestSkipModalProps) {
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
      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="whitespace-nowrap break-keep" onClick={() => setOpen(true)}>
          {d.onboardingQuest.skip.entryLabel}
        </Button>
      </div>

      <ConfirmModal
        open={open}
        onClose={() => setOpen(false)}
        body={d.onboardingQuest.skip.confirmBody}
        cancelLabel={d.onboardingQuest.skip.keepGoingButton}
        confirmLabel={d.onboardingQuest.skip.skipButton}
        onConfirm={handleSkip}
        loading={loading}
      />
    </>
  )
}
