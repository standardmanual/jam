/**
 * `getOnboardingQuestCard` — 실제 2단계 읽기 연결 (티켓 20261021_1248 2회, 2단계·포인트 기준 20261028_1738 1회)
 *
 * 고정하는 것:
 * - 완료한 유저(`completed_at`)는 실제 단계를 읽지 않고 카드가 없다. 열러 갈 개체와 가진 포인트도 읽지 않는다.
 * - 실제 단계 기록을 읽지 못하면 오류만 남기고 `real`이 null이다(연출 중이면 연출 구역만, 연출이 끝났으면 카드 없음).
 * - 열러 갈 잠긴 개체는 ②가 지금 할 차례일 때(첫 동기화를 마치고 잠긴 열기가 남았을 때)만 읽고, 읽지 못하면 개체를 모르는 채로 목록은 그린다.
 * - 가진 포인트는 열러 갈 개체의 필요 포인트가 0보다 클 때만 읽는다. 읽지 못하면 모자람을 단정하지 않는다.
 * 공용 DB는 호출하지 않는다 — 가짜 클라이언트와 읽기 함수 목만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/onboarding-quest/__tests__/getOnboardingQuestCard-real.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  row: { current: null as null | { step_progress: Record<string, string>; skipped_at: string | null; completed_at: string | null } },
  rowError: { current: null as null | { message: string } },
  readRealSteps: vi.fn(),
  readLockedOpenTarget: vi.fn(),
  readPointBalance: vi.fn(),
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
vi.mock('../locked-target', () => ({ readLockedOpenTarget: mocks.readLockedOpenTarget, readPointBalance: mocks.readPointBalance }))

import { getOnboardingQuestCard } from '../status'

const ALL_DEMO_STEPS = { sync: '1', bag: '1', pickup: '1', mix_fail: '1', mix_success: '1', drop: '1', browse: '1' }

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  mocks.row.current = { step_progress: {}, skipped_at: null, completed_at: null }
  mocks.rowError.current = null
  mocks.readRealSteps.mockReset()
  mocks.readLockedOpenTarget.mockReset()
  mocks.readPointBalance.mockReset()
  mocks.readRealSteps.mockResolvedValue({ sync: false, lockedOpened: false })
  mocks.readLockedOpenTarget.mockResolvedValue(null)
  mocks.readPointBalance.mockResolvedValue(0)
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

  it('이미 퀘스트를 마친 유저(completed_at 있음)는 카드가 없고 실제 단계·열러 갈 개체·가진 포인트를 읽지 않는다', async () => {
    mocks.row.current = { step_progress: ALL_DEMO_STEPS, skipped_at: null, completed_at: '2026-10-21T00:00:00Z' }
    expect(await getOnboardingQuestCard('u1', { stravaConnected: true })).toBeNull()
    expect(mocks.readRealSteps).not.toHaveBeenCalled()
    expect(mocks.readLockedOpenTarget).not.toHaveBeenCalled()
    expect(mocks.readPointBalance).not.toHaveBeenCalled()
  })

  it('연출 중에 completed_at이 있는 유저도 같다 — 카드가 없고 실제 단계를 읽지 않는다', async () => {
    mocks.row.current = { step_progress: { sync: '1' }, skipped_at: null, completed_at: '2026-10-21T00:00:00Z' }
    expect(await getOnboardingQuestCard('u1', { stravaConnected: true })).toBeNull()
    expect(mocks.readRealSteps).not.toHaveBeenCalled()
  })
})

describe('getOnboardingQuestCard — 실제 단계 기록', () => {
  it('연출 중에도 실제 2단계를 읽어 카드에 싣는다', async () => {
    mocks.readRealSteps.mockResolvedValue({ sync: true, lockedOpened: false })
    const state = await getOnboardingQuestCard('u1', { stravaConnected: true })
    expect(mocks.readRealSteps).toHaveBeenCalledWith(expect.anything(), 'u1')
    expect(state).toMatchObject({
      kind: 'in_progress',
      nextStep: 'sync',
      real: { doneCount: 1, total: 2, current: { step: 'locked', target: null } },
    })
  })

  it('연출 중에 실제 단계 기록만 못 읽으면 연출 구역은 두고 실제 목록은 그리지 않는다', async () => {
    mocks.readRealSteps.mockRejectedValue(new Error('실제 단계 읽기 실패 (잠긴 개체 열기): boom'))
    const state = await getOnboardingQuestCard('u1', { stravaConnected: true })
    expect(state).toMatchObject({ kind: 'in_progress', nextStep: 'sync', real: null })
    expect(errorSpy).toHaveBeenCalled()
  })

  it('연출이 끝났는데 실제 단계 기록을 못 읽으면 카드가 없다', async () => {
    mocks.row.current = { step_progress: ALL_DEMO_STEPS, skipped_at: null, completed_at: null }
    mocks.readRealSteps.mockRejectedValue(new Error('boom'))
    expect(await getOnboardingQuestCard('u1', { stravaConnected: true })).toBeNull()
  })

  it('건너뛰고 실제 2단계가 남았으면 실제 구역 카드다', async () => {
    mocks.row.current = { step_progress: {}, skipped_at: '2026-10-21T00:00:00Z', completed_at: null }
    const state = await getOnboardingQuestCard('u1', { stravaConnected: false })
    expect(state).toMatchObject({ kind: 'real', real: { doneCount: 0, current: { step: 'sync', stravaConnected: false } } })
  })

  it('연출이 끝났고 실제 2단계도 끝났으면 completed_at이 아직 없어도 카드가 없다', async () => {
    mocks.row.current = { step_progress: ALL_DEMO_STEPS, skipped_at: null, completed_at: null }
    mocks.readRealSteps.mockResolvedValue({ sync: true, lockedOpened: true })
    expect(await getOnboardingQuestCard('u1', { stravaConnected: true })).toBeNull()
  })

  it('연출이 남은 채 실제 2단계만 끝났으면 카드는 남고 두 행이 모두 체크다', async () => {
    mocks.readRealSteps.mockResolvedValue({ sync: true, lockedOpened: true })
    const state = await getOnboardingQuestCard('u1', { stravaConnected: true })
    expect(state).toMatchObject({ kind: 'in_progress', real: { doneCount: 2, current: null } })
  })
})

describe('getOnboardingQuestCard — 열러 갈 잠긴 개체와 가진 포인트', () => {
  beforeEach(() => {
    mocks.row.current = { step_progress: {}, skipped_at: '2026-10-21T00:00:00Z', completed_at: null }
  })

  it('②가 지금 할 차례가 아니면(첫 동기화 전) 잠긴 개체도 가진 포인트도 읽지 않는다', async () => {
    mocks.readRealSteps.mockResolvedValue({ sync: false, lockedOpened: false })
    await getOnboardingQuestCard('u1', { stravaConnected: true })
    expect(mocks.readLockedOpenTarget).not.toHaveBeenCalled()
    expect(mocks.readPointBalance).not.toHaveBeenCalled()
  })

  it('②를 먼저 마치고 ①이 남았으면 잠긴 개체를 읽지 않는다', async () => {
    mocks.readRealSteps.mockResolvedValue({ sync: false, lockedOpened: true })
    await getOnboardingQuestCard('u1', { stravaConnected: true })
    expect(mocks.readLockedOpenTarget).not.toHaveBeenCalled()
  })

  it('②가 지금 할 차례면 열러 갈 잠긴 개체를 읽어 id와 필요 포인트를 싣는다', async () => {
    mocks.readRealSteps.mockResolvedValue({ sync: true, lockedOpened: false })
    mocks.readLockedOpenTarget.mockResolvedValue({ itemId: 'item-1', pointsRequired: 30 })
    mocks.readPointBalance.mockResolvedValue(100)
    const state = await getOnboardingQuestCard('u1', { stravaConnected: true })
    expect(mocks.readLockedOpenTarget).toHaveBeenCalledWith(expect.anything(), 'u1')
    expect(state).toMatchObject({
      kind: 'real',
      real: { doneCount: 1, current: { step: 'locked', target: { itemId: 'item-1', need: 30 }, shortage: null } },
    })
  })

  it('필요 포인트가 0이면 가진 포인트를 읽지 않고 모자람이 없다', async () => {
    mocks.readRealSteps.mockResolvedValue({ sync: true, lockedOpened: false })
    mocks.readLockedOpenTarget.mockResolvedValue({ itemId: 'item-1', pointsRequired: 0 })
    const state = await getOnboardingQuestCard('u1', { stravaConnected: true })
    expect(mocks.readPointBalance).not.toHaveBeenCalled()
    expect(state).toMatchObject({ real: { current: { step: 'locked', target: { itemId: 'item-1', need: 0 }, shortage: null } } })
  })

  it('필요 포인트가 0보다 큰데 가진 포인트가 모자라면 모자람 값을 싣는다', async () => {
    mocks.readRealSteps.mockResolvedValue({ sync: true, lockedOpened: false })
    mocks.readLockedOpenTarget.mockResolvedValue({ itemId: 'item-1', pointsRequired: 30 })
    mocks.readPointBalance.mockResolvedValue(12)
    const state = await getOnboardingQuestCard('u1', { stravaConnected: true })
    expect(mocks.readPointBalance).toHaveBeenCalledWith(expect.anything(), 'u1')
    expect(state).toMatchObject({ real: { current: { step: 'locked', shortage: { have: 12, need: 30 } } } })
  })

  it('가진 포인트를 못 읽으면 모자람을 단정하지 않고 목록은 그린다', async () => {
    mocks.readRealSteps.mockResolvedValue({ sync: true, lockedOpened: false })
    mocks.readLockedOpenTarget.mockResolvedValue({ itemId: 'item-1', pointsRequired: 30 })
    mocks.readPointBalance.mockRejectedValue(new Error('wallet down'))
    const state = await getOnboardingQuestCard('u1', { stravaConnected: true })
    expect(state).toMatchObject({ kind: 'real', real: { current: { step: 'locked', target: { itemId: 'item-1', need: 30 }, shortage: null } } })
    expect(errorSpy).toHaveBeenCalled()
  })

  it('열러 갈 잠긴 개체를 못 읽으면 개체를 모르는 채로 목록은 그리고 가진 포인트도 읽지 않는다', async () => {
    mocks.readRealSteps.mockResolvedValue({ sync: true, lockedOpened: false })
    mocks.readLockedOpenTarget.mockRejectedValue(new Error('boom'))
    const state = await getOnboardingQuestCard('u1', { stravaConnected: true })
    expect(state).toMatchObject({ kind: 'real', real: { doneCount: 1, current: { step: 'locked', target: null } } })
    expect(mocks.readPointBalance).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalled()
  })

  it('개체가 없으면(null) 일반 길이고 가진 포인트를 읽지 않는다', async () => {
    mocks.readRealSteps.mockResolvedValue({ sync: true, lockedOpened: false })
    mocks.readLockedOpenTarget.mockResolvedValue(null)
    const state = await getOnboardingQuestCard('u1', { stravaConnected: true })
    expect(state).toMatchObject({ real: { current: { step: 'locked', target: null, shortage: null } } })
    expect(mocks.readPointBalance).not.toHaveBeenCalled()
  })
})
