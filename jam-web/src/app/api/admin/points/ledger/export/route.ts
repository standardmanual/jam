import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { toCsv } from '@/lib/admin/csv'
import { kstDateString } from '@/lib/notifications/kst'
import { LEDGER_COLUMNS, ledgerReasonLabel, type LedgerRow } from '@/lib/admin/points-ledger-query'

/**
 * 선택된 포인트 원장을 CSV로 내보낸다(티켓 20260924_0950, 상위 티켓 §4.3). ID 목록을 본문으로
 * 받는다 — 최대 1,000건까지도 GET 쿼리스트링 16KB 상한에 걸릴 수 있어 POST로 받는다.
 * 원장은 읽기만 한다(append-only 회계 로그).
 */
const CHUNK_SIZE = 200

function formatKstDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export async function POST(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const body = await req.json().catch(() => null)
  const ids = Array.isArray((body as { ids?: unknown })?.ids)
    ? (body as { ids: unknown[] }).ids.filter((id): id is string => typeof id === 'string')
    : []
  if (ids.length === 0) {
    return NextResponse.json({ error: '내보낼 원장을 선택해주세요.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const uniqueIds = [...new Set(ids)]

  const rows: LedgerRow[] = []
  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE)
    const { data, error } = await supabase.from('point_transactions').select(LEDGER_COLUMNS).in('id', chunk)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rows.push(...((data ?? []) as LedgerRow[]))
  }
  rows.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))

  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const usernameById = new Map<string, string | null>()
  for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
    const chunk = userIds.slice(i, i + CHUNK_SIZE)
    const { data, error } = await supabase.from('users').select('id, username').in('id', chunk)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const u of data ?? []) usernameById.set(u.id, u.username)
  }

  const csv = toCsv(rows, [
    { header: 'ID', value: (r) => r.id },
    { header: '일시', value: (r) => formatKstDateTime(r.created_at) },
    { header: '유저 ID', value: (r) => r.user_id },
    { header: '유저', value: (r) => usernameById.get(r.user_id) ?? null },
    { header: '금액(P)', value: (r) => r.amount },
    { header: '사유', value: (r) => ledgerReasonLabel(r.reason, r.admin_reason_label) },
    { header: '메모', value: (r) => r.admin_reason_note },
  ])

  const filename = `points_ledger_${kstDateString().replace(/-/g, '')}.csv`
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
