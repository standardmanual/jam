/**
 * 어드민 아이템 배지 개체 목록의 잠김 읽기 표시 (티켓 20261018_0051 2회)
 *
 * 고정하는 것: 잠긴 개체는 채운 양과 필요한 양을 함께 적고, 열린 개체·연 개체·잠금 칸을 못 읽은 옛 행은 잠기지 않은 표시다.
 */
import { describe, it, expect } from 'vitest'
import { describeItemLock } from '../item-badge-status'

describe('describeItemLock', () => {
  it('잠긴 개체는 «잠김 채운 양/필요한 양잼»으로 적는다', () => {
    expect(describeItemLock({ locked: true, unlockRequired: 60, unlockFilled: 30, unlockedAt: null })).toEqual({
      state: 'locked',
      label: '잠김 30/60잼',
    })
  })

  it('채운 양이 비어 있으면 0으로 본다', () => {
    expect(describeItemLock({ locked: true, unlockRequired: 120, unlockFilled: null, unlockedAt: null }).label).toBe(
      '잠김 0/120잼'
    )
  })

  it('필요한 양이 없는 비정상 행도 잠김으로 표시한다', () => {
    expect(describeItemLock({ locked: true, unlockRequired: null, unlockFilled: 0, unlockedAt: null })).toEqual({
      state: 'locked',
      label: '잠김',
    })
  })

  it('잠겼다가 연 개체는 «연 개체»다', () => {
    expect(
      describeItemLock({ locked: false, unlockRequired: 60, unlockFilled: 60, unlockedAt: '2026-10-18T00:00:00Z' })
    ).toEqual({ state: 'unlocked', label: '연 개체' })
  })

  it('처음부터 열린 개체와 잠금 칸을 못 읽은 옛 행은 «열림»이다', () => {
    const empty = { unlockRequired: null, unlockFilled: 0, unlockedAt: null }
    expect(describeItemLock({ locked: false, ...empty })).toEqual({ state: 'open', label: '열림' })
    expect(describeItemLock({ locked: null, ...empty })).toEqual({ state: 'open', label: '열림' })
  })
})
