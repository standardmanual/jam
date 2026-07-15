/**
 * JAM! 배지 발급 엔진 (서버 사이드 전용)
 *
 * - type='activity' 배지에 대해 condition_json 평가
 * - 성장 티어 정책: 배지 이름당 최상위 레어리티 1개만 발급
 * - 미구현 조건 타입은 false 처리 (자동 통과 방지)
 */
import { createServiceClient } from '@/lib/supabase/server'
import { recordFeedEvent } from '@/lib/activity-feed'
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeCondition, BadgeRow, UserActivityBadgeRow } from '@/types/database'

const RARITY_TIER: Record<string, number> = { common: 1, rare: 2, legendary: 3, mythic: 4 }

export async function evaluateBadges(
  userId: string,
  activities: NormalizedActivity[]
): Promise<number> {
  const supabase = createServiceClient()

  const { data: allBadgesRaw, error: badgesError } = await supabase
    .from('badges')
    .select('*')
    .eq('type', 'activity')

  const allBadges = allBadgesRaw as BadgeRow[] | null

  if (badgesError || !allBadges || allBadges.length === 0) {
    if (badgesError) console.error('[evaluateBadges] 배지 목록 조회 오류:', badgesError)
    return 0
  }

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

  // 성장 티어: 배지 이름당 현재 보유 최상위 레어리티 파악
  const highestOwnedTierByName = new Map<string, number>()
  for (const badge of allBadges) {
    if (ownedBadgeIds.has(badge.id)) {
      const tier = RARITY_TIER[badge.rarity] ?? 0
      const current = highestOwnedTierByName.get(badge.name) ?? 0
      if (tier > current) highestOwnedTierByName.set(badge.name, tier)
    }
  }

  // 배지 이름별 그룹핑
  const badgesByName = new Map<string, BadgeRow[]>()
  for (const badge of allBadges) {
    if (!badgesByName.has(badge.name)) badgesByName.set(badge.name, [])
    badgesByName.get(badge.name)!.push(badge)
  }

  let earnedCount = 0

  for (const [, group] of badgesByName) {
    const highestOwned = highestOwnedTierByName.get(group[0].name) ?? 0

    // 아직 없거나 보유 티어보다 높은 레어리티 중 조건 통과한 것만 선별
    const eligible = group.filter((b) => {
      if (ownedBadgeIds.has(b.id)) return false
      if ((RARITY_TIER[b.rarity] ?? 0) <= highestOwned) return false
      if (!b.condition_json) return false
      return checkCondition(b.condition_json as BadgeCondition, activities)
    })

    if (eligible.length === 0) continue

    // 최상위 레어리티 1개만 발급
    eligible.sort((a, b) => (RARITY_TIER[b.rarity] ?? 0) - (RARITY_TIER[a.rarity] ?? 0))
    const toIssue = eligible[0]

    const condition = toIssue.condition_json as BadgeCondition
    const triggerActivity = condition.activity_type
      ? activities.find((a) => a.jamActivityType === condition.activity_type)
      : activities[0]

    const { error: insertError } = await supabase
      .from('user_activity_badges')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        user_id: userId,
        badge_id: toIssue.id,
        triggered_by: 'strava_sync',
        triggered_by_strava_id: triggerActivity?.stravaId ?? null,
        triggered_by_activity_name: triggerActivity?.name ?? null,
        triggered_by_distance_km: triggerActivity?.distanceKm ?? null,
        triggered_by_activity_date: triggerActivity?.startDate ?? null,
      } as any)

    if (insertError) {
      if (insertError.code === '23505') continue
      console.error(`[evaluateBadges] 배지 발급 오류 (badge_id: ${toIssue.id}):`, insertError)
      continue
    }

    earnedCount++
    console.info(`[evaluateBadges] 배지 발급 — userId: ${userId}, badge: ${toIssue.name} (${toIssue.rarity})`)
    await recordFeedEvent(userId, 'badge_earned', {
      badge_id: toIssue.id,
      badge_name: toIssue.name,
      badge_image_url: toIssue.image_url ?? '',
      rarity: toIssue.rarity,
    })
  }

  return earnedCount
}

// =========================================
// 조건 평가 — 미구현 조건은 false 반환
// =========================================

function checkCondition(condition: BadgeCondition, activities: NormalizedActivity[]): boolean {
  const filtered = condition.activity_type
    ? activities.filter((a) => a.jamActivityType === condition.activity_type)
    : activities

  // 누적 거리
  if (condition.distance_km !== undefined) {
    const totalKm = filtered.reduce((sum, a) => sum + a.distanceKm, 0)
    if (totalKm < condition.distance_km) return false
  }

  // 활동 횟수
  if (condition.total_count !== undefined) {
    if (filtered.length < condition.total_count) return false
  }

  // 고도 상승
  if (condition.elevation_gain_m !== undefined) {
    const totalElev = filtered.reduce((sum, a) => sum + a.elevationGainM, 0)
    if (totalElev < condition.elevation_gain_m) return false
  }

  // 단일 활동 최소 속도
  if (condition.min_speed_kmh !== undefined) {
    const hasSpeed = filtered.some((a) => a.averageSpeedKmh >= condition.min_speed_kmh!)
    if (!hasSpeed) return false
  }

  // 연속 활동 일수
  if (condition.streak_days !== undefined) {
    if (calcMaxStreak(filtered) < condition.streak_days) return false
  }

  // 단일 활동 최소 이동 시간 (분)
  if (condition.duration_minutes !== undefined) {
    const has = filtered.some((a) => a.movingTimeSec / 60 >= condition.duration_minutes!)
    if (!has) return false
  }

  // 주말 활동 최소 이동 시간 (시간)
  if (condition.weekend_duration_hours !== undefined) {
    const has = filtered.some((a) => {
      const day = new Date(a.startDate).getDay() // 0=일, 6=토
      return (day === 0 || day === 6) && a.movingTimeSec / 3600 >= condition.weekend_duration_hours!
    })
    if (!has) return false
  }

  // 같은 주 최소 활동 횟수
  if (condition.weekly_count !== undefined) {
    const weekCounts = new Map<string, number>()
    for (const a of filtered) {
      const key = getMondayKey(new Date(a.startDate))
      weekCounts.set(key, (weekCounts.get(key) ?? 0) + 1)
    }
    const maxWeekCount = weekCounts.size > 0 ? Math.max(...weekCounts.values()) : 0
    if (maxWeekCount < condition.weekly_count) return false
  }

  // 특정 월 + 월 누적 거리
  if (condition.month !== undefined || condition.monthly_km !== undefined) {
    let monthFiltered = filtered
    if (condition.month !== undefined) {
      monthFiltered = filtered.filter(
        (a) => new Date(a.startDate).getMonth() + 1 === condition.month
      )
    }
    if (condition.monthly_km !== undefined) {
      const monthKm = new Map<string, number>()
      for (const a of monthFiltered) {
        const d = new Date(a.startDate)
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`
        monthKm.set(key, (monthKm.get(key) ?? 0) + a.distanceKm)
      }
      const maxKm = monthKm.size > 0 ? Math.max(...monthKm.values()) : 0
      if (maxKm < condition.monthly_km) return false
    } else if (condition.month !== undefined && monthFiltered.length === 0) {
      return false
    }
  }

  // 미구현: season_count — condition_json에 season 필드 없어 평가 불가
  if (condition.season_count !== undefined) return false

  // 미구현: 날씨 조건 — 실시간 날씨 데이터 없음
  if (condition.temperature_min_c !== undefined || condition.temperature_max_c !== undefined) return false

  // POI 조건은 poi_match 경로에서 처리
  if (condition.poi_id !== undefined) return false

  return true
}

function getMondayKey(date: Date): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d.toISOString().slice(0, 10)
}

function calcMaxStreak(activities: NormalizedActivity[]): number {
  if (activities.length === 0) return 0

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
