/**
 * Vercel Cron 정합성 점검(reconcile) 엔드포인트
 * GET /api/cron/reconcile
 *
 * vercel.json에서 매일 12:00 UTC (21:00 KST) 자동 호출.
 * 최근 RECONCILE_LOOKBACK_DAYS일치 Strava 활동을 다시 조회해,
 * 동기화 커서(overlap)로도 못 잡은 누락 활동을 소급 처리한다.
 * Authorization: Bearer {CRON_SECRET} 헤더 필요
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { reconcileStravaActivities } from '@/lib/strava/reconcile'
import type { StravaConnectionRow } from '@/types/database'

// 전체 유저 순차 점검 — 유저 수에 따라 오래 걸릴 수 있어 최대치로 설정
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error('[cron/reconcile] CRON_SECRET 환경변수 미설정')
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: '인증 오류' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data: connectionsRaw, error: connError } = await supabase
    .from('strava_connections')
    .select('user_id')

  const connections = connectionsRaw as Pick<StravaConnectionRow, 'user_id'>[] | null

  if (connError) {
    console.error('[cron/reconcile] 연동 유저 조회 오류:', connError)
    return NextResponse.json({ error: 'DB 조회 오류' }, { status: 500 })
  }

  if (!connections || connections.length === 0) {
    return NextResponse.json({ message: '점검할 유저 없음', totalUsers: 0, totalRecovered: 0, totalBadges: 0 })
  }

  let totalRecovered = 0
  let totalBadges = 0
  const errors: string[] = []

  for (const conn of connections) {
    try {
      const result = await reconcileStravaActivities(conn.user_id)
      totalRecovered += result.recovered
      totalBadges += result.badges
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[cron/reconcile] userId ${conn.user_id} 점검 실패:`, msg)
      errors.push(conn.user_id)
    }
  }

  console.info(
    `[cron/reconcile] 완료 — 유저: ${connections.length}, 소급 처리된 활동: ${totalRecovered}, 배지: ${totalBadges}, 오류: ${errors.length}`
  )

  return NextResponse.json({
    totalUsers: connections.length,
    totalRecovered,
    totalBadges,
    errors: errors.length > 0 ? errors : undefined,
  })
}
