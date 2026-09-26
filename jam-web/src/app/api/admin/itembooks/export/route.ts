import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { parseExportIds } from '@/lib/admin/export-ids'
import { toCsv } from '@/lib/admin/csv'
import { kstDateString } from '@/lib/notifications/kst'
import { formatKstYmd } from '@/lib/admin/kst-format'
import type { ItemBookRow } from '@/types/database'

/**
 * 선택된 컬렉션을 CSV로 내보낸다(티켓 20260924_0945, 상위 티켓 §4.1). ID 목록을 본문으로 받는다 —
 * 최대 1,000건(전체 선택 상한)까지도 GET 쿼리스트링 16KB 상한에 걸릴 수 있어 POST로 받는다
 * (`badges/export/route.ts`와 같은 이유).
 */
const CHUNK_SIZE = 200

// DB 오류 원문은 응답에 싣지 않고 로그에만 남긴다(티켓 20260926_1603). 현상 → 원인 → 해결책 순서.
const READ_ERROR_MESSAGE = '내보낼 컬렉션 정보를 불러오지 못했어요. 서버에서 조회 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'

type ExportRow = Pick<
  ItemBookRow,
  'id' | 'name' | 'tribe_id' | 'required_activity_badge_id' | 'reward_badge_id' | 'is_active' | 'valid_from' | 'valid_until'
>

export async function POST(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const body = await req.json().catch(() => null)
  const parsed = parseExportIds(body, '내보낼 컬렉션을 선택해주세요.')
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status })

  const supabase = createServiceClient()
  const uniqueIds = parsed.ids

  const rows: ExportRow[] = []
  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE)
    const { data, error } = await supabase
      .from('item_books')
      .select('id, name, tribe_id, required_activity_badge_id, reward_badge_id, is_active, valid_from, valid_until')
      .in('id', chunk)
    if (error) {
      console.error('[itembooks export] 조회 오류:', error.message)
      return NextResponse.json({ error: READ_ERROR_MESSAGE }, { status: 500 })
    }
    rows.push(...((data ?? []) as ExportRow[]))
  }

  const tribeIds = [...new Set(rows.map((r) => r.tribe_id).filter((id): id is string => !!id))]
  const badgeIds = [
    ...new Set(rows.flatMap((r) => [r.required_activity_badge_id, r.reward_badge_id]).filter((id): id is string => !!id)),
  ]
  const [{ data: tribesRaw }, { data: badgesRaw }] = await Promise.all([
    tribeIds.length > 0
      ? supabase.from('tribes').select('id, name').in('id', tribeIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    badgeIds.length > 0
      ? supabase.from('badges').select('id, name').in('id', badgeIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ])
  const tribeNameById = new Map((tribesRaw ?? []).map((t) => [t.id, t.name]))
  const badgeNameById = new Map((badgesRaw ?? []).map((b) => [b.id, b.name]))

  const csv = toCsv(rows, [
    { header: 'ID', value: (r) => r.id },
    { header: '이름', value: (r) => r.name },
    { header: '트라이브', value: (r) => (r.tribe_id ? (tribeNameById.get(r.tribe_id) ?? r.tribe_id) : null) },
    {
      header: '필수 액티비티 배지',
      value: (r) =>
        r.required_activity_badge_id ? (badgeNameById.get(r.required_activity_badge_id) ?? r.required_activity_badge_id) : null,
    },
    {
      header: '보상 배지',
      value: (r) => (r.reward_badge_id ? (badgeNameById.get(r.reward_badge_id) ?? r.reward_badge_id) : null),
    },
    { header: '상태', value: (r) => (r.is_active ? '활성' : '비활성') },
    { header: '노출 시작', value: (r) => (r.valid_from ? formatKstYmd(r.valid_from) : null) },
    { header: '노출 종료', value: (r) => (r.valid_until ? formatKstYmd(r.valid_until) : null) },
  ])

  const filename = `itembooks_${kstDateString().replace(/-/g, '')}.csv`
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
