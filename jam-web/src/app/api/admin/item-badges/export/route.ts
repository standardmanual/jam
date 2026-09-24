import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { toCsv } from '@/lib/admin/csv'
import { kstDateString } from '@/lib/notifications/kst'
import { RARITY_LABEL } from '@/lib/admin/item-badge-status'
import type { CountRowsClient } from '@/lib/admin/list-counts'
import {
  ITEM_BADGE_EXPORT_COLUMNS,
  loadItemBadgeIssuedCounts,
  type ItemBadgeExportRow,
} from '@/lib/admin/item-badge-list'

/**
 * 선택된 아이템배지 도안을 CSV로 내보낸다(티켓 20260924_0950, 상위 티켓 §4.3). ID 목록을
 * 본문으로 받는다 — 최대 1,000건까지도 GET 쿼리스트링 16KB 상한에 걸릴 수 있어 POST로 받는다.
 * 발급 수는 목록 화면과 같은 `countRowsByKey`로 센다.
 */
const CHUNK_SIZE = 200

export async function POST(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const body = await req.json().catch(() => null)
  const ids = Array.isArray((body as { ids?: unknown })?.ids)
    ? (body as { ids: unknown[] }).ids.filter((id): id is string => typeof id === 'string')
    : []
  if (ids.length === 0) {
    return NextResponse.json({ error: '내보낼 아이템배지를 선택해주세요.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const uniqueIds = [...new Set(ids)]

  const rows: ItemBadgeExportRow[] = []
  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE)
    const { data, error } = await supabase
      .from('badges')
      .select(ITEM_BADGE_EXPORT_COLUMNS)
      .eq('type', 'item')
      .in('id', chunk)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rows.push(...((data ?? []) as ItemBadgeExportRow[]))
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id))

  const [tribesRes, itemBooksRes] = await Promise.all([
    supabase.from('tribes').select('id, name'),
    supabase.from('item_books').select('id, name'),
  ])
  if (tribesRes.error || itemBooksRes.error) {
    return NextResponse.json({ error: '트라이브·컬렉션 이름을 불러오지 못했습니다. 잠시 뒤 다시 시도해주세요.' }, { status: 500 })
  }
  const tribeNameById = new Map((tribesRes.data ?? []).map((t) => [t.id, t.name]))
  const itemBookNameById = new Map((itemBooksRes.data ?? []).map((b) => [b.id, b.name]))

  let issuedCounts: Record<string, number>
  try {
    issuedCounts = await loadItemBadgeIssuedCounts(
      supabase as unknown as CountRowsClient,
      rows.map((r) => r.id)
    )
  } catch (error) {
    console.error('[admin/item-badges/export] 발급 수 집계 실패:', error)
    return NextResponse.json({ error: '발급 수를 집계하지 못했습니다. 잠시 뒤 다시 시도해주세요.' }, { status: 500 })
  }

  const csv = toCsv(rows, [
    { header: 'ID', value: (r) => r.id },
    { header: '이름', value: (r) => r.name },
    { header: '등급', value: (r) => (r.rarity ? RARITY_LABEL[r.rarity] : null) },
    { header: '트라이브', value: (r) => (r.tribe_id ? (tribeNameById.get(r.tribe_id) ?? r.tribe_id) : null) },
    { header: '컬렉션', value: (r) => (r.item_book_id ? (itemBookNameById.get(r.item_book_id) ?? r.item_book_id) : null) },
    { header: '총 발급 수', value: (r) => issuedCounts[r.id] ?? 0 },
  ])

  const filename = `item_badges_${kstDateString().replace(/-/g, '')}.csv`
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
