import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export interface HistoryEvent {
  type: 'obtained' | 'dropped' | 'picked_up'
  timestamp: string
  user_id: string
  username: string | null
  poi_name?: string
  obtained_by?: 'drop' | 'drop_event' | 'pickup' | 'system' | 'system_event'
}

const TIMESTAMP_TOLERANCE_SEC = 120

function timeDiffSec(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 1000
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()

  // 1. 현재 아이템 조회
  const { data: itemRaw } = await service
    .from('inventory_items')
    .select('id, badge_id, obtained_at, obtained_by, dropped_at, inventory_id')
    .eq('id', itemId)
    .single()

  if (!itemRaw) return NextResponse.json({ error: '아이템 없음' }, { status: 404 })

  const item = itemRaw as {
    id: string
    badge_id: string
    obtained_at: string
    obtained_by: string
    dropped_at: string | null
    inventory_id: string
  }

  // 소유 확인
  const { data: invCheck } = await service
    .from('inventory')
    .select('user_id')
    .eq('id', item.inventory_id)
    .single()

  if (!invCheck) return NextResponse.json({ error: '없음' }, { status: 404 })

  const ownerUserId = (invCheck as { user_id: string }).user_id
  if (ownerUserId !== user.id) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  // 2. 이 배지 타입의 모든 poi_drops 조회 (유저명 포함)
  const { data: allDropsRaw } = await service
    .from('poi_drops')
    .select(`
      id,
      dropper_user_id,
      poi_id,
      badge_id,
      dropped_at,
      picked_up_by,
      picked_up_at,
      is_available,
      poi:poi_id ( name )
    `)
    .eq('badge_id', item.badge_id)
    .order('dropped_at', { ascending: true })

  const allDrops = (allDropsRaw ?? []) as Array<{
    id: string
    dropper_user_id: string
    poi_id: string
    badge_id: string
    dropped_at: string
    picked_up_by: string | null
    picked_up_at: string | null
    is_available: boolean
    poi: { name: string } | null
  }>

  // 3. 이 배지 타입의 모든 inventory_items 조회 (최초 발급자 추적)
  const { data: allItemsRaw } = await service
    .from('inventory_items')
    .select('id, inventory_id, obtained_at, obtained_by, dropped_at')
    .eq('badge_id', item.badge_id)
    .order('obtained_at', { ascending: true })

  const allItems = (allItemsRaw ?? []) as Array<{
    id: string
    inventory_id: string
    obtained_at: string
    obtained_by: string
    dropped_at: string | null
  }>

  // inventory_id → user_id 매핑
  const inventoryIds = [...new Set(allItems.map((i) => i.inventory_id))]
  const { data: inventoriesRaw } = await service
    .from('inventory')
    .select('id, user_id')
    .in('id', inventoryIds)

  const invMap = new Map<string, string>()
  for (const inv of (inventoriesRaw ?? []) as Array<{ id: string; user_id: string }>) {
    invMap.set(inv.id, inv.user_id)
  }

  // 4. 관련 유저 ID 수집 및 username 일괄 조회
  const userIds = new Set<string>([ownerUserId])
  for (const d of allDrops) {
    userIds.add(d.dropper_user_id)
    if (d.picked_up_by) userIds.add(d.picked_up_by)
  }
  for (const it of allItems) {
    const uid = invMap.get(it.inventory_id)
    if (uid) userIds.add(uid)
  }

  const { data: usersRaw } = await service
    .from('users')
    .select('id, username')
    .in('id', [...userIds])

  const userMap = new Map<string, string | null>()
  for (const u of (usersRaw ?? []) as Array<{ id: string; username: string | null }>) {
    userMap.set(u.id, u.username)
  }

  // 5. 체인 추적: 현재 아이템에서 역방향으로 탐색
  const events: HistoryEvent[] = []
  const visited = new Set<string>()

  // 현재 보유자 획득 이벤트
  events.push({
    type: 'obtained',
    timestamp: item.obtained_at,
    user_id: ownerUserId,
    username: userMap.get(ownerUserId) ?? null,
    obtained_by: item.obtained_by as 'drop' | 'drop_event' | 'pickup' | 'system' | 'system_event',
  })

  // 체인 역추적
  let currentUserId = ownerUserId
  let currentObtainedAt = item.obtained_at
  let currentObtainedBy = item.obtained_by

  for (let depth = 0; depth < 20; depth++) {
    if (currentObtainedBy !== 'pickup') break

    // 현재 유저가 픽업한 poi_drop 찾기
    const matchingDrop = allDrops.find(
      (d) =>
        d.picked_up_by === currentUserId &&
        d.picked_up_at != null &&
        timeDiffSec(d.picked_up_at, currentObtainedAt) < TIMESTAMP_TOLERANCE_SEC &&
        !visited.has(d.id)
    )

    if (!matchingDrop) break
    visited.add(matchingDrop.id)

    // 픽업 이벤트 (현재 유저)
    events.push({
      type: 'picked_up',
      timestamp: matchingDrop.picked_up_at!,
      user_id: currentUserId,
      username: userMap.get(currentUserId) ?? null,
      poi_name: matchingDrop.poi?.name,
    })

    // 드랍 이벤트 (이전 보유자)
    events.push({
      type: 'dropped',
      timestamp: matchingDrop.dropped_at,
      user_id: matchingDrop.dropper_user_id,
      username: userMap.get(matchingDrop.dropper_user_id) ?? null,
      poi_name: matchingDrop.poi?.name,
    })

    // 이전 보유자의 획득 이벤트 찾기
    const dropperUserId = matchingDrop.dropper_user_id
    const dropperInventory = [...invMap.entries()].filter(([, uid]) => uid === dropperUserId).map(([id]) => id)

    const dropperItem = allItems.find(
      (it) =>
        dropperInventory.includes(it.inventory_id) &&
        it.dropped_at != null &&
        timeDiffSec(it.dropped_at, matchingDrop.dropped_at) < TIMESTAMP_TOLERANCE_SEC
    )

    if (!dropperItem) {
      // 드랍 이전 이력 불명 — 이전 보유자의 첫 획득을 시간 근사로 탐색
      const dropperFirstItem = allItems.find((it) => {
        const uid = invMap.get(it.inventory_id)
        return uid === dropperUserId
      })
      if (dropperFirstItem) {
        events.push({
          type: 'obtained',
          timestamp: dropperFirstItem.obtained_at,
          user_id: dropperUserId,
          username: userMap.get(dropperUserId) ?? null,
          obtained_by: dropperFirstItem.obtained_by as 'drop' | 'drop_event' | 'pickup' | 'system' | 'system_event',
        })
        currentUserId = dropperUserId
        currentObtainedAt = dropperFirstItem.obtained_at
        currentObtainedBy = dropperFirstItem.obtained_by
      }
      break
    }

    const dropperObtainedBy = dropperItem.obtained_by
    events.push({
      type: 'obtained',
      timestamp: dropperItem.obtained_at,
      user_id: dropperUserId,
      username: userMap.get(dropperUserId) ?? null,
      obtained_by: dropperObtainedBy as 'drop' | 'drop_event' | 'pickup' | 'system' | 'system_event',
    })

    currentUserId = dropperUserId
    currentObtainedAt = dropperItem.obtained_at
    currentObtainedBy = dropperObtainedBy
  }

  // 최신순 정렬
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return NextResponse.json({ events })
}
