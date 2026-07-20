/**
 * JAM! 배지 발급 엔진 (서버 사이드 전용)
 *
 * - type='activity' 배지에 대해 condition_json 평가
 * - 성장 티어 정책: 배지 이름당 최상위 레어리티 1개만 발급
 * - 진행 트랙 정책: 동일 트랙(거리/횟수) 내 최고값 배지 1개만 발급
 * - 미구현 조건 타입은 false 처리 (자동 통과 방지)
 */
import { createServiceClient } from '@/lib/supabase/server'
import { recordFeedEvent } from '@/lib/activity-feed'
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeCondition, BadgeRow, UserActivityBadgeRow } from '@/types/database'

const RARITY_TIER: Record<string, number> = { common: 1, rare: 2, legendary: 3, mythic: 4 }

// ── 공개 타입 ────────────────────────────────────────────────────────────

export type EvalConditionResult = {
  pass: boolean
  reason: string
  actual: string
  required: string
}

export type BadgeEarnedInfo = {
  id: string
  name: string
  rarity: string
  reason: string
}

export type BadgeMissedInfo = {
  id: string
  name: string
  reason: string
  actual: string
  required: string
}

// ── 조건 평가 (상세 이유 포함) ────────────────────────────────────────────

export function evaluateConditionDetailed(
  condition: BadgeCondition,
  activities: NormalizedActivity[]
): EvalConditionResult {
  if (!condition || Object.keys(condition).length === 0) {
    return { pass: false, reason: '조건 없음', actual: '-', required: '-' }
  }

  const filtered = condition.activity_type
    ? activities.filter((a) => a.jamActivityType === condition.activity_type)
    : activities

  if (condition.distance_km !== undefined) {
    const totalKm = Math.round(filtered.reduce((sum, a) => sum + a.distanceKm, 0) * 10) / 10
    if (totalKm < condition.distance_km) {
      return { pass: false, reason: '거리 부족', actual: `${totalKm}km`, required: `${condition.distance_km}km` }
    }
  }

  if (condition.total_count !== undefined) {
    if (filtered.length < condition.total_count) {
      return { pass: false, reason: '활동 횟수 부족', actual: `${filtered.length}회`, required: `${condition.total_count}회` }
    }
  }

  if (condition.elevation_gain_m !== undefined) {
    const totalElev = Math.round(filtered.reduce((sum, a) => sum + a.elevationGainM, 0))
    if (totalElev < condition.elevation_gain_m) {
      return { pass: false, reason: '고도 상승 부족', actual: `${totalElev}m`, required: `${condition.elevation_gain_m}m` }
    }
  }

  if (condition.min_speed_kmh !== undefined) {
    const maxSpeed = Math.max(...filtered.map((a) => a.averageSpeedKmh), 0)
    if (maxSpeed < condition.min_speed_kmh) {
      return { pass: false, reason: '속도 부족', actual: `${maxSpeed}km/h`, required: `${condition.min_speed_kmh}km/h` }
    }
  }

  if (condition.streak_days !== undefined) {
    const streak = calcMaxStreak(filtered)
    if (streak < condition.streak_days) {
      return { pass: false, reason: '연속 일수 부족', actual: `${streak}일`, required: `${condition.streak_days}일` }
    }
  }

  if (condition.duration_minutes !== undefined) {
    const best = Math.max(...filtered.map((a) => a.movingTimeSec / 60), 0)
    if (best < condition.duration_minutes) {
      return { pass: false, reason: '이동 시간 부족', actual: `${Math.round(best)}분`, required: `${condition.duration_minutes}분` }
    }
  }

  if (condition.weekend_duration_hours !== undefined) {
    const best = Math.max(
      ...filtered
        .filter((a) => { const d = new Date(a.startDate).getDay(); return d === 0 || d === 6 })
        .map((a) => a.movingTimeSec / 3600),
      0
    )
    if (best < condition.weekend_duration_hours) {
      return { pass: false, reason: '주말 활동 시간 부족', actual: `${best.toFixed(1)}시간`, required: `${condition.weekend_duration_hours}시간` }
    }
  }

  if (condition.weekly_count !== undefined) {
    const weekCounts = new Map<string, number>()
    for (const a of filtered) {
      const key = getMondayKey(new Date(a.startDate))
      weekCounts.set(key, (weekCounts.get(key) ?? 0) + 1)
    }
    const maxWeek = weekCounts.size > 0 ? Math.max(...weekCounts.values()) : 0
    if (maxWeek < condition.weekly_count) {
      return { pass: false, reason: '주간 활동 횟수 부족', actual: `${maxWeek}회`, required: `${condition.weekly_count}회` }
    }
  }

  if (condition.month !== undefined || condition.monthly_km !== undefined) {
    let monthFiltered = filtered
    if (condition.month !== undefined) {
      monthFiltered = filtered.filter((a) => new Date(a.startDate).getMonth() + 1 === condition.month)
    }
    if (condition.monthly_km !== undefined) {
      const monthKm = new Map<string, number>()
      for (const a of monthFiltered) {
        const d = new Date(a.startDate)
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`
        monthKm.set(key, (monthKm.get(key) ?? 0) + a.distanceKm)
      }
      const maxKm = monthKm.size > 0 ? Math.max(...monthKm.values()) : 0
      if (maxKm < condition.monthly_km) {
        return { pass: false, reason: '월 누적 거리 부족', actual: `${Math.round(maxKm * 10) / 10}km`, required: `${condition.monthly_km}km` }
      }
    } else if (condition.month !== undefined && monthFiltered.length === 0) {
      return { pass: false, reason: '해당 월 활동 없음', actual: '0회', required: '1회 이상' }
    }
  }

  if (condition.season_count !== undefined) {
    if (!condition.season) {
      return { pass: false, reason: '계절 조건 미구현 (season 필드 없음)', actual: '-', required: `${condition.season_count}회` }
    }
    const SEASON_MONTHS: Record<string, number[]> = {
      spring: [3, 4, 5], summer: [6, 7, 8], fall: [9, 10, 11], winter: [12, 1, 2],
    }
    const seasonFiltered = condition.season === 'all'
      ? filtered
      : filtered.filter((a) => {
          const m = new Date(a.startDate).getMonth() + 1
          return (SEASON_MONTHS[condition.season!] ?? []).includes(m)
        })
    if (seasonFiltered.length < condition.season_count) {
      const label = condition.season === 'all' ? '전체' : ({ spring: '봄', summer: '여름', fall: '가을', winter: '겨울' }[condition.season] ?? condition.season)
      return { pass: false, reason: `${label} 활동 횟수 부족`, actual: `${seasonFiltered.length}회`, required: `${condition.season_count}회` }
    }
  }

  if (condition.temperature_min_c !== undefined || condition.temperature_max_c !== undefined) {
    return { pass: false, reason: '날씨 조건 미구현', actual: '-', required: '날씨 데이터 필요' }
  }

  if (condition.poi_id !== undefined) {
    return { pass: false, reason: 'POI 미매칭', actual: '미통과', required: 'POI 반경 통과 필요' }
  }

  return { pass: true, reason: '조건 충족', actual: '', required: '' }
}

export function checkCondition(condition: BadgeCondition, activities: NormalizedActivity[]): boolean {
  return evaluateConditionDetailed(condition, activities).pass
}

// ── 핵심 평가 함수 ────────────────────────────────────────────────────────

/**
 * 배지 평가 (상세 결과 반환 + 선택적 DB 저장)
 *
 * @param dryRun  true면 평가만 하고 DB에 저장하지 않음 (기본값: false)
 * @param triggeredBy  발급 트리거 식별자 (기본값: 'strava_sync')
 * @param silent  true면 피드 이벤트를 기록하지 않음 (기본값: false)
 */
export async function evaluateBadgesDetailed(
  userId: string,
  activities: NormalizedActivity[],
  options?: {
    dryRun?: boolean
    triggeredBy?: string
    silent?: boolean
  }
): Promise<{ earned: BadgeEarnedInfo[]; missed: BadgeMissedInfo[] }> {
  const { dryRun = false, triggeredBy = 'strava_sync', silent = false } = options ?? {}

  const supabase = createServiceClient()

  const now = new Date().toISOString()
  const { data: allBadgesRaw, error: badgesError } = await supabase
    .from('badges')
    .select('*')
    .eq('type', 'activity')
    .or(`valid_from.is.null,valid_from.lte.${now}`)
    .or(`valid_until.is.null,valid_until.gte.${now}`)

  const allBadges = allBadgesRaw as BadgeRow[] | null

  if (badgesError || !allBadges || allBadges.length === 0) {
    if (badgesError) console.error('[evaluateBadgesDetailed] 배지 목록 조회 오류:', badgesError)
    return { earned: [], missed: [] }
  }

  const { data: ownedBadgesRaw, error: ownedError } = await supabase
    .from('user_activity_badges')
    .select('badge_id, earned_at')
    .eq('user_id', userId)

  const ownedBadges = ownedBadgesRaw as Pick<UserActivityBadgeRow, 'badge_id' | 'earned_at'>[] | null

  if (ownedError) {
    console.error('[evaluateBadgesDetailed] 보유 배지 조회 오류:', ownedError)
    return { earned: [], missed: [] }
  }

  const ownedBadgeIds = new Set((ownedBadges ?? []).map((b) => b.badge_id))

  const highestOwnedTierByName = new Map<string, number>()
  for (const badge of allBadges) {
    if (ownedBadgeIds.has(badge.id)) {
      const tier = RARITY_TIER[badge.rarity] ?? 0
      const current = highestOwnedTierByName.get(badge.name) ?? 0
      if (tier > current) highestOwnedTierByName.set(badge.name, tier)
    }
  }

  const badgesByName = new Map<string, BadgeRow[]>()
  for (const badge of allBadges) {
    if (!badgesByName.has(badge.name)) badgesByName.set(badge.name, [])
    badgesByName.get(badge.name)!.push(badge)
  }

  // ── 1단계: 이름별 후보 선정 (이름당 최상위 티어 1개) ──────────────────
  type Candidate = {
    badge: BadgeRow
    condition: BadgeCondition
    progressionKey: string | null
    progressionValue: number
  }
  const candidates: Candidate[] = []
  const missed: BadgeMissedInfo[] = []

  for (const [, group] of badgesByName) {
    const highestOwned = highestOwnedTierByName.get(group[0].name) ?? 0

    const eligible: { badge: BadgeRow; evalResult: EvalConditionResult }[] = []
    for (const badge of group) {
      if (ownedBadgeIds.has(badge.id)) continue
      if ((RARITY_TIER[badge.rarity] ?? 0) <= highestOwned) continue
      const evalResult = evaluateConditionDetailed(badge.condition_json as BadgeCondition ?? {}, activities)
      if (evalResult.pass) {
        eligible.push({ badge, evalResult })
      } else {
        missed.push({ id: badge.id, name: badge.name, reason: evalResult.reason, actual: evalResult.actual, required: evalResult.required })
      }
    }

    if (eligible.length === 0) continue

    eligible.sort((a, b) => (RARITY_TIER[b.badge.rarity] ?? 0) - (RARITY_TIER[a.badge.rarity] ?? 0))
    const { badge: winner } = eligible[0]
    const condition = winner.condition_json as BadgeCondition
    const prog = getProgressionKey(condition)
    candidates.push({ badge: winner, condition, progressionKey: prog?.key ?? null, progressionValue: prog?.value ?? 0 })

    for (const { badge } of eligible.slice(1)) {
      missed.push({ id: badge.id, name: badge.name, reason: '성장 티어 — 상위 레어리티 발급됨', actual: badge.rarity, required: winner.rarity })
    }
  }

  // ── 2단계: 진행 트랙별 최고값 1개만 남기기 ───────────────────────────
  const trackWinners = new Map<string, Candidate>()
  const standalones: Candidate[] = []

  for (const c of candidates) {
    if (c.progressionKey === null) {
      standalones.push(c)
    } else {
      const existing = trackWinners.get(c.progressionKey)
      if (!existing || c.progressionValue > existing.progressionValue) {
        trackWinners.set(c.progressionKey, c)
      }
    }
  }

  const toIssueList = [...trackWinners.values(), ...standalones]

  // ── 2.5단계: 배지 홍수 방지 (30일 내 activity_type당 최대 3개) ──────────
  const MAX_PER_ACTIVITY_30D = 3
  const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const recentByActivity = new Map<string, number>()
  for (const owned of ownedBadges ?? []) {
    if ((owned.earned_at ?? '') >= cutoff30d) {
      const badge = allBadges.find((b) => b.id === owned.badge_id)
      const actType = (badge?.condition_json as BadgeCondition | null)?.activity_type ?? 'all'
      recentByActivity.set(actType, (recentByActivity.get(actType) ?? 0) + 1)
    }
  }

  const RARITY_PRIORITY: Record<string, number> = { mythic: 4, legendary: 3, rare: 2, common: 1 }
  toIssueList.sort(
    (a, b) =>
      (RARITY_PRIORITY[b.badge.rarity.toLowerCase()] ?? 0) -
      (RARITY_PRIORITY[a.badge.rarity.toLowerCase()] ?? 0)
  )

  const finalIssueList: typeof toIssueList = []
  for (const c of toIssueList) {
    const actType = (c.condition.activity_type ?? 'all') as string
    const recentCount = recentByActivity.get(actType) ?? 0
    const pendingCount = finalIssueList.filter((x) => (x.condition.activity_type ?? 'all') === actType).length
    if (recentCount + pendingCount < MAX_PER_ACTIVITY_30D) {
      finalIssueList.push(c)
    } else {
      missed.push({
        id: c.badge.id,
        name: c.badge.name,
        reason: `배지 홍수 방지 (${actType}: 30일 내 ${MAX_PER_ACTIVITY_30D}개 상한)`,
        actual: String(recentCount + pendingCount),
        required: String(MAX_PER_ACTIVITY_30D),
      })
    }
  }

  const earned: BadgeEarnedInfo[] = []

  // ── 3단계: 발급 (dryRun=false일 때만) ───────────────────────────────
  for (const { badge: toIssue, condition } of finalIssueList) {
    earned.push({ id: toIssue.id, name: toIssue.name, rarity: toIssue.rarity, reason: '조건 충족' })

    if (!dryRun) {
      const triggerActivity = condition.activity_type
        ? activities.find((a) => a.jamActivityType === condition.activity_type)
        : activities[0]

      const { error: insertError } = await supabase
        .from('user_activity_badges')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          user_id: userId,
          badge_id: toIssue.id,
          triggered_by: triggeredBy,
          triggered_by_strava_id: triggerActivity?.stravaId ?? null,
          triggered_by_activity_name: triggerActivity?.name ?? null,
          triggered_by_distance_km: triggerActivity?.distanceKm ?? null,
          triggered_by_activity_date: triggerActivity?.startDate ?? null,
        } as any)

      if (insertError) {
        if (insertError.code === '23505') continue
        console.error(`[evaluateBadgesDetailed] 배지 발급 오류 (badge_id: ${toIssue.id}):`, insertError)
        continue
      }

      console.info(`[evaluateBadgesDetailed] 배지 발급 — userId: ${userId}, badge: ${toIssue.name} (${toIssue.rarity}), by: ${triggeredBy}`)

      if (!silent) {
        await recordFeedEvent(userId, 'badge_earned', {
          badge_id: toIssue.id,
          badge_name: toIssue.name,
          badge_image_url: toIssue.image_url ?? '',
          rarity: toIssue.rarity,
        })
      }
    }
  }

  return { earned, missed }
}

// backward-compat wrapper (Strava 동기화에서 사용)
export async function evaluateBadges(
  userId: string,
  activities: NormalizedActivity[]
): Promise<number> {
  const { earned } = await evaluateBadgesDetailed(userId, activities, {
    dryRun: false,
    triggeredBy: 'strava_sync',
    silent: false,
  })
  return earned.length
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────────

function getMondayKey(date: Date): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d.toISOString().slice(0, 10)
}

function calcMaxStreak(activities: NormalizedActivity[]): number {
  if (activities.length === 0) return 0
  const dates = activities.map((a) => new Date(a.startDate).toISOString().slice(0, 10)).sort()
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

// ── 진행 트랙 키 추출 ────────────────────────────────────────────────────
const PROGRESSION_MODIFIERS = [
  'elevation_gain_m', 'min_speed_kmh', 'streak_days', 'duration_minutes',
  'weekend_duration_hours', 'monthly_km', 'weekly_count', 'season_count',
  'month', 'season', 'temperature_min_c', 'temperature_max_c', 'poi_id',
] as const

function getProgressionKey(condition: BadgeCondition): { key: string; value: number } | null {
  const hasModifier = PROGRESSION_MODIFIERS.some(
    (m) => (condition as Record<string, unknown>)[m] !== undefined
  )
  if (hasModifier) return null

  const actType = condition.activity_type ?? 'all'
  if (condition.distance_km !== undefined) {
    return { key: `${actType}:distance_km`, value: condition.distance_km }
  }
  if (condition.total_count !== undefined) {
    return { key: `${actType}:total_count`, value: condition.total_count }
  }
  return null
}
