'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { d, t } from '@/lib/i18n'
import { ONBOARDING_QUEST_STEPS } from '@/lib/onboarding-quest/config'
import type { QuestPreviewValue } from '@/lib/onboarding-quest/preview'

/**
 * 관리자 전용 퀘스트 미리보기 중임을 알리는 띠 (티켓 20260928_0138, N5b).
 *
 * `(main)/layout.tsx`가 `getAdminQuestPreview()`(null이면 렌더하지 않음)로 조건부 렌더한다
 * — 로딩/빈/오류 상태가 없는 이유(채원 판정 states, 서버에서 값이 이미 확정돼 넘어온다).
 *
 * 배치: `(main)/layout.tsx`의 문서 흐름 안, `<main>` 앞(fixed 오버레이 아님) — 승인 항목 ①.
 * TopNav(`design-system/components/navigation/TopNav.jsx`)는 sticky top:0 + 자체
 * `env(safe-area-inset-top)` padding을 항상 갖는다. 이 띠가 위에 얹히면 TopNav보다 이 띠가
 * 물리적 최상단이 되므로, 안전영역 padding은 이 띠가 진다 — `(main)/layout.tsx`가 띠가 있을 때
 * 래퍼 div에 `--topnav-safe-top: 0px`를 주입해 TopNav 쪽 안전영역 padding을 0으로 눌러
 * 이중 여백을 없앤다(카리나 실렌더로 확인한 이중 여백을 티켓 20260928_0138 재작업에서 수정).
 */
export function shouldRefreshOnPathChange(prevPathname: string | null, pathname: string): boolean {
  // 첫 마운트(prevPathname === null)는 서버가 이미 최신 단계로 렌더한 상태라 제외한다.
  // 경로가 실제로 바뀐 경우에만 새로고침해 띠의 단계 번호를 서버 최신값으로 맞춘다.
  return prevPathname !== null && prevPathname !== pathname
}

export default function QuestPreviewBanner({ value }: { value: QuestPreviewValue }) {
  const router = useRouter()
  const pathname = usePathname()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const prevPathnameRef = useRef<string | null>(null)

  // 미리보기 단계 완료 후 클라이언트 이동(`router.push('/')`)만으로는 서버 컴포넌트인
  // `(main)/layout.tsx`가 다시 렌더되지 않아 띠의 단계 번호가 낡은 채로 남는다(실측).
  // 경로가 바뀔 때(첫 마운트 제외) router.refresh()로 레이아웃을 다시 받아 최신 단계를
  // 반영한다 — 띠는 미리보기 중인 관리자에게만 마운트되므로 일반 유저 비용은 없다.
  useEffect(() => {
    if (shouldRefreshOnPathChange(prevPathnameRef.current, pathname)) {
      router.refresh()
    }
    prevPathnameRef.current = pathname
  }, [pathname, router])

  const label =
    value === 'done'
      ? d.onboardingQuest.preview.doneLabel
      : t(d.onboardingQuest.preview.stepLabel, { n: ONBOARDING_QUEST_STEPS.indexOf(value) + 1 })

  async function handleFinish() {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/onboarding-quest/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true }),
      })
      if (!res.ok) throw new Error('quest preview reset failed')
      router.refresh()
    } catch {
      toast(d.onboardingQuest.preview.finishFailed, 'error')
      setLoading(false)
    }
  }

  return (
    <div
      className="flex items-center justify-between gap-3 shrink-0"
      style={{
        background: 'var(--warning)',
        // --warning(#f5a300) 면 위 글자는 --foreground(8.64:1). --snow는 2.02:1이라 읽기 어렵다.
        color: 'var(--foreground)',
        borderRadius: 0,
        paddingLeft: 'var(--spacing-16)',
        paddingRight: 'var(--spacing-16)',
        // 상하 패딩(--spacing-8) 아래 실측 요청(줄 높이 기준 8~10px) 대응. 최상단 안전영역은
        // 이 띠가 진다(위 설명 참고).
        paddingTop: 'calc(var(--spacing-8) + env(safe-area-inset-top))',
        paddingBottom: 'var(--spacing-8)',
      }}
    >
      <span style={{ fontSize: 'var(--text-xs)', lineHeight: 'var(--text-xs--line-height)' }}>{label}</span>
      {/* xs 버튼 실측 높이(약 30.8px = 44px * --scale-compact)만으로는 40px에 못 미친다.
          -m/p 래퍼는 onClick이 안쪽 버튼에만 있어 늘어난 영역이 반응하지 않았다(실측) —
          버튼 자신의 히트 영역을 ::before 의사요소로 사방 6px씩 넓힌다(시각 크기는 그대로,
          30.8px + 12px = 42.8px 이상 확보, 채원 판정 device_notes). */}
      <Button
        variant="outline"
        surface="sub"
        size="xs"
        loading={loading}
        onClick={handleFinish}
        className="relative shrink-0 before:absolute before:-inset-[6px] before:content-['']"
      >
        {d.onboardingQuest.preview.finishButton}
      </Button>
    </div>
  )
}
