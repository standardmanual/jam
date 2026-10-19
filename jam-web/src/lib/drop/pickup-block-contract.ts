/**
 * 픽업이 막힌 까닭 계약 — 서버와 클라이언트가 함께 읽는 순수 상수·판정 (티켓 20261018_1817, 운영 로직 7.3·9.5절)
 *
 * 픽업 API(`/api/drops/[dropId]/pickup`)는 사용자가 잘못한 것이 아니라 «지금은 안 되는 까닭»으로 거절할 때 문구와 함께 `code`를 싣는다.
 * 화면(`PoiCarouselModal`)은 이 `code`로 안내 방식을 가른다: 가득 참은 시트 안 인라인 안내, 장소 차단은 인라인 안내와 [픽업] 비활성,
 * 이용 정지는 info 토스트, 사라진 드랍(꺼진 장소 포함)은 info 토스트 후 카드 닫기, 이미 누가 픽업함은 info 토스트다.
 * 꺼진 장소와 없는 드랍은 서버가 같은 404·같은 문구로 닫으므로(꺼진 장소에 드랍이 남아 있다는 정보를 주지 않는다) 코드도 하나(`drop_gone`)다.
 *
 * 이 파일은 `suspension-contract`(상수)만 가져온다 — 클라이언트 컴포넌트가 가져와도 서버 모듈이 번들에 끌려오지 않는다.
 */
import { USER_SUSPENDED_CODE } from '@/lib/suspension/suspension-contract'

/** 픽업 거절 응답이 싣는 `code` 값 */
export const PICKUP_BLOCK_CODE = {
  /** 인벤토리가 가득 차 받을 칸이 없다 — 422 */
  inventoryFull: 'inventory_full',
  /** 이 장소의 픽업이 차단돼 있다(이동 속도 제재) — 403 */
  poiBlocked: 'poi_blocked',
  /** 드랍이 사라졌거나 장소가 꺼져 있다 — 404 */
  dropGone: 'drop_gone',
  /** 다른 사람이 먼저 픽업했다 — 409 */
  alreadyPickedUp: 'already_picked_up',
} as const

/** 화면이 안내 방식을 가르는 막힘 종류 */
export type PickupBlockKind = 'suspended' | 'inventory_full' | 'poi_blocked' | 'drop_gone' | 'already_picked_up'

/** 상태 코드와 본문(이미 읽은 JSON)에서 막힘 종류를 읽는다. `code`가 없거나 모르는 값이면 null(일반 실패)이다 */
export function pickupBlockKind(status: number, body: unknown): PickupBlockKind | null {
  if (!body || typeof body !== 'object') return null
  const code = (body as { code?: unknown }).code
  if (status === 403 && code === USER_SUSPENDED_CODE) return 'suspended'
  if (status === 422 && code === PICKUP_BLOCK_CODE.inventoryFull) return 'inventory_full'
  if (status === 403 && code === PICKUP_BLOCK_CODE.poiBlocked) return 'poi_blocked'
  if (status === 404 && code === PICKUP_BLOCK_CODE.dropGone) return 'drop_gone'
  if (status === 409 && code === PICKUP_BLOCK_CODE.alreadyPickedUp) return 'already_picked_up'
  return null
}
