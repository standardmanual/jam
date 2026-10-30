/**
 * 캡슐 화면용 순수 변환 (티켓 20261018_0054 1회)
 *
 * 실행: cd jam-web && npx vitest run src/lib/capsule/__tests__/capsule-view.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { CapsuleStatus } from '../capsule-contract'
import { capsulePercent, capsuleViewStatus, statusAfterOpen, withInsufficientSlots } from '../capsule-view'

const status = (over: Partial<CapsuleStatus> = {}): CapsuleStatus => ({
  required: 300,
  filled: 120,
  remaining: 180,
  balance: 50,
  openable: false,
  notOpenableReason: 'not_full',
  pendingCount: 0,
  jamBlocked: false,
  alertStage: 0,
  claim: { available: false, blockedReason: null, freeSlots: 40, neededSlots: 2 },
  notice: 'none',
  ...over,
})

describe('capsuleViewStatus', () => {
  it('아직 다 채우지 못했으면 filling이다', () => {
    expect(capsuleViewStatus(status())).toBe('filling')
  })

  it('열 수 있으면 ready다', () => {
    expect(capsuleViewStatus(status({ filled: 300, remaining: 0, openable: true, notOpenableReason: null }))).toBe('ready')
  })

  it('못 여는 까닭이 빈칸 모자람이면 noSlots다', () => {
    expect(
      capsuleViewStatus(status({ filled: 300, remaining: 0, openable: false, notOpenableReason: 'no_free_slots', freeSlots: 1, neededSlots: 3 }))
    ).toBe('noSlots')
  })

  it('서버 값만 본다 — 다 채웠어도 열 수 있다는 응답이 아니면 ready로 올리지 않는다', () => {
    expect(capsuleViewStatus(status({ filled: 300, remaining: 0, openable: false, notOpenableReason: null }))).toBe('filling')
  })
})

describe('capsulePercent', () => {
  it('채운 양을 필요량으로 나눈 비율이다', () => {
    expect(capsulePercent({ required: 300, filled: 120 })).toBe(40)
    expect(capsulePercent({ required: 300, filled: 0 })).toBe(0)
    expect(capsulePercent({ required: 300, filled: 300 })).toBe(100)
  })

  it('0~100으로 자른다', () => {
    expect(capsulePercent({ required: 300, filled: 900 })).toBe(100)
    expect(capsulePercent({ required: 300, filled: -10 })).toBe(0)
  })

  it('필요량이 0 이하면 0이다', () => {
    expect(capsulePercent({ required: 0, filled: 0 })).toBe(0)
    expect(capsulePercent({ required: -1, filled: 5 })).toBe(0)
  })
})

describe('withInsufficientSlots', () => {
  it('열기 거절이 준 빈칸 수를 싣고 noSlots로 바꾼다', () => {
    const next = withInsufficientSlots(
      status({ filled: 300, remaining: 0, openable: true, notOpenableReason: null }),
      { freeSlots: 1, neededSlots: 3 }
    )
    expect(next).toMatchObject({ openable: false, notOpenableReason: 'no_free_slots', freeSlots: 1, neededSlots: 3, filled: 300, balance: 50 })
    expect(capsuleViewStatus(next)).toBe('noSlots')
  })

  it('응답에 빈칸 수가 없으면 이전 값을 지우지 않는다', () => {
    const next = withInsufficientSlots(status({ freeSlots: 2, neededSlots: 3 }), {})
    expect(next.freeSlots).toBe(2)
    expect(next.neededSlots).toBe(3)
  })
})

describe('statusAfterOpen', () => {
  it('다음 캡슐의 필요량·채운 양으로 옮기고 잼 잔액은 그대로다', () => {
    const next = statusAfterOpen(status({ filled: 300, remaining: 0, balance: 50, openable: true, notOpenableReason: null }), { required: 400, filled: 0 })
    // 보류·안내 값은 이전 상태를 그대로 둔다 — 뒤따르는 GET /api/capsule 응답이 정한다
    expect(next).toEqual({ ...status(), required: 400, filled: 0, remaining: 400, balance: 50, openable: false, notOpenableReason: 'not_full' })
    expect(capsuleViewStatus(next)).toBe('filling')
  })
})
