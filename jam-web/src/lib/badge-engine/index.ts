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
import { awardPoints } from '@/lib/points'
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeCondition, BadgeConditionSnapshot, BadgeRow, UserActivityBadgeRow } from '@/types/database'

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

  // 통과한 필드의 실측값도 남겨서(어드민이 나중에 "왜 발급됐는지" 확인 가능하도록) 누적한다
  const actualParts: string[] = []
  const requiredParts: string[] = []

  if (condition.distance_km !== undefined) {
    const totalKm = Math.round(filtered.reduce((sum, a) => sum + a.distanceKm, 0) * 10) / 10
    if (totalKm < condition.distance_km) {
      return { pass: false, reason: '거리 부족', actual: `${totalKm}km`, required: `${condition.distance_km}km` }
    }
    actualParts.push(`거리: ${totalKm}km`)
    requiredParts.push(`거리: ${condition.distance_km}km`)
  }

  if (condition.total_count !== undefined) {
    if (filtered.length < condition.total_count) {
      return { pass: false, reason: '활동 횟수 부족', actual: `${filtered.length}회`, required: `${condition.total_count}회` }
    }
    actualParts.push(`횟수: ${filtered.length}회`)
    requiredParts.push(`횟수: ${condition.total_count}회`)
  }

  if (condition.elevation_gain_m !== undefined) {
    const totalElev = Math.round(filtered.reduce((sum, a) => sum + a.elevationGainM, 0))
    if (totalElev < condition.elevation_gain_m) {
      return { pass: false, reason: '고도 상승 부족', actual: `${totalElev}m`, required: `${condition.elevation_gain_m}m` }
    }
    actualParts.push(`고도: ${totalElev}m`)
    requiredParts.push(`고도: ${condition.elevation_gain_m}m`)
  }

  if (condition.min_speed_kmh !== undefined) {
    const maxSpeed = Math.max(...filtered.map((a) => a.averageSpeedKmh), 0)
    if (maxSpeed < condition.min_speed_kmh) {
      return { pass: false, reason: '속도 부족', actual: `${maxSpeed}km/h`, required: `${condition.min_speed_kmh}km/h` }
    }
    actualParts.push(`속도: ${maxSpeed}km/h`)
    requiredParts.push(`속도: ${condition.min_speed_kmh}km/h`)
  }

  if (condition.streak_days !== undefined) {
    const streak = calcMaxStreak(filtered)
    if (streak < condition.streak_days) {
      return { pass: false, reason: '연속 일수 부족', actual: `${streak}일`, required: `${condition.streak_days}일` }
    }
    actualParts.push(`연속일수: ${streak}일`)
    requiredParts.push(`연속일수: ${condition.streak_days}일`)
  }

  if (condition.duration_minutes !== undefined) {
    const best = Math.max(...filtered.map((a) => a.movingTimeSec / 60), 0)
    if (best < condition.duration_minutes) {
      return { pass: false, reason: '이동 시간 부족', actual: `${Math.round(best)}분`, required: `${condition.duration_minutes}분` }
    }
    actualParts.push(`이동시간: ${Math.round(best)}분`)
    requiredParts.push(`이동시간: ${condition.duration_minutes}분`)
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
    actualParts.push(`주말활동시간: ${best.toFixed(1)}시간`)
    requiredParts.push(`주말활동시간: ${condition.weekend_duration_hours}시간`)
  }

  if (condition.weekly_count !== undefined) {
    // time_range와 함께 쓰이면 해당 시간대 활동만 주간 집계 ("새벽 주 N회" 엄격 의미)
    let weeklyPool = filtered
    if (condition.time_range) {
      const { start, end } = condition.time_range
      const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
      const startMin = toMin(start)
      const endMin = toMin(end)
      const cross = startMin > endMin
      weeklyPool = filtered.filter((a) => {
        const t = toMin((a.startDateLocal ?? a.startDate).slice(11, 16))
        return cross ? t >= startMin || t <= endMin : t >= startMin && t <= endMin
      })
    }
    const weekCounts = new Map<string, number>()
    for (const a of weeklyPool) {
      const key = getMondayKey(new Date(a.startDate))
      weekCounts.set(key, (weekCounts.get(key) ?? 0) + 1)
    }
    const maxWeek = weekCounts.size > 0 ? Math.max(...weekCounts.values()) : 0
    if (maxWeek < condition.weekly_count) {
      return { pass: false, reason: '주간 활동 횟수 부족', actual: `${maxWeek}회`, required: `${condition.weekly_count}회` }
    }
    actualParts.push(`주간횟수: ${maxWeek}회`)
    requiredParts.push(`주간횟수: ${condition.weekly_count}회`)
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
      actualParts.push(`월누적거리: ${Math.round(maxKm * 10) / 10}km`)
      requiredParts.push(`월누적거리: ${condition.monthly_km}km`)
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
    actualParts.push(`계절활동: ${seasonFiltered.length}회`)
    requiredParts.push(`계절활동: ${condition.season_count}회`)
  }

  if (condition.temperature_min_c !== undefined) {
    const temps = filtered.map((a) => a.weatherTempC).filter((t): t is number => t != null)
    if (temps.length === 0) {
      return { pass: false, reason: '날씨 데이터 없음 (Strava 미제공)', actual: '-', required: `≥${condition.temperature_min_c}°C` }
    }
    const maxTemp = Math.max(...temps)
    if (maxTemp < condition.temperature_min_c) {
      return { pass: false, reason: '기온 부족 (폭염 조건 미달)', actual: `${maxTemp}°C`, required: `≥${condition.temperature_min_c}°C` }
    }
    actualParts.push(`최고기온: ${maxTemp}°C`)
    requiredParts.push(`최고기온: ≥${condition.temperature_min_c}°C`)
  }

  if (condition.temperature_max_c !== undefined) {
    const temps = filtered.map((a) => a.weatherTempC).filter((t): t is number => t != null)
    if (temps.length === 0) {
      return { pass: false, reason: '날씨 데이터 없음 (Strava 미제공)', actual: '-', required: `≤${condition.temperature_max_c}°C` }
    }
    const minTemp = Math.min(...temps)
    if (minTemp > condition.temperature_max_c) {
      return { pass: false, reason: '기온 초과 (한파 조건 미달)', actual: `${minTemp}°C`, required: `≤${condition.temperature_max_c}°C` }
    }
    actualParts.push(`최저기온: ${minTemp}°C`)
    requiredParts.push(`최저기온: ≤${condition.temperature_max_c}°C`)
  }

  if (condition.time_range !== undefined && condition.weekly_count === undefined) {
    // weekly_count와 함께 쓰이는 경우 weekly_count 블록에서 통합 처리됨.
    // 단독으로만 쓰일 때: 이력 전반에서 해당 시간대 활동이 1건이라도 있으면 통과.
    const { start, end } = condition.time_range
    const toMinutes = (hhmm: string): number => {
      const [h, m] = hhmm.split(':').map(Number)
      return h * 60 + m
    }
    const startMin = toMinutes(start)
    const endMin = toMinutes(end)
    const crossesMidnight = startMin > endMin

    const matchedActivity = filtered.find((a) => {
      const local = a.startDateLocal ?? a.startDate
      const timePart = local.slice(11, 16) // "HH:MM"
      const actMin = toMinutes(timePart)
      return crossesMidnight
        ? actMin >= startMin || actMin <= endMin
        : actMin >= startMin && actMin <= endMin
    })

    if (!matchedActivity) {
      return { pass: false, reason: '활동 시간대 불일치', actual: '-', required: `${start}~${end}` }
    }
    const matchedTime = (matchedActivity.startDateLocal ?? matchedActivity.startDate).slice(11, 16)
    actualParts.push(`활동시각: ${matchedTime}`)
    requiredParts.push(`시간대: ${start}~${end}`)
  }

  if (condition.poi_id !== undefined) {
    // POI 배지는 sync.ts의 GPS 경로 매칭(matchPoisForActivity)으로 별도 발급됨.
    // condition_json의 poi_id 경로는 현재 미지원 — 항상 false.
    return { pass: false, reason: 'POI 조건은 GPS 경로 매칭으로만 발급됩니다', actual: '-', required: `poi: ${condition.poi_id}` }
  }

  return {
    pass: true,
    reason: '조건 충족',
    actual: actualParts.join(', '),
    required: requiredParts.join(', '),
  }
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
    /** 시뮬레이터 전용: true이면 첫 싱크 게이트를 강제 적용하되 initial_sync_done은 갱신하지 않음 */
    overrideFirstSync?: boolean
  }
): Promise<{ earned: BadgeEarnedInfo[]; missed: BadgeMissedInfo[] }> {
  const { dryRun = false, triggeredBy = 'strava_sync', silent = false, overrideFirstSync } = options ?? {}

  const supabase = createServiceClient()

  // initial_sync_done 조회 — 첫 싱크 게이트 판단용
  const { data: userRowRaw } = await supabase
    .from('users')
    .select('initial_sync_done')
    .eq('id', userId)
    .maybeSingle()
  const userInitialSyncDone = (userRowRaw as { initial_sync_done: boolean } | null)?.initial_sync_done ?? false
  const isFirstSync = overrideFirstSync ?? !userInitialSyncDone

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

  // 선행 배지 체크용 — 보유 배지의 이름 집합
  const ownedBadgeNames = new Set<string>()
  for (const b of allBadges) {
    if (ownedBadgeIds.has(b.id)) ownedBadgeNames.add(b.name)
  }

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
    evalResult: EvalConditionResult
  }
  const candidates: Candidate[] = []
  const missed: BadgeMissedInfo[] = []

  for (const [, group] of badgesByName) {
    const highestOwned = highestOwnedTierByName.get(group[0].name) ?? 0

    const eligible: { badge: BadgeRow; evalResult: EvalConditionResult }[] = []
    for (const badge of group) {
      if (ownedBadgeIds.has(badge.id)) continue
      if ((RARITY_TIER[badge.rarity] ?? 0) <= highestOwned) continue

      // 선행 배지 게이트: prerequisite_badge_names 중 하나라도 보유해야 통과
      const prereqs = (badge.condition_json as BadgeCondition | null)?.prerequisite_badge_names
      if (prereqs && prereqs.length > 0) {
        if (!prereqs.some((n) => ownedBadgeNames.has(n))) {
          missed.push({ id: badge.id, name: badge.name, reason: '선행 배지 미보유', actual: '없음', required: prereqs.join(' 또는 ') })
          continue
        }
      }

      const evalResult = evaluateConditionDetailed(badge.condition_json as BadgeCondition ?? {}, activities)
      if (evalResult.pass) {
        eligible.push({ badge, evalResult })
      } else {
        missed.push({ id: badge.id, name: badge.name, reason: evalResult.reason, actual: evalResult.actual, required: evalResult.required })
      }
    }

    if (eligible.length === 0) continue

    eligible.sort((a, b) => (RARITY_TIER[b.badge.rarity] ?? 0) - (RARITY_TIER[a.badge.rarity] ?? 0))
    const { badge: winner, evalResult } = eligible[0]
    const condition = winner.condition_json as BadgeCondition
    const prog = getProgressionKey(condition)
    candidates.push({ badge: winner, condition, progressionKey: prog?.key ?? null, progressionValue: prog?.value ?? 0, evalResult })

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

  // ── 2.8단계: 첫 싱크 게이트 — initial_sync_done=false이면 Common만 발급 ──
  const gatedIssueList: typeof finalIssueList = []
  for (const c of finalIssueList) {
    if (isFirstSync && c.badge.rarity !== 'common') {
      missed.push({
        id: c.badge.id,
        name: c.badge.name,
        reason: '첫 싱크 게이트 — Common 등급만 발급',
        actual: c.badge.rarity,
        required: 'common',
      })
    } else {
      gatedIssueList.push(c)
    }
  }

  const earned: BadgeEarnedInfo[] = []

  // ── 3단계: 발급 (dryRun=false일 때만) ───────────────────────────────
  for (const { badge: toIssue, condition, evalResult } of gatedIssueList) {
    earned.push({ id: toIssue.id, name: toIssue.name, rarity: toIssue.rarity, reason: '조건 충족' })

    if (!dryRun) {
      const triggerActivity = condition.activity_type
        ? activities.find((a) => a.jamActivityType === condition.activity_type)
        : activities[0]

      // 어드민 전용 — 발급 근거(조건/실측값/트리거 활동) 스냅샷. 일반 유저 화면에는 노출 안 함
      const conditionSnapshot: BadgeConditionSnapshot = {
        condition,
        actual: evalResult.actual,
        required: evalResult.required,
        reason: evalResult.reason,
        trigger_activity: triggerActivity
          ? {
              stravaId: triggerActivity.stravaId,
              name: triggerActivity.name,
              activityType: triggerActivity.jamActivityType,
              distanceKm: triggerActivity.distanceKm,
              movingTimeSec: triggerActivity.movingTimeSec,
              elevationGainM: triggerActivity.elevationGainM,
              averageSpeedKmh: triggerActivity.averageSpeedKmh,
              startDate: triggerActivity.startDate,
            }
          : null,
      }

      const { error: insertError } = await supabase
        .from('user_activity_badges')
        .insert({
          user_id: userId,
          badge_id: toIssue.id,
          triggered_by: triggeredBy,
          triggered_by_strava_id: triggerActivity?.stravaId ?? null,
          triggered_by_activity_name: triggerActivity?.name ?? null,
          triggered_by_distance_km: triggerActivity?.distanceKm ?? null,
          triggered_by_activity_date: triggerActivity?.startDate ?? null,
          condition_snapshot: conditionSnapshot,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)

      if (insertError) {
        if (insertError.code === '23505') continue
        console.error(`[evaluateBadgesDetailed] 배지 발급 오류 (badge_id: ${toIssue.id}):`, insertError)
        continue
      }

      console.info(`[evaluateBadgesDetailed] 배지 발급 — userId: ${userId}, badge: ${toIssue.name} (${toIssue.rarity}), by: ${triggeredBy}`)

      // 잼 포인트 지급 — 배지에 point_reward가 붙어 있으면 발급 직후 1회 지급.
      // (배지 발급 성공을 전제로 지급. 0이면 awardPoints가 스킵.)
      const pointReward = toIssue.point_reward ?? 0
      if (pointReward > 0) {
        await awardPoints(userId, pointReward, 'badge_point_reward', { sourceBadgeId: toIssue.id })
      }

      if (!silent) {
        await recordFeedEvent(userId, 'badge_earned', {
          badge_id: toIssue.id,
          badge_name: toIssue.name,
          badge_image_url: toIssue.image_url ?? '',
          rarity: toIssue.rarity,
          ...(pointReward > 0 ? { point_reward: pointReward } : {}),
        })
      }
    }
  }

  // 첫 싱크 완료 플래그 세팅 (dryRun·시뮬레이터 모드에서는 갱신 안 함)
  if (!dryRun && !overrideFirstSync && !userInitialSyncDone) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('users') as any).update({ initial_sync_done: true }).eq('id', userId)
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
  'month', 'season', 'temperature_min_c', 'temperature_max_c', 'poi_id', 'time_range',
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
