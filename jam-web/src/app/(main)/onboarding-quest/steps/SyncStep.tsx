'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import BadgeRevealOverlay from '@/components/BadgeRevealOverlay'
import { useToast } from '@/components/ui/Toast'
import { d } from '@/lib/i18n'
import { DEMO_SYNC_REVEAL_BADGE } from '@/lib/onboarding-quest/demo-data'
import { StepSaveFailedError } from '@/lib/onboarding-quest/step-error'
import type { OnboardingQuestStepProps } from '../StepRunner'

/** 연출용 동기화 진행 장면 길이(ms) — 채원 판정 "약 0.9~1.2초" 범위 안의 고정값 */
const SYNC_ANIMATION_MS = 1000

/**
 * 온보딩 퀘스트 1단계(첫 동기화) 연출 (티켓 20260927_2125, 상위 20260927_2123 T2b)
 *
 * 실제 `/api/strava/sync`는 부르지 않는다. 「동기화」를 누르면 버튼 스피너가 짧게 돈 뒤
 * `BadgeRevealOverlay`가 연출 배지 1장으로 열린다(`SyncButton`과 같은 패턴 — 대기 표현은
 * 버튼 스피너가 맡고 오버레이는 `loading` 없이 결과가 있는 채로 연다). 오버레이를 닫으면
 * `onComplete`를 부른다 — 실제 화면(`page.tsx`)은 `StepRunner`를 통해 API 기록 +
 * `router.refresh()`를 넘기고, 관리자 미리보기는 화면 안 상태만 다음 단계로 넘기는 콜백을
 * 넘긴다(티켓 20260928_0058). 콜백이 `StepSaveFailedError`를 던지면 저장 실패 토스트를,
 * 그 외 예외(네트워크 오류)면 공통 네트워크 오류 토스트를 보여 기존 동작을 그대로 유지한다.
 */
export default function SyncStep({ onComplete }: OnboardingQuestStepProps) {
  const [loading, setLoading] = useState(false)
  const [revealOpen, setRevealOpen] = useState(false)
  const { toast } = useToast()

  function handleSync() {
    if (loading || revealOpen) return
    setLoading(true)
    window.setTimeout(() => {
      setLoading(false)
      setRevealOpen(true)
    }, SYNC_ANIMATION_MS)
  }

  async function handleRevealClose() {
    setRevealOpen(false)
    try {
      await onComplete()
    } catch (err) {
      if (err instanceof StepSaveFailedError) {
        toast(d.onboardingQuest.syncStepSaveFailed, 'error')
      } else {
        toast(d.common.networkError, 'error')
      }
    }
  }

  return (
    <>
      <Button
        variant="outline"
        surface="sub"
        size="xs"
        style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-base-white)' }}
        onClick={handleSync}
        disabled={loading}
        loading={loading}
      >
        {d.today.syncButton}
      </Button>

      <BadgeRevealOverlay
        open={revealOpen}
        items={[DEMO_SYNC_REVEAL_BADGE]}
        moreCount={0}
        profileHref="/profile"
        onClose={handleRevealClose}
      />
    </>
  )
}
