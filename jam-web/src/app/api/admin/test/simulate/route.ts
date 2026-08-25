import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import { tryItemDrop } from '@/lib/drop-engine/index'
import type { ActivityType } from '@/types/database'

async function verifyAdmin(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_token')?.value
  return !!(token && token === process.env.ADMIN_SECRET)
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { userId, activityType, distanceKm } = await request.json()

  if (!userId || !activityType || distanceKm == null) {
    return NextResponse.json({ error: '필수 파라미터 누락' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 배지 조건 매칭: condition_json에 activity_type + min_distance_km이 있는 배지
  const { data: allBadges, error: badgesError } = await supabase
    .from('badges')
    .select('id, name, condition_json, activity_types')
    .eq('type', 'activity')
    .is('deleted_at', null)
    .overrideTypes<Array<{ id: string; name: string; condition_json: unknown; activity_types: string[] }>, { merge: false }>()

  if (badgesError) {
    return NextResponse.json({ error: '배지 조회 오류' }, { status: 500 })
  }

  // 조건 매칭
  const matchedBadges: Array<{ id: string; name: string }> = []

  for (const badge of allBadges ?? []) {
    const cond = badge.condition_json as {
      activity_type?: string
      min_distance_km?: number
      distance_km?: number
    } | null

    if (!cond) continue

    // activity_type 조건 확인
    if (cond.activity_type && cond.activity_type !== activityType) continue

    // 거리 조건 확인 (min_distance_km 또는 distance_km 필드 지원)
    const minDist = cond.min_distance_km ?? cond.distance_km
    if (minDist != null && distanceKm < minDist) continue

    // activity_types 배열 확인 (있는 경우)
    if (
      badge.activity_types &&
      (badge.activity_types as string[]).length > 0 &&
      !(badge.activity_types as string[]).includes(activityType)
    ) {
      continue
    }

    matchedBadges.push({ id: badge.id as string, name: badge.name as string })
  }

  // 이미 보유한 배지 제외 + 미보유 배지 INSERT
  const newBadges: Array<{ id: string; name: string }> = []

  for (const badge of matchedBadges) {
    const { data: existing } = await supabase
      .from('user_activity_badges')
      .select('id')
      .eq('user_id', userId)
      .eq('badge_id', badge.id)
      .maybeSingle()

    if (existing) continue

    const simulateBadgePayload = { user_id: userId, badge_id: badge.id, triggered_by: 'admin_test' }
    const activityBadgesTable = supabase.from('user_activity_badges')
    // @ts-expect-error Supabase insert() 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 UserActivityBadgeRow와 일치
    const { error: insertError } = await activityBadgesTable.insert(simulateBadgePayload)

    if (insertError) {
      if (insertError.code === '23505') continue // 중복 무시
      console.error('[simulate] 배지 발급 오류:', insertError)
      continue
    }

    newBadges.push(badge)
  }

  // 드랍 엔진 호출 — 반환 전에 드랍된 아이템 이름을 알기 위해 직접 조회
  // (tryItemDrop은 20260823_007부터 드랍된 badge_id[]를 반환하지만, 이 시뮬레이터는
  //  아이템 "이름"과 시리얼이 필요해 기존대로 호출 전후 inventory_items를 비교한다)
  const { data: inventoryBefore } = await supabase
    .from('inventory')
    .select('id, used_slots')
    .eq('user_id', userId)
    .maybeSingle()

  await tryItemDrop(userId, activityType)

  let droppedItemName: string | null = null

  if (inventoryBefore) {
    // 드랍 후 새로 추가된 inventory_items 확인
    const { data: newItem } = await supabase
      .from('inventory_items')
      .select('badge_id, obtained_at')
      // @ts-expect-error inventoryBefore.id — 이 파일 상단의 badges overrideTypes와 얽혀 이후 체인 전체가 never로 새는 TS 특이 케이스(개발용 시뮬레이터 엔드포인트라 as any 대신 정확히 이 지점만 억제)
      .eq('inventory_id', inventoryBefore.id)
      .eq('obtained_by', 'drop')
      .order('obtained_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (newItem) {
      const { data: badgeInfo } = await supabase
        .from('badges')
        .select('name')
        // @ts-expect-error 위와 동일한 TS 특이 케이스
        .eq('id', newItem.badge_id)
        .maybeSingle()

      // @ts-expect-error 위와 동일한 TS 특이 케이스
      droppedItemName = badgeInfo?.name ?? null
    }
  }

  return NextResponse.json({
    badges: newBadges,
    item: droppedItemName,
  })
}
