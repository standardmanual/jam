/**
 * POI 영역 블록 (GPS 조작 감지 후 72시간 드랍/픽업 차단)
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { AbusingPolicy } from './policy'

/** 해당 유저가 이 POI에서 차단됐는지 확인 */
export async function isPoiBlocked(userId: string, poiId: string): Promise<boolean> {
  try {
    const supabase = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('poi_blocks')
      .select('blocked_until')
      .eq('user_id', userId)
      .eq('poi_id', poiId)
      .maybeSingle()

    if (!data) return false
    return new Date(data.blocked_until) > new Date()
  } catch {
    return false
  }
}

/** POI 블록 적용 */
export async function blockPoiForUser(
  userId: string,
  poiId: string,
  policy: AbusingPolicy,
  reason: string = 'gps_spoof_detected'
): Promise<void> {
  const supabase = createServiceClient()
  const blockedUntil = new Date(Date.now() + policy.poi_block_hours * 3_600_000).toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('poi_blocks')
    .upsert({ user_id: userId, poi_id: poiId, blocked_until: blockedUntil, reason }, { onConflict: 'user_id,poi_id' })
}

/** POI 블록 해제 (어드민) */
export async function unblockPoi(userId: string, poiId: string): Promise<void> {
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('poi_blocks').delete().eq('user_id', userId).eq('poi_id', poiId)
}
