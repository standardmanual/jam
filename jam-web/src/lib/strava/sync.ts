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
import { checkMissions } from '@/lib/missions/checker'
import { getJamActivityType, metersToKm, metersPerSecToKmH } from '@/types/strava'
import type { StravaSummaryActivity, NormalizedActivity } from '@/types/strava'
import type { StravaConnectionRow } from '@/types/database'

/** 싱크 1회당 아이템 드랍을 시도할 최대 활동 수 (최신순). 백필 시 드랍 폭주·타임아웃 방지 */
const MAX_DROP_ACTIVITIES_PER_SYNC = 3
/** 싱크 1회당 POI 매칭(Streams API)을 수행할 최대 활동 수 (최신순). Strava rate limit·타임아웃 방지 */
const MAX_POI_MATCH_ACTIVITIES_PER_SYNC = 10

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
    jamActivityType: getJamActivityType(activity),
    startDate: activity.start_date,
    startDateLocal: activity.start_date_local,
    averageSpeedKmh: metersPerSecToKmH(activity.average_speed),
    startLatLng: activity.start_latlng.length === 2
      ? (activity.start_latlng as [number, number])
      : null,
    endLatLng: activity.end_latlng.length === 2
      ? (activity.end_latlng as [number, number])
      : null,
    weatherTempC: activity.average_temp ?? null,
  }
}

/**
 * 특정 유저의 Strava 활동을 동기화하고 배지를 평가합니다.
 * @returns synced: 동기화된 활동 수, badges: 신규 발급된 배지 수
 */
export async function syncStravaActivities(
  userId: string
): Promise<{ synced: number; badges: number; itemBooksCompleted: number; missionsCompleted: number }> {
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

  // 4-1. 동시 싱크 잠금 (낙관적 잠금) — 처리 시작 전에 last_synced_at을 선점 갱신한다.
  //      같은 커서로 들어온 두 번째 요청은 갱신 0행 → 즉시 종료 (드랍·피드 중복 방지)
  const lockNow = new Date().toISOString()
  let lockQuery = supabase
    .from('strava_connections')
    // @ts-expect-error Supabase 타입 추론 제한 우회
    .update({ last_synced_at: lockNow })
    .eq('user_id', userId)
  lockQuery =
    connection.last_synced_at === null
      ? lockQuery.is('last_synced_at', null)
      : lockQuery.eq('last_synced_at', connection.last_synced_at)
  const { data: lockRows, error: lockError } = await lockQuery.select('user_id')
  if (lockError || !lockRows || lockRows.length === 0) {
    console.info(`[syncStravaActivities] 동시 싱크 감지 — 건너뜀 (userId: ${userId})`)
    return { synced: 0, badges: 0, itemBooksCompleted: 0, missionsCompleted: 0 }
  }

  // 4-2. 첫 싱크 여부 (초기화 직후·신규 연동) — 드랍 1회 제한에 사용
  const { data: userRow } = await supabase
    .from('users')
    .select('initial_sync_done')
    .eq('id', userId)
    .maybeSingle()
  const isFirstSync = !(userRow as { initial_sync_done?: boolean } | null)?.initial_sync_done

  const rawActivities = await getActivities(accessToken, afterTimestamp)

  // 5. NormalizedActivity로 변환
  const activities: NormalizedActivity[] = rawActivities.map(normalizeActivity)

  // 6. POI 매칭 — 각 활동의 GPS 경로를 Streams API로 조회 후 POI 반경 교차 검증
  //    백필 시 Strava API 폭주 방지: 최신 활동 N개만 매칭.
  //    Streams 조회(외부 API, 네트워크 지연의 주 원인)는 병렬로 먼저 가져오고,
  //    배지 발급(DB 쓰기)은 순서 보장을 위해 순차 처리한다.
  const poiMatchTargets = [...rawActivities]
    .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())
    .slice(0, MAX_POI_MATCH_ACTIVITIES_PER_SYNC)
  const routesByActivity = await Promise.all(
    poiMatchTargets.map(async (rawActivity) => ({
      rawActivity,
      route: await getActivityStreams(rawActivity.id, accessToken),
    }))
  )
  let poiBadgesEarned = 0
  for (const { route } of routesByActivity) {
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

  // 7. Phase 18: 차량 속도 필터 적용 — 어뷰징 정책에서 임계값 조회
  let vehicleSpeedFilterKmh = 60
  const { data: abusingPolicy } = await supabase
    .from('abusing_policy')
    .select('vehicle_speed_filter_kmh')
    .limit(1)
    .single()
  if (abusingPolicy && (abusingPolicy as { vehicle_speed_filter_kmh?: number }).vehicle_speed_filter_kmh) {
    vehicleSpeedFilterKmh = (abusingPolicy as { vehicle_speed_filter_kmh: number }).vehicle_speed_filter_kmh
  }
  const activitiesFiltered = activities.filter(
    (a) => a.averageSpeedKmh <= vehicleSpeedFilterKmh
  )

  // 8. 활동별 아이템 드랍 시도 (조건 평가에 speed-filtered 활동 목록 전달)
  //    - 첫 싱크(백필): "10초 첫 보상" — 최신 활동 1건만 드랍 (과거 이력 전체에 드랍 폭주 방지)
  //    - 일반 싱크: 최신 활동 최대 3건까지 드랍
  const dropTargets = [...activitiesFiltered]
    .filter((a) => a.jamActivityType)
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
    .slice(0, isFirstSync ? 1 : MAX_DROP_ACTIVITIES_PER_SYNC)
  for (const activity of dropTargets) {
    await tryItemDrop(userId, activity, activitiesFiltered)
  }

  // 9. 일반 배지 엔진 호출 (speed-filtered 활동만)
  const badgesEarned = activitiesFiltered.length > 0
    ? await evaluateBadges(userId, activitiesFiltered)
    : 0

  // 10. 아이템북 완성 체크 + reward_badge 발급
  const { completedIds, rewardBadgesIssued } = await checkItemBookCompletion(userId)
  if (completedIds.length > 0) {
    console.info(`[syncStravaActivities] 아이템북 완성 — userId: ${userId}, 완성 수: ${completedIds.length}, 보상 배지: ${rewardBadgesIssued}`)
  }

  // 11. Phase 16: 다이나믹 미션 달성 체크
  const { completedMissionIds } = await checkMissions(userId, activitiesFiltered)
  if (completedMissionIds.length > 0) {
    console.info(`[syncStravaActivities] 미션 달성 — userId: ${userId}, 수: ${completedMissionIds.length}`)
  }

  // 10. last_synced_at은 4-1 잠금 단계에서 이미 선점 갱신됨 (여기서 재갱신하면
  //     처리 중 업로드된 활동이 다음 싱크에서 누락되는 갭이 생기므로 하지 않는다)

  return {
    synced: activities.length,
    badges: badgesEarned + poiBadgesEarned + rewardBadgesIssued,
    itemBooksCompleted: completedIds.length,
    missionsCompleted: completedMissionIds.length,
  }
}
