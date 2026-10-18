/**
 * 남은 칸 «적음» 경계 (티켓 20261018_0056) — 인벤토리 화면의 강조 줄이 쓰는 판정
 *
 * 실행: cd jam-web && npx vitest run src/lib/inventory/__tests__/slots.test.ts
 */
import { describe, expect, it } from 'vitest'
import { INVENTORY_SLOTS_LOW_MAX, isInventorySlotsLow } from '../slots'
import { INVENTORY_LOW_SLOTS_THRESHOLD } from '@/lib/notifications/warning'

describe('isInventorySlotsLow', () => {
  it('남은 칸이 1~3개일 때만 참이다', () => {
    expect([0, 1, 2, 3, 4, 50].map(isInventorySlotsLow)).toEqual([false, true, true, true, false, false])
  })

  it('경고 경계(알림 단계·경고면 판정)와 같은 값이다', () => {
    expect(INVENTORY_SLOTS_LOW_MAX).toBe(INVENTORY_LOW_SLOTS_THRESHOLD)
  })
})
