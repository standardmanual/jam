/**
 * GET /api/cron/poi-cleanup
 * 매일 00:00(UTC) 실행: 만료된 POI 드랍 아이템 자동 소각
 * Vercel Cron: "0 0 * * *"
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const now = new Date().toISOString()

  const { data: expired, error } = await supabase
    .from('poi_drops')
    .select('id')
    .lt('expires_at', now)
    .eq('is_available', true)

  if (error) {
    console.error('[poi-cleanup] 조회 오류:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const expiredIds = (expired ?? []).map((r: { id: string }) => r.id)

  if (expiredIds.length > 0) {
    const { error: updateError } = await supabase
      .from('poi_drops')
      .update({ is_available: false } as never)
      .in('id', expiredIds)

    if (updateError) {
      console.error('[poi-cleanup] 소각 오류:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    console.info(`[poi-cleanup] 만료 드랍 소각 — ${expiredIds.length}건`)
  }

  // 안전망(20260826_016): 소프트 삭제된 배지를 가리키는 미픽업 드랍을 소각한다.
  // 관리자 API(admin/badges/[id]/route.ts)를 거치지 않고 DB에 직접 소프트 삭제가
  // 실행된 경로(예: 2026-08-23 orphan 배지 일괄 삭제, 커밋 1e77419)에 대한 보완이다.
  // expires_at 조건과 무관한 별도 조건 — 기존 만료 소각 로직은 그대로 둔다.
  const { data: orphaned, error: orphanedError } = await supabase
    .from('poi_drops')
    .select('id, badges!inner(deleted_at)')
    .eq('is_available', true)
    .is('picked_up_at', null)
    .not('badges.deleted_at', 'is', null)

  if (orphanedError) {
    console.error('[poi-cleanup] 삭제된 배지 드랍 조회 오류:', orphanedError)
    return NextResponse.json({ error: orphanedError.message }, { status: 500 })
  }

  // badges!inner 조인 + 조인 컬럼(badges.deleted_at) 필터 조합은 Supabase 타입 추론이
  // never로 무너지는 케이스라 타입 단언으로 우회한다(실제 런타임 데이터는 { id, badges }[]).
  const orphanedIds = ((orphaned ?? []) as { id: string }[]).map((r) => r.id)

  if (orphanedIds.length > 0) {
    const { error: orphanedUpdateError } = await supabase
      .from('poi_drops')
      .update({ is_available: false } as never)
      .in('id', orphanedIds)

    if (orphanedUpdateError) {
      console.error('[poi-cleanup] 삭제된 배지 드랍 소각 오류:', orphanedUpdateError)
      return NextResponse.json({ error: orphanedUpdateError.message }, { status: 500 })
    }

    console.info(`[poi-cleanup] 삭제된 배지 드랍 소각 — ${orphanedIds.length}건`)
  }

  return NextResponse.json({ expired: expiredIds.length, orphanedByDeletedBadge: orphanedIds.length })
}
