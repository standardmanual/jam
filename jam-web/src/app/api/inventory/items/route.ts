// GET /api/inventory/items — 드랍 가능한 인벤토리 아이템 목록 (dropped_at IS NULL)

import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()

  const { data: invRaw } = await service
    .from('inventory')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!invRaw) return NextResponse.json({ items: [] })

  const inventoryId = (invRaw as { id: string }).id

  const { data, error } = await service
    .from('inventory_items')
    .select(`
      id,
      badge_id,
      dropped_at,
      badges ( name, rarity, image_url )
    `)
    .eq('inventory_id', inventoryId)
    .is('dropped_at', null)
    .order('obtained_at', { ascending: false })

  if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })

  const items = (data ?? []).map((d: any) => ({
    id: d.id,
    badge_id: d.badge_id,
    badge_name: d.badges?.name,
    badge_rarity: d.badges?.rarity,
    badge_image_url: d.badges?.image_url,
  }))

  return NextResponse.json({ items })
}
