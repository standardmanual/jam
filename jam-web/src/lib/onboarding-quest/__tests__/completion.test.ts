/**
 * `shouldRecordQuestCompletion`·`shouldGrantQuestReward` 단위 테스트
 * (티켓 20260927_2129 T6, 20260927_2130 T7b, 상위 20260927_2123).
 * DB에 닿지 않는 순수 함수만 검증한다. 지급 부수효과(DB 왕복)는
 * `completion-reward.test.ts`에서 다룬다.
 */
import { describe, it, expect } from 'vitest'
import { shouldRecordQuestCompletion, shouldGrantQuestReward } from '../completion'
import type { OnboardingQuestStepKey } from '@/types/database'

const allStepsDone: Partial<Record<OnboardingQuestStepKey, string>> = {
  sync: '1',
  bag: '1',
  pickup: '1',
  mix_fail: '1',
  mix_success: '1',
  drop: '1',
  browse: '1',
}

const midProgress: Partial<Record<OnboardingQuestStepKey, string>> = {
  sync: '1',
  bag: '1',
  pickup: '1',
  mix_fail: '1',
}

describe('shouldRecordQuestCompletion', () => {
  it('행이 없으면 false', () => {
    expect(shouldRecordQuestCompletion(null, true)).toBe(false)
  })

  it('7단계를 다 마쳤고 처리된 활동이 1건 이상이면 true', () => {
    const row = { step_progress: allStepsDone, skipped_at: null, completed_at: null }
    expect(shouldRecordQuestCompletion(row, true)).toBe(true)
  })

  it('이미 completed_at이 있으면 false (재실행 멱등)', () => {
    const row = {
      step_progress: allStepsDone,
      skipped_at: null,
      completed_at: '2026-09-28T00:00:00Z',
    }
    expect(shouldRecordQuestCompletion(row, true)).toBe(false)
  })

  it('연출 도중(7단계 미완료·건너뛰지 않음)이면 활동이 있어도 false', () => {
    const row = { step_progress: midProgress, skipped_at: null, completed_at: null }
    expect(shouldRecordQuestCompletion(row, true)).toBe(false)
  })

  it('건너뛴 유저는 7단계 미완료여도 활동이 1건 이상이면 true (사용자 결정 1)', () => {
    const row = {
      step_progress: midProgress,
      skipped_at: '2026-09-28T00:00:00Z',
      completed_at: null,
    }
    expect(shouldRecordQuestCompletion(row, true)).toBe(true)
  })

  it('처리된 활동이 0건이면 7단계를 다 마쳤어도 false', () => {
    const row = { step_progress: allStepsDone, skipped_at: null, completed_at: null }
    expect(shouldRecordQuestCompletion(row, false)).toBe(false)
  })
})

describe('shouldGrantQuestReward', () => {
  it('completed_at 갱신이 실제로 일어났고 건너뛰지 않았으면 true', () => {
    expect(shouldGrantQuestReward(true, null)).toBe(true)
  })

  it('이번 호출에서 completed_at을 바꾸지 못했으면 false (이미 완료된 유저의 재호출)', () => {
    expect(shouldGrantQuestReward(false, null)).toBe(false)
  })

  it('건너뛴 유저는 completed_at이 갱신됐어도 false (상위 결정 24)', () => {
    expect(shouldGrantQuestReward(true, '2026-09-28T00:00:00Z')).toBe(false)
  })
})
