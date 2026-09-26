import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { parseExportIds } from '@/lib/admin/export-ids'
import { toCsv } from '@/lib/admin/csv'
import { kstDateString } from '@/lib/notifications/kst'
import { POI_EXPORT_COLUMNS, type PoiExportRow } from '@/lib/admin/poi-list-query'

/**
 * 선택된 POI를 CSV로 내보낸다(티켓 20260924_0941, 상위 티켓 §4.1). ID 목록을 본문으로
 * 받는다 — 최대 1,000건(전체 선택 상한)까지도 GET 쿼리스트링 16KB 상한에 걸릴 수 있어
 * POST로 받는다(`.claude/skills/jam-work` 서버 일괄 처리 계약과 동일한 이유).
 */
const CHUNK_SIZE = 200

// DB 오류 원문은 응답에 싣지 않고 로그에만 남긴다(티켓 20260926_1603). 현상 → 원인 → 해결책 순서.
const READ_ERROR_MESSAGE = '내보낼 POI 정보를 불러오지 못했어요. 서버에서 조회 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'

export async function POST(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const body = await req.json().catch(() => null)
  const parsed = parseExportIds(body, '내보낼 POI를 선택해주세요.')
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status })

  const supabase = createServiceClient()
  const uniqueIds = parsed.ids

  const rows: PoiExportRow[] = []
  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE)
    const { data, error } = await supabase.from('poi').select(POI_EXPORT_COLUMNS).in('id', chunk)
    if (error) {
      console.error('[poi export] 조회 오류:', error.message)
      return NextResponse.json({ error: READ_ERROR_MESSAGE }, { status: 500 })
    }
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
