/**
 * Strava 활동 정합성 점검 (reconcile)
 *
 * syncStravaActivities의 overlap(SYNC_OVERLAP_SECONDS)보다 더 큰 지연으로
 * 누락된 활동을 잡아내기 위한 별도 루틴. 최근 N일치 활동을 통째로 다시 조회해
 * strava_activities에 없는(=한 번도 처리 안 된) 것만 골라 소급 처리한다.
 * 멱등 처리(strava_activities)를 전제로 하므로 몇 번을 다시 돌려도 안전하다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import { decrypt, encrypt } from '@/lib/utils'
import { getActivities, refreshStravaToken } from '@/lib/strava/api'
import { getProcessedStravaIds, processFetchedActivities } from '@/lib/strava/sync'
import type { StravaConnectionRow } from '@/types/database'

/** 정합성 점검 시 되짚어볼 기간 (일) */
export const RECONCILE_LOOKBACK_DAYS = 7

export async function reconcileStravaActivities(
  userId: string
): Promise<{ recovered: number; badges: number }> {
  const supabase = createServiceClient()

  const { data: connectionRaw, error: connError } = await supabase
    .from('strava_connections')
    .select('*')
    .eq('user_id', userId)
    .single()

  const connection = connectionRaw as StravaConnectionRow | null
  if (connError || !connection) {
    throw new Error(`[reconcileStravaActivities] Strava 연동 정보 없음 — userId: ${userId}`)
  }

  let accessToken = await decrypt(connection.access_token)
  const refreshToken = await decrypt(connection.refresh_token)
  const expiresAt = new Date(connection.token_expires_at).getTime()

  if (Date.now() >= expiresAt - 60_000) {
    const refreshed = await refreshStravaToken(refreshToken)
    accessToken = refreshed.access_token
    const [encAccess, encRefresh] = await Promise.all([
      encrypt(refreshed.access_token),
      encrypt(refreshed.refresh_token),
    ])
    await supabase
      .from('strava_connections')
      // @ts-expect-error Supabase 타입 추론 제한 우회
      .update({
        access_token: encAccess,
        refresh_token: encRefresh,
        token_expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
      })
      .eq('user_id', userId)
  }

  const afterTimestamp = Math.floor(Date.now() / 1000) - RECONCILE_LOOKBACK_DAYS * 86_400
  const recentActivities = await getActivities(accessToken, afterTimestamp)

  const processedIds = await getProcessedStravaIds(supabase, userId, recentActivities.map((a) => a.id))
  const missing = recentActivities.filter((a) => !processedIds.has(a.id))

  if (missing.length === 0) {
    return { recovered: 0, badges: 0 }
  }

  console.info(
    `[reconcileStravaActivities] userId: ${userId}, 최근 ${RECONCILE_LOOKBACK_DAYS}일 중 누락 발견: ${missing.length}건, ` +
    `ids: ${missing.map((a) => `${a.id}@${a.start_date}`).join(', ')}`
  )

  const { badges } = await processFetchedActivities(supabase, userId, accessToken, missing, false, 'reconcile')

  return { recovered: missing.length, badges }
}
