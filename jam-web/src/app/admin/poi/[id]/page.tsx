import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import PoiForm from '../PoiForm'
import type { PoiRow, BadgeRow } from '@/types/database'

export default async function EditPoiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const [{ data: poiRaw }, { data: badgesRaw }] = await Promise.all([
    supabase.from('poi').select('*').eq('id', id).single(),
    supabase.from('badges').select('id, name').order('name'),
  ])

  if (!poiRaw) notFound()

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/poi" className="text-white/40 hover:text-white text-sm transition-colors">
          ← POI 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">POI 수정</h1>
      </div>
      <PoiForm
        poi={poiRaw as PoiRow}
        badges={(badgesRaw ?? []) as Pick<BadgeRow, 'id' | 'name'>[]}
      />
    </div>
  )
}
