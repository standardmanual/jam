'use client'

import { useEffect } from 'react'
import { trackQuestStartOnce } from '@/lib/onboarding-quest/analytics'

/**
 * GA4 onboarding_quest_start 계측 전용 (티켓 20260927_2132, 상위 20260927_2123 T9).
 *
 * 홈 퀘스트 카드가 0/7(아직 한 단계도 완료하지 않은) `in_progress` 상태로 처음 렌더될 때
 * `OnboardingQuestCard.tsx`가 마운트한다. `HomeViewTracker`와 같은 패턴 — 렌더하는 UI가
 * 없다. 중복 전송 방지는 `trackQuestStartOnce`(localStorage) 내부에서 처리한다.
 */
export default function QuestStartTracker() {
  useEffect(() => {
    trackQuestStartOnce()
  }, [])

  return null
}
