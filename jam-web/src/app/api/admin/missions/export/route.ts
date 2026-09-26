import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { parseExportIds } from '@/lib/admin/export-ids'
import { toCsv } from '@/lib/admin/csv'
import { countRowsByKey, type CountRowsClient } from '@/lib/admin/list-counts'
import { formatKstYmdHm } from '@/lib/admin/kst-format'
import { kstDateString } from '@/lib/notifications/kst'
import { missionTypeLabel } from '@/lib/admin/badge-labels'
import {
  MISSION_LIST_COLUMNS,
  isGateMission,
  missionStatusOf,
  type MissionListRow,
} from '@/lib/admin/mission-list-query'

/**
 * 선택된 미션을 CSV로 내보낸다(티켓 20260924_0946, 상위 티켓 §4.1). ID 목록이 GET 쿼리스트링
 * 16KB 상한에 걸릴 수 있어 POST로 받는다(`api/admin/poi/export`와 같은 이유).
 */
const CHUNK_SIZE = 200

// DB 오류 원문은 응답에 싣지 않고 로그에만 남긴다(티켓 20260926_1603). 현상 → 원인 → 해결책 순서.
const READ_ERROR_MESSAGE = '내보낼 미션 정보를 불러오지 못했어요. 서버에서 조회 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'

const STATUS_LABEL = { upcoming: '예정', active: '진행 중', ended: '종료' } as const
const EXPOSURE_LABEL: Record<string, string> = {
  hidden: '숨김',
  start_date: '시작일 노출',
  scheduled: '노출일 지정',
}

export async function POST(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const body = await req.json().catch(() => null)
  const parsed = parseExportIds(body, '내보낼 미션을 선택해주세요.')
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status })

  const supabase = createServiceClient()
  const uniqueIds = parsed.ids
  const now = new Date()

  const rows: MissionListRow[] = []
  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE)
    const { data, error } = await supabase.from('missions').select(MISSION_LIST_COLUMNS).in('id', chunk)
    if (error) {
      console.error('[missions export] 조회 오류:', error.message)
      return NextResponse.json({ error: READ_ERROR_MESSAGE }, { status: 500 })
    }
    rows.push(...((data ?? []) as unknown as MissionListRow[]))
  }

  const completionCounts = await countRowsByKey(
    supabase as unknown as CountRowsClient,
    'user_mission_completions',
    'mission_id',
    rows.map((r) => r.id)
  )

  const csv = toCsv(rows, [
    { header: 'ID', value: (r) => r.id },
    { header: '제목', value: (r) => r.title },
    { header: '구분', value: (r) => (isGateMission(r) ? '게이트' : '일반') },
    { header: '미션 유형', value: (r) => missionTypeLabel(r.mission_type) },
    { header: '시작', value: (r) => formatKstYmdHm(r.starts_at) },
    { header: '종료', value: (r) => (r.ends_at ? formatKstYmdHm(r.ends_at) : '상시') },
    { header: '상태', value: (r) => STATUS_LABEL[missionStatusOf(r, now)] },
    { header: '노출', value: (r) => EXPOSURE_LABEL[r.exposure_mode] ?? r.exposure_mode },
    { header: '보상 배지 수', value: (r) => r.reward_badge_ids.length },
    { header: '보상 포인트', value: (r) => r.reward_points ?? 0 },
    { header: '달성 수', value: (r) => completionCounts[r.id] ?? 0 },
  ])

  const filename = `missions_${kstDateString().replace(/-/g, '')}.csv`
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
