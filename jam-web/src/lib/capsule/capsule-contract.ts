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

/**
 * 캡슐 상태의 옛 필드 — 채우기·열기 API(U11까지 살아 있다)가 돌려주는 모양이다.
 * 채우기 응답(`CapsuleFillPayload`)은 보류·안내를 읽지 않으므로 이 모양만 싣는다.
 */
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

/** 소식과 같은 «거의 찼어요» 단계(`user_capsules.alert_stage`). 0은 알리지 않음 */
export type CapsuleAlertStage = 0 | 70 | 80 | 90

/** 보류 보상을 받을 수 없는 까닭. 이용 정지가 먼저고, 소속 트라이브 없음, 인벤토리 빈칸 모자람 순이다 */
export type CapsuleClaimBlockedReason = 'no_slots' | 'suspended' | 'no_tribe'

/** 캡슐 아래 안내 영역이 고를 문구. 서버가 하나로 정한다 */
export type CapsuleNoticeKind =
  /** 보류도 단계도 없음(이용 정지 중에도 이 값 — 홈은 정지 배너가 알린다) */
  | 'none'
  /** 보류 1개, 단계 0 */
  | 'pending'
  /** 보류 1개, 단계 70·80·90 */
  | 'pending_nearly_full'
  /** 보류 2개 — 새로 가득 차는 캡슐의 보상이 사라진다 */
  | 'jam_blocked'
  /** 보류는 없는데 채움이 필요량 이상으로 가득 찬 채 남아 있음 */
  | 'full_waiting'

/** 보류 보상 받기 버튼과 빈칸 줄을 위한 값 */
export interface CapsuleClaimState {
  /** 지금 받을 수 있는지. 보류가 없거나 막혔으면 false */
  available: boolean
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
  /** 저장된 알림 단계. 보류가 1개가 아니면 0 */
  alertStage: CapsuleAlertStage
  claim: CapsuleClaimState
  notice: CapsuleNoticeKind
}

/** 채우기 성공 응답: 옛 캡슐 상태에 이번에 채운 양을 더한다 */
export interface CapsuleFillPayload extends CapsuleBaseStatus {
  /** 이번에 실제로 채운 양(가진 잼이 모자라면 요청보다 적을 수 있다) */
  applied: number
}

/**
 * 채우기가 거절되는 경우의 코드. DB 함수 `capsule_fill`의 `error` 값과 같다.
 * `capsule_changed`는 잠근 직후 캡슐 행이 없을 때(캡슐이 그사이 바뀐 경우)의 거절이고, 다시 시도하면 된다(티켓 20261026_1031).
 */
export const CAPSULE_FILL_ERROR_CODES = [
  'user_suspended',
  'already_full',
  'invalid_amount',
  'exceeds_remaining',
  'insufficient_jam',
  'capsule_changed',
] as const

export type CapsuleFillErrorCode = (typeof CAPSULE_FILL_ERROR_CODES)[number]

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

/**
 * 보류 받기(`POST /api/capsule/claim`)의 거절 코드. 서버 라우트가 내리는 4xx의 `code`와 같다.
 * `no_pending`은 받을 보류가 없을 때(이미 받았다), `insufficient_slots`는 하나도 받지 못했을 때(`freeSlots`·`neededSlots` 포함)다.
 * 이용 정지(403 `user_suspended`)는 따로 판별한다.
 */
export const CAPSULE_CLAIM_ERROR_CODES = ['no_pending', 'insufficient_slots', 'no_tribe', 'capsule_changed'] as const

export type CapsuleClaimErrorCode = (typeof CAPSULE_CLAIM_ERROR_CODES)[number]

/** 보류 받기 거절 응답(4xx)의 모양 */
export interface CapsuleClaimErrorResponse {
  error: string
  code: CapsuleClaimErrorCode
  /** `insufficient_slots`일 때 지금 인벤토리 빈칸 수 */
  freeSlots?: number
  /** `insufficient_slots`일 때 받으려면 필요한 빈칸 수 */
  neededSlots?: number
}

/** 받기가 멈춘 까닭. `none`은 받을 수 있는 보류를 모두 받았다, `insufficient_slots`는 빈칸이 모자라 멈췄다, `error`는 받은 뒤 예상 밖 실패가 났다 */
export type CapsuleClaimStop = 'none' | 'insufficient_slots' | 'error'

/** 받은 보류 하나 */
export interface CapsuleClaimedReward {
  /** 열기 기록 id(`capsule_opens.id`) */
  openId: string
  /** 보류가 만들어질 때의 챕터. 퀘스트 전 캡슐이면 null */
  chapterNo: number | null
  /** 나온 개체(열기 응답과 같은 모양) */
  items: CapsuleOpenedItem[]
}

/** 보류 받기 성공 응답(200, 하나 이상 받음). 받은 뒤 상태는 이 응답으로 계산하지 않고 `GET /api/capsule`을 다시 부른다 */
export interface CapsuleClaimPayload {
  /** 받은 것, 받은 순서대로(오래된 보류부터) */
  claimed: CapsuleClaimedReward[]
  /** 남은 보류 수 */
  remainingPending: number
  stopped: CapsuleClaimStop
  /** `stopped`가 `insufficient_slots`일 때 지금 빈칸 수 */
  freeSlots?: number
  /** `stopped`가 `insufficient_slots`일 때 받으려면 필요한 빈칸 수 */
  neededSlots?: number
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

/** 채울 양의 상한 — DB 함수 인자가 INTEGER라 이보다 크면 형식 오류다 */
export const CAPSULE_AMOUNT_MAX = 2147483647
