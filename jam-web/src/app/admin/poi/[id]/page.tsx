import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import PoiForm from '../PoiForm'
import type { PoiRow, BadgeRow, PoiCategoryRow } from '@/types/database'

export default async function EditPoiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const [{ data: poiRaw }, { data: badgesRaw }, { data: categoriesRaw }] = await Promise.all([
    supabase.from('poi').select('*').eq('id', id).single(),
    supabase.from('badges').select('id, name').order('name'),
    supabase.from('poi_categories').select('*').order('slug'),
  ])

  if (!poiRaw) notFound()

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/poi" className="text-[#6b7280] hover:text-[#111111] text-sm transition-colors">
          ← POI 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">POI 수정</h1>
      </div>
      <PoiForm
        poi={poiRaw as PoiRow}
        badges={(badgesRaw ?? []) as Pick<BadgeRow, 'id' | 'name'>[]}
        categories={(categoriesRaw ?? []) as PoiCategoryRow[]}
      />
    </div>
  )
}
