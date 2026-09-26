import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { parseExportIds } from '@/lib/admin/export-ids'
import { toCsv } from '@/lib/admin/csv'
import { kstDateString } from '@/lib/notifications/kst'
import { formatKstYmdHm } from '@/lib/admin/kst-format'
import { TODAY_LIST_COLUMNS, type TodayListRow } from '@/lib/admin/today-list-query'
import { TODAY_TEMPLATE_OPTIONS } from '@/lib/admin/today-sections'

/**
 * 선택된 투데이 카드를 CSV로 내보낸다(티켓 20260924_0947, 상위 티켓 §4.1). ID 목록을 본문으로
 * 받는다 — 최대 1,000건(전체 선택 상한)까지도 GET 쿼리스트링 16KB 상한에 걸릴 수 있어
 * POST로 받는다(`poi/export/route.ts`와 동일한 이유).
 */
const CHUNK_SIZE = 200

// DB 오류 원문은 응답에 싣지 않고 로그에만 남긴다(티켓 20260926_1603). 현상 → 원인 → 해결책 순서.
const READ_ERROR_MESSAGE = '내보낼 카드 정보를 불러오지 못했어요. 서버에서 조회 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'

const TEMPLATE_LABEL = new Map<string, string>(TODAY_TEMPLATE_OPTIONS.map((o) => [o.value, o.label]))

export async function POST(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const body = await req.json().catch(() => null)
  const parsed = parseExportIds(body, '내보낼 카드를 선택해 주세요.')
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status })

  const supabase = createServiceClient()
  const uniqueIds = parsed.ids

  const rows: TodayListRow[] = []
  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE)
    const { data, error } = await supabase.from('today_cards').select(TODAY_LIST_COLUMNS).in('id', chunk)
    if (error) {
      console.error('[today export] 조회 오류:', error.message)
      return NextResponse.json({ error: READ_ERROR_MESSAGE }, { status: 500 })
    }
    rows.push(...((data ?? []) as TodayListRow[]))
  }

  const csv = toCsv(rows, [
    { header: 'ID', value: (r) => r.id },
    { header: '제목', value: (r) => r.title },
    { header: '템플릿', value: (r) => TEMPLATE_LABEL.get(r.template_type) ?? r.template_type },
    { header: '노출형태', value: (r) => r.layout_type },
    { header: '노출조건', value: (r) => (r.exposure_tags.length ? r.exposure_tags.join('/') : null) },
    { header: '시작', value: (r) => formatKstYmdHm(r.starts_at) },
    { header: '종료', value: (r) => formatKstYmdHm(r.ends_at) },
    { header: '노출 순서', value: (r) => r.sort_order },
    { header: '상태', value: (r) => (r.is_active ? '활성' : '비활성') },
  ])

  const filename = `today_${kstDateString().replace(/-/g, '')}.csv`
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
