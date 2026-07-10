/**
 * GET /api/cron/wandering
 * 매 시간 실행: expires_at이 지난 떠돌이 신화 아이템을 새 POI로 이동
 * Vercel Cron: "0 * * * *"
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { WanderingMythicStateRow } from '@/types/database'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const now = new Date().toISOString()

  // 1. 만료된 떠돌이 아이템 조회
  const { data: expiredRaw } = await supabase
    .from('wandering_mythic_state')
    .select('*')
    .lt('expires_at', now)

  const expired = (expiredRaw ?? []) as WanderingMythicStateRow[]

  if (expired.length === 0) {
    return NextResponse.json({ moved: 0 })
  }

  // 2. 랜덤 이동에 사용할 활성 POI 목록 조회
  const { data: poisRaw } = await supabase
    .from('poi')
    .select('id')
    .limit(100)

  const pois = (poisRaw ?? []) as { id: string }[]
  if (pois.length === 0) return NextResponse.json({ moved: 0, reason: 'no_poi' })

  let moved = 0

  for (const state of expired) {
    // 3. 보유 유저가 있으면 인벤토리에서 소각
    if (state.holder_user_id) {
      const { data: invRaw } = await supabase
        .from('inventory')
        .select('id')
        .eq('user_id', state.holder_user_id)
        .single()

      const inv = invRaw as { id: string } | null
    if (inv) {
        await supabase
          .from('inventory_items')
          .delete()
          .eq('inventory_id', inv.id)
          .eq('badge_id', state.badge_id)

        console.info(`[wandering] 아이템 소각 — userId: ${state.holder_user_id}, badge: ${state.badge_id}`)
      }
    }

    // 4. 랜덤 새 POI 선정
    const newPoi = pois[Math.floor(Math.random() * pois.length)]
    const newExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('wandering_mythic_state')
      .update({
        current_poi_id: newPoi.id,
        holder_user_id: null,
        placed_at: now,
        expires_at: newExpiresAt,
      })
      .eq('id', state.id)

    moved++
    console.info(`[wandering] 아이템 이동 — badge: ${state.badge_id} → poi: ${newPoi.id}`)
  }

  return NextResponse.json({ moved })
}
