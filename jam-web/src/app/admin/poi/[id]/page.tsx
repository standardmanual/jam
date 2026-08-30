import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/admin/ui/button'
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

  // 연결 배지 조회 — 삭제(deleted_at)돼도 poi.linked_badge_id FK는 정리되지 않고 그대로
  // 남는다(삭제 API가 poi 테이블을 건드리지 않음). 필터 없이 이름만 가져오면 삭제 후에도
  // "연결된 배지: OOO"로 계속 표시돼 살아있는 것처럼 보인다(20260830_1547) — deleted_at도
  // 함께 조회해 상세화면에서 "비활성화됨"으로 명시한다. 편집 폼(PoiForm)에 넘기는
  // linkedBadgeLabel은 기존과 동일하게 이름만 유지한다(표시 로직만 고치는 이번 티켓 범위).
  let linkedBadgeLabel: string | undefined
  let linkedBadgeDeletedAt: string | null = null
  if (poi.linked_badge_id) {
    const { data: badgeRaw } = await supabase
      .from('badges')
      .select('name, deleted_at')
      .eq('id', poi.linked_badge_id)
      .maybeSingle()
    const badge = badgeRaw as { name: string; deleted_at: string | null } | null
    linkedBadgeLabel = badge?.name
    linkedBadgeDeletedAt = badge?.deleted_at ?? null
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
        linkedBadgeDeletedAt={linkedBadgeDeletedAt}
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
