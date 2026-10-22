/**
 * 어뷰징 이벤트 로그 기록(`abusing_logs`) + 제재 만료 연장 결과 타입
 * service_role 클라이언트 전용
 *
 * 티켓 20261021_1250(6-4 2회): 옛 `shadow-ban.ts`를 지우면서 밴이 아닌 이 함수들을 옮겼다.
 * 동작은 그대로이고 서버 로그 접두어만 `[shadow-ban]`에서 `[abusing-log]`로 바뀌었다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.generated'

/**
 * 어뷰징 이벤트 로그 기록. 로그는 부가 정보이므로 실패해도 호출부(GPS 감지 등 핵심 동작)를
 * 막지 않도록 예외를 던지지 않는다 — 다만 실패 자체는 반드시 서버 로그에 남긴다
 * (이전에는 `catch {}`로 완전히 무음이었다 — 티켓 20260901_1843).
 *
 * 저장에 성공하면 `true`, insert 오류나 예외로 저장하지 못했으면 `false`를 돌려준다(`logAbusingEvents`와 같은 모양).
 * 호출부가 «기록이 남았는가»를 알아야 할 때만 이 값을 쓴다 — 픽업 GPS 감지 알림이 기록 저장 여부를 글에 싣는다
 * (티켓 20261022_0940). 값을 무시하는 호출부의 동작은 달라지지 않는다.
 */
export async function logAbusingEvent(
  userId: string,
  eventType: string,
  detail?: Record<string, unknown>
): Promise<boolean> {
  try {
    const supabase = createServiceClient()
    const logsTable = supabase.from('abusing_logs')
    // abusing_logs.detail은 jsonb 컬럼이라 생성 타입이 Json이다. 호출부 편의를 위해 파라미터는
    // Record<string, unknown>으로 받고 있어(값 타입이 unknown이라 Json에 직접 대입 불가) 이
    // 한 필드만 Json으로 단언한다 — 나머지 컬럼은 이름·타입 검사를 그대로 받는다.
    const payload = { user_id: userId, event_type: eventType, detail: (detail ?? null) as Json }
    const { error } = await logsTable.insert(payload)
    if (error) {
      console.error(`[abusing-log] 어뷰징 이벤트 로그 기록 실패 (userId: ${userId}, eventType: ${eventType}):`, error)
      return false
    }
    return true
  } catch (e) {
    console.error(`[abusing-log] 어뷰징 이벤트 로그 기록 예외 (userId: ${userId}, eventType: ${eventType}):`, e)
    return false
  }
}

export interface AbusingLogEntry {
  user_id: string
  event_type: string
  detail: Record<string, Json | undefined>
}

/**
 * 여러 건의 어뷰징 로그를 한 문장으로 기록한다. 지운 행의 유일한 기록이라 실패하면 지운 내용을
 * 서버 로그에 통째로 남기고 `false`를 돌려준다(호출부는 이미 지운 뒤라 되돌릴 수 없다).
 */
export async function logAbusingEvents(entries: AbusingLogEntry[]): Promise<boolean> {
  if (entries.length === 0) return true
  try {
    const supabase = createServiceClient()
    const { error } = await supabase.from('abusing_logs').insert(entries)
    if (error) {
      console.error('[abusing-log] 어뷰징 로그 일괄 기록 실패 — 기록하지 못한 내용:', JSON.stringify(entries), error)
      return false
    }
    return true
  } catch (e) {
    console.error('[abusing-log] 어뷰징 로그 일괄 기록 예외 — 기록하지 못한 내용:', JSON.stringify(entries), e)
    return false
  }
}

export interface ExtendResult {
  /** 실제로 만료가 늦춰진 행 */
  updatedIds: string[]
  error: string | null
}
