/**
 * abusing_logs 보유기간 만료 행 파기 (티켓 20260929_1327)
 *
 * 개인정보 처리방침 3항·위치기반서비스 이용약관 제5조가 부정 이용 탐지 기록의 보유기간을
 * "탐지일로부터 3개월"로 공개했다. `event_type`과 관계없이 전체 행을 지운다
 * (GPS 조작 탐지 기록과 관리자 제재 해제 기록 모두 방침의 보관 항목이다).
 * 일일 크론 `/api/cron/poi-cleanup`이 호출한다.
 */
import { createServiceClient } from '@/lib/supabase/server'

const RETENTION_MONTHS = 3

/** 기준 시각에서 UTC 달력 기준 3개월 전 시각. 대상 월에 그 일자가 없으면 말일로 보정한다(5/31 → 2/28). */
export function abusingLogCutoff(now: Date): Date {
  const cutoff = new Date(now.getTime())
  const day = cutoff.getUTCDate()
  cutoff.setUTCDate(1)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - RETENTION_MONTHS)
  const lastDay = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate()
  cutoff.setUTCDate(Math.min(day, lastDay))
  return cutoff
}

export interface PurgeAbusingLogsResult {
  deleted: number
  error: string | null
}

/** 3개월이 지난 abusing_logs 행을 삭제한다. 예외를 던지지 않고 실패를 `error`로 돌려준다. */
export async function purgeExpiredAbusingLogs(now: Date = new Date()): Promise<PurgeAbusingLogsResult> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('abusing_logs')
      .delete()
      .lt('created_at', abusingLogCutoff(now).toISOString())
      .select('id')

    if (error) {
      console.error('[abusing-purge] abusing_logs 삭제 오류:', error)
      return { deleted: 0, error: error.message }
    }
    return { deleted: data?.length ?? 0, error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[abusing-purge] abusing_logs 삭제 예외:', e)
    return { deleted: 0, error: message }
  }
}
