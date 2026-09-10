import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import BadgeDetail from '@/components/admin/badges/BadgeDetail'
import type { BadgeRow, TribeRow } from '@/types/database'

export default async function BadgeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const [{ data }, { data: tribesRaw }] = await Promise.all([
    supabase.from('badges').select('*').eq('id', id).single(),
    supabase.from('factions').select('id, name'),
  ])

  if (!data) notFound()

  const badge = data as BadgeRow
  const tribeMap = new Map(
    ((tribesRaw ?? []) as Pick<TribeRow, 'id' | 'name'>[]).map((f) => [f.id, f.name])
  )
  const tribeName = badge.faction_id ? tribeMap.get(badge.faction_id) : undefined

  return (
    <div className="p-4 md:p-8">
      <BadgeDetail badge={badge} tribeName={tribeName} />
    </div>
  )
}
