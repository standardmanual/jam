/**
 * Strava OAuth state 도우미 (티켓 20261008_1349)
 *
 * `state`는 유저 ID가 아니라 브라우저 쿠키에 묶인 무작위 일회용 값이다.
 *  - 인증 시작(`/api/strava/auth`)이 값을 만들어 `state`로 보내고 같은 값을 httpOnly 쿠키로 심는다.
 *  - 콜백(`/api/strava/callback`)은 쿠키 값과 URL의 `state`가 같을 때만 토큰 교환을 진행한다.
 * 두 라우트가 같은 상수를 쓰도록 이름·수명·속성을 여기 한 곳에 둔다.
 */
import { randomBytes } from 'node:crypto'

export const STRAVA_OAUTH_STATE_COOKIE = 'strava_oauth_state'
export const STRAVA_OAUTH_STATE_MAX_AGE_SECONDS = 600

/**
 * 쿠키 속성. `sameSite`가 `lax`인 이유는 Strava에서 돌아오는 최상위 GET 이동에 쿠키가 실려야 해서다
 * (`strict`면 콜백에 쿠키가 오지 않는다). `secure`는 호출 시점의 환경으로 정한다.
 */
export function getStravaOAuthStateCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/api/strava',
    maxAge: STRAVA_OAUTH_STATE_MAX_AGE_SECONDS,
  }
}

/** 256비트 무작위 값(URL 안전 문자열 43자). */
export function createStravaOAuthState(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * 쿠키 값과 URL `state`가 같은지 상수 시간으로 비교한다. 둘 중 하나라도 비어 있으면 거부한다.
 * 길이가 달라도 즉시 반환하지 않고 끝까지 비교해 타이밍 차이를 줄인다.
 */
export function isValidStravaOAuthState(
  cookieValue: string | null | undefined,
  stateParam: string | null | undefined
): boolean {
  if (!cookieValue || !stateParam) return false
  const len = Math.max(cookieValue.length, stateParam.length)
  let mismatch = cookieValue.length === stateParam.length ? 0 : 1
  for (let i = 0; i < len; i++) {
    const a = i < cookieValue.length ? cookieValue.charCodeAt(i) : 0
    const b = i < stateParam.length ? stateParam.charCodeAt(i) : 0
    mismatch |= a ^ b
  }
  return mismatch === 0
}
