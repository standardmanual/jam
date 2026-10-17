/**
 * 홈 상단 정지 배너가 쓸 값을 읽는다 — 서버 전용 (티켓 20261017_1426 2회, 채원 판정)
 *
 * 홈 page.tsx가 다른 조회와 함께 시작한다. 조회가 실패하면 홈 전체를 500으로 만들지 않고 배너만 생략한다(null, 서버 로그만).
 * 동기화와 보류 받기는 서버에서 이미 막혀 있고 막힘 토스트가 이유를 알려 준다. 이 «실패하면 생략»은 화면용이며,
 * 동작을 막는 쪽(`assertNotSuspended`)은 반대로 실패하면 던진다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getActiveSuspension } from './suspension'

/** 배너 컴포넌트가 받는 원시값 */
export interface HomeSuspensionBanner {
  reason: string
  /** ISO 8601 */
  suspendedAt: string
}

/** 정지 중이면 배너 값, 아니거나 조회가 실패하면 null. 던지지 않는다. */
export async function loadHomeSuspensionBanner(supabase: SupabaseClient, userId: string): Promise<HomeSuspensionBanner | null> {
  try {
    const active = await getActiveSuspension(supabase, userId)
    return active ? { reason: active.reason, suspendedAt: active.suspendedAt } : null
  } catch (error) {
    console.error('[home/page] 이용 정지 조회 실패 — 배너를 생략한다', error)
    return null
  }
}
