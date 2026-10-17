/**
 * Strava 연결 상태 판정 — 한 곳 (티켓 20261017_1422, 운영 로직 3.2·3.4절)
 *
 * `strava_connections` 행이 있다는 사실만으로 «연결됨»으로 읽지 않는다. 토큰 갱신이 실패했거나
 * 유저가 끊은 행은 `disconnected_at`이 채워지고, 그때는 «끊김»이다. 서버와 화면(2회)이 같은
 * 판정을 쓰도록 판정과 끊김 저장을 이 파일에 모은다.
 *
 * 상태 규칙:
 * - `none`          행이 없다 (한 번도 연결하지 않았거나 다른 계정 연결로 교체되어 사라졌다)
 * - `connected`     행이 있고 `disconnected_at`이 NULL이다
 * - `disconnected`  행이 있고 `disconnected_at`이 있다 — 동기화는 멈추고 기록·배지·잼·포인트는 남는다
 *
 * 옛 칸(`users.initial_sync_done`, `strava_connections`의 기존 칸)의 뜻은 바꾸지 않는다.
 * 토큰 값·시크릿은 로그에 남기지 않는다.
 *
 * 클라이언트 컴포넌트(프로필 설정 등)도 판정 함수를 가져다 쓴다. 그래서 이 파일은 서버 전용 모듈
 * (`@/lib/supabase/server`)을 정적으로도 동적으로도 가져오지 않는다 — 동적 import도 번들러가 따라가서
 * 브라우저 번들에 `next/headers`가 들어가 빌드가 깨진다. 끊김을 DB에 저장하는 서버 함수
 * (`markStravaDisconnected`)는 `connection-write.ts`에 있다.
 */

export type StravaConnectionState = 'none' | 'connected' | 'disconnected'

/** `strava_connections.disconnect_reason`에 저장하는 값 */
export type StravaDisconnectReason =
  /** 토큰 갱신이 실패했다 */
  | 'token_refresh_failed'
  /** Strava가 401로 연결 철회를 알렸다 (유저가 Strava 쪽에서 해제한 경우 포함) */
  | 'token_revoked'
  /** 유저가 프로필에서 직접 끊었다 */
  | 'user_disconnected'

/** 연결 상태를 읽는 데 필요한 칸만 — 행 전체를 넘기지 않아도 된다 */
export interface StravaConnectionStateInput {
  disconnected_at?: string | null
  /** 끊김 사유. 화면이 «오류로 끊김»과 «유저가 직접 끊음»을 가를 때 쓴다 */
  disconnect_reason?: string | null
}

/** 연결 행(없으면 null)으로 상태를 판정한다. 화면·서버가 이 함수 하나를 쓴다 */
export function resolveStravaConnectionState(
  row: StravaConnectionStateInput | null | undefined
): StravaConnectionState {
  if (!row) return 'none'
  return row.disconnected_at ? 'disconnected' : 'connected'
}

/**
 * 화면이 쓰는 네 갈래 — `resolveStravaConnectionState`에 끊김 사유를 더한 것(티켓 20261017_1422 2회).
 * - `connected`           연결 중
 * - `none`                행이 없다
 * - `disconnected_error`  토큰 갱신 실패·Strava 철회로 끊겼다 — 홈 알람 카드와 다시 동기화 버튼을 보인다
 * - `disconnected_user`   유저가 직접 끊었다 — 홈에서는 알람 없이 미연동처럼 보인다(사용자 승인)
 */
export type StravaUiState = 'connected' | 'none' | 'disconnected_error' | 'disconnected_user'

export function resolveStravaUiState(row: StravaConnectionStateInput | null | undefined): StravaUiState {
  const state = resolveStravaConnectionState(row)
  if (state === 'none') return 'none'
  if (state === 'connected') return 'connected'
  return row?.disconnect_reason === 'user_disconnected' ? 'disconnected_user' : 'disconnected_error'
}

/** 홈이 보는 상태 — 조회 자체가 실패하면 어느 쪽도 단정하지 않고 `unknown`으로 둔다 */
export type StravaHomeView = StravaUiState | 'unknown'

/** 홈 끊김 알람 카드는 오류로 끊긴 상태에서만 보인다. 유저가 직접 끊은 경우와 조회 실패는 알람을 그리지 않는다 */
export function showsStravaDisconnectedCard(view: StravaHomeView): boolean {
  return view === 'disconnected_error'
}

/** «Strava 동기화하면 시작해요» CTA는 아직 시작하지 않았거나(none) 유저가 직접 끊은 상태에서만 보인다 */
export function showsStravaSyncCta(view: StravaHomeView): boolean {
  return view === 'none' || view === 'disconnected_user'
}

/**
 * 같은 Strava 계정을 다시 연결할 때 끊김 표시를 지우는 칸 값.
 * 콜백이 토큰 갱신과 한 번의 update로 함께 쓴다(두 번에 나누면 중간 상태가 생긴다).
 * `first_sync_pending`은 건드리지 않는다 — 마지막 동기화 뒤부터 이어서 가져온다.
 */
export const STRAVA_DISCONNECT_CLEARED = {
  disconnected_at: null,
  disconnect_reason: null,
} as const

/**
 * 동기화가 끊김 상태라 진행하지 못했음을 알리는 오류.
 * 수동 동기화 API가 500이 아니라 구분되는 상태(409)로 응답하는 근거다.
 */
export class StravaDisconnectedError extends Error {
  constructor(
    public readonly reason: StravaDisconnectReason | string | null,
    options?: { cause?: unknown }
  ) {
    super(`[Strava] 연결이 끊긴 상태예요${reason ? ` (reason: ${reason})` : ''}`, options)
    this.name = 'StravaDisconnectedError'
  }
}

/**
 * Strava가 401로 연결 철회를 알린 오류인지 본다.
 * `api.ts`의 `StravaApiError`를 직접 import하지 않고 모양(이름·status)으로 판정한다 —
 * 동기화 시험이 api 모듈을 부분 모의하는 경우에도 이 판정이 깨지지 않게 한다.
 */
export function isStravaRevokedError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const e = err as { name?: unknown; status?: unknown }
  return e.name === 'StravaApiError' && e.status === 401
}

/**
 * 토큰 갱신 실패가 «인증 오류»(400·401·403 — 철회·만료·권한 해제)인지 본다.
 * 5xx·네트워크 오류·시간 초과 같은 일시 실패는 false라서 끊김으로 저장하지 않고 다음 동기화에서
 * 다시 시도한다(티켓 20261017_1422 서버 보정 a).
 */
export function isStravaAuthFailureError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const e = err as { name?: unknown; status?: unknown }
  return e.name === 'StravaApiError' && (e.status === 400 || e.status === 401 || e.status === 403)
}
