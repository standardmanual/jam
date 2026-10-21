/**
 * `resolveRealStepsView` 외 — «JAM! 시작하기» 카드의 실제 3단계 보기 계산 (티켓 20261021_1248 2회)
 *
 * 고정하는 것:
 * - 지금 할 차례 행은 아직 안 한 첫 단계다. 세 단계는 순서와 무관하게 독립이라 ③이 ②보다 먼저 체크될 수 있다.
 * - 잼 모자람은 실제로 모자랄 때만 값이 있다. 가진 잼이 필요한 잼과 같으면(여유 0) 미리 경고하지 않는다.
 * - 필요한 잼은 이미 채운 양을 뺀 «더 채울 양»이다.
 * - 캡슐 상태를 읽지 못하면 ②는 일반 설명(`unknown`)이고 잼 모자람은 단정하지 않는다.
 * - 인벤토리 빈칸 모자람은 캡슐이 가득 찼을 때만 나온다.
 * DB에 닿지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/onboarding-quest/__tests__/real-view.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { CapsuleStatus } from '@/lib/capsule/capsule-contract'
import {
  isRealViewDone,
  needsLockedTarget,
  resolveRealStepRows,
  resolveRealStepsView,
  type RealStepsViewInput,
} from '../real-view'
import type { RealStepsProgress } from '../real-steps'

const steps = (over: Partial<RealStepsProgress> = {}): RealStepsProgress => ({
  sync: false,
  capsuleOpened: false,
  lockedOpened: false,
  ...over,
})

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

const input = (over: Partial<RealStepsViewInput> = {}): RealStepsViewInput => ({
  steps: steps(),
  stravaConnected: true,
  capsule: null,
  lockedTarget: null,
  ...over,
})

describe('resolveRealStepRows — 지금 할 차례 행', () => {
  it('아무것도 안 했으면 ①이 지금 할 차례이고 나머지는 아직이다', () => {
    expect(resolveRealStepRows(steps())).toEqual([
      { key: 'sync', state: 'current' },
      { key: 'capsule', state: 'pending' },
      { key: 'locked', state: 'pending' },
    ])
  })

  it('첫 동기화를 마치면 ②가 지금 할 차례다', () => {
    expect(resolveRealStepRows(steps({ sync: true })).map((r) => r.state)).toEqual(['done', 'current', 'pending'])
  })

  it('③이 ②보다 먼저 체크될 수 있다 — 각 단계는 독립이다', () => {
    expect(resolveRealStepRows(steps({ sync: true, lockedOpened: true })).map((r) => r.state)).toEqual(['done', 'current', 'done'])
  })

  it('①이 안 된 채로 ②·③이 끝나도 ①이 지금 할 차례다', () => {
    expect(resolveRealStepRows(steps({ capsuleOpened: true, lockedOpened: true })).map((r) => r.state)).toEqual([
      'current',
      'done',
      'done',
    ])
  })

  it('세 단계를 모두 마치면 지금 할 차례가 없다', () => {
    const rows = resolveRealStepRows(steps({ sync: true, capsuleOpened: true, lockedOpened: true }))
    expect(rows.map((r) => r.state)).toEqual(['done', 'done', 'done'])
  })
})

describe('needsLockedTarget — 열러 갈 개체는 ③이 차례일 때만 읽는다', () => {
  it('첫 동기화와 캡슐 열기를 마치고 잠긴 열기만 남았을 때만 참이다', () => {
    expect(needsLockedTarget(steps({ sync: true, capsuleOpened: true }))).toBe(true)
    expect(needsLockedTarget(steps({ sync: true }))).toBe(false)
    expect(needsLockedTarget(steps({ sync: true, capsuleOpened: true, lockedOpened: true }))).toBe(false)
    expect(needsLockedTarget(steps({ capsuleOpened: true }))).toBe(false)
  })
})

describe('resolveRealStepsView — ① Strava 동기화', () => {
  it('연동 전: 지금 할 차례가 ①이고 연결 길로 보낸다', () => {
    const view = resolveRealStepsView(input({ stravaConnected: false }))
    expect(view.current).toEqual({ step: 'sync', stravaConnected: false })
    expect(view.doneCount).toBe(0)
    expect(view.total).toBe(3)
  })

  it('연동됨·동기화 대기: 같은 ①이고 연결돼 있다', () => {
    expect(resolveRealStepsView(input({ stravaConnected: true })).current).toEqual({ step: 'sync', stravaConnected: true })
  })
})

describe('resolveRealStepsView — ② 캡슐 열기', () => {
  const base = { steps: steps({ sync: true }) }

  it('캡슐을 채우는 중이면 더 채울 양을 싣는다', () => {
    const view = resolveRealStepsView(input({ ...base, capsule: capsule() }))
    expect(view.current).toEqual({ step: 'capsule', stage: 'filling', need: 5, shortage: null, slots: null })
    expect(view.doneCount).toBe(1)
  })

  it('가진 잼이 필요한 잼과 같으면(여유 0) 미리 경고하지 않는다', () => {
    const view = resolveRealStepsView(input({ ...base, capsule: capsule({ balance: 5 }) }))
    expect(view.current).toMatchObject({ stage: 'filling', shortage: null })
  })

  it('가진 잼이 필요한 잼보다 적으면 모자람 값을 싣는다', () => {
    const view = resolveRealStepsView(input({ ...base, capsule: capsule({ balance: 3 }) }))
    expect(view.current).toMatchObject({ stage: 'filling', need: 5, shortage: { have: 3, need: 5 } })
  })

  it('일부를 채워 둔 유저는 남은 양으로 모자람을 센다', () => {
    const view = resolveRealStepsView(input({ ...base, capsule: capsule({ filled: 3, remaining: 2, balance: 2 }) }))
    expect(view.current).toMatchObject({ stage: 'filling', need: 2, shortage: null })
    const short = resolveRealStepsView(input({ ...base, capsule: capsule({ filled: 3, remaining: 2, balance: 1 }) }))
    expect(short.current).toMatchObject({ need: 2, shortage: { have: 1, need: 2 } })
  })

  it('가득 차서 열 수 있으면 잼 모자람이 없다(가진 잼이 0이어도)', () => {
    const view = resolveRealStepsView(
      input({ ...base, capsule: capsule({ filled: 5, remaining: 0, balance: 0, openable: true, notOpenableReason: null }) })
    )
    expect(view.current).toEqual({ step: 'capsule', stage: 'ready', need: null, shortage: null, slots: null })
  })

  it('가득 찼지만 인벤토리 빈칸이 모자라면 빈칸 수를 싣는다', () => {
    const view = resolveRealStepsView(
      input({
        ...base,
        capsule: capsule({ filled: 5, remaining: 0, openable: false, notOpenableReason: 'no_free_slots', freeSlots: 1, neededSlots: 2 }),
      })
    )
    expect(view.current).toEqual({ step: 'capsule', stage: 'noSlots', need: null, shortage: null, slots: { free: 1, needed: 2 } })
  })

  it('빈칸 수를 읽지 못한 빈칸 모자람은 빈칸 수 없이 stage만 싣는다', () => {
    const view = resolveRealStepsView(
      input({
        ...base,
        capsule: {
          required: 5,
          filled: 5,
          remaining: 0,
          balance: 5,
          openable: false,
          notOpenableReason: 'no_free_slots',
        },
      })
    )
    expect(view.current).toMatchObject({ stage: 'noSlots', slots: null })
  })

  it('캡슐 상태를 읽지 못하면 일반 설명(unknown)이고 잼 모자람을 단정하지 않는다', () => {
    const view = resolveRealStepsView(input({ ...base, capsule: null }))
    expect(view.current).toEqual({ step: 'capsule', stage: 'unknown', need: null, shortage: null, slots: null })
  })
})

describe('resolveRealStepsView — ③ 잠긴 아이템 배지 열기', () => {
  const base = { steps: steps({ sync: true, capsuleOpened: true }) }
  const target = { itemId: 'item-1', required: 5, filled: 0 }

  it('열러 갈 개체의 id와 더 채울 양을 싣는다', () => {
    const view = resolveRealStepsView(input({ ...base, capsule: capsule({ balance: 5 }), lockedTarget: target }))
    expect(view.current).toEqual({ step: 'locked', target: { itemId: 'item-1', need: 5 }, shortage: null })
    expect(view.doneCount).toBe(2)
  })

  it('가진 잼이 더 채울 양보다 적으면 모자람이다', () => {
    const view = resolveRealStepsView(input({ ...base, capsule: capsule({ balance: 2 }), lockedTarget: target }))
    expect(view.current).toMatchObject({ shortage: { have: 2, need: 5 } })
  })

  it('이미 가득 채운 개체는 더 채울 양이 0이라 모자람이 없다', () => {
    const view = resolveRealStepsView(
      input({ ...base, capsule: capsule({ balance: 0 }), lockedTarget: { itemId: 'item-1', required: 5, filled: 5 } })
    )
    expect(view.current).toEqual({ step: 'locked', target: { itemId: 'item-1', need: 0 }, shortage: null })
  })

  it('개체를 모르면 target이 null이고 모자람도 단정하지 않는다', () => {
    const view = resolveRealStepsView(input({ ...base, capsule: capsule({ balance: 0 }), lockedTarget: null }))
    expect(view.current).toEqual({ step: 'locked', target: null, shortage: null })
  })

  it('캡슐 상태(가진 잼)를 읽지 못하면 모자람을 단정하지 않는다', () => {
    const view = resolveRealStepsView(input({ ...base, capsule: null, lockedTarget: target }))
    expect(view.current).toEqual({ step: 'locked', target: { itemId: 'item-1', need: 5 }, shortage: null })
  })
})

describe('resolveRealStepsView — 모두 마침', () => {
  it('세 단계를 모두 마치면 current가 null이고 완료다', () => {
    const view = resolveRealStepsView(input({ steps: steps({ sync: true, capsuleOpened: true, lockedOpened: true }) }))
    expect(view.current).toBeNull()
    expect(view.doneCount).toBe(3)
    expect(isRealViewDone(view)).toBe(true)
  })

  it('하나라도 남으면 완료가 아니다', () => {
    expect(isRealViewDone(resolveRealStepsView(input({ steps: steps({ sync: true }) })))).toBe(false)
  })
})
