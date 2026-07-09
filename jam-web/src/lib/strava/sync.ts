/**
 * Strava 활동 동기화 핵심 로직
 * - strava_connections에서 토큰 조회 및 갱신
 * - last_synced_at 이후 활동만 가져오기
 * - 배지 엔진 호출
 * - last_synced_at 업데이트
 */
import { createServiceClient } from '@/lib/supabase/server'
import { decrypt, encrypt } from '@/lib/utils'
import { getActivities, getActivityStreams, refreshStravaToken } from '@/lib/strava/api'
import { evaluateBadges } from '@/lib/badge-engine/index'
import { tryItemDrop } from '@/lib/drop-engine/index'
import { matchPoisForActivity } from '@/lib/poi/matcher'
import { checkItemBookCompletion } from '@/lib/itembook/checker'
import { STRAVA_TYPE_TO_JAM, metersToKm, metersPerSecToKmH } from '@/types/strava'
import type { StravaSummaryActivity, NormalizedActivity } from '@/types/strava'
import type { StravaConnectionRow } from '@/types/database'

/**
 * StravaSummaryActivity → NormalizedActivity 변환
 */
function normalizeActivity(activity: StravaSummaryActivity): NormalizedActivity {
  return {
    stravaId: activity.id,
    name: activity.name,
    distanceKm: metersToKm(activity.distance),
    movingTimeSec: activity.moving_time,
    elevationGainM: activity.total_elevation_gain,
    jamActivityType: STRAVA_TYPE_TO_JAM[activity.type] ?? null,
    startDate: activity.start_date,
    averageSpeedKmh: metersPerSecToKmH(activity.average_speed),
    startLatLng: activity.start_latlng.length === 2
      ? (activity.start_latlng as [number, number])
      : null,
    endLatLng: activity.end_latlng.length === 2
      ? (activity.end_latlng as [number, number])
      : null,
  }
}

/**
 * 특정 유저의 Strava 활동을 동기화하고 배지를 평가합니다.
 * @returns synced: 동기화된 활동 수, badges: 신규 발급된 배지 수
 */
export async function syncStravaActivities(
  userId: string
): Promise<{ synced: number; badges: number; itemBooksCompleted: number }> {
  const supabase = createServiceClient()

  // 1. strava_connections 조회
  const { data: connectionRaw, error: connError } = await supabase
    .from('strava_connections')
    .select('*')
    .eq('user_id', userId)
    .single()

  const connection = connectionRaw as StravaConnectionRow | null

  if (connError || !connection) {
    throw new Error(`[syncStravaActivities] Strava 연동 정보 없음 — userId: ${userId}`)
  }

  // 2. 토큰 복호화
  let accessToken = await decrypt(connection.access_token)
  const refreshToken = await decrypt(connection.refresh_token)
  const expiresAt = new Date(connection.token_expires_at).getTime()

  // 3. 토큰 만료 확인 → 만료 시 갱신
  if (Date.now() >= expiresAt - 60_000) { // 1분 여유
    const refreshed = await refreshStravaToken(refreshToken)
    accessToken = refreshed.access_token

    const [encAccess, encRefresh] = await Promise.all([
      encrypt(refreshed.access_token),
      encrypt(refreshed.refresh_token),
    ])

    const updatePayload = {
      access_token: encAccess,
      refresh_token: encRefresh,
      token_expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
    }
    const { error: updateError } = await supabase
      .from('strava_connections')
      // @ts-expect-error Supabase 타입 추론 제한 우회 — 실제 필드는 StravaConnectionRow.Update와 일치
      .update(updatePayload)
      .eq('user_id', userId)

    if (updateError) {
      console.error('[syncStravaActivities] 갱신된 토큰 저장 실패:', updateError)
    }
  }

  // 4. last_synced_at 이후 활동만 조회
  const afterTimestamp = connection.last_synced_at
    ? Math.floor(new Date(connection.last_synced_at).getTime() / 1000)
    : undefined

  const rawActivities = await getActivities(accessToken, afterTimestamp)

  // 5. NormalizedActivity로 변환
  const activities: NormalizedActivity[] = rawActivities.map(normalizeActivity)

  // 6. POI 매칭 — 각 활동의 GPS 경로를 Streams API로 조회 후 POI 반경 교차 검증
  let poiBadgesEarned = 0
  for (const rawActivity of rawActivities) {
    const route = await getActivityStreams(rawActivity.id, accessToken)

    if (!route) {
      // 실내 활동 또는 경로 데이터 없음 — 건너뜀
      continue
    }

    const matchedPois = await matchPoisForActivity(route, supabase)

    for (const poi of matchedPois) {
      if (!poi.linked_badge_id) continue

      // 이미 해당 배지를 보유하고 있는지 확인 (중복 발급 방지)
      const { data: existing } = await supabase
        .from('user_activity_badges')
        .select('id')
        .eq('user_id', userId)
        .eq('badge_id', poi.linked_badge_id)
        .maybeSingle()

      if (existing) continue

      // POI 배지 발급
      const { error: insertError } = await supabase
        .from('user_activity_badges')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          user_id: userId,
          badge_id: poi.linked_badge_id,
          triggered_by: 'poi_match',
          triggered_by_poi_id: poi.id,
        } as any)

      if (insertError) {
        if (insertError.code === '23505') continue // 중복 — 무시
        console.error(`[syncStravaActivities] POI 배지 발급 오류 (poi_id: ${poi.id}):`, insertError)
        continue
      }

      poiBadgesEarned++
      console.info(`[syncStravaActivities] POI 배지 발급 — userId: ${userId}, poi: ${poi.name}, badge_id: ${poi.linked_badge_id}`)
    }
  }

  // 7. 활동별 아이템 드랍 시도
  for (const activity of activities) {
    if (activity.jamActivityType) {
      await tryItemDrop(userId, activity.jamActivityType)
    }
  }

  // 8. 일반 배지 엔진 호출 (activity 조건 기반)
  const badgesEarned = activities.length > 0
    ? await evaluateBadges(userId, activities)
    : 0

  // 9. 아이템북 완성 체크
  const completedBookIds = await checkItemBookCompletion(userId)
  if (completedBookIds.length > 0) {
    console.info(`[syncStravaActivities] 아이템북 완성 — userId: ${userId}, 완성 수: ${completedBookIds.length}`)
  }

  // 10. last_synced_at 업데이트
  const syncPayload = { last_synced_at: new Date().toISOString() }
  const { error: syncUpdateError } = await supabase
    .from('strava_connections')
    // @ts-expect-error Supabase 타입 추론 제한 우회 — last_synced_at는 StravaConnectionRow의 유효한 필드
    .update(syncPayload)
    .eq('user_id', userId)

  if (syncUpdateError) {
    console.error('[syncStravaActivities] last_synced_at 업데이트 실패:', syncUpdateError)
  }

  return { synced: activities.length, badges: badgesEarned + poiBadgesEarned, itemBooksCompleted: completedBookIds.length }
}
