import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { matchPoisForActivity } from '@/lib/poi/matcher'
import { evaluateBadgesDetailed } from '@/lib/badge-engine'
import type { InventoryRow } from '@/types/database'
import type { Database } from '@/types/database.generated'

/**
 * `inventory_items.serial_number`는 NOT NULL인데 DEFAULT가 없어(migrations/034) 생성 타입이
 * Insert 필수 컬럼으로 잡지만, 실제 값은 BEFORE INSERT 트리거 `assign_random_serial()`
 * (migrations/108)이 채운다. 이 한 컬럼만 `Omit`으로 떼어내고 나머지 컬럼은 이름·타입 검사를
 * 그대로 받게 둔다 — 억제(`@ts-expect-error`)로 덮으면 컬럼명 오타까지 같이 통과한다
 * (티켓 20260831_1213).
 */
type InventoryItemInsert = Database['public']['Tables']['inventory_items']['Insert']
type InventoryItemInsertByTrigger = Omit<InventoryItemInsert, 'serial_number'>

import type { NormalizedActivity } from '@/types/strava'

// rarity 드랍 확률 (drop-engine과 동일)
const RARITY_THRESHOLDS = [
  { rarity: 'common' as const, threshold: 0.40 },
  { rarity: 'rare' as const, threshold: 0.65 },
  { rarity: 'epic' as const, threshold: 0.75 },
  { rarity: 'mystic' as const, threshold: 0.80 },
]

function rollRarity(): 'common' | 'rare' | 'epic' | 'mystic' | null {
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

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { userId, dryRun, activity, repeatCount = 1, firstSync = false } = body

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

  // 1. 배지 평가 — badge-engine을 그대로 사용 (진행 트랙 dedup 포함)
  //    dryRun=true이면 평가만 수행, false이면 DB에도 저장됨
  //    silent=true: 시뮬레이션 결과는 피드에 기록하지 않음
  const { earned: badgesEarned, missed: badgesMissed } = await evaluateBadgesDetailed(
    userId,
    activities,
    { dryRun, triggeredBy: 'admin_simulate', silent: true, overrideFirstSync: firstSync || undefined }
  )

  // 2. 기존 보유 배지 조회 — POI 배지 중복 발급 방지에 사용
  const { data: ownedBadgesRaw } = await supabase
    .from('user_activity_badges')
    .select('badge_id')
    .eq('user_id', userId)

  const ownedBadgeIds = new Set((ownedBadgesRaw ?? []).map((b: { badge_id: string }) => b.badge_id))
  const earnedBadgeIds = new Set([...ownedBadgeIds, ...badgesEarned.map((b) => b.id)])

  // 3. POI 매칭
  const route: Array<[number, number]> = activity.route ?? []
  const matchedPois = route.length > 0 ? await matchPoisForActivity(route, supabase) : []
  const poisMatched = matchedPois.map((p) => ({ id: p.id, name: p.name }))

  const poiBadgeIds = matchedPois.map((p) => p.linked_badge_id).filter(Boolean) as string[]
  const { data: poiBadgesRaw } = poiBadgeIds.length > 0
    ? await supabase.from('badges').select('id, name, rarity').in('id', poiBadgeIds).is('deleted_at', null)
    : { data: [] as { id: string; name: string; rarity: string }[] }
  const poiBadgesById = new Map((poiBadgesRaw ?? []).map((b) => [b.id, b]))

  for (const poi of matchedPois) {
    if (!poi.linked_badge_id) continue
    if (earnedBadgeIds.has(poi.linked_badge_id)) continue
    const badge = poiBadgesById.get(poi.linked_badge_id)
    if (badge) {
      badgesEarned.push({ id: badge.id, name: badge.name, rarity: badge.rarity, reason: `POI 통과: ${poi.name}` })
      earnedBadgeIds.add(badge.id)
      if (!dryRun) {
        const userActivityBadgesQuery = supabase.from('user_activity_badges')
        await userActivityBadgesQuery.insert({ user_id: userId, badge_id: badge.id, triggered_by: 'admin_simulate' })
      }
    }
  }

  // 4. 아이템 드랍 시뮬레이션 (첫 번째 활동 기준으로 한 번 롤)
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
      .is('deleted_at', null)

    const candidates = (candidatesRaw ?? []) as { id: string; name: string; drop_weight: number }[]
    if (candidates.length > 0) {
      const picked = weightedPick(candidates)
      itemDrop = { badgeName: picked.name, rarity }

      if (!dryRun && inventory) {
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        const inventoryItemsQuery = supabase.from('inventory_items')
        const insertQuery = inventoryItemsQuery.insert({
          inventory_id: inventory.id,
          badge_id: picked.id,
          obtained_by: 'drop',
          expires_at: expiresAt,
        } satisfies InventoryItemInsertByTrigger as InventoryItemInsert)
        const { data: insertedItem } = await insertQuery.select('id').single()

        if (insertedItem) {
          droppedInventoryItemId = (insertedItem as { id: string }).id
          await supabase
            .from('inventory')
            .update({ used_slots: inventory.used_slots + 1 })
            .eq('id', inventory.id)
        }
      }
    }
  }

  // Phase 8: 아이템북 완성은 유저가 직접 슬롯을 채우는 방식으로 변경됨.
  // 시뮬레이션으로는 슬롯 액션을 재현할 수 없으므로 완성 체크는 생략.
  const itemBooksCompleted: { bookName: string; rewardBadgeName: string | null }[] = []

  void droppedInventoryItemId

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
