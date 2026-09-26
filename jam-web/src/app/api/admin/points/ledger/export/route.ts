import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { parseExportIds } from '@/lib/admin/export-ids'
import { toCsv } from '@/lib/admin/csv'
import { kstDateString } from '@/lib/notifications/kst'
import { LEDGER_COLUMNS, ledgerReasonLabel, type LedgerRow } from '@/lib/admin/points-ledger-query'

/**
 * 선택된 포인트 원장을 CSV로 내보낸다(티켓 20260924_0950, 상위 티켓 §4.3). ID 목록을 본문으로
 * 받는다 — 최대 1,000건까지도 GET 쿼리스트링 16KB 상한에 걸릴 수 있어 POST로 받는다.
 * 원장은 읽기만 한다(append-only 회계 로그).
 */
const CHUNK_SIZE = 200

// DB 오류 원문은 응답에 싣지 않고 로그에만 남긴다(티켓 20260926_1603). 현상 → 원인 → 해결책 순서.
const READ_ERROR_MESSAGE = '내보낼 원장 정보를 불러오지 못했어요. 서버에서 조회 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'

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
  const parsed = parseExportIds(body, '내보낼 원장을 선택해주세요.')
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status })

  const supabase = createServiceClient()
  const uniqueIds = parsed.ids

  const rows: LedgerRow[] = []
  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE)
    const { data, error } = await supabase.from('point_transactions').select(LEDGER_COLUMNS).in('id', chunk)
    if (error) {
      console.error('[points ledger export] 원장 조회 오류:', error.message)
      return NextResponse.json({ error: READ_ERROR_MESSAGE }, { status: 500 })
    }
    rows.push(...((data ?? []) as LedgerRow[]))
  }
  rows.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))

  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const usernameById = new Map<string, string | null>()
  for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
    const chunk = userIds.slice(i, i + CHUNK_SIZE)
    const { data, error } = await supabase.from('users').select('id, username').in('id', chunk)
    if (error) {
      console.error('[points ledger export] 유저 이름 조회 오류:', error.message)
      return NextResponse.json({ error: READ_ERROR_MESSAGE }, { status: 500 })
    }
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
