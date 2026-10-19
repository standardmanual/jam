/**
 * 드랍·픽업이 «다시 볼 지표»를 정하는 규칙 테스트 (티켓 20261001_0632)
 *
 * 순수 함수라 DB 모킹이 없다. 픽업은 세 갈래다: 자기 드랍 / 놓은 사람이 없는 드랍(시스템·탈퇴) / 다른 유저의 드랍.
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/jam-action-drop-triggers.test.ts
 */
import { describe, it, expect } from 'vitest'
import { jamTriggersForDrop, jamTriggersForPickup } from '../jamActionDropTriggers'
import { JAM_ACTION_CONDITION_KEYS } from '../jamActionBadges'

describe('jamTriggersForDrop', () => {
  it('드랍은 놓은 사람의 drop_item_count만 다시 본다', () => {
    expect(jamTriggersForDrop()).toEqual(['drop_item_count'])
  })
})

describe('jamTriggersForPickup', () => {
  it('자기 드랍을 자기가 주웠다 → 줍는 사람도 놓은 사람도 판정하지 않는다', () => {
    expect(jamTriggersForPickup('user-a', 'user-a')).toEqual({ picker: [], dropper: [] })
  })

  it('시스템·탈퇴한 놓은 사람의 드랍(dropperId null) → 줍는 사람의 픽업 개체·잠긴 개체 픽업·다른 트라이브 종류 수만', () => {
    expect(jamTriggersForPickup('user-a', null)).toEqual({
      picker: ['pickup_item_count', 'locked_item_pickup_count', 'other_tribe_item_kinds_count'],
      dropper: [],
    })
  })

  it('다른 유저의 드랍 → 줍는 사람은 픽업 개체·함께 픽업·잠긴 개체 픽업·다른 트라이브 종류 수, 놓은 사람은 주워짐·내 드랍이 픽업된 아이템 수(티켓 20261019_0542 2회)', () => {
    expect(jamTriggersForPickup('user-a', 'user-b')).toEqual({
      picker: ['pickup_item_count', 'pickup_from_user_count', 'locked_item_pickup_count', 'other_tribe_item_kinds_count'],
      dropper: ['picked_up_by_user_count', 'dropped_item_picked_up_count'],
    })
  })

  it('돌려주는 모든 키는 JAM! 행동 지표 키다', () => {
    const judged = new Set<string>(JAM_ACTION_CONDITION_KEYS)
    const all = [
      ...jamTriggersForDrop(),
      ...jamTriggersForPickup('user-a', 'user-b').picker,
      ...jamTriggersForPickup('user-a', 'user-b').dropper,
      ...jamTriggersForPickup('user-a', null).picker,
    ]
    for (const key of all) expect(judged.has(key), `${key}가 JAM_ACTION_CONDITION_KEYS에 없다`).toBe(true)
  })
})
