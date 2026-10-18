/**
 * 잠긴 채 드랍·픽업된 개체의 피드 표시 (티켓 20261018_1837, 운영 로직 7.3절)
 *
 * 잠긴 개체는 열기 전까지 이름·그림·배지 id·일련번호를 어디에도 보이지 않는다. 프로필 페이지가 `poi_drops`를 훑어
 * «놓은 드랍»·«주운 드랍» 항목을 합성할 때, 개체의 잠김을 보지 않고 `badges`의 이름·그림을 그대로 읽으면 가림이 뚫린다.
 * 이 모듈은 그 판정과 가린 뒤의 메타를 한 곳에 둔다 — 서버가 클라이언트로 내리는 값에서 비운다(화면에서 가리지 않는다).
 *
 * 서버 전용 모듈을 가져오지 않는다 — 순수 함수다.
 */
import { d } from '@/lib/i18n'

/** `poi_drops`를 `inventory_items!poi_drops_inventory_item_id_fkey ( locked )`와 함께 읽은 행에서 판정에 쓰는 부분 */
export interface DropRowLockInfo {
  inventory_item_id: string | null
  inventory_items: { locked: boolean | null } | null
}

/**
 * 이 드랍이 가리키는 개체가 잠겼는가. **열린 것이 확인될 때만 열린 것으로 본다** — 개체가 연결돼 있는데 잠김을 읽지 못했거나
 * (`inventory_items`가 비었거나 `locked`가 비었다) 값이 `true`가 아니면 잠긴 것으로 본다(닫는 쪽).
 * 개체 연결 자체가 없는 과거 드랍(마이그레이션 이전에 끝난 것)은 잠글 개체가 없으므로 열린 것이다.
 */
export function isDropRowLocked(row: DropRowLockInfo): boolean {
  if (!row.inventory_item_id) return false
  return row.inventory_items?.locked !== false
}

/**
 * 잠긴 개체의 피드 메타 — 이름은 «잠긴 아이템 배지», 등급만 싣는다. 배지 id·그림은 비운다.
 * `badge_id`가 비어 있으면 피드가 «상세» 버튼(`/badges/{id}`)을 그리지 않고 그림은 자리표시 아이콘으로 떨어진다.
 */
export function lockedDropFeedMeta(rarity: string | null | undefined): {
  badge_id: ''
  badge_name: string
  badge_image_url: ''
  rarity: string | null
} {
  return {
    badge_id: '',
    badge_name: d.lockedItem.card.name,
    badge_image_url: '',
    rarity: rarity ?? null,
  }
}
