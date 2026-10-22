/**
 * "인벤토리 슬롯이 부족하면 아이템배지 지급을 조용히 생략한다"는 정책의 공통 판정 함수.
 *
 * missions/rewards.ts · 옛 drop-engine/index.ts(티켓 20261022_0938에서 삭제) · combine/index.ts 세 곳에 동일한 조건문
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

/** 남은 칸이 «적다»고 보는 경계(남은 칸 3개 이하). 알림 단계(3·1)와 `warning.ts`의 경고 경계와 같은 값이다 */
export const INVENTORY_SLOTS_LOW_MAX = 3

/** 남은 칸이 1~3개이면 true. 0개는 «가득 참»이라 따로 다루고(안내 카드), 4개 이상은 평소 표시다(티켓 20261018_0056) */
export function isInventorySlotsLow(remainingSlots: number): boolean {
  return remainingSlots >= 1 && remainingSlots <= INVENTORY_SLOTS_LOW_MAX
}

/**
 * `grant_inventory_item()` RPC(마이그레이션 173, 티켓 20260914_1813)의 반환 형태.
 * "지급 + used_slots 증가"를 한 트랜잭션으로 묶어 read-then-write 레이스를 없앤다 —
 * missions/rewards.ts · combine/index.ts와 옛 drop-engine/index.ts(티켓 20261022_0938에서 삭제)의 지급 경로가 공용했다.
 * `slot_full`을 판별 가능한 유니온으로 노출해, 새 지급 경로가 추가될 때 이 분기를
 * 빠뜨리면 타입 에러가 나게 한다.
 */
export type GrantInventoryItemResult =
  | { ok: true; itemId: string; usedSlots: number }
  | { ok: false; reason: 'slot_full' | 'inventory_not_found' }

/**
 * `release_inventory_slots()` RPC(마이그레이션 173)의 반환 형태. 조합(combine) 소각 직후
 * 칸을 반환하는 반대 방향 — 마찬가지로 inventory 행 락 안에서 원자적으로 처리된다.
 */
export type ReleaseInventorySlotsResult =
  | { ok: true; usedSlots: number }
  | { ok: false; reason: 'inventory_not_found' }
