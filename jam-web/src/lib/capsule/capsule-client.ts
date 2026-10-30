/**
 * 캡슐 클라이언트 fetch 래퍼 (티켓 20261018_0054 1회, 운영 로직 5.2절)
 *
 * 캡슐 위젯과 시트(`components/capsule/`)가 네 API(`GET /api/capsule`, `POST /api/capsule/claim`,
 * `GET /api/capsule/unseen`, `POST /api/capsule/unseen/seen`)를 부르는 유일한 자리다.
 * 응답을 «성공 / 이용 정지 / 거절 / 실패» 넷 중 하나로 접어 돌려주고, 호출부가 그에 맞춰 화면을 고른다.
 *  - 이용 정지: 403 + `code: 'user_suspended'`. 일반 실패가 아니라 안내(info)로 낸다(`strava/sync-flow`의 선례).
 *  - 거절: 서버가 알려진 `code`와 완성된 `error` 문구를 내린 4xx. 문구는 서버가 `d.capsule.*`로 완성해 내리므로 그대로 보여 준다(UX 라이팅 §4.0).
 *  - 실패: 네트워크 오류, 5xx, 해석할 수 없는 응답.
 *
 * 클라이언트·서버 경계: 순수 모듈이다. `capsule-contract`(타입·상수)와 `suspended-block`만 가져온다.
 * `@/lib/supabase/server`·`next/headers`는 정적·동적 어느 쪽으로도 가져오지 않는다(`__tests__/capsule-client-boundary.test.ts`가 검사한다).
 */
import {
  CAPSULE_CLAIM_ERROR_CODES,
  CAPSULE_OPEN_ERROR_CODES,
  type CapsuleClaimErrorResponse,
  type CapsuleClaimPayload,
  type CapsuleErrorCode,
  type CapsuleErrorResponse,
  type CapsuleSeenPayload,
  type CapsuleStatus,
  type CapsuleUnseenResponse,
} from '@/lib/capsule/capsule-contract'
import { isSuspendedBody } from '@/lib/suspension/suspended-block'

/** 호출 결과 — `E`는 거절 응답의 모양 */
export type ApiCall<T, E> =
  | { kind: 'ok'; data: T }
  /** 이용 정지 중이라 막혔다(403 `user_suspended`) */
  | { kind: 'suspended' }
  /** 서버가 알려진 코드로 거절했다. `body.error`는 서버가 완성한 사용자 문구다 */
  | { kind: 'rejected'; status: number; body: E }
  /** 네트워크 오류, 5xx, 해석할 수 없는 응답 */
  | { kind: 'failed' }

export type CapsuleCall<T> = ApiCall<T, CapsuleErrorResponse>

/** 보류 받기 호출 결과 — 거절 코드가 채우기·열기와 달라(`no_pending`) 거절 모양이 따로다 */
export type CapsuleClaimCall = ApiCall<CapsuleClaimPayload, CapsuleClaimErrorResponse>

/** 알려진 캡슐 거절 코드인가(`user_suspended`는 따로 판별하므로 거절에서는 제외한다) */
const KNOWN_REJECT_CODES: readonly string[] = CAPSULE_OPEN_ERROR_CODES.filter((code) => code !== 'user_suspended')

export function isKnownCapsuleRejectCode(code: unknown): code is CapsuleErrorCode {
  return typeof code === 'string' && KNOWN_REJECT_CODES.includes(code)
}

/**
 * 요청을 보내고 응답을 접는다. 잠긴 아이템 배지 채우기·열기 래퍼(2회)도 같은 접기를 쓰도록 거절 판별을 인자로 받는다.
 * `fetch` 예외와 JSON이 아닌 본문은 `failed`다.
 */
export async function callApi<T, E extends { error: string }>(
  input: string,
  init: RequestInit,
  isRejectBody: (body: unknown) => body is E
): Promise<ApiCall<T, E>> {
  let res: Response
  try {
    res = await fetch(input, init)
  } catch {
    return { kind: 'failed' }
  }

  const body = (await res.json().catch(() => null)) as unknown
  if (res.ok) return body === null ? { kind: 'failed' } : { kind: 'ok', data: body as T }
  if (isSuspendedBody(res.status, body)) return { kind: 'suspended' }
  if (res.status >= 400 && res.status < 500 && isRejectBody(body)) return { kind: 'rejected', status: res.status, body }
  return { kind: 'failed' }
}

function isCapsuleRejectBody(body: unknown): body is CapsuleErrorResponse {
  if (typeof body !== 'object' || body === null) return false
  const { error, code } = body as { error?: unknown; code?: unknown }
  return typeof error === 'string' && isKnownCapsuleRejectCode(code)
}

function isCapsuleClaimRejectBody(body: unknown): body is CapsuleClaimErrorResponse {
  if (typeof body !== 'object' || body === null) return false
  const { error, code } = body as { error?: unknown; code?: unknown }
  return typeof error === 'string' && typeof code === 'string' && (CAPSULE_CLAIM_ERROR_CODES as readonly string[]).includes(code)
}

/** 지금 캡슐 상태. 캡슐이 없으면 서버가 만든다 */
export function fetchCapsule(): Promise<CapsuleCall<CapsuleStatus>> {
  return callApi<CapsuleStatus, CapsuleErrorResponse>('/api/capsule', { method: 'GET', cache: 'no-store' }, isCapsuleRejectBody)
}

/** 보류 받기 — 못 받은 보상을 오래된 순서로 받을 수 있는 만큼 받는다. 받은 뒤 상태는 응답으로 계산하지 않고 `fetchCapsule`을 다시 부른다 */
export function claimCapsule(): Promise<CapsuleClaimCall> {
  return callApi<CapsuleClaimPayload, CapsuleClaimErrorResponse>('/api/capsule/claim', { method: 'POST' }, isCapsuleClaimRejectBody)
}

/** 알려진 거절 코드가 없는 호출용 판별 — 보지 않은 결과 API의 4xx는 모두 실패로 접는다 */
function neverRejectBody(body: unknown): body is CapsuleErrorResponse {
  return typeof body === 'symbol'
}

/**
 * 아직 보지 않은 캡슐 결과(여러 동기화의 것을 합친 하나). 없으면 `data.result`가 null이다.
 * 실패하면 `failed`다 — 호출부는 «보여 주지 않고 다음에 다시»로 처리한다(결과는 서버에 그대로 남는다).
 */
export function fetchUnseenResult(): Promise<CapsuleCall<CapsuleUnseenResponse>> {
  return callApi<CapsuleUnseenResponse, CapsuleErrorResponse>('/api/capsule/unseen', { method: 'GET', cache: 'no-store' }, neverRejectBody)
}

/** «봤어요» — `fetchUnseenResult`가 준 `ids`를 돌려보낸다. 같은 요청을 다시 보내도 결과가 같다(두 번째는 `marked: 0`) */
export function markUnseenSeen(ids: readonly string[]): Promise<CapsuleCall<CapsuleSeenPayload>> {
  return callApi<CapsuleSeenPayload, CapsuleErrorResponse>(
    '/api/capsule/unseen/seen',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) },
    neverRejectBody
  )
}
