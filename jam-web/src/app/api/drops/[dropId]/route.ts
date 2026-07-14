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
      users!dropper_user_id ( username )
    `)
    .eq('id', dropId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: '드랍 없음' }, { status: 404 })
  }

  const drop = data as PoiDropRow & {
    badges: { name: string; rarity: string; image_url: string }
    users: { username: string }
  }

  return NextResponse.json({
    id: drop.id,
    poi_id: drop.poi_id,
    badge_name: drop.badges.name,
    badge_rarity: drop.badges.rarity,
    badge_image_url: drop.badges.image_url,
    dropper_name: drop.users.username,
    dropped_at: drop.dropped_at,
    is_available: drop.is_available,
    is_own: drop.dropper_user_id === user.id,
  })
}
