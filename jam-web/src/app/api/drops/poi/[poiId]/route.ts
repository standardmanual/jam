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

  // poi_drops + badges 조인 (users 조인은 FK 중복으로 별도 조회)
  const { data, error } = await (service as any)
    .from('poi_drops')
    .select(`id, badge_id, dropped_at, dropper_user_id, badges ( name, rarity, image_url )`)
    .eq('poi_id', poiId)
    .eq('is_available', true)
    .order('dropped_at', { ascending: true })

  if (error) {
    console.error('[poi drops] 조회 오류:', error.message)
    return NextResponse.json({ error: '조회 실패', detail: error.message }, { status: 500 })
  }

  // dropper display_name 별도 조회
  const dropperIds = [...new Set((data ?? []).map((d: any) => d.dropper_user_id as string))]
  const { data: usersData } = dropperIds.length > 0
    ? await (service as any).from('users').select('id, display_name').in('id', dropperIds)
    : { data: [] }
  const nameById: Record<string, string> = {}
  for (const u of usersData ?? []) nameById[u.id] = u.display_name

  const drops = (data ?? []).map((d: any) => ({
    id: d.id,
    badge_id: d.badge_id,
    badge_name: d.badges?.name,
    badge_rarity: d.badges?.rarity,
    badge_image_url: d.badges?.image_url,
    dropper_name: nameById[d.dropper_user_id] ?? '익명',
    dropped_at: d.dropped_at,
  }))

  return NextResponse.json({ drops })
}
