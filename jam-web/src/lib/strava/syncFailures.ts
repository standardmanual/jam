/**
 * Strava 동기화 실패 기록 (티켓 20260918_1307)
 *
 * `/api/strava/sync`(syncStravaActivities)가 실패할 때 시각·유형을 strava_sync_failures에
 * 남긴다. 주간 집계 API(`/api/admin/kpi/weekly`)의 stravaSyncFailures 지표가 이 테이블을
 * COUNT한다. 여기서 남긴 user_id는 원인 추적용일 뿐 집계 응답에는 절대 포함하지 않는다
 * (상위 티켓 §4-6, kpiWeekly.ts 참고).
 *
 * 기록 자체가 실패해도 동기화를 막지 않는다 — 완료 조건("동기화 성공 흐름과 응답은
 * 바뀌지 않는다")에 따라 항상 try/catch로 격리한다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type StravaSyncFailureType = 'token_refresh_failed' | 'rate_limited' | 'strava_api_error'

/**
 * syncStravaActivities()가 던진 오류를 실패 유형으로 분류한다.
 *
 * - 토큰 갱신 실패는 호출부가 이미 알고 있으므로(별도 catch) 이 함수는 쓰지 않는다.
 * - 그 외(Strava API 호출·이후 처리)는 `lib/strava/api.ts`의 `Strava API 오류 {status}: ...`
 *   메시지 포맷에서 상태 코드를 읽어 429(레이트리밋)만 따로 구분하고, 나머지는 뭉뚱그려
 *   'strava_api_error'로 남긴다 — 배지 엔진·DB 오류 등도 이 경로를 타지만 세분화할 원천
 *   데이터가 없어 더 나누지 않는다(완료 조건의 "유형별 건수는 선택").
 */
export function classifyStravaSyncFailure(err: unknown): StravaSyncFailureType {
  const message = err instanceof Error ? err.message : String(err)
  if (/Strava API 오류 429/.test(message)) return 'rate_limited'
  return 'strava_api_error'
}

/**
 * 실패 1건을 기록한다. 실패해도 예외를 던지지 않고 로그만 남긴다(호출부의 동기화 실패
 * 처리·재throw를 방해하지 않기 위함).
 */
export async function recordStravaSyncFailure(
  supabase: SupabaseClient,
  userId: string,
  failureType: StravaSyncFailureType,
  errorMessage: string
): Promise<void> {
  try {
    const { error } = await supabase.from('strava_sync_failures').insert({
      user_id: userId,
      failure_type: failureType,
      error_message: errorMessage,
    })
    if (error) {
      console.error('[recordStravaSyncFailure] 기록 오류:', error)
    }
  } catch (err) {
    console.error('[recordStravaSyncFailure] 기록 중 예외:', err)
  }
}
