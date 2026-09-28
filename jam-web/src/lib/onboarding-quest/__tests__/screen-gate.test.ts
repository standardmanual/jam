/**
 * 온보딩 퀘스트 화면 문지기 함수(`resolveOnboardingQuestGate`/`getOnboardingQuestGate`)
 * 단위 테스트 (티켓 20260928_0134).
 */
import { describe, it, expect, vi } from 'vitest'
import { resolveOnboardingQuestGate } from '../screen-gate'

describe('resolveOnboardingQuestGate', () => {
  it('bag 차례일 때 inventory 화면이면 bag을, drops 화면이면 null을 돌려준다', () => {
    const row = { step_progress: { sync: '1' }, skipped_at: null }
    expect(resolveOnboardingQuestGate(row, 'inventory')).toBe('bag')
    expect(resolveOnboardingQuestGate(row, 'drops')).toBeNull()
  })

  it('행이 없으면 어떤 화면이든 null', () => {
    expect(resolveOnboardingQuestGate(null, 'home')).toBeNull()
  })

  it('건너뛴 경우(skipped_at 있음)면 어떤 화면이든 null', () => {
    const row = { step_progress: { sync: '1' }, skipped_at: '2026-09-28T00:00:00Z' }
    expect(resolveOnboardingQuestGate(row, 'inventory')).toBeNull()
  })

  it('7단계를 다 채우면(nextStepOf가 null) 어떤 화면이든 null', () => {
    const row = {
      step_progress: {
        sync: '1', bag: '1', pickup: '1', mix_fail: '1', mix_success: '1', drop: '1', browse: '1',
      },
      skipped_at: null,
    }
    expect(resolveOnboardingQuestGate(row, 'missions')).toBeNull()
  })

  it('browse 차례일 때 missions 화면이면 browse를, 다른 화면이면 null을 돌려준다', () => {
    const row = {
      step_progress: { sync: '1', bag: '1', pickup: '1', mix_fail: '1', mix_success: '1', drop: '1' },
      skipped_at: null,
    }
    expect(resolveOnboardingQuestGate(row, 'missions')).toBe('browse')
    expect(resolveOnboardingQuestGate(row, 'home')).toBeNull()
  })

  it('pickup·drop이 같은 화면(drops) 소속이어도 순서상 다음 단계 키만 정확히 돌려준다', () => {
    const pickupTurn = { step_progress: { sync: '1', bag: '1' }, skipped_at: null }
    expect(resolveOnboardingQuestGate(pickupTurn, 'drops')).toBe('pickup')

    const dropTurn = {
      step_progress: { sync: '1', bag: '1', pickup: '1', mix_fail: '1', mix_success: '1' },
      skipped_at: null,
    }
    expect(resolveOnboardingQuestGate(dropTurn, 'drops')).toBe('drop')
  })

  it('mix_fail·mix_success이 같은 화면(combine) 소속이어도 순서상 다음 단계 키만 정확히 돌려준다', () => {
    const mixFail = { step_progress: { sync: '1', bag: '1', pickup: '1' }, skipped_at: null }
    expect(resolveOnboardingQuestGate(mixFail, 'combine')).toBe('mix_fail')

    const mixSuccess = { step_progress: { sync: '1', bag: '1', pickup: '1', mix_fail: '1' }, skipped_at: null }
    expect(resolveOnboardingQuestGate(mixSuccess, 'combine')).toBe('mix_success')
  })
})

describe('getOnboardingQuestGate — 기능 스위치', () => {
  it('ONBOARDING_QUEST_ENABLED가 false면 조회 없이 null을 반환한다', async () => {
    vi.resetModules()
    vi.doMock('@/lib/onboarding-quest/config', () => ({
      ONBOARDING_QUEST_ENABLED: false,
      ONBOARDING_QUEST_STEPS: [],
    }))
    const { getOnboardingQuestGate } = await import('../screen-gate')
    const state = await getOnboardingQuestGate('user-1', 'home')
    expect(state).toBeNull()
    vi.doUnmock('@/lib/onboarding-quest/config')
    vi.resetModules()
  })
})
