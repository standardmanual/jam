import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import PoiForm from '../PoiForm'
import type { PoiRow, PoiCategoryRow } from '@/types/database'

export default async function EditPoiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const [{ data: poiRaw }, { data: categoriesRaw }] = await Promise.all([
    supabase.from('poi').select('*').eq('id', id).single(),
    supabase.from('poi_categories').select('*').order('slug'),
  ])

  if (!poiRaw) notFound()

  const poi = poiRaw as PoiRow

  // 연결 배지는 전체 목록을 가져오지 않고, 이미 연결돼 있을 때만 그 배지 하나만 조회
  let linkedBadgeLabel: string | undefined
  if (poi.linked_badge_id) {
    const { data: badgeRaw } = await supabase.from('badges').select('name').eq('id', poi.linked_badge_id).maybeSingle()
    linkedBadgeLabel = (badgeRaw as { name: string } | null)?.name
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/poi" className="text-[#6b7280] hover:text-[#111111] text-sm transition-colors">
          ← POI 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">POI 수정</h1>
      </div>
      <PoiForm
        poi={poi}
        linkedBadgeLabel={linkedBadgeLabel}
        categories={(categoriesRaw ?? []) as PoiCategoryRow[]}
      />
    </div>
  )
}
