/**
 * `getOnboardingQuestCard` — 실제 3단계 읽기 연결 (티켓 20261021_1248 2회)
 *
 * 고정하는 것:
 * - 완료한 유저(`completed_at`)는 실제 단계를 읽지 않고 카드가 없다.
 * - 실제 단계 기록을 읽지 못하면 오류만 남기고 `real`이 null이다(연출 중이면 연출 구역만, 연출이 끝났으면 카드 없음).
 * - 열러 갈 잠긴 개체는 ③이 지금 할 차례일 때만 읽고, 읽지 못하면 개체를 모르는 채로 목록은 그린다.
 * - 캡슐 상태는 홈이 이미 시작한 조회를 받는다. 읽지 못했으면(null 또는 거절) 잼 안내를 생략한다.
 * 공용 DB는 호출하지 않는다 — 가짜 클라이언트와 읽기 함수 목만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/onboarding-quest/__tests__/getOnboardingQuestCard-real.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { CapsuleStatus } from '@/lib/capsule/capsule-contract'

const mocks = vi.hoisted(() => ({
  row: { current: null as null | { step_progress: Record<string, string>; skipped_at: string | null; completed_at: string | null } },
  rowError: { current: null as null | { message: string } },
  readRealSteps: vi.fn(),
  readLockedOpenTarget: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = () => chain
      chain.maybeSingle = () => Promise.resolve({ data: mocks.row.current, error: mocks.rowError.current })
      return chain
    },
  }),
}))
vi.mock('../preview', () => ({
  getAdminQuestPreview: async () => null,
  resolvePreviewCard: () => null,
}))
vi.mock('../real-steps', () => ({ readRealSteps: mocks.readRealSteps }))
vi.mock('../locked-target', () => ({ readLockedOpenTarget: mocks.readLockedOpenTarget }))

import { getOnboardingQuestCard } from '../status'

const ALL_DEMO_STEPS = { sync: '1', bag: '1', pickup: '1', mix_fail: '1', mix_success: '1', drop: '1', browse: '1' }

const capsule = (over: Partial<CapsuleStatus> = {}): CapsuleStatus => ({
  required: 5,
  filled: 0,
  remaining: 5,
  balance: 10,
  openable: false,
  notOpenableReason: 'not_full',
  freeSlots: 5,
  neededSlots: 2,
  ...over,
})

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  mocks.row.current = { step_progress: {}, skipped_at: null, completed_at: null }
  mocks.rowError.current = null
  mocks.readRealSteps.mockReset()
  mocks.readLockedOpenTarget.mockReset()
  mocks.readRealSteps.mockResolvedValue({ sync: false, capsuleOpened: false, lockedOpened: false })
  mocks.readLockedOpenTarget.mockResolvedValue(null)
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
})

describe('getOnboardingQuestCard — 행 읽기', () => {
  it('행이 없으면 null이고 실제 단계를 읽지 않는다', async () => {
    mocks.row.current = null
    expect(await getOnboardingQuestCard('u1', { stravaConnected: true })).toBeNull()
    expect(mocks.readRealSteps).not.toHaveBeenCalled()
  })

  it('행 조회가 실패하면 null이다(홈 렌더를 막지 않는다)', async () => {
    mocks.rowError.current = { message: 'down' }
    expect(await getOnboardingQuestCard('u1', { stravaConnected: true })).toBeNull()
    expect(errorSpy).toHaveBeenCalled()
  })

  it('completed_at이 있으면 실제 단계를 읽지 않고 null이다', async () => {
    mocks.row.current = { step_progress: ALL_DEMO_STEPS, skipped_at: null, completed_at: '2026-10-21T00:00:00Z' }
    expect(await getOnboardingQuestCard('u1', { stravaConnected: true })).toBeNull()
    expect(mocks.readRealSteps).not.toHaveBeenCalled()
  })
})

describe('getOnboardingQuestCard — 실제 단계 기록', () => {
  it('연출 중에도 실제 3단계를 읽어 카드에 싣는다', async () => {
    mocks.readRealSteps.mockResolvedValue({ sync: true, capsuleOpened: false, lockedOpened: false })
    const state = await getOnboardingQuestCard('u1', { stravaConnected: true, capsule: capsule() })
    expect(mocks.readRealSteps).toHaveBeenCalledWith(expect.anything(), 'u1')
    expect(state).toMatchObject({
      kind: 'in_progress',
      nextStep: 'sync',
      real: { doneCount: 1, current: { step: 'capsule', stage: 'filling', need: 5 } },
    })
  })

  it('연출 중에 실제 단계 기록만 못 읽으면 연출 구역은 두고 실제 목록은 그리지 않는다', async () => {
    mocks.readRealSteps.mockRejectedValue(new Error('실제 단계 읽기 실패 (캡슐 열기): boom'))
    const state = await getOnboardingQuestCard('u1', { stravaConnected: true })
    expect(state).toMatchObject({ kind: 'in_progress', nextStep: 'sync', real: null })
    expect(errorSpy).toHaveBeenCalled()
  })

  it('연출이 끝났는데 실제 단계 기록을 못 읽으면 카드가 없다', async () => {
    mocks.row.current = { step_progress: ALL_DEMO_STEPS, skipped_at: null, completed_at: null }
    mocks.readRealSteps.mockRejectedValue(new Error('boom'))
    expect(await getOnboardingQuestCard('u1', { stravaConnected: true })).toBeNull()
  })

  it('건너뛰고 실제 3단계가 남았으면 실제 구역 카드다', async () => {
    mocks.row.current = { step_progress: {}, skipped_at: '2026-10-21T00:00:00Z', completed_at: null }
    const state = await getOnboardingQuestCard('u1', { stravaConnected: false })
    expect(state).toMatchObject({ kind: 'real', real: { doneCount: 0, current: { step: 'sync', stravaConnected: false } } })
  })

  it('연출이 끝났고 실제 3단계도 끝났으면 completed_at이 아직 없어도 카드가 없다', async () => {
    mocks.row.current = { step_progress: ALL_DEMO_STEPS, skipped_at: null, completed_at: null }
    mocks.readRealSteps.mockResolvedValue({ sync: true, capsuleOpened: true, lockedOpened: true })
    expect(await getOnboardingQuestCard('u1', { stravaConnected: true })).toBeNull()
  })

  it('연출이 남은 채 실제 3단계만 끝났으면 카드는 남고 세 행이 모두 체크다', async () => {
    mocks.readRealSteps.mockResolvedValue({ sync: true, capsuleOpened: true, lockedOpened: true })
    const state = await getOnboardingQuestCard('u1', { stravaConnected: true })
    expect(state).toMatchObject({ kind: 'in_progress', real: { doneCount: 3, current: null } })
  })
})

describe('getOnboardingQuestCard — 캡슐 상태와 열러 갈 잠긴 개체', () => {
  beforeEach(() => {
    mocks.row.current = { step_progress: {}, skipped_at: '2026-10-21T00:00:00Z', completed_at: null }
  })

  it('캡슐 조회가 거절돼도(Promise reject) 목록은 그리고 잼 안내를 생략한다', async () => {
    mocks.readRealSteps.mockResolvedValue({ sync: true, capsuleOpened: false, lockedOpened: false })
    const state = await getOnboardingQuestCard('u1', { stravaConnected: true, capsule: Promise.reject(new Error('capsule down')) })
    expect(state).toMatchObject({ kind: 'real', real: { current: { step: 'capsule', stage: 'unknown', shortage: null } } })
  })

  it('캡슐 상태가 null이면 ②는 일반 설명(unknown)이다', async () => {
    mocks.readRealSteps.mockResolvedValue({ sync: true, capsuleOpened: false, lockedOpened: false })
    const state = await getOnboardingQuestCard('u1', { stravaConnected: true, capsule: Promise.resolve(null) })
    expect(state).toMatchObject({ real: { current: { step: 'capsule', stage: 'unknown' } } })
  })

  it('가진 잼이 모자란 캡슐은 모자람 값을 싣는다', async () => {
    mocks.readRealSteps.mockResolvedValue({ sync: true, capsuleOpened: false, lockedOpened: false })
    const state = await getOnboardingQuestCard('u1', { stravaConnected: true, capsule: Promise.resolve(capsule({ balance: 3 })) })
    expect(state).toMatchObject({ real: { current: { step: 'capsule', stage: 'filling', shortage: { have: 3, need: 5 } } } })
  })

  it('③이 지금 할 차례가 아니면 잠긴 개체를 읽지 않는다', async () => {
    mocks.readRealSteps.mockResolvedValue({ sync: true, capsuleOpened: false, lockedOpened: false })
    await getOnboardingQuestCard('u1', { stravaConnected: true, capsule: capsule() })
    expect(mocks.readLockedOpenTarget).not.toHaveBeenCalled()
  })

  it('③이 지금 할 차례면 열러 갈 잠긴 개체를 읽어 id와 더 채울 양을 싣는다', async () => {
    mocks.readRealSteps.mockResolvedValue({ sync: true, capsuleOpened: true, lockedOpened: false })
    mocks.readLockedOpenTarget.mockResolvedValue({ itemId: 'item-1', required: 5, filled: 0 })
    const state = await getOnboardingQuestCard('u1', { stravaConnected: true, capsule: capsule({ balance: 5 }) })
    expect(mocks.readLockedOpenTarget).toHaveBeenCalledWith(expect.anything(), 'u1')
    expect(state).toMatchObject({
      kind: 'real',
      real: { current: { step: 'locked', target: { itemId: 'item-1', need: 5 }, shortage: null } },
    })
  })

  it('열러 갈 잠긴 개체를 못 읽으면 개체를 모르는 채로 목록은 그린다', async () => {
    mocks.readRealSteps.mockResolvedValue({ sync: true, capsuleOpened: true, lockedOpened: false })
    mocks.readLockedOpenTarget.mockRejectedValue(new Error('boom'))
    const state = await getOnboardingQuestCard('u1', { stravaConnected: true, capsule: capsule() })
    expect(state).toMatchObject({ kind: 'real', real: { doneCount: 2, current: { step: 'locked', target: null } } })
    expect(errorSpy).toHaveBeenCalled()
  })
})
