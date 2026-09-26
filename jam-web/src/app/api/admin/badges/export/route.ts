import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { parseExportIds } from '@/lib/admin/export-ids'
import { toCsv } from '@/lib/admin/csv'
import { kstDateString } from '@/lib/notifications/kst'
import { badgeTypeLabel } from '@/lib/admin/badge-labels'
import { BADGE_LIST_COLUMNS } from '@/lib/admin/badge-list-query'
import type { BadgeListRow } from '@/components/admin/badges/BadgeList'
import { formatKstYmd } from '@/lib/admin/kst-format'

/**
 * 선택된 배지를 CSV로 내보낸다(티켓 20260924_0944, 상위 티켓 §4.1). ID 목록을 본문으로
 * 받는다 — 최대 1,000건(전체 선택 상한)까지도 GET 쿼리스트링 16KB 상한에 걸릴 수 있어
 * POST로 받는다(`poi/export/route.ts`와 동일 이유).
 */
const CHUNK_SIZE = 200

export async function POST(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const body = await req.json().catch(() => null)
  const parsed = parseExportIds(body, '내보낼 배지를 선택해주세요.')
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status })

  const supabase = createServiceClient()
  const uniqueIds = parsed.ids

  const rows: BadgeListRow[] = []
  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE)
    const { data, error } = await supabase.from('badges').select(BADGE_LIST_COLUMNS).in('id', chunk)
    if (error) {
      console.error('[admin/badges/export] 배지 조회 오류:', error)
      return NextResponse.json(
        { error: '배지를 내보내지 못했어요. 서버에서 조회 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.' },
        { status: 500 }
      )
    }
    rows.push(...((data ?? []) as BadgeListRow[]))
  }

  const tribeIds = [...new Set(rows.map((r) => r.tribe_id).filter((id): id is string => !!id))]
  const { data: tribesRaw } =
    tribeIds.length > 0
      ? await supabase.from('tribes').select('id, name').in('id', tribeIds)
      : { data: [] as { id: string; name: string }[] }
  const tribeNameById = new Map((tribesRaw ?? []).map((t) => [t.id, t.name]))

  const csv = toCsv(rows, [
    { header: 'ID', value: (r) => r.id },
    { header: '이름', value: (r) => r.name },
    { header: '타입', value: (r) => badgeTypeLabel(r.type) },
    { header: '희귀도', value: (r) => r.rarity ?? null },
    { header: '트라이브', value: (r) => (r.tribe_id ? (tribeNameById.get(r.tribe_id) ?? r.tribe_id) : null) },
    { header: '활동', value: (r) => (r.activity_types?.length ? r.activity_types.join('/') : null) },
    { header: '패치가', value: (r) => (r.patch_available ? (r.patch_price_krw ?? 0) : null) },
    { header: '상태', value: (r) => (r.deleted_at ? `비활성화(${formatKstYmd(r.deleted_at)})` : '활성') },
  ])

  const filename = `badges_${kstDateString().replace(/-/g, '')}.csv`
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
