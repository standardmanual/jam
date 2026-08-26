/**
 * GET /api/cron/ambient-drop
 * 매일 18:00(UTC) 실행: 어드민이 설정한 3축(카테고리/등급비율/대상컬렉션)에 따라
 * 앰비언트(시스템) POI 드랍을 배치한다.
 * Vercel Cron: "0 18 * * *" — src/lib/ambient-drop/schedule.ts의 상수와 반드시 함께 바뀐다.
 *
 * ambient_drop_config.auto_enabled가 꺼져 있으면(어드민이 자동 스케줄을 "등록"하지 않았으면)
 * 아무 것도 배치하지 않고 조용히 반환한다 — cron 자체는 계속 호출되지만 실질적인 배치는
 * 스위치가 켜져 있을 때만 일어난다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAmbientDropConfig } from '@/lib/ambient-drop/config'
import { runAmbientDropBatch } from '@/lib/ambient-drop'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = await getAmbientDropConfig()
  if (!config.auto_enabled) {
    console.info('[ambient-drop-cron] auto_enabled=false — 배치 건너뜀')
    return NextResponse.json({ skipped: true, reason: 'auto_disabled' })
  }

  const result = await runAmbientDropBatch('cron')

  console.info(
    `[ambient-drop-cron] category=${result.effectiveCategorySlug ?? '전체'} collections=${result.effectiveCollectionIds.length || '전체'} eligiblePoi=${result.eligiblePoiCount} spawned=${result.spawned}${result.reason ? ` (${result.reason})` : ''}`
  )

  return NextResponse.json(result)
}
