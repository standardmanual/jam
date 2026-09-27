/**
 * 온보딩 퀘스트 홈 카드 상태 계산(`resolveOnboardingQuestCard`) 단위 테스트 (티켓 20260927_2133).
 * DB에 닿지 않는 순수 함수만 검증한다 — 조회 래퍼(`getOnboardingQuestCard`)는 supabase
 * 클라이언트가 필요해 여기서 다루지 않는다.
 */
import { describe, it, expect } from 'vitest'
import { resolveOnboardingQuestCard } from '../status'

describe('resolveOnboardingQuestCard', () => {
  it('행이 없으면 null(숨김)', () => {
    expect(resolveOnboardingQuestCard(null, { stravaConnected: false })).toBeNull()
  })

  it('completed_at이 있으면 null(숨김) — 몇 단계를 마쳤든 상관없다', () => {
    const state = resolveOnboardingQuestCard(
      { step_progress: { sync: '2026-09-27T00:00:00Z' }, skipped_at: null, completed_at: '2026-09-27T01:00:00Z' },
      { stravaConnected: true }
    )
    expect(state).toBeNull()
  })

  it('1단계만 마쳤으면 in_progress, done=1, nextStep은 다음 미완료 단계(bag)', () => {
    const state = resolveOnboardingQuestCard(
      { step_progress: { sync: '2026-09-27T00:00:00Z' }, skipped_at: null, completed_at: null },
      { stravaConnected: false }
    )
    expect(state).toEqual({ kind: 'in_progress', done: 1, total: 7, nextStep: 'bag' })
  })

  it('0단계(행만 생성됨)면 in_progress, done=0, nextStep은 첫 단계(sync)', () => {
    const state = resolveOnboardingQuestCard(
      { step_progress: {}, skipped_at: null, completed_at: null },
      { stravaConnected: false }
    )
    expect(state).toEqual({ kind: 'in_progress', done: 0, total: 7, nextStep: 'sync' })
  })

  it('7단계를 다 채우고 completed_at이 없으면 awaiting_sync', () => {
    const state = resolveOnboardingQuestCard(
      {
        step_progress: {
          sync: '1', bag: '1', pickup: '1', mix_fail: '1', mix_success: '1', drop: '1', browse: '1',
        },
        skipped_at: null,
        completed_at: null,
      },
      { stravaConnected: true }
    )
    expect(state).toEqual({ kind: 'awaiting_sync', stravaConnected: true, skipped: false })
  })

  it('건너뛴 경우(skipped_at 있음, 단계 미완료)에도 awaiting_sync', () => {
    const state = resolveOnboardingQuestCard(
      { step_progress: { sync: '1' }, skipped_at: '2026-09-27T02:00:00Z', completed_at: null },
      { stravaConnected: false }
    )
    expect(state).toEqual({ kind: 'awaiting_sync', stravaConnected: false, skipped: true })
  })

  it('awaiting_sync 상태는 stravaConnected 값을 그대로 전달한다(Strava 미동기화)', () => {
    const state = resolveOnboardingQuestCard(
      {
        step_progress: {
          sync: '1', bag: '1', pickup: '1', mix_fail: '1', mix_success: '1', drop: '1', browse: '1',
        },
        skipped_at: null,
        completed_at: null,
      },
      { stravaConnected: false }
    )
    expect(state).toEqual({ kind: 'awaiting_sync', stravaConnected: false, skipped: false })
  })
})
