import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
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

type ExportRow = Pick<
  ItemBookRow,
  'id' | 'name' | 'tribe_id' | 'required_activity_badge_id' | 'reward_badge_id' | 'is_active' | 'valid_from' | 'valid_until'
>

export async function POST(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const body = await req.json().catch(() => null)
  const ids = Array.isArray((body as { ids?: unknown })?.ids)
    ? (body as { ids: unknown[] }).ids.filter((id): id is string => typeof id === 'string')
    : []
  if (ids.length === 0) {
    return NextResponse.json({ error: '내보낼 컬렉션을 선택해주세요.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const uniqueIds = [...new Set(ids)]

  const rows: ExportRow[] = []
  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE)
    const { data, error } = await supabase
      .from('item_books')
      .select('id, name, tribe_id, required_activity_badge_id, reward_badge_id, is_active, valid_from, valid_until')
      .in('id', chunk)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
