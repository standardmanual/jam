import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PoiDetail } from '@/components/admin/poi/PoiDetail'
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

  let linkedBadgeLabel: string | undefined
  if (poi.linked_badge_id) {
    const { data: badgeRaw } = await supabase.from('badges').select('name').eq('id', poi.linked_badge_id).maybeSingle()
    linkedBadgeLabel = (badgeRaw as { name: string } | null)?.name
  }

  const categories = (categoriesRaw ?? []) as PoiCategoryRow[]
  const categoryLabel = categories.find(c => c.slug === poi.category)?.label

  return (
    <div className="space-y-8 p-4 md:p-8">
      {/* 뒤로가기 + 제목 */}
      <div className="space-y-3">
        <Link href="/admin/poi">
          <Button variant="ghost" className="h-auto p-0 text-sm">
            ← POI 목록
          </Button>
        </Link>
        <h1 className="text-2xl font-bold md:text-3xl">POI 수정</h1>
      </div>

      {/* POI 상세 정보 (읽기 전용) */}
      <PoiDetail
        poi={poi}
        linkedBadgeName={linkedBadgeLabel}
        categoryLabel={categoryLabel}
      />

      {/* 편집 폼 */}
      <div className="border-t pt-8">
        <h2 className="text-xl font-bold mb-6">편집</h2>
        <PoiForm
          poi={poi}
          linkedBadgeLabel={linkedBadgeLabel}
          categories={categories}
        />
      </div>
    </div>
  )
}
