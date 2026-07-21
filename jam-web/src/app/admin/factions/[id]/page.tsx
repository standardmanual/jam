import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import FactionForm from '../FactionForm'
import AdjacencyEditor from './AdjacencyEditor'
import type { FactionRow, FactionAdjacencyRow } from '@/types/database'

export default async function EditFactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const [{ data }, { data: allFactionsRaw }, { data: adjacencyRaw }] = await Promise.all([
    supabase.from('factions').select('*').eq('id', id).single(),
    supabase.from('factions').select('id, name').neq('id', id).order('sort_order'),
    supabase.from('faction_adjacency').select('adjacent_faction_id').eq('faction_id', id),
  ])
  if (!data) notFound()

  const allFactions = (allFactionsRaw ?? []) as Pick<FactionRow, 'id' | 'name'>[]
  const adjacentIds = ((adjacencyRaw ?? []) as Pick<FactionAdjacencyRow, 'adjacent_faction_id'>[]).map(
    (r) => r.adjacent_faction_id
  )

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/factions" className="text-white/40 hover:text-white text-sm transition-colors">
          ← 세계관 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">세계관 수정</h1>
      </div>
      <FactionForm faction={data as FactionRow} />
      <AdjacencyEditor factionId={id} allFactions={allFactions} initialAdjacentIds={adjacentIds} />
    </div>
  )
}
