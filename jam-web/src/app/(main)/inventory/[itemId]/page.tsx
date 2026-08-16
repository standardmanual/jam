import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'

export default async function InventoryItemPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: itemData } = await supabase
    .from('inventory_items')
    .select('badge_id, inventory_id')
    .eq('id', itemId)
    .single()
  if (!itemData) notFound()

  const { data: inventoryCheck } = await supabase
    .from('inventory')
    .select('id')
    .eq('id', itemData.inventory_id)
    .eq('user_id', user.id)
    .single()
  if (!inventoryCheck) notFound()

  redirect('/badges/' + itemData.badge_id)
}
