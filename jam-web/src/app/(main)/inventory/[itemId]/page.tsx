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

  // 20260907_2059: 개체 id를 `?item`으로 실어 보낸다. 이 redirect가 없으면 "인벤토리에서
  // 어느 개체를 눌렀는가"가 배지 상세에 도달하기 전에 사라져, 같은 배지를 여러 개 보유한
  // 유저가 어느 카드를 눌러도 같은 일련번호만 보게 된다.
  redirect(`/badges/${itemData.badge_id}?item=${encodeURIComponent(itemId)}`)
}
