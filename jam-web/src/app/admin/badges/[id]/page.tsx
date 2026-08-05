import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import BadgeDetail from '@/components/admin/badges/BadgeDetail'
import type { BadgeRow, FactionRow } from '@/types/database'

export default async function BadgeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const [{ data }, { data: factionsRaw }] = await Promise.all([
    supabase.from('badges').select('*').eq('id', id).single(),
    supabase.from('factions').select('id, name'),
  ])

  if (!data) notFound()

  const badge = data as BadgeRow
  const factionMap = new Map(
    ((factionsRaw ?? []) as Pick<FactionRow, 'id' | 'name'>[]).map((f) => [f.id, f.name])
  )
  const factionName = badge.faction_id ? factionMap.get(badge.faction_id) : undefined

  return (
    <div className="p-4 md:p-8">
      <BadgeDetail badge={badge} factionName={factionName} />
    </div>
  )
}
