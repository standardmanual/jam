'use client'

import { useEffect } from 'react'
import { trackQuestStepComplete } from '@/lib/onboarding-quest/analytics'

/**
 * 온보딩 퀘스트 `browse` 단계(7단계) 계측 전용 (티켓 20260928_0139, 상위 20260927_2123
 * 결정 14·18. GA4 계측은 티켓 20260927_2132).
 *
 * 연출 데이터가 없다 — 실제 `/missions` 화면을 연 것 자체가 완료 조건이라, 클릭 없이
 * 마운트 시 1회만 `POST /api/onboarding-quest/step`을 호출한다(`HomeViewTracker` 패턴).
 * 서버(`route.ts` L64-67)가 멱등이라 새로고침을 반복해도 중복 기록되지 않는다. 기록 실패는
 * 화면을 막지 않고 조용히 무시한다 — 다음 방문 때 문지기(`getOnboardingQuestGate`)가 다시
 * `browse` 차례로 판정해 재시도된다.
 */
export default function MissionsBrowseTracker() {
  useEffect(() => {
    fetch('/api/onboarding-quest/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 'browse' }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) trackQuestStepComplete('browse', data)
      })
      .catch(() => {
        // 조용히 무시 — 재방문 시 멱등 재시도
      })
  }, [])

  return null
}
