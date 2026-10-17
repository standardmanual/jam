/**
 * 이용 정지 계약 — 서버와 클라이언트가 함께 읽는 순수 타입·상수·판정 (티켓 20261017_1426, 운영 로직 16.1·16.4절)
 *
 * 서버 모듈(`suspension.ts`)과 분리한 이유: 클라이언트 컴포넌트(홈 상단 배너, 2회)가 이 파일을 가져와도
 * `@/lib/supabase/server`·`next/headers`가 번들에 끌려오지 않게 하기 위해서다. **이 파일은 아무것도 가져오지 않는다.**
 */

/** 정지 때문에 막힌 API가 403으로 내려주는 `code` 값 */
export const USER_SUSPENDED_CODE = 'user_suspended'

/**
 * 정지 한 번의 구간. 반열린 구간 `[suspendedAt, liftedAt)`이다 — 건 시각은 포함, 푼 시각은 미포함.
 * `liftedAt`이 null이면 끝나지 않은 정지(끝없음)다. 시각은 ISO 8601 문자열이다.
 */
export interface SuspensionPeriod {
  suspendedAt: string
  liftedAt: string | null
}

/** 정지 때문에 막힌 API의 403 응답 모양 */
export interface UserSuspendedResponse {
  error: string
  code: typeof USER_SUSPENDED_CODE
}

/**
 * 활동 시작 시각(ms)이 어느 정지 구간 안에 있는지. 구간은 반열린 `[suspendedAt, liftedAt)`이다.
 * 시각을 읽을 수 없으면(NaN) 어느 구간에도 들지 않는다.
 */
export function isDuringSuspension(startedAtMs: number, periods: readonly SuspensionPeriod[]): boolean {
  for (const period of periods) {
    const from = Date.parse(period.suspendedAt)
    if (!(startedAtMs >= from)) continue
    if (period.liftedAt === null) return true
    if (startedAtMs < Date.parse(period.liftedAt)) return true
  }
  return false
}
