// GET /api/inventory/items — 드랍 가능한 인벤토리 아이템 목록 (dropped_at IS NULL, slotted_in IS NULL)

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
      badges ( name, rarity, image_url, deleted_at )
    `)
    .eq('inventory_id', inventoryId)
    .is('dropped_at', null)
    .is('slotted_in', null)
    .order('obtained_at', { ascending: false })

  if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })

  // 소프트 삭제된 배지(badges.deleted_at)는 드랍 선택 목록에서 제외한다 —
  // 메인 인벤토리 목록(inventory/page.tsx)과 동일하게 조인 결과를 사후 필터한다.
  const items = (data ?? [])
    .filter((d: any) => d.badges && !d.badges.deleted_at)
    .map((d: any) => ({
      id: d.id,
      badge_id: d.badge_id,
      badge_name: d.badges?.name,
      badge_rarity: d.badges?.rarity,
      badge_image_url: d.badges?.image_url,
    }))

  return NextResponse.json({ items })
}
