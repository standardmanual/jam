/**
 * 랭킹모드 → 순위가 매겨진 목록 (서버 전용, 티켓 20260911_1440)
 *
 * `rankingCalculator.ts`(순수 계산)·`metricValues.ts`(지표 값 공식)를 DB 조회와 묶어
 * "랭킹모드 하나를 받아 화면에 바로 쓸 수 있는 순위 목록을 돌려주는" 진입점을 제공한다.
 * 어드민 랭킹모드 미리보기 API와 투데이 카드 조회(`lib/today/cards.ts`)가 이 모듈을 공유한다.
 *
 * `@/lib/supabase/server`(→ `next/headers`)를 값으로 import하므로 **서버 전용**이다 —
 * 클라이언트 컴포넌트에서 이 파일을 값으로 import하지 않는다(`lib/today/targetHref.ts` 분리와
 * 동일한 이유).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { getActivityHistory, getSignupAnchorDate } from '@/lib/strava/activity-history'
import { rankMissionParticipants, type RankableParticipant } from '@/lib/missions/ranking'
import { rankByMetricValue, type RankableValueEntry } from './rankingCalculator'
import { computeActivityMetricValue, isRankingActivityMetric, isRankingUsageMetric } from './metricValues'
import { excludedTestUserIds } from '@/lib/env/test-accounts'
import { getDisplayName } from '@/lib/utils'
import { kstDateString } from '@/lib/notifications/kst'
import type {
  BadgeType,
  MissionStatusDisplayType,
  MissionType,
  RankingModeMetricType,
  RankingModeRow,
} from '@/types/database'

export interface RankingBoardEntry {
  userId: string
  displayName: string
  username: string | null
  avatarUrl: string | null
  /** 정렬 지표의 현재값 — 포맷은 `lib/ranking/format.ts`의 `formatRankingMetricValue`가 담당 */
  value: number
  rank: number
}

export interface RankingBoardResult {
  entries: RankingBoardEntry[]
  totalParticipants: number
  /** 값 포맷(`formatRankingMetricValue`)을 고르는 데 필요 — 랭킹모드 전체에 하나(행마다 다르지 않다) */
  metricType: RankingModeMetricType
  /** metric_type='mission_progress'일 때만 값을 가진다 — 값 포맷에 필요 */
  missionType: MissionType | null
  /** metric_type='condition_field'일 때만 값을 가진다 — 단위 표시에 필요 */
  conditionFieldKey: string | null
}

/** 랭킹모드가 참조하는 데이터가 지금 유효한지 — User Story 8(어드민 경고)의 판정 근거 */
export type RankingModeIntegrityIssue =
  | { code: 'mission_deleted' }
  | { code: 'mission_not_ranking_type'; missionStatusDisplayType: MissionStatusDisplayType }
  | { code: 'no_target_users' }

interface UserProfile {
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

async function fetchUserProfiles(supabase: SupabaseClient, userIds: string[]): Promise<Map<string, UserProfile>> {
  const map = new Map<string, UserProfile>()
  if (userIds.length === 0) return map
  const { data } = await supabase.from('users').select('id, username, display_name, avatar_url').in('id', userIds)
  for (const u of (data ?? []) as { id: string; username: string | null; display_name: string | null; avatar_url: string | null }[]) {
    map.set(u.id, { username: u.username, display_name: u.display_name, avatar_url: u.avatar_url })
  }
  return map
}

function toEntry(userId: string, value: number, rank: number, profiles: Map<string, UserProfile>): RankingBoardEntry {
  const p = profiles.get(userId) ?? null
  return {
    userId,
    displayName: (p && getDisplayName({ username: p.username, display_name: p.display_name })) || '익명',
    username: p?.username ?? null,
    avatarUrl: p?.avatar_url ?? null,
    value,
    rank,
  }
}

/** 대상이 미션 참가자일 때 — 미션의 기존 순위 비교 규칙(완료 여부 → 완료 시각 → 진행도)을 그대로 감싼다 */
async function computeMissionParticipantsResult(
  supabase: SupabaseClient,
  missionId: string
): Promise<RankingBoardResult> {
  const { data: missionRaw } = await supabase
    .from('missions')
    .select('mission_type')
    .eq('id', missionId)
    .maybeSingle()
  const missionType = (missionRaw as { mission_type: MissionType } | null)?.mission_type ?? null

  const [{ data: participationsRaw }, { data: completionsRaw }] = await Promise.all([
    supabase.from('user_mission_participations').select('user_id, progress_value').eq('mission_id', missionId),
    supabase.from('user_mission_completions').select('user_id, completed_at').eq('mission_id', missionId),
  ])

  const excludedIds = excludedTestUserIds()
  const participations = ((participationsRaw ?? []) as { user_id: string; progress_value: number }[]).filter(
    (p) => !excludedIds.includes(p.user_id)
  )
  const completionMap = new Map<string, string>()
  for (const c of (completionsRaw ?? []) as { user_id: string; completed_at: string }[]) {
    if (!excludedIds.includes(c.user_id)) completionMap.set(c.user_id, c.completed_at)
  }

  const rankable: RankableParticipant[] = participations.map((p) => ({
    userId: p.user_id,
    progressValue: p.progress_value ?? 0,
    completedAt: completionMap.get(p.user_id) ?? null,
  }))
  const ranked = rankMissionParticipants(rankable)

  const profiles = await fetchUserProfiles(supabase, ranked.map((r) => r.userId))
  const entries = ranked.map((r) => toEntry(r.userId, r.progressValue, r.rank, profiles))

  return { entries, totalParticipants: entries.length, metricType: 'mission_progress', missionType, conditionFieldKey: null }
}

/** 배지 보유 개수 — 타입별 소유 테이블에서 유저별 distinct badge_id 개수를 센다 */
async function fetchBadgeCounts(
  supabase: SupabaseClient,
  userIds: string[],
  badgeType: BadgeType
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (userIds.length === 0) return counts

  const addDistinct = (rows: { user_id: string; badge_id: string }[]) => {
    const seen = new Map<string, Set<string>>()
    for (const r of rows) {
      if (!seen.has(r.user_id)) seen.set(r.user_id, new Set())
      seen.get(r.user_id)!.add(r.badge_id)
    }
    for (const [userId, badgeIds] of seen) counts.set(userId, badgeIds.size)
  }

  if (badgeType === 'activity') {
    const { data } = await supabase.from('user_activity_badges').select('user_id, badge_id').in('user_id', userIds)
    addDistinct((data ?? []) as { user_id: string; badge_id: string }[])
  } else if (badgeType === 'checkin') {
    // 체크인 배지는 같은 지점에 반복 체크인해 같은 badge_id로 여러 행이 쌓일 수 있다 — distinct 집계 필수.
    const { data } = await supabase.from('user_checkin_badge_earns').select('user_id, badge_id').in('user_id', userIds)
    addDistinct((data ?? []) as { user_id: string; badge_id: string }[])
  } else {
    // 아이템 배지 — 같은 배지를 여러 개(일련번호 다름) 보유할 수 있어 distinct 집계 필수.
    // 드랍(양도)해 넘긴 개체는 제외(dropped_at IS NULL) — cards.ts의 fetchBadgesById와 동일 전제.
    const { data } = await supabase
      .from('inventory_items')
      .select('badge_id, inventory!inner(user_id)')
      .is('dropped_at', null)
      .in('inventory.user_id', userIds)
    // `!inner`는 런타임에 단일 객체로 임베드되지만(1:1 FK), 타입 미지정 SupabaseClient의 select
    // 문자열 파서는 항상 배열로 추론한다(cards.ts의 fetchBadgesById와 같은 쿼리 — 그쪽은 단일
    // 유저만 조회해 이 필드를 읽지 않으므로 이 불일치를 만나지 않았다). unknown을 거쳐 실제
    // 런타임 모양으로 좁힌다.
    const rows = (data ?? []) as unknown as { badge_id: string; inventory: { user_id: string } }[]
    addDistinct(rows.map((r) => ({ user_id: r.inventory.user_id, badge_id: r.badge_id })))
  }

  return counts
}

/** 팔로워 수/팔로잉 수 — user_follows를 직접 센다(usageBadges.ts가 배지 판정에 쓰는 것과 같은 소스) */
async function fetchFollowCounts(
  supabase: SupabaseClient,
  userIds: string[],
  metric: 'follower_count' | 'following_count'
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (userIds.length === 0) return counts
  const column = metric === 'follower_count' ? 'following_id' : 'follower_id'
  const { data } = await supabase.from('user_follows').select(`${column}`).in(column, userIds)
  for (const row of (data ?? []) as Record<string, string>[]) {
    const id = row[column]
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}

/** 하루 동기화 횟수 — 오늘(KST) 카운트. usageBadges.ts의 판정 기준과 동일(오늘 값) */
async function fetchDailySyncCounts(supabase: SupabaseClient, userIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (userIds.length === 0) return counts
  const { data } = await supabase
    .from('user_daily_sync_counts')
    .select('user_id, count')
    .eq('sync_date', kstDateString())
    .in('user_id', userIds)
  for (const row of (data ?? []) as { user_id: string; count: number }[]) counts.set(row.user_id, row.count)
  return counts
}

/**
 * 활동 이력 기반 지표 — 유저마다 가입 시점 앵커 + 랭킹모드의 집계 시작·종료 일시를 적용한
 * 이력을 조회해 계산한다.
 *
 * 집계 기간을 적용하는 이유(User Story 13 — "집계 기간이 끝난 뒤에도 최종 결과를 그대로
 * 유지"): 대상이 미션 참가자일 때는 미션 참가 기간이 자연히 그 역할을 하지만, 수동 지정
 * 유저는 그런 기준이 없다 — 시작·종료 일시로 잘라두지 않으면 투데이 카드가 랭킹모드의
 * 집계 종료 뒤에도 노출되는 동안 유저가 계속 활동할 때마다 "최종 결과"가 계속 바뀐다.
 * 하한은 가입 시점 앵커(배지 진행률 표시와 동일 전제)와 랭킹모드 시작 중 늦은 쪽 —
 * `getActivityHistory`의 `sinceDate`는 "그 이후"만 남기므로 큰 값(더 늦은 시점)을 넘겨야
 * 두 제약이 동시에 적용된다.
 */
async function fetchActivityMetricValues(
  supabase: SupabaseClient,
  userIds: string[],
  fieldKey: Parameters<typeof computeActivityMetricValue>[0],
  window: { startsAt: string; endsAt: string }
): Promise<Map<string, number>> {
  const values = new Map<string, number>()
  await Promise.all(
    userIds.map(async (userId) => {
      const signupAnchor = await getSignupAnchorDate(supabase, userId)
      const since = signupAnchor && signupAnchor > window.startsAt ? signupAnchor : window.startsAt
      const activities = (await getActivityHistory(supabase, userId, since)).filter((a) => a.startDate <= window.endsAt)
      values.set(userId, computeActivityMetricValue(fieldKey, activities))
    })
  )
  return values
}

/** 대상이 수동 지정 유저일 때 — 지표 하나(condition_field 또는 badge_count)의 값으로 정렬한다 */
async function computeManualUsersResult(
  supabase: SupabaseClient,
  mode: RankingModeRow
): Promise<RankingBoardResult> {
  // 탈퇴 등으로 사라진 유저 id는 users 조회에서 자연히 빠진다(target_user_ids는 UUID[]라 FK
  // 무결성이 없다 — 마이그레이션 158 주석 참고). 존재하는 유저만 랭킹에 남는다.
  const profiles = await fetchUserProfiles(supabase, mode.target_user_ids)
  const existingUserIds = mode.target_user_ids.filter((id) => profiles.has(id))
  const conditionFieldKey = mode.metric_type === 'condition_field' ? mode.metric_field_key : null
  if (existingUserIds.length === 0) {
    return { entries: [], totalParticipants: 0, metricType: mode.metric_type, missionType: null, conditionFieldKey }
  }

  let valueByUser: Map<string, number>

  if (mode.metric_type === 'badge_count') {
    const badgeType = mode.metric_badge_type ?? 'activity'
    valueByUser = await fetchBadgeCounts(supabase, existingUserIds, badgeType)
  } else {
    const fieldKey = mode.metric_field_key ?? ''
    if (isRankingActivityMetric(fieldKey)) {
      valueByUser = await fetchActivityMetricValues(supabase, existingUserIds, fieldKey, {
        startsAt: mode.starts_at,
        endsAt: mode.ends_at,
      })
    } else if (isRankingUsageMetric(fieldKey)) {
      valueByUser =
        fieldKey === 'daily_sync_count'
          ? await fetchDailySyncCounts(supabase, existingUserIds)
          : await fetchFollowCounts(supabase, existingUserIds, fieldKey)
    } else {
      // 1차 미지원 필드 — 저장 시점에 API 검증이 막지만, 방어적으로 빈 결과를 돌려준다
      // (fail-closed: 잘못된 값으로 순위를 매기는 것보다 안전하다).
      console.error(`[computeManualUsersResult] 1차 미지원 지표 필드 — mode: ${mode.id}, key: ${fieldKey}`)
      valueByUser = new Map()
    }
  }

  const rankable: RankableValueEntry[] = existingUserIds.map((userId) => ({
    userId,
    value: valueByUser.get(userId) ?? 0,
  }))
  const ranked = rankByMetricValue(rankable, 'higher')
  const entries = ranked.map((r) => toEntry(r.userId, r.value, r.rank, profiles))

  return { entries, totalParticipants: entries.length, metricType: mode.metric_type, missionType: null, conditionFieldKey }
}

/**
 * 랭킹모드 하나의 순위 목록을 계산한다. `visible_rank_count`가 있으면 그 인원까지만 자른다
 * (전체 인원 수 `totalParticipants`는 자르기 전 값 — 미션 상세 화면과 동일한 "N명 중 상위 M명" 관례).
 */
export async function computeRankingModeResult(
  mode: RankingModeRow,
  client?: SupabaseClient
): Promise<RankingBoardResult> {
  const supabase = client ?? createServiceClient()

  const result =
    mode.target_type === 'mission_participants' && mode.target_mission_id
      ? await computeMissionParticipantsResult(supabase, mode.target_mission_id)
      : mode.target_type === 'manual_users'
        ? await computeManualUsersResult(supabase, mode)
        : {
            entries: [],
            totalParticipants: 0,
            metricType: mode.metric_type,
            missionType: null,
            conditionFieldKey: mode.metric_type === 'condition_field' ? mode.metric_field_key : null,
          }

  if (mode.visible_rank_count != null && result.entries.length > mode.visible_rank_count) {
    return { ...result, entries: result.entries.slice(0, mode.visible_rank_count) }
  }
  return result
}

/**
 * 랭킹모드가 참조하는 데이터가 지금도 유효한지 — User Story 8(연결된 미션이 삭제되거나
 * 랭킹형이 아니게 바뀌면 경고). 목록 화면이 랭킹모드마다 호출해 경고 칩을 그린다.
 */
export async function checkRankingModeIntegrity(
  mode: RankingModeRow,
  client?: SupabaseClient
): Promise<RankingModeIntegrityIssue | null> {
  const supabase = client ?? createServiceClient()

  if (mode.target_type === 'mission_participants') {
    if (!mode.target_mission_id) return { code: 'mission_deleted' }
    const { data } = await supabase
      .from('missions')
      .select('status_display_type')
      .eq('id', mode.target_mission_id)
      .maybeSingle()
    const mission = data as { status_display_type: MissionStatusDisplayType } | null
    if (!mission) return { code: 'mission_deleted' }
    if (mission.status_display_type !== 'ranking') {
      return { code: 'mission_not_ranking_type', missionStatusDisplayType: mission.status_display_type }
    }
    return null
  }

  if (mode.target_user_ids.length === 0) return { code: 'no_target_users' }
  return null
}
