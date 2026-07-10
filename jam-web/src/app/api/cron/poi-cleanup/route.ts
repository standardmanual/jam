/**
 * GET /api/cron/poi-cleanup
 * 매일 자정 실행: 만료된 POI 드랍 아이템 자동 소각
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

  const ids = (expired ?? []).map((r: { id: string }) => r.id)

  if (ids.length === 0) {
    return NextResponse.json({ expired: 0 })
  }

  const { error: updateError } = await supabase
    .from('poi_drops')
    .update({ is_available: false } as never)
    .in('id', ids)

  if (updateError) {
    console.error('[poi-cleanup] 소각 오류:', updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  console.info(`[poi-cleanup] 만료 드랍 소각 — ${ids.length}건`)
  return NextResponse.json({ expired: ids.length })
}
