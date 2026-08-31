/**
 * POI 영역 블록 (GPS 조작 감지 후 72시간 드랍/픽업 차단)
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { AbusingPolicy } from './policy'

/** 해당 유저가 이 POI에서 차단됐는지 확인 */
export async function isPoiBlocked(userId: string, poiId: string): Promise<boolean> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('poi_blocks')
      .select('blocked_until')
      .eq('user_id', userId)
      .eq('poi_id', poiId)
      .maybeSingle()

    if (!data) return false
    // @ts-expect-error try/catch + 명시적 Promise<boolean> 반환 타입 조합에서 supabase-js 추론이 무너지는 TS 특이 케이스(격리 재현 확인) — data는 PoiBlockRow의 blocked_until 컬럼을 가짐
    return new Date(data.blocked_until) > new Date()
  } catch {
    return false
  }
}

/**
 * POI 블록 적용
 *
 * 실패하면 예외를 던진다 — 흡수는 호출부(자동 감지 경로)에서 한다.
 * GPS 조작 감지 흐름을 막지 않아야 하는 `api/drops/[dropId]/pickup`은 이 실패를
 * `Promise.allSettled`로 흡수하고 로그만 남긴다 (티켓 20260831_1149).
 */
export async function blockPoiForUser(
  userId: string,
  poiId: string,
  policy: AbusingPolicy,
  reason: string = 'gps_spoof_detected'
): Promise<void> {
  const supabase = createServiceClient()
  const blockedUntil = new Date(Date.now() + policy.poi_block_hours * 3_600_000).toISOString()

  const table = supabase.from('poi_blocks')
  const payload = { user_id: userId, poi_id: poiId, blocked_until: blockedUntil, reason }
  // @ts-expect-error Supabase upsert() 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 PoiBlockRow와 일치
  const { error } = await table.upsert(payload, { onConflict: 'user_id,poi_id' })
  if (error) {
    console.error('[poi-block] 블록 적용 실패:', error)
    throw new Error(`poi_blocks upsert 실패 (${error.code}): ${error.message}`)
  }
}

/** POI 블록 해제 (어드민). 실패하면 운영자가 알 수 있게 예외를 던진다. */
export async function unblockPoi(userId: string, poiId: string): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('poi_blocks').delete().eq('user_id', userId).eq('poi_id', poiId)
  if (error) {
    console.error('[poi-block] 블록 해제 실패:', error)
    throw new Error(`poi_blocks delete 실패 (${error.code}): ${error.message}`)
  }
}
