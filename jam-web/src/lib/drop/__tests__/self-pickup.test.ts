/**
 * 자기 픽업 판별 — 횟수 지표·판정 트리거와 같은 정의인지 고정한다 (티켓 20261018_1812)
 *
 * 실행: cd jam-web && npx vitest run src/lib/drop/__tests__/self-pickup.test.ts
 */
import { describe, it, expect } from 'vitest'
import { isSelfPickup } from '../self-pickup'
import { computeDropPickupMetrics } from '@/lib/badge-engine/jamActionDropMetrics'
import { jamTriggersForPickup } from '@/lib/badge-engine/jamActionDropTriggers'

const ME = 'user-me'
const OTHER = 'user-other'

describe('isSelfPickup', () => {
  it('놓은 사람이 줍는 사람이면 자기 픽업이다', () => {
    expect(isSelfPickup({ dropper_user_id: ME }, ME)).toBe(true)
  })

  it('다른 유저의 드랍이면 자기 픽업이 아니다', () => {
    expect(isSelfPickup({ dropper_user_id: OTHER }, ME)).toBe(false)
  })

  it('놓은 사람이 없는 드랍(시스템·탈퇴)은 자기 픽업이 아니다', () => {
    expect(isSelfPickup({ dropper_user_id: null }, ME)).toBe(false)
  })
})

describe('횟수 지표·판정 트리거와 같은 정의다', () => {
  const cases: { name: string; dropper: string | null }[] = [
    { name: '자기 드랍', dropper: ME },
    { name: '다른 유저의 드랍', dropper: OTHER },
    { name: '시스템·탈퇴 유저의 드랍', dropper: null },
  ]

  it.each(cases)('$name — 지표 계산이 줍는 사람의 픽업으로 세는 때는 자기 픽업이 아닐 때뿐이다', ({ dropper }) => {
    const metrics = computeDropPickupMetrics(ME, [], [{ inventory_item_id: 'item-1', dropper_user_id: dropper }])
    expect(metrics.pickupItemCount === 1).toBe(!isSelfPickup({ dropper_user_id: dropper }, ME))
  })

  it.each(cases)('$name — 판정 트리거는 자기 픽업이면 아무 지표도 다시 보지 않는다', ({ dropper }) => {
    const triggers = jamTriggersForPickup(ME, dropper)
    const nothing = triggers.picker.length === 0 && triggers.dropper.length === 0
    expect(nothing).toBe(isSelfPickup({ dropper_user_id: dropper }, ME))
  })
})
