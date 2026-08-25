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
import { findCompletableItemBooks } from '@/lib/itembook/completable'
import { checkMissions } from '@/lib/missions/checker'
import { recordFeedEvent } from '@/lib/activity-feed'
import { createNotification, syncGroupKey, dailyGroupKey, scopedGroupKey } from '@/lib/notifications'
import { logEngineDecision } from '@/lib/engine-log'
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
 * 동기화 응답에 실어보내는 "이번에 획득한 배지" 요약 (20260823_007).
 * 획득 연출(BadgeRevealCarousel)이 카드 한 장을 그리는 데 필요한 최소 필드만 담는다.
 */
export interface EarnedBadgeSummary {
  id: string
  name: string
  description: string
  /** badges.image_url이 null이면 빈 문자열 — 기존 페이로드 관례와 동일 */
  imageUrl: string
  rarity: BadgeRarity
  type: BadgeType
}

/**
 * 이번 싱크에서 발급된 배지 id 목록으로 badges 테이블을 1회 조회해 상세를 채운다.
 *
 * - PostgREST는 `.in()` 결과 순서를 보장하지 않으므로 **id 수집 순서(=획득 순서)로 다시 정렬**한다.
 * - 소프트 삭제된 배지(deleted_at IS NOT NULL)는 제외한다.
 */
async function fetchEarnedBadgeDetails(
  supabase: SupabaseClient,
  badgeIds: string[]
): Promise<EarnedBadgeSummary[]> {
  if (badgeIds.length === 0) return []

  // 같은 배지가 두 경로에서 중복 수집될 여지를 차단 (최초 획득 순서 유지)
  const orderedIds = Array.from(new Set(badgeIds))

  const { data, error } = await supabase
    .from('badges')
    .select('id, name, description, image_url, rarity, type')
    .in('id', orderedIds)
    .is('deleted_at', null)

  if (error) {
    // 상세 조회 실패가 동기화 자체를 막지는 않는다 — 연출만 생략된다.
    console.error('[fetchEarnedBadgeDetails] 획득 배지 상세 조회 오류:', error)
    return []
  }

  type EarnedBadgeRow = {
    id: string
    name: string
    description: string | null
    image_url: string | null
    rarity: BadgeRarity
    type: BadgeType
  }
  const byId = new Map<string, EarnedBadgeRow>()
  for (const row of (data ?? []) as EarnedBadgeRow[]) byId.set(row.id, row)

  return orderedIds
    .map((id) => byId.get(id))
    .filter((row): row is EarnedBadgeRow => Boolean(row))
    .map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      imageUrl: row.image_url ?? '',
      rarity: row.rarity,
      type: row.type,
    }))
}

/**
 * 응답에 **상세를 실어 내려보내는** 배지 카드 수 상한 (20260823_008).
 * 상한을 서버 한 곳에만 두어 스파이크·서비스·타입 문서로 규칙이 갈라지지 않게 한다.
 * 넘치는 만큼은 상세 없이 개수(earnedBadgesMore)로만 전달한다 —
 * 장기 미접속 후 싱크로 배지를 대량 획득해도 description 포함 페이로드가 커지지 않는다.
 */
export const EARNED_BADGE_DETAIL_LIMIT = 10

/** 획득 연출용 응답 조각. `/api/strava/sync`와 최근 획득 조회 API가 같은 계약을 쓴다. */
export interface EarnedBadgePayload {
  /** 획득 순서대로 최대 EARNED_BADGE_DETAIL_LIMIT건 */
  earnedBadges: EarnedBadgeSummary[]
  /** 상세를 싣지 못한 잔여 개수. 0이면 "전체 보기" 카드가 뜨지 않는다 */
  earnedBadgesMore: number
}

/**
 * 발급된 배지 id 목록 → 획득 연출용 응답 조각.
 * 상세 조회는 전체를 한 번에 하고(소프트 삭제 제외·중복 제거가 여기서 끝난다),
 * **응답에 싣는 단계에서만** 상한으로 자른다 — 잔여 개수가 정확해진다.
 */
export async function buildEarnedBadgePayload(
  supabase: SupabaseClient,
  badgeIds: string[]
): Promise<EarnedBadgePayload> {
  const all = await fetchEarnedBadgeDetails(supabase, badgeIds)
  const earnedBadges = all.slice(0, EARNED_BADGE_DETAIL_LIMIT)
  return { earnedBadges, earnedBadgesMore: all.length - earnedBadges.length }
}

/**
 * 소식 #1(활동배지 획득)·#2(희귀 배지 획득) 생성 — 티켓 20260824_019
 *
 * **#2는 #1의 묶음에서 승격 분리된다.** 같은 동기화에서 신화·전설 배지가 나오면
 * `badge_earned` 묶음("배지 3개를 획득했어요")에 섞지 않고 배지 이름이 드러나는
 * 별도 행으로 만든다.
 *
 * 묶음 단위는 "동기화 1회"다. 배지 엔진은 배치 전체를 한 번에 평가하므로 개별 활동에
 * 귀속시킬 수 없어, 이번 배치에서 **가장 최신 활동**의 id를 묶음 키의 대표값으로 쓴다.
 */
async function notifyActivityBadgesEarned(
  supabase: SupabaseClient,
  userId: string,
  activityBadgeIds: string[],
  groupActivityId: number | null
): Promise<void> {
  if (activityBadgeIds.length === 0) return

  const orderedIds = Array.from(new Set(activityBadgeIds))
  const { data, error } = await supabase
    .from('badges')
    .select('id, name, rarity')
    .in('id', orderedIds)
    .is('deleted_at', null)

  if (error) {
    // 소식이 하나 덜 나갈 뿐 동기화 자체를 막지 않는다
    console.error('[notifyActivityBadgesEarned] 배지 조회 오류 — 소식 생성 생략:', error)
    return
  }

  type Row = { id: string; name: string; rarity: BadgeRarity }
  const byId = new Map(((data ?? []) as Row[]).map((r) => [r.id, r]))
  const rows = orderedIds.map((id) => byId.get(id)).filter((r): r is Row => Boolean(r))
  if (rows.length === 0) return

  const isRare = (r: Row) => r.rarity === 'legend' || r.rarity === 'mythic'

  for (const rare of rows.filter(isRare)) {
    await createNotification({
      userId,
      type: 'rare_badge_earned',
      payload: { badge_id: rare.id, badge_name: rare.name, rarity: rare.rarity },
    })
  }

  const normal = rows.filter((r) => !isRare(r))
  if (normal.length > 0) {
    await createNotification({
      userId,
      type: 'badge_earned',
      groupKey: groupActivityId !== null ? syncGroupKey('badge_earned', groupActivityId) : null,
      payload: {
        badge_ids: normal.map((r) => r.id),
        count: normal.length,
        ...(groupActivityId !== null ? { activity_id: groupActivityId } : {}),
      },
      // 배열 필드는 append로 누적한다 (DATA_MODEL §6). 얕은 병합이면 같은 대표 활동으로
      // 묶인 뒤 발급된 배지가 직전 목록을 통째로 덮어쓴다.
      // 행위자가 없는 소식이라 actor_ids는 쓰지 않는다 — 개수는 badge_ids 길이로 렌더한다
      // (payload.count는 "이번 이벤트분"이라 병합 후에는 신뢰하면 안 된다).
      appendKeys: ['badge_ids'],
    })
  }
}

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
): Promise<{
  badges: number
  itemBooksCompleted: number
  missionsCompleted: number
  /** 이번 처리에서 발급된 배지 id — 획득 순서(POI → 아이템 드랍 → 액티비티 → 컬렉션·미션 보상) */
  earnedBadgeIds: string[]
}> {
  if (rawActivities.length === 0) {
    return { badges: 0, itemBooksCompleted: 0, missionsCompleted: 0, earnedBadgeIds: [] }
  }

  // 획득 연출용 — 발급된 배지 id를 발급 순서대로 모은다 (엔진 내부 로직은 건드리지 않고
  // 각 경로가 돌려주는 id만 이어 붙인다).
  const earnedBadgeIds: string[] = []

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

  /**
   * 소식 #4(POI 배지 획득) 재료 — 활동 1건이 묶음 단위라 활동별로 모은다.
   * (같은 활동에서 POI를 여러 곳 지나면 "북한산 외 2곳" 한 건으로 나가야 한다)
   * 20260826_001 — 최초 획득/재방문이 한 활동에 섞일 수 있어 그 여부(isFirstEarns)와
   * 방문 횟수(visitCounts)도 badgeIds/poiNames와 같은 순서로 나란히 쌓는다.
   */
  const poiEarnsByActivity = new Map<
    number,
    { badgeIds: string[]; poiNames: string[]; isFirstEarns: boolean[]; visitCounts: number[] }
  >()

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
      .is('deleted_at', null)
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
        // 이 유저가 이 배지를 이전에 몇 번 획득했는지 먼저 확인한다. poi 배지는 방문할
        // 때마다 반복 획득되는 설계라(badge_id 단위 — 배지 상세 화면 PoiEarnHistory도
        // 같은 기준으로 이력을 모은다), 20260826_001부터는 최초 획득이든 재방문이든
        // 항상 피드에 남기되 "몇 번째 방문인지"를 함께 기록해 문구를 구분한다.
        const { count: priorEarnCount, error: priorEarnError } = await supabase
          .from('user_poi_badge_earns')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('badge_id', badge.id)
        if (priorEarnError) {
          console.error(`[processFetchedActivities] POI 배지 이전 획득 수 조회 오류 (badge_id: ${badge.id}):`, priorEarnError)
        }
        const visitCount = (priorEarnCount ?? 0) + 1
        const isFirstEarn = visitCount === 1

        const earnPayload = {
          user_id: userId,
          badge_id: badge.id,
          poi_id: poi.id,
          triggered_by_strava_id: rawActivity.id,
          triggered_by_activity_name: rawActivity.name,
          triggered_by_distance_km: normalized?.distanceKm ?? null,
          // 20260824_006 — start_date_local은 로컬 벽시계에 Z를 붙인 값이라(진짜 UTC 아님)
          // 그대로 넣으면 최대 +9시간 미래로 오해석된다. 이 필드는 POI 배지 상세 화면
          // (PoiEarnHistory)에 방문일로 노출되므로 반드시 진짜 UTC인 start_date만 쓴다.
          triggered_by_activity_date: rawActivity.start_date,
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
        earnedBadgeIds.push(badge.id)
        const poiEarn = poiEarnsByActivity.get(rawActivity.id) ?? { badgeIds: [], poiNames: [], isFirstEarns: [], visitCounts: [] }
        poiEarn.badgeIds.push(badge.id)
        poiEarn.poiNames.push(poi.name)
        poiEarn.isFirstEarns.push(isFirstEarn)
        poiEarn.visitCounts.push(visitCount)
        poiEarnsByActivity.set(rawActivity.id, poiEarn)
        console.info(`[processFetchedActivities] POI 배지 획득 — userId: ${userId}, poi: ${poi.name}, badge_id: ${badge.id}, visitCount: ${visitCount}`)

        // 20260826_001 — isFirstEarn 여부와 무관하게 항상 기록한다. 재방문은
        // poi_name·visit_count를 함께 실어 프론트(FeedSection)가 "N번째 방문"
        // 문구로 분기하게 한다.
        await recordFeedEvent(userId, 'badge_earned', {
          badge_id: badge.id,
          badge_name: badge.name,
          badge_image_url: badge.image_url ?? '',
          rarity: badge.rarity,
          poi_name: poi.name,
          visit_count: visitCount,
        }, rawActivity.start_date)
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
      earnedBadgeIds.push(poi.linked_badge_id)
      console.info(`[processFetchedActivities] POI 배지 발급 — userId: ${userId}, poi: ${poi.name}, badge_id: ${poi.linked_badge_id}`)
    }
  }

  // 소식 #4(POI 배지 획득) — 티켓 20260824_019. 활동 1건이 묶음 단위.
  // 20260826_001 — 한 활동에서 최초 획득과 재방문이 섞이면 최초 획득 쪽을 대표(헤드라인)로
  // 쓴다. "새로 획득"이 "몇 번째 방문"보다 알림 가치가 크다고 판단했고(배지=신남 톤 유지),
  // 나머지는 기존 slotPlaceMore("{name} 외 {count}곳") 패턴 그대로 뭉친다 — 알림을 2건으로
  // 쪼개면 groupKey·appendKeys 구조를 바꿔야 해서 배보다 배꼽이 크다. 최초 획득이 하나도
  // 없으면(전부 재방문) 첫 번째 항목을 대표로 쓴다.
  for (const [activityId, earn] of poiEarnsByActivity) {
    const firstEarnIndex = earn.isFirstEarns.findIndex((v) => v)
    const repIndex = firstEarnIndex >= 0 ? firstEarnIndex : 0
    await createNotification({
      userId,
      type: 'poi_badge_earned',
      groupKey: syncGroupKey('poi_badge_earned', activityId),
      payload: {
        // 단건 렌더용 대표값 (묶음이면 렌더러가 badge_ids·count를 쓴다)
        badge_id: earn.badgeIds[repIndex],
        poi_name: earn.poiNames[repIndex],
        is_first_earn: earn.isFirstEarns[repIndex],
        visit_count: earn.visitCounts[repIndex],
        badge_ids: earn.badgeIds,
        poi_names: earn.poiNames,
        count: earn.badgeIds.length,
        activity_id: activityId,
      },
      // 배열 필드는 append로 누적 (DATA_MODEL §6). 개수는 badge_ids 길이로 렌더한다
      appendKeys: ['badge_ids', 'poi_names'],
    })
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
    .sort((a, b) => {
      const diff = new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
      // start_date가 동일한 활동(초 단위까지 같은 케이스)이 섞이면 정렬 결과가
      // 실행마다 달라질 수 있어(Array.sort는 동일 키 순서를 보장하지 않는 엔진도 있음),
      // stravaId를 보조 키로 둬 정렬을 결정론적으로 고정한다.
      return diff !== 0 ? diff : b.stravaId - a.stravaId
    })
    .slice(0, isFirstSync ? 1 : MAX_DROP_ACTIVITIES_PER_SYNC)
    .reverse()
  for (const activity of dropTargets) {
    try {
      // 순차 처리 유지 필수 — tryItemDrop이 user_drop_state를 읽고 쓰므로 병렬화하면 안 된다.
      // (반환값이 생겼다고 Promise.all로 바꾸지 말 것 — 위 주석의 순서 역전 버그가 재발한다)
      earnedBadgeIds.push(...(await tryItemDrop(userId, activity, activitiesFiltered)))
    } catch (err) {
      // 배치 중 한 건의 드랍 시도가 실패해도 나머지 활동 처리를 막지 않는다 —
      // 실패는 로깅만 하고 다음 활동으로 계속 진행한다.
      console.error(
        `[processFetchedActivities] tryItemDrop 실패 — userId: ${userId}, stravaId: ${activity.stravaId}:`,
        err
      )
    }
  }

  // 가드 — 배치 처리 후 저장된 user_drop_state.last_activity_at이 이번 배치에서
  // 실제로 가장 최신인 활동(dropTargets 마지막 원소, 오름차순 처리이므로 최신)과
  // 일치하는지 확인한다. 불일치하면 처리 순서 역전 회귀나 최신 활동의 드랍 실패(위
  // try/catch로 흡수된 경우) 등을 의미하므로 경고 로그를 남긴다(흐름은 막지 않음).
  if (dropTargets.length > 0) {
    const latestTarget = dropTargets[dropTargets.length - 1]
    // 20260824_006 — drop-engine의 activityStartDate가 startDate(진짜 UTC) 기준으로
    // 바뀌었으므로, 그 값과 비교하는 이 가드도 동일한 기준으로 맞춰야 한다. 그대로
    // startDateLocal을 쓰면 실제로는 정상인데도 매 싱크마다 불일치 경고가 계속 찍힌다.
    const expectedLastActivityAt = latestTarget.startDate
    const { data: dropStateRow, error: dropStateError } = await supabase
      .from('user_drop_state')
      .select('last_activity_at')
      .eq('user_id', userId)
      .maybeSingle()
    if (dropStateError) {
      console.error('[processFetchedActivities] 드랍 상태 검증 조회 오류:', dropStateError)
    } else {
      const savedLastActivityAt =
        (dropStateRow as { last_activity_at: string | null } | null)?.last_activity_at ?? null
      if (savedLastActivityAt !== expectedLastActivityAt) {
        console.warn(
          `[processFetchedActivities] last_activity_at 불일치 — userId: ${userId}, ` +
          `expected: ${expectedLastActivityAt}, saved: ${savedLastActivityAt}`
        )
        await logEngineDecision('drop', 'drop_state_last_activity_mismatch', userId, {
          expectedLastActivityAt,
          savedLastActivityAt,
          dropTargetsCount: dropTargets.length,
        })
      }
    }
  }

  // 일반 배지 엔진 호출 (speed-filtered 활동만)
  const activityBadgeIds = activitiesFiltered.length > 0 ? await evaluateBadges(userId, activitiesFiltered) : []
  const badgesEarned = activityBadgeIds.length
  earnedBadgeIds.push(...activityBadgeIds)

  // 소식 #1·#2 — 묶음 키의 대표값은 이번 배치에서 가장 최신 활동
  // (start_date가 같은 활동이 섞여도 결정론적이도록 stravaId를 보조 키로 둔다)
  const latestActivity = [...activities].sort((a, b) => {
    const diff = new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    return diff !== 0 ? diff : b.stravaId - a.stravaId
  })[0]
  await notifyActivityBadgesEarned(supabase, userId, activityBadgeIds, latestActivity?.stravaId ?? null)

  // 아이템북 완성 체크 + reward_badge 발급
  const { completedIds, rewardBadgesIssued, rewardBadgeIds } = await checkItemBookCompletion(userId)
  earnedBadgeIds.push(...rewardBadgeIds)
  if (completedIds.length > 0) {
    console.info(`[processFetchedActivities] 아이템북 완성 — userId: ${userId}, 완성 수: ${completedIds.length}, 보상 배지: ${rewardBadgesIssued}`)
  }

  // 소식 #11(컬렉션 완성 가능) — 티켓 20260824_019
  // "완성 시점"이 아니라 **"완성할 수 있는데 아직 안 넣은" 시점**의 소식이다.
  //
  // mode='once' + 컬렉션 단위 group_key로 컬렉션당 1회만 나간다. 이 조건은 유저가
  // 장착할 때까지 계속 참이라, merge로 두면 동기화할 때마다 updated_at이 갱신돼
  // dot이 매번 다시 켜진다(반복 발송 = 다크패턴, PRD §2-4).
  for (const book of await findCompletableItemBooks(userId)) {
    await createNotification({
      userId,
      type: 'collection_completable',
      groupKey: scopedGroupKey('collection_completable', book.id),
      mode: 'once',
      payload: { item_book_id: book.id, book_name: book.name },
    })
  }

  // Phase 16: 다이나믹 미션 달성 체크
  const { completedMissionIds, awardedBadgeIds } = await checkMissions(userId, activitiesFiltered)
  earnedBadgeIds.push(...awardedBadgeIds)
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
    earnedBadgeIds,
  }
}

/**
 * 특정 유저의 Strava 활동을 동기화하고 배지를 평가합니다.
 * @returns synced: 동기화된 활동 수, badges: 신규 발급된 배지 수,
 *          earnedBadges: 이번에 획득한 배지 상세(획득 순서. 최대 EARNED_BADGE_DETAIL_LIMIT건.
 *          없으면 빈 배열 — 필드는 항상 존재),
 *          earnedBadgesMore: 상한을 넘겨 상세를 싣지 못한 잔여 개수
 */
export async function syncStravaActivities(
  userId: string
): Promise<{
  synced: number
  badges: number
  itemBooksCompleted: number
  missionsCompleted: number
  earnedBadges: EarnedBadgeSummary[]
  earnedBadgesMore: number
}> {
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
    let refreshed: Awaited<ReturnType<typeof refreshStravaToken>>
    try {
      refreshed = await refreshStravaToken(refreshToken)
    } catch (err) {
      // 소식 #40(Strava 끊김) — 티켓 20260824_019
      // 갱신 실패는 사실상 서비스 중단(배지 발급이 완전히 멈춘다)인데 현재 유저가
      // 알 방법이 없다. 이 기능 도입의 가장 실용적인 명분이다.
      //
      // group_key를 KST 하루 단위로 둔다: 스펙상 #40은 "묶지 않는 소식"이지만,
      // 연결이 끊긴 상태에서는 동기화를 누를 때마다 이 지점을 지나 같은 소식이
      // 무한히 쌓인다. 하루 1건이면 "개별 소식"의 성격은 유지하면서 폭주만 막는다.
      await createNotification({
        userId,
        type: 'strava_disconnected',
        groupKey: dailyGroupKey('strava_disconnected'),
        mode: 'once',
      })
      throw err
    }
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
    return { synced: 0, badges: 0, itemBooksCompleted: 0, missionsCompleted: 0, earnedBadges: [], earnedBadgesMore: 0 }
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

    const { badges, itemBooksCompleted, missionsCompleted, earnedBadgeIds } = await processFetchedActivities(
      supabase,
      userId,
      accessToken,
      rawActivities,
      isFirstSync,
      'sync'
    )

    // 획득 배지 상세는 엔진 4경로를 각각 개조하는 대신, 수집된 id로 여기서 1회만 조회한다.
    // 카드 상한(10장)도 여기서 적용한다 — 클라이언트는 받은 배열을 그대로 그린다.
    const { earnedBadges, earnedBadgesMore } = await buildEarnedBadgePayload(supabase, earnedBadgeIds)

    // last_synced_at은 4-1 잠금 단계에서 이미 선점 갱신됨 (여기서 재갱신하면
    // 처리 중 업로드된 활동이 다음 싱크에서 누락되는 갭이 생기므로 하지 않는다)

    return {
      synced: rawActivities.length,
      badges,
      itemBooksCompleted,
      missionsCompleted,
      earnedBadges,
      earnedBadgesMore,
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
