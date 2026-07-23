/**
 * GET /api/cron/ambient-drop-monitor
 * 매시간 실행: 전체 POI의 시스템 드랍(source='system') 활성 수량을 목표치와 비교해 부족분 보충
 * Vercel Cron: "0 * * * *"
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAmbientDropPolicy } from '@/lib/ambient-drop/policy'
import { replenishAmbientDrops } from '@/lib/ambient-drop'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const policy = await getAmbientDropPolicy()
  const result = await replenishAmbientDrops(policy)

  console.info(
    `[ambient-drop-monitor] target=${result.targetTotal} current=${result.currentActive} spawned=${result.spawned}${result.reason ? ` (${result.reason})` : ''}`
  )

  return NextResponse.json(result)
}
