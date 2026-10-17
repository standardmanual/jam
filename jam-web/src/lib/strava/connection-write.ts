/**
 * Strava 연결 끊김 저장 — 서버 전용 (티켓 20261017_1422)
 *
 * 판정 함수(`connection-state.ts`)는 클라이언트 컴포넌트도 가져다 쓰므로 서버 전용 모듈에 닿으면 안 된다.
 * DB에 쓰는 이 함수는 서버 코드(동기화, 끊기 API)에서만 가져다 쓰고 클라이언트 컴포넌트에서는 가져오지 않는다.
 * 토큰 값·시크릿은 로그에 남기지 않는다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { StravaDisconnectReason } from '@/lib/strava/connection-state'

type ServiceClient = ReturnType<typeof createServiceClient>

export interface MarkDisconnectedOptions {
  supabase?: ServiceClient
  /** true면 저장된 토큰을 지운다(유저가 끊을 때). 토큰 칸은 NOT NULL이라 빈 문자열로 둔다 */
  clearTokens?: boolean
}

/**
 * 유저의 연결을 끊김으로 저장한다. 저장에 실패하면 false를 돌려주고 로그만 남긴다
 * (호출부가 원래 오류를 가리지 않게 던지지 않는다).
 */
export async function markStravaDisconnected(
  userId: string,
  reason: StravaDisconnectReason,
  options: MarkDisconnectedOptions = {}
): Promise<boolean> {
  const supabase = options.supabase ?? createServiceClient()
  const payload = {
    disconnected_at: new Date().toISOString(),
    disconnect_reason: reason,
    ...(options.clearTokens ? { access_token: '', refresh_token: '' } : {}),
  }
  const { error } = await supabase.from('strava_connections').update(payload).eq('user_id', userId)
  if (error) {
    console.error(`[JAM! Strava] 끊김 저장 실패 (userId: ${userId}, reason: ${reason}):`, error)
    return false
  }
  return true
}
