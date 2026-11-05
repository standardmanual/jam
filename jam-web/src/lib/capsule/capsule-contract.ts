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

/** 캡슐 상태의 기본 필드 — `CapsuleStatus`가 보류·안내 값을 더해 확장한다 */
export interface CapsuleBaseStatus {
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

/** 보류 보상이 지급되지 못하는 까닭. 이용 정지가 먼저고, 소속 트라이브 없음, 인벤토리 빈칸 모자람 순이다 */
export type CapsuleClaimBlockedReason = 'no_slots' | 'suspended' | 'no_tribe'

/**
 * 캡슐 아래 안내 영역이 고를 문구. 서버가 하나로 정한다(티켓 20261105_0104 T4에서 «막힘» 한 종류로 정리).
 * `blocked`는 캡슐이 가득 차고 인벤토리 빈칸이 필요 칸수보다 적어 동기화가 멈춘 상태이고, `capsule_receive_blocked`가 판정한다.
 */
export type CapsuleNoticeKind =
  /** 안내 없음(이용 정지 중에도 이 값 — 홈은 정지 배너가 알린다) */
  | 'none'
  /** 캡슐이 가득 차고 빈칸이 모자라 잼 모으기가 멈춤 */
  | 'blocked'

/** 보류 보상이 빈칸에 막혔을 때 보이는 빈칸 줄을 위한 값 */
export interface CapsuleClaimState {
  /** 보류가 있는데 받을 수 없는 까닭. 보류가 없거나 받을 수 있으면 null */
  blockedReason: CapsuleClaimBlockedReason | null
  /** 지금 인벤토리 빈칸 수 */
  freeSlots: number
  /** 가장 오래된 보류에서 나올 수 있는 최대 개수 = 받으려면 필요한 빈칸 수 */
  neededSlots: number
}

/** 캡슐 조회(`GET /api/capsule`) 응답의 캡슐 상태. 보류·안내는 서버가 정해 싣고 화면은 다시 계산하지 않는다 */
export interface CapsuleStatus extends CapsuleBaseStatus {
  /** 못 받은 보상 수(`capsule_pending_rewards`의 그 유저 행 수) */
  pendingCount: 0 | 1 | 2
  /** 보류가 2개라 잼이 사라지는 상태 */
  jamBlocked: boolean
  claim: CapsuleClaimState
  notice: CapsuleNoticeKind
  /** 대기 보상 개수 — 빈칸이 모자라 먼저 뽑아 저장한 결과의 개수 합(`capsule_receive_blocked`의 `pending`, 티켓 20261105_1437 R1) */
  pendingItemCount: number
  /** 대기 보상을 받으려고 더 비워야 하는 칸 수(`max(0, pendingItemCount - freeSlots)`) */
  shortfall: number
}

/**
 * 열기가 거절되는 경우의 코드. `no_tribe`는 앱이 추첨 전에 정하고, 나머지는 DB 함수 `capsule_open`의 `error` 값과 같다.
 * `capsule_changed`는 열기 중에 캡슐이 바뀐 경우이고, 다시 시도하면 된다(티켓 20261026_1031).
 */
export const CAPSULE_OPEN_ERROR_CODES = [
  'user_suspended',
  'not_full',
  'insufficient_slots',
  'invalid_items',
  'inventory_not_found',
  'no_tribe',
  'capsule_changed',
] as const

export type CapsuleOpenErrorCode = (typeof CAPSULE_OPEN_ERROR_CODES)[number]

/** 캡슐 거절 코드 전체 */
export type CapsuleErrorCode = CapsuleOpenErrorCode

/** 캡슐 거절 응답(4xx)의 모양 */
export interface CapsuleErrorResponse {
  error: string
  code: CapsuleErrorCode
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

/**
 * 열기 대신 «먼저 추첨해 대기 보상으로 저장»한 응답 — 빈칸이 뽑힌 개수보다 적을 때 `openCapsule`이 돌려준다(티켓 20261105_1437 R1).
 * 개체는 아직 지급되지 않았다(`items` 없음). 캡슐은 소진되어 새 캡슐(`next`)이 생겼고 지갑의 잼은 줄지 않았다.
 */
export interface CapsuleHeldPayload {
  held: true
  /** 저장된 대기 보상의 개수(뽑힌 개수) */
  drawnCount: number
  /** 저장 직후의 새 캡슐 */
  next: { required: number; filled: number }
}

/**
 * 보지 않은 캡슐 결과의 이벤트 하나 — 열기 하나(티켓 20261028_1740 2회). 합친 연출의 표시 모델(`buildCapsuleResultView`)이 읽는 필드만 싣는다
 * (`openId`, `items`, `reachedChapters`). 서버가 기록한 이벤트(`CapsuleUnseenEvent`)에서 `next`·`chapterNo`·`chapterCount`를 뺀 모양이다.
 */
export interface CapsuleUnseenEventView {
  openId: string
  /** 나온 개체(나온 순서). 잠긴 개체는 이름·그림 없이 등급과 여는 데 필요한 양만 있다 */
  items: CapsuleOpenedItem[]
  /** 이번 열기로 오른 챕터 번호 목록. 오르지 않았으면 빈 배열 */
  reachedChapters: number[]
}

/** 챕터 배지 — 합친 연출 보상 화면에 싣는다. 동기화 끝 판정이 이미 발급한 것만 온다 */
export interface CapsuleChapterBadge {
  /** `badges.id` */
  id: string
  name: string
  description: string
  imageUrl: string | null
  rarity: CapsuleRarity | null
  level: number | null
}

/** 보지 않은 결과를 하나로 합친 것 */
export interface CapsuleUnseenResult {
  /** «봤어요»로 돌려보낼 행 id(합친 행 전부). 깨져서 건너뛴 행은 들어 있지 않다 */
  ids: string[]
  /** 열린 순서대로 이어 붙인 이벤트(오래된 행부터, 행 안은 기록된 순서) */
  events: CapsuleUnseenEventView[]
  /** 합친 `reachedChapters`의 챕터 배지 중 이미 받은 것(챕터가 낮은 순서) */
  chapterBadges: CapsuleChapterBadge[]
}

/** `GET /api/capsule/unseen` 응답. 보지 않은 결과가 없으면 `result`가 null이다 */
export interface CapsuleUnseenResponse {
  result: CapsuleUnseenResult | null
}

/** «봤어요» 한 번에 보낼 수 있는 id 수의 상한 — 합치는 읽기 상한과 같다 */
export const CAPSULE_UNSEEN_MAX_IDS = 50

/** `POST /api/capsule/unseen/seen` 응답. `marked`는 이번 요청으로 바뀐 행 수(이미 본 행·남의 행은 세지 않는다) */
export interface CapsuleSeenPayload {
  marked: number
}
