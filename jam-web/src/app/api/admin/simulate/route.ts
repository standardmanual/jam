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

  if (condition.poi_id !== undefined) {
    // POI 조건은 별도 경로 처리
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

  // 3. 배지 조건 평가
  const badgesEarned: { id: string; name: string; rarity: string; reason: string }[] = []
  const badgesMissed: { id: string; name: string; reason: string; actual: string; required: string }[] = []
  const earnedBadgeIds = new Set(ownedBadgeIds)

  for (const badge of allBadges) {
    if (ownedBadgeIds.has(badge.id)) continue
    if (!badge.condition_json) continue

    const result = evaluateConditionDetailed(badge.condition_json as BadgeCondition, activities)
    if (result.pass) {
      badgesEarned.push({ id: badge.id, name: badge.name, rarity: badge.rarity, reason: '조건 충족' })
      earnedBadgeIds.add(badge.id)
    } else {
      badgesMissed.push({ id: badge.id, name: badge.name, reason: result.reason, actual: result.actual, required: result.required })
    }
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
      .select('id, name')
      .eq('type', 'item')
      .eq('rarity', rarity)

    const candidates = (candidatesRaw ?? []) as { id: string; name: string }[]
    if (candidates.length > 0) {
      const picked = candidates[Math.floor(Math.random() * candidates.length)]
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

  // 6. 아이템북 완성 체크 (현재 보유 + 시뮬레이션 획득 배지 기준)
  const { data: itemBooksRaw } = await supabase.from('item_books').select('*')
  const itemBooksData = (itemBooksRaw ?? []) as Array<{
    id: string
    name: string
    required_activity_badge_id: string
    required_item_badge_ids: string[]
    reward_badge_id: string | null
  }>

  const { data: inventoryItemsRaw } = inventory
    ? await supabase.from('inventory_items').select('badge_id').eq('inventory_id', inventory.id)
    : { data: [] }

  const ownedItemBadgeIds = new Set((inventoryItemsRaw ?? []).map((i: { badge_id: string }) => i.badge_id))
  if (droppedInventoryItemId) {
    // 드랍된 아이템이 있으면 ID 추가 (위에서 picked를 알고 있으나 여기선 badge_id 필요)
    // 이미 inventory_items에 inserted되었으므로 DB re-query 없이 skip
  }

  const itemBooksCompleted: { bookName: string; rewardBadgeName: string | null }[] = []
  const rewardBadgeMap = new Map(allBadges.map((b) => [b.id, b.name]))

  for (const book of itemBooksData) {
    const hasActivityBadge = earnedBadgeIds.has(book.required_activity_badge_id)
    if (!hasActivityBadge) continue

    const requiredItemIds: string[] = Array.isArray(book.required_item_badge_ids)
      ? book.required_item_badge_ids
      : []

    const hasAllItems = requiredItemIds.every((id) => ownedItemBadgeIds.has(id))
    if (!hasAllItems) continue

    const rewardBadgeName = book.reward_badge_id ? (rewardBadgeMap.get(book.reward_badge_id) ?? null) : null
    itemBooksCompleted.push({ bookName: book.name, rewardBadgeName })

    // Apply 모드: 아이템북 완성 보상 배지 발급
    if (!dryRun && book.reward_badge_id) {
      const { data: existing } = await supabase
        .from('user_activity_badges')
        .select('id')
        .eq('user_id', userId)
        .eq('badge_id', book.reward_badge_id)
        .maybeSingle()

      if (!existing) {
        await supabase
          .from('user_activity_badges')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({ user_id: userId, badge_id: book.reward_badge_id, triggered_by: `itembook_complete:${book.id}` } as any)
      }
    }
  }

  // 7. Apply 모드: 배지 실제 발급
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
