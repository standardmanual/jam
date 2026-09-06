/**
 * POST /api/admin/ambient-drop/deploy — 어드민 「지금 배포」
 *
 * 예약 배포(auto_enabled)가 켜져 있으면 그 시각(schedule_hour_kst, KST 정시) 전후
 * exclusion_window_minutes분 동안은 거부한다(409) — 화면의 버튼 비활성화는 UX 편의이고,
 * 실제 강제는 여기서 한다 (레이스 컨디션 방지가 목적, 티켓 20260826_009 §3).
 */
import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { getAmbientDropConfig } from '@/lib/ambient-drop/config'
import { runAmbientDropBatch } from '@/lib/ambient-drop'
import {
  formatAmbientDropScheduleTime,
  isWithinAmbientDropExclusionWindow,
} from '@/lib/ambient-drop/schedule'

export async function POST() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const config = await getAmbientDropConfig()

  if (
    config.auto_enabled &&
    isWithinAmbientDropExclusionWindow(new Date(), config.schedule_hour_kst, config.exclusion_window_minutes)
  ) {
    return NextResponse.json(
      {
        error: `지금은 배포할 수 없어요. 예약 배포 시각 ${formatAmbientDropScheduleTime(config.schedule_hour_kst)} 전후 ${config.exclusion_window_minutes}분이라 배포가 겹칠 수 있어요. 이 시간이 지난 뒤에 다시 눌러주세요.`,
      },
      { status: 409 }
    )
  }

  const result = await runAmbientDropBatch('manual')
  return NextResponse.json({ result })
}
