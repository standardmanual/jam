import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import type { InventoryItemRow } from '@/types/database'

export default async function InventoryItemPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: itemRaw } = await supabase
    .from('inventory_items')
    .select('badge_id, inventory_id')
    .eq('id', itemId)
    .single()
  if (!itemRaw) notFound()
  const itemData = itemRaw as Pick<InventoryItemRow, 'badge_id' | 'inventory_id'>

  // 20260829_2101: inventory_id가 nullable화됨 — 현재 소유자가 없는 개체(드랍/고아 상태)는
  // 조회 대상이 아니므로 자연히 notFound() 처리한다(기존과 동일한 원칙: 본인이 지금
  // 보유 중인 개체만 조회 가능).
  if (!itemData.inventory_id) notFound()

  const { data: inventoryCheck } = await supabase
    .from('inventory')
    .select('id')
    .eq('id', itemData.inventory_id)
    .eq('user_id', user.id)
    .single()
  if (!inventoryCheck) notFound()

  redirect('/badges/' + itemData.badge_id)
}
