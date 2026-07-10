// GET /api/drops/poi/[poiId] — POI에 드랍된 픽업 가능 아이템 목록

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ poiId: string }> }
) {
  const { poiId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()

  const { data, error } = await service
    .from('poi_drops')
    .select(`
      id,
      badge_id,
      dropped_at,
      dropper_user_id,
      badges ( name, rarity, image_url ),
      users!dropper_user_id ( display_name )
    `)
    .eq('poi_id', poiId)
    .eq('is_available', true)
    .neq('dropper_user_id', user.id)
    .order('dropped_at', { ascending: true })

  if (error) {
    console.error('[poi drops] 조회 오류:', error)
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }

  const drops = (data ?? []).map((d: any) => ({
    id: d.id,
    badge_id: d.badge_id,
    badge_name: d.badges?.name,
    badge_rarity: d.badges?.rarity,
    badge_image_url: d.badges?.image_url,
    dropper_name: d.users?.display_name,
    dropped_at: d.dropped_at,
  }))

  return NextResponse.json({ drops })
}
