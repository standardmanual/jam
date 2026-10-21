/**
 * 보관 기간이 지난 보관 행(`retained_records`) 파기 (티켓 20261021_1249 2회, 운영 로직 17.2절)
 *
 * 유저를 지울 때 법정 보관 대상 기록(위치정보 확인자료 6개월, 부정 이용 탐지 기록 3개월)은 보관 표로 옮겨지고(마이그레이션 263),
 * 보관 만료 시각(`retained_until`)이 지나면 이 함수가 DB 함수 `purge_expired_retained_records()`(마이그레이션 263)로 지운다.
 * 일일 크론 `/api/cron/poi-cleanup`이 호출한다. 예외를 던지지 않고 실패를 `error`로 돌려준다(`purgeExpiredAbusingLogs`와 같은 방식).
 */
import { createServiceClient } from '@/lib/supabase/server'

export interface PurgeRetainedRecordsResult {
  deleted: number
  error: string | null
}

export async function purgeExpiredRetainedRecords(): Promise<PurgeRetainedRecordsResult> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase.rpc('purge_expired_retained_records')

    if (error) {
      console.error('[retained-purge] purge_expired_retained_records RPC 오류:', error)
      return { deleted: 0, error: error.message }
    }
    // 함수는 지운 행 수(정수)를 돌려준다. 계약 밖 응답을 0건으로 삼키지 않고 실패로 알린다
    if (typeof data !== 'number' || !Number.isInteger(data) || data < 0) {
      console.error('[retained-purge] purge_expired_retained_records가 계약 밖 응답을 돌려줬습니다:', data)
      return { deleted: 0, error: 'purge_expired_retained_records 응답이 정수가 아닙니다' }
    }
    return { deleted: data, error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[retained-purge] purge_expired_retained_records 예외:', e)
    return { deleted: 0, error: message }
  }
}
