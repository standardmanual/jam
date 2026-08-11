/**
 * Strava 활동 동기화 핵심 로직
 * - strava_connections에서 토큰 조회 및 갱신
 * - last_synced_at 이후 활동만 가져오기 (색인 지연 대비 overlap 포함)
 * - strava_activities로 멱등 처리 (이미 처리된 활동은 재처리하지 않음)
 * - 배지 엔진 호출
 * - last_synced_at 업데이트
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { decrypt, encrypt } from '@/lib/utils'
import { getActivities, getActivityStreams, refreshStravaToken } from '@/lib/strava/api'
import { evaluateBadges } from '@/lib/badge-engine/index'
import { tryItemDrop } from '@/lib/drop-engine/index'
import { matchPoisForActivity } from '@/lib/poi/matcher'
import { checkItemBookCompletion } from '@/lib/itembook/checker'
import { checkMissions } from '@/lib/missions/checker'
import { recordFeedEvent } from '@/lib/activity-feed'
import { getJamActivityType, metersToKm, metersPerSecToKmH } from '@/types/strava'
import type { StravaSummaryActivity, NormalizedActivity } from '@/types/strava'
import type { StravaConnectionRow, BadgeType, BadgeRarity, PoiRow, StravaActivityRow } from '@/types/database'

/** 싱크 1회당 아이템 드랍을 시도할 최대 활동 수 (최신순). 백필 시 드랍 폭주·타임아웃 방지 */
const MAX_DROP_ACTIVITIES_PER_SYNC = 3
/** 싱크 1회당 POI 매칭(Streams API)을 수행할 최대 활동 수 (최신순). Strava rate limit·타임아웃 방지 */
const MAX_POI_MATCH_ACTIVITIES_PER_SYNC = 10
/**
 * 커서 overlap — Strava/Garmin 쪽 색인 지연으로 활동이 직전 동기화 시점엔 목록에
 * 안 잡혔다가 뒤늦게 나타나는 경우를 대비해, 매번 이만큼 앞선 시각부터 다시 조회한다.
 * strava_activities 멱등 처리 덕분에 겹치는 구간을 다시 훑어도 중복 보상은 없다.
 */
export const SYNC_OVERLAP_SECONDS = 15 * 60

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

/** 이미 처리된(strava_activities에 기록된) strava_id 집합 조회 */
export async function getProcessedStravaIds(
  supabase: SupabaseClient,
  userId: string,
  stravaIds: number[]
): Promise<Set<number>> {
  if (stravaIds.length === 0) return new Set()
  const { data, error } = await supabase
    .from('strava_activities')
    .select('strava_id')
    .eq('user_id', userId)
    .in('strava_id', stravaIds)

  if (error) {
    // 테이블이 아직 없거나(마이그레이션 미적용) 오류 시 — 안전하게 "미처리"로 간주해
    // 기존 동작(매번 처리)으로 폴백한다. 멱등 보장이 깨지는 대신 완전 중단은 피함.
    console.error('[getProcessedStravaIds] 조회 오류 — 미처리로 폴백:', error)
    return new Set()
  }
  return new Set((data as { strava_id: number }[]).map((r) => r.strava_id))
}

/** 처리 완료된 활동들을 strava_activities에 기록 (멱등 처리 기준 데이터) */
async function recordProcessedActivities(
  supabase: SupabaseClient,
  userId: string,
  activities: NormalizedActivity[],
  processedVia: StravaActivityRow['processed_via']
): Promise<void> {
  if (activities.length === 0) return
  const rows = activities.map((a) => ({
    user_id: userId,
    strava_id: a.stravaId,
    start_date: a.startDate,
    jam_activity_type: a.jamActivityType,
    distance_km: a.distanceKm,
    normalized: a,
    processed_via: processedVia,
  }))
  const { error } = await supabase
    .from('strava_activities')
    .upsert(rows, { onConflict: 'user_id,strava_id' })
  if (error) {
    console.error('[recordProcessedActivities] 기록 오류:', error)
  }
}

/**
 * 이번에 새로 확인된 활동들을 배지·드랍·미션 엔진에 넣고, 처리 완료 후 strava_activities에 기록한다.
 */
export async function processFetchedActivities(
  supabase: SupabaseClient,
  userId: string,
  accessToken: string,
  rawActivities: StravaSummaryActivity[],
  isFirstSync: boolean,
  processedVia: StravaActivityRow['processed_via'] = 'sync'
): Promise<{ badges: number; itemBooksCompleted: number; missionsCompleted: number }> {
  if (rawActivities.length === 0) {
    return { badges: 0, itemBooksCompleted: 0, missionsCompleted: 0 }
  }

  const activities: NormalizedActivity[] = rawActivities.map(normalizeActivity)

  // POI 매칭 — 각 활동의 GPS 경로를 Streams API로 조회 후 POI 반경 교차 검증
  //   백필 시 Strava API 폭주 방지: 최신 활동 N개만 매칭.
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

  const poiMatchResults: { rawActivity: StravaSummaryActivity; matchedPois: PoiRow[] }[] = []
  for (const { rawActivity, route } of routesByActivity) {
    if (!route) continue // 실내 활동 또는 경로 데이터 없음 — 건너뜀
    const matchedPois = await matchPoisForActivity(route, supabase)
    if (matchedPois.length > 0) poiMatchResults.push({ rawActivity, matchedPois })
  }

  const linkedBadgeIds = Array.from(
    new Set(
      poiMatchResults.flatMap(({ matchedPois }) =>
        matchedPois.map((poi) => poi.linked_badge_id).filter((id): id is string => Boolean(id))
      )
    )
  )
  type LinkedBadge = { id: string; type: BadgeType; name: string; image_url: string | null; rarity: BadgeRarity }
  const badgeById = new Map<string, LinkedBadge>()
  if (linkedBadgeIds.length > 0) {
    const { data: linkedBadgesRaw, error: linkedBadgeError } = await supabase
      .from('badges')
      .select('id, type, name, image_url, rarity')
      .in('id', linkedBadgeIds)
    if (linkedBadgeError) {
      console.error('[processFetchedActivities] POI 연결 배지 조회 오류:', linkedBadgeError)
    }
    for (const badge of (linkedBadgesRaw ?? []) as LinkedBadge[]) {
      badgeById.set(badge.id, badge)
    }
  }

  // 배지 타입별 발급
  //   - poi 타입: user_poi_badge_earns에 매번 새 행(반복 획득). 보유 여부 체크 없음.
  //   - 그 외(레거시 activity): 기존 user_activity_badges 경로 그대로(1인 1회)
  for (const { rawActivity, matchedPois } of poiMatchResults) {
    const normalized = activities.find((a) => a.stravaId === rawActivity.id)

    for (const poi of matchedPois) {
      if (!poi.linked_badge_id) continue
      const badge = badgeById.get(poi.linked_badge_id)
      if (!badge) continue

      if (badge.type === 'poi') {
        // 이 유저가 이 배지를 이전에 한 번이라도 획득한 적 있는지 먼저 확인 —
        // poi 배지는 방문할 때마다 반복 획득되지만, 프로필 배지 갤러리/피드에는
        // "고유 배지" 개념으로 최초 획득 시점 1건만 노출해야 하므로 최초 획득
        // 여부를 판별해 그때만 피드 이벤트를 남긴다(반복 방문은 피드에 안 쌓임).
        const { data: priorEarn } = await supabase
          .from('user_poi_badge_earns')
          .select('id')
          .eq('user_id', userId)
          .eq('badge_id', badge.id)
          .limit(1)
          .maybeSingle()
        const isFirstEarn = !priorEarn

        const earnPayload = {
          user_id: userId,
          badge_id: badge.id,
          poi_id: poi.id,
          triggered_by_strava_id: rawActivity.id,
          triggered_by_activity_name: rawActivity.name,
          triggered_by_distance_km: normalized?.distanceKm ?? null,
          triggered_by_activity_date: rawActivity.start_date_local ?? rawActivity.start_date,
        }
        const { error: earnError } = await supabase
          .from('user_poi_badge_earns')
          .insert(earnPayload)

        if (earnError) {
          if (earnError.code !== '23505') {
            console.error(`[processFetchedActivities] POI 배지 이력 기록 오류 (poi_id: ${poi.id}):`, earnError)
          }
          continue
        }

        poiBadgesEarned++
        console.info(`[processFetchedActivities] POI 배지 획득 — userId: ${userId}, poi: ${poi.name}, badge_id: ${badge.id}`)

        if (isFirstEarn) {
          await recordFeedEvent(userId, 'badge_earned', {
            badge_id: badge.id,
            badge_name: badge.name,
            badge_image_url: badge.image_url ?? '',
            rarity: badge.rarity,
          }, rawActivity.start_date)
        }
        continue
      }

      // 레거시 호환 — activity 타입 배지에 linked_badge_id가 붙어있는 과거 데이터
      const { data: existing } = await supabase
        .from('user_activity_badges')
        .select('id')
        .eq('user_id', userId)
        .eq('badge_id', poi.linked_badge_id)
        .maybeSingle()

      if (existing) continue

      const legacyEarnPayload = {
        user_id: userId,
        badge_id: poi.linked_badge_id,
        triggered_by: 'poi_match',
        triggered_by_poi_id: poi.id,
      }
      const { error: insertError } = await supabase
        .from('user_activity_badges')
        .insert(legacyEarnPayload)

      if (insertError) {
        if (insertError.code === '23505') continue
        console.error(`[processFetchedActivities] POI 배지 발급 오류 (poi_id: ${poi.id}):`, insertError)
        continue
      }

      poiBadgesEarned++
      console.info(`[processFetchedActivities] POI 배지 발급 — userId: ${userId}, poi: ${poi.name}, badge_id: ${poi.linked_badge_id}`)
    }
  }

  // Phase 18: 차량 속도 필터 적용 — 어뷰징 정책에서 임계값 조회
  let vehicleSpeedFilterKmh = 60
  const { data: abusingPolicy } = await supabase
    .from('abusing_policy')
    .select('vehicle_speed_filter_kmh')
    .limit(1)
    .single()
  if (abusingPolicy && (abusingPolicy as { vehicle_speed_filter_kmh?: number }).vehicle_speed_filter_kmh) {
    vehicleSpeedFilterKmh = (abusingPolicy as { vehicle_speed_filter_kmh: number }).vehicle_speed_filter_kmh
  }
  const activitiesFiltered = activities.filter((a) => a.averageSpeedKmh <= vehicleSpeedFilterKmh)

  // 활동별 아이템 드랍 시도
  //   - 첫 싱크(백필): "10초 첫 보상" — 최신 활동 1건만 드랍
  //   - 일반 싱크: 최신 활동 최대 3건까지 드랍
  //   - 드랍 대상 "선정"은 최신순(내림차순)으로 상위 N건을 고르되, 실제 tryItemDrop
  //     "처리 순서"는 그 N건을 다시 오래된 순(오름차순)으로 뒤집어서 진행한다.
  //     tryItemDrop은 매 호출마다 user_drop_state를 읽고 갱신해 마지막 호출의 결과가
  //     최종 저장되는데, 내림차순 그대로 처리하면 배치 중 가장 오래된 활동이 맨 나중에
  //     처리되어 last_activity_at/daily_drop_date/last_drop_faction_id가 실제 최신
  //     활동이 아니라 배치 내 가장 오래된 활동 기준으로 저장되는 순서 역전 버그가 있었다
  //     (2026-08-11 점검 티켓 20260811_009). 다음 싱크의 복귀(comeback) 판정·일일 카운터가
  //     실제보다 더 오래 쉰 것처럼 잘못 계산될 수 있었다.
  const dropTargets = [...activitiesFiltered]
    .filter((a) => a.jamActivityType)
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
    .slice(0, isFirstSync ? 1 : MAX_DROP_ACTIVITIES_PER_SYNC)
    .reverse()
  for (const activity of dropTargets) {
    await tryItemDrop(userId, activity, activitiesFiltered)
  }

  // 일반 배지 엔진 호출 (speed-filtered 활동만)
  const badgesEarned = activitiesFiltered.length > 0 ? await evaluateBadges(userId, activitiesFiltered) : 0

  // 아이템북 완성 체크 + reward_badge 발급
  const { completedIds, rewardBadgesIssued } = await checkItemBookCompletion(userId)
  if (completedIds.length > 0) {
    console.info(`[processFetchedActivities] 아이템북 완성 — userId: ${userId}, 완성 수: ${completedIds.length}, 보상 배지: ${rewardBadgesIssued}`)
  }

  // Phase 16: 다이나믹 미션 달성 체크
  const { completedMissionIds } = await checkMissions(userId, activitiesFiltered)
  if (completedMissionIds.length > 0) {
    console.info(`[processFetchedActivities] 미션 달성 — userId: ${userId}, 수: ${completedMissionIds.length}`)
  }

  // 멱등 처리 기준 데이터 기록 — 이번에 "새로" 확인된 활동 전체(가져온 원본 기준)를 처리 완료로 표시.
  // 성공적으로 여기까지 도달한 경우에만 기록하므로, 중간에 실패하면 다음 시도에서 자연스럽게 재처리된다.
  await recordProcessedActivities(supabase, userId, activities, processedVia)

  return {
    badges: badgesEarned + poiBadgesEarned + rewardBadgesIssued,
    itemBooksCompleted: completedIds.length,
    missionsCompleted: completedMissionIds.length,
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

  // 4. last_synced_at - overlap 이후 활동만 조회 (색인 지연 대비 — 상단 SYNC_OVERLAP_SECONDS 주석 참고)
  const afterTimestamp = connection.last_synced_at
    ? Math.max(0, Math.floor(new Date(connection.last_synced_at).getTime() / 1000) - SYNC_OVERLAP_SECONDS)
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

  // 4-3. 실제 조회·처리는 여기서부터 — 잠금은 이미 선점됐으므로, 이 구간에서
  // 예외가 나면(Strava API 오류, 서버리스 강제 종료 등) last_synced_at을 잠금 이전
  // 값으로 되돌린다. 되돌리지 않으면 커서만 앞으로 밀린 채 아무것도 처리되지 않은
  // 상태로 남아, 다음 재시도부터 그보다 오래된 활동(가입 전 이력 등)을 영영 조회
  // 대상에서 놓치게 된다 (2026-08-10 신규 유저 미발급 인시던트의 원인).
  try {
    const fetchedActivities = await getActivities(accessToken, afterTimestamp)

    // 5. 멱등 처리 — overlap으로 다시 잡힌 것 중 이미 처리된 활동은 제외
    const processedIds = await getProcessedStravaIds(supabase, userId, fetchedActivities.map((a) => a.id))
    let rawActivities = fetchedActivities.filter((a) => !processedIds.has(a.id))

    // 첫 싱크(신규 연동)는 과거 이력 전체를 소급 처리하지 않고 최신 활동 1건만 반영한다.
    // (배지 평가가 과거 이력 전체를 한 번에 넣으면 온보딩 순간 여러 등급이 동시에
    //  터져 나오는 등 성장 경험이 왜곡되는 문제가 있었음 — 드랍엔진은 이미 1건 제한 중)
    if (isFirstSync && rawActivities.length > 1) {
      rawActivities = [...rawActivities]
        .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())
        .slice(0, 1)
    }

    console.info(
      `[syncStravaActivities] userId: ${userId}, afterTimestamp: ${afterTimestamp ?? 'none'}, ` +
      `Strava 반환: ${fetchedActivities.length}건, 신규(미처리): ${rawActivities.length}건` +
      `${isFirstSync ? ' (첫 싱크 — 최신 1건 제한)' : ''}`
    )

    const { badges, itemBooksCompleted, missionsCompleted } = await processFetchedActivities(
      supabase,
      userId,
      accessToken,
      rawActivities,
      isFirstSync,
      'sync'
    )

    // last_synced_at은 4-1 잠금 단계에서 이미 선점 갱신됨 (여기서 재갱신하면
    // 처리 중 업로드된 활동이 다음 싱크에서 누락되는 갭이 생기므로 하지 않는다)

    return {
      synced: rawActivities.length,
      badges,
      itemBooksCompleted,
      missionsCompleted,
    }
  } catch (err) {
    console.error(`[syncStravaActivities] 처리 중 오류 — last_synced_at 롤백 (userId: ${userId}):`, err)
    const { error: rollbackError } = await supabase
      .from('strava_connections')
      // @ts-expect-error Supabase update() 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 StravaConnectionRow와 일치
      .update({ last_synced_at: connection.last_synced_at })
      .eq('user_id', userId)
      .eq('last_synced_at', lockNow) // 그 사이 다른 요청이 갱신했다면 덮어쓰지 않음
    if (rollbackError) {
      console.error(`[syncStravaActivities] 롤백 실패 (userId: ${userId}):`, rollbackError)
    }
    throw err
  }
}
