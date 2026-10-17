/**
 * 중복 연결 안내(`?strava=duplicate`) 주소 처리 (티켓 20261017_1422 2회)
 *
 * 콜백이 이미 다른 JAM! 계정에 동기화된 Strava 계정을 만나면 `/profile?strava=duplicate`로 보낸다.
 * `profile/page.tsx`가 `strava` 값을 `/{username}`으로 전달하고, 안내 시트는 목적지가 어디든 열린다.
 * 시트는 열리자마자 주소에서 `strava` 값을 지워 새로고침해도 다시 열리지 않게 한다.
 */

export const STRAVA_PARAM = 'strava'
export const STRAVA_DUPLICATE_VALUE = 'duplicate'

interface ParamsLike {
  get(name: string): string | null
  toString(): string
}

/** 주소에 중복 안내 값이 실려 있는가 */
export function hasStravaDuplicateParam(searchParams: ParamsLike): boolean {
  return searchParams.get(STRAVA_PARAM) === STRAVA_DUPLICATE_VALUE
}

/** `strava` 값만 지운 주소(경로 + 남은 쿼리). 다른 쿼리는 그대로 둔다 */
export function urlWithoutStravaParam(pathname: string, searchParams: ParamsLike): string {
  const params = new URLSearchParams(searchParams.toString())
  params.delete(STRAVA_PARAM)
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}
