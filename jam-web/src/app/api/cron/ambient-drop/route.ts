/**
 * GET /api/cron/ambient-drop — 예약 배포
 *
 * Vercel Cron: "0 * * * *" (매시 정각). Vercel의 cron 표현식은 동적일 수 없으므로 매시
 * 호출해두고, 이 핸들러가 어드민이 정한 배포 시각(`schedule_hour_kst`, KST 정시)인지
 * 판정한다 — 그 시각이 아니면 아무 것도 하지 않고 즉시 반환한다(티켓 20260906_1206).
 *
 * 배치 조건은 셋이고, 하나라도 어긋나면 no-op이다:
 *   ① auto_enabled=true (예약 배포 스위치)
 *   ② 지금이 schedule_hour_kst 시각
 *   ③ 오늘(KST) 아직 예약 배포가 실행되지 않았음 — 조건부 UPDATE로 원자적으로 선점한다.
 *      매시 호출되므로 중복 방어가 필수다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { claimAmbientDropAutoRun, getAmbientDropConfig } from '@/lib/ambient-drop/config'
import { runAmbientDropBatch } from '@/lib/ambient-drop'
import { isAmbientDropScheduledHour } from '@/lib/ambient-drop/schedule'
import { kstDateString, kstHour } from '@/lib/notifications/kst'

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

  const now = new Date()
  if (!isAmbientDropScheduledHour(now, config.schedule_hour_kst)) {
    console.info(
      `[ambient-drop-cron] 예약 시각 아님 (now=${kstHour(now)}시 KST, schedule=${config.schedule_hour_kst}시 KST) — 배치 건너뜀`
    )
    return NextResponse.json({ skipped: true, reason: 'not_scheduled_hour' })
  }

  // 배치보다 먼저 선점한다 — 조회 후 갱신 방식은 동시 호출에서 둘 다 통과한다.
  const kstDate = kstDateString(now)
  const claimed = await claimAmbientDropAutoRun(kstDate)
  if (!claimed) {
    console.info(`[ambient-drop-cron] ${kstDate}(KST) 예약 배포가 이미 실행됨 — 배치 건너뜀`)
    return NextResponse.json({ skipped: true, reason: 'already_ran_today' })
  }

  const result = await runAmbientDropBatch('cron')

  console.info(
    `[ambient-drop-cron] category=${result.effectiveCategorySlug ?? '전체'} collections=${result.effectiveCollectionIds.length || '전체'} eligiblePoi=${result.eligiblePoiCount} spawned=${result.spawned}${result.reason ? ` (${result.reason})` : ''}`
  )

  return NextResponse.json(result)
}
