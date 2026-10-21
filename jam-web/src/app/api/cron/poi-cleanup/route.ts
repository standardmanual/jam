/**
 * GET /api/cron/poi-cleanup
 * 매일 00:00(UTC) 실행: 만료된 POI 드랍 아이템 자동 소각
 * Vercel Cron: "0 0 * * *"
 *
 * 20260829_2101: 개체 정체성 모델 도입 이후 poi_drops가 항상 실제 개체(inventory_items)를
 * 참조하므로, 만료/소각 시 poi_drops.is_available만 내리는 게 아니라 그 개체도 함께
 * 파괴(소프트 삭제)하고 Expire 이벤트를 남겨야 한다 — 두 갈래(①expires_at 만료
 * ②연결 배지 소프트 삭제) 정리 로직과 원자적 개체 파괴를 expire_stale_poi_drops() RPC
 * 하나의 트랜잭션으로 처리한다(표준 불변식 참고 — 상태 변경과 같은 트랜잭션 내 이벤트 기록).
 *
 * 20260929_1327: 드랍 소각 뒤 보유기간(3개월)이 지난 abusing_logs 행도 함께 파기한다.
 * 파기 실패는 드랍 소각 결과를 무효로 만들지 않는다(로그 + 응답 필드로만 알린다).
 *
 * 20261021_1249 2회: 유저를 지울 때 보관 표(retained_records)로 옮긴 법정 보관 기록 중 보관 만료 시각이 지난 행도 함께 파기한다
 * (purge_expired_retained_records). 부정 이용 탐지 기록 파기가 실패해도 이 호출은 하고, 이 호출이 실패해도 응답은 200이다
 * (`retainedRecordPurgeError`로만 알린다). 드랍 소각 RPC 자체가 실패해 500으로 끝나는 날에는 어느 파기도 하지 않고 다음 실행으로 넘어간다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { purgeExpiredAbusingLogs } from '@/lib/abusing/purge-logs'
import { purgeExpiredRetainedRecords } from '@/lib/account/purge-retained'

export async function GET(req: NextRequest) {
  // CRON_SECRET이 비어 있으면 「Bearer undefined」가 통과하므로 값을 먼저 막는다(P1 20260929_1636)
  const secret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase.rpc('expire_stale_poi_drops')

  if (error) {
    console.error('[poi-cleanup] expire_stale_poi_drops RPC 오류:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const result = data as { expired: number; orphaned_by_deleted_badge: number }

  if (result.expired > 0) {
    console.info(`[poi-cleanup] 만료 드랍 소각 — ${result.expired}건`)
  }
  if (result.orphaned_by_deleted_badge > 0) {
    console.info(`[poi-cleanup] 삭제된 배지 드랍 소각 — ${result.orphaned_by_deleted_badge}건`)
  }

  const purge = await purgeExpiredAbusingLogs()
  if (purge.deleted > 0) {
    console.info(`[poi-cleanup] 보유기간 만료 부정 이용 탐지 기록 파기 — ${purge.deleted}건`)
  }

  // 앞의 파기가 실패했어도(purge.error) 이 호출은 한다. 두 파기는 서로 독립이다
  const retainedPurge = await purgeExpiredRetainedRecords()
  if (retainedPurge.deleted > 0) {
    console.info(`[poi-cleanup] 보관 기간 만료 보관 행 파기 — ${retainedPurge.deleted}건`)
  }

  return NextResponse.json({
    expired: result.expired,
    orphanedByDeletedBadge: result.orphaned_by_deleted_badge,
    purgedAbusingLogs: purge.deleted,
    ...(purge.error ? { abusingLogPurgeError: purge.error } : {}),
    purgedRetainedRecords: retainedPurge.deleted,
    ...(retainedPurge.error ? { retainedRecordPurgeError: retainedPurge.error } : {}),
  })
}
