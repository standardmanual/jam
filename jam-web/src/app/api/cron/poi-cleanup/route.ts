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
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

  return NextResponse.json({ expired: result.expired, orphanedByDeletedBadge: result.orphaned_by_deleted_badge })
}
