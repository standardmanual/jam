/**
 * 중복 연결 안내(`?strava=duplicate`, `?strava=duplicate_blocked`) 주소 처리 (티켓 20261017_1422 2회, 20261021_1249 4회)
 *
 * 콜백이 이미 다른 JAM! 계정에 연결된 Strava 계정을 만나면 두 곳 중 하나로 보낸다.
 *  - `/profile?strava=duplicate`: 기존 계정이 일반·정상이다. 안내 시트가 «취소»와 «그래도 연결하기»를 준다(offer).
 *  - `/profile?strava=duplicate_blocked`: 기존 계정이 어드민이거나 이용 정지 중이다. «닫기»와 «문의하기»만 준다(blocked).
 * `profile/page.tsx`가 `strava` 값을 문자열 그대로 `/{username}`으로 전달하고, 안내 시트는 목적지가 어디든 열린다.
 * 시트는 열리자마자 주소에서 `strava` 값을 지워 새로고침해도 다시 열리지 않게 한다. 다른 값(`connected`·`error`)은 이 시트가 건드리지 않는다.
 */

export const STRAVA_PARAM = 'strava'
export const STRAVA_DUPLICATE_VALUE = 'duplicate'
export const STRAVA_DUPLICATE_BLOCKED_VALUE = 'duplicate_blocked'

/** 시트의 모양: offer는 «그래도 연결하기»를 주는 모양, blocked는 문의로만 안내하는 모양 */
export type StravaDuplicateMode = 'offer' | 'blocked'

interface ParamsLike {
  get(name: string): string | null
  toString(): string
}

/** 주소의 `strava` 값에 대응하는 시트 모양. 두 값이 아니면 null이다 */
export function stravaDuplicateMode(searchParams: ParamsLike): StravaDuplicateMode | null {
  const value = searchParams.get(STRAVA_PARAM)
  if (value === STRAVA_DUPLICATE_VALUE) return 'offer'
  if (value === STRAVA_DUPLICATE_BLOCKED_VALUE) return 'blocked'
  return null
}

/** `strava` 값만 지운 주소(경로 + 남은 쿼리). 다른 쿼리는 그대로 둔다 */
export function urlWithoutStravaParam(pathname: string, searchParams: ParamsLike): string {
  const params = new URLSearchParams(searchParams.toString())
  params.delete(STRAVA_PARAM)
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}
