'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
 * 물리적 최상단이 되므로, 안전영역 padding은 이 띠가 진다 — TopNav 쪽 여백과 겹쳐 이중
 * 여백이 생기는지는 추정하지 않고 카리나 실렌더(머지 후) 때 실측으로 확정한다.
 */
export default function QuestPreviewBanner({ value }: { value: QuestPreviewValue }) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

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
      className="flex items-center justify-between gap-[var(--spacing-12)] shrink-0"
      style={{
        background: 'var(--color-warning)',
        color: 'var(--color-text-inverse)',
        borderRadius: 0,
        paddingLeft: 'var(--spacing-16)',
        paddingRight: 'var(--spacing-16)',
        // 상하 패딩(--spacing-8) 아래 실측 요청(줄 높이 기준 8~10px) 대응. 최상단 안전영역은
        // 이 띠가 진다(위 설명 참고).
        paddingTop: 'calc(var(--spacing-8) + env(safe-area-inset-top))',
        paddingBottom: 'var(--spacing-8)',
      }}
    >
      <span style={{ fontSize: 'var(--text-caption)', lineHeight: 'var(--leading-caption)' }}>{label}</span>
      {/* -m/p 트릭으로 시각 크기는 그대로 두고 탭 영역만 넓힌다(xs 버튼 실측 약 31px →
          이 래퍼로 상하 12px씩 추가해 40px 이상 확보, 채원 판정 device_notes). */}
      <div className="-m-[6px] p-[6px] shrink-0">
        <Button variant="outline" surface="sub" size="xs" loading={loading} onClick={handleFinish}>
          {d.onboardingQuest.preview.finishButton}
        </Button>
      </div>
    </div>
  )
}
