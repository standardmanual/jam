import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TribeForm from '../TribeForm'
import AdjacencyEditor from './AdjacencyEditor'
import type { TribeRow, TribeAdjacencyRow } from '@/types/database'

export default async function EditTribePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const [{ data }, { data: allTribesRaw }, { data: adjacencyRaw }] = await Promise.all([
    supabase.from('tribes').select('*').eq('id', id).single(),
    supabase.from('tribes').select('id, name').neq('id', id).order('sort_order'),
    supabase.from('tribe_adjacency').select('adjacent_tribe_id').eq('tribe_id', id),
  ])
  if (!data) notFound()

  const allTribes = (allTribesRaw ?? []) as Pick<TribeRow, 'id' | 'name'>[]
  const adjacentIds = ((adjacencyRaw ?? []) as Pick<TribeAdjacencyRow, 'adjacent_tribe_id'>[]).map(
    (r) => r.adjacent_tribe_id
  )

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/tribes" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
          ← 트라이브 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">트라이브 수정</h1>
      </div>
      <TribeForm tribe={data as TribeRow} />
      <AdjacencyEditor tribeId={id} allTribes={allTribes} initialAdjacentIds={adjacentIds} />
    </div>
  )
}
