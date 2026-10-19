/**
 * 드랍·픽업 행동이 «다시 볼 지표»를 정하는 규칙 (순수 함수, 티켓 20261001_0632, 상위 20260930_1456 ②)
 *
 * 드랍·픽업 라우트(`/api/drops`, `/api/drops/[dropId]/pickup`)가 성공한 뒤 `runJamActionEvaluation`에 넘기는
 * `triggers`를 여기서 정한다. 라우트에서 분기를 빼 두면 세 갈래(자기 드랍·시스템/탈퇴 드랍·다른 유저 드랍)를
 * DB 없이 테스트할 수 있다. 지표 정의와 세는 규칙은 `jamActionDropMetrics.ts`에 있다.
 */
import type { JamActionTrigger } from './jamActionBadges'

/** 픽업 한 건이 두 사람에게 일으키는 판정 — 줍는 사람과 놓은 사람 각각 다시 볼 지표 */
export interface PickupJamTriggers {
  picker: JamActionTrigger[]
  dropper: JamActionTrigger[]
}

/** 줍는 사람이 개체를 받으면 다시 볼 지표 — 잠긴 채 주웠는지와 다른 트라이브 종류 수 */
const PICKER_HELD_ITEM_TRIGGERS: JamActionTrigger[] = ['locked_item_pickup_count', 'other_tribe_item_kinds_count']

/** 드랍이 성공하면 놓은 사람의 드랍 아이템 수를 다시 본다 */
export function jamTriggersForDrop(): JamActionTrigger[] {
  return ['drop_item_count']
}

/**
 * 픽업이 성공하면 줍는 사람과 놓은 사람을 각각 다시 본다.
 *
 *  - 자기 드랍을 자기가 주웠다 → 어느 쪽도 세지 않는다(`{ picker: [], dropper: [] }`)
 *  - 놓은 사람이 없다(시스템 드랍·탈퇴) → 줍는 사람의 `pickup_item_count`만. 함께 줍기·주워짐은 상대가 없어 세지 않는다
 *  - 다른 유저의 드랍 → 줍는 사람은 `pickup_item_count`·`pickup_from_user_count`, 놓은 사람은 `picked_up_by_user_count`·
 *    `dropped_item_picked_up_count`(티켓 20261019_0542 2회, 8-4)
 *
 * 줍는 사람은 어느 쪽이든 `locked_item_pickup_count`(픽업 당시 잠긴 개체)와 `other_tribe_item_kinds_count`(가진 개체가 늘어남)도
 * 다시 본다(티켓 20261018_1815). 놓은 사람의 가진 개체는 줄기만 하므로 보지 않는다.
 */
export function jamTriggersForPickup(pickerId: string, dropperId: string | null): PickupJamTriggers {
  if (dropperId === pickerId) return { picker: [], dropper: [] }
  if (dropperId === null) return { picker: ['pickup_item_count', ...PICKER_HELD_ITEM_TRIGGERS], dropper: [] }
  return {
    picker: ['pickup_item_count', 'pickup_from_user_count', ...PICKER_HELD_ITEM_TRIGGERS],
    dropper: ['picked_up_by_user_count', 'dropped_item_picked_up_count'],
  }
}
