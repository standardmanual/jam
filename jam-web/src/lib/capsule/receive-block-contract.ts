/**
 * 캡슐 받기 막힘 계약 — 서버와 클라이언트가 함께 읽는 순수 타입·상수 (티켓 20261105_0101, 상위 20261105_0100)
 *
 * 서버 모듈(`receive-block.ts`)과 분리한 이유: 클라이언트(동기화 버튼 흐름)가 이 상수를 가져와도 서버 모듈이
 * 번들에 끌려오지 않게 하기 위해서다(`pending-items-contract.ts`와 같은 이유). 이 파일은 아무것도 가져오지 않는다.
 */

/** 대기 보상이 있어 동기화가 막혔을 때`POST /api/strava/sync`가 409로 내려주는 `code` 값 */
export const CAPSULE_INVENTORY_BLOCKED_CODE = 'capsule_inventory_blocked'

/** DB 함수 `capsule_receive_blocked`가 돌려주는 모양 */
export interface CapsuleReceiveBlockedResult {
  /** 대기 보상(`capsule_pending_rewards`)이 있다 */
  blocked: boolean
  /** 대기 개수 — 빈칸이 모자라 먼저 뽑아 저장한 결과의 개수 합 */
  pending: number
  /** 지금 인벤토리 빈칸 수 */
  free: number
  /** 대기 보상을 받으려면 필요한 빈칸 수(= `pending`) */
  needed: number
  /** 더 비워야 하는 칸 수(`max(0, pending - free)`) */
  shortfall: number
}

/** 막혔을 때의 409 응답 본문 */
export interface CapsuleInventoryBlockedResponse {
  error: string
  code: typeof CAPSULE_INVENTORY_BLOCKED_CODE
  free: number
  needed: number
}

/** 홈 막힘 배너(`CapsuleBlockedBanner`)가 받는 값 — 서버 로더(`home-blocked-banner.ts`)의 반환과 같은 모양이다(티켓 20261105_0104) */
export interface HomeCapsuleBlockedBannerView {
  /** 얻었지만 아직 넣지 못한 대기 보상 개수(`pending`, 최소 1) */
  pending: number
  /** 부족한 빈칸 수(`needed - free`, 최소 1) */
  shortfall: number
}
