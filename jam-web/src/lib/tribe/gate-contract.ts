/**
 * 트라이브 게이트 계약 — 서버와 클라이언트가 함께 읽는 순수 상수·판정 (티켓 20261021_1247 1회, 운영 로직 2장)
 *
 * 트라이브를 고르기 전에는 앱의 화면과 Strava 연결·동기화를 쓸 수 없다. 판정 기준은 하나다: `users.tribe_id`가 있는가.
 * (옛 기준이던 `onboarding_completed_at`은 쓰지 않는다 — 공용 DB에는 완료 시각은 있는데 트라이브가 없는 계정이 있다.)
 *
 * 서버 모듈(`gate.ts`)과 분리한 이유: 동기화 버튼 같은 클라이언트 코드가 이 파일을 가져와도
 * `@/lib/supabase/server`가 번들에 끌려오지 않게 하기 위해서다(`suspension-contract.ts`와 같은 방식).
 * **이 파일은 아무것도 가져오지 않는다.**
 */

/** 트라이브가 없어 막힌 API가 403으로 내려주는 `code` 값 */
export const TRIBE_REQUIRED_CODE = 'tribe_required'

/** 트라이브 고르기 화면의 주소. 게이트가 트라이브 없는 유저를 보내는 곳이다 */
export const TRIBE_SELECT_PATH = '/onboarding'

/** 트라이브가 없어 막힌 API의 403 응답 모양 */
export interface TribeRequiredResponse {
  error: string
  code: typeof TRIBE_REQUIRED_CODE
  /** 클라이언트가 이동할 곳 */
  redirectTo: typeof TRIBE_SELECT_PATH
}

/**
 * `users.tribe_id` 값이 «트라이브를 골랐다»를 뜻하는가. 화면 게이트(레이아웃)·로그인 콜백·프로필 경유지·고르기 화면의
 * «이미 끝난 유저는 홈으로» 조건이 모두 이 함수를 쓴다 — 한쪽만 다르면 두 화면이 서로 보내는 되돌림 반복이 생긴다.
 * 빈 문자열·null·undefined·문자열이 아닌 값은 «없음»이다.
 */
export function hasTribe(tribeId: unknown): tribeId is string {
  return typeof tribeId === 'string' && tribeId.length > 0
}

/** 상태 코드와 본문(이미 읽은 JSON)이 트라이브 게이트 403인가 */
export function isTribeRequiredBody(status: number, body: unknown): boolean {
  if (status !== 403) return false
  return (body as { code?: unknown } | null)?.code === TRIBE_REQUIRED_CODE
}

/** 403 + `code: 'tribe_required'`인가. 403의 본문만 읽는다(본문을 이미 읽었다면 `isTribeRequiredBody`를 쓴다). */
export async function isTribeRequiredBlock(res: Response): Promise<boolean> {
  if (res.status !== 403) return false
  const body = (await res.json().catch(() => null)) as unknown
  return isTribeRequiredBody(res.status, body)
}
