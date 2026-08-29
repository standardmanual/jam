// GET /api/drops/[dropId] — 단일 드랍 정보 (픽업 전 확인용)
// 실제로는 POI 기준 목록이 필요하므로 /api/drops/poi/[poiId] 참고

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { PoiDropRow } from '@/types/database'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ dropId: string }> }
) {
  const { dropId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()

  const { data, error } = await service
    .from('poi_drops')
    .select(`
      *,
      badges ( name, rarity, image_url ),
      users!dropper_user_id ( username ),
      inventory_items ( serial_prefix, serial_number )
    `)
    .eq('id', dropId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: '드랍 없음' }, { status: 404 })
  }

  const drop = data as PoiDropRow & {
    badges: { name: string; rarity: string; image_url: string }
    users: { username: string } | null
    // 20260829_2101: 개체 정체성 모델 — poi_drops가 항상 이미 발급된 inventory_items를
    // 가리키므로 픽업 전에도 일련번호가 이미 확정돼 있다. 마이그레이션 이전에 완료된
    // (is_available=false) 과거 드랍은 소급 연결되지 않아 null일 수 있다.
    inventory_items: { serial_prefix: string | null; serial_number: number } | null
  }

  return NextResponse.json({
    id: drop.id,
    poi_id: drop.poi_id,
    badge_name: drop.badges.name,
    badge_rarity: drop.badges.rarity,
    badge_image_url: drop.badges.image_url,
    dropper_name: drop.users?.username ?? '익명',
    dropped_at: drop.dropped_at,
    is_available: drop.is_available,
    is_own: drop.dropper_user_id === user.id,
    serial: drop.inventory_items
      ? `${drop.inventory_items.serial_prefix ?? '????'}${String(drop.inventory_items.serial_number).padStart(6, '0')}`
      : null,
  })
}
