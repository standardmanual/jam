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

  const { data: inventoryCheck } = await supabase
    .from('inventory')
    .select('id')
    .eq('id', itemData.inventory_id)
    .eq('user_id', user.id)
    .single()
  if (!inventoryCheck) notFound()

  redirect('/badges/' + itemData.badge_id)
}
