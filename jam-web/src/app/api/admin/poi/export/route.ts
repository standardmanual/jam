import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { toCsv } from '@/lib/admin/csv'
import { kstDateString } from '@/lib/notifications/kst'
import { POI_EXPORT_COLUMNS, type PoiExportRow } from '@/lib/admin/poi-list-query'

/**
 * 선택된 POI를 CSV로 내보낸다(티켓 20260924_0941, 상위 티켓 §4.1). ID 목록을 본문으로
 * 받는다 — 최대 1,000건(전체 선택 상한)까지도 GET 쿼리스트링 16KB 상한에 걸릴 수 있어
 * POST로 받는다(`.claude/skills/jam-work` 서버 일괄 처리 계약과 동일한 이유).
 */
const CHUNK_SIZE = 200

export async function POST(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const body = await req.json().catch(() => null)
  const ids = Array.isArray((body as { ids?: unknown })?.ids)
    ? ((body as { ids: unknown[] }).ids.filter((id): id is string => typeof id === 'string'))
    : []
  if (ids.length === 0) {
    return NextResponse.json({ error: '내보낼 POI를 선택해주세요.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const uniqueIds = [...new Set(ids)]

  const rows: PoiExportRow[] = []
  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE)
    const { data, error } = await supabase.from('poi').select(POI_EXPORT_COLUMNS).in('id', chunk)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rows.push(...((data ?? []) as PoiExportRow[]))
  }

  const badgeIds = [...new Set(rows.map((r) => r.linked_badge_id).filter((id): id is string => !!id))]
  const { data: badgesRaw } =
    badgeIds.length > 0
      ? await supabase.from('badges').select('id, name').in('id', badgeIds)
      : { data: [] as { id: string; name: string }[] }
  const badgeNameById = new Map((badgesRaw ?? []).map((b) => [b.id, b.name]))

  const { data: categoriesRaw } = await supabase.from('poi_categories').select('slug, label')
  const categoryLabelBySlug = new Map((categoriesRaw ?? []).map((c) => [c.slug, c.label]))

  const csv = toCsv(rows, [
    { header: 'ID', value: (r) => r.id },
    { header: '이름', value: (r) => r.name },
    { header: '카테고리', value: (r) => categoryLabelBySlug.get(r.category) ?? r.category },
    { header: '위도', value: (r) => r.latitude },
    { header: '경도', value: (r) => r.longitude },
    { header: '반경(m)', value: (r) => r.radius_meters },
    { header: '등급', value: (r) => (r.poi_tier === 1 ? 'T1 수동' : 'T2 자동수집') },
    { header: '연결 배지', value: (r) => (r.linked_badge_id ? (badgeNameById.get(r.linked_badge_id) ?? r.linked_badge_id) : null) },
    { header: '상태', value: (r) => (r.is_active ? '활성' : '비활성') },
  ])

  const filename = `poi_${kstDateString().replace(/-/g, '')}.csv`
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
