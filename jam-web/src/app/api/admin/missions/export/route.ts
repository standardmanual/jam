import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
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
  const ids = Array.isArray((body as { ids?: unknown })?.ids)
    ? (body as { ids: unknown[] }).ids.filter((id): id is string => typeof id === 'string')
    : []
  if (ids.length === 0) {
    return NextResponse.json({ error: '내보낼 미션을 선택해주세요.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const uniqueIds = [...new Set(ids)]
  const now = new Date()

  const rows: MissionListRow[] = []
  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE)
    const { data, error } = await supabase.from('missions').select(MISSION_LIST_COLUMNS).in('id', chunk)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
