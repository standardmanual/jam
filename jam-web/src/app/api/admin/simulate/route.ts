import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { matchPoisForActivity } from '@/lib/poi/matcher'
import type { BadgeRow, BadgeCondition, ActivityType, InventoryRow } from '@/types/database'
import type { NormalizedActivity } from '@/types/strava'

// rarity 드랍 확률 (drop-engine과 동일)
const RARITY_THRESHOLDS = [
  { rarity: 'common' as const, threshold: 0.40 },
  { rarity: 'rare' as const, threshold: 0.65 },
  { rarity: 'legendary' as const, threshold: 0.75 },
  { rarity: 'mythic' as const, threshold: 0.80 },
]

function rollRarity(): 'common' | 'rare' | 'legendary' | 'mythic' | null {
  const roll = Math.random()
  for (const { rarity, threshold } of RARITY_THRESHOLDS) {
    if (roll < threshold) return rarity
  }
  return null
}

function weightedPick<T extends { drop_weight: number }>(items: T[]): T {
  const total = items.reduce((sum, item) => sum + item.drop_weight, 0)
  let rand = Math.random() * total
  for (const item of items) {
    rand -= item.drop_weight
    if (rand <= 0) return item
  }
  return items[items.length - 1]
}

const RARITY_TIER: Record<string, number> = { common: 1, rare: 2, legendary: 3, mythic: 4 }

function getMondayKey(date: Date): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d.toISOString().slice(0, 10)
}

// 조건 평가 — 충족 여부 + 실패 이유 반환
function evaluateConditionDetailed(
  condition: BadgeCondition,
  activities: NormalizedActivity[]
): { pass: boolean; reason: string; actual: string; required: string } {
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
      spring: [3, 4, 5],
      summer: [6, 7, 8],
      fall:   [9, 10, 11],
      winter: [12, 1, 2],
    }
    const seasonFiltered = condition.season === 'all'
      ? filtered
      : filtered.filter((a) => {
          const m = new Date(a.startDate).getMonth() + 1
          return (SEASON_MONTHS[condition.season!] ?? []).includes(m)
        })
    if (seasonFiltered.length < condition.season_count) {
      const seasonLabel = condition.season === 'all' ? '전체' : ({ spring: '봄', summer: '여름', fall: '가을', winter: '겨울' }[condition.season] ?? condition.season)
      return { pass: false, reason: `${seasonLabel} 활동 횟수 부족`, actual: `${seasonFiltered.length}회`, required: `${condition.season_count}회` }
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

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { userId, dryRun, activity, repeatCount = 1 } = body

  if (!userId || !activity) {
    return NextResponse.json({ error: '필수 파라미터가 누락되었습니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 시뮬레이션 활동 배열 구성 (repeatCount만큼 연속 날짜에 생성)
  const baseDate = new Date(activity.startDate)
  const activities: NormalizedActivity[] = Array.from({ length: repeatCount }, (_, i) => {
    const date = new Date(baseDate)
    date.setDate(date.getDate() - (repeatCount - 1 - i))
    return {
      stravaId: -(i + 1),
      name: `시뮬레이션 활동 #${i + 1}`,
      distanceKm: activity.distanceKm,
      movingTimeSec: activity.movingTimeSec,
      elevationGainM: activity.elevationGainM,
      jamActivityType: activity.activityType,
      startDate: date.toISOString(),
      averageSpeedKmh: activity.averageSpeedKmh,
      startLatLng: activity.route?.[0] ?? null,
      endLatLng: activity.route?.[activity.route.length - 1] ?? null,
    }
  })

  // 1. 유저의 기존 보유 배지 조회
  const { data: ownedBadgesRaw } = await supabase
    .from('user_activity_badges')
    .select('badge_id')
    .eq('user_id', userId)

  const ownedBadgeIds = new Set((ownedBadgesRaw ?? []).map((b: { badge_id: string }) => b.badge_id))

  // 2. 전체 activity 배지 조회
  const { data: allBadgesRaw } = await supabase.from('badges').select('*').eq('type', 'activity')
  const allBadges = (allBadgesRaw ?? []) as BadgeRow[]

  // 3. 배지 조건 평가 — 성장 티어: 이름당 최상위 레어리티 1개만
  const badgesEarned: { id: string; name: string; rarity: string; reason: string }[] = []
  const badgesMissed: { id: string; name: string; reason: string; actual: string; required: string }[] = []
  const earnedBadgeIds = new Set(ownedBadgeIds)

  // 보유 배지 기준 이름별 최상위 티어
  const highestOwnedTierByName = new Map<string, number>()
  for (const badge of allBadges) {
    if (ownedBadgeIds.has(badge.id)) {
      const tier = RARITY_TIER[badge.rarity] ?? 0
      const cur = highestOwnedTierByName.get(badge.name) ?? 0
      if (tier > cur) highestOwnedTierByName.set(badge.name, tier)
    }
  }

  // 이름별 그룹핑
  const badgesByName = new Map<string, BadgeRow[]>()
  for (const badge of allBadges) {
    if (!badgesByName.has(badge.name)) badgesByName.set(badge.name, [])
    badgesByName.get(badge.name)!.push(badge)
  }

  // ── 1단계: 이름별 후보 선정 (이름당 최상위 티어 1개) ──────────────────
  type SimCandidate = {
    badge: BadgeRow
    condition: BadgeCondition
    progressionKey: string | null
    progressionValue: number
  }
  const simCandidates: SimCandidate[] = []

  for (const [, group] of badgesByName) {
    const highestOwned = highestOwnedTierByName.get(group[0].name) ?? 0

    const eligible: { badge: BadgeRow; result: ReturnType<typeof evaluateConditionDetailed> }[] = []
    for (const badge of group) {
      if (ownedBadgeIds.has(badge.id)) continue
      if ((RARITY_TIER[badge.rarity] ?? 0) <= highestOwned) continue
      if (!badge.condition_json) continue
      const result = evaluateConditionDetailed(badge.condition_json as BadgeCondition, activities)
      if (result.pass) {
        eligible.push({ badge, result })
      } else {
        badgesMissed.push({ id: badge.id, name: badge.name, reason: result.reason, actual: result.actual, required: result.required })
      }
    }

    if (eligible.length === 0) continue

    eligible.sort((a, b) => (RARITY_TIER[b.badge.rarity] ?? 0) - (RARITY_TIER[a.badge.rarity] ?? 0))
    const { badge: toEarn } = eligible[0]
    const condition = toEarn.condition_json as BadgeCondition
    const prog = simGetProgressionKey(condition)
    simCandidates.push({ badge: toEarn, condition, progressionKey: prog?.key ?? null, progressionValue: prog?.value ?? 0 })

    for (const { badge } of eligible.slice(1)) {
      badgesMissed.push({ id: badge.id, name: badge.name, reason: '성장 티어 — 상위 레어리티 발급됨', actual: badge.rarity, required: toEarn.rarity })
    }
  }

  // ── 2단계: 진행 트랙별 최고값 1개만 남기기 ───────────────────────────
  const trackWinners = new Map<string, SimCandidate>()
  const standalones: SimCandidate[] = []

  for (const c of simCandidates) {
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

  for (const { badge: toEarn } of toIssueList) {
    badgesEarned.push({ id: toEarn.id, name: toEarn.name, rarity: toEarn.rarity, reason: '조건 충족' })
    earnedBadgeIds.add(toEarn.id)
  }

  // 4. POI 매칭
  const route: Array<[number, number]> = activity.route ?? []
  const matchedPois = route.length > 0 ? await matchPoisForActivity(route, supabase) : []
  const poisMatched = matchedPois.map((p) => ({ id: p.id, name: p.name }))

  for (const poi of matchedPois) {
    if (!poi.linked_badge_id) continue
    if (earnedBadgeIds.has(poi.linked_badge_id)) continue
    const badge = allBadges.find((b) => b.id === poi.linked_badge_id)
    if (badge) {
      badgesEarned.push({ id: badge.id, name: badge.name, rarity: badge.rarity, reason: `POI 통과: ${poi.name}` })
      earnedBadgeIds.add(badge.id)
    }
  }

  // 5. 아이템 드랍 시뮬레이션 (첫 번째 활동 기준으로 한 번 롤)
  let itemDrop: { badgeName: string; rarity: string } | null = null
  let droppedInventoryItemId: string | null = null

  const { data: inventoryRaw } = await supabase
    .from('inventory')
    .select('id, used_slots, max_slots')
    .eq('user_id', userId)
    .single()

  const inventory = inventoryRaw as Pick<InventoryRow, 'id' | 'used_slots' | 'max_slots'> | null

  const rarity = rollRarity()
  if (rarity && inventory && inventory.used_slots < inventory.max_slots) {
    const { data: candidatesRaw } = await supabase
      .from('badges')
      .select('id, name, drop_weight')
      .eq('type', 'item')
      .eq('rarity', rarity)

    const candidates = (candidatesRaw ?? []) as { id: string; name: string; drop_weight: number }[]
    if (candidates.length > 0) {
      const picked = weightedPick(candidates)
      itemDrop = { badgeName: picked.name, rarity }

      if (!dryRun && inventory) {
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: insertedItem } = await (supabase.from('inventory_items') as any)
          .insert({ inventory_id: inventory.id, badge_id: picked.id, obtained_by: 'drop', expires_at: expiresAt })
          .select('id')
          .single()

        if (insertedItem) {
          droppedInventoryItemId = (insertedItem as { id: string }).id
          await supabase
            .from('inventory')
            // @ts-expect-error used_slots update
            .update({ used_slots: inventory.used_slots + 1 })
            .eq('id', inventory.id)
        }
      }
    }
  }

  // Phase 8: 아이템북 완성은 유저가 직접 슬롯을 채우는 방식으로 변경됨.
  // 시뮬레이션으로는 슬롯 액션을 재현할 수 없으므로 완성 체크는 생략.
  const itemBooksCompleted: { bookName: string; rewardBadgeName: string | null }[] = []

  // 6. Apply 모드: 배지 실제 발급
  if (!dryRun) {
    for (const earned of badgesEarned) {
      if (ownedBadgeIds.has(earned.id)) continue
      await supabase
        .from('user_activity_badges')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({ user_id: userId, badge_id: earned.id, triggered_by: 'admin_simulate' } as any)
        .select()
    }
  }

  return NextResponse.json({
    parsed: {
      distanceKm: activity.distanceKm,
      durationMin: Math.round(activity.movingTimeSec / 60),
      elevationGainM: activity.elevationGainM,
      averageSpeedKmh: activity.averageSpeedKmh,
      trackpointCount: route.length,
    },
    badgesEarned,
    badgesMissed,
    poisMatched,
    itemDrop,
    itemBooksCompleted,
    applied: !dryRun,
  })
}

// ── 진행 트랙 키 추출 (badge-engine/index.ts의 getProgressionKey와 동일 로직) ──
const SIM_PROGRESSION_MODIFIERS = [
  'elevation_gain_m', 'min_speed_kmh', 'streak_days', 'duration_minutes',
  'weekend_duration_hours', 'monthly_km', 'weekly_count', 'season_count',
  'month', 'season', 'temperature_min_c', 'temperature_max_c', 'poi_id',
] as const

function simGetProgressionKey(condition: BadgeCondition): { key: string; value: number } | null {
  const hasModifier = SIM_PROGRESSION_MODIFIERS.some(
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
