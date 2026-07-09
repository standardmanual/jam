/**
 * JAM! 배지 발급 엔진 (서버 사이드 전용)
 *
 * - type='activity' 배지에 대해 condition_json 평가
 * - 조건 충족 시 user_activity_badges에 INSERT
 * - service_role 클라이언트 사용 (RLS 우회)
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeCondition, BadgeRow, UserActivityBadgeRow } from '@/types/database'

/**
 * 활동 목록을 기반으로 배지 조건을 평가하고 발급합니다.
 * @returns 신규 발급된 배지 수
 */
export async function evaluateBadges(
  userId: string,
  activities: NormalizedActivity[]
): Promise<number> {
  const supabase = createServiceClient()

  // 1. type='activity' 배지 전체 조회
  const { data: allBadgesRaw, error: badgesError } = await supabase
    .from('badges')
    .select('*')
    .eq('type', 'activity')

  const allBadges = allBadgesRaw as BadgeRow[] | null

  if (badgesError || !allBadges || allBadges.length === 0) {
    if (badgesError) console.error('[evaluateBadges] 배지 목록 조회 오류:', badgesError)
    return 0
  }

  // 2. 유저가 이미 보유한 배지 ID 목록
  const { data: ownedBadgesRaw, error: ownedError } = await supabase
    .from('user_activity_badges')
    .select('badge_id')
    .eq('user_id', userId)

  const ownedBadges = ownedBadgesRaw as Pick<UserActivityBadgeRow, 'badge_id'>[] | null

  if (ownedError) {
    console.error('[evaluateBadges] 보유 배지 조회 오류:', ownedError)
    return 0
  }

  const ownedBadgeIds = new Set((ownedBadges ?? []).map((b) => b.badge_id))

  // 3. 미보유 배지만 평가
  const unownedBadges = allBadges.filter((b) => !ownedBadgeIds.has(b.id))

  let earnedCount = 0

  for (const badge of unownedBadges) {
    if (!badge.condition_json) continue

    const condition = badge.condition_json as BadgeCondition
    const qualified = checkCondition(condition, activities)

    if (!qualified) continue

    // 4. 배지 발급 (INSERT)
    const { error: insertError } = await supabase
      .from('user_activity_badges')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        user_id: userId,
        badge_id: badge.id,
        triggered_by: 'strava_sync',
      } as any)

    if (insertError) {
      // 중복 발급 방지 — 이미 존재하는 경우 무시
      if (insertError.code === '23505') continue
      console.error(`[evaluateBadges] 배지 발급 오류 (badge_id: ${badge.id}):`, insertError)
      continue
    }

    earnedCount++
    console.info(`[evaluateBadges] 배지 발급 완료 — userId: ${userId}, badge: ${badge.name}`)
  }

  return earnedCount
}

// =========================================
// 조건 평가 로직 (Phase 1 기본 조건)
// =========================================

/**
 * condition_json 조건을 activities 목록에 대해 평가
 * 여러 조건이 있으면 AND 조건으로 처리
 */
function checkCondition(
  condition: BadgeCondition,
  activities: NormalizedActivity[]
): boolean {
  // 활동 종류 필터 (activity_type이 명시된 경우 해당 종목만 사용)
  const filtered = condition.activity_type
    ? activities.filter((a) => a.jamActivityType === condition.activity_type)
    : activities

  // 누적 거리 (km) 조건
  if (condition.distance_km !== undefined) {
    const totalKm = filtered.reduce((sum, a) => sum + a.distanceKm, 0)
    if (totalKm < condition.distance_km) return false
  }

  // 활동 횟수 조건
  if (condition.total_count !== undefined) {
    if (filtered.length < condition.total_count) return false
  }

  // 고도 상승 누적 (m) 조건
  if (condition.elevation_gain_m !== undefined) {
    const totalElev = filtered.reduce((sum, a) => sum + a.elevationGainM, 0)
    if (totalElev < condition.elevation_gain_m) return false
  }

  // 단일 활동 최소 속도 조건
  if (condition.min_speed_kmh !== undefined) {
    const hasSpeed = filtered.some((a) => a.averageSpeedKmh >= condition.min_speed_kmh!)
    if (!hasSpeed) return false
  }

  // 연속 활동 일수 조건 (streak)
  if (condition.streak_days !== undefined) {
    const streak = calcMaxStreak(filtered)
    if (streak < condition.streak_days) return false
  }

  // POI 조건은 Phase 2+에서 구현
  if (condition.poi_id !== undefined) {
    return false
  }

  return true
}

/**
 * 최대 연속 활동 일수 계산
 */
function calcMaxStreak(activities: NormalizedActivity[]): number {
  if (activities.length === 0) return 0

  // 날짜별 정렬 (오래된 것 먼저)
  const dates = activities
    .map((a) => new Date(a.startDate).toISOString().slice(0, 10))
    .sort()

  const uniqueDates = [...new Set(dates)]

  let maxStreak = 1
  let currentStreak = 1

  for (let i = 1; i < uniqueDates.length; i++) {
    const prev = new Date(uniqueDates[i - 1])
    const curr = new Date(uniqueDates[i])
    const diffDays = (curr.getTime() - prev.getTime()) / 86_400_000

    if (diffDays === 1) {
      currentStreak++
      maxStreak = Math.max(maxStreak, currentStreak)
    } else {
      currentStreak = 1
    }
  }

  return maxStreak
}
