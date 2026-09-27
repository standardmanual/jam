'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import BadgeRevealOverlay from '@/components/BadgeRevealOverlay'
import { useToast } from '@/components/ui/Toast'
import { d } from '@/lib/i18n'
import { DEMO_SYNC_REVEAL_BADGE } from '@/lib/onboarding-quest/demo-data'

/** 연출용 동기화 진행 장면 길이(ms) — 채원 판정 "약 0.9~1.2초" 범위 안의 고정값 */
const SYNC_ANIMATION_MS = 1000

/**
 * 온보딩 퀘스트 1단계(첫 동기화) 연출 (티켓 20260927_2125, 상위 20260927_2123 T2b)
 *
 * 실제 `/api/strava/sync`는 부르지 않는다. 「동기화」를 누르면 버튼 스피너가 짧게 돈 뒤
 * `BadgeRevealOverlay`가 연출 배지 1장으로 열린다(`SyncButton`과 같은 패턴 — 대기 표현은
 * 버튼 스피너가 맡고 오버레이는 `loading` 없이 결과가 있는 채로 연다). 오버레이를 닫으면
 * `POST /api/onboarding-quest/step`으로 `sync` 완료를 기록하고, 성공하면 `router.refresh()`로
 * 서버 컴포넌트(page.tsx)가 2단계를 다시 계산하게 한다.
 */
export default function SyncStep() {
  const [loading, setLoading] = useState(false)
  const [revealOpen, setRevealOpen] = useState(false)
  const router = useRouter()
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
      const res = await fetch('/api/onboarding-quest/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'sync' }),
      })
      if (!res.ok) {
        toast(d.onboardingQuest.syncStepSaveFailed, 'error')
        return
      }
      router.refresh()
    } catch {
      toast(d.common.networkError, 'error')
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
