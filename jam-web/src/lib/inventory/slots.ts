/**
 * "인벤토리 슬롯이 부족하면 아이템배지 지급을 조용히 생략한다"는 정책의 공통 판정 함수.
 *
 * missions/rewards.ts · drop-engine/index.ts · combine/index.ts 세 곳에 동일한 조건문
 * (`used_slots >= max_slots`)이 각각 구현돼 있던 것을 추출했다 (티켓 20260912_2116).
 * 정책이 바뀌면(예: 슬롯 초과 시에도 강제 지급) 이 함수 한 곳만 고치면 된다.
 */
export interface InventorySlotState {
  used_slots: number
  max_slots: number
}

/** 슬롯이 가득 차 있어 아이템배지를 더 지급할 수 없으면 true. */
export function isInventoryFull(inventory: InventorySlotState): boolean {
  return inventory.used_slots >= inventory.max_slots
}
