/**
 * 잠긴 아이템 배지 채우기·열기 클라이언트 fetch 래퍼 (티켓 20261018_0054 2회, 운영 로직 7.2절)
 *
 * 잠긴 상세(`LockedItemDetail`)가 `POST /api/inventory/items/[itemId]/fill`·`open`을 부르는 유일한 자리다. 응답을 캡슐과 같은
 * «성공 / 이용 정지 / 거절 / 실패» 넷 중 하나로 접어 돌려준다(접기는 `capsule-client`의 `callApi`를 그대로 쓴다).
 *  - 이용 정지: 403 + `code: 'user_suspended'`. 일반 실패가 아니라 안내(info)로 낸다.
 *  - 거절: 서버가 알려진 `code`와 완성된 `error` 문구를 내린 4xx. 문구는 서버가 `d.lockedItem.*`로 완성해 내리므로 그대로 보여 준다(UX 라이팅 §4.0).
 *  - 실패: 네트워크 오류, 5xx, 해석할 수 없는 응답.
 *
 * 클라이언트·서버 경계: 순수 모듈이다. `capsule-client`(접기)와 `lockedItemFill-contract`(타입·상수)만 가져온다.
 * `@/lib/supabase/server`·`next/headers`는 정적·동적 어느 쪽으로도 가져오지 않는다(`capsule-boundary.test.ts`가 검사한다).
 */
import { callApi, type ApiCall } from '@/lib/capsule/capsule-client'
import {
  LOCKED_ITEM_FILL_ERROR_CODES,
  LOCKED_ITEM_OPEN_ERROR_CODES,
  type LockedItemErrorCode,
  type LockedItemErrorResponse,
  type LockedItemFillPayload,
  type LockedItemOpenPayload,
} from '@/lib/inventory/lockedItemFill-contract'

export type LockedItemCall<T> = ApiCall<T, LockedItemErrorResponse>

/** 알려진 잠긴 개체 거절 코드인가(`user_suspended`는 따로 판별하므로 거절에서는 제외한다) */
const KNOWN_REJECT_CODES: readonly string[] = [...new Set([...LOCKED_ITEM_FILL_ERROR_CODES, ...LOCKED_ITEM_OPEN_ERROR_CODES])].filter(
  (code) => code !== 'user_suspended'
)

export function isKnownLockedItemRejectCode(code: unknown): code is LockedItemErrorCode {
  return typeof code === 'string' && KNOWN_REJECT_CODES.includes(code)
}

function isLockedItemRejectBody(body: unknown): body is LockedItemErrorResponse {
  if (typeof body !== 'object' || body === null) return false
  const { error, code } = body as { error?: unknown; code?: unknown }
  return typeof error === 'string' && isKnownLockedItemRejectCode(code)
}

/** 잠긴 개체 채우기. `amount`는 양의 정수다(상한 판정은 서버가 한다) */
export function fillLockedItemRequest(itemId: string, amount: number): Promise<LockedItemCall<LockedItemFillPayload>> {
  return callApi<LockedItemFillPayload, LockedItemErrorResponse>(
    `/api/inventory/items/${encodeURIComponent(itemId)}/fill`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount }) },
    isLockedItemRejectBody
  )
}

/** 잠긴 개체 열기 */
export function openLockedItemRequest(itemId: string): Promise<LockedItemCall<LockedItemOpenPayload>> {
  return callApi<LockedItemOpenPayload, LockedItemErrorResponse>(
    `/api/inventory/items/${encodeURIComponent(itemId)}/open`,
    { method: 'POST' },
    isLockedItemRejectBody
  )
}
