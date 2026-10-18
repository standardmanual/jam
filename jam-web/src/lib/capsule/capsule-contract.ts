/**
 * 캡슐 계약 — 서버와 클라이언트가 함께 읽는 순수 타입·상수 (티켓 20261018_0052 1회, 운영 로직 5.2절)
 *
 * 서버 모듈(`capsule.ts`, `policy.ts`)과 분리한 이유: 캡슐 화면(3-4)이 이 파일을 가져와도
 * `@/lib/supabase/server`·`next/headers`가 번들에 끌려오지 않게 하기 위해서다. **이 파일은 아무것도 가져오지 않는다.**
 */

/** 못 여는 까닭. 다 채우지 못했거나(`not_full`), 인벤토리 빈칸이 나올 수 있는 최대 개수보다 적다(`no_free_slots`). */
export type CapsuleNotOpenableReason = 'not_full' | 'no_free_slots'

/** 아이템 배지 등급 — 이 파일은 아무것도 가져오지 않아 `BadgeRarity`를 가져오지 않고 같은 값을 적는다 */
export type CapsuleRarity = 'common' | 'rare' | 'epic' | 'mystic'

/** 캡슐 조회·채우기 응답의 캡슐 상태 */
export interface CapsuleStatus {
  /** 이 캡슐이 생길 때 정해진 필요량(이후 고정) */
  required: number
  /** 지금까지 채운 양 */
  filled: number
  /** 남은 양(`required - filled`) */
  remaining: number
  /** 유저가 가진 잼 */
  balance: number
  /** 지금 열 수 있는지. 다 채웠고 인벤토리 빈칸이 나올 수 있는 최대 개수 이상이어야 한다 */
  openable: boolean
  /** 못 여는 까닭. 열 수 있으면 null. 다 채우지 못한 것이 먼저고, 그 다음이 빈칸 모자람이다 */
  notOpenableReason: CapsuleNotOpenableReason | null
  /** 지금 인벤토리 빈칸 수. 빈칸을 읽지 못한 응답(채우기 직후)에는 없다 */
  freeSlots?: number
  /** 열려면 필요한 빈칸 수(나올 수 있는 최대 개수). 빈칸을 읽지 못한 응답에는 없다 */
  neededSlots?: number
}

/** 채우기 성공 응답: 캡슐 상태에 이번에 채운 양을 더한다 */
export interface CapsuleFillPayload extends CapsuleStatus {
  /** 이번에 실제로 채운 양(가진 잼이 모자라면 요청보다 적을 수 있다) */
  applied: number
}

/** 채우기가 거절되는 경우의 코드. DB 함수 `capsule_fill`의 `error` 값과 같다. */
export const CAPSULE_FILL_ERROR_CODES = ['user_suspended', 'already_full', 'invalid_amount', 'exceeds_remaining', 'insufficient_jam'] as const

export type CapsuleFillErrorCode = (typeof CAPSULE_FILL_ERROR_CODES)[number]

/** 열기가 거절되는 경우의 코드. `no_tribe`는 앱이 추첨 전에 정하고, 나머지는 DB 함수 `capsule_open`의 `error` 값과 같다. */
export const CAPSULE_OPEN_ERROR_CODES = [
  'user_suspended',
  'not_full',
  'insufficient_slots',
  'invalid_items',
  'inventory_not_found',
  'no_tribe',
] as const

export type CapsuleOpenErrorCode = (typeof CAPSULE_OPEN_ERROR_CODES)[number]

/** 캡슐 거절 코드 전체(채우기 + 열기) */
export type CapsuleErrorCode = CapsuleFillErrorCode | CapsuleOpenErrorCode

/** 채우기·열기 거절 응답(4xx)의 모양 */
export interface CapsuleErrorResponse {
  error: string
  code: CapsuleErrorCode
  /** `exceeds_remaining`일 때 채울 수 있는 남은 양 */
  remaining?: number
  /** `insufficient_slots`일 때 지금 인벤토리 빈칸 수 */
  freeSlots?: number
  /** `insufficient_slots`일 때 열려면 필요한 빈칸 수 */
  neededSlots?: number
}

/** 열린 채 나온 개체 — 이름·그림·등급·일련번호를 싣는다 */
export interface CapsuleOpenedOpenItem {
  locked: false
  inventoryItemId: string
  badgeId: string
  name: string
  imageUrl: string | null
  rarity: CapsuleRarity
  serialNumber: number | null
}

/** 잠긴 채 나온 개체 — 운영 로직 7.3절에 따라 이름·그림·일련번호 없이 등급과 여는 데 필요한 양만 싣는다 */
export interface CapsuleOpenedLockedItem {
  locked: true
  inventoryItemId: string
  rarity: CapsuleRarity
  unlockRequired: number
}

export type CapsuleOpenedItem = CapsuleOpenedOpenItem | CapsuleOpenedLockedItem

/** 열기 성공 응답 */
export interface CapsuleOpenPayload {
  /** 이번 열기 기록(`capsule_opens.id`) */
  openId: string
  /** 나온 개체(나온 순서) */
  items: CapsuleOpenedItem[]
  /** 열자마자 생긴 다음 캡슐 */
  next: { required: number; filled: number }
}

/** 채울 양의 상한 — DB 함수 인자가 INTEGER라 이보다 크면 형식 오류다 */
export const CAPSULE_AMOUNT_MAX = 2147483647
