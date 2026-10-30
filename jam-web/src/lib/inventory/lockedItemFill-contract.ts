/**
 * 잠긴 아이템 배지 열기·조회 계약 — 서버와 클라이언트가 함께 읽는 순수 타입·상수 (티켓 20261018_0053, 운영 로직 7.2·7.3절)
 *
 * 서버 모듈(`lockedItemFill.ts`)과 분리한 이유: 잠긴 개체 화면(3-4)이 이 파일을 가져와도 `@/lib/supabase/server`·`next/headers`가
 * 번들에 끌려오지 않게 하기 위해서다. **이 파일은 아무것도 가져오지 않는다.**
 *
 * 응답 원칙(7.3절): 열기 전에는 이름·그림·설명·컬렉션·트라이브·일련번호를 어떤 응답에도 싣지 않는다. 열린 뒤 열기 응답에만 싣는다.
 */

/** 아이템 배지 등급 — 이 파일은 아무것도 가져오지 않아 `BadgeRarity`를 가져오지 않고 같은 값을 적는다 */
export type LockedItemRarity = 'common' | 'rare' | 'epic' | 'mystic'

/**
 * 열기가 거절되는 경우의 코드. DB 함수 `locked_item_open_points`(마이그레이션 304)의 `error` 값은 `user_suspended`·`item_not_found`·`not_locked`·`insufficient_points`다.
 * `not_full`은 옛 함수 `locked_item_open` 호환을 위해 남긴 코드다 — 새 함수는 돌려주지 않는다.
 */
export const LOCKED_ITEM_OPEN_ERROR_CODES = ['user_suspended', 'item_not_found', 'not_locked', 'not_full', 'insufficient_points'] as const

export type LockedItemOpenErrorCode = (typeof LOCKED_ITEM_OPEN_ERROR_CODES)[number]

/** 잠긴 개체 거절 코드 전체(열기 + 조회) */
export type LockedItemErrorCode = LockedItemOpenErrorCode

/** 개체 id가 UUID 모양인가 — 아니면 DB를 부르기 전에 `item_not_found`로 닫는다 */
export function isLockedItemId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

/** 조회 응답 — 채운 양·필요량·가진 잼·여는 포인트·가진 포인트·열 수 있는지만 싣는다(이름·그림 등은 싣지 않는다) */
export interface LockedItemStatus {
  itemId: string
  /** 아직 잠겨 있는가. 한 번 열린 개체는 false로 남는다 */
  locked: boolean
  /** 배정 때 고정된 필요량. 잠긴 적 없는 개체면 null */
  required: number | null
  /** 지금까지 채운 양 */
  filled: number
  /** 남은 양(`required - filled`, 0 미만은 0). 필요량이 없으면 0 */
  remaining: number
  /** 유저가 가진 잼 */
  balance: number
  /** 여는 데 드는 포인트. 개체에 고정된 값(`unlock_points_required`)이고, 비어 있으면 등급별 정책값(`jam_policy.locked_points_*`)이다. 잠기지 않았고 값도 없으면 null */
  pointsRequired: number | null
  /** 유저가 가진 포인트(포인트 지갑 잔액). 지갑 행이 없으면 0 */
  pointBalance: number
  /** 지금 열 수 있는지 — 잠겨 있고 다 채웠다. 인벤토리 빈칸은 보지 않는다 */
  openable: boolean
}

/** 열린 뒤에만 싣는 개체 정보 */
export interface LockedItemOpenedInfo {
  name: string
  imageUrl: string | null
  description: string
  rarity: LockedItemRarity | null
  collection: { id: string; name: string } | null
  tribe: { id: string; name: string } | null
}

/** 열기 성공 응답 */
export interface LockedItemOpenPayload {
  itemId: string
  badgeId: string
  /** 열려도 그대로인 일련번호 */
  serialNumber: number | null
  /** 일련번호 앞 4자(알파벳). 화면의 일련번호 표시(`ItemSerialCode`)가 번호와 함께 쓴다. 읽지 못하면 null이다(티켓 20261018_0054 2회) */
  serialPrefix: string | null
  /** 이번 열기로 준 포인트. 줄 포인트가 없었거나 이미 준 개체면 0 */
  pointsAwarded: number
  /** 이번 열기에 낸 포인트. 여는 포인트가 0이면(퀘스트의 첫 잠긴 배지) 0이다 */
  pointsSpent: number
  /** 연 뒤 포인트 잔액 */
  pointBalance: number
  /** 개체 정보. 열기는 이미 확정됐고 정보 조회만 실패한 드문 경우에는 null이다 */
  item: LockedItemOpenedInfo | null
}

/** 거절 응답(4xx)의 모양 */
export interface LockedItemErrorResponse {
  error: string
  code: LockedItemErrorCode
  /** `not_full`일 때 필요한 양, `insufficient_points`일 때 여는 데 필요한 포인트 */
  required?: number
  /** `not_full`일 때 채운 양 */
  filled?: number
  /** `insufficient_points`일 때 가진 포인트 */
  balance?: number
}
