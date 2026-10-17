/**
 * 동기화 보류(고르기) 계약 — 서버와 클라이언트가 함께 읽는 순수 타입·상수 (티켓 20261017_1425)
 *
 * 서버 모듈(`pending-items.ts`)과 분리한 이유: 클라이언트 컴포넌트(고르기 화면, 2회)가 이 타입과 상수를 가져와도
 * `@/lib/supabase/server`·`next/headers`가 번들에 끌려오지 않게 하기 위해서다. 이 파일은 아무것도 가져오지 않는다.
 */

/** 동기화가 보류 때문에 막혔을 때 `POST /api/strava/sync`가 409로 내려주는 `code` 값 */
export const SYNC_PENDING_ITEMS_CODE = 'sync_pending_items'

/** `POST /api/strava/pending-items`의 `chosenIds` 길이 상한. 인벤토리 보관 한도보다 넉넉한 입력 방어선이다. */
export const PENDING_CHOSEN_IDS_MAX = 500

/** 고르기 화면이 보여 줄 보류 개체 1개 — `locked`로 갈리는 유니온이다. 화면은 `locked === true`로만 가른다. */
export type PendingItemView = OpenPendingItemView | LockedPendingItemView

/** 열린 개체. `locked` 키가 없거나 false다(옛 응답 모양과 같다) */
export interface OpenPendingItemView {
  /** `sync_pending_items.id` — 고르기 요청의 `chosenIds`에 담는 값 */
  id: string
  locked?: false
  badgeId: string
  name: string
  imageUrl: string | null
  rarity: 'common' | 'rare' | 'epic' | 'mystic'
}

/**
 * 잠긴 채 배정된 개체(티켓 20261018_0051, 운영 로직 7.3절). 서버가 어떤 아이템 배지인지 알 수 있는 값을 내리지 않는다:
 * `badgeId`·`name`은 빈 문자열, `imageUrl`은 null이고 등급(`rarity`)과 여는 데 필요한 양(`unlockRequired`)만 의미가 있다.
 * 고르기 화면은 이 값으로 잠금 타일 카드를 그린다.
 */
export interface LockedPendingItemView {
  id: string
  locked: true
  /** 여는 데 필요한 양. 배정 때 고정된다 */
  unlockRequired: number
  rarity: 'common' | 'rare' | 'epic' | 'mystic'
  badgeId: ''
  name: ''
  imageUrl: null
}

/** `GET /api/strava/pending-items` 응답 */
export interface PendingItemsPayload {
  /** 고르기를 기다리는 보류 개수. 0이면 `items`는 빈 배열이다 */
  pendingCount: number
  /** 인벤토리 빈칸 수(`max_slots - used_slots`, 0 미만이면 0) */
  freeSlots: number
  /** 정확히 골라야 하는 개수 = `min(freeSlots, pendingCount)` */
  chooseCount: number
  items: PendingItemView[]
}

/** `POST /api/strava/pending-items` 성공 응답 */
export interface ResolvePendingPayload {
  /** 인벤토리에 받은 개수 */
  granted: number
  /** 고르지 않아 받지 못한 개수 */
  discarded: number
  /** 새로 생긴 인벤토리 개체 id */
  itemIds: string[]
}

/** `POST /api/strava/sync`가 보류 때문에 막혔을 때의 409 응답 본문 */
export interface SyncPendingItemsBody {
  error: string
  code: typeof SYNC_PENDING_ITEMS_CODE
  /** 고르기를 기다리는 보류 개수 */
  pendingCount: number
}
