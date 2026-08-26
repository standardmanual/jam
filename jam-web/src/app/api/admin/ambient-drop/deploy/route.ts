/**
 * POST /api/admin/ambient-drop/deploy — 어드민 "지금 배포" 버튼
 *
 * 자동 스케줄(auto_enabled)이 켜져 있으면 그 스케줄 시각 전후 exclusion_window_minutes분
 * 동안은 거부한다(409) — 화면의 버튼 비활성화는 UX 편의이고, 실제 강제는 여기서 한다
 * (레이스 컨디션 방지가 목적, 티켓 20260826_009 §3).
 */
import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { getAmbientDropConfig } from '@/lib/ambient-drop/config'
import { runAmbientDropBatch } from '@/lib/ambient-drop'
import { isWithinAmbientDropExclusionWindow } from '@/lib/ambient-drop/schedule'

export async function POST() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const config = await getAmbientDropConfig()

  if (config.auto_enabled && isWithinAmbientDropExclusionWindow(new Date(), config.exclusion_window_minutes)) {
    return NextResponse.json(
      {
        error: `자동 배포 스케줄 시각과 겹쳐 지금은 수동 배포할 수 없어요. 전후 ${config.exclusion_window_minutes}분이 지나면 다시 시도해주세요.`,
      },
      { status: 409 }
    )
  }

  const result = await runAmbientDropBatch('manual')
  return NextResponse.json({ result })
}
