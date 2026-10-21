/**
 * «JAM! 시작하기» 홈 카드 상태 계산(`resolveOnboardingQuestCard`) 단위 테스트 (티켓 20260927_2133, 20261021_1248 2회).
 * DB에 닿지 않는 순수 함수만 검증한다 — 조회 래퍼(`getOnboardingQuestCard`)는 `getOnboardingQuestCard-real.test.ts`가 맡는다.
 *
 * 고정하는 것:
 * - 숨김 조건은 «연출 끝 또는 건너뜀 AND 실제 3단계 완료»(또는 `completed_at`)다.
 * - 연출이 남은 채 실제 3단계만 끝났으면 카드는 남는다(연출 구역 + 모두 체크된 목록).
 * - 연출이 끝났거나 건너뛰었고 실제 3단계가 남았으면 실제 구역 카드다.
 * - 실제 단계 기록을 읽지 못했으면(real = null) 연출 중에는 연출 구역만, 연출이 끝난 뒤에는 카드를 그리지 않는다.
 */
import { describe, it, expect } from 'vitest'
import { resolveOnboardingQuestCard } from '../status'
import { resolveRealStepsView, type RealStepsView } from '../real-view'
import type { RealStepsProgress } from '../real-steps'

const ALL_DEMO_STEPS = { sync: '1', bag: '1', pickup: '1', mix_fail: '1', mix_success: '1', drop: '1', browse: '1' }

function realView(steps: Partial<RealStepsProgress> = {}): RealStepsView {
  return resolveRealStepsView({
    steps: { sync: false, capsuleOpened: false, lockedOpened: false, ...steps },
    stravaConnected: true,
    capsule: null,
    lockedTarget: null,
  })
}

const REAL_PARTIAL = realView({ sync: true })
const REAL_DONE = realView({ sync: true, capsuleOpened: true, lockedOpened: true })

describe('resolveOnboardingQuestCard — 숨김', () => {
  it('행이 없으면 null(숨김)', () => {
    expect(resolveOnboardingQuestCard(null, REAL_PARTIAL)).toBeNull()
  })

  it('completed_at이 있으면 null(숨김) — 몇 단계를 마쳤든 상관없다', () => {
    const state = resolveOnboardingQuestCard(
      { step_progress: { sync: '2026-09-27T00:00:00Z' }, skipped_at: null, completed_at: '2026-09-27T01:00:00Z' },
      REAL_PARTIAL
    )
    expect(state).toBeNull()
  })

  it('연출을 끝냈고 실제 3단계도 끝났으면 null(숨김)', () => {
    const state = resolveOnboardingQuestCard({ step_progress: ALL_DEMO_STEPS, skipped_at: null, completed_at: null }, REAL_DONE)
    expect(state).toBeNull()
  })

  it('연출을 건너뛰었고 실제 3단계도 끝났으면 null(숨김)', () => {
    const state = resolveOnboardingQuestCard({ step_progress: {}, skipped_at: '2026-09-27T02:00:00Z', completed_at: null }, REAL_DONE)
    expect(state).toBeNull()
  })

  it('연출은 끝났는데 실제 단계 기록을 읽지 못했으면 카드를 그리지 않는다(틀린 체크를 보이지 않는다)', () => {
    const state = resolveOnboardingQuestCard({ step_progress: ALL_DEMO_STEPS, skipped_at: null, completed_at: null }, null)
    expect(state).toBeNull()
  })

  it('건너뛰었는데 실제 단계 기록을 읽지 못했으면 카드를 그리지 않는다', () => {
    const state = resolveOnboardingQuestCard({ step_progress: {}, skipped_at: '2026-09-27T02:00:00Z', completed_at: null }, null)
    expect(state).toBeNull()
  })
})

describe('resolveOnboardingQuestCard — 연출 진행 중(in_progress)', () => {
  it('1단계만 마쳤으면 in_progress, done=1, nextStep은 다음 미완료 단계(bag), 실제 3단계를 함께 싣는다', () => {
    const state = resolveOnboardingQuestCard(
      { step_progress: { sync: '2026-09-27T00:00:00Z' }, skipped_at: null, completed_at: null },
      REAL_PARTIAL
    )
    expect(state).toEqual({ kind: 'in_progress', done: 1, total: 7, nextStep: 'bag', real: REAL_PARTIAL })
  })

  it('0단계(행만 생성됨)면 in_progress, done=0, nextStep은 첫 단계(sync)', () => {
    const state = resolveOnboardingQuestCard({ step_progress: {}, skipped_at: null, completed_at: null }, realView())
    expect(state).toEqual({ kind: 'in_progress', done: 0, total: 7, nextStep: 'sync', real: realView() })
  })

  it('실제 단계 기록을 읽지 못해도 연출 구역은 둔다(real = null)', () => {
    const state = resolveOnboardingQuestCard({ step_progress: { sync: '1' }, skipped_at: null, completed_at: null }, null)
    expect(state).toEqual({ kind: 'in_progress', done: 1, total: 7, nextStep: 'bag', real: null })
  })

  it('연출이 남은 채 실제 3단계만 끝났으면 카드는 남는다(실제 목록은 모두 체크)', () => {
    const state = resolveOnboardingQuestCard({ step_progress: { sync: '1', bag: '1' }, skipped_at: null, completed_at: null }, REAL_DONE)
    expect(state).toMatchObject({ kind: 'in_progress', done: 2, nextStep: 'pickup' })
    expect(state && 'real' in state ? state.real?.rows.map((r) => r.state) : null).toEqual(['done', 'done', 'done'])
  })
})

describe('resolveOnboardingQuestCard — 연출 끝 또는 건너뜀, 실제 3단계 남음(real)', () => {
  it('7단계를 다 채우고 completed_at이 없고 실제 3단계가 남았으면 real', () => {
    const state = resolveOnboardingQuestCard({ step_progress: ALL_DEMO_STEPS, skipped_at: null, completed_at: null }, REAL_PARTIAL)
    expect(state).toEqual({ kind: 'real', real: REAL_PARTIAL })
  })

  it('건너뛴 경우(skipped_at 있음, 단계 미완료)에도 real — 연출 구역 없이 실제 구역이 처음부터 위에 있다', () => {
    const state = resolveOnboardingQuestCard({ step_progress: { sync: '1' }, skipped_at: '2026-09-27T02:00:00Z', completed_at: null }, realView())
    expect(state).toEqual({ kind: 'real', real: realView() })
  })
})
