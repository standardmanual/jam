'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import BadgeRevealOverlay from '@/components/BadgeRevealOverlay'
import { useToast } from '@/components/ui/Toast'
import { d } from '@/lib/i18n'
import { DEMO_SYNC_REVEAL_BADGE } from '@/lib/onboarding-quest/demo-data'
import { StepSaveFailedError } from '@/lib/onboarding-quest/step-error'
import { trackQuestStepComplete } from '@/lib/onboarding-quest/analytics'

/** 연출용 동기화 진행 장면 길이(ms) — 옛 SyncStep.tsx와 동일한 고정값 */
const SYNC_ANIMATION_MS = 1000

/**
 * 홈 TopNav 중앙 슬롯 전용 — 온보딩 퀘스트 `sync` 차례일 때만 렌더되는 연출 동기화 버튼
 * (티켓 20260927_2331, 상위 20260927_2123 T2c).
 *
 * 실제 `/api/strava/sync`는 부르지 않는다. 「동기화」를 누르면 버튼 스피너가 짧게 돈 뒤
 * `BadgeRevealOverlay`가 연출 배지 1장으로 열린다(실제 `SyncButton`과 같은 시각 패턴).
 * 오버레이를 닫으면 `POST /api/onboarding-quest/step`({ step: 'sync' })으로 진행도를
 * 기록하고 `router.refresh()`한다 — 삭제된 `StepRunner.tsx`(git show 1362e562)의
 * onComplete 로직을 이 컴포넌트 안으로 직접 이식했다(전용 화면 폐기로 StepRunner도
 * 함께 삭제됐기 때문). 기록 실패(res.ok === false) 시 저장 실패 토스트를, 그 외 예외
 * (네트워크 오류)면 공통 네트워크 오류 토스트를 보여준다.
 *
 * 모양: 놓인 자리(TopNav 중앙 슬롯·온보딩 퀘스트 홈 카드)와 상관없이 primary(`--accent` 알약)다.
 * 한때 `appearance`(티켓 20260928_1537)로 nav·card를 갈랐지만 Button에 secondary·danger·outline이
 * 생겨 「outline + accent 인라인 덮어쓰기」가 필요 없어지면서 둘이 같아져 prop을 걷었다(티켓 20261015_2133).
 *
 * 크기: 기본은 `xs`(상단 바 중앙 슬롯). 홈 카드 안에서는 44px 터치 영역이 필요해 `sm`을 넘긴다(티켓 20261021_1248).
 */
export default function OnboardingSyncButton({ size = 'xs' }: { size?: 'xs' | 'sm' }) {
  const [loading, setLoading] = useState(false)
  const [revealOpen, setRevealOpen] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

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
      if (!res.ok) throw new StepSaveFailedError()
      trackQuestStepComplete('sync', await res.json())
      router.refresh()
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
        variant="primary"
        surface="sub"
        size={size}
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
