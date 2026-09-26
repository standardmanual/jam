import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { parseExportIds } from '@/lib/admin/export-ids'
import { toCsv } from '@/lib/admin/csv'
import { kstDateString } from '@/lib/notifications/kst'
import { loadOrphanedRows, sortOrphanedRows, ORPHANED_DEFAULT_SORT } from '@/lib/admin/orphaned-items-query'
import { RARITY_LABEL, formatDateTime } from '@/lib/admin/item-badge-status'
import type { BadgeRarity } from '@/types/database'

/**
 * 선택된 미소유 아이템배지를 CSV로 내보낸다(티켓 20260924_0950, 상위 티켓 §4.3). ID 목록을
 * 본문으로 받는다 — 최대 1,000건까지도 GET 쿼리스트링 16KB 상한에 걸릴 수 있어 POST로 받는다.
 * 지금 소유자 없음 상태인 개체만 담는다(선택 뒤 상태가 바뀐 개체는 빠진다).
 */
export async function POST(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const body = await req.json().catch(() => null)
  const parsed = parseExportIds(body, '내보낼 개체를 선택해주세요.')
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status })

  const supabase = createServiceClient()
  const wanted = new Set(parsed.ids)

  let rows
  try {
    rows = sortOrphanedRows(
      (await loadOrphanedRows(supabase)).filter((row) => wanted.has(row.id)),
      ORPHANED_DEFAULT_SORT
    )
  } catch (error) {
    console.error('[admin/item-badges/orphaned/export]', error)
    return NextResponse.json({ error: '목록을 불러오지 못했습니다. 잠시 뒤 다시 시도해주세요.' }, { status: 500 })
  }

  const csv = toCsv(rows, [
    { header: 'ID', value: (r) => r.id },
    { header: '배지', value: (r) => r.badgeName },
    { header: '배지 ID', value: (r) => r.badgeId },
    { header: '등급', value: (r) => RARITY_LABEL[r.badgeRarity as BadgeRarity] ?? r.badgeRarity },
    { header: '일련번호', value: (r) => `#${r.serialLabel}` },
    { header: '발급일시', value: (r) => formatDateTime(r.mintedAt) },
  ])

  const filename = `orphaned_item_badges_${kstDateString().replace(/-/g, '')}.csv`
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
