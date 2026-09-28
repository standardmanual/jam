'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ONBOARDING_QUEST_STEPS } from '@/lib/onboarding-quest/config'
import type { QuestPreviewValue } from '@/lib/onboarding-quest/preview'

/** 내부 용어 허용(어드민 예외) — 단계 키를 그대로 괄호에 남겨 API 값과 대조하기 쉽게 한다. */
const STEP_LABELS: Record<QuestPreviewValue, string> = {
  sync: '1단계 · 첫 동기화 (sync)',
  bag: '2단계 · 인벤토리 (bag)',
  pickup: '3단계 · 픽업 (pickup)',
  mix_fail: '4단계 · 믹스 실패 (mix_fail)',
  mix_success: '5단계 · 믹스 성공 (mix_success)',
  drop: '6단계 · 드랍 (drop)',
  browse: '7단계 · 둘러보기 (browse)',
  done: '연동 단계 (done)',
}

/** 단계 버튼 8개 = 7단계 + done. */
const PREVIEW_OPTIONS: readonly QuestPreviewValue[] = [...ONBOARDING_QUEST_STEPS, 'done']

async function postPreview(body: { step: QuestPreviewValue } | { reset: true }): Promise<boolean> {
  const res = await fetch('/api/admin/onboarding-quest/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.ok
}

export default function OnboardingQuestPreviewAdminClient({ current }: { current: QuestPreviewValue | null }) {
  const router = useRouter()
  // 진행 중인 요청의 대상값(재클릭 방지). 'reset'은 끝내기 버튼 전용 마커.
  const [pending, setPending] = useState<QuestPreviewValue | 'reset' | null>(null)
  const [error, setError] = useState(false)

  async function handleStart(value: QuestPreviewValue) {
    if (pending) return
    setPending(value)
    setError(false)
    const ok = await postPreview({ step: value })
    if (ok) {
      router.push('/')
    } else {
      setError(true)
      setPending(null)
    }
  }

  async function handleFinish() {
    if (pending) return
    setPending('reset')
    setError(false)
    const ok = await postPreview({ reset: true })
    setPending(null)
    if (ok) {
      router.refresh()
    } else {
      setError(true)
    }
  }

  const currentLabel = current === null ? '미리보기 중이 아님' : STEP_LABELS[current]

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">퀘스트 미리보기</h1>
        <p className="text-muted-foreground text-sm mt-1">
          단계를 고르면 홈으로 이동해요. 쿠키만 설정하고 DB에는 아무것도 기록되지 않아요.
        </p>
      </div>

      <div className="rounded-xl border px-4 py-3 text-sm">
        현재 상태: <span className="font-medium">{currentLabel}</span>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          요청에 실패했어요. 다시 눌러 주세요.
        </div>
      )}

      <div className="space-y-2">
        {PREVIEW_OPTIONS.map((value) => (
          <button
            key={value}
            type="button"
            disabled={pending !== null || current === value}
            onClick={() => handleStart(value)}
            className="w-full rounded-xl border px-4 py-3 text-left text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted"
          >
            {STEP_LABELS[value]}
            {current === value && ' — 미리보기 중'}
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={pending !== null || current === null}
        onClick={handleFinish}
        className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        미리보기 끝내기
      </button>
    </div>
  )
}
