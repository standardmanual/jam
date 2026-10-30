/**
 * `resolveRealStepsView` 외 — «JAM! 시작하기» 카드의 실제 2단계 보기 계산 (티켓 20261021_1248 2회, 2단계·포인트 기준 20261028_1738 1회)
 *
 * 고정하는 것:
 * - 지금 할 차례 행은 아직 안 한 첫 단계다. 두 단계는 순서와 무관하게 독립이라 ②가 ①보다 먼저 체크될 수 있다.
 * - 포인트 모자람은 실제로 모자랄 때만 값이 있다. 가진 포인트가 필요 포인트와 같으면(여유 0) 미리 경고하지 않고, 필요 포인트가 0이면 모자랄 수 없다.
 * - 가진 포인트를 읽지 못했거나(null) 개체를 모르면 모자람을 단정하지 않는다.
 * - 열러 갈 개체는 ①을 마치고 ②가 남았을 때만 읽고, 가진 포인트는 필요 포인트가 0보다 클 때만 읽는다.
 * - 캡슐 열기·잼·인벤토리 빈칸은 보기에 없다.
 * DB에 닿지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/onboarding-quest/__tests__/real-view.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  isRealViewDone,
  needsLockedTarget,
  needsPointBalance,
  resolveRealStepRows,
  resolveRealStepsView,
  REAL_STEP_KEYS,
  type RealStepsViewInput,
} from '../real-view'
import type { RealStepsProgress } from '../real-steps'

const steps = (over: Partial<RealStepsProgress> = {}): RealStepsProgress => ({
  sync: false,
  lockedOpened: false,
  ...over,
})

const input = (over: Partial<RealStepsViewInput> = {}): RealStepsViewInput => ({
  steps: steps(),
  stravaConnected: true,
  lockedTarget: null,
  pointBalance: null,
  ...over,
})

describe('단계 키', () => {
  it('두 단계이고 순서는 sync, locked다', () => {
    expect([...REAL_STEP_KEYS]).toEqual(['sync', 'locked'])
  })
})

describe('resolveRealStepRows — 지금 할 차례 행', () => {
  it('아무것도 안 했으면 ①이 지금 할 차례이고 ②는 아직이다', () => {
    expect(resolveRealStepRows(steps())).toEqual([
      { key: 'sync', state: 'current' },
      { key: 'locked', state: 'pending' },
    ])
  })

  it('첫 동기화를 마치면 ②가 지금 할 차례다', () => {
    expect(resolveRealStepRows(steps({ sync: true })).map((r) => r.state)).toEqual(['done', 'current'])
  })

  it('②가 ①보다 먼저 체크될 수 있다 — 각 단계는 독립이라 ①이 지금 할 차례로 남는다', () => {
    expect(resolveRealStepRows(steps({ lockedOpened: true })).map((r) => r.state)).toEqual(['current', 'done'])
  })

  it('두 단계를 모두 마치면 지금 할 차례가 없다', () => {
    expect(resolveRealStepRows(steps({ sync: true, lockedOpened: true })).map((r) => r.state)).toEqual(['done', 'done'])
  })
})

describe('needsLockedTarget — 열러 갈 개체는 ②가 차례일 때만 읽는다', () => {
  it('첫 동기화를 마치고 잠긴 열기만 남았을 때만 참이다', () => {
    expect(needsLockedTarget(steps({ sync: true }))).toBe(true)
    expect(needsLockedTarget(steps())).toBe(false)
    expect(needsLockedTarget(steps({ lockedOpened: true }))).toBe(false)
    expect(needsLockedTarget(steps({ sync: true, lockedOpened: true }))).toBe(false)
  })
})

describe('needsPointBalance — 가진 포인트는 필요 포인트가 0보다 클 때만 읽는다', () => {
  it('개체를 모르면 읽지 않는다', () => {
    expect(needsPointBalance(null)).toBe(false)
  })

  it('필요 포인트가 0이면 읽지 않는다', () => {
    expect(needsPointBalance({ itemId: 'item-1', pointsRequired: 0 })).toBe(false)
  })

  it('필요 포인트가 0보다 크면 읽는다', () => {
    expect(needsPointBalance({ itemId: 'item-1', pointsRequired: 30 })).toBe(true)
  })
})

describe('resolveRealStepsView — ① Strava 동기화', () => {
  it('연동 전: 지금 할 차례가 ①이고 연결 길로 보낸다', () => {
    const view = resolveRealStepsView(input({ stravaConnected: false }))
    expect(view.current).toEqual({ step: 'sync', stravaConnected: false })
    expect(view.doneCount).toBe(0)
    expect(view.total).toBe(2)
  })

  it('연동됨·동기화 대기: 같은 ①이고 연결돼 있다', () => {
    expect(resolveRealStepsView(input({ stravaConnected: true })).current).toEqual({ step: 'sync', stravaConnected: true })
  })
})

describe('resolveRealStepsView — ② 잠긴 아이템 배지 열기', () => {
  const base = { steps: steps({ sync: true }) }

  it('열러 갈 개체의 id와 필요 포인트를 싣는다', () => {
    const view = resolveRealStepsView(input({ ...base, lockedTarget: { itemId: 'item-1', pointsRequired: 30 }, pointBalance: 100 }))
    expect(view.current).toEqual({ step: 'locked', target: { itemId: 'item-1', need: 30 }, shortage: null })
    expect(view.doneCount).toBe(1)
  })

  it('가진 포인트가 필요 포인트보다 적으면 모자람 값을 싣는다', () => {
    const view = resolveRealStepsView(input({ ...base, lockedTarget: { itemId: 'item-1', pointsRequired: 30 }, pointBalance: 12 }))
    expect(view.current).toEqual({ step: 'locked', target: { itemId: 'item-1', need: 30 }, shortage: { have: 12, need: 30 } })
  })

  it('가진 포인트가 필요 포인트와 같으면(여유 0) 미리 경고하지 않는다', () => {
    const view = resolveRealStepsView(input({ ...base, lockedTarget: { itemId: 'item-1', pointsRequired: 30 }, pointBalance: 30 }))
    expect(view.current).toMatchObject({ shortage: null })
  })

  it('지갑 행이 없어 가진 포인트가 0이면 필요 포인트가 있는 개체는 모자람이다', () => {
    const view = resolveRealStepsView(input({ ...base, lockedTarget: { itemId: 'item-1', pointsRequired: 30 }, pointBalance: 0 }))
    expect(view.current).toMatchObject({ shortage: { have: 0, need: 30 } })
  })

  it('필요 포인트가 0이면 가진 포인트가 0이어도 모자람이 없다', () => {
    const view = resolveRealStepsView(input({ ...base, lockedTarget: { itemId: 'item-1', pointsRequired: 0 }, pointBalance: 0 }))
    expect(view.current).toEqual({ step: 'locked', target: { itemId: 'item-1', need: 0 }, shortage: null })
  })

  it('가진 포인트를 읽지 못했으면(null) 모자람을 단정하지 않는다', () => {
    const view = resolveRealStepsView(input({ ...base, lockedTarget: { itemId: 'item-1', pointsRequired: 30 }, pointBalance: null }))
    expect(view.current).toEqual({ step: 'locked', target: { itemId: 'item-1', need: 30 }, shortage: null })
  })

  it('개체를 모르면 target이 null이고 모자람도 단정하지 않는다', () => {
    const view = resolveRealStepsView(input({ ...base, lockedTarget: null, pointBalance: 0 }))
    expect(view.current).toEqual({ step: 'locked', target: null, shortage: null })
  })
})

describe('resolveRealStepsView — 모두 마침', () => {
  it('두 단계를 모두 마치면 current가 null이고 완료다', () => {
    const view = resolveRealStepsView(input({ steps: steps({ sync: true, lockedOpened: true }) }))
    expect(view.current).toBeNull()
    expect(view.doneCount).toBe(2)
    expect(isRealViewDone(view)).toBe(true)
  })

  it('하나라도 남으면 완료가 아니다', () => {
    expect(isRealViewDone(resolveRealStepsView(input({ steps: steps({ sync: true }) })))).toBe(false)
    expect(isRealViewDone(resolveRealStepsView(input({ steps: steps({ lockedOpened: true }) })))).toBe(false)
  })
})
