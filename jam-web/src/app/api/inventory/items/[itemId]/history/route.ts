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

// 20260829_2101: 개체 정체성 모델 도입 이후 poi_drops가 항상 이 개체(inventory_item_id)를
// 직접 참조하므로, 드랍/픽업 이력은 badge_id + 타임스탬프 근사치로 다른 유저의 다른
// 개체 행 사이를 추측해 이어붙일 필요가 없어졌다 — poi_drops.inventory_item_id = itemId로
// 직접 조회하면 이 개체가 실제로 거쳐온 드랍/픽업 사이클 전체가 정확히 나온다(기존의
// timestamp-tolerance 휴리스틱 제거, 같은 배지의 다른 유저 개체와 혼선될 여지도 사라짐).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()

  const { data: itemRaw } = await service
    .from('inventory_items')
    .select('id, obtained_at, obtained_by, inventory_id')
    .eq('id', itemId)
    .single()

  if (!itemRaw) return NextResponse.json({ error: '아이템 없음' }, { status: 404 })

  const item = itemRaw as {
    id: string
    obtained_at: string
    obtained_by: string
    inventory_id: string | null
  }

  // 소유 확인 — 현재 소유자만 조회 가능. 드랍/고아 상태(inventory_id NULL)면 조회 대상이
  // 아니므로 자연히 404가 된다(기존과 동일한 원칙 — 본인이 지금 보유 중인 개체만 이력 조회).
  if (!item.inventory_id) return NextResponse.json({ error: '없음' }, { status: 404 })

  const { data: invCheck } = await service
    .from('inventory')
    .select('user_id')
    .eq('id', item.inventory_id)
    .single()

  if (!invCheck) return NextResponse.json({ error: '없음' }, { status: 404 })

  const ownerUserId = (invCheck as { user_id: string }).user_id
  if (ownerUserId !== user.id) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  // 이 개체가 실제로 거쳐온 드랍/픽업 사이클 전체(반복 드랍 가능) — 오래된 순
  const { data: dropsRaw } = await service
    .from('poi_drops')
    .select('id, dropper_user_id, picked_up_by, dropped_at, picked_up_at, poi ( name )')
    .eq('inventory_item_id', itemId)
    .order('dropped_at', { ascending: true })

  const drops = (dropsRaw ?? []) as unknown as Array<{
    id: string
    dropper_user_id: string | null
    picked_up_by: string | null
    dropped_at: string
    picked_up_at: string | null
    poi: { name: string } | null
  }>

  // 관련 유저명 일괄 조회
  const userIds = new Set<string>([ownerUserId])
  for (const drop of drops) {
    if (drop.dropper_user_id) userIds.add(drop.dropper_user_id)
    if (drop.picked_up_by) userIds.add(drop.picked_up_by)
  }

  const { data: usersRaw } = await service.from('users').select('id, username').in('id', [...userIds])
  const userMap = new Map<string, string | null>()
  for (const u of (usersRaw ?? []) as Array<{ id: string; username: string | null }>) {
    userMap.set(u.id, u.username)
  }

  const events: HistoryEvent[] = []

  // 최초 발급(genesis) — 이 개체가 한 번이라도 드랍된 적 있다면, 최초 드랍의 dropper가
  // 곧 발급 당시 소유자다(드랍 전까지는 소유권 이전이 없으므로). 유저 드랍이 아닌
  // 최초 드랍(시스템/앰비언트 배치)은 발급 당시 소유자가 없어 obtained 이벤트를 생략한다.
  const firstDrop = drops[0]
  if (firstDrop) {
    if (firstDrop.dropper_user_id) {
      events.push({
        type: 'obtained',
        timestamp: item.obtained_at,
        user_id: firstDrop.dropper_user_id,
        username: userMap.get(firstDrop.dropper_user_id) ?? null,
        obtained_by: item.obtained_by as 'drop' | 'drop_event' | 'pickup' | 'system' | 'system_event',
      })
    }
  } else {
    events.push({
      type: 'obtained',
      timestamp: item.obtained_at,
      user_id: ownerUserId,
      username: userMap.get(ownerUserId) ?? null,
      obtained_by: item.obtained_by as 'drop' | 'drop_event' | 'pickup' | 'system' | 'system_event',
    })
  }

  for (const drop of drops) {
    events.push({
      type: 'dropped',
      timestamp: drop.dropped_at,
      user_id: drop.dropper_user_id ?? '',
      username: drop.dropper_user_id ? (userMap.get(drop.dropper_user_id) ?? null) : null,
      poi_name: drop.poi?.name,
    })
    if (drop.picked_up_at && drop.picked_up_by) {
      events.push({
        type: 'picked_up',
        timestamp: drop.picked_up_at,
        user_id: drop.picked_up_by,
        username: userMap.get(drop.picked_up_by) ?? null,
        poi_name: drop.poi?.name,
      })
    }
  }

  // 최신순 정렬
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return NextResponse.json({ events })
}
