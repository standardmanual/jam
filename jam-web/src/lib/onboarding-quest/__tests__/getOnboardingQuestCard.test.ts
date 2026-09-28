/**
 * `getOnboardingQuestCard`의 기능 스위치(`ONBOARDING_QUEST_ENABLED`) 검증 (티켓 20260927_2133 재작업).
 * 스위치가 꺼져 있으면 DB 조회 없이 즉시 null을 반환해야 한다 — config 모듈을 mock한다.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/onboarding-quest/config', () => ({
  ONBOARDING_QUEST_ENABLED: false,
  ONBOARDING_QUEST_STEPS: [],
}))

// 관리자 미리보기가 없는 상태를 흉내낸다(N5a, 티켓 20260928_1335) — 실제 `cookies()`는
// 요청 스코프 밖(테스트)에서 호출하면 예외를 던진다.
vi.mock('@/lib/onboarding-quest/preview', () => ({
  getAdminQuestPreview: async () => null,
}))

import { getOnboardingQuestCard } from '../status'

describe('getOnboardingQuestCard — 기능 스위치', () => {
  it('ONBOARDING_QUEST_ENABLED가 false면 조회 없이 null을 반환한다', async () => {
    const state = await getOnboardingQuestCard('user-1', { stravaConnected: false })
    expect(state).toBeNull()
  })
})
